# =============================================================================
# B-DRVS Probing Agent — Configuration
# Edit these values to match your deployment environment
# =============================================================================

# ── Server Identity ───────────────────────────────────────────────────────────
SERVER_ID = "LHIMS-KORLE-BU-01"       # Unique ID for this health server
OWNER_ORG = "Lightwave Technologies"  # Vendor organisation name

# ── NITA Verifier Node ────────────────────────────────────────────────────────
# The government-controlled reference point used for RTT measurement.
# In production this is NITA's data centre in Accra.
# For local testing, use the IP of any container on the same Docker network.
VERIFIER_HOST = "localhost"   # hostname or IP
VERIFIER_PORT = 9051                     # port to probe for RTT measurement
VERIFIER_PING_COUNT = 5                  # number of RTT samples to average

# ── RTT Threshold ─────────────────────────────────────────────────────────────
# Must match the value stored in the smart contract (default 50ms).
RTT_THRESHOLD_MS = 50.0

# ── REST API Gateway ──────────────────────────────────────────────────────────
# The Node.js/Express backend that bridges the agent to Hyperledger Fabric.
# Phase 4 will start this service; for now we also support direct fabric-sdk
# submission via the gateway container.
GATEWAY_URL = "http://localhost:3000/api/checkin"
GATEWAY_TIMEOUT_SEC = 10

# ── Key Storage ───────────────────────────────────────────────────────────────
# ECDSA P-256 private key — generated once on first run, never transmitted.
# Keep this file secure; it is the agent's cryptographic identity.
PRIVATE_KEY_PATH = "./keys/agent_private_key.pem"
PUBLIC_KEY_PATH  = "./keys/agent_public_key.pem"

# ── Public IP Lookup ──────────────────────────────────────────────────────────
# External services used to discover the server's public IP.
# Multiple services are tried in order for redundancy.
IP_LOOKUP_SERVICES = [
    "https://api.ipify.org",
    "https://ifconfig.me/ip",
    "https://icanhazip.com",
]
IP_LOOKUP_TIMEOUT_SEC = 5

# ── Scheduling ────────────────────────────────────────────────────────────────
# How often (in seconds) the agent submits a check-in to the blockchain.
# Default: 3600 seconds = 1 hour
# Use a smaller value (e.g. 60) for testing
CHECK_IN_INTERVAL_SEC = 3600

# ── Logging ───────────────────────────────────────────────────────────────────
LOG_FILE = "./logs/agent.log"
LOG_LEVEL = "INFO"    # DEBUG | INFO | WARNING | ERROR
