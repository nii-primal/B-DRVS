# Tier 2 — Hyperledger Fabric Network

## Overview
A permissioned blockchain network configured with two 
organisations: the Ministry of Health (MoH) and the National 
Information Technology Agency (NITA). Both organisations must 
independently endorse every transaction before it is committed 
to the ledger.

## Responsibilities
- Host peer nodes for MoH and NITA organisations
- Configure orderer for transaction ordering and block creation
- Define channel and membership policies
- Deploy and instantiate the residency verification chaincode

## Tech Stack
- Hyperledger Fabric 2.x
- Docker / Docker Compose
- CouchDB (state database)

## Files
- `docker-compose.yml` — network orchestration
- `configtx.yaml` — channel and organisation configuration
- `crypto-config.yaml` — cryptographic identity generation
- `scripts/` — network startup and teardown scripts
