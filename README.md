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
## Project Structure
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
### ✅ Phase 1 — Environment & Blockchain Network Setup
- Docker installed and running
- Hyperledger Fabric 2.x binaries downloaded
- MoH peer node configured
- NITA peer node configured
- Orderer configured
- Channel created
- Both organisations joined the channel

### 🔄 Phase 2 — Smart Contract (Go Chaincode)
- In progress

### ⏳ Phase 3 — Python Probing Agent
- Pending

### ⏳ Phase 4 — REST API Gateway
- Pending

### ⏳ Phase 5 — React Dashboard
- Pending

### ⏳ Phase 6 — Testing & Simulation
- Pending

## How to Run
*Setup instructions will be added as each phase is completed.*

## Institution
University of Mines and Technology (UMaT), Tarkwa, Ghana
Department of Cybersecurity and Information Systems
April 2026
