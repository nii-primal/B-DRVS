// =============================================================================
// B-DRVS REST API Gateway — Server
// University of Mines and Technology, Tarkwa — BSc Cybersecurity 2026
//
// Bridges the Python Probing Agent (Tier 1) to Hyperledger Fabric (Tier 2).
// Also serves all query endpoints consumed by the React dashboard (Tier 3).
// =============================================================================

"use strict";

require("dotenv").config();

const express = require("express");
const morgan = require("morgan");
const { disconnect } = require("./fabric");
const routes = require("./routes");
const logger = require("./logger");

const app = express();
const PORT = process.env.PORT || 3000;

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan("combined", { stream: { write: (msg) => logger.info(msg.trim()) } }));

// ── CORS — allow React dashboard on port 5173 (Vite default) ─────────────────
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.sendStatus(200);
  next();
});

// ── Routes ────────────────────────────────────────────────────────────────────
app.use("/api", routes);

// ── 404 handler ───────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: `Route ${req.method} ${req.path} not found` });
});

// ── Global error handler ──────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  logger.error(`Unhandled error: ${err.message}`);
  res.status(500).json({ error: "Internal server error" });
});

// ── Start server ──────────────────────────────────────────────────────────────
const server = app.listen(PORT, () => {
  logger.info("=".repeat(55));
  logger.info(" B-DRVS REST API Gateway");
  logger.info(`   Port     : ${PORT}`);
  logger.info(`   Channel  : ${process.env.CHANNEL_NAME}`);
  logger.info(`   Chaincode: ${process.env.CHAINCODE_NAME}`);
  logger.info(`   Env      : ${process.env.NODE_ENV}`);
  logger.info("=".repeat(55));
  logger.info("Endpoints:");
  logger.info("  POST /api/register      — register health server");
  logger.info("  POST /api/checkin       — submit signed location proof");
  logger.info("  GET  /api/status/:id    — latest compliance status");
  logger.info("  GET  /api/history/:id   — full server audit trail");
  logger.info("  GET  /api/violations    — all violation records");
  logger.info("  GET  /api/stats/:id     — compliance statistics");
  logger.info("  GET  /api/config        — Ghana IP whitelist + RTT threshold");
  logger.info("  GET  /api/health        — gateway health check");
  logger.info("=".repeat(55));
});

// ── Graceful shutdown ─────────────────────────────────────────────────────────
process.on("SIGTERM", async () => {
  logger.info("SIGTERM received — shutting down gracefully...");
  await disconnect();
  server.close(() => {
    logger.info("Gateway shut down.");
    process.exit(0);
  });
});

process.on("SIGINT", async () => {
  logger.info("SIGINT received — shutting down...");
  await disconnect();
  process.exit(0);
});

module.exports = app;
