#!/usr/bin/env python3
# =============================================================================
# B-DRVS Probing Agent — Verified-Path Challenge Responder (Tier 1, hardened)
#
# Answers a government Verifier's challenge in the challenge-response protocol
# (see chaincode verified.go). The Verifier (NITA) sends {verifierID, nonce};
# this module measures LOCAL storage latency, builds the agentCanonical string,
# signs it with the agent's registered key, and returns the response. The
# Verifier then measures RTT and observes the source IP ITSELF before wrapping
# everything into a VerifiedCheckIn and submitting it.
#
# The agent here attests ONLY to: serverID, the verifier's nonce, and its own
# storage measurement. It does NOT report IP or RTT — those are taken by the
# verifier, which is the whole point of moving trust off vendor hardware.
#
# CRITICAL: agent_canonical() below MUST stay byte-identical to agentCanonical()
# in verified.go. It is covered by tools/bytematch/ (verified path) — re-run
# that harness whenever either side of the canonical string changes.
# =============================================================================

import datetime
import http.server
import json
import logging
import socketserver

import config
import key_manager
from agent import measure_storage_latency_ms  # reuse the existing storage probe

logger = logging.getLogger("bdrvs.responder")


def agent_canonical(server_id: str, verifier_id: str, nonce: str,
                    storage_lat_ms: float, storage_jit_ms: float,
                    agent_ts: str) -> str:
    """
    MUST match, byte-for-byte, agentCanonical() in verified.go:
        fmt.Sprintf("%s|%s|%s|%.4f|%.4f|%s",
            ServerID, VerifierID, Nonce, StorageLatencyMs, StorageJitterMs, AgentTimestamp)
    """
    return (f"{server_id}|{verifier_id}|{nonce}|"
            f"{storage_lat_ms:.4f}|{storage_jit_ms:.4f}|{agent_ts}")


def build_agent_response(verifier_id: str, nonce: str) -> dict:
    """
    Produces the agent's half of a verified check-in: a signed attestation
    binding THIS server to THIS verifier's THIS nonce, plus a local storage
    measurement. Returned to the verifier, which adds IP/RTT and counter-signs.
    """
    if not verifier_id or not nonce:
        raise ValueError("verifier_id and nonce are required")

    storage_lat_ms, storage_jit_ms = measure_storage_latency_ms()

    # Timezone-aware UTC (replaces deprecated datetime.utcnow()); same "...Z" form
    # the rest of the agent uses. Signed verbatim and carried through the verifier.
    agent_ts = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    canonical = agent_canonical(config.SERVER_ID, verifier_id, nonce,
                                storage_lat_ms, storage_jit_ms, agent_ts)
    logger.debug("agentCanonical: %s", canonical)

    private_key = key_manager.load_private_key(config.PRIVATE_KEY_PATH)
    agent_signature = key_manager.sign_payload(private_key, canonical)  # base64 DER

    return {
        "serverID":         config.SERVER_ID,
        "verifierID":       verifier_id,
        "nonce":            nonce,
        "storageLatencyMs": storage_lat_ms,
        "storageJitterMs":  storage_jit_ms,
        "agentTimestamp":   agent_ts,
        "agentSignature":   agent_signature,
    }


# =============================================================================
# Reference transport — PROPOSED shape, confirm against the verifier service.
#
# The verifier must measure RTT as the round-trip of its own request and observe
# the source IP of this connection, so the responder has to be reachable DIRECTLY
# (no CDN/proxy/load-balancer in front, or the RTT and IP it reads are not the
# health server's). Treat this as the contract the (still-to-build) verifier
# service calls; adjust route/port/auth to match once that exists.
# =============================================================================

class ChallengeHandler(http.server.BaseHTTPRequestHandler):
    def do_POST(self):
        if self.path != "/challenge":
            self.send_error(404, "unknown route")
            return
        try:
            length = int(self.headers.get("Content-Length", 0))
            body = json.loads(self.rfile.read(length) or b"{}")
            resp = build_agent_response(body.get("verifierID", ""), body.get("nonce", ""))
            payload = json.dumps(resp).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)
        except Exception as e:  # noqa: BLE001 — return a clean error to the verifier
            logger.error("challenge handling failed: %s", e)
            self.send_error(400, str(e))

    def log_message(self, *_args):  # silence default stderr logging
        pass


def serve(host: str = "0.0.0.0", port: int | None = None) -> None:
    port = port or getattr(config, "RESPONDER_PORT", 8645)
    with socketserver.TCPServer((host, port), ChallengeHandler) as httpd:
        logger.info("Challenge responder listening on %s:%d", host, port)
        httpd.serve_forever()


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    serve()
