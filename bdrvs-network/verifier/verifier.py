#!/usr/bin/env python3
# =============================================================================
# B-DRVS Government Verifier (NITA) — Tier 2 trust anchor
# University of Mines and Technology, Tarkwa — BSc Cybersecurity 2026
#
# This is the runner that MOVES TRUST off vendor hardware. Each cycle it:
#   1. Generates an unpredictable nonce.
#   2. Measures RTT to the health server ITSELF (TCP-handshake timing).
#   3. Observes the server's IP ITSELF.
#   4. Challenges the server's agent (verified_responder.py) with the nonce and
#      receives a signed attestation (storage measurement + agent signature).
#   5. Wraps everything into a VerifiedCheckIn, signs it with the VERIFIER key,
#      and submits it to the blockchain via the gateway.
#
# The chaincode (verified.go) then trusts the IP/RTT because a registered
# verifier signed them, and trusts that the right server answered because the
# agent signed the verifier's nonce.
#
# Usage:
#   python3 verifier.py --register   # one-time: make + register verifier key
#   python3 verifier.py              # run one verified check-in
#   python3 verifier.py --loop       # run continuously on schedule
# =============================================================================

import argparse
import datetime
import json
import logging
import secrets
import socket
import sys
import time

import requests

import key_manager           # reused from the probing agent — same ECDSA P-256/DER
import verifier_config as cfg

logging.basicConfig(
    level=getattr(logging, cfg.LOG_LEVEL, logging.INFO),
    format="%(asctime)s [%(levelname)s] %(name)s — %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
logger = logging.getLogger("bdrvs.verifier")


# =============================================================================
# Canonical string — MUST stay byte-identical to verifierCanonical() in
# verified.go. Covered by tools/bytematch/ (sign_dual / verify_dual).
# =============================================================================

def verifier_canonical(v: dict) -> str:
    # verified.go: "%s|%s|%s|%.4f|%s|%.4f|%.4f|%s|%s|%s"
    return (f"{v['serverID']}|{v['verifierID']}|{v['observedIP']}|{v['measuredRttMs']:.4f}|"
            f"{v['nonce']}|{v['storageLatencyMs']:.4f}|{v['storageJitterMs']:.4f}|"
            f"{v['agentTimestamp']}|{v['agentSignature']}|{v['verifierTimestamp']}")


# =============================================================================
# Step 2 — Measure RTT (verifier-side, independent of agent processing time)
# =============================================================================

def measure_rtt_ms() -> float:
    """TCP-handshake timing to the agent. The handshake is a network round trip
    and excludes the agent's storage-probe time, so it is a clean RTT."""
    samples = []
    for i in range(cfg.RTT_SAMPLES):
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            s.settimeout(5.0)
            t0 = time.perf_counter()
            s.connect((cfg.AGENT_HOST, cfg.AGENT_PORT))
            t1 = time.perf_counter()
            s.close()
            samples.append((t1 - t0) * 1000.0)
        except OSError as e:
            logger.warning("RTT sample %d failed: %s", i + 1, e)
        time.sleep(0.05)
    if not samples:
        raise RuntimeError(
            f"Could not reach agent at {cfg.AGENT_HOST}:{cfg.AGENT_PORT} for RTT. "
            "Is verified_responder.py running on the health server?"
        )
    rtt = round(sum(samples) / len(samples), 4)
    logger.info("RTT to %s:%d = %.4fms (avg of %d)", cfg.AGENT_HOST, cfg.AGENT_PORT, rtt, len(samples))
    return rtt


# =============================================================================
# Step 3 — Observe the server's IP (verifier-side)
# =============================================================================

def observe_ip() -> str:
    if cfg.OBSERVED_IP_OVERRIDE:
        logger.info("Using simulated observed IP: %s", cfg.OBSERVED_IP_OVERRIDE)
        return cfg.OBSERVED_IP_OVERRIDE
    ip = socket.gethostbyname(cfg.AGENT_HOST)
    logger.info("Observed agent IP: %s", ip)
    return ip


# =============================================================================
# Step 4 — Challenge the agent and receive its signed attestation
# =============================================================================

def challenge_agent(nonce: str) -> dict:
    url = f"http://{cfg.AGENT_HOST}:{cfg.AGENT_PORT}/challenge"
    logger.info("Challenging agent at %s (nonce=%s…)", url, nonce[:8])
    r = requests.post(url, json={"verifierID": cfg.VERIFIER_ID, "nonce": nonce},
                      timeout=cfg.CHALLENGE_TIMEOUT_SEC)
    r.raise_for_status()
    resp = r.json()

    # Bind the response to OUR challenge before trusting it.
    if resp.get("nonce") != nonce:
        raise RuntimeError("agent echoed a different nonce — rejecting (possible replay)")
    if not resp.get("agentSignature"):
        raise RuntimeError("agent response is missing its signature")
    for field in ("serverID", "storageLatencyMs", "storageJitterMs", "agentTimestamp"):
        if field not in resp:
            raise RuntimeError(f"agent response missing required field '{field}'")
    return resp


# =============================================================================
# Step 5 — Build, sign, submit
# =============================================================================

def run_cycle() -> dict:
    logger.info("=" * 60)
    logger.info("Starting verified check-in cycle")

    nonce       = secrets.token_hex(16)
    measured_rtt = measure_rtt_ms()
    observed_ip = observe_ip()
    agent       = challenge_agent(nonce)

    verifier_ts = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    checkin = {
        "serverID":          agent["serverID"],
        "verifierID":        cfg.VERIFIER_ID,
        "observedIP":        observed_ip,
        "measuredRttMs":     measured_rtt,
        "nonce":             nonce,
        "storageLatencyMs":  agent["storageLatencyMs"],
        "storageJitterMs":   agent["storageJitterMs"],
        "agentTimestamp":    agent["agentTimestamp"],
        "agentSignature":    agent["agentSignature"],
        "verifierTimestamp": verifier_ts,
    }

    canonical = verifier_canonical(checkin)
    priv = key_manager.load_private_key(cfg.VERIFIER_PRIVATE_KEY_PATH)
    checkin["verifierSignature"] = key_manager.sign_payload(priv, canonical)  # base64 DER

    return submit(checkin)


def submit(checkin: dict) -> dict:
    payload_json = json.dumps(checkin)
    logger.info("Submitting verified check-in to %s", cfg.GATEWAY_VERIFIED_CHECKIN_URL)
    r = requests.post(cfg.GATEWAY_VERIFIED_CHECKIN_URL, json={"payload": payload_json},
                      timeout=cfg.GATEWAY_TIMEOUT_SEC, headers={"Content-Type": "application/json"})
    if r.status_code != 200:
        logger.error("Gateway returned HTTP %d: %s", r.status_code, r.text)
        raise RuntimeError(f"gateway error {r.status_code}")
    result = r.json()
    status = result.get("status", "UNKNOWN")
    record = result.get("recordID", "N/A")
    if status == "COMPLIANT":
        logger.info("✅ COMPLIANT — Record: %s", record)
    else:
        logger.warning("🚨 %s — %s — Record: %s", status, result.get("violationReason", ""), record)
    return result


# =============================================================================
# One-time registration
# =============================================================================

def register() -> None:
    if not key_manager.keys_exist(cfg.VERIFIER_PRIVATE_KEY_PATH, cfg.VERIFIER_PUBLIC_KEY_PATH):
        logger.info("No verifier keys found — generating ECDSA P-256 key pair…")
        key_manager.generate_key_pair(cfg.VERIFIER_PRIVATE_KEY_PATH, cfg.VERIFIER_PUBLIC_KEY_PATH)
    public_key_pem = key_manager.load_public_key_pem(cfg.VERIFIER_PUBLIC_KEY_PATH)

    logger.info("Registering verifier '%s' on the blockchain…", cfg.VERIFIER_ID)
    r = requests.post(cfg.GATEWAY_REGISTER_VERIFIER_URL,
                      json={"verifierID": cfg.VERIFIER_ID, "publicKeyPEM": public_key_pem,
                            "location": cfg.VERIFIER_LOCATION},
                      timeout=cfg.GATEWAY_TIMEOUT_SEC)
    if r.status_code == 200:
        logger.info("Verifier '%s' registered.", cfg.VERIFIER_ID)
    elif r.status_code == 409:
        logger.info("Verifier '%s' already registered — skipping.", cfg.VERIFIER_ID)
    else:
        logger.error("Registration failed: %d — %s", r.status_code, r.text)
        raise RuntimeError("verifier registration failed")


# =============================================================================
# CLI
# =============================================================================

def main() -> None:
    parser = argparse.ArgumentParser(description="B-DRVS Government Verifier (NITA)")
    parser.add_argument("--register", action="store_true",
                        help="generate + register the verifier key, then exit")
    parser.add_argument("--loop", action="store_true",
                        help=f"run continuously every {cfg.CHECK_IN_INTERVAL_SEC}s")
    args = parser.parse_args()

    if args.register:
        register()
        return

    if args.loop:
        logger.info("Continuous mode — verified check-in every %ds", cfg.CHECK_IN_INTERVAL_SEC)
        while True:
            try:
                run_cycle()
            except Exception as e:  # noqa: BLE001
                logger.error("Cycle failed, will retry next interval: %s", e)
            time.sleep(cfg.CHECK_IN_INTERVAL_SEC)
    else:
        run_cycle()


if __name__ == "__main__":
    main()
