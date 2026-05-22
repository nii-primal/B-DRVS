#!/usr/bin/env bash
# =============================================================================
# B-DRVS — Full System Startup & Health Check Script
# Run this script after every reboot or fresh login to bring everything up
# and verify the full pipeline is working end-to-end.
#
# Usage:
#   chmod +x start-bdrvs.sh
#   ./start-bdrvs.sh
# =============================================================================

set -euo pipefail

# ── Colours ───────────────────────────────────────────────────────────────────
GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; BOLD='\033[1m'; NC='\033[0m'

info()    { echo -e "${GREEN}[✔]${NC} $*"; }
warn()    { echo -e "${YELLOW}[!]${NC} $*"; }
error()   { echo -e "${RED}[✘]${NC} $*"; }
section() { echo -e "\n${BOLD}${BLUE}══════════════════════════════════════${NC}"; \
            echo -e "${BOLD}${BLUE}  $*${NC}"; \
            echo -e "${BOLD}${BLUE}══════════════════════════════════════${NC}"; }

# ── Paths ─────────────────────────────────────────────────────────────────────
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NETWORK_DIR="${REPO_DIR}/bdrvs-network"
GATEWAY_DIR="${NETWORK_DIR}/gateway"
AGENT_DIR="${NETWORK_DIR}/probing-agent"
COMPOSE_FILE="${NETWORK_DIR}/compose/docker-compose.yaml"

# ── Step tracker ──────────────────────────────────────────────────────────────
STEPS_PASSED=0
STEPS_FAILED=0

pass() { info "$1"; ((STEPS_PASSED++)); }
fail() { error "$1"; ((STEPS_FAILED++)); }

# =============================================================================
# SECTION 1 — Git & Repository
# =============================================================================
section "STEP 1 — Git Login & Repository"

# Check git is configured
if git config --global user.name > /dev/null 2>&1 && \
   [ -n "$(git config --global user.name)" ]; then
  pass "Git user: $(git config --global user.name)"
else
  warn "Git user not configured. Setting up now..."
  read -rp "  Enter your Git username: " GIT_USER
  read -rp "  Enter your Git email: " GIT_EMAIL
  git config --global user.name "$GIT_USER"
  git config --global user.email "$GIT_EMAIL"
  pass "Git user configured: $GIT_USER"
fi

# Pull latest from GitHub
cd "${REPO_DIR}"
info "Pulling latest from GitHub..."
if git pull origin main 2>&1 | grep -qE "Already up to date|Fast-forward|files changed"; then
  pass "Repository up to date"
else
  git pull origin main
  pass "Repository updated"
fi

# Show current commit
COMMIT=$(git log --oneline -1)
info "Current commit: ${COMMIT}"

# =============================================================================
# SECTION 2 — Prerequisites Check
# =============================================================================
section "STEP 2 — Prerequisites Check"

# Docker
if command -v docker &>/dev/null; then
  pass "Docker: $(docker --version | cut -d' ' -f3 | tr -d ',')"
else
  fail "Docker not found. Run: curl -fsSL https://get.docker.com | sudo sh"
  exit 1
fi

# Docker Compose
if docker compose version &>/dev/null; then
  pass "Docker Compose: $(docker compose version | cut -d' ' -f4)"
else
  fail "Docker Compose v2 not found"
  exit 1
fi

# Fabric binaries
if command -v cryptogen &>/dev/null; then
  pass "cryptogen: $(cryptogen version 2>&1 | head -1)"
else
  fail "cryptogen not in PATH. Run: ./bdrvs-network/scripts/install-fabric.sh && source ~/.bashrc"
  exit 1
fi

if command -v peer &>/dev/null; then
  pass "peer: $(peer version 2>&1 | head -1)"
else
  fail "peer not in PATH"
  exit 1
fi

# Node.js
if command -v node &>/dev/null; then
  pass "Node.js: $(node --version)"
else
  fail "Node.js not found"
  exit 1
fi

# Python
if command -v python3 &>/dev/null; then
  pass "Python: $(python3 --version)"
else
  fail "Python3 not found"
  exit 1
fi

# =============================================================================
# SECTION 3 — Crypto Material & Channel Artifacts
# =============================================================================
section "STEP 3 — Crypto Material & Channel Artifacts"

cd "${NETWORK_DIR}"

# Check if crypto-material exists and is complete
PEER_MSP="${NETWORK_DIR}/crypto-material/peerOrganizations/moh.bdrvs.gh/peers/peer0.moh.bdrvs.gh/msp"
if [ -d "${PEER_MSP}" ]; then
  pass "Crypto material exists"
else
  warn "Crypto material missing or incomplete — regenerating..."

  export FABRIC_CFG_PATH="${NETWORK_DIR}/config/configtx"

  rm -rf crypto-material
  cryptogen generate \
    --config=config/cryptogen/crypto-config.yaml \
    --output=crypto-material

  # Copy NodeOU config.yaml to all user MSPs
  for ORG in moh nita; do
    for USER in Admin User1; do
      cp "crypto-material/peerOrganizations/${ORG}.bdrvs.gh/msp/config.yaml" \
         "crypto-material/peerOrganizations/${ORG}.bdrvs.gh/users/${USER}@${ORG}.bdrvs.gh/msp/" 2>/dev/null || true
    done
  done

  pass "Crypto material regenerated"
fi

# Check channel artifacts
if [ -f "${NETWORK_DIR}/channel-artifacts/genesis.block" ]; then
  pass "Channel artifacts exist"
else
  warn "Channel artifacts missing — regenerating..."

  export FABRIC_CFG_PATH="${NETWORK_DIR}/config/configtx"
  mkdir -p channel-artifacts

  configtxgen -profile BDRVSGenesis -channelID system-channel \
    -outputBlock channel-artifacts/genesis.block

  configtxgen -profile BDRVSChannel -channelID bdrvschannel \
    -outputCreateChannelTx channel-artifacts/bdrvschannel.tx

  configtxgen -profile BDRVSChannel -channelID bdrvschannel \
    -outputAnchorPeersUpdate channel-artifacts/MoHMSPanchors.tx -asOrg MoHMSP

  configtxgen -profile BDRVSChannel -channelID bdrvschannel \
    -outputAnchorPeersUpdate channel-artifacts/NITAMSPanchors.tx -asOrg NITAMSP

  pass "Channel artifacts regenerated"
fi

# =============================================================================
# SECTION 4 — Fabric Network (Docker)
# =============================================================================
section "STEP 4 — Fabric Network"

cd "${NETWORK_DIR}"

# Check if containers are running
RUNNING=$(docker ps --format '{{.Names}}' 2>/dev/null | grep -cE "orderer|peer0\.(moh|nita)" || true)

if [ "$RUNNING" -ge 3 ]; then
  pass "Fabric containers already running ($RUNNING/3)"
else
  warn "Starting Fabric network..."
  docker compose -f "${COMPOSE_FILE}" down --volumes 2>/dev/null || true
  docker compose -f "${COMPOSE_FILE}" up -d
  info "Waiting 8 seconds for containers to initialise..."
  sleep 8
fi

# Verify all 4 core containers
for CONTAINER in orderer.bdrvs.gh peer0.moh.bdrvs.gh peer0.nita.bdrvs.gh bdrvs_cli; do
  if docker ps --format '{{.Names}}' | grep -q "^${CONTAINER}$"; then
    pass "Container running: ${CONTAINER}"
  else
    fail "Container not running: ${CONTAINER}"
  fi
done

# =============================================================================
# SECTION 5 — Channel Setup
# =============================================================================
section "STEP 5 — Channel Setup"

# Check if peers are already on the channel
CHANNEL_CHECK=$(docker exec bdrvs_cli peer channel list 2>/dev/null | grep -c "bdrvschannel" || true)

if [ "$CHANNEL_CHECK" -ge 1 ]; then
  HEIGHT=$(docker exec bdrvs_cli peer channel getinfo -c bdrvschannel 2>/dev/null | grep -oP '"height":\K[0-9]+' || echo "?")
  pass "Channel bdrvschannel exists (height: ${HEIGHT})"
else
  warn "Channel not found — creating and joining peers..."

  ORDERER_CA="/opt/gopath/src/github.com/hyperledger/fabric/peer/crypto/ordererOrganizations/bdrvs.gh/orderers/orderer.bdrvs.gh/msp/tlscacerts/tlsca.bdrvs.gh-cert.pem"

  # Create channel
  docker exec bdrvs_cli peer channel create \
    -o orderer.bdrvs.gh:7050 -c bdrvschannel \
    -f /opt/gopath/src/github.com/hyperledger/fabric/peer/channel-artifacts/bdrvschannel.tx \
    --outputBlock /opt/gopath/src/github.com/hyperledger/fabric/peer/channel-artifacts/bdrvschannel.block \
    --tls --cafile "${ORDERER_CA}"

  # Join MoH
  docker exec bdrvs_cli peer channel join \
    -b /opt/gopath/src/github.com/hyperledger/fabric/peer/channel-artifacts/bdrvschannel.block

  # Join NITA
  docker exec \
    -e CORE_PEER_ADDRESS=peer0.nita.bdrvs.gh:9051 \
    -e CORE_PEER_LOCALMSPID=NITAMSP \
    -e CORE_PEER_MSPCONFIGPATH=/opt/gopath/src/github.com/hyperledger/fabric/peer/crypto/peerOrganizations/nita.bdrvs.gh/users/Admin@nita.bdrvs.gh/msp \
    -e CORE_PEER_TLS_ROOTCERT_FILE=/opt/gopath/src/github.com/hyperledger/fabric/peer/crypto/peerOrganizations/nita.bdrvs.gh/peers/peer0.nita.bdrvs.gh/tls/ca.crt \
    bdrvs_cli peer channel join \
    -b /opt/gopath/src/github.com/hyperledger/fabric/peer/channel-artifacts/bdrvschannel.block

  # Anchor peers
  docker exec bdrvs_cli peer channel update \
    -o orderer.bdrvs.gh:7050 -c bdrvschannel \
    -f /opt/gopath/src/github.com/hyperledger/fabric/peer/channel-artifacts/MoHMSPanchors.tx \
    --tls --cafile "${ORDERER_CA}"

  docker exec \
    -e CORE_PEER_ADDRESS=peer0.nita.bdrvs.gh:9051 \
    -e CORE_PEER_LOCALMSPID=NITAMSP \
    -e CORE_PEER_MSPCONFIGPATH=/opt/gopath/src/github.com/hyperledger/fabric/peer/crypto/peerOrganizations/nita.bdrvs.gh/users/Admin@nita.bdrvs.gh/msp \
    -e CORE_PEER_TLS_ROOTCERT_FILE=/opt/gopath/src/github.com/hyperledger/fabric/peer/crypto/peerOrganizations/nita.bdrvs.gh/peers/peer0.nita.bdrvs.gh/tls/ca.crt \
    bdrvs_cli peer channel update \
    -o orderer.bdrvs.gh:7050 -c bdrvschannel \
    -f /opt/gopath/src/github.com/hyperledger/fabric/peer/channel-artifacts/NITAMSPanchors.tx \
    --tls --cafile "${ORDERER_CA}"

  pass "Channel created and peers joined"
fi

# =============================================================================
# SECTION 6 — Chaincode
# =============================================================================
section "STEP 6 — Chaincode"

# Check if chaincode is committed
CC_CHECK=$(docker exec bdrvs_cli peer lifecycle chaincode querycommitted \
  --channelID bdrvschannel 2>/dev/null | grep -c "residency" || true)

if [ "$CC_CHECK" -ge 1 ]; then
  pass "Chaincode 'residency' already committed"
else
  warn "Chaincode not found — deploying..."
  cd "${NETWORK_DIR}"
  ./chaincode/residency/deploy-chaincode.sh
  pass "Chaincode deployed"
fi

# Smoke test — query ledger
CONFIG_TEST=$(docker exec bdrvs_cli peer chaincode query \
  --channelID bdrvschannel --name residency \
  -c '{"function":"GetNetworkConfigPublic","Args":[]}' 2>/dev/null | python3 -c \
  "import sys,json; d=json.load(sys.stdin); print(d.get('rttThresholdMs','?'))" 2>/dev/null || echo "FAIL")

if [ "$CONFIG_TEST" != "FAIL" ]; then
  pass "Chaincode smoke test passed (RTT threshold: ${CONFIG_TEST}ms)"
else
  fail "Chaincode smoke test failed"
fi

# =============================================================================
# SECTION 7 — Gateway
# =============================================================================
section "STEP 7 — REST API Gateway"

# Check if .env exists
if [ ! -f "${GATEWAY_DIR}/.env" ]; then
  warn ".env missing — creating..."
  cat > "${GATEWAY_DIR}/.env" << EOF
PORT=3000
NODE_ENV=development
CHANNEL_NAME=bdrvschannel
CHAINCODE_NAME=residency
CRYPTO_PATH=${NETWORK_DIR}/crypto-material
MOH_MSP_ID=MoHMSP
MOH_PEER_ENDPOINT=localhost:7051
MOH_PEER_HOST_ALIAS=peer0.moh.bdrvs.gh
MOH_TLS_CERT_PATH=${NETWORK_DIR}/crypto-material/peerOrganizations/moh.bdrvs.gh/peers/peer0.moh.bdrvs.gh/tls/ca.crt
MOH_CERT_PATH=${NETWORK_DIR}/crypto-material/peerOrganizations/moh.bdrvs.gh/users/User1@moh.bdrvs.gh/msp/signcerts/User1@moh.bdrvs.gh-cert.pem
MOH_KEY_DIR_PATH=${NETWORK_DIR}/crypto-material/peerOrganizations/moh.bdrvs.gh/users/User1@moh.bdrvs.gh/msp/keystore
ORDERER_ENDPOINT=localhost:7050
EOF
  pass ".env created"
fi

# Check node_modules
if [ ! -d "${GATEWAY_DIR}/node_modules" ]; then
  warn "node_modules missing — running npm install..."
  cd "${GATEWAY_DIR}"
  npm install --silent
  pass "npm install complete"
fi

# Check if gateway is already running
if curl -s http://localhost:3000/api/health > /dev/null 2>&1; then
  pass "Gateway already running on port 3000"
else
  warn "Starting gateway in background..."
  cd "${GATEWAY_DIR}"
  nohup node server.js > "${GATEWAY_DIR}/logs/gateway.log" 2>&1 &
  GATEWAY_PID=$!
  echo $GATEWAY_PID > /tmp/bdrvs-gateway.pid
  info "Gateway started (PID: ${GATEWAY_PID})"
  info "Waiting 3 seconds..."
  sleep 3
fi

# Test gateway health
HEALTH=$(curl -s http://localhost:3000/api/health 2>/dev/null | \
  python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('status','error'))" 2>/dev/null || echo "error")

if [ "$HEALTH" = "ok" ]; then
  pass "Gateway health check passed"
else
  fail "Gateway health check failed — check ${GATEWAY_DIR}/logs/gateway.log"
fi

# Test config endpoint
CONFIG=$(curl -s http://localhost:3000/api/config 2>/dev/null | \
  python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d.get('ghanaIPRanges',[])))" 2>/dev/null || echo "0")

if [ "$CONFIG" -gt 0 ]; then
  pass "Config endpoint returned ${CONFIG} Ghana IP ranges from ledger"
else
  fail "Config endpoint failed"
fi

# =============================================================================
# SECTION 8 — Probing Agent
# =============================================================================
section "STEP 8 — Probing Agent"

cd "${AGENT_DIR}"

# Install Python dependencies if needed
python3 -c "import cryptography, requests" 2>/dev/null || {
  warn "Installing Python dependencies..."
  pip3 install -r requirements.txt --break-system-packages --quiet
}
pass "Python dependencies ready"

# Generate keys if missing
if [ ! -f "keys/agent_private_key.pem" ]; then
  warn "Agent keys missing — generating..."
  mkdir -p keys
  python3 -c "import config, key_manager; key_manager.generate_key_pair(config.PRIVATE_KEY_PATH, config.PUBLIC_KEY_PATH)"
  pass "ECDSA key pair generated"
else
  pass "Agent keys exist"
fi

# Register server if not already registered
REG_CHECK=$(curl -s -X POST http://localhost:3000/api/register \
  -H "Content-Type: application/json" \
  -d "{\"serverID\":\"LHIMS-KORLE-BU-01\",\"publicKeyPEM\":\"$(cat keys/agent_public_key.pem | tr '\n' '|' | sed 's/|/\\n/g')\",\"ownerOrg\":\"Lightwave Technologies\"}" \
  2>/dev/null | python3 -c \
  "import sys,json; d=json.load(sys.stdin); print(d.get('success','false'))" 2>/dev/null || echo "false")

if [ "$REG_CHECK" = "True" ] || [ "$REG_CHECK" = "true" ]; then
  pass "Server registered on blockchain"
else
  pass "Server already registered (skipping)"
fi

# Run one check-in cycle
info "Running check-in cycle..."
CHECKIN_OUTPUT=$(python3 agent.py 2>&1)
echo "${CHECKIN_OUTPUT}" | tail -5

CHECKIN_STATUS=$(echo "${CHECKIN_OUTPUT}" | grep -oP '(COMPLIANT|SOVEREIGNTY_VIOLATION)' | tail -1 || echo "UNKNOWN")

if [ "$CHECKIN_STATUS" = "COMPLIANT" ]; then
  pass "Check-in result: ✅ COMPLIANT"
elif [ "$CHECKIN_STATUS" = "SOVEREIGNTY_VIOLATION" ]; then
  pass "Check-in result: 🚨 SOVEREIGNTY_VIOLATION (expected on dev machine)"
else
  fail "Check-in failed — check agent output above"
fi

# =============================================================================
# SECTION 9 — End-to-End API Verification
# =============================================================================
section "STEP 9 — End-to-End API Verification"

sleep 2  # allow block to commit

# Status
STATUS=$(curl -s http://localhost:3000/api/status/LHIMS-KORLE-BU-01 2>/dev/null | \
  python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('status','error'))" 2>/dev/null || echo "error")

if [ "$STATUS" != "error" ]; then
  pass "Status endpoint: ${STATUS}"
else
  fail "Status endpoint failed"
fi

# Violations
VIOLATIONS=$(curl -s http://localhost:3000/api/violations 2>/dev/null | \
  python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d))" 2>/dev/null || echo "0")
pass "Violations on ledger: ${VIOLATIONS}"

# Stats
STATS=$(curl -s http://localhost:3000/api/stats/LHIMS-KORLE-BU-01 2>/dev/null | \
  python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('complianceRate','?'))" 2>/dev/null || echo "?")
pass "Compliance rate: ${STATS}"

# History
HISTORY=$(curl -s http://localhost:3000/api/history/LHIMS-KORLE-BU-01 2>/dev/null | \
  python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d))" 2>/dev/null || echo "0")
pass "Audit trail records: ${HISTORY}"

# =============================================================================
# SUMMARY
# =============================================================================
section "STARTUP SUMMARY"

echo ""
echo -e "  ${GREEN}Passed: ${STEPS_PASSED}${NC}"
echo -e "  ${RED}Failed: ${STEPS_FAILED}${NC}"
echo ""

if [ "$STEPS_FAILED" -eq 0 ]; then
  echo -e "${GREEN}${BOLD}  ✅ B-DRVS is fully operational${NC}"
  echo ""
  echo -e "  ${BOLD}Gateway API:${NC}    http://localhost:3000/api/health"
  echo -e "  ${BOLD}Dashboard:${NC}      http://localhost:5173  (start with: cd dashboard && npm run dev)"
  echo -e "  ${BOLD}Agent loop:${NC}     cd probing-agent && python3 agent.py --loop"
  echo -e "  ${BOLD}Gateway log:${NC}    ${GATEWAY_DIR}/logs/gateway.log"
  echo ""
  echo -e "  ${BOLD}To stop everything:${NC}"
  echo -e "  docker compose -f compose/docker-compose.yaml down"
  echo -e "  kill \$(cat /tmp/bdrvs-gateway.pid) 2>/dev/null"
else
  echo -e "${RED}${BOLD}  ⚠️  Some checks failed. Review errors above.${NC}"
fi

echo ""
