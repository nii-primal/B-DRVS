# Tier 2/3 — REST API Gateway

## Overview
A Node.js/Express server that acts as the bridge between the 
Python Probing Agent and the Hyperledger Fabric blockchain network.
It also serves as the backend for the administrative dashboard.

## Responsibilities
- Receive signed payloads from the probing agent
- Package and submit transaction proposals to Fabric peer nodes
- Collect endorsements and commit transactions to the ledger
- Expose REST API endpoints for the dashboard frontend
- Subscribe to smart contract events for real-time alert delivery

## Tech Stack
- Node.js
- Express.js
- Hyperledger Fabric SDK for Node.js
- REST API

## Endpoints
- `POST /submit` — receive and submit probing agent payload
- `GET /records` — retrieve all compliance records
- `GET /records/:serverID` — retrieve records for a specific server
- `GET /violations` — retrieve all violation records
