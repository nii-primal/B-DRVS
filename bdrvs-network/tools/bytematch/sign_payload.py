#!/usr/bin/env python3
"""
B-DRVS verified-path byte-match harness  --  PYTHON SIGNER.

Mirrors what the probing agent does in the verified / challenge-response path:
build a canonical byte string from the check-in fields, hash it with SHA-256,
and produce an ECDSA / P-256 signature in DER (ASN.1) form.

The whole point of this harness is to prove that a signature produced HERE
verifies in the Go side (verify_payload.go) -- i.e. that the two languages
agree on all four things that silently break ECDSA across a language boundary:

    1. the EXACT bytes being signed   (canonical serialisation)
    2. the curve                      (P-256 / secp256r1)
    3. the hash                       (SHA-256)
    4. the signature encoding         (DER / ASN.1)

Your 17 Go unit tests sign and verify entirely within Go, so they exercise
NONE of these. This harness does.

Output: writes payload.json (string fields + base64 DER signature + PEM public key).
"""

import base64
import hashlib
import json

from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec

# --- canonical serialisation -------------------------------------------------
# Field separator: ASCII Unit Separator (0x1F). Chosen because it cannot occur
# inside any of the transmitted string fields, so we never have to escape.
# If you change this you MUST change `sep` in verify_payload.go too.
SEP = b"\x1f"

# RULE: every field is the EXACT STRING the agent emits and transmits.
# Go must rebuild the canonical bytes from these SAME received strings. It must
# NOT re-parse and re-format anything (especially the timestamp or the RTT
# integer) -- that is the #1 cause of cross-language drift.
FIELD_ORDER = ("server_id", "ip", "rtt_ms", "timestamp", "nonce")


def canonical_bytes(fields: dict) -> bytes:
    return SEP.join(fields[k].encode("utf-8") for k in FIELD_ORDER)


def main() -> None:
    # In production this is the agent's registered key and the public key lives
    # on-ledger. Here we generate a fresh P-256 keypair just for the test.
    priv = ec.generate_private_key(ec.SECP256R1())

    # All values are STRINGS, produced once, signed and transmitted verbatim.
    fields = {
        "server_id": "LHIMS-KORLE-BU-01",
        "ip": "154.161.12.34",
        "rtt_ms": "12",                       # stringified integer, carried as-is
        "timestamp": "2026-06-18T11:00:00Z",  # signed verbatim -- Go must NOT reformat
        "nonce": "b3f1c9a27e5d40128a6f0e7c91d2ab34",
    }

    msg = canonical_bytes(fields)

    # ec.ECDSA(SHA256) hashes `msg` internally. Do NOT pre-hash here -- passing a
    # digest without Prehashed() would double-hash and Go would never verify.
    # The output is DER/ASN.1, which matches Go's ecdsa.VerifyASN1.
    sig_der = priv.sign(msg, ec.ECDSA(hashes.SHA256()))

    pub_pem = priv.public_key().public_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PublicFormat.SubjectPublicKeyInfo,  # SPKI -> Go x509.ParsePKIXPublicKey
    ).decode("ascii")

    out = {
        "fields": fields,
        "signature_b64": base64.b64encode(sig_der).decode("ascii"),
        "public_key_pem": pub_pem,
        # echoed for human diagnosis only; Go recomputes these itself
        "_debug_canonical_hex": msg.hex(),
        "_debug_sha256_hex": hashlib.sha256(msg).hexdigest(),
    }
    with open("payload.json", "w") as f:
        json.dump(out, f, indent=2)

    print("wrote payload.json")
    print("canonical bytes (hex):", msg.hex())
    print("sha256(canonical)    :", out["_debug_sha256_hex"])


if __name__ == "__main__":
    main()
