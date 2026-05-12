// =============================================================================
// B-DRVS Residency Smart Contract (Chaincode)
// University of Mines and Technology, Tarkwa — BSc Cybersecurity 2026
//
// This chaincode implements the Tier 2 logic of the B-DRVS framework:
//   1. RegisterServer  — registers a health server and its ECDSA public key
//   2. SubmitCheckIn   — validates a signed location proof from the probing agent
//                        against Ghana IP whitelist + RTT threshold, then records
//                        COMPLIANT or SOVEREIGNTY_VIOLATION to the immutable ledger
//   3. Query functions — dashboard and audit trail access
// =============================================================================

package main

import (
	"crypto/ecdsa"
	"crypto/sha256"
	"crypto/x509"
	"encoding/asn1"
	"encoding/base64"
	"encoding/json"
	"encoding/pem"
	"fmt"
	"math/big"
	"net"
	"strings"
	"time"

	"github.com/hyperledger/fabric-contract-api-go/contractapi"
)

// =============================================================================
// Data Types
// =============================================================================

// ResidencyContract is the main smart contract struct
type ResidencyContract struct {
	contractapi.Contract
}

// ServerRecord is stored on the ledger when a health server is registered.
// Key: "SERVER_<serverID>"
type ServerRecord struct {
	DocType      string `json:"docType"`      // "SERVER"
	ServerID     string `json:"serverID"`
	PublicKeyPEM string `json:"publicKeyPEM"` // ECDSA P-256 public key in PEM format
	OwnerOrg     string `json:"ownerOrg"`     // e.g. "Lightwave Technologies"
	RegisteredAt string `json:"registeredAt"` // UTC timestamp
	Active       bool   `json:"active"`
}

// CheckInPayload is the signed packet sent by the Tier 1 Probing Agent.
// The agent hashes (SHA-256) the canonical string:
//   "<serverID>|<publicIP>|<rttMs>|<timestamp>"
// and signs that hash with its ECDSA private key.
type CheckInPayload struct {
	ServerID  string  `json:"serverID"`
	PublicIP  string  `json:"publicIP"`
	RTTms     float64 `json:"rttMs"`      // Round-Trip Time to NITA Verifier Node (ms)
	Timestamp string  `json:"timestamp"`  // UTC ISO-8601
	Signature string  `json:"signature"`  // Base64-encoded DER ECDSA signature
}

// ResidencyRecord is the immutable record written to the ledger after each check-in.
// Key: "RECORD_<serverID>_<timestamp>"
type ResidencyRecord struct {
	DocType         string  `json:"docType"`         // "RECORD"
	RecordID        string  `json:"recordID"`
	ServerID        string  `json:"serverID"`
	Timestamp       string  `json:"timestamp"`       // from agent payload
	BlockTime       string  `json:"blockTime"`       // when committed to ledger
	PublicIP        string  `json:"publicIP"`
	RTTms           float64 `json:"rttMs"`
	IPStatus        string  `json:"ipStatus"`        // "GHANA" | "FOREIGN"
	RTTStatus       string  `json:"rttStatus"`       // "WITHIN_THRESHOLD" | "EXCEEDED"
	Status          string  `json:"status"`          // "COMPLIANT" | "SOVEREIGNTY_VIOLATION"
	ViolationReason string  `json:"violationReason"` // empty if compliant
	PayloadHash     string  `json:"payloadHash"`     // SHA-256 of the signed payload string
}

// NetworkConfig holds the adjustable residency rules stored on the ledger.
// Key: "NETWORK_CONFIG"
type NetworkConfig struct {
	DocType        string   `json:"docType"` // "CONFIG"
	GhanaIPRanges  []string `json:"ghanaIPRanges"`
	RTTThresholdMs float64  `json:"rttThresholdMs"`
	UpdatedAt      string   `json:"updatedAt"`
}

// =============================================================================
// Default Ghana IP Ranges
// Source: AFRINIC registry allocations to Ghanaian ISPs and government entities
// These can be updated at runtime via AddGhanaIPRange()
// =============================================================================

var defaultGhanaIPRanges = []string{
	// Vodafone Ghana (formerly Ghana Telecom)
	"41.57.0.0/16",
	"196.6.0.0/20",

	// MTN Ghana
	"41.66.128.0/17",
	"154.120.0.0/17",

	// AirtelTigo Ghana
	"41.189.192.0/18",

	// Surfline Communications
	"197.255.224.0/19",

	// NITA (National Information Technology Agency) — Verifier Node host
	"41.206.0.0/16",

	// Busy Internet / Broadband Home
	"41.215.240.0/20",

	// IPX / Comsys
	"45.220.96.0/22",

	// African general allocations used by Ghanaian entities
	"154.160.0.0/12",
	"196.201.208.0/20",
	"197.157.0.0/16",

	// Private / RFC-1918 ranges — used in local test deployments
	// Remove these in production
	"10.0.0.0/8",
	"172.16.0.0/12",
	"192.168.0.0/16",
	"127.0.0.0/8",
}

// Default RTT threshold: 50ms
// Based on the physical limitations of fibre-optic propagation within Accra.
// Intra-city RTT reliably stays below 50ms; values above this strongly suggest
// the server is not physically located within Ghana.
const defaultRTTThresholdMs = 50.0

// =============================================================================
// Initialisation
// =============================================================================

// InitLedger seeds the blockchain with default configuration (Ghana IP ranges
// and RTT threshold). Called once when the chaincode is instantiated.
func (c *ResidencyContract) InitLedger(ctx contractapi.TransactionContextInterface) error {
	config := NetworkConfig{
		DocType:        "CONFIG",
		GhanaIPRanges:  defaultGhanaIPRanges,
		RTTThresholdMs: defaultRTTThresholdMs,
		UpdatedAt:      time.Now().UTC().Format(time.RFC3339),
	}

	configJSON, err := json.Marshal(config)
	if err != nil {
		return fmt.Errorf("failed to marshal network config: %w", err)
	}

	if err := ctx.GetStub().PutState("NETWORK_CONFIG", configJSON); err != nil {
		return fmt.Errorf("failed to write network config to ledger: %w", err)
	}

	fmt.Println("[B-DRVS] Ledger initialised with default Ghana IP whitelist and RTT threshold.")
	return nil
}

// =============================================================================
// Server Registration
// =============================================================================

// RegisterServer records a health server on the ledger along with its ECDSA
// public key. Only check-ins signed with this key will be accepted.
//
// Args:
//   serverID     — unique identifier (e.g. "LHIMS-KORLE-BU-01")
//   publicKeyPEM — ECDSA P-256 public key in PEM format (generated on the server)
//   ownerOrg     — name of the vendor organisation
func (c *ResidencyContract) RegisterServer(
	ctx contractapi.TransactionContextInterface,
	serverID string,
	publicKeyPEM string,
	ownerOrg string,
) error {
	// Prevent duplicate registration
	existing, err := ctx.GetStub().GetState("SERVER_" + serverID)
	if err != nil {
		return fmt.Errorf("failed to read ledger: %w", err)
	}
	if existing != nil {
		return fmt.Errorf("server '%s' is already registered", serverID)
	}

	// Validate the PEM key can actually be parsed
	if _, err := parsePEMPublicKey(publicKeyPEM); err != nil {
		return fmt.Errorf("invalid public key PEM: %w", err)
	}

	record := ServerRecord{
		DocType:      "SERVER",
		ServerID:     serverID,
		PublicKeyPEM: publicKeyPEM,
		OwnerOrg:     ownerOrg,
		RegisteredAt: time.Now().UTC().Format(time.RFC3339),
		Active:       true,
	}

	recordJSON, err := json.Marshal(record)
	if err != nil {
		return fmt.Errorf("failed to marshal server record: %w", err)
	}

	if err := ctx.GetStub().PutState("SERVER_"+serverID, recordJSON); err != nil {
		return fmt.Errorf("failed to write server record: %w", err)
	}

	fmt.Printf("[B-DRVS] Server registered: %s (owner: %s)\n", serverID, ownerOrg)
	return nil
}

// =============================================================================
// Core Validation — SubmitCheckIn
// =============================================================================

// SubmitCheckIn is the primary transaction called by the Tier 1 Probing Agent.
// It receives a JSON-encoded CheckInPayload, runs the three-step validation
// sequence, and writes an immutable ResidencyRecord to the ledger.
//
// Validation sequence:
//   Step 1 — Verify ECDSA signature (proves the payload was not tampered with)
//   Step 2 — Check public IP against Ghana AFRINIC whitelist
//   Step 3 — Check RTT against domestic threshold (50ms default)
//
// On any failure: status = SOVEREIGNTY_VIOLATION + event emitted
// On full pass:   status = COMPLIANT
func (c *ResidencyContract) SubmitCheckIn(
	ctx contractapi.TransactionContextInterface,
	payloadJSON string,
) (*ResidencyRecord, error) {

	// ── Parse payload ─────────────────────────────────────────────────────────
	var payload CheckInPayload
	if err := json.Unmarshal([]byte(payloadJSON), &payload); err != nil {
		return nil, fmt.Errorf("invalid payload JSON: %w", err)
	}

	if payload.ServerID == "" || payload.PublicIP == "" || payload.Timestamp == "" {
		return nil, fmt.Errorf("payload missing required fields (serverID, publicIP, timestamp)")
	}

	// ── Load server record ────────────────────────────────────────────────────
	serverJSON, err := ctx.GetStub().GetState("SERVER_" + payload.ServerID)
	if err != nil {
		return nil, fmt.Errorf("ledger read error: %w", err)
	}
	if serverJSON == nil {
		return nil, fmt.Errorf("server '%s' is not registered — call RegisterServer first", payload.ServerID)
	}

	var server ServerRecord
	if err := json.Unmarshal(serverJSON, &server); err != nil {
		return nil, fmt.Errorf("failed to parse server record: %w", err)
	}
	if !server.Active {
		return nil, fmt.Errorf("server '%s' is deactivated", payload.ServerID)
	}

	// ── Load network config ───────────────────────────────────────────────────
	config, err := c.getNetworkConfig(ctx)
	if err != nil {
		return nil, err
	}

	// ── Build the canonical payload string (same format as agent signing) ─────
	// Format: "<serverID>|<publicIP>|<rttMs>|<timestamp>"
	canonicalStr := fmt.Sprintf("%s|%s|%.4f|%s",
		payload.ServerID, payload.PublicIP, payload.RTTms, payload.Timestamp)

	// Compute SHA-256 hash of canonical string (used for payloadHash field)
	hashBytes := sha256.Sum256([]byte(canonicalStr))
	payloadHash := base64.StdEncoding.EncodeToString(hashBytes[:])

	// ──────────────────────────────────────────────────────────────────────────
	// STEP 1: Cryptographic Signature Verification
	// Ensures the payload originated from the registered probing agent and
	// has not been tampered with in transit.
	// ──────────────────────────────────────────────────────────────────────────
	sigValid, sigErr := verifyECDSASignature(server.PublicKeyPEM, canonicalStr, payload.Signature)
	if sigErr != nil {
		return nil, fmt.Errorf("signature verification error: %w", sigErr)
	}
	if !sigValid {
		return nil, fmt.Errorf("invalid ECDSA signature — payload rejected as potentially spoofed")
	}

	// ──────────────────────────────────────────────────────────────────────────
	// STEP 2: IP Geolocation Check
	// Compares the reported public IP against the AFRINIC-sourced Ghana whitelist.
	// ──────────────────────────────────────────────────────────────────────────
	ipStatus := "GHANA"
	var violationReasons []string

	inGhana, ipErr := isIPInGhana(payload.PublicIP, config.GhanaIPRanges)
	if ipErr != nil {
		return nil, fmt.Errorf("IP validation error: %w", ipErr)
	}
	if !inGhana {
		ipStatus = "FOREIGN"
		violationReasons = append(violationReasons,
			fmt.Sprintf("IP %s does not resolve to a Ghanaian network range", payload.PublicIP))
	}

	// ──────────────────────────────────────────────────────────────────────────
	// STEP 3: RTT Latency Threshold Check
	// Compares observed RTT to the NITA Verifier Node against the domestic
	// threshold. A value greatly exceeding the threshold indicates the server
	// is unlikely to be physically located within Ghana.
	// ──────────────────────────────────────────────────────────────────────────
	rttStatus := "WITHIN_THRESHOLD"
	if payload.RTTms > config.RTTThresholdMs {
		rttStatus = "EXCEEDED"
		violationReasons = append(violationReasons,
			fmt.Sprintf("RTT %.2fms exceeds domestic threshold of %.2fms", payload.RTTms, config.RTTThresholdMs))
	}

	// ── Determine final compliance status ─────────────────────────────────────
	status := "COMPLIANT"
	violationReason := ""
	if len(violationReasons) > 0 {
		status = "SOVEREIGNTY_VIOLATION"
		violationReason = strings.Join(violationReasons, "; ")
	}

	// ── Build and persist the immutable record ────────────────────────────────
	recordID := fmt.Sprintf("RECORD_%s_%s", payload.ServerID, payload.Timestamp)
	record := ResidencyRecord{
		DocType:         "RECORD",
		RecordID:        recordID,
		ServerID:        payload.ServerID,
		Timestamp:       payload.Timestamp,
		BlockTime:       time.Now().UTC().Format(time.RFC3339),
		PublicIP:        payload.PublicIP,
		RTTms:           payload.RTTms,
		IPStatus:        ipStatus,
		RTTStatus:       rttStatus,
		Status:          status,
		ViolationReason: violationReason,
		PayloadHash:     payloadHash,
	}

	recordJSON, err := json.Marshal(record)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal residency record: %w", err)
	}

	if err := ctx.GetStub().PutState(recordID, recordJSON); err != nil {
		return nil, fmt.Errorf("failed to write residency record to ledger: %w", err)
	}

	// ── Emit event for dashboard real-time subscription ───────────────────────
	eventName := "COMPLIANT_CHECK_IN"
	if status == "SOVEREIGNTY_VIOLATION" {
		eventName = "SOVEREIGNTY_VIOLATION"
	}

	eventPayload, _ := json.Marshal(map[string]string{
		"recordID":        recordID,
		"serverID":        payload.ServerID,
		"status":          status,
		"violationReason": violationReason,
		"timestamp":       payload.Timestamp,
	})
	if err := ctx.GetStub().SetEvent(eventName, eventPayload); err != nil {
		// Non-fatal — log and continue
		fmt.Printf("[B-DRVS] Warning: failed to emit event %s: %s\n", eventName, err)
	}

	fmt.Printf("[B-DRVS] Check-in recorded: server=%s status=%s ip=%s rtt=%.2fms\n",
		payload.ServerID, status, payload.PublicIP, payload.RTTms)

	return &record, nil
}

// =============================================================================
// Query Functions
// =============================================================================

// GetRecord retrieves a single residency record by its ID.
func (c *ResidencyContract) GetRecord(
	ctx contractapi.TransactionContextInterface,
	recordID string,
) (*ResidencyRecord, error) {
	data, err := ctx.GetStub().GetState(recordID)
	if err != nil {
		return nil, fmt.Errorf("ledger read error: %w", err)
	}
	if data == nil {
		return nil, fmt.Errorf("record '%s' not found", recordID)
	}

	var record ResidencyRecord
	if err := json.Unmarshal(data, &record); err != nil {
		return nil, fmt.Errorf("failed to parse record: %w", err)
	}
	return &record, nil
}

// GetServerHistory returns all residency records for a given server.
// Used by the dashboard to render compliance timelines.
func (c *ResidencyContract) GetServerHistory(
	ctx contractapi.TransactionContextInterface,
	serverID string,
) ([]*ResidencyRecord, error) {
	// Range query on keys that start with RECORD_<serverID>_
	startKey := fmt.Sprintf("RECORD_%s_", serverID)
	endKey := fmt.Sprintf("RECORD_%s_~", serverID) // ~ is after all printable ASCII

	iterator, err := ctx.GetStub().GetStateByRange(startKey, endKey)
	if err != nil {
		return nil, fmt.Errorf("range query failed: %w", err)
	}
	defer iterator.Close()

	var records []*ResidencyRecord
	for iterator.HasNext() {
		result, err := iterator.Next()
		if err != nil {
			return nil, fmt.Errorf("iterator error: %w", err)
		}

		var record ResidencyRecord
		if err := json.Unmarshal(result.Value, &record); err != nil {
			continue // skip malformed records
		}
		records = append(records, &record)
	}

	return records, nil
}

// GetAllViolations returns all SOVEREIGNTY_VIOLATION records across all servers.
// Used by the dashboard compliance map to highlight red markers.
func (c *ResidencyContract) GetAllViolations(
	ctx contractapi.TransactionContextInterface,
) ([]*ResidencyRecord, error) {
	// Rich query (requires CouchDB in production; using range scan for LevelDB)
	iterator, err := ctx.GetStub().GetStateByRange("RECORD_", "RECORD_~")
	if err != nil {
		return nil, fmt.Errorf("range query failed: %w", err)
	}
	defer iterator.Close()

	var violations []*ResidencyRecord
	for iterator.HasNext() {
		result, err := iterator.Next()
		if err != nil {
			return nil, err
		}

		var record ResidencyRecord
		if err := json.Unmarshal(result.Value, &record); err != nil {
			continue
		}
		if record.Status == "SOVEREIGNTY_VIOLATION" {
			violations = append(violations, &record)
		}
	}

	return violations, nil
}

// GetLatestStatus returns the most recent check-in record for a server.
// Used by the dashboard to show the current compliance state.
func (c *ResidencyContract) GetLatestStatus(
	ctx contractapi.TransactionContextInterface,
	serverID string,
) (*ResidencyRecord, error) {
	records, err := c.GetServerHistory(ctx, serverID)
	if err != nil {
		return nil, err
	}
	if len(records) == 0 {
		return nil, fmt.Errorf("no check-in records found for server '%s'", serverID)
	}
	// Records are stored by timestamp key; the last one is the most recent
	return records[len(records)-1], nil
}

// GetComplianceStats returns a summary count for a server (total, compliant, violations).
// Used by the dashboard summary panel.
func (c *ResidencyContract) GetComplianceStats(
	ctx contractapi.TransactionContextInterface,
	serverID string,
) (string, error) {
	records, err := c.GetServerHistory(ctx, serverID)
	if err != nil {
		return "", err
	}

	total := len(records)
	compliant := 0
	violations := 0
	for _, r := range records {
		if r.Status == "COMPLIANT" {
			compliant++
		} else {
			violations++
		}
	}

	complianceRate := 0.0
	if total > 0 {
		complianceRate = float64(compliant) / float64(total) * 100
	}

	stats := map[string]interface{}{
		"serverID":       serverID,
		"total":          total,
		"compliant":      compliant,
		"violations":     violations,
		"complianceRate": fmt.Sprintf("%.1f%%", complianceRate),
	}
	statsJSON, err := json.Marshal(stats)
	if err != nil {
		return "", err
	}
	return string(statsJSON), nil
}

// GetNetworkConfigPublic exposes the current Ghana IP whitelist and RTT threshold.
func (c *ResidencyContract) GetNetworkConfigPublic(
	ctx contractapi.TransactionContextInterface,
) (*NetworkConfig, error) {
	return c.getNetworkConfig(ctx)
}

// =============================================================================
// Admin Functions
// =============================================================================

// UpdateRTTThreshold allows authorised regulators to adjust the domestic RTT limit.
// Call this if network infrastructure changes alter baseline Accra latency.
func (c *ResidencyContract) UpdateRTTThreshold(
	ctx contractapi.TransactionContextInterface,
	thresholdMs float64,
) error {
	if thresholdMs <= 0 || thresholdMs > 500 {
		return fmt.Errorf("threshold must be between 1ms and 500ms")
	}

	config, err := c.getNetworkConfig(ctx)
	if err != nil {
		return err
	}

	config.RTTThresholdMs = thresholdMs
	config.UpdatedAt = time.Now().UTC().Format(time.RFC3339)

	return c.saveNetworkConfig(ctx, config)
}

// AddGhanaIPRange appends a new CIDR block to the Ghana IP whitelist.
// Use this when AFRINIC allocates new ranges to Ghanaian entities.
func (c *ResidencyContract) AddGhanaIPRange(
	ctx contractapi.TransactionContextInterface,
	cidr string,
) error {
	// Validate CIDR format
	if _, _, err := net.ParseCIDR(cidr); err != nil {
		return fmt.Errorf("invalid CIDR notation '%s': %w", cidr, err)
	}

	config, err := c.getNetworkConfig(ctx)
	if err != nil {
		return err
	}

	// Check for duplicates
	for _, existing := range config.GhanaIPRanges {
		if existing == cidr {
			return fmt.Errorf("CIDR '%s' already exists in whitelist", cidr)
		}
	}

	config.GhanaIPRanges = append(config.GhanaIPRanges, cidr)
	config.UpdatedAt = time.Now().UTC().Format(time.RFC3339)

	fmt.Printf("[B-DRVS] Ghana IP range added: %s\n", cidr)
	return c.saveNetworkConfig(ctx, config)
}

// DeactivateServer marks a server as inactive so its check-ins are rejected.
func (c *ResidencyContract) DeactivateServer(
	ctx contractapi.TransactionContextInterface,
	serverID string,
) error {
	serverJSON, err := ctx.GetStub().GetState("SERVER_" + serverID)
	if err != nil || serverJSON == nil {
		return fmt.Errorf("server '%s' not found", serverID)
	}

	var server ServerRecord
	if err := json.Unmarshal(serverJSON, &server); err != nil {
		return err
	}

	server.Active = false
	updated, _ := json.Marshal(server)
	return ctx.GetStub().PutState("SERVER_"+serverID, updated)
}

// =============================================================================
// Internal Helpers
// =============================================================================

// getNetworkConfig loads the current residency rules from the ledger.
func (c *ResidencyContract) getNetworkConfig(
	ctx contractapi.TransactionContextInterface,
) (*NetworkConfig, error) {
	data, err := ctx.GetStub().GetState("NETWORK_CONFIG")
	if err != nil {
		return nil, fmt.Errorf("failed to read network config: %w", err)
	}
	if data == nil {
		// Fallback to defaults if InitLedger hasn't been called yet
		return &NetworkConfig{
			DocType:        "CONFIG",
			GhanaIPRanges:  defaultGhanaIPRanges,
			RTTThresholdMs: defaultRTTThresholdMs,
		}, nil
	}

	var config NetworkConfig
	if err := json.Unmarshal(data, &config); err != nil {
		return nil, fmt.Errorf("failed to parse network config: %w", err)
	}
	return &config, nil
}

// saveNetworkConfig persists updated residency rules to the ledger.
func (c *ResidencyContract) saveNetworkConfig(
	ctx contractapi.TransactionContextInterface,
	config *NetworkConfig,
) error {
	data, err := json.Marshal(config)
	if err != nil {
		return fmt.Errorf("failed to marshal network config: %w", err)
	}
	return ctx.GetStub().PutState("NETWORK_CONFIG", data)
}

// isIPInGhana checks whether the given IP address falls within any of the
// Ghana AFRINIC-registered CIDR blocks.
func isIPInGhana(ipStr string, ranges []string) (bool, error) {
	ip := net.ParseIP(strings.TrimSpace(ipStr))
	if ip == nil {
		return false, fmt.Errorf("cannot parse IP address: %s", ipStr)
	}

	for _, cidr := range ranges {
		_, network, err := net.ParseCIDR(cidr)
		if err != nil {
			continue // skip malformed entries
		}
		if network.Contains(ip) {
			return true, nil
		}
	}
	return false, nil
}

// verifyECDSASignature verifies a base64-encoded DER ECDSA signature against
// the canonical payload string using the server's registered ECDSA P-256 key.
//
// The Python probing agent signs with:
//   from cryptography.hazmat.primitives.asymmetric import ec
//   signature = private_key.sign(message.encode(), ec.ECDSA(hashes.SHA256()))
//
// This produces a DER-encoded signature which we decode and verify here.
func verifyECDSASignature(publicKeyPEM, message, signatureB64 string) (bool, error) {
	// ── Parse PEM public key ──────────────────────────────────────────────────
	ecPub, err := parsePEMPublicKey(publicKeyPEM)
	if err != nil {
		return false, fmt.Errorf("public key parse error: %w", err)
	}

	// ── Hash the canonical message with SHA-256 ───────────────────────────────
	hash := sha256.Sum256([]byte(message))

	// ── Decode base64 signature ───────────────────────────────────────────────
	sigBytes, err := base64.StdEncoding.DecodeString(signatureB64)
	if err != nil {
		return false, fmt.Errorf("base64 decode error: %w", err)
	}

	// ── Unmarshal DER-encoded (r, s) integers ────────────────────────────────
	var ecdsaSig struct {
		R, S *big.Int
	}
	if _, err := asn1.Unmarshal(sigBytes, &ecdsaSig); err != nil {
		return false, fmt.Errorf("DER unmarshal error: %w", err)
	}

	// ── Verify ────────────────────────────────────────────────────────────────
	valid := ecdsa.Verify(ecPub, hash[:], ecdsaSig.R, ecdsaSig.S)
	return valid, nil
}

// parsePEMPublicKey decodes a PEM-encoded ECDSA public key.
func parsePEMPublicKey(pemStr string) (*ecdsa.PublicKey, error) {
	block, _ := pem.Decode([]byte(pemStr))
	if block == nil {
		return nil, fmt.Errorf("failed to decode PEM block")
	}

	pub, err := x509.ParsePKIXPublicKey(block.Bytes)
	if err != nil {
		return nil, fmt.Errorf("failed to parse public key: %w", err)
	}

	ecPub, ok := pub.(*ecdsa.PublicKey)
	if !ok {
		return nil, fmt.Errorf("key is not an ECDSA public key")
	}

	return ecPub, nil
}
