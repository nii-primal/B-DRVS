# Tier 2 — Smart Contract (Chaincode)

## Overview
Go-based chaincode deployed on the Hyperledger Fabric network.
It automatically validates incoming location metadata and records
a tamper-proof compliance or violation decision on the blockchain.

## Responsibilities
- Verify ECDSA signature of incoming probing agent payload
- Compare reported IP address against AFRINIC Ghana IP whitelist
- Compare reported RTT against domestic threshold (< 50ms)
- Record Compliant or Sovereignty Violation status on the ledger
- Emit smart contract events to trigger dashboard alerts

## Tech Stack
- Go (Golang)
- Hyperledger Fabric Chaincode Interface
- AFRINIC Ghana IP Range Registry

## Files
- `residency.go` — main chaincode logic
- `validation.go` — IP and RTT validation functions
- `go.mod` — Go module dependencies
