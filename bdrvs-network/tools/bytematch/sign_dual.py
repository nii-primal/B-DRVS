#!/usr/bin/env python3
"""
B-DRVS verified-path FULL signature-chain test  --  PYTHON side.

Produces BOTH signatures the chaincode checks in SubmitVerifiedCheckIn:
  STEP 2  agent signature    over agentCanonical
  STEP 1  verifier signature over verifierCanonical (which wraps the agent sig)

If verify_dual.go accepts both, then verifier.py + verified_responder.py will
satisfy the chaincode's signature checks -- proven offline, no Fabric needed.

Canonicals mirror verified.go exactly; encoding mirrors key_manager.py
(P-256 / SHA-256 / DER / base64).
"""

import base64
import json

from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec


def agent_canonical(server_id, verifier_id, nonce, lat, jit, agent_ts):
    # verified.go: "%s|%s|%s|%.4f|%.4f|%s"
    return f"{server_id}|{verifier_id}|{nonce}|{lat:.4f}|{jit:.4f}|{agent_ts}"


def verifier_canonical(server_id, verifier_id, observed_ip, rtt, nonce,
                       lat, jit, agent_ts, agent_sig, verifier_ts):
    # verified.go: "%s|%s|%s|%.4f|%s|%.4f|%.4f|%s|%s|%s"
    return (f"{server_id}|{verifier_id}|{observed_ip}|{rtt:.4f}|{nonce}|"
            f"{lat:.4f}|{jit:.4f}|{agent_ts}|{agent_sig}|{verifier_ts}")


def sign(priv, msg: str) -> str:  # mirror key_manager.sign_payload
    return base64.b64encode(
        priv.sign(msg.encode("utf-8"), ec.ECDSA(hashes.SHA256()))
    ).decode("ascii")


def pub_pem(priv) -> str:
    return priv.public_key().public_bytes(
        serialization.Encoding.PEM,
        serialization.PublicFormat.SubjectPublicKeyInfo,
    ).decode("ascii")


def main() -> None:
    agent_key = ec.generate_private_key(ec.SECP256R1())
    verifier_key = ec.generate_private_key(ec.SECP256R1())

    server_id   = "LHIMS-KORLE-BU-01"
    verifier_id = "NITA-ACCRA-01"
    nonce       = "b3f1c9a27e5d40128a6f0e7c91d2ab34"
    observed_ip = "154.161.12.34"
    rtt         = 0.8421          # verifier-measured RTT (ms)
    lat         = 1.2345          # agent-measured storage latency (ms)
    jit         = 0.2345
    agent_ts    = "2026-06-18T11:00:00Z"
    verifier_ts = "2026-06-18T11:00:01Z"

    # Agent signs first (over its canonical).
    ac = agent_canonical(server_id, verifier_id, nonce, lat, jit, agent_ts)
    agent_sig = sign(agent_key, ac)

    # Verifier signs the whole thing, INCLUDING the agent signature.
    vc = verifier_canonical(server_id, verifier_id, observed_ip, rtt, nonce,
                            lat, jit, agent_ts, agent_sig, verifier_ts)
    verifier_sig = sign(verifier_key, vc)

    out = {
        "serverID": server_id, "verifierID": verifier_id, "observedIP": observed_ip,
        "measuredRttMs": rtt, "nonce": nonce,
        "storageLatencyMs": lat, "storageJitterMs": jit,
        "agentTimestamp": agent_ts, "agentSignature": agent_sig,
        "verifierTimestamp": verifier_ts, "verifierSignature": verifier_sig,
        "agentPublicKeyPEM": pub_pem(agent_key),
        "verifierPublicKeyPEM": pub_pem(verifier_key),
    }
    with open("dual.json", "w") as f:
        json.dump(out, f, indent=2)

    print("wrote dual.json")
    print("agentCanonical   :", ac)
    print("verifierCanonical:", vc[:72] + " ...")


if __name__ == "__main__":
    main()
