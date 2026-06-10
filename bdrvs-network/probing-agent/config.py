# =============================================================================
# B-DRVS Probing Agent — Configuration
# Edit these values to match your deployment environment.
#
# DEPLOYMENT NOTE — VERIFIER_HOST:
#   The RTT measurement is only meaningful when VERIFIER_HOST points to a
#   genuine remote endpoint hosted at a fixed government facility inside Ghana
#   (e.g. NITA's data centre in Accra). A server physically located in Ghana
#   will consistently measure RTT below 50ms to this host; a server hosted
#   abroad will exceed it.
#
#   For local development and testing, VERIFIER_HOST is set to the NITA peer
#   container on the Docker network. RTT values in this mode will be near-zero
#   and do NOT reflect real geographic location — this is expected behaviour
#   for a prototype running on a single machine.
#
#   Production deployment requires:
#     1. A publicly reachable verifier endpoint at a Ghanaian data centre
#     2. VERIFIER_HOST set to that endpoint's IP or hostname
#     3. VERIFIER_PORT set to an open TCP port on that host (e.g. 443 or 80)
# =============================================================================

# ── Server Identity ───────────────────────────────────────────────────────────
SERVER_ID  = "LHIMS-KORLE-BU-01"   # Unique ID for this health server
OWNER_ORG  = "Demo Vendor Org"     # Vendor organisation name

# ── NITA Verifier Node ────────────────────────────────────────────────────────
# The government-controlled reference point used for RTT measurement.
#
# Development (default): points to the NITA peer container on the local
#   Docker network. RTT will be sub-millisecond — not geographically meaningful.
#
# Production: set to the IP of a fixed NITA-operated endpoint in Accra, e.g.:
#   VERIFIER_HOST = "196.6.10.1"   # hypothetical NITA Accra endpoint
#   VERIFIER_PORT = 443
VERIFIER_HOST       = "peer0.nita.bdrvs.gh"  # Docker service name (dev only)
VERIFIER_PORT       = 9051                    # open port on verifier host
VERIFIER_PING_COUNT = 5                       # RTT samples to average

# ── RTT Threshold ─────────────────────────────────────────────────────────────
# Must match the value stored in the smart contract (default 50ms).
# Based on measured intra-Accra TCP latency benchmarks; servers outside Ghana
# consistently exceed this threshold due to propagation distance.
RTT_THRESHOLD_MS = 50.0

# ── REST API Gateway ──────────────────────────────────────────────────────────
GATEWAY_URL         = "http://localhost:3000/api/checkin"
GATEWAY_TIMEOUT_SEC = 10

# ── Key Storage ───────────────────────────────────────────────────────────────
# ECDSA P-256 private key — generated once on first run, never transmitted.
# Keep this file secure; it is the agent's cryptographic identity.
PRIVATE_KEY_PATH = "./keys/agent_private_key.pem"
PUBLIC_KEY_PATH  = "./keys/agent_public_key.pem"

# ── Public IP Lookup ──────────────────────────────────────────────────────────
IP_LOOKUP_SERVICES = [
    "https://api.ipify.org",
    "https://ifconfig.me/ip",
    "https://icanhazip.com",
]
IP_LOOKUP_TIMEOUT_SEC = 5

# ── Scheduling ────────────────────────────────────────────────────────────────
# How often (in seconds) the agent submits a check-in to the blockchain.
# Default: 3600 (1 hour). Use 60 for testing.
CHECK_IN_INTERVAL_SEC = 3600

# ── Logging ───────────────────────────────────────────────────────────────────
LOG_FILE  = "./logs/agent.log"
LOG_LEVEL = "INFO"    # DEBUG | INFO | WARNING | ERROR
