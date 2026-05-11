# Tier 3 — Administrative Dashboard

## Overview
A web-based React.js application that provides the Ministry of 
Health with a real-time visual interface for monitoring the 
residency compliance status of all tracked health servers.

## Responsibilities
- Display real-time compliance status of all monitored servers
- Render a geographic compliance map with green/red server markers
- Show latency trend graphs and compliance timelines
- Trigger and display automated violation alerts
- Export tamper-proof compliance reports for legal proceedings

## Tech Stack
- React.js
- Chart.js (graphs and timelines)
- Node.js / Express (backend API)
- Hyperledger Fabric SDK for Node.js

## Pages
- `/` — main compliance dashboard and server status overview
- `/map` — geographic compliance map
- `/alerts` — violation alerts and notifications
- `/reports` — evidence export and compliance report generation
- `/servers` — registered health server management
