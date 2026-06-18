# =============================================================================
# B-DRVS Government Verifier (NITA) — Configuration
# Edit these values for your environment. For a laptop demo the defaults work
# except OBSERVED_IP_OVERRIDE, which you flip to show COMPLIANT vs VIOLATION.
# =============================================================================

VERIFIER_ID       = "NITA-ACCRA-01"
VERIFIER_LOCATION = "Accra, Ghana"

# Verifier's own ECDSA key (generated on first --register, registered on-ledger)
VERIFIER_PRIVATE_KEY_PATH = "./keys/verifier_private.pem"
VERIFIER_PUBLIC_KEY_PATH  = "./keys/verifier_public.pem"

# Where the health server's challenge responder (verified_responder.py) listens
AGENT_HOST            = "localhost"
AGENT_PORT            = 8645
CHALLENGE_TIMEOUT_SEC = 10

# RTT is measured BY THE VERIFIER via TCP-handshake timing to the agent
# (independent of the agent's own processing time). Average of this many samples.
RTT_SAMPLES = 5

# Gateway routes (added to gateway/server.js — see next step)
GATEWAY_VERIFIED_CHECKIN_URL  = "http://localhost:3000/api/verified-checkin"
GATEWAY_REGISTER_VERIFIER_URL = "http://localhost:3000/api/register-verifier"
GATEWAY_TIMEOUT_SEC           = 30

CHECK_IN_INTERVAL_SEC = 3600
LOG_LEVEL             = "INFO"

# --- SIMULATION ONLY ---------------------------------------------------------
# On a single laptop the IP the verifier "sees" is 127.0.0.1, which is not a
# Ghana address, so every check-in would read as a violation for the wrong
# reason. Set this to inject the observed IP for demos — the same trick the
# self-report demo used with the 154.161.0.0/16 range.
#   COMPLIANT demo : a Ghana IP, e.g. "154.161.12.34"
#   VIOLATION demo : a foreign IP, e.g. "13.250.45.10"  (AWS Singapore)
# Set to None for a real deployment, where the verifier uses the agent's
# actual network address.
OBSERVED_IP_OVERRIDE = "13.250.45.10"
