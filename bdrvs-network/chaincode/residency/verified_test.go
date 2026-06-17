package main

import (
	"crypto/ecdsa"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"strings"
	"testing"
	"time"
)

const (
	vsrv = "LHIMS-VER-01"
	vid  = "NITA-ACCRA"
)

func signStr(t *testing.T, priv *ecdsa.PrivateKey, msg string) string {
	t.Helper()
	h := sha256.Sum256([]byte(msg))
	der, err := ecdsa.SignASN1(rand.Reader, priv, h[:])
	if err != nil {
		t.Fatal(err)
	}
	return base64.StdEncoding.EncodeToString(der)
}

func makeVerified(t *testing.T, agentPriv, verifierPriv *ecdsa.PrivateKey,
	serverID, verifierID, ip string, rtt, sl, sj float64, nonce, agentTs, verTs string) VerifiedCheckIn {
	t.Helper()
	v := VerifiedCheckIn{
		ServerID: serverID, VerifierID: verifierID, ObservedIP: ip, MeasuredRttMs: rtt,
		Nonce: nonce, StorageLatencyMs: sl, StorageJitterMs: sj,
		AgentTimestamp: agentTs, VerifierTimestamp: verTs,
	}
	v.AgentSignature = signStr(t, agentPriv, agentCanonical(&v))          // agent signs first
	v.VerifierSignature = signStr(t, verifierPriv, verifierCanonical(&v)) // verifier wraps it
	return v
}

func toJSON(v VerifiedCheckIn) string { b, _ := json.Marshal(v); return string(b) }

func setupVerified(t *testing.T, tx time.Time) (*ResidencyContract, *mockCtx, *ecdsa.PrivateKey, *ecdsa.PrivateKey) {
	t.Helper()
	c := new(ResidencyContract)
	ctx := &mockCtx{stub: newMockStub(tx)}
	if err := c.InitLedger(ctx); err != nil {
		t.Fatal(err)
	}
	agentPriv, agentPem := makeKey(t)
	verPriv, verPem := makeKey(t)
	if err := c.RegisterServer(ctx, vsrv, agentPem, "Vendor"); err != nil {
		t.Fatal(err)
	}
	if err := c.RegisterVerifier(ctx, vid, verPem, "NITA Accra"); err != nil {
		t.Fatal(err)
	}
	return c, ctx, agentPriv, verPriv
}

func TestVerifiedFreshCompliantAccepted(t *testing.T) {
	tx := time.Date(2026, 5, 12, 12, 0, 0, 0, time.UTC)
	c, ctx, a, v := setupVerified(t, tx)
	ts := tx.Format(time.RFC3339)
	rec, err := c.SubmitVerifiedCheckIn(ctx, toJSON(makeVerified(t, a, v, vsrv, vid, ghanaIP, 14, 1.0, 0.2, "nonce-1", ts, ts)))
	if err != nil {
		t.Fatalf("expected accept: %v", err)
	}
	if rec.Status != "COMPLIANT" || rec.MeasuredBy != "VERIFIER" {
		t.Fatalf("got status=%s measuredBy=%s", rec.Status, rec.MeasuredBy)
	}
}

func TestVerifiedTamperedRTTRejected(t *testing.T) {
	tx := time.Date(2026, 5, 12, 12, 0, 0, 0, time.UTC)
	c, ctx, a, v := setupVerified(t, tx)
	ts := tx.Format(time.RFC3339)
	vc := makeVerified(t, a, v, vsrv, vid, ghanaIP, 14, 1.0, 0.2, "nonce-1", ts, ts)
	vc.MeasuredRttMs = 9.0 // change RTT after the verifier signed it
	_, err := c.SubmitVerifiedCheckIn(ctx, toJSON(vc))
	if err == nil || !strings.Contains(err.Error(), "verifier signature") {
		t.Fatalf("expected verifier-signature rejection, got: %v", err)
	}
}

func TestVerifiedForgedAgentResponseRejected(t *testing.T) {
	tx := time.Date(2026, 5, 12, 12, 0, 0, 0, time.UTC)
	c, ctx, _, v := setupVerified(t, tx)
	wrongPriv, _ := makeKey(t) // not the registered server key
	ts := tx.Format(time.RFC3339)
	_, err := c.SubmitVerifiedCheckIn(ctx, toJSON(makeVerified(t, wrongPriv, v, vsrv, vid, ghanaIP, 14, 1.0, 0.2, "nonce-1", ts, ts)))
	if err == nil || !strings.Contains(err.Error(), "agent signature") {
		t.Fatalf("expected agent-signature rejection, got: %v", err)
	}
}

func TestVerifiedReusedNonceRejected(t *testing.T) {
	tx := time.Date(2026, 5, 12, 12, 0, 0, 0, time.UTC)
	c, ctx, a, v := setupVerified(t, tx)
	ts := tx.Format(time.RFC3339)
	if _, err := c.SubmitVerifiedCheckIn(ctx, toJSON(makeVerified(t, a, v, vsrv, vid, ghanaIP, 14, 1.0, 0.2, "nonce-X", ts, ts))); err != nil {
		t.Fatalf("first accept: %v", err)
	}
	ts2 := tx.Add(time.Hour).Format(time.RFC3339)
	ctx.stub.setTxTime(tx.Add(time.Hour))
	_, err := c.SubmitVerifiedCheckIn(ctx, toJSON(makeVerified(t, a, v, vsrv, vid, ghanaIP, 14, 1.0, 0.2, "nonce-X", ts2, ts2)))
	if err == nil || !strings.Contains(err.Error(), "nonce already used") {
		t.Fatalf("expected nonce-reuse rejection, got: %v", err)
	}
}

func TestVerifiedUnregisteredVerifierRejected(t *testing.T) {
	tx := time.Date(2026, 5, 12, 12, 0, 0, 0, time.UTC)
	c, ctx, a, _ := setupVerified(t, tx)
	roguePriv, _ := makeKey(t)
	ts := tx.Format(time.RFC3339)
	_, err := c.SubmitVerifiedCheckIn(ctx, toJSON(makeVerified(t, a, roguePriv, vsrv, "ROGUE-VERIFIER", ghanaIP, 14, 1.0, 0.2, "n1", ts, ts)))
	if err == nil || !strings.Contains(err.Error(), "not registered") {
		t.Fatalf("expected unregistered-verifier rejection, got: %v", err)
	}
}

func TestVerifiedForeignIPViolation(t *testing.T) {
	tx := time.Date(2026, 5, 12, 12, 0, 0, 0, time.UTC)
	c, ctx, a, v := setupVerified(t, tx)
	ts := tx.Format(time.RFC3339)
	rec, err := c.SubmitVerifiedCheckIn(ctx, toJSON(makeVerified(t, a, v, vsrv, vid, fgnIP, 14, 1.0, 0.2, "n1", ts, ts)))
	if err != nil {
		t.Fatalf("foreign IP should record a violation: %v", err)
	}
	if rec.Status != "SOVEREIGNTY_VIOLATION" {
		t.Fatalf("expected violation, got %s", rec.Status)
	}
}

func TestVerifiedHighRTTViolation(t *testing.T) {
	tx := time.Date(2026, 5, 12, 12, 0, 0, 0, time.UTC)
	c, ctx, a, v := setupVerified(t, tx)
	ts := tx.Format(time.RFC3339)
	rec, err := c.SubmitVerifiedCheckIn(ctx, toJSON(makeVerified(t, a, v, vsrv, vid, ghanaIP, 180, 1.0, 0.2, "n1", ts, ts)))
	if err != nil {
		t.Fatalf("high RTT should record a violation: %v", err)
	}
	if rec.Status != "SOVEREIGNTY_VIOLATION" || rec.RTTStatus != "EXCEEDED" {
		t.Fatalf("expected RTT violation, got status=%s rttStatus=%s", rec.Status, rec.RTTStatus)
	}
}

func TestVerifiedStaleRejected(t *testing.T) {
	tx := time.Date(2026, 5, 12, 12, 0, 0, 0, time.UTC)
	c, ctx, a, v := setupVerified(t, tx)
	stale := tx.Add(-10 * time.Minute).Format(time.RFC3339)
	_, err := c.SubmitVerifiedCheckIn(ctx, toJSON(makeVerified(t, a, v, vsrv, vid, ghanaIP, 14, 1.0, 0.2, "n1", stale, stale)))
	if err == nil || !strings.Contains(err.Error(), "stale") {
		t.Fatalf("expected stale rejection, got: %v", err)
	}
}

// The gap closed vs. the quarantined version: an agent response is bound to the
// verifier that challenged it. A second verifier cannot wrap another verifier's
// agent response, because agentCanonical includes the verifier ID.
func TestVerifiedCrossVerifierWrapRejected(t *testing.T) {
	tx := time.Date(2026, 5, 12, 12, 0, 0, 0, time.UTC)
	c, ctx, a, vA := setupVerified(t, tx)
	// register a second verifier B
	vBpriv, vBpem := makeKey(t)
	if err := c.RegisterVerifier(ctx, "NITA-KUMASI", vBpem, "NITA Kumasi"); err != nil {
		t.Fatal(err)
	}
	ts := tx.Format(time.RFC3339)
	// Agent answers verifier A's challenge (binds verifierID = NITA-ACCRA).
	good := makeVerified(t, a, vA, vsrv, vid, ghanaIP, 14, 1.0, 0.2, "n1", ts, ts)
	// Verifier B tries to reuse that agent signature under its own identity.
	forged := good
	forged.VerifierID = "NITA-KUMASI"
	forged.VerifierSignature = signStr(t, vBpriv, verifierCanonical(&forged))
	_, err := c.SubmitVerifiedCheckIn(ctx, toJSON(forged))
	if err == nil || !strings.Contains(err.Error(), "agent signature") {
		t.Fatalf("expected agent-signature rejection on cross-verifier wrap, got: %v", err)
	}
}

// When self-report is disabled, the legacy path is refused but the verifier path
// still works — the production trust posture.
func TestSelfReportGate(t *testing.T) {
	tx := time.Date(2026, 5, 12, 12, 0, 0, 0, time.UTC)
	c, ctx, a, v := setupVerified(t, tx)
	if err := c.SetSelfReportEnabled(ctx, false); err != nil {
		t.Fatal(err)
	}
	ts := tx.Format(time.RFC3339)
	// legacy self-report must now be refused
	_, err := c.SubmitCheckIn(ctx, signedPayload(t, a, vsrv, ghanaIP, 14, 1.0, 0.2, ts))
	if err == nil || !strings.Contains(err.Error(), "disabled") {
		t.Fatalf("expected self-report to be refused, got: %v", err)
	}
	// verifier path still works
	rec, err := c.SubmitVerifiedCheckIn(ctx, toJSON(makeVerified(t, a, v, vsrv, vid, ghanaIP, 14, 1.0, 0.2, "n1", ts, ts)))
	if err != nil || rec.Status != "COMPLIANT" {
		t.Fatalf("verifier path should still work: %v (status %v)", err, rec)
	}
}
