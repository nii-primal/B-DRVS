# B-DRVS — Blockchain-Based Data Residency Verification System

> **BSc Cybersecurity Final Year Project**
> University of Mines and Technology (UMaT), Tarkwa, Ghana — April 2026
> Department of Cybersecurity and Information Systems
> Supervisor: Mr Mohammed Yussif Umaru

---

## Authors

| Name | Student ID | Responsibility |
|------|-----------|----------------|
| Ahinakwa Eugene Nii Okai | FOE.41.018.016.22 | System Development — Fabric network, smart contract, probing agent, REST gateway |
| Boateng Theophilus Oware | FOE.41.018.046.22 | Local Testing — end-to-end validation, check-in scenarios, violation simulation |
| Arthur Cephas Ebo | FOE.41.018.031.22 | Admin Dashboard — React frontend, compliance map, RTT charts, evidence export |
| Tengviel Edwin Daaro | F.O.E 41.018.115.22 | Cloud Testing — AWS/DigitalOcean deployment, foreign hosting simulation |
| Sowah Arnold Nii Adjetey | FOE.41.018.110.22 | Cloud Testing — AWS/DigitalOcean deployment, foreign hosting simulation |

**Supervisor:** Mr Mohammed Yussif Umaru
**Institution:** University of Mines and Technology, Tarkwa, Ghana
**Year:** 2026

---

## What This System Does

Ghana's Data Protection Act (2012) requires health data to remain under Ghanaian jurisdiction. But the Ministry of Health has no way to verify in real time where vendor-hosted health servers are physically located — a gap exposed by the 2025 dispute between the Ministry of Health and Lightwave Technologies over whether patient data was hosted in India or Accra.

**B-DRVS solves this** by continuously and automatically verifying whether health servers are physically located within Ghana, writing tamper-proof compliance records to a permissioned blockchain, and alerting regulators in real time when a violation is detected.

---

## System Architecture

```
┌─────────────────────────────────────────────────────────┐
│  TIER 1 — Probing Agent (Python)                        │
│  Runs on vendor health server                           │
│  Collects public IP + RTT → signs with ECDSA → submits  │
└──────────────────────┬──────────────────────────────────┘
                       │ POST /api/checkin
┌──────────────────────▼──────────────────────────────────┐
│  TIER 2 — REST API Gateway (Node.js/Express)            │
│  Bridges agent to blockchain on port 3000               │
└──────────────────────┬──────────────────────────────────┘
                       │ docker exec peer chaincode invoke
┌──────────────────────▼──────────────────────────────────┐
│  TIER 2 — Smart Contract (Go / Hyperledger Fabric)      │
│  Step 1: Verify ECDSA signature                         │
│  Step 2: Check IP against Ghana AFRINIC whitelist       │
│  Step 3: Check RTT against 50ms domestic threshold      │
│  Result: COMPLIANT or SOVEREIGNTY_VIOLATION on ledger   │
└──────────────────────┬──────────────────────────────────┘
                       │ GET /api/*
┌──────────────────────▼──────────────────────────────────┐
│  TIER 3 — Admin Dashboard (React + Vite + Leaflet)      │
│  Real-time compliance map, violation alerts,            │
│  RTT latency charts, evidence export for regulators     │
│  http://localhost:5173                                  │
└─────────────────────────────────────────────────────────┘
```

---

## Prerequisites

Install these before anything else.

### 1. Operating System
Any **Debian-based Linux** (Ubuntu 22.04+, Parrot OS, Kali). Windows users should use WSL2 with Ubuntu.

### 2. Docker
```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
newgrp docker
docker run hello-world   # confirm it works
```

### 3. Go 1.21+
```bash
sudo apt-get install -y golang-go
go version
```

### 4. Node.js 20+
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo bash -
sudo apt-get install -y nodejs
node --version
npm --version
```

### 5. Python 3.10+
```bash
python3 --version
pip3 install cryptography==41.0.7 requests==2.31.0 --break-system-packages
```

### 6. Hyperledger Fabric 2.5 Binaries
```bash
chmod +x bdrvs-network/scripts/install-fabric.sh
./bdrvs-network/scripts/install-fabric.sh
source ~/.bashrc

# Confirm all three tools are available
cryptogen version
configtxgen --version
peer version
```

---

## Quick Start — Full System from Scratch

Follow these steps **in order**. Each step depends on the previous one.

---

### Step 1 — Clone the Repository

```bash
git clone https://github.com/nii-primal/B-DRVS.git
cd B-DRVS
```

---

### Step 2 — Install Fabric Binaries (one-time only)

```bash
chmod +x bdrvs-network/scripts/install-fabric.sh
./bdrvs-network/scripts/install-fabric.sh
source ~/.bashrc
```

Pull the extra Docker images needed for chaincode building:
```bash
docker pull hyperledger/fabric-ccenv:2.5
docker pull hyperledger/fabric-baseos:2.5
docker tag hyperledger/fabric-ccenv:2.5 hyperledger/fabric-ccenv:latest
docker tag hyperledger/fabric-baseos:2.5 hyperledger/fabric-baseos:latest
```

---

### Step 3 — Generate Crypto Material and Channel Artifacts

```bash
cd bdrvs-network

export FABRIC_CFG_PATH=$(pwd)/config/configtx

cryptogen generate \
  --config=config/cryptogen/crypto-config.yaml \
  --output=crypto-material

# Copy NodeOU config to all admin and user MSPs
cp crypto-material/peerOrganizations/moh.bdrvs.gh/msp/config.yaml \
   crypto-material/peerOrganizations/moh.bdrvs.gh/users/Admin@moh.bdrvs.gh/msp/
cp crypto-material/peerOrganizations/moh.bdrvs.gh/msp/config.yaml \
   crypto-material/peerOrganizations/moh.bdrvs.gh/users/User1@moh.bdrvs.gh/msp/
cp crypto-material/peerOrganizations/nita.bdrvs.gh/msp/config.yaml \
   crypto-material/peerOrganizations/nita.bdrvs.gh/users/Admin@nita.bdrvs.gh/msp/
cp crypto-material/peerOrganizations/nita.bdrvs.gh/msp/config.yaml \
   crypto-material/peerOrganizations/nita.bdrvs.gh/users/User1@nita.bdrvs.gh/msp/

mkdir -p channel-artifacts

configtxgen -profile BDRVSGenesis -channelID system-channel \
  -outputBlock channel-artifacts/genesis.block

configtxgen -profile BDRVSChannel -channelID bdrvschannel \
  -outputCreateChannelTx channel-artifacts/bdrvschannel.tx

configtxgen -profile BDRVSChannel -channelID bdrvschannel \
  -outputAnchorPeersUpdate channel-artifacts/MoHMSPanchors.tx -asOrg MoHMSP

configtxgen -profile BDRVSChannel -channelID bdrvschannel \
  -outputAnchorPeersUpdate channel-artifacts/NITAMSPanchors.tx -asOrg NITAMSP
```

---

### Step 4 — Configure Peer core.yaml

```bash
sed -i 's/^chaincode:$/chaincode:\n  builder: hyperledger\/fabric-ccenv:2.5\n  golang:\n    runtime: hyperledger\/fabric-baseos:2.5\n    dynamicLink: false/' compose/peercfg/core.yaml
```

---

### Step 5 — Start the Fabric Network

```bash
docker compose -f compose/docker-compose.yaml up -d
```

Wait 5 seconds, then verify all 4 containers are running:
```bash
docker ps
```

You should see: `orderer.bdrvs.gh`, `peer0.moh.bdrvs.gh`, `peer0.nita.bdrvs.gh`, `bdrvs_cli`

---

### Step 6 — Create the Channel and Join Peers

```bash
# Create bdrvschannel
docker exec bdrvs_cli peer channel create \
  -o orderer.bdrvs.gh:7050 \
  -c bdrvschannel \
  -f /opt/gopath/src/github.com/hyperledger/fabric/peer/channel-artifacts/bdrvschannel.tx \
  --outputBlock /opt/gopath/src/github.com/hyperledger/fabric/peer/channel-artifacts/bdrvschannel.block \
  --tls \
  --cafile /opt/gopath/src/github.com/hyperledger/fabric/peer/crypto/ordererOrganizations/bdrvs.gh/orderers/orderer.bdrvs.gh/msp/tlscacerts/tlsca.bdrvs.gh-cert.pem

# Join MoH peer
docker exec bdrvs_cli peer channel join \
  -b /opt/gopath/src/github.com/hyperledger/fabric/peer/channel-artifacts/bdrvschannel.block

# Join NITA peer
docker exec \
  -e CORE_PEER_ADDRESS=peer0.nita.bdrvs.gh:9051 \
  -e CORE_PEER_LOCALMSPID=NITAMSP \
  -e CORE_PEER_MSPCONFIGPATH=/opt/gopath/src/github.com/hyperledger/fabric/peer/crypto/peerOrganizations/nita.bdrvs.gh/users/Admin@nita.bdrvs.gh/msp \
  -e CORE_PEER_TLS_ROOTCERT_FILE=/opt/gopath/src/github.com/hyperledger/fabric/peer/crypto/peerOrganizations/nita.bdrvs.gh/peers/peer0.nita.bdrvs.gh/tls/ca.crt \
  bdrvs_cli peer channel join \
  -b /opt/gopath/src/github.com/hyperledger/fabric/peer/channel-artifacts/bdrvschannel.block

# Update anchor peers
docker exec bdrvs_cli peer channel update \
  -o orderer.bdrvs.gh:7050 -c bdrvschannel \
  -f /opt/gopath/src/github.com/hyperledger/fabric/peer/channel-artifacts/MoHMSPanchors.tx \
  --tls \
  --cafile /opt/gopath/src/github.com/hyperledger/fabric/peer/crypto/ordererOrganizations/bdrvs.gh/orderers/orderer.bdrvs.gh/msp/tlscacerts/tlsca.bdrvs.gh-cert.pem

docker exec \
  -e CORE_PEER_ADDRESS=peer0.nita.bdrvs.gh:9051 \
  -e CORE_PEER_LOCALMSPID=NITAMSP \
  -e CORE_PEER_MSPCONFIGPATH=/opt/gopath/src/github.com/hyperledger/fabric/peer/crypto/peerOrganizations/nita.bdrvs.gh/users/Admin@nita.bdrvs.gh/msp \
  -e CORE_PEER_TLS_ROOTCERT_FILE=/opt/gopath/src/github.com/hyperledger/fabric/peer/crypto/peerOrganizations/nita.bdrvs.gh/peers/peer0.nita.bdrvs.gh/tls/ca.crt \
  bdrvs_cli peer channel update \
  -o orderer.bdrvs.gh:7050 -c bdrvschannel \
  -f /opt/gopath/src/github.com/hyperledger/fabric/peer/channel-artifacts/NITAMSPanchors.tx \
  --tls \
  --cafile /opt/gopath/src/github.com/hyperledger/fabric/peer/crypto/ordererOrganizations/bdrvs.gh/orderers/orderer.bdrvs.gh/msp/tlscacerts/tlsca.bdrvs.gh-cert.pem

# Verify — should show height:3
docker exec bdrvs_cli peer channel getinfo -c bdrvschannel
```

---

### Step 7 — Deploy the Smart Contract

```bash
cd /path/to/B-DRVS/bdrvs-network
./chaincode/residency/deploy-chaincode.sh
```

Expected final output:
```
[DEPLOY] Chaincode 'residency' deployed successfully
```

---

### Step 8 — Start the REST API Gateway

```bash
cd gateway
npm install
```

Create the environment file:
```bash
cat > .env << EOF
PORT=3000
NODE_ENV=development
CHANNEL_NAME=bdrvschannel
CHAINCODE_NAME=residency
CRYPTO_PATH=$(cd .. && pwd)/crypto-material
MOH_MSP_ID=MoHMSP
MOH_PEER_ENDPOINT=localhost:7051
MOH_PEER_HOST_ALIAS=peer0.moh.bdrvs.gh
MOH_TLS_CERT_PATH=$(cd .. && pwd)/crypto-material/peerOrganizations/moh.bdrvs.gh/peers/peer0.moh.bdrvs.gh/tls/ca.crt
MOH_CERT_PATH=$(cd .. && pwd)/crypto-material/peerOrganizations/moh.bdrvs.gh/users/User1@moh.bdrvs.gh/msp/signcerts/User1@moh.bdrvs.gh-cert.pem
MOH_KEY_DIR_PATH=$(cd .. && pwd)/crypto-material/peerOrganizations/moh.bdrvs.gh/users/User1@moh.bdrvs.gh/msp/keystore
ORDERER_ENDPOINT=localhost:7050
EOF
```

Start the gateway:
```bash
node server.js
```

Verify in a second terminal:
```bash
curl -s http://localhost:3000/api/health | python3 -m json.tool
curl -s http://localhost:3000/api/config | python3 -m json.tool
```

---

### Step 9 — Run the Probing Agent

```bash
cd ../probing-agent
pip3 install -r requirements.txt --break-system-packages

# Register this server on the blockchain (first time only)
python3 -c "import config, key_manager, agent; agent.register_server()"

# Run one check-in cycle
python3 agent.py
```

Expected output includes either:
- `✅ COMPLIANT` — server IP is in a Ghanaian AFRINIC range
- `🚨 SOVEREIGNTY_VIOLATION` — server IP is foreign (expected on a dev machine)

---

### Step 10 — Start the Admin Dashboard

```bash
cd ../dashboard
npm install
npm run dev
```

Open your browser at **http://localhost:5173**

The dashboard proxies all `/api/*` requests to the gateway on port 3000 automatically via `vite.config.js` — no CORS configuration needed.

---

### Step 11 — Verify Everything End-to-End

```bash
curl -s http://localhost:3000/api/status/LHIMS-KORLE-BU-01 | python3 -m json.tool
curl -s http://localhost:3000/api/violations | python3 -m json.tool
curl -s http://localhost:3000/api/stats/LHIMS-KORLE-BU-01 | python3 -m json.tool
```

---

## Daily Startup (After Initial Setup)

Once the system is set up, use this sequence every time you restart:

```bash
# Option A — Automated (recommended)
cd /path/to/B-DRVS
./start-bdrvs.sh           # starts Fabric + gateway automatically (27 checks)

# Then start the dashboard in a separate terminal
cd bdrvs-network/dashboard
npm run dev
```

```bash
# Option B — Manual
cd bdrvs-network
docker compose -f compose/docker-compose.yaml up -d   # Terminal 1: Fabric
cd gateway && node server.js                           # Terminal 2: Gateway
cd ../dashboard && npm run dev                         # Terminal 3: Dashboard
```

---

## Dashboard Pages

### Overview — `/`
The main landing page for regulators. Shows four live stat cards (Servers Monitored, Compliant, In Violation, Records on Chain), an interactive Ghana-centred Leaflet compliance map with green/red server markers, a recent violations panel, and a full monitored servers table. Auto-refreshes every 30 seconds.

### Server Detail — `/servers/:id`
Deep-dive into a single server's compliance history. Shows a violation alert banner if active, a status strip with current IP/RTT/compliance rate, an RTT latency trend chart with the 50ms threshold marked as a dashed gold line, and the complete immutable audit trail table from the blockchain. Includes an **Export Evidence Report** button that downloads a `.tsv` file for use in DPC investigations and legal proceedings.

### Violations — `/violations`
Full filterable list of every `SOVEREIGNTY_VIOLATION` record across all servers on the ledger, with live search across server ID, IP address, and violation reason.

### Register Server — `/register`
Form for MoH/NITA administrators to enrol a new health server onto the monitoring ledger. Requires the server's ECDSA public key PEM — generated by the probing agent and stored on-chain for signature verification.

---

## How the Dashboard Connects to the Blockchain

```
Browser (port 5173)
    │
    │  /api/* requests
    ▼
Vite Dev Server proxy
    │
    │  forwards to port 3000
    ▼
Node.js / Express Gateway
    │
    │  docker exec (Fabric CLI)
    ▼
Hyperledger Fabric (bdrvschannel)
    ├── MoH Peer Node
    └── NITA Peer Node
         │
         └── chaincode: residency (Go smart contract)
```

---

## Teardown

```bash
# Stop the dashboard
# Press Ctrl+C in the dashboard terminal

# Stop the gateway
kill $(cat /tmp/bdrvs-gateway.pid) 2>/dev/null

# Stop the Fabric network
cd bdrvs-network
docker compose -f compose/docker-compose.yaml down
```

> ⚠️ Running `down` without `--volumes` preserves the blockchain data. Adding `--volumes` wipes everything — you must redo Steps 3–9 after a full teardown.

---

## Repository Structure

```
B-DRVS/
├── start-bdrvs.sh                         ← Automated startup + health check
├── STARTUP-GUIDE.md                       ← Step by step manual startup guide
└── bdrvs-network/
    ├── config/
    │   ├── cryptogen/crypto-config.yaml   ← Org topology (MoH, NITA, Orderer)
    │   └── configtx/configtx.yaml         ← Channel + policy configuration
    ├── compose/
    │   ├── docker-compose.yaml            ← All Fabric services
    │   └── peercfg/core.yaml             ← Peer runtime config
    ├── scripts/
    │   ├── network.sh                     ← Network manager
    │   └── install-fabric.sh             ← Fabric binary installer
    ├── chaincode/residency/
    │   ├── residency.go                   ← Smart contract (IP + RTT validation)
    │   ├── main.go                        ← Chaincode entry point
    │   ├── go.mod                         ← Go module definition
    │   └── deploy-chaincode.sh           ← Full lifecycle deployment script
    ├── probing-agent/
    │   ├── agent.py                       ← Main probing agent
    │   ├── key_manager.py                 ← ECDSA key generation + signing
    │   ├── config.py                      ← Agent configuration
    │   └── requirements.txt              ← Python dependencies
    ├── gateway/
    │   ├── server.js                      ← Express server (port 3000)
    │   ├── fabric.js                      ← Fabric CLI bridge
    │   ├── routes.js                      ← All API endpoints
    │   ├── logger.js                      ← Winston logger
    │   └── package.json                  ← Node.js dependencies
    ├── dashboard/
    │   ├── src/
    │   │   ├── pages/                     ← Overview, ServerDetail, Violations, Register
    │   │   ├── components/                ← Map, charts, tables, stat cards
    │   │   └── api/client.js             ← All gateway API calls
    │   ├── vite.config.js                 ← Proxy /api/* to port 3000
    │   └── package.json                  ← React + Vite + Leaflet dependencies
    ├── crypto-material/                   ← Generated — git ignored
    └── channel-artifacts/                 ← Generated — git ignored
```

---

## API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Gateway + blockchain health check |
| GET | `/api/config` | Ghana IP whitelist + RTT threshold from ledger |
| POST | `/api/register` | Register a health server with its ECDSA public key |
| POST | `/api/checkin` | Submit a signed location proof |
| GET | `/api/status/:serverID` | Latest compliance status for a server |
| GET | `/api/history/:serverID` | Full audit trail for a server |
| GET | `/api/violations` | All SOVEREIGNTY_VIOLATION records |
| GET | `/api/stats/:serverID` | Compliance rate statistics |

---

## Technology Stack

| Component | Technology |
|-----------|-----------|
| Blockchain | Hyperledger Fabric 2.5 |
| Smart Contract | Go (Golang) |
| Probing Agent | Python 3.13 |
| REST Gateway | Node.js 20 + Express |
| Dashboard | React 19 + Vite 6 |
| Map | React-Leaflet + Leaflet 1.9 |
| Charts | Recharts |
| HTTP Client | Axios |
| Fonts | IBM Plex Sans / Mono |
| Containerisation | Docker + Docker Compose |
| Crypto Signing | ECDSA P-256 / SHA-256 |
| IP Geolocation | AFRINIC Ghana CIDR ranges |

---

## Blockchain Network

| Property | Value |
|----------|-------|
| Framework | Hyperledger Fabric 2.5 |
| Channel | `bdrvschannel` |
| Organisations | MoHMSP (Ministry of Health) + NITAMSP (NITA) |
| Consensus | Solo (prototype) |
| Chaincode | `residency` v1.0 |
| Endorsement | Both peers must sign every transaction |

---

## Smart Contract Validation Logic

Every check-in from the probing agent goes through three steps:

```
Signed Payload
      │
      ▼
Step 1: Verify ECDSA signature
      │ fail → reject (spoofed payload)
      ▼
Step 2: IP in Ghana AFRINIC range?
      │ fail → SOVEREIGNTY_VIOLATION
      ▼
Step 3: RTT ≤ 50ms threshold?
      │ fail → SOVEREIGNTY_VIOLATION
      ▼
    COMPLIANT → written to immutable ledger
                + event emitted to dashboard
```

---

## Port Map

| Service | Port |
|---------|------|
| Admin Dashboard | 5173 |
| REST API Gateway | 3000 |
| MoH Peer (gRPC) | 7051 |
| NITA Peer (gRPC) | 9051 |
| Orderer (gRPC) | 7050 |

---

## Known Issues and Fixes

| Issue | Fix |
|-------|-----|
| Parrot OS Docker install fails (codename `echo`) | Use `curl -fsSL https://get.docker.com \| sudo sh` |
| `peer channel create` — BAD_REQUEST policy error | Ensure `configtx.yaml` uses `ANY Admins` not `MAJORITY Admins` |
| Peers crash on startup — MSP path missing | Regenerate crypto-material; ensure peer folder has `msp/` and `tls/` subdirectories |
| Chaincode install fails — no builder image | Add `builder: hyperledger/fabric-ccenv:2.5` to `compose/peercfg/core.yaml` |
| Gateway returns empty on `/api/violations` | Timing issue — wait 3 seconds after check-in then retry |
| RTT measurement fails — hostname not resolved | Set `VERIFIER_HOST = "localhost"` in `probing-agent/config.py` for dev environments |
| `Cannot find module 'dotenv'` | Run `npm install` in `gateway/` |
| Dashboard map not loading | Run `npm install` in `dashboard/` — Leaflet CSS may be missing |

---

## Legal Framework

This system is designed to support enforcement of:
- **Data Protection Act, 2012 (Act 843)** — requires personal data to remain under Ghanaian jurisdiction
- **Cybersecurity Act, 2020 (Act 1038)** — extends data protection with cybersecurity authority

---
