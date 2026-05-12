# B-DRVS — Blockchain-Based Data Residency Verification System

## Overview
A blockchain-based framework designed to enforce health data sovereignty 
in Ghana by providing continuous, real-time, and tamper-proof verification 
of where health data is physically hosted. Built as a final year project at 
the University of Mines and Technology (UMaT), Tarkwa.

## The Problem
Ghana's Data Protection Act (2012) requires health data to remain under 
sovereign control. However, the Ministry of Health currently relies on 
periodic manual audits to verify data residency — leaving the system blind 
to unauthorized data migrations between inspection intervals. The 2025 
Lightwave dispute revealed that neither the government nor the vendor could 
independently verify where patient data was hosted.

## Our Solution
B-DRVS replaces manual audits with a three-tier automated system:
- A Python probing agent that continuously collects and signs server location metadata
- A Hyperledger Fabric blockchain with smart contracts that automatically validates residency
- A React.js dashboard that gives regulators a real-time compliance monitoring interface

## System Architecture

The system is structured across three tiers:

**Tier 1 — Probing Agent**
A Python script installed on the vendor health server. Collects the server's
public IP address and RTT latency, signs the data cryptographically using 
ECDSA, and transmits it to the blockchain.

**Tier 2 — Blockchain & Smart Contracts**
A permissioned Hyperledger Fabric network with peer nodes operated by the 
Ministry of Health and NITA. A Go-based smart contract automatically validates 
each submission against Ghana's IP whitelist and RTT threshold, then records 
a permanent Compliant or Sovereignty Violation decision on the ledger.

**Tier 3 — Administrative Dashboard**
A React.js web application that translates blockchain records into a real-time 
compliance monitoring interface for Ministry of Health regulators. Displays 
server locations on a map, triggers violation alerts, and exports tamper-proof 
evidence reports.

## Project Structure

| Folder | Tier | Description |
|--------|------|-------------|
| probing-agent/ | Tier 1 | Python probing agent for metadata collection and signing |
| chaincode/ | Tier 2 | Go smart contract for automated residency validation |
| fabric-network/ | Tier 2 | Hyperledger Fabric network configuration and deployment |
| api-gateway/ | Tier 2/3 | Node.js REST API gateway connecting all system components |
| dashboard/ | Tier 3 | React.js administrative dashboard for regulators |
| docs/ | — | Project report, diagrams, and documentation |

## Tech Stack

| Component | Technology |
|-----------|------------|
| Probing Agent | Python 3.11 |
| Blockchain | Hyperledger Fabric 2.x |
| Smart Contract | Go (Golang) |
| API Gateway | Node.js / Express |
| Dashboard | React.js / Chart.js |
| Containerisation | Docker / Docker Compose |
| IP Geolocation | MaxMind GeoLite2 |
| OS | Parrot OS (Debian-based) |

## Team

| Name | Student ID | Responsibility |
|------|------------|----------------|
| Ahinakwa Eugene Nii Okai | FOE.41.018.016.22 | — |
| Boateng Theophilus Oware | FOE.41.018.046.22 | — |
| Arthur Cephas Ebo | FOE.41.018.031.22 | — |
| Tengviel Edwin Daaro | FOE.41.018.115.22 | — |
| Sowah Arnold Nii Adjetey | FOE.41.018.110.22 | — |

## Supervisor
Mr. Mohammed Yussif Umaru
Department of Cybersecurity and Information Systems
University of Mines and Technology, Tarkwa

## Implementation Progress

| Phase | Description | Status | Date | Notes |
|-------|-------------|--------|------|-------|
| Phase 1 | Environment and Blockchain Network Setup | ✅ Complete | 11 May 2026 | Docker, Fabric network, MoH and NITA nodes configured |
| Phase 2 | Smart Contract — Go Chaincode | 🔄 Deployed | 12 May 2026 | Validation logic written and deployed — awaiting Probing Agent integration |
| Phase 3 | Python Probing Agent | ⏳ Pending | — | — |
| Phase 4 | REST API Gateway | ⏳ Pending | — | — |
| Phase 5 | React.js Administrative Dashboard | ⏳ Pending | — | — |
| Phase 6 | Testing and Simulation | ⏳ Pending | — | — |

## How to Run
Setup and deployment instructions will be added as each phase is completed.

## Institution
University of Mines and Technology (UMaT), Tarkwa, Ghana
Department of Cybersecurity and Information Systems
April 2026
