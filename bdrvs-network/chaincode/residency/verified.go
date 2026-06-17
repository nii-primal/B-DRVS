// =============================================================================
// B-DRVS Challenge-Response Verified Check-In  (Tier 2 — hardened trust path)
//
// Provenance: written in-session, clean-room. Replaces the self-report trust
// model in which the agent measured and reported its own RTT and public IP
// (both produced on vendor-controlled hardware, hence forgeable — see the
// threshold-sensitivity result in the evaluation).
//
// Protocol:
//   1. A government Verifier (NITA) generates an unpredictable nonce and sends
//      it, with its own VerifierID, to the target server's agent.
//   2. The agent signs (serverID|verifierID|nonce|storage...) with its key and
//      returns it — proving a live, registered responder answered THIS verifier's
//      THIS challenge (no precomputation, no cross-verifier reuse).
//   3. The Verifier measures the round-trip time ITSELF and observes the source
//      IP ITSELF, wraps everything (incl. the agent signature) into a
//      VerifiedCheckIn, signs the whole with the VERIFIER key, and submits it.
//
// The chaincode trusts RTT and IP only because a registered Verifier signed
// them, and trusts that the right server answered only because of the agent's
// signature over the verifier's nonce. Storage latency remains agent-measured
// (the verifier cannot probe a remote disk); this residual trust is documented.
//
// Trust is MOVED from the vendor to the government Verifier, not eliminated.
// =============================================================================

package main

import (
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/hyperledger/fabric-contract-api-go/contractapi"
)

// VerifierRecord registers a government Verifier node and its ECDSA public key.
// Key: "VERIFIER_<verifierID>"
type VerifierRecord struct {
	DocType      string `json:"docType"` // "VERIFIER"
	VerifierID   string `json:"verifierID"`
	PublicKeyPEM string `json:"publicKeyPEM"`
	Location     string `json:"location"`
	RegisteredAt string `json:"registeredAt"`
	Active       bool   `json:"active"`
}

// VerifiedCheckIn is submitted by a Verifier after a challenge-response exchange.
//
//	AgentSignature    over agentCanonical(v)
//	VerifierSignature over verifierCanonical(v)
type VerifiedCheckIn struct {
	ServerID          string  `json:"serverID"`
	VerifierID        string  `json:"verifierID"`
	ObservedIP        string  `json:"observedIP"`    // verifier-observed (not self-reported)
	MeasuredRttMs     float64 `json:"measuredRttMs"` // verifier-measured (not self-reported)
	Nonce             string  `json:"nonce"`
	StorageLatencyMs  float64 `json:"storageLatencyMs"` // agent-measured (documented residual trust)
	StorageJitterMs   float64 `json:"storageJitterMs"`
	AgentTimestamp    string  `json:"agentTimestamp"`
	AgentSignature    string  `json:"agentSignature"`
	VerifierTimestamp string  `json:"verifierTimestamp"`
	VerifierSignature string  `json:"verifierSignature"`
}

// agentCanonical binds the agent's response to this server, THIS verifier, and
// THIS nonce — so one verifier cannot wrap another verifier's challenge answer.
func agentCanonical(v *VerifiedCheckIn) string {
	return fmt.Sprintf("%s|%s|%s|%.4f|%.4f|%s",
		v.ServerID, v.VerifierID, v.Nonce, v.StorageLatencyMs, v.StorageJitterMs, v.AgentTimestamp)
}

func verifierCanonical(v *VerifiedCheckIn) string {
	return fmt.Sprintf("%s|%s|%s|%.4f|%s|%.4f|%.4f|%s|%s|%s",
		v.ServerID, v.VerifierID, v.ObservedIP, v.MeasuredRttMs, v.Nonce,
		v.StorageLatencyMs, v.StorageJitterMs, v.AgentTimestamp,
		v.AgentSignature, v.VerifierTimestamp)
}

func nonceKey(serverID, nonce string) string {
	return fmt.Sprintf("NONCE_%s_%s", serverID, nonce)
}

// RegisterVerifier records a government Verifier node and its public key.
func (c *ResidencyContract) RegisterVerifier(
	ctx contractapi.TransactionContextInterface,
	verifierID, publicKeyPEM, location string,
) error {
	existing, err := ctx.GetStub().GetState("VERIFIER_" + verifierID)
	if err != nil {
		return fmt.Errorf("failed to read ledger: %w", err)
	}
	if existing != nil {
		return fmt.Errorf("verifier '%s' is already registered", verifierID)
	}
	if _, err := parsePEMPublicKey(publicKeyPEM); err != nil {
		return fmt.Errorf("invalid verifier public key PEM: %w", err)
	}
	now, err := txTimestamp(ctx)
	if err != nil {
		return fmt.Errorf("failed to read transaction timestamp: %w", err)
	}
	rec := VerifierRecord{
		DocType: "VERIFIER", VerifierID: verifierID, PublicKeyPEM: publicKeyPEM,
		Location: location, RegisteredAt: now.Format(time.RFC3339), Active: true,
	}
	b, err := json.Marshal(rec)
	if err != nil {
		return fmt.Errorf("failed to marshal verifier record: %w", err)
	}
	if err := ctx.GetStub().PutState("VERIFIER_"+verifierID, b); err != nil {
		return fmt.Errorf("failed to write verifier record: %w", err)
	}
	fmt.Printf("[B-DRVS] Verifier registered: %s (%s)\n", verifierID, location)
	return nil
}

// SubmitVerifiedCheckIn is the hardened, verifier-attested check-in path.
// Validation order:
//  1. Verifier signature  — lets us trust ObservedIP + MeasuredRttMs
//  2. Agent signature     — proves a live, registered responder answered
//  3. Nonce single-use    — challenge-level replay protection
//  4. Freshness+monotonic — time-level replay protection (shared guard)
//  5. IP / RTT / storage residency rules
func (c *ResidencyContract) SubmitVerifiedCheckIn(
	ctx contractapi.TransactionContextInterface,
	payloadJSON string,
) (*ResidencyRecord, error) {

	var v VerifiedCheckIn
	if err := json.Unmarshal([]byte(payloadJSON), &v); err != nil {
		return nil, fmt.Errorf("invalid payload JSON: %w", err)
	}
	if v.ServerID == "" || v.VerifierID == "" || v.ObservedIP == "" ||
		v.Nonce == "" || v.AgentTimestamp == "" || v.VerifierTimestamp == "" {
		return nil, fmt.Errorf("payload missing required fields")
	}

	// ── Load server + verifier identities ─────────────────────────────────────
	serverJSON, err := ctx.GetStub().GetState("SERVER_" + v.ServerID)
	if err != nil {
		return nil, fmt.Errorf("ledger read error: %w", err)
	}
	if serverJSON == nil {
		return nil, fmt.Errorf("server '%s' is not registered", v.ServerID)
	}
	var server ServerRecord
	if err := json.Unmarshal(serverJSON, &server); err != nil {
		return nil, fmt.Errorf("failed to parse server record: %w", err)
	}
	if !server.Active {
		return nil, fmt.Errorf("server '%s' is deactivated", v.ServerID)
	}

	verifierJSON, err := ctx.GetStub().GetState("VERIFIER_" + v.VerifierID)
	if err != nil {
		return nil, fmt.Errorf("ledger read error: %w", err)
	}
	if verifierJSON == nil {
		return nil, fmt.Errorf("verifier '%s' is not registered", v.VerifierID)
	}
	var verifier VerifierRecord
	if err := json.Unmarshal(verifierJSON, &verifier); err != nil {
		return nil, fmt.Errorf("failed to parse verifier record: %w", err)
	}
	if !verifier.Active {
		return nil, fmt.Errorf("verifier '%s' is deactivated", v.VerifierID)
	}

	config, err := c.getNetworkConfig(ctx)
	if err != nil {
		return nil, err
	}

	// ── STEP 1: verifier signature (trust anchor for RTT + observed IP) ────────
	vSigOK, err := verifyECDSASignature(verifier.PublicKeyPEM, verifierCanonical(&v), v.VerifierSignature)
	if err != nil {
		return nil, fmt.Errorf("verifier signature error: %w", err)
	}
	if !vSigOK {
		return nil, fmt.Errorf("invalid verifier signature — measurement not attested by a registered verifier")
	}

	// ── STEP 2: agent signature over (server|verifier|nonce|storage|ts) ────────
	aSigOK, err := verifyECDSASignature(server.PublicKeyPEM, agentCanonical(&v), v.AgentSignature)
	if err != nil {
		return nil, fmt.Errorf("agent signature error: %w", err)
	}
	if !aSigOK {
		return nil, fmt.Errorf("invalid agent signature — challenge not answered by the registered server key")
	}

	// ── STEP 3: nonce single-use (challenge-level replay protection) ───────────
	nk := nonceKey(v.ServerID, v.Nonce)
	if seen, err := ctx.GetStub().GetState(nk); err != nil {
		return nil, fmt.Errorf("nonce lookup error: %w", err)
	} else if seen != nil {
		return nil, fmt.Errorf("replay rejected: nonce already used for server %s", v.ServerID)
	}

	// ── STEP 4: freshness + monotonic guard on the verifier timestamp ──────────
	vTime, tErr := time.Parse(time.RFC3339, v.VerifierTimestamp)
	if tErr != nil {
		return nil, fmt.Errorf("invalid verifierTimestamp %q (expected RFC3339): %w", v.VerifierTimestamp, tErr)
	}
	txTime, tsErr := txTimestamp(ctx)
	if tsErr != nil {
		return nil, tsErr
	}
	window := config.FreshnessWindowSec
	if window <= 0 {
		window = defaultFreshnessWindowSec
	}
	skew := txTime.Sub(vTime).Seconds()
	if skew > window {
		return nil, fmt.Errorf("stale verified check-in rejected: verifierTimestamp %s is %.0fs older than ledger time (max %.0fs) — possible replay", v.VerifierTimestamp, skew, window)
	}
	if skew < -window {
		return nil, fmt.Errorf("future-dated verified check-in rejected: verifierTimestamp %s is %.0fs ahead of ledger time (max %.0fs)", v.VerifierTimestamp, -skew, window)
	}
	if server.LastTimestamp != "" {
		if last, e := time.Parse(time.RFC3339, server.LastTimestamp); e == nil && !vTime.After(last) {
			return nil, fmt.Errorf("replay rejected: verifierTimestamp %s is not newer than last accepted %s for server %s", v.VerifierTimestamp, server.LastTimestamp, v.ServerID)
		}
	}

	// ── STEP 5: residency rules, on verifier-attested IP + RTT ─────────────────
	var reasons []string
	ipStatus := "GHANA"
	inGhana, ipErr := isIPInGhana(v.ObservedIP, config.GhanaIPRanges)
	if ipErr != nil {
		return nil, fmt.Errorf("IP validation error: %w", ipErr)
	}
	if !inGhana {
		ipStatus = "FOREIGN"
		reasons = append(reasons, fmt.Sprintf("verifier-observed IP %s is not in a Ghanaian network range", v.ObservedIP))
	}

	rttStatus := "WITHIN_THRESHOLD"
	if v.MeasuredRttMs > config.RTTThresholdMs {
		rttStatus = "EXCEEDED"
		reasons = append(reasons, fmt.Sprintf("verifier-measured RTT %.2fms exceeds domestic threshold of %.2fms", v.MeasuredRttMs, config.RTTThresholdMs))
	}

	storageStatus := "LOCAL"
	if v.StorageLatencyMs > config.StorageLatencyThresholdMs {
		storageStatus = "REMOTE_SUSPECTED"
		reasons = append(reasons, fmt.Sprintf("storage latency %.3fms exceeds local threshold of %.3fms (jitter %.3fms) — database may not be co-located with reporting server", v.StorageLatencyMs, config.StorageLatencyThresholdMs, v.StorageJitterMs))
	}

	status := "COMPLIANT"
	violationReason := ""
	if len(reasons) > 0 {
		status = "SOVEREIGNTY_VIOLATION"
		violationReason = strings.Join(reasons, "; ")
	}

	// ── Persist nonce, record, and advance the shared replay guard ─────────────
	if err := ctx.GetStub().PutState(nk, []byte("1")); err != nil {
		return nil, fmt.Errorf("failed to record nonce: %w", err)
	}

	hash := sha256.Sum256([]byte(verifierCanonical(&v)))
	// Record key includes the verifier ID so concurrent attestations of the same
	// server by different verifiers (future multi-probe triangulation) cannot
	// collide on the same key.
	recordID := fmt.Sprintf("RECORD_%s_%s_%s", v.ServerID, v.VerifierTimestamp, v.VerifierID)
	record := ResidencyRecord{
		DocType: "RECORD", RecordID: recordID, ServerID: v.ServerID,
		Timestamp: v.VerifierTimestamp, BlockTime: txTime.Format(time.RFC3339),
		PublicIP: v.ObservedIP, RTTms: v.MeasuredRttMs,
		StorageLatencyMs: v.StorageLatencyMs, StorageJitterMs: v.StorageJitterMs,
		IPStatus: ipStatus, RTTStatus: rttStatus, StorageStatus: storageStatus,
		Status: status, ViolationReason: violationReason,
		PayloadHash: base64.StdEncoding.EncodeToString(hash[:]),
		MeasuredBy:  "VERIFIER", VerifierID: v.VerifierID, Nonce: v.Nonce,
	}
	recordJSON, err := json.Marshal(record)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal record: %w", err)
	}
	if err := ctx.GetStub().PutState(recordID, recordJSON); err != nil {
		return nil, fmt.Errorf("failed to write record: %w", err)
	}

	server.LastTimestamp = v.VerifierTimestamp
	if su, mErr := json.Marshal(server); mErr == nil {
		if err := ctx.GetStub().PutState("SERVER_"+v.ServerID, su); err != nil {
			return nil, fmt.Errorf("failed to update replay guard: %w", err)
		}
	}

	eventName := "COMPLIANT_CHECK_IN"
	if status == "SOVEREIGNTY_VIOLATION" {
		eventName = "SOVEREIGNTY_VIOLATION"
	}
	evt, _ := json.Marshal(map[string]string{
		"recordID": recordID, "serverID": v.ServerID, "verifierID": v.VerifierID,
		"status": status, "violationReason": violationReason, "measuredBy": "VERIFIER",
	})
	_ = ctx.GetStub().SetEvent(eventName, evt)

	fmt.Printf("[B-DRVS] Verified check-in: server=%s verifier=%s status=%s ip=%s rtt=%.2fms\n",
		v.ServerID, v.VerifierID, status, v.ObservedIP, v.MeasuredRttMs)
	return &record, nil
}

// GetAllVerifiers returns all registered verifier nodes (dashboard discovery).
func (c *ResidencyContract) GetAllVerifiers(
	ctx contractapi.TransactionContextInterface,
) ([]*VerifierRecord, error) {
	iter, err := ctx.GetStub().GetStateByRange("VERIFIER_", "VERIFIER_~")
	if err != nil {
		return nil, fmt.Errorf("range query failed: %w", err)
	}
	defer iter.Close()
	var out []*VerifierRecord
	for iter.HasNext() {
		kv, err := iter.Next()
		if err != nil {
			return nil, err
		}
		var r VerifierRecord
		if json.Unmarshal(kv.Value, &r) == nil && r.Active {
			out = append(out, &r)
		}
	}
	return out, nil
}
