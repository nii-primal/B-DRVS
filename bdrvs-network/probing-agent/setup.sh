#!/usr/bin/env bash
# =============================================================================
# B-DRVS Probing Agent — Setup Script
# Installs Python dependencies and runs the offline signing test
# =============================================================================

set -euo pipefail

GREEN='\033[0;32m'; NC='\033[0m'
info() { echo -e "${GREEN}[AGENT]${NC} $*"; }

AGENT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "${AGENT_DIR}"

info "Installing Python dependencies..."
pip3 install -r requirements.txt --break-system-packages

info "Creating required directories..."
mkdir -p keys logs

info "Running offline signing test..."
python3 agent.py --test-signing

info "============================================"
info " Probing Agent setup complete"
info " Keys directory : ${AGENT_DIR}/keys/"
info " Logs directory : ${AGENT_DIR}/logs/"
info "============================================"
info "Next steps:"
info "  1. Start the Phase 4 REST API gateway"
info "  2. Run: python3 agent.py --register"
info "  3. Run: python3 agent.py --loop"
