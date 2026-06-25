#!/usr/bin/env bash
# =============================================================================
# deploy-chaincode.sh — Fabric 2.x Chaincode Lifecycle for B-DRVS
#
# Runs the full lifecycle:
#   1. go mod tidy      — resolve Go dependencies
#   2. package          — create .tar.gz package
#   3. install          — install on peer0.moh and peer0.nita
#   4. queryinstalled   — get package ID
#   5. approveformyorg  — approve for MoHMSP
#   6. approveformyorg  — approve for NITAMSP
#   7. checkcommitreadiness — confirm both orgs approved
#   8. commit           — commit to bdrvschannel
#   9. init             — call InitLedger
#  10. verify           — smoke test with GetNetworkConfigPublic
# =============================================================================

set -euo pipefail

NETWORK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CHAINCODE_DIR="${NETWORK_DIR}/chaincode/residency"
CHANNEL="bdrvschannel"
CC_NAME="residency"
CC_VERSION="1.1"
CC_SEQUENCE="2"
CC_LABEL="${CC_NAME}_${CC_VERSION}"

ORDERER_CA="/opt/gopath/src/github.com/hyperledger/fabric/peer/crypto/ordererOrganizations/bdrvs.gh/orderers/orderer.bdrvs.gh/msp/tlscacerts/tlsca.bdrvs.gh-cert.pem"
MOH_PEER="peer0.moh.bdrvs.gh:7051"
NITA_PEER="peer0.nita.bdrvs.gh:9051"
MOH_TLS_CA="/opt/gopath/src/github.com/hyperledger/fabric/peer/crypto/peerOrganizations/moh.bdrvs.gh/peers/peer0.moh.bdrvs.gh/tls/ca.crt"
NITA_TLS_CA="/opt/gopath/src/github.com/hyperledger/fabric/peer/crypto/peerOrganizations/nita.bdrvs.gh/peers/peer0.nita.bdrvs.gh/tls/ca.crt"
MOH_MSP="/opt/gopath/src/github.com/hyperledger/fabric/peer/crypto/peerOrganizations/moh.bdrvs.gh/users/Admin@moh.bdrvs.gh/msp"
NITA_MSP="/opt/gopath/src/github.com/hyperledger/fabric/peer/crypto/peerOrganizations/nita.bdrvs.gh/users/Admin@nita.bdrvs.gh/msp"

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
info()  { echo -e "${GREEN}[DEPLOY]${NC} $*"; }
warn()  { echo -e "${YELLOW}[WARN] ${NC} $*"; }

# ── Step 1: Resolve Go dependencies ───────────────────────────────────────────
info "Step 1: Running go mod tidy..."
cd "${CHAINCODE_DIR}"
go mod tidy
go mod vendor
cd "${NETWORK_DIR}"
info "Dependencies resolved."

# ── Step 2: Package the chaincode ─────────────────────────────────────────────
info "Step 2: Packaging chaincode '${CC_LABEL}'..."
docker exec bdrvs_cli peer lifecycle chaincode package \
  "/tmp/${CC_LABEL}.tar.gz" \
  --path "/opt/gopath/src/github.com/chaincode/residency" \
  --lang golang \
  --label "${CC_LABEL}"

# Copy package out of CLI container to host for reference
docker cp "bdrvs_cli:/tmp/${CC_LABEL}.tar.gz" "${NETWORK_DIR}/${CC_LABEL}.tar.gz"
info "Package created: ${CC_LABEL}.tar.gz"

# ── Step 3: Install on MoH peer ───────────────────────────────────────────────
info "Step 3a: Installing on peer0.moh..."
docker exec bdrvs_cli peer lifecycle chaincode install \
  "/tmp/${CC_LABEL}.tar.gz"

# ── Step 3b: Install on NITA peer ─────────────────────────────────────────────
info "Step 3b: Installing on peer0.nita..."
docker exec \
  -e CORE_PEER_ADDRESS="${NITA_PEER}" \
  -e CORE_PEER_LOCALMSPID=NITAMSP \
  -e CORE_PEER_MSPCONFIGPATH="${NITA_MSP}" \
  -e CORE_PEER_TLS_ROOTCERT_FILE="${NITA_TLS_CA}" \
  bdrvs_cli peer lifecycle chaincode install \
  "/tmp/${CC_LABEL}.tar.gz"

# ── Step 4: Get package ID ────────────────────────────────────────────────────
info "Step 4: Querying installed chaincode to get package ID..."
PKG_ID=$(docker exec bdrvs_cli peer lifecycle chaincode queryinstalled \
  --output json | \
  python3 -c "
import sys, json
data = json.load(sys.stdin)
for cc in data.get('installed_chaincodes', []):
    if cc.get('label') == '${CC_LABEL}':
        print(cc['package_id'])
        break
")

if [ -z "${PKG_ID}" ]; then
  echo "ERROR: Could not find package ID for label '${CC_LABEL}'"
  echo "Run: docker exec bdrvs_cli peer lifecycle chaincode queryinstalled"
  exit 1
fi

info "Package ID: ${PKG_ID}"

# ── Step 5: Approve for MoH ──────────────────────────────────────────────────
info "Step 5: Approving for MoHMSP..."
docker exec bdrvs_cli peer lifecycle chaincode approveformyorg \
  -o orderer.bdrvs.gh:7050 \
  --channelID "${CHANNEL}" \
  --name "${CC_NAME}" \
  --version "${CC_VERSION}" \
  --package-id "${PKG_ID}" \
  --sequence "${CC_SEQUENCE}" \
  --init-required \
  --tls \
  --cafile "${ORDERER_CA}"

# ── Step 6: Approve for NITA ─────────────────────────────────────────────────
info "Step 6: Approving for NITAMSP..."
docker exec \
  -e CORE_PEER_ADDRESS="${NITA_PEER}" \
  -e CORE_PEER_LOCALMSPID=NITAMSP \
  -e CORE_PEER_MSPCONFIGPATH="${NITA_MSP}" \
  -e CORE_PEER_TLS_ROOTCERT_FILE="${NITA_TLS_CA}" \
  bdrvs_cli peer lifecycle chaincode approveformyorg \
  -o orderer.bdrvs.gh:7050 \
  --channelID "${CHANNEL}" \
  --name "${CC_NAME}" \
  --version "${CC_VERSION}" \
  --package-id "${PKG_ID}" \
  --sequence "${CC_SEQUENCE}" \
  --init-required \
  --tls \
  --cafile "${ORDERER_CA}"

# ── Step 7: Check commit readiness ───────────────────────────────────────────
info "Step 7: Checking commit readiness..."
docker exec bdrvs_cli peer lifecycle chaincode checkcommitreadiness \
  --channelID "${CHANNEL}" \
  --name "${CC_NAME}" \
  --version "${CC_VERSION}" \
  --sequence "${CC_SEQUENCE}" \
  --init-required \
  --output json \
  --tls \
  --cafile "${ORDERER_CA}"

# ── Step 8: Commit ────────────────────────────────────────────────────────────
info "Step 8: Committing chaincode to ${CHANNEL}..."
docker exec bdrvs_cli peer lifecycle chaincode commit \
  -o orderer.bdrvs.gh:7050 \
  --channelID "${CHANNEL}" \
  --name "${CC_NAME}" \
  --version "${CC_VERSION}" \
  --sequence "${CC_SEQUENCE}" \
  --init-required \
  --tls \
  --cafile "${ORDERER_CA}" \
  --peerAddresses "${MOH_PEER}" \
  --tlsRootCertFiles "${MOH_TLS_CA}" \
  --peerAddresses "${NITA_PEER}" \
  --tlsRootCertFiles "${NITA_TLS_CA}"

# ── Step 9: InitLedger ────────────────────────────────────────────────────────
info "Step 9: Calling InitLedger (seeds Ghana IP whitelist + RTT threshold)..."
docker exec bdrvs_cli peer chaincode invoke \
  -o orderer.bdrvs.gh:7050 \
  --isInit \
  --channelID "${CHANNEL}" \
  --name "${CC_NAME}" \
  --tls \
  --cafile "${ORDERER_CA}" \
  --peerAddresses "${MOH_PEER}" \
  --tlsRootCertFiles "${MOH_TLS_CA}" \
  --peerAddresses "${NITA_PEER}" \
  --tlsRootCertFiles "${NITA_TLS_CA}" \
  -c '{"function":"InitLedger","Args":[]}'

sleep 3  # wait for block to commit

# ── Step 10: Smoke test ───────────────────────────────────────────────────────
info "Step 10: Smoke test — querying network config..."
docker exec bdrvs_cli peer chaincode query \
  --channelID "${CHANNEL}" \
  --name "${CC_NAME}" \
  -c '{"function":"GetNetworkConfigPublic","Args":[]}'

info "============================================"
info " Chaincode '${CC_NAME}' deployed successfully"
info " Channel:  ${CHANNEL}"
info " Version:  ${CC_VERSION}"
info " Sequence: ${CC_SEQUENCE}"
info "============================================"
info "Next: run Phase 3 probing agent setup."
