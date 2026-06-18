// B-DRVS verified-path byte-match harness  --  GO VERIFIER.
//
// Mirrors what the chaincode does in the verified path: take the RECEIVED
// string fields, rebuild the same canonical byte string the Python agent
// signed, SHA-256 it, and verify the ECDSA / P-256 DER signature against the
// registered public key.
//
// It then runs a NEGATIVE CONTROL: rebuild the bytes with a timestamp that
// differs only in timezone notation (+00:00 instead of the Z that was signed)
// -- the single most common drift between two independently-formatted times --
// and confirms that verification FAILS. Without the negative control a PASS
// could be a false positive (e.g. if both sides happened to share a bug).
//
// Run:  go run verify_payload.go   (after sign_payload.py has written payload.json)
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

const sep = "\x1f" // MUST match SEP in sign_payload.py

type payload struct {
	Fields struct {
		ServerID  string `json:"server_id"`
		IP        string `json:"ip"`
		RTTms     string `json:"rtt_ms"`
		Timestamp string `json:"timestamp"`
		Nonce     string `json:"nonce"`
	} `json:"fields"`
	SignatureB64 string `json:"signature_b64"`
	PublicKeyPEM string `json:"public_key_pem"`
}

// canonical rebuilds the signed message from the RECEIVED strings.
// It must not reformat any field.
func canonical(serverID, ip, rtt, ts, nonce string) []byte {
	return []byte(serverID + sep + ip + sep + rtt + sep + ts + sep + nonce)
}

func die(msg string, err error) {
	fmt.Printf("%s: %v\n", msg, err)
	os.Exit(1)
}

func main() {
	raw, err := os.ReadFile("payload.json")
	if err != nil {
		die("read payload.json", err)
	}
	var p payload
	if err := json.Unmarshal(raw, &p); err != nil {
		die("parse payload.json", err)
	}

	// public key: PEM -> SPKI DER -> *ecdsa.PublicKey
	block, _ := pem.Decode([]byte(p.PublicKeyPEM))
	if block == nil {
		fmt.Println("public key is not valid PEM")
		os.Exit(1)
	}
	pubAny, err := x509.ParsePKIXPublicKey(block.Bytes)
	if err != nil {
		die("parse public key", err)
	}
	pub, ok := pubAny.(*ecdsa.PublicKey)
	if !ok {
		fmt.Println("public key is not ECDSA")
		os.Exit(1)
	}

	sig, err := base64.StdEncoding.DecodeString(p.SignatureB64)
	if err != nil {
		die("decode signature", err)
	}

	// --- main check ---------------------------------------------------------
	msg := canonical(p.Fields.ServerID, p.Fields.IP, p.Fields.RTTms, p.Fields.Timestamp, p.Fields.Nonce)
	digest := sha256.Sum256(msg)
	fmt.Printf("canonical bytes (hex): %x\n", msg)
	fmt.Printf("sha256(canonical)    : %x\n", digest)

	if !ecdsa.VerifyASN1(pub, digest[:], sig) {
		fmt.Println("RESULT: FAIL  Python signature did NOT verify in Go.")
		fmt.Println("              Compare the sha256 above with Python's _debug_sha256_hex in payload.json.")
		fmt.Println("              Equal digests + FAIL => curve/encoding mismatch. Different digests => byte drift.")
		os.Exit(2)
	}
	fmt.Println("RESULT: PASS  Python signature verified in Go (bytes, curve, hash, encoding all agree).")

	// --- negative control ---------------------------------------------------
	badTS := "2026-06-18T11:00:00+00:00" // same instant, +00:00 instead of Z
	badMsg := canonical(p.Fields.ServerID, p.Fields.IP, p.Fields.RTTms, badTS, p.Fields.Nonce)
	badDigest := sha256.Sum256(badMsg)
	if ecdsa.VerifyASN1(pub, badDigest[:], sig) {
		fmt.Println("NEG-CONTROL: UNEXPECTED PASS -- harness is not sound; a real mismatch could slip through.")
		os.Exit(3)
	}
	fmt.Println("NEG-CONTROL: ok (timezone-notation drift correctly rejected).")
}
