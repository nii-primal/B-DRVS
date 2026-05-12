#!/usr/bin/env bash
# =============================================================================
# fix-docker-parrot.sh
# Installs Docker correctly on Parrot OS by reading the UNDERLYING
# Debian codename from /etc/os-release (DEBIAN_CODENAME field),
# NOT from lsb_release which returns Parrot's own codename.
# =============================================================================

set -euo pipefail

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
info() { echo -e "${GREEN}[DOCKER]${NC} $*"; }
warn() { echo -e "${YELLOW}[WARN] ${NC} $*"; }

# ── 1. Clean up any broken repo entry from the previous attempt ───────────────
info "Removing any broken Docker repo entries..."
sudo rm -f /etc/apt/sources.list.d/docker.list
sudo rm -f /usr/share/keyrings/docker-archive-keyring.gpg

# ── 2. Detect the DEBIAN base codename (not Parrot's own codename) ─────────────
# /etc/os-release on Parrot exposes DEBIAN_CODENAME=bookworm (or bullseye)
# This is what Docker's repository actually uses.
if [ -f /etc/os-release ]; then
  source /etc/os-release
  DOCKER_CODENAME="${DEBIAN_CODENAME:-}"
fi

# Fallback: read from /etc/debian_version  (e.g. "12.5" → bookworm)
if [ -z "${DOCKER_CODENAME:-}" ]; then
  DEBIAN_VER=$(cat /etc/debian_version | cut -d. -f1)
  case "$DEBIAN_VER" in
    12) DOCKER_CODENAME="bookworm" ;;
    11) DOCKER_CODENAME="bullseye" ;;
    10) DOCKER_CODENAME="buster"   ;;
    *)  DOCKER_CODENAME="bookworm" ;;   # safe default
  esac
fi

info "Parrot OS detected. Using Debian base codename: '${DOCKER_CODENAME}'"

# ── 3. Install dependencies ───────────────────────────────────────────────────
info "Installing apt transport dependencies..."
sudo apt-get update -qq
sudo apt-get install -y --no-install-recommends \
  ca-certificates curl gnupg lsb-release

# ── 4. Add Docker's official GPG key ─────────────────────────────────────────
info "Adding Docker GPG key..."
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/debian/gpg \
  | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

# ── 5. Add Docker repository with the CORRECT codename ───────────────────────
info "Adding Docker repository for Debian ${DOCKER_CODENAME}..."
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
https://download.docker.com/linux/debian \
${DOCKER_CODENAME} stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

# ── 6. Install Docker ─────────────────────────────────────────────────────────
info "Installing Docker CE..."
sudo apt-get update -qq
sudo apt-get install -y \
  docker-ce docker-ce-cli containerd.io \
  docker-buildx-plugin docker-compose-plugin

# ── 7. Add current user to docker group ──────────────────────────────────────
sudo usermod -aG docker "${USER}"

# ── 8. Verify ─────────────────────────────────────────────────────────────────
info "Docker installed successfully:"
docker --version
docker compose version

warn "IMPORTANT: Run 'newgrp docker' (or log out and back in)"
warn "           so your user can run Docker without sudo."
info "Once done, re-run:  ./scripts/install-fabric.sh"
