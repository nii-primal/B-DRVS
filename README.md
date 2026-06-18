# B-DRVS — Blockchain-Based Data Residency Verification System

**Proving where Ghana's health data actually lives — continuously, automatically, and in a way no one can quietly tamper with.**

A final-year project for the Department of Cybersecurity and Information Systems, University of Mines and Technology (UMaT), Tarkwa.

---

## The problem in plain language

When a Ghanaian hospital uses a digital health system (like LHIMS), the patient records are often stored on servers run by a private company. The law says that data should stay inside Ghana — but today there is no reliable way for the government to *check* that this is actually happening.

The way it works now is that the vendor simply *tells* the Ministry of Health where the data is, and an inspector visits every now and then to confirm. That leaves long blind spots. In the 2025 dispute between the Ministry of Health and Lightwave Technologies, nobody could prove whether the data was in Accra or in India — it came down to one side's word against the other's.

**B-DRVS closes that gap.** It quietly and constantly watches each health server, works out where it really is, and writes that result into a tamper-proof record. If a server ever moves outside Ghana, the system flags it immediately and keeps permanent evidence the government can use.

---

## How it works (the short version)

The system has three parts working together:

1. **A small "probe"** that sits with each health server and regularly reports back signals about where it is (its internet address and how fast it responds).
2. **A blockchain** that takes those reports, automatically decides whether the server is compliant or in violation, and locks the result into a permanent record that can't be edited or deleted afterwards.
3. **A dashboard** that turns all of this into a simple screen for Ministry of Health staff — a map, alerts, charts, and downloadable evidence reports.

If everything checks out, the server is marked **Compliant** (green). If the data has wandered outside Ghana, it's marked a **Sovereignty Violation** (red), and the evidence is preserved.

---

## What's been built so far ✅

The working prototype is up and running. Here's what it currently does:

- **Live monitoring dashboard** showing, at a glance, how many servers are being watched, how many are compliant, and how many are in violation.
- **A map of Ghana** that drops a green or red marker on each health server depending on whether it's behaving — so the whole picture is visible in one look.
- **Automatic violation detection.** The system already correctly catches a server whose internet address is outside Ghana and flags it as a sovereignty violation, without any human having to decide.
- **A permanent, tamper-proof record** of every check-in. Each result — good or bad — is written to the blockchain and shown in an "Immutable Audit Trail" that can't be altered after the fact.
- **A dedicated Violations page** listing every recorded breach, with the reason spelled out (e.g. *"IP 13.250.45.10 is not in a Ghanaian network range"*) and a search/filter box.
- **Per-server detail pages** with response-time and storage-speed trend charts, a compliance rate, and a full history.
- **"Export Evidence Report" button** that packages up the proof — ready for use in a dispute, an investigation, or legal proceedings.
- **Storage-location checking**, an extra safeguard beyond the original plan, that also watches whether a server's storage is local or foreign.
- Built on **Hyperledger Fabric 2.5** (the permissioned/government-grade blockchain) with a **React** dashboard.

In short: a person can open the dashboard, see every monitored server, spot a violation the moment it happens, and download hard evidence of it.

---

## What's still left to do 🚧

The prototype proves the concept. To take it from a demo to something the Ministry could rely on day-to-day, the following still needs doing:

- **Use more than one checkpoint.** Right now location is confirmed from a single reference point in Accra. Adding reference points in other cities (e.g. Kumasi and Tamale) would let the system triangulate location far more accurately and make it much harder to fool.
- **Stronger anti-cheating defences.** A determined vendor could try to disguise a server's true location. Planned additions include tracing the actual network path the data travels and inspecting deeper technical fingerprints — so a single trick isn't enough to slip through.
- **Hardware-level proof of location.** A future version could tie verification to a physical chip inside the server (hardware attestation), which is extremely difficult to fake or move.
- **Bring in a third independent watchdog.** Adding the Data Protection Commission as its own node would mean no single party — not even the government or the vendor — could quietly change the records alone.
- **Automatic alerts.** Sending instant notifications (email/SMS) to the right officials the moment a violation is recorded, rather than relying on someone watching the screen.
- **Finish the "Register Server" workflow** so new health servers can be onboarded smoothly from the dashboard.
- **User accounts and access control** for the dashboard, so only authorised staff can log in and act.
- **Real-world deployment and testing** against actual Ministry-style infrastructure, beyond the current simulated environment.

---

## Tech stack (for the developers)

| Part | Technology |
|------|------------|
| Probing agent | Python 3.11 (collects IP + round-trip time, ECDSA-signed) |
| Blockchain | Hyperledger Fabric 2.5 |
| Smart contracts (chaincode) | Go |
| Dashboard frontend | React.js + Vite |
| Dashboard backend | Node.js / Express (Fabric SDK) |
| Charts & maps | Chart.js / web mapping |
| Geolocation data | MaxMind GeoLite2 + AFRINIC ranges |
| Containerisation | Docker / Docker Compose |

---

## Project structure

> _Update this section to match the actual folders in the repo._

```
/agent        # Tier 1 — Python probing agent
/chaincode    # Tier 2 — Go smart contracts (residency rules)
/network      # Tier 2 — Hyperledger Fabric network config & scripts
/dashboard    # Tier 3 — React frontend + Node/Express backend
/docs         # Project report and diagrams
```

---

## Getting started

> _Fill in once the run scripts are finalised._

```bash
# 1. Start the blockchain network
cd network && ./startFabric.sh

# 2. Deploy the smart contract
./deployChaincode.sh

# 3. Start the dashboard backend
cd ../dashboard/backend && npm install && npm start

# 4. Start the dashboard frontend
cd ../frontend && npm install && npm run dev   # http://localhost:5173

# 5. Run the probing agent
cd ../../agent && python3 agent.py
```

---

## Team

- Ahinakwa Eugene Nii Okai
- Boateng Theophilus Oware
- Arthur Cephas Ebo
- Tengviel Edwin Daaro
- Sowah Arnold Nii Adjetey

**Supervisor:** Mr Mohammed Yussif Umaru

University of Mines and Technology (UMaT), Tarkwa — BSc Cybersecurity, April 2026.

---

## A note on scope

This is a **proof-of-concept**. It runs in a simulated/test setup using private cloud servers rather than the Ministry's live systems, and it's meant to demonstrate that continuous, tamper-proof data-residency verification is achievable — not to be deployed in production as-is. The "What's still left to do" list above is the roadmap toward a production-ready system.
