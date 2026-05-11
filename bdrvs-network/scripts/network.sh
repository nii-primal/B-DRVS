#!/usr/bin/env bash
# =============================================================================
# B-DRVS Network Manager — network.sh
# Usage:
#   ./network.sh up          — generate certs, genesis block, start containers
#   ./network.sh channel     — create bdrvschannel and join both peers
#   ./network.sh down         — stop and clean all containers + artefacts
#   ./network.sh restart      — down then up
# Prerequisites (install order matters):
#   1. Docker >= 24 & Docker Compose v2
#   2. Hyperledger Fabric binaries 2.5 in PATH  (run install-fabric.sh first)
#   3. Go 1.21+  (for chaincode)
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NETWORK_DIR="$(dirname "$SCRIPT_DIR")"   # bdrvs-network/
COMPOSE_DIR="${NETWORK_DIR}/compose"
CONFIG_DIR="${NETWORK_DIR}/config"
CRYPTO_DIR="${NETWORK_DIR}/crypto-material"
CHANNEL_ARTIFACTS="${NETWORK_DIR}/channel-artifacts"

CHANNEL_NAME="bdrvschannel"
FABRIC_CFG_PATH="${CONFIG_DIR}/configtx"
export FABRIC_CFG_PATH

ORDERER_CA="${CRYPTO_DIR}/ordererOrganizations/bdrvs.gh/orderers/orderer.bdrvs.gh/msp/tlscacerts/tlsca.bdrvs.gh-cert.pem"
MOH_ADMIN_MSP="${CRYPTO_DIR}/peerOrganizations/moh.bdrvs.gh/users/Admin@moh.bdrvs.gh/msp"
NITA_ADMIN_MSP="${CRYPTO_DIR}/peerOrganizations/nita.bdrvs.gh/users/Admin@nita.bdrvs.gh/msp"

# ── Colour helpers ─────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
info()  { echo -e "${GREEN}[B-DRVS]${NC} $*"; }
warn()  { echo -e "${YELLOW}[WARN] ${NC} $*"; }
error() { echo -e "${RED}[ERROR]${NC} $*" >&2; exit 1; }

# ── Prerequisite check ─────────────────────────────────────────────────────────
check_prereqs() {
  info "Checking prerequisites..."
  command -v docker        >/dev/null 2>&1 || error "Docker not found. Install from https://docs.docker.com/engine/install/"
  command -v docker        >/dev/null 2>&1 && docker compose version >/dev/null 2>&1 || error "Docker Compose v2 not found."
  command -v cryptogen     >/dev/null 2>&1 || error "cryptogen not in PATH. Run ./scripts/install-fabric.sh first."
  command -v configtxgen   >/dev/null 2>&1 || error "configtxgen not in PATH. Run ./scripts/install-fabric.sh first."
  command -v peer          >/dev/null 2>&1 || error "peer binary not in PATH. Run ./scripts/install-fabric.sh first."
  info "All prerequisites satisfied."
}

# ── Step 1: Generate crypto material ──────────────────────────────────────────
generate_crypto() {
  info "Generating crypto material with cryptogen..."
  rm -rf "${CRYPTO_DIR}"
  cryptogen generate \
    --config="${CONFIG_DIR}/cryptogen/crypto-config.yaml" \
    --output="${CRYPTO_DIR}"
  info "Crypto material written to ${CRYPTO_DIR}"
}

# ── Step 2: Generate channel artefacts ────────────────────────────────────────
generate_channel_artifacts() {
  info "Generating channel artefacts..."
  mkdir -p "${CHANNEL_ARTIFACTS}"

  # System channel genesis block
  configtxgen \
    -profile BDRVSGenesis \
    -channelID system-channel \
    -outputBlock "${CHANNEL_ARTIFACTS}/genesis.block"

  # Channel creation transaction
  configtxgen \
    -profile BDRVSChannel \
    -outputCreateChannelTx "${CHANNEL_ARTIFACTS}/${CHANNEL_NAME}.tx" \
    -channelID "${CHANNEL_NAME}"

  # Anchor peer updates
  configtxgen \
    -profile BDRVSChannel \
    -outputAnchorPeersUpdate "${CHANNEL_ARTIFACTS}/MoHMSPanchors.tx" \
    -channelID "${CHANNEL_NAME}" \
    -asOrg MoHMSP

  configtxgen \
    -profile BDRVSChannel \
    -outputAnchorPeersUpdate "${CHANNEL_ARTIFACTS}/NITAMSPanchors.tx" \
    -channelID "${CHANNEL_NAME}" \
    -asOrg NITAMSP

  info "Channel artefacts written to ${CHANNEL_ARTIFACTS}"
}

# ── Step 3: Start containers ───────────────────────────────────────────────────
start_network() {
  info "Starting Docker containers..."
  docker compose -f "${COMPOSE_DIR}/docker-compose.yaml" up -d
  sleep 5   # wait for peers to initialise
  info "Containers running:"
  docker compose -f "${COMPOSE_DIR}/docker-compose.yaml" ps
}

# ── Step 4: Create channel and join peers ─────────────────────────────────────
create_channel() {
  info "Creating channel '${CHANNEL_NAME}'..."

  # Create channel (via MoH Admin context)
  docker exec bdrvs_cli peer channel create \
    -o orderer.bdrvs.gh:7050 \
    -c "${CHANNEL_NAME}" \
    -f "/opt/gopath/src/github.com/hyperledger/fabric/peer/channel-artifacts/${CHANNEL_NAME}.tx" \
    --outputBlock "/opt/gopath/src/github.com/hyperledger/fabric/peer/channel-artifacts/${CHANNEL_NAME}.block" \
    --tls \
    --cafile "/opt/gopath/src/github.com/hyperledger/fabric/peer/crypto/ordererOrganizations/bdrvs.gh/orderers/orderer.bdrvs.gh/msp/tlscacerts/tlsca.bdrvs.gh-cert.pem"

  info "Channel created. Joining peer0.moh..."
  docker exec bdrvs_cli peer channel join \
    -b "/opt/gopath/src/github.com/hyperledger/fabric/peer/channel-artifacts/${CHANNEL_NAME}.block"

  info "Joining peer0.nita..."
  docker exec -e CORE_PEER_ADDRESS=peer0.nita.bdrvs.gh:9051 \
              -e CORE_PEER_LOCALMSPID=NITAMSP \
              -e CORE_PEER_MSPCONFIGPATH="/opt/gopath/src/github.com/hyperledger/fabric/peer/crypto/peerOrganizations/nita.bdrvs.gh/users/Admin@nita.bdrvs.gh/msp" \
              -e CORE_PEER_TLS_ROOTCERT_FILE="/opt/gopath/src/github.com/hyperledger/fabric/peer/crypto/peerOrganizations/nita.bdrvs.gh/peers/peer0.nita.bdrvs.gh/tls/ca.crt" \
    bdrvs_cli peer channel join \
    -b "/opt/gopath/src/github.com/hyperledger/fabric/peer/channel-artifacts/${CHANNEL_NAME}.block"

  info "Updating anchor peers..."
  # MoH anchor
  docker exec bdrvs_cli peer channel update \
    -o orderer.bdrvs.gh:7050 \
    -c "${CHANNEL_NAME}" \
    -f "/opt/gopath/src/github.com/hyperledger/fabric/peer/channel-artifacts/MoHMSPanchors.tx" \
    --tls \
    --cafile "/opt/gopath/src/github.com/hyperledger/fabric/peer/crypto/ordererOrganizations/bdrvs.gh/orderers/orderer.bdrvs.gh/msp/tlscacerts/tlsca.bdrvs.gh-cert.pem"

  # NITA anchor
  docker exec -e CORE_PEER_ADDRESS=peer0.nita.bdrvs.gh:9051 \
              -e CORE_PEER_LOCALMSPID=NITAMSP \
              -e CORE_PEER_MSPCONFIGPATH="/opt/gopath/src/github.com/hyperledger/fabric/peer/crypto/peerOrganizations/nita.bdrvs.gh/users/Admin@nita.bdrvs.gh/msp" \
              -e CORE_PEER_TLS_ROOTCERT_FILE="/opt/gopath/src/github.com/hyperledger/fabric/peer/crypto/peerOrganizations/nita.bdrvs.gh/peers/peer0.nita.bdrvs.gh/tls/ca.crt" \
    bdrvs_cli peer channel update \
    -o orderer.bdrvs.gh:7050 \
    -c "${CHANNEL_NAME}" \
    -f "/opt/gopath/src/github.com/hyperledger/fabric/peer/channel-artifacts/NITAMSPanchors.tx" \
    --tls \
    --cafile "/opt/gopath/src/github.com/hyperledger/fabric/peer/crypto/ordererOrganizations/bdrvs.gh/orderers/orderer.bdrvs.gh/msp/tlscacerts/tlsca.bdrvs.gh-cert.pem"

  info "Both peers joined '${CHANNEL_NAME}' and anchor peers updated."
}

# ── Teardown ───────────────────────────────────────────────────────────────────
teardown() {
  warn "Tearing down B-DRVS network..."
  docker compose -f "${COMPOSE_DIR}/docker-compose.yaml" down --volumes --remove-orphans 2>/dev/null || true
  # Remove chaincode images built during testing
  docker images | grep "bdrvs_residency" | awk '{print $3}' | xargs docker rmi -f 2>/dev/null || true
  rm -rf "${CRYPTO_DIR}" "${CHANNEL_ARTIFACTS}"
  info "Network torn down and artefacts removed."
}

# ── Main dispatcher ────────────────────────────────────────────────────────────
case "${1:-help}" in
  up)
    check_prereqs
    generate_crypto
    generate_channel_artifacts
    start_network
    info "Network is UP. Run './network.sh channel' to create bdrvschannel."
    ;;
  channel)
    create_channel
    ;;
  down)
    teardown
    ;;
  restart)
    teardown
    check_prereqs
    generate_crypto
    generate_channel_artifacts
    start_network
    create_channel
    ;;
  status)
    docker compose -f "${COMPOSE_DIR}/docker-compose.yaml" ps
    ;;
  *)
    echo "Usage: $0 {up|channel|down|restart|status}"
    exit 1
    ;;
esac
