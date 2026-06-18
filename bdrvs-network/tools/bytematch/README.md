# B-DRVS verified-path byte-match harness

A standalone, Fabric-free check that an ECDSA signature produced by the Python
probing agent verifies in the Go chaincode. It isolates the four things that
silently break ECDSA across a language boundary:

1. the exact bytes being signed (canonical serialisation)
2. the curve (P-256 / secp256r1)
3. the hash (SHA-256)
4. the signature encoding (DER / ASN.1)

Your existing Go unit tests sign and verify inside Go, so they never touch
this boundary. A Python signature is the first thing that does.

## Run

    sh run.sh

Expected output ends with:

    RESULT: PASS  ...
    NEG-CONTROL: ok ...

`PASS` means the Python signature verified in Go. `NEG-CONTROL: ok` means a
deliberately drifted variant was correctly rejected, so a real mismatch
wouldn't slip through. If the harness ever prints `NEG-CONTROL: UNEXPECTED
PASS`, the test itself is unsound -- fix that before trusting a PASS.

## Files

- `sign_payload.py`   Python signer. Builds canonical bytes, signs P-256/SHA-256, emits DER. Writes payload.json.
- `verify_payload.go` Go verifier. Rebuilds the bytes from received strings, verifies, runs the negative control.
- `payload.json`      Generated handoff: string fields + base64 DER signature + PEM public key.

## Wiring it to the real system

This harness is the spec for what both sides must agree on. To make it a true
test of YOUR code rather than a clean-room reference:

1. **Canonical serialisation.** Replace `canonical_bytes()` (Python) and
   `canonical()` (Go) with the exact serialisation your agent and chaincode
   use. They must be byte-identical. The safe pattern, baked in here: build the
   message from the string fields exactly as transmitted, and never re-parse or
   re-format a field on the Go side. Reformatting the timestamp or re-rendering
   the RTT integer is the most common drift -- the negative control demonstrates
   exactly that failure.

2. **The signed key.** Swap the fresh keypair in `sign_payload.py` for the
   agent's real registered key, and have the Go side load the public key from
   the on-ledger registration instead of payload.json.

3. **Signature encoding.** This harness uses DER end to end (Python
   `cryptography` emits DER; Go `VerifyASN1` consumes DER), which matches
   Fabric's own identity conventions. If `verified.go` currently verifies a raw
   64-byte r||s signature instead, that is a real mismatch the harness exists to
   surface -- reconcile to one encoding on both sides.

4. **Don't double-hash.** Python's `ec.ECDSA(hashes.SHA256())` hashes the
   message internally; Go's `VerifyASN1` expects the digest. Passing a
   pre-hashed value into the Python `sign()` without `Prehashed()` double-hashes
   and nothing will ever verify.

## Reading a failure

- Digests equal, signature FAILs  -> curve or encoding mismatch (e.g. secp256k1
  vs secp256r1, or raw r||s vs DER).
- Digests differ                  -> byte drift; your two serialisations don't
  agree. Diff the canonical hex lines the two programs print.
