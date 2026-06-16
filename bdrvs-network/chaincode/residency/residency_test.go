package main

import (
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"encoding/json"
	"encoding/pem"
	"fmt"
	"strings"
	"testing"
	"time"

	"github.com/golang/protobuf/ptypes/timestamp"
	"github.com/hyperledger/fabric-chaincode-go/shim"
	"github.com/hyperledger/fabric-contract-api-go/contractapi"
)

// ── Minimal mock: only the stub methods SubmitCheckIn / RegisterServer touch ──
type mockStub struct {
	shim.ChaincodeStubInterface
	state  map[string][]byte
	ts     *timestamp.Timestamp
	events map[string][]byte
}

func newMockStub(t time.Time) *mockStub {
	return &mockStub{
		state:  map[string][]byte{},
		events: map[string][]byte{},
		ts:     &timestamp.Timestamp{Seconds: t.Unix(), Nanos: int32(t.Nanosecond())},
	}
}
func (m *mockStub) setTxTime(t time.Time) {
	m.ts = &timestamp.Timestamp{Seconds: t.Unix(), Nanos: int32(t.Nanosecond())}
}
func (m *mockStub) GetState(k string) ([]byte, error)            { return m.state[k], nil }
func (m *mockStub) PutState(k string, v []byte) error            { m.state[k] = v; return nil }
func (m *mockStub) GetTxTimestamp() (*timestamp.Timestamp, error) { return m.ts, nil }
func (m *mockStub) SetEvent(n string, p []byte) error            { m.events[n] = p; return nil }

type mockCtx struct {
	contractapi.TransactionContextInterface
	stub *mockStub
}

func (c *mockCtx) GetStub() shim.ChaincodeStubInterface { return c.stub }

// ── Helpers ──────────────────────────────────────────────────────────────────
func makeKey(t *testing.T) (*ecdsa.PrivateKey, string) {
	t.Helper()
	priv, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	der, err := x509.MarshalPKIXPublicKey(&priv.PublicKey)
	if err != nil {
		t.Fatal(err)
	}
	return priv, string(pem.EncodeToMemory(&pem.Block{Type: "PUBLIC KEY", Bytes: der}))
}

func signedPayload(t *testing.T, priv *ecdsa.PrivateKey, serverID, ip string, rtt, sl, sj float64, ts string) string {
	t.Helper()
	canonical := fmt.Sprintf("%s|%s|%.4f|%.4f|%.4f|%s", serverID, ip, rtt, sl, sj, ts)
	h := sha256.Sum256([]byte(canonical))
	der, err := ecdsa.SignASN1(rand.Reader, priv, h[:])
	if err != nil {
		t.Fatal(err)
	}
	p := CheckInPayload{
		ServerID: serverID, PublicIP: ip, RTTms: rtt,
		StorageLatencyMs: sl, StorageJitterMs: sj, Timestamp: ts,
		Signature: base64.StdEncoding.EncodeToString(der),
	}
	b, _ := json.Marshal(p)
	return string(b)
}

const (
	srv     = "LHIMS-TEST-01"
	ghanaIP = "41.66.192.5" // inside 41.66.192.0/18 (Telecel Ghana)
	fgnIP   = "8.8.8.8"
)

func setup(t *testing.T, txTime time.Time) (*ResidencyContract, *mockCtx, *ecdsa.PrivateKey) {
	t.Helper()
	c := new(ResidencyContract)
	stub := newMockStub(txTime)
	ctx := &mockCtx{stub: stub}
	priv, pemStr := makeKey(t)
	if err := c.RegisterServer(ctx, srv, pemStr, "Test Vendor"); err != nil {
		t.Fatalf("RegisterServer failed: %v", err)
	}
	return c, ctx, priv
}

// ── Tests ────────────────────────────────────────────────────────────────────

func TestFreshCompliantCheckInAccepted(t *testing.T) {
	tx := time.Date(2026, 5, 12, 12, 0, 0, 0, time.UTC)
	c, ctx, priv := setup(t, tx)
	ts := tx.Format(time.RFC3339)
	rec, err := c.SubmitCheckIn(ctx, signedPayload(t, priv, srv, ghanaIP, 12, 1.0, 0.2, ts))
	if err != nil {
		t.Fatalf("expected success, got error: %v", err)
	}
	if rec.Status != "COMPLIANT" {
		t.Fatalf("expected COMPLIANT, got %s (%s)", rec.Status, rec.ViolationReason)
	}
}

func TestReplayOfSamePayloadRejected(t *testing.T) {
	tx := time.Date(2026, 5, 12, 12, 0, 0, 0, time.UTC)
	c, ctx, priv := setup(t, tx)
	ts := tx.Format(time.RFC3339)
	payload := signedPayload(t, priv, srv, ghanaIP, 12, 1.0, 0.2, ts)

	if _, err := c.SubmitCheckIn(ctx, payload); err != nil {
		t.Fatalf("first submit should succeed: %v", err)
	}
	// Replay the *identical* signed payload at a later tx time.
	ctx.stub.setTxTime(tx.Add(2 * time.Minute))
	_, err := c.SubmitCheckIn(ctx, payload)
	if err == nil || !strings.Contains(err.Error(), "replay") {
		t.Fatalf("expected replay rejection, got: %v", err)
	}
}

func TestOlderTimestampRejected(t *testing.T) {
	tx := time.Date(2026, 5, 12, 12, 0, 0, 0, time.UTC)
	c, ctx, priv := setup(t, tx)

	// Accept a check-in at 12:00.
	if _, err := c.SubmitCheckIn(ctx, signedPayload(t, priv, srv, ghanaIP, 12, 1.0, 0.2, tx.Format(time.RFC3339))); err != nil {
		t.Fatalf("first submit should succeed: %v", err)
	}
	// Now submit an *earlier* (but freshly signed, in-window) timestamp.
	older := tx.Add(-1 * time.Minute)
	ctx.stub.setTxTime(tx.Add(1 * time.Minute))
	_, err := c.SubmitCheckIn(ctx, signedPayload(t, priv, srv, ghanaIP, 12, 1.0, 0.2, older.Format(time.RFC3339)))
	if err == nil || !strings.Contains(err.Error(), "replay") {
		t.Fatalf("expected non-monotonic rejection, got: %v", err)
	}
}

func TestStaleCheckInRejected(t *testing.T) {
	tx := time.Date(2026, 5, 12, 12, 0, 0, 0, time.UTC)
	c, ctx, priv := setup(t, tx)
	// Agent timestamp 10 minutes behind ledger time; window is 300s.
	stale := tx.Add(-10 * time.Minute).Format(time.RFC3339)
	_, err := c.SubmitCheckIn(ctx, signedPayload(t, priv, srv, ghanaIP, 12, 1.0, 0.2, stale))
	if err == nil || !strings.Contains(err.Error(), "stale") {
		t.Fatalf("expected stale rejection, got: %v", err)
	}
}

func TestFutureCheckInRejected(t *testing.T) {
	tx := time.Date(2026, 5, 12, 12, 0, 0, 0, time.UTC)
	c, ctx, priv := setup(t, tx)
	future := tx.Add(10 * time.Minute).Format(time.RFC3339)
	_, err := c.SubmitCheckIn(ctx, signedPayload(t, priv, srv, ghanaIP, 12, 1.0, 0.2, future))
	if err == nil || !strings.Contains(err.Error(), "future") {
		t.Fatalf("expected future-dated rejection, got: %v", err)
	}
}

func TestForeignIPProducesViolationNotError(t *testing.T) {
	tx := time.Date(2026, 5, 12, 12, 0, 0, 0, time.UTC)
	c, ctx, priv := setup(t, tx)
	rec, err := c.SubmitCheckIn(ctx, signedPayload(t, priv, srv, fgnIP, 12, 1.0, 0.2, tx.Format(time.RFC3339)))
	if err != nil {
		t.Fatalf("foreign IP should record a violation, not error: %v", err)
	}
	if rec.Status != "SOVEREIGNTY_VIOLATION" {
		t.Fatalf("expected SOVEREIGNTY_VIOLATION, got %s", rec.Status)
	}
}

func TestTamperedPayloadRejected(t *testing.T) {
	tx := time.Date(2026, 5, 12, 12, 0, 0, 0, time.UTC)
	c, ctx, priv := setup(t, tx)
	ts := tx.Format(time.RFC3339)
	payload := signedPayload(t, priv, srv, ghanaIP, 12, 1.0, 0.2, ts)
	// Tamper: swap the Ghana IP for a foreign one after signing.
	tampered := strings.Replace(payload, ghanaIP, fgnIP, 1)
	_, err := c.SubmitCheckIn(ctx, tampered)
	if err == nil || !strings.Contains(err.Error(), "signature") {
		t.Fatalf("expected signature rejection on tampered payload, got: %v", err)
	}
}
