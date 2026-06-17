package main

// =============================================================================
// B-DRVS Migration-Simulation Harness
//
// This is NOT a unit test in the usual sense — it is an evaluation harness that
// drives the REAL chaincode validation logic (RegisterServer, SubmitCheckIn, the
// ECDSA signature check, the IP/RTT/storage rules, and the anti-replay guard)
// through a 90-day, hourly timeline of check-ins for six simulated health
// servers. Five attack scenarios are injected; one server is a clean control.
//
// What is real:  the validation/decision logic under test is the production
//                chaincode, unmodified.
// What is synthetic: the network measurements (public IP, RTT, storage latency)
//                are drawn from realistic but simulated distributions, because
//                we cannot safely migrate real patient data abroad to test.
//
// Run with:
//   BDRVS_SIM_OUT=/path/to/out go test -run TestMigrationSimulation -v
//
// Output (CSV, consumed by the Python analysis script):
//   checkins.csv         — every check-in attempt and its outcome (raw data)
//   servers.csv          — per-server scenario metadata
//   audits.csv           — manual-audit schedule (for the baseline comparison)
//   threshold_sweep.csv  — adversary RTT-tuning sensitivity experiment
//   config.json          — thresholds / interval / seed (reproducibility)
// =============================================================================

import (
	"crypto/ecdsa"
	"encoding/csv"
	"encoding/json"
	"fmt"
	"math"
	"math/rand"
	"os"
	"path/filepath"
	"testing"
	"time"
)

// signedPayloadFor signs a payload for a server using its key from the map.
func signedPayloadFor(t *testing.T, keys map[string]*ecdsa.PrivateKey, id, ip string, rtt, sl, sj float64, ts string) string {
	return signedPayload(t, keys[id], id, ip, rtt, sl, sj, ts)
}

const (
	simStart        = "2026-01-01T00:00:00Z"
	simDays         = 90
	hoursPerDay     = 24
	auditIntervalD  = 30 // manual audits every 30 days (a GENEROUS baseline)
	rngSeed         = 42
	submitDelaySecs = 2 // ledger commit lag after the agent stamps the payload
)

type scenario struct {
	id          string
	city        string
	attack      string // none|ip_migration|transient_migration|proxy_rtt|decoy_storage|replay
	startDay    int
	endDay      int  // for transient; -1 = permanent
	manualVisib bool // could a periodic IP/location audit detect this in principle?
}

var scenarios = []scenario{
	{"KORLE-BU-01", "Accra", "none", -1, -1, false},
	{"RIDGE-02", "Accra", "ip_migration", 35, -1, true},
	{"CAPE-COAST-06", "Cape Coast", "transient_migration", 40, 50, true},
	{"TEMA-03", "Tema", "proxy_rtt", 50, -1, false},
	{"KUMASI-04", "Kumasi", "decoy_storage", 60, -1, false},
	{"TAKORADI-05", "Takoradi", "replay", 55, -1, false},
}

func clamp(v, lo, hi float64) float64 { return math.Max(lo, math.Min(hi, v)) }

func genGhanaIP(r *rand.Rand) string {
	pool := []string{
		fmt.Sprintf("41.66.%d.%d", 192+r.Intn(60), 1+r.Intn(254)), // 41.66.192.0/18
		fmt.Sprintf("154.120.%d.%d", r.Intn(120), 1+r.Intn(254)),  // 154.120.0.0/17
		fmt.Sprintf("197.157.%d.%d", r.Intn(255), 1+r.Intn(254)),  // 197.157.0.0/16
	}
	return pool[r.Intn(len(pool))]
}

func genForeignIP(r *rand.Rand) string {
	pool := []string{
		fmt.Sprintf("13.232.%d.%d", r.Intn(255), 1+r.Intn(254)), // AWS Mumbai
		fmt.Sprintf("3.120.%d.%d", r.Intn(255), 1+r.Intn(254)),  // AWS Frankfurt
	}
	return pool[r.Intn(len(pool))]
}

// phaseValues returns the synthetic measurement set for a server at a given day,
// plus ground-truth flags. mode "replay" signals the caller to resubmit the last
// good payload rather than build a fresh one.
func phaseValues(s scenario, day int, r *rand.Rand) (ip string, rtt, sl, sj float64, truthForeign bool, mode string) {
	active := day >= s.startDay && (s.endDay < 0 || day < s.endDay)

	// defaults: compliant Ghanaian server
	ip = genGhanaIP(r)
	rtt = clamp(r.NormFloat64()*4+15, 3, 49)
	sl = clamp(r.NormFloat64()*0.35+1.2, 0.2, 5)
	sj = clamp(r.NormFloat64()*0.1+0.25, 0.05, 1.5)
	truthForeign = false
	mode = "normal"

	if !active {
		return
	}

	switch s.attack {
	case "ip_migration", "transient_migration":
		ip = genForeignIP(r)
		rtt = clamp(r.NormFloat64()*18+175, 120, 260) // Accra->Mumbai/Frankfurt
		truthForeign = true
	case "proxy_rtt":
		// Ghana IP via proxy, but the real server is abroad -> RTT betrays it.
		rtt = clamp(r.NormFloat64()*15+155, 110, 220)
		truthForeign = true
	case "decoy_storage":
		// Compute node genuinely in Ghana (IP+RTT clean) but the DB is on a
		// remote network mount abroad -> storage latency/jitter spike.
		sl = clamp(r.NormFloat64()*7+38, 18, 70)
		sj = clamp(r.NormFloat64()*2+6, 2, 14)
		truthForeign = true
	case "replay":
		truthForeign = true
		mode = "replay"
	}
	return
}

func TestMigrationSimulation(t *testing.T) {
	outDir := os.Getenv("BDRVS_SIM_OUT")
	if outDir == "" {
		t.Skip("set BDRVS_SIM_OUT to run the simulation harness")
	}
	if err := os.MkdirAll(outDir, 0o755); err != nil {
		t.Fatal(err)
	}

	r := rand.New(rand.NewSource(rngSeed))
	start, _ := time.Parse(time.RFC3339, simStart)

	c := new(ResidencyContract)
	stub := newMockStub(start)
	ctx := &mockCtx{stub: stub}
	if err := c.InitLedger(ctx); err != nil {
		t.Fatalf("InitLedger: %v", err)
	}

	// Register every server with its own ECDSA identity.
	keys := map[string]*ecdsa.PrivateKey{}
	for _, s := range scenarios {
		priv, pemStr := makeKey(t)
		keys[s.id] = priv
		if err := c.RegisterServer(ctx, s.id, pemStr, s.city+" Health Directorate"); err != nil {
			t.Fatalf("register %s: %v", s.id, err)
		}
	}

	// ── checkins.csv ──────────────────────────────────────────────────────────
	cf, _ := os.Create(filepath.Join(outDir, "checkins.csv"))
	defer cf.Close()
	cw := csv.NewWriter(cf)
	cw.Write([]string{
		"cycle", "day", "timestamp", "serverID", "scenario", "publicIP",
		"rttMs", "storageLatencyMs", "storageJitterMs", "truthForeign",
		"outcome", "recordedStatus", "violationReason",
	})

	lastGood := map[string]string{} // serverID -> last accepted signed payload

	totalCycles := simDays * hoursPerDay
	for cycle := 0; cycle < totalCycles; cycle++ {
		day := cycle / hoursPerDay
		agentTime := start.Add(time.Duration(cycle) * time.Hour)
		ts := agentTime.Format(time.RFC3339)
		// Ledger commits a couple of seconds after the agent stamps the payload.
		stub.setTxTime(agentTime.Add(submitDelaySecs * time.Second))

		for _, s := range scenarios {
			ip, rtt, sl, sj, truthForeign, mode := phaseValues(s, day, r)

			var payload string
			if mode == "replay" {
				// Vendor migrates data abroad and resubmits the last COMPLIANT
				// payload verbatim, hoping the valid old signature passes.
				payload = lastGood[s.id]
				if payload == "" {
					// no good payload captured yet; fall back to a fresh foreign one
					payload = signedPayloadFor(t, keys, s.id, ip, rtt, sl, sj, ts)
				}
			} else {
				payload = signedPayloadFor(t, keys, s.id, ip, rtt, sl, sj, ts)
			}

			rec, err := c.SubmitCheckIn(ctx, payload)

			outcome, recorded, reason := "COMPLIANT", "COMPLIANT", ""
			switch {
			case err != nil:
				outcome, recorded, reason = "REJECTED", "", err.Error()
			case rec.Status == "SOVEREIGNTY_VIOLATION":
				outcome, recorded, reason = "VIOLATION", rec.Status, rec.ViolationReason
			default:
				outcome, recorded = "COMPLIANT", rec.Status
				if mode == "normal" {
					lastGood[s.id] = payload // remember a genuinely good payload
				}
			}

			cw.Write([]string{
				fmt.Sprint(cycle), fmt.Sprint(day), ts, s.id, s.attack, ip,
				fmt.Sprintf("%.3f", rtt), fmt.Sprintf("%.3f", sl), fmt.Sprintf("%.3f", sj),
				fmt.Sprint(truthForeign), outcome, recorded, reason,
			})
		}
	}
	cw.Flush()

	// ── servers.csv ───────────────────────────────────────────────────────────
	sf, _ := os.Create(filepath.Join(outDir, "servers.csv"))
	sw := csv.NewWriter(sf)
	sw.Write([]string{"serverID", "city", "attack", "startDay", "endDay", "manualVisible"})
	for _, s := range scenarios {
		sw.Write([]string{s.id, s.city, s.attack, fmt.Sprint(s.startDay), fmt.Sprint(s.endDay), fmt.Sprint(s.manualVisib)})
	}
	sw.Flush()
	sf.Close()

	// ── audits.csv ────────────────────────────────────────────────────────────
	af, _ := os.Create(filepath.Join(outDir, "audits.csv"))
	aw := csv.NewWriter(af)
	aw.Write([]string{"auditDay"})
	for d := 0; d <= simDays; d += auditIntervalD {
		aw.Write([]string{fmt.Sprint(d)})
	}
	aw.Flush()
	af.Close()

	// ── threshold_sweep.csv ───────────────────────────────────────────────────
	// A stealthy adversary on a Ghana IP tunes its reported RTT. Shows where the
	// 50ms decision boundary bites and that values just under it slip through —
	// the honest limitation of single-signal latency geolocation.
	swf, _ := os.Create(filepath.Join(outDir, "threshold_sweep.csv"))
	sww := csv.NewWriter(swf)
	sww.Write([]string{"reportedRttMs", "status"})
	sweepPriv, sweepPem := makeKey(t)
	if err := c.RegisterServer(ctx, "SWEEP-PROBE", sweepPem, "Sweep"); err != nil {
		t.Fatal(err)
	}
	for i := 0; i <= 40; i++ {
		rttv := 20.0 + float64(i)*2.0 // 20ms .. 100ms
		stub.setTxTime(start.Add(time.Duration(totalCycles+i) * time.Hour).Add(2 * time.Second))
		ts := start.Add(time.Duration(totalCycles+i) * time.Hour).Format(time.RFC3339)
		p := signedPayload(t, sweepPriv, "SWEEP-PROBE", "41.66.200.10", rttv, 1.0, 0.2, ts)
		rec, err := c.SubmitCheckIn(ctx, p)
		status := "ERROR"
		if err == nil {
			status = rec.Status
		}
		sww.Write([]string{fmt.Sprintf("%.1f", rttv), status})
	}
	sww.Flush()
	swf.Close()

	// ── config.json ───────────────────────────────────────────────────────────
	cfg := map[string]interface{}{
		"simStartUTC": simStart, "simDays": simDays, "checkInIntervalHours": 1,
		"manualAuditIntervalDays": auditIntervalD, "rngSeed": rngSeed,
		"rttThresholdMs": defaultRTTThresholdMs, "storageLatencyThresholdMs": defaultStorageLatencyThresholdMs,
		"freshnessWindowSec": defaultFreshnessWindowSec, "totalCheckIns": totalCycles * len(scenarios),
	}
	cb, _ := json.MarshalIndent(cfg, "", "  ")
	os.WriteFile(filepath.Join(outDir, "config.json"), cb, 0o644)

	t.Logf("simulation complete: %d check-ins across %d servers over %d days -> %s",
		totalCycles*len(scenarios), len(scenarios), simDays, outDir)
}
