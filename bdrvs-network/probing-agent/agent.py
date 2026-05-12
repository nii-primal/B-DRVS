#!/usr/bin/env python3
# =============================================================================
# B-DRVS Probing Agent — Main Script (Tier 1)
# University of Mines and Technology, Tarkwa — BSc Cybersecurity 2026
#
# Responsibilities:
#   1. On first run: generate ECDSA key pair + register server on blockchain
#   2. On each scheduled cycle:
#        a. Collect public IP address
#        b. Measure RTT to NITA Verifier Node
#        c. Build and sign canonical payload
#        d. Submit signed payload to blockchain via REST API gateway
#
# Usage:
#   python3 agent.py              — run once (for testing)
#   python3 agent.py --loop       — run continuously on schedule
#   python3 agent.py --register   — register server only, then exit
# =============================================================================

import argparse
import json
import logging
import os
import socket
import sys
import time
import datetime
import requests
import subprocess

import config
import key_manager

# =============================================================================
# Logging Setup
# =============================================================================

os.makedirs(os.path.dirname(config.LOG_FILE), exist_ok=True)

logging.basicConfig(
    level=getattr(logging, config.LOG_LEVEL, logging.INFO),
    format="%(asctime)s [%(levelname)s] %(name)s — %(message)s",
    handlers=[
        logging.FileHandler(config.LOG_FILE),
        logging.StreamHandler(sys.stdout)
    ]
)
logger = logging.getLogger("bdrvs.agent")


# =============================================================================
# Step A — Collect Public IP Address
# =============================================================================

def get_public_ip() -> str:
    """
    Queries external lookup services to determine the server's current
    public IP address. Tries each service in order until one succeeds.

    This is the IP that will be compared against the Ghana AFRINIC whitelist
    in the smart contract.
    """
    for service_url in config.IP_LOOKUP_SERVICES:
        try:
            response = requests.get(
                service_url,
                timeout=config.IP_LOOKUP_TIMEOUT_SEC,
                headers={"User-Agent": "B-DRVS-ProbeAgent/1.0"}
            )
            if response.status_code == 200:
                ip = response.text.strip()
                logger.info(f"Public IP resolved: {ip} (via {service_url})")
                return ip
        except requests.RequestException as e:
            logger.warning(f"IP lookup failed for {service_url}: {e}")
            continue

    raise RuntimeError("All IP lookup services failed. Check network connectivity.")


# =============================================================================
# Step B — Measure RTT to NITA Verifier Node
# =============================================================================

def measure_rtt_ms() -> float:
    """
    Measures the Round-Trip Time (RTT) in milliseconds from this server
    to the NITA Verifier Node using TCP socket timing.

    The NITA Verifier Node is hosted at NITA's government data centre
    in Accra. It is the authoritative reference point for latency-based
    geolocation. Intra-Accra TCP RTT reliably stays below 50ms.

    Why TCP and not ICMP ping?
    Many cloud environments block ICMP. TCP SYN to an open port gives
    a reliable RTT measurement without requiring special privileges.

    Returns:
        Average RTT in milliseconds over VERIFIER_PING_COUNT samples.
    """
    samples = []
    host = config.VERIFIER_HOST
    port = config.VERIFIER_PORT

    for i in range(config.VERIFIER_PING_COUNT):
        try:
            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            sock.settimeout(5.0)

            start = time.perf_counter()
            sock.connect((host, port))
            end = time.perf_counter()

            sock.close()

            rtt = (end - start) * 1000  # convert to milliseconds
            samples.append(rtt)
            logger.debug(f"RTT sample {i+1}/{config.VERIFIER_PING_COUNT}: {rtt:.2f}ms")

        except (socket.timeout, ConnectionRefusedError, OSError) as e:
            logger.warning(f"RTT sample {i+1} failed: {e}")
            continue

        time.sleep(0.1)  # small delay between samples

    if not samples:
        raise RuntimeError(
            f"All RTT measurements to {host}:{port} failed. "
            "Check that the NITA Verifier Node is reachable."
        )

    avg_rtt = sum(samples) / len(samples)
    logger.info(
        f"RTT to NITA Verifier Node: avg={avg_rtt:.2f}ms "
        f"(samples={len(samples)}, min={min(samples):.2f}ms, max={max(samples):.2f}ms)"
    )
    return round(avg_rtt, 4)


# =============================================================================
# Step C — Build and Sign Canonical Payload
# =============================================================================

def build_signed_payload(public_ip: str, rtt_ms: float) -> dict:
    """
    Constructs the CheckInPayload that will be submitted to the blockchain.

    The canonical string for signing must exactly match the format
    expected by the Go smart contract's verifyECDSASignature function:
        "<serverID>|<publicIP>|<rttMs:.4f>|<timestamp>"

    Returns:
        A dict matching the CheckInPayload struct in residency.go
    """
    timestamp = datetime.datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")

    # Build canonical string — MUST match Go chaincode format exactly
    canonical_str = f"{config.SERVER_ID}|{public_ip}|{rtt_ms:.4f}|{timestamp}"
    logger.debug(f"Canonical string: {canonical_str}")

    # Load private key and sign
    private_key = key_manager.load_private_key(config.PRIVATE_KEY_PATH)
    signature = key_manager.sign_payload(private_key, canonical_str)

    payload = {
        "serverID":  config.SERVER_ID,
        "publicIP":  public_ip,
        "rttMs":     rtt_ms,
        "timestamp": timestamp,
        "signature": signature
    }

    logger.info(
        f"Payload built — server={config.SERVER_ID} "
        f"ip={public_ip} rtt={rtt_ms}ms ts={timestamp}"
    )
    return payload


# =============================================================================
# Step D — Submit to Blockchain via REST API Gateway
# =============================================================================

def submit_checkin(payload: dict) -> dict:
    """
    Sends the signed CheckInPayload to the REST API gateway (Phase 4),
    which forwards it to the Hyperledger Fabric network as a transaction.

    The gateway wraps the payload into a Fabric transaction proposal,
    collects endorsements from peer0.moh and peer0.nita, and commits
    the resulting record to the immutable ledger.

    Returns:
        The response JSON from the gateway (contains the ResidencyRecord).
    """
    payload_json = json.dumps(payload)

    try:
        logger.info(f"Submitting check-in to gateway: {config.GATEWAY_URL}")
        response = requests.post(
            config.GATEWAY_URL,
            json={"payload": payload_json},
            timeout=config.GATEWAY_TIMEOUT_SEC,
            headers={"Content-Type": "application/json"}
        )

        if response.status_code == 200:
            result = response.json()
            status = result.get("status", "UNKNOWN")
            record_id = result.get("recordID", "N/A")

            if status == "COMPLIANT":
                logger.info(f"✅ COMPLIANT — Record: {record_id}")
            else:
                violation = result.get("violationReason", "")
                logger.warning(f"🚨 SOVEREIGNTY_VIOLATION — {violation} — Record: {record_id}")

            return result
        else:
            logger.error(
                f"Gateway returned HTTP {response.status_code}: {response.text}"
            )
            raise RuntimeError(f"Gateway error: {response.status_code}")

    except requests.ConnectionError:
        logger.error(
            f"Cannot connect to gateway at {config.GATEWAY_URL}. "
            "Is the Phase 4 API server running?"
        )
        raise


# =============================================================================
# Server Registration
# =============================================================================

def register_server() -> None:
    """
    Registers this server on the blockchain by submitting its public key
    via the REST API gateway. Called once on first run.

    After registration, the smart contract will accept signed check-ins
    from this agent. If the server is already registered, this is a no-op.
    """
    public_key_pem = key_manager.load_public_key_pem(config.PUBLIC_KEY_PATH)

    registration_payload = {
        "serverID":     config.SERVER_ID,
        "publicKeyPEM": public_key_pem,
        "ownerOrg":     config.OWNER_ORG
    }

    try:
        logger.info(f"Registering server '{config.SERVER_ID}' on blockchain...")
        response = requests.post(
            config.GATEWAY_URL.replace("/checkin", "/register"),
            json=registration_payload,
            timeout=config.GATEWAY_TIMEOUT_SEC,
            headers={"Content-Type": "application/json"}
        )

        if response.status_code == 200:
            logger.info(f"Server '{config.SERVER_ID}' registered successfully.")
        elif response.status_code == 409:
            logger.info(f"Server '{config.SERVER_ID}' already registered — skipping.")
        else:
            logger.error(f"Registration failed: {response.status_code} — {response.text}")
            raise RuntimeError("Server registration failed.")

    except requests.ConnectionError:
        logger.error("Cannot reach gateway for registration.")
        raise


# =============================================================================
# One Check-In Cycle
# =============================================================================

def run_checkin_cycle() -> None:
    """
    Executes one full Probe → Sign → Submit cycle:
      A. Get public IP
      B. Measure RTT to NITA Verifier Node
      C. Build signed payload
      D. Submit to blockchain via gateway
    """
    logger.info("=" * 60)
    logger.info("Starting check-in cycle")
    logger.info("=" * 60)

    try:
        # A — Public IP
        public_ip = get_public_ip()

        # B — RTT
        rtt_ms = measure_rtt_ms()

        # C — Sign
        payload = build_signed_payload(public_ip, rtt_ms)

        # D — Submit
        result = submit_checkin(payload)

        logger.info(f"Check-in cycle complete. Status: {result.get('status', 'UNKNOWN')}")
        return result

    except Exception as e:
        logger.error(f"Check-in cycle failed: {e}")
        raise


# =============================================================================
# First-Run Setup
# =============================================================================

def first_run_setup() -> None:
    """
    Handles first-run initialisation:
      1. Generates ECDSA key pair if not present
      2. Registers the server on the blockchain
    """
    if not key_manager.keys_exist(config.PRIVATE_KEY_PATH, config.PUBLIC_KEY_PATH):
        logger.info("No keys found — generating new ECDSA P-256 key pair...")
        key_manager.generate_key_pair(config.PRIVATE_KEY_PATH, config.PUBLIC_KEY_PATH)
        logger.info("Keys generated. Registering server on blockchain...")
        register_server()
    else:
        logger.info("Keys found. Server already initialised.")


# =============================================================================
# CLI Entry Point
# =============================================================================

def parse_args():
    parser = argparse.ArgumentParser(
        description="B-DRVS Probing Agent — Health Server Location Verifier"
    )
    parser.add_argument(
        "--loop",
        action="store_true",
        help=f"Run continuously every {config.CHECK_IN_INTERVAL_SEC}s (default: run once)"
    )
    parser.add_argument(
        "--register",
        action="store_true",
        help="Run first-time setup (key generation + server registration) then exit"
    )
    parser.add_argument(
        "--test-signing",
        action="store_true",
        help="Test key generation and payload signing without network calls"
    )
    return parser.parse_args()


def test_signing_only() -> None:
    """
    Offline test: generates keys and signs a dummy payload.
    Used to verify the signing logic works before the gateway is running.
    """
    logger.info("=== Offline Signing Test ===")

    test_private = "./keys/test_private.pem"
    test_public  = "./keys/test_public.pem"

    key_manager.generate_key_pair(test_private, test_public)

    dummy_ip  = "41.57.10.5"
    dummy_rtt = 12.3456
    dummy_ts  = "2026-05-12T12:00:00Z"
    canonical = f"{config.SERVER_ID}|{dummy_ip}|{dummy_rtt:.4f}|{dummy_ts}"

    private_key = key_manager.load_private_key(test_private)
    signature   = key_manager.sign_payload(private_key, canonical)

    logger.info(f"Canonical string : {canonical}")
    logger.info(f"Signature (b64)  : {signature[:40]}...")
    logger.info(f"Public key PEM   :\n{key_manager.load_public_key_pem(test_public)}")

    test_payload = {
        "serverID":  config.SERVER_ID,
        "publicIP":  dummy_ip,
        "rttMs":     dummy_rtt,
        "timestamp": dummy_ts,
        "signature": signature
    }

    logger.info("Test payload (ready for gateway submission):")
    print(json.dumps(test_payload, indent=2))
    logger.info("✅ Signing test passed. Keys and signing logic are correct.")


if __name__ == "__main__":
    args = parse_args()

    if args.test_signing:
        test_signing_only()
        sys.exit(0)

    if args.register:
        first_run_setup()
        sys.exit(0)

    # Normal operation — setup then run
    first_run_setup()

    if args.loop:
        logger.info(
            f"Starting continuous mode — check-in every "
            f"{config.CHECK_IN_INTERVAL_SEC}s"
        )
        while True:
            try:
                run_checkin_cycle()
            except Exception as e:
                logger.error(f"Cycle failed, will retry next interval: {e}")
            logger.info(f"Sleeping {config.CHECK_IN_INTERVAL_SEC}s until next cycle...")
            time.sleep(config.CHECK_IN_INTERVAL_SEC)
    else:
        # Single run
        run_checkin_cycle()
