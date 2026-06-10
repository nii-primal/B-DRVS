"use strict";

const express = require("express");
const { body, param, validationResult } = require("express-validator");
const { queryChaincode, invokeChaincode, isConnected } = require("./fabric");
const logger = require("./logger");

const router = express.Router();

function validate(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ error: "Validation failed", details: errors.array() });
  return null;
}

// POST /api/register
router.post("/register",
  [body("serverID").notEmpty(), body("publicKeyPEM").notEmpty(), body("ownerOrg").notEmpty()],
  async (req, res) => {
    if (validate(req, res)) return;
    const { serverID, publicKeyPEM, ownerOrg } = req.body;
    logger.info(`[register] serverID=${serverID}`);
    try {
      await invokeChaincode("RegisterServer", [serverID, publicKeyPEM, ownerOrg]);
      return res.status(200).json({ success: true, serverID });
    } catch (err) {
      if (err.message && err.message.includes("already registered"))
        return res.status(409).json({ success: false, message: `${serverID} already registered` });
      logger.error(`[register] ${err.message}`);
      return res.status(500).json({ error: err.message });
    }
  }
);

// POST /api/checkin
router.post("/checkin",
  [body("payload").notEmpty()],
  async (req, res) => {
    if (validate(req, res)) return;
    const { payload } = req.body;
    let parsed;
    try { parsed = JSON.parse(payload); } catch { return res.status(400).json({ error: "payload must be valid JSON" }); }
    logger.info(`[checkin] serverID=${parsed.serverID} ip=${parsed.publicIP} rtt=${parsed.rttMs}ms`);
    try {
      const result = await invokeChaincode("SubmitCheckIn", [payload]);
      // extract JSON record from invoke output
      const match = result.match(/result: status:200 payload:"(.+)"/);
      if (match) {
        const record = JSON.parse(match[1].replace(/\\"/g, '"'));
        if (record.status === "SOVEREIGNTY_VIOLATION")
          logger.warn(`[checkin] 🚨 VIOLATION — ${record.violationReason}`);
        else logger.info(`[checkin] ✅ COMPLIANT — ${record.recordID}`);
        return res.status(200).json(record);
      }
      return res.status(200).json({ success: true, raw: result });
    } catch (err) {
      logger.error(`[checkin] ${err.message}`);
      return res.status(500).json({ error: err.message });
    }
  }
);

// GET /api/status/:serverID
router.get("/status/:serverID", async (req, res) => {
  try {
    const raw = await queryChaincode("GetLatestStatus", [req.params.serverID]);
    return res.status(200).json(JSON.parse(raw));
  } catch (err) { return res.status(500).json({ error: err.message }); }
});

// GET /api/history/:serverID
router.get("/history/:serverID", async (req, res) => {
  try {
    const raw = await queryChaincode("GetServerHistory", [req.params.serverID]);
    return res.status(200).json(JSON.parse(raw) || []);
  } catch (err) { return res.status(500).json({ error: err.message }); }
});

// GET /api/violations
router.get("/violations", async (req, res) => {
  try {
    const raw = await queryChaincode("GetAllViolations", []);
    return res.status(200).json(JSON.parse(raw) || []);
  } catch (err) { return res.status(500).json({ error: err.message }); }
});

// GET /api/stats/:serverID
router.get("/stats/:serverID", async (req, res) => {
  try {
    const raw = await queryChaincode("GetComplianceStats", [req.params.serverID]);
    return res.status(200).json(JSON.parse(raw));
  } catch (err) { return res.status(500).json({ error: err.message }); }
});

// GET /api/config
router.get("/config", async (req, res) => {
  logger.info("[config] Fetching network config from ledger");
  try {
    const raw = await queryChaincode("GetNetworkConfigPublic", []);
    return res.status(200).json(JSON.parse(raw));
  } catch (err) {
    logger.error(`[config] ${err.message}`);
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/servers
router.get("/servers", async (req, res) => {
  logger.info("[servers] Fetching all registered servers from ledger");
  try {
    const raw = await queryChaincode("GetAllServers", []);
    return res.status(200).json(JSON.parse(raw) || []);
  } catch (err) {
    logger.error(`[servers] ${err.message}`);
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/health
router.get("/health", async (req, res) => {
  const connected = await isConnected();
  return res.status(connected ? 200 : 503).json({
    status: connected ? "ok" : "error",
    gateway: connected ? "connected" : "disconnected",
    channel: process.env.CHANNEL_NAME,
    chaincode: process.env.CHAINCODE_NAME,
    timestamp: new Date().toISOString(),
  });
});

module.exports = router;
