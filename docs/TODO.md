
## Verified-path IP guard inconsistency (found 2026-07-01)
- SubmitCheckIn (self-report, residency.go ~line 413) has the STEP 2a guard
  that rejects private/loopback/link-local IPs as INVALID_INPUT.
- SubmitVerifiedCheckIn (verified.go) does NOT have this guard. A localhost
  test showed 127.0.0.1 recorded as SOVEREIGNTY_VIOLATION ("not in Ghanaian
  range") rather than rejected as invalid input.
- Decision needed: add the same non-routable-IP guard to verified.go for
  consistency, OR document why the two paths differ. Leaning toward adding
  the guard (cleaner, removes examiner thread).
- Not a blocker: violation-path result stands; loopback can't produce a
  valid COMPLIANT anyway (IP must be genuine).
