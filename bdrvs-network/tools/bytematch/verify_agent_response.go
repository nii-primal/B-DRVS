// B-DRVS byte-match harness v2  --  VERIFIED PATH (agentCanonical), GO side.
//
// Rebuilds agentCanonical EXACTLY as verified.go does and verifies the Python
// agent signature against it. The floats are formatted here with %.4f from the
// JSON-roundtripped float64 -- the same independent formatting the chaincode
// does -- so this is a true test of Python :.4f vs Go %.4f agreement.
//
// Negative control: re-format the storage floats with %.3f (a plausible slip)
// and confirm verification FAILS.
//
// Run:  go run verify_agent_response.go   (after sign_agent_response.py)
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

type agentResp struct {
	ServerID         string  `json:"serverID"`
	VerifierID       string  `json:"verifierID"`
	Nonce            string  `json:"nonce"`
	StorageLatencyMs float64 `json:"storageLatencyMs"`
	StorageJitterMs  float64 `json:"storageJitterMs"`
	AgentTimestamp   string  `json:"agentTimestamp"`
	AgentSignature   string  `json:"agentSignature"`
	PublicKeyPEM     string  `json:"publicKeyPEM"`
}

// IDENTICAL to verified.go's agentCanonical.
func agentCanonical(serverID, verifierID, nonce string, lat, jit float64, ts string) string {
	return fmt.Sprintf("%s|%s|%s|%.4f|%.4f|%s", serverID, verifierID, nonce, lat, jit, ts)
}

func verify(pub *ecdsa.PublicKey, canonical string, sig []byte) bool {
	d := sha256.Sum256([]byte(canonical))
	return ecdsa.VerifyASN1(pub, d[:], sig)
}

func die(msg string, err error) { fmt.Printf("%s: %v\n", msg, err); os.Exit(1) }

func main() {
	raw, err := os.ReadFile("agent_response.json")
	if err != nil {
		die("read agent_response.json", err)
	}
	var r agentResp
	if err := json.Unmarshal(raw, &r); err != nil {
		die("parse json", err)
	}

	block, _ := pem.Decode([]byte(r.PublicKeyPEM))
	if block == nil {
		fmt.Println("public key not valid PEM")
		os.Exit(1)
	}
	pubAny, err := x509.ParsePKIXPublicKey(block.Bytes)
	if err != nil {
		die("parse public key", err)
	}
	pub, ok := pubAny.(*ecdsa.PublicKey)
	if !ok {
		fmt.Println("public key not ECDSA")
		os.Exit(1)
	}
	sig, err := base64.StdEncoding.DecodeString(r.AgentSignature)
	if err != nil {
		die("decode signature", err)
	}

	canonical := agentCanonical(r.ServerID, r.VerifierID, r.Nonce, r.StorageLatencyMs, r.StorageJitterMs, r.AgentTimestamp)
	d := sha256.Sum256([]byte(canonical))
	fmt.Println("canonical:", canonical)
	fmt.Printf("sha256   : %x\n", d)

	if !verify(pub, canonical, sig) {
		fmt.Println("RESULT: FAIL  agent signature did NOT verify against agentCanonical.")
		fmt.Println("              Equal sha256 vs Python + FAIL => encoding; different sha256 => :.4f vs %.4f drift or field mismatch.")
		os.Exit(2)
	}
	fmt.Println("RESULT: PASS  agent signature verified -- :.4f and %.4f agree, field layout matches verified.go.")

	// negative control: storage floats at 3 decimals instead of 4
	bad := fmt.Sprintf("%s|%s|%s|%.3f|%.3f|%s", r.ServerID, r.VerifierID, r.Nonce, r.StorageLatencyMs, r.StorageJitterMs, r.AgentTimestamp)
	if verify(pub, bad, sig) {
		fmt.Println("NEG-CONTROL: UNEXPECTED PASS -- harness unsound.")
		os.Exit(3)
	}
	fmt.Println("NEG-CONTROL: ok (3-decimal float drift correctly rejected).")
}
