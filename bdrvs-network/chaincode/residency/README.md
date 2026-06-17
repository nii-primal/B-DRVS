# Incorporating the challenge-response work into B-DRVS

All files below go into: `bdrvs-network/chaincode/residency/`

## File roles

| File | Action | Notes |
|------|--------|-------|
| `residency.go` | **Replace** your existing one | Full file: original + determinism fix + anti-replay + self-report gate + record fields. Superset of all earlier changes. |
| `verified.go` | **Add (new)** | Challenge-response: RegisterVerifier, SubmitVerifiedCheckIn, GetAllVerifiers. |
| `residency_test.go` | **Add (new)** | Defines the mock Fabric stub + signing helpers. **Required** by the other two test files. |
| `verified_test.go` | **Add (new)** | Tests for the verified path. Won't compile without residency_test.go. |
| `simulation_test.go` | **Add (new, optional)** | Chapter 4 evaluation harness. Also needs residency_test.go. |
| `analyse_sim.py` | Optional | Generates Chapter 4 figures from the harness output. |
| `residency_all_changes.diff` | Review only | Unified diff of every change to residency.go vs. your original. |

> Dependency: `verified_test.go` and `simulation_test.go` both rely on helpers in
> `residency_test.go`. Take all three test files or none — never verified_test.go alone.

## Steps

1. Branch first:  `git checkout -b feature/challenge-response`
2. Copy the five `.go` files into `bdrvs-network/chaincode/residency/` (overwrite residency.go, add the rest).
3. Review:  `git diff` (residency_all_changes.diff shows residency.go specifically).
4. Verify it builds + passes:
   ```
   cd bdrvs-network/chaincode/residency
   GOFLAGS=-mod=vendor go vet ./...
   GOFLAGS=-mod=vendor go test ./...        # expect: ok, 17 tests
   ```
5. (Optional) Regenerate Chapter 4 data:
   ```
   BDRVS_SIM_OUT=./simout go test -run TestMigrationSimulation -v
   python3 analyse_sim.py
   ```
6. Redeploy the chaincode so Fabric picks up the new package — bump the version
   AND the sequence:
   ```
   peer lifecycle chaincode package ...
   peer lifecycle chaincode install ...
   peer lifecycle chaincode approveformyorg --version 1.1 --sequence 2 ...   # both orgs
   peer lifecycle chaincode commit        --version 1.1 --sequence 2 ...
   ```
7. Commit on the branch, push, open a PR, review, merge.

## Production posture

`InitLedger` leaves self-reported check-ins **enabled** for prototype/demo
compatibility. To enforce the hardened model (only verifier-attested check-ins
accepted), invoke once after deployment:

```
peer chaincode invoke ... -c '{"function":"SetSelfReportEnabled","Args":["false"]}'
```

## Still TODO (off-chain — not in these files)

The verified path now exists in the chaincode but nothing drives it yet:
1. Verifier service (NITA): issue nonce, measure RTT, observe IP, sign attestation.
2. Agent challenge responder: sign the nonce, report storage.
3. Gateway route: `/api/verified-checkin` -> SubmitVerifiedCheckIn (routes.js only
   calls SubmitCheckIn today).
4. End-to-end localhost test proving the Python<->Go canonical strings byte-match.
