# Tier 1 — Probing Agent

## Overview
A lightweight Python script deployed on the vendor's health server. 
It continuously collects network metadata and generates a 
cryptographically signed Proof of Location payload.

## Responsibilities
- Collect the server's public IP address via external lookup service
- Measure Round-Trip Time (RTT) latency to the NITA Verifier Node
- Hash and sign each metadata packet using ECDSA private key
- Transmit signed payload to the blockchain via REST API gateway

## Tech Stack
- Python 3.11
- cryptography library (ECDSA signing)
- requests library (HTTP transmission)

## Files
- `agent.py` — main probing script
- `signer.py` — ECDSA signing module
- `config.py` — configuration (verifier node IP, interval, gateway URL)
- `requirements.txt` — Python dependencies
