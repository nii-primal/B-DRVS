// B-DRVS verified-path FULL signature-chain test  --  GO side.
//
// Mirrors agentCanonical() and verifierCanonical() from verified.go and runs
// the same two signature checks SubmitVerifiedCheckIn does:
//   STEP 1  verifier signature over verifierCanonical
//   STEP 2  agent signature    over agentCanonical
// Both must pass. Then a negative control tampers the observed IP and confirms
// the verifier signature breaks -- proving the IP is genuinely bound by the
// signature (a vendor can't swap a foreign IP for a Ghana one after the fact).
//
// Run:  go run verify_dual.go   (after sign_dual.py)
package main

import (
	"crypto/ecdsa"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"encoding/json"
	"encoding/pem"
	"fmt"
	"os"
)

type dual struct {
	ServerID             string  `json:"serverID"`
	VerifierID           string  `json:"verifierID"`
	ObservedIP           string  `json:"observedIP"`
	MeasuredRttMs        float64 `json:"measuredRttMs"`
	Nonce                string  `json:"nonce"`
	StorageLatencyMs     float64 `json:"storageLatencyMs"`
	StorageJitterMs      float64 `json:"storageJitterMs"`
	AgentTimestamp       string  `json:"agentTimestamp"`
	AgentSignature       string  `json:"agentSignature"`
	VerifierTimestamp    string  `json:"verifierTimestamp"`
	VerifierSignature    string  `json:"verifierSignature"`
	AgentPublicKeyPEM    string  `json:"agentPublicKeyPEM"`
	VerifierPublicKeyPEM string  `json:"verifierPublicKeyPEM"`
}

// IDENTICAL to verified.go.
func agentCanonical(d *dual) string {
	return fmt.Sprintf("%s|%s|%s|%.4f|%.4f|%s",
		d.ServerID, d.VerifierID, d.Nonce, d.StorageLatencyMs, d.StorageJitterMs, d.AgentTimestamp)
}

// IDENTICAL to verified.go.
func verifierCanonical(d *dual) string {
	return fmt.Sprintf("%s|%s|%s|%.4f|%s|%.4f|%.4f|%s|%s|%s",
		d.ServerID, d.VerifierID, d.ObservedIP, d.MeasuredRttMs, d.Nonce,
		d.StorageLatencyMs, d.StorageJitterMs, d.AgentTimestamp,
		d.AgentSignature, d.VerifierTimestamp)
}

func parsePub(pemStr string) *ecdsa.PublicKey {
	block, _ := pem.Decode([]byte(pemStr))
	if block == nil {
		fmt.Println("bad PEM")
		os.Exit(1)
	}
	k, err := x509.ParsePKIXPublicKey(block.Bytes)
	if err != nil {
		fmt.Println("parse pub:", err)
		os.Exit(1)
	}
	return k.(*ecdsa.PublicKey)
}

func verifyB64(pub *ecdsa.PublicKey, canonical, sigB64 string) bool {
	sig, err := base64.StdEncoding.DecodeString(sigB64)
	if err != nil {
		return false
	}
	d := sha256.Sum256([]byte(canonical))
	return ecdsa.VerifyASN1(pub, d[:], sig)
}

func main() {
	raw, err := os.ReadFile("dual.json")
	if err != nil {
		fmt.Println("read dual.json:", err)
		os.Exit(1)
	}
	var d dual
	if err := json.Unmarshal(raw, &d); err != nil {
		fmt.Println("parse dual.json:", err)
		os.Exit(1)
	}

	agentPub := parsePub(d.AgentPublicKeyPEM)
	verifierPub := parsePub(d.VerifierPublicKeyPEM)

	// STEP 1: verifier signature (trust anchor for IP + RTT)
	if !verifyB64(verifierPub, verifierCanonical(&d), d.VerifierSignature) {
		fmt.Println("STEP 1 verifier signature: FAIL")
		os.Exit(2)
	}
	fmt.Println("STEP 1 verifier signature: PASS")

	// STEP 2: agent signature (proves the registered server answered)
	if !verifyB64(agentPub, agentCanonical(&d), d.AgentSignature) {
		fmt.Println("STEP 2 agent signature: FAIL")
		os.Exit(2)
	}
	fmt.Println("STEP 2 agent signature: PASS")

	fmt.Println("RESULT: PASS  full verified-path signature chain accepted by Go.")

	// negative control: tamper the observed IP, verifier sig must break
	tampered := d
	tampered.ObservedIP = "13.250.45.10" // foreign IP
	if verifyB64(verifierPub, verifierCanonical(&tampered), d.VerifierSignature) {
		fmt.Println("NEG-CONTROL: UNEXPECTED PASS -- IP is not actually protected by the signature!")
		os.Exit(3)
	}
	fmt.Println("NEG-CONTROL: ok (swapping observedIP correctly invalidates the verifier signature).")
}
