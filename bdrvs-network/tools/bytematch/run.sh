#!/usr/bin/env sh
# Run the full byte-match harness: Python signs, Go verifies.
set -e
python3 sign_payload.py
echo "--- go ---"
go run verify_payload.go
