#!/usr/bin/env python3
"""
B-DRVS byte-match harness v2  --  VERIFIED PATH (agentCanonical).

Targets the NEW boundary: the agent's signature in the challenge-response path.
The self-report path is already proven live; this layout is not, because no
Python code produces it yet.

Go side it must match (verified.go):

    func agentCanonical(v *VerifiedCheckIn) string {
        return fmt.Sprintf("%s|%s|%s|%.4f|%.4f|%s",
            v.ServerID, v.VerifierID, v.Nonce,
            v.StorageLatencyMs, v.StorageJitterMs, v.AgentTimestamp)
    }

Note the REAL cross-language risk here is the two %.4f float fields: Python
formats them with :.4f when signing, Go re-formats the JSON-roundtripped float64
with %.4f when verifying. Both sides format INDEPENDENTLY, so this harness passes
the floats as JSON NUMBERS (not pre-formatted strings) to test that :.4f and
%.4f agree on the same value. (They do as long as the agent rounds to 4 dp first,
which measure_storage_latency_ms already does -- this proves it.)

Encoding mirrors key_manager.py exactly: P-256 / SHA-256 / DER / base64.
"""

import base64
import hashlib
import json

from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec

# Single source of truth for the agent canonical string. The real responder
# (verified_responder.py) uses an identical function.
def agent_canonical(server_id: str, verifier_id: str, nonce: str,
                    storage_lat_ms: float, storage_jit_ms: float,
                    agent_ts: str) -> str:
    return f"{server_id}|{verifier_id}|{nonce}|{storage_lat_ms:.4f}|{storage_jit_ms:.4f}|{agent_ts}"


def main() -> None:
    priv = ec.generate_private_key(ec.SECP256R1())

    server_id   = "LHIMS-KORLE-BU-01"
    verifier_id = "NITA-ACCRA-01"
    nonce       = "b3f1c9a27e5d40128a6f0e7c91d2ab34"
    storage_lat = 1.2345        # agent-measured, already round(.,4)
    storage_jit = 0.2345
    agent_ts    = "2026-06-18T11:00:00Z"   # signed verbatim, carried through verifier

    canonical = agent_canonical(server_id, verifier_id, nonce, storage_lat, storage_jit, agent_ts)

    # mirror key_manager.sign_payload: DER signature, base64-encoded
    sig_der = priv.sign(canonical.encode("utf-8"), ec.ECDSA(hashes.SHA256()))
    sig_b64 = base64.b64encode(sig_der).decode("ascii")

    pub_pem = priv.public_key().public_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PublicFormat.SubjectPublicKeyInfo,
    ).decode("ascii")

    # Floats go out as JSON NUMBERS so Go formats them itself (faithful to reality).
    out = {
        "serverID": server_id,
        "verifierID": verifier_id,
        "nonce": nonce,
        "storageLatencyMs": storage_lat,
        "storageJitterMs": storage_jit,
        "agentTimestamp": agent_ts,
        "agentSignature": sig_b64,
        "publicKeyPEM": pub_pem,
        "_debug_canonical": canonical,
        "_debug_sha256_hex": hashlib.sha256(canonical.encode("utf-8")).hexdigest(),
    }
    with open("agent_response.json", "w") as f:
        json.dump(out, f, indent=2)

    print("wrote agent_response.json")
    print("canonical:", canonical)
    print("sha256   :", out["_debug_sha256_hex"])


if __name__ == "__main__":
    main()
