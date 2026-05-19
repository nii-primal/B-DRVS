# B-DRVS — Blockchain-Based Data Residency Verification System

> **BSc Cybersecurity Final Year Project**
> University of Mines and Technology (UMaT), Tarkwa, Ghana — April 2026
> Department of Cybersecurity and Information Systems
> Supervisor: Mr Mohammed Yussif Umaru

---

## The Problem

Ghana's Data Protection Act (2012) requires health data to remain under Ghanaian jurisdiction. But the Ministry of Health has no way to verify in real time where vendor-hosted health servers are physically located — a gap exposed by the 2025 dispute between the Ministry of Health and Lightwave Technologies over whether patient data was hosted in India or Accra.

**B-DRVS solves this** by continuously and automatically verifying whether health servers are physically located within Ghana, writing tamper-proof compliance records to a permissioned blockchain, and alerting regulators in real time when a violation is detected.

---

## System Architecture

The system is structured across three tiers:

**Tier 1 — Probing Agent**
A Python script installed on the vendor health server. Collects the server's public IP address and RTT latency, signs the data cryptographically using ECDSA, and transmits it to the blockchain via the REST API gateway.

**Tier 2 — Blockchain and Smart Contracts**
A permissioned Hyperledger Fabric network with peer nodes operated by the Ministry of Health and NITA. A Go-based smart contract automatically validates each submission against Ghana's AFRINIC IP whitelist and a 50ms RTT threshold, then records a permanent Compliant or Sovereignty Violation decision on the ledger.

**Tier 3 — Administrative Dashboard**
A React.js web application that translates blockchain records into a real-time compliance monitoring interface for Ministry of Health regulators. Displays server locations on a map, triggers violation alerts, and exports tamper-proof evidence reports.

---

## Smart Contract Validation Logic

Every check-in from the probing agent goes through three steps:

```
Signed Payload Received
        │
        ▼
Step 1: Verify ECDSA Signature
        │ fail → reject (spoofed payload)
        ▼
Step 2: IP in Ghana AFRINIC Range?
        │ fail → SOVEREIGNTY_VIOLATION
        ▼
Step 3: RTT ≤ 50ms Threshold?
        │ fail → SOVEREIGNTY_VIOLATION
        ▼
      COMPLIANT → written to immutable ledger
```

---

## Repository Structure

| Folder | Tier | Description |
|--------|------|-------------|
| probing-agent/ | Tier 1 | Python probing agent for metadata collection and signing |
| chaincode/ | Tier 2 | Go smart contract for automated residency validation |
| fabric-network/ | Tier 2 | Hyperledger Fabric network configuration and deployment |
| api-gateway/ | Tier 2/3 | Node.js REST API gateway connecting all system components |
| dashboard/ | Tier 3 | React.js administrative dashboard for regulators |
| docs/ | — | Project report, diagrams, and documentation |

---

## Tech Stack

| Component | Technology |
|-----------|------------|
| Probing Agent | Python 3.11 |
| Blockchain | Hyperledger Fabric 2.5 |
| Smart Contract | Go (Golang) |
| API Gateway | Node.js / Express |
| Dashboard | React.js / Chart.js |
| Containerisation | Docker / Docker Compose |
| IP Geolocation | MaxMind GeoLite2 |
| OS | Parrot OS (Debian-based) |

---

## Blockchain Network

| Property | Value |
|----------|-------|
| Framework | Hyperledger Fabric 2.5 |
| Channel | bdrvschannel |
| Organisations | MoHMSP (Ministry of Health) + NITAMSP (NITA) |
| Consensus | Solo (prototype) |
| Chaincode | residency v1.0 |
| Endorsement | Both peers must sign every transaction |

---

## API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/health | Gateway and blockchain health check |
| GET | /api/config | Ghana IP whitelist and RTT threshold from ledger |
| POST | /api/register | Register a health server with its ECDSA public key |
| POST | /api/checkin | Submit a signed location proof |
| GET | /api/status/:serverID | Latest compliance status for a server |
| GET | /api/history/:serverID | Full audit trail for a server |
| GET | /api/violations | All SOVEREIGNTY_VIOLATION records |
| GET | /api/stats/:serverID | Compliance rate statistics |

---

## Prerequisites

Install these before anything else.

### 1. Operating System
Any Debian-based Linux (Ubuntu 22.04+, Parrot OS, Kali). Windows users should use WSL2 with Ubuntu.

### 2. Docker
```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
newgrp docker
docker run hello-world
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
cryptogen version
configtxgen --version
peer version
```

---

## Quick Start — Full System from Scratch

Follow these steps in order. Each step depends on the previous one.

### Step 1 — Clone the Repository
```bash
git clone https://github.com/nii-primal/B-DRVS.git
cd B-DRVS
```

### Step 2 — Install Fabric Binaries (one-time only)
```bash
chmod +x bdrvs-network/scripts/install-fabric.sh
./bdrvs-network/scripts/install-fabric.sh
source ~/.bashrc
docker pull hyperledger/fabric-ccenv:2.5
docker pull hyperledger/fabric-baseos:2.5
docker tag hyperledger/fabric-ccenv:2.5 hyperledger/fabric-ccenv:latest
docker tag hyperledger/fabric-baseos:2.5 hyperledger/fabric-baseos:latest
```

### Step 3 — Generate Crypto Material and Channel Artifacts
```bash
cd bdrvs-network
export FABRIC_CFG_PATH=$(pwd)/config/configtx
cryptogen generate \
  --config=config/cryptogen/crypto-config.yaml \
  --output=crypto-material
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

### Step 4 — Start the Fabric Network
```bash
docker compose -f compose/docker-compose.yaml up -d
docker ps
```
You should see: orderer.bdrvs.gh, peer0.moh.bdrvs.gh, peer0.nita.bdrvs.gh, bdrvs_cli

### Step 5 — Create Channel and Join Peers
```bash
docker exec bdrvs_cli peer channel create \
  -o orderer.bdrvs.gh:7050 \
  -c bdrvschannel \
  -f /opt/gopath/src/github.com/hyperledger/fabric/peer/channel-artifacts/bdrvschannel.tx \
  --outputBlock /opt/gopath/src/github.com/hyperledger/fabric/peer/channel-artifacts/bdrvschannel.block \
  --tls \
  --cafile /opt/gopath/src/github.com/hyperledger/fabric/peer/crypto/ordererOrganizations/bdrvs.gh/orderers/orderer.bdrvs.gh/msp/tlscacerts/tlsca.bdrvs.gh-cert.pem

docker exec bdrvs_cli peer channel join \
  -b /opt/gopath/src/github.com/hyperledger/fabric/peer/channel-artifacts/bdrvschannel.block

docker exec \
  -e CORE_PEER_ADDRESS=peer0.nita.bdrvs.gh:9051 \
  -e CORE_PEER_LOCALMSPID=NITAMSP \
  -e CORE_PEER_MSPCONFIGPATH=/opt/gopath/src/github.com/hyperledger/fabric/peer/crypto/peerOrganizations/nita.bdrvs.gh/users/Admin@nita.bdrvs.gh/msp \
  -e CORE_PEER_TLS_ROOTCERT_FILE=/opt/gopath/src/github.com/hyperledger/fabric/peer/crypto/peerOrganizations/nita.bdrvs.gh/peers/peer0.nita.bdrvs.gh/tls/ca.crt \
  bdrvs_cli peer channel join \
  -b /opt/gopath/src/github.com/hyperledger/fabric/peer/channel-artifacts/bdrvschannel.block
```

### Step 6 — Deploy Chaincode
```bash
chmod +x bdrvs-network/chaincode/residency/deploy-chaincode.sh
./bdrvs-network/chaincode/residency/deploy-chaincode.sh
```
Expected final output:
```
[DEPLOY] Chaincode 'residency' deployed successfully
```

### Step 7 — Start the REST API Gateway
```bash
cd gateway
npm install
node server.js
```

Verify in a second terminal:
```bash
curl -s http://localhost:3000/api/health | python3 -m json.tool
curl -s http://localhost:3000/api/config | python3 -m json.tool
```

### Step 8 — Run the Probing Agent
```bash
cd ../probing-agent
pip3 install -r requirements.txt --break-system-packages
python3 agent.py
```

Expected output:
- ✅ COMPLIANT — server IP is in a Ghanaian AFRINIC range
- 🚨 SOVEREIGNTY_VIOLATION — server IP is foreign

Run continuously:
```bash
python3 agent.py --loop
```

### Step 9 — Verify End-to-End
```bash
curl -s http://localhost:3000/api/status/LHIMS-KORLE-BU-01 | python3 -m json.tool
curl -s http://localhost:3000/api/violations | python3 -m json.tool
curl -s http://localhost:3000/api/stats/LHIMS-KORLE-BU-01 | python3 -m json.tool
```

---

## Daily Startup

```bash
cd /path/to/B-DRVS/bdrvs-network
docker compose -f compose/docker-compose.yaml up -d
cd gateway && node server.js
curl http://localhost:3000/api/health
```

---

## Teardown

```bash
cd bdrvs-network
docker compose -f compose/docker-compose.yaml down --volumes
```

⚠️ --volumes wipes all blockchain data. After teardown, repeat Steps 3–6 to rebuild from scratch.

---

## Known Issues and Fixes

| Issue | Fix |
|-------|-----|
| Parrot OS Docker install fails | Use curl -fsSL https://get.docker.com \| sudo sh |
| peer channel create BAD_REQUEST policy error | Ensure configtx.yaml uses ANY Admins not MAJORITY Admins |
| Peers crash on startup — MSP path missing | Regenerate crypto-material |
| Chaincode install fails — no builder image | Add builder: hyperledger/fabric-ccenv:2.5 to core.yaml |
| Gateway returns empty on /api/violations | Wait 3 seconds after check-in then retry |
| RTT measurement fails — hostname not resolved | Set VERIFIER_HOST = "localhost" in config.py for dev |

---

## Implementation Progress

| Phase | Description | Status | Date | Notes |
|-------|-------------|--------|------|-------|
| Phase 1 | Environment and Blockchain Network Setup | ✅ Complete | 11 May 2026 | Docker, Fabric network, MoH and NITA nodes configured |
| Phase 2 | Smart Contract — Go Chaincode | ✅ Complete | 12 May 2026 | Validation logic written and deployed — integrated via Phase 4 |
| Phase 3 | Python Probing Agent | ✅ Complete | 12 May 2026 | ECDSA signing, IP collection, RTT measurement — integrated via Phase 4 |
| Phase 4 | REST API Gateway | ✅ Complete | 12 May 2026 | 8 endpoints built — first live end-to-end test passed with SOVEREIGNTY_VIOLATION recorded on ledger |
| Phase 5 | React.js Administrative Dashboard | ⏳ Pending | — | — |
| Phase 6 | Testing and Simulation | ⏳ Pending | — | — |

## First Live End-to-End Test
On 12 May 2026, the system ran its first complete verification cycle:
- Server LHIMS-KORLE-BU-01 was registered on the blockchain with its ECDSA public key
- The Probing Agent collected a real public IP, measured RTT, and signed the payload
- The REST API Gateway submitted the signed payload to the smart contract
- The smart contract validated the data and wrote a permanent SOVEREIGNTY_VIOLATION record to the immutable ledger

---

## Legal Framework

This system is designed to support enforcement of:
- Data Protection Act, 2012 (Act 843) — requires personal data to remain under Ghanaian jurisdiction
- Cybersecurity Act, 2020 (Act 1038) — extends data protection with cybersecurity authority

---

## Team

| Name | Student ID |
|------|-----------|
| Ahinakwa Eugene Nii Okai | FOE.41.018.016.22 |
| Boateng Theophilus Oware | FOE.41.018.046.22 |
| Arthur Cephas Ebo | FOE.41.018.031.22 |
| Tengviel Edwin Daaro | FOE.41.018.115.22 |
| Sowah Arnold Nii Adjetey | FOE.41.018.110.22 |

**Supervisor:** Mr Mohammed Yussif Umaru
**Institution:** University of Mines and Technology, Tarkwa, Ghana
**Year:** 2026
