#!/usr/bin/env bash
# =============================================================================
# install-fabric.sh — Downloads Hyperledger Fabric 2.5 binaries + images
# Tested on: Parrot OS (Debian-based), Ubuntu 22.04 LTS
# Run ONCE before network.sh
# =============================================================================

set -euo pipefail

FABRIC_VERSION="2.5.9"
CA_VERSION="1.5.7"
INSTALL_DIR="${HOME}/fabric-bins"

GREEN='\033[0;32m'; NC='\033[0m'
info() { echo -e "${GREEN}[INSTALL]${NC} $*"; }

# ── 1. Install system dependencies ────────────────────────────────────────────
info "Installing system dependencies..."
sudo apt-get update -qq
sudo apt-get install -y --no-install-recommends \
  curl wget git jq golang-go make \
  apt-transport-https ca-certificates gnupg lsb-release

# ── 2. Install Docker if missing ──────────────────────────────────────────────
if ! command -v docker &>/dev/null; then
  info "Installing Docker..."
  curl -fsSL https://download.docker.com/linux/debian/gpg | sudo gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] \
    https://download.docker.com/linux/debian $(lsb_release -cs) stable" \
    | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
  sudo apt-get update -qq
  sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
  sudo usermod -aG docker "${USER}"
  info "Docker installed. You may need to log out and back in for group membership to take effect."
else
  info "Docker already installed: $(docker --version)"
fi

# ── 3. Download Fabric binaries ───────────────────────────────────────────────
info "Downloading Hyperledger Fabric ${FABRIC_VERSION} binaries..."
mkdir -p "${INSTALL_DIR}"
cd "${INSTALL_DIR}"

FABRIC_TARBALL="hyperledger-fabric-linux-amd64-${FABRIC_VERSION}.tar.gz"
FABRIC_URL="https://github.com/hyperledger/fabric/releases/download/v${FABRIC_VERSION}/${FABRIC_TARBALL}"

if [[ ! -f "${FABRIC_TARBALL}" ]]; then
  curl -LO "${FABRIC_URL}"
fi
tar -xzf "${FABRIC_TARBALL}"

# ── 4. Download Fabric CA binaries ────────────────────────────────────────────
CA_TARBALL="hyperledger-fabric-ca-linux-amd64-${CA_VERSION}.tar.gz"
CA_URL="https://github.com/hyperledger/fabric-ca/releases/download/v${CA_VERSION}/${CA_TARBALL}"
if [[ ! -f "${CA_TARBALL}" ]]; then
  curl -LO "${CA_URL}"
fi
tar -xzf "${CA_TARBALL}"

# ── 5. Add to PATH ────────────────────────────────────────────────────────────
BINS_PATH="${INSTALL_DIR}/bin"
if ! grep -q "${BINS_PATH}" "${HOME}/.bashrc"; then
  echo "export PATH=\"${BINS_PATH}:\$PATH\"" >> "${HOME}/.bashrc"
  info "Added ${BINS_PATH} to ~/.bashrc"
fi
export PATH="${BINS_PATH}:${PATH}"

# ── 6. Pull Docker images ─────────────────────────────────────────────────────
info "Pulling Hyperledger Fabric Docker images (this may take a few minutes)..."
for IMAGE in peer orderer tools; do
  docker pull "hyperledger/fabric-${IMAGE}:${FABRIC_VERSION}"
  docker tag  "hyperledger/fabric-${IMAGE}:${FABRIC_VERSION}" "hyperledger/fabric-${IMAGE}:latest"
done
docker pull "hyperledger/fabric-ca:${CA_VERSION}"
docker tag  "hyperledger/fabric-ca:${CA_VERSION}" "hyperledger/fabric-ca:latest"

# ── 7. Verify ─────────────────────────────────────────────────────────────────
info "Verifying installation..."
echo "  cryptogen  : $(cryptogen version 2>&1 | head -1)"
echo "  configtxgen: $(configtxgen --version 2>&1 | head -1)"
echo "  peer       : $(peer version 2>&1 | head -1)"

info "Installation complete!"
info "Run:  source ~/.bashrc  —then—  cd bdrvs-network && ./scripts/network.sh up"
