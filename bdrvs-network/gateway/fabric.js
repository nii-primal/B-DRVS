"use strict";

const { exec } = require("child_process");
const { promisify } = require("util");
const execAsync = promisify(exec);
const logger = require("./logger");

// ── Paths inside the CLI container ───────────────────────────────────────────
const ORDERER_CA = "/opt/gopath/src/github.com/hyperledger/fabric/peer/crypto/ordererOrganizations/bdrvs.gh/orderers/orderer.bdrvs.gh/msp/tlscacerts/tlsca.bdrvs.gh-cert.pem";
const MOH_PEER   = "peer0.moh.bdrvs.gh:7051";
const NITA_PEER  = "peer0.nita.bdrvs.gh:9051";
const MOH_TLS_CA  = "/opt/gopath/src/github.com/hyperledger/fabric/peer/crypto/peerOrganizations/moh.bdrvs.gh/peers/peer0.moh.bdrvs.gh/tls/ca.crt";
const NITA_TLS_CA = "/opt/gopath/src/github.com/hyperledger/fabric/peer/crypto/peerOrganizations/nita.bdrvs.gh/peers/peer0.nita.bdrvs.gh/tls/ca.crt";
const CHANNEL    = "bdrvschannel";
const CHAINCODE  = "residency";

// ── Shell-escape helper ───────────────────────────────────────────────────────
// Wraps a string in single quotes and escapes any embedded single quotes.
// This prevents shell injection when interpolating user-supplied data into
// command strings. Pattern: replace each ' with '\'' (end quote, literal
// apostrophe, reopen quote).
function shellEscape(str) {
  return "'" + String(str).replace(/'/g, "'\\''") + "'";
}

// ── Query (read-only) ─────────────────────────────────────────────────────────
async function queryChaincode(fcn, args = []) {
  const payload = JSON.stringify({ function: fcn, Args: args });
  const cmd = `docker exec bdrvs_cli peer chaincode query \
    --channelID ${CHANNEL} \
    --name ${CHAINCODE} \
    -c ${shellEscape(payload)}`;

  logger.debug(`[fabric] query: ${fcn}(${args.join(", ")})`);
  const { stdout } = await execAsync(cmd);
  return stdout.trim();
}

// ── Invoke (read-write) ───────────────────────────────────────────────────────
// Pulls the chaincode's own error message out of a peer invoke failure.
// A failed invoke embeds the chaincode error as: message:"<reason>"
// Surfaced as a chaincode-level rejection so routes can return 400, not 500.
function extractChaincodeError(rawStderr) {
  const m = rawStderr.match(/message:"((?:[^"\\]|\\.)*)"/);
  if (m) return m[1].replace(/\\"/g, '"');
  return null;
}

async function invokeChaincode(fcn, args = []) {
  const payload = JSON.stringify({ function: fcn, Args: args });
  const cmd = `docker exec bdrvs_cli peer chaincode invoke \
-o orderer.bdrvs.gh:7050 \
--channelID ${CHANNEL} \
--name ${CHAINCODE} \
--tls --cafile ${ORDERER_CA} \
--peerAddresses ${MOH_PEER}  --tlsRootCertFiles ${MOH_TLS_CA} \
--peerAddresses ${NITA_PEER} --tlsRootCertFiles ${NITA_TLS_CA} \
-c ${shellEscape(payload)}`;

  logger.debug(`[fabric] invoke: ${fcn}(${args.join(", ")})`);
  try {
    const { stdout, stderr } = await execAsync(cmd);
    const combined = stdout.trim() + stderr.trim();
    logger.debug(`[fabric] invoke result: ${combined}`);
    return combined;
  } catch (execErr) {
    const rawStderr = (execErr.stderr || "") + (execErr.stdout || "");
    const ccMsg = extractChaincodeError(rawStderr);
    if (ccMsg) {
      logger.warn(`[fabric] chaincode rejected ${fcn}: ${ccMsg}`);
      const e = new Error(ccMsg);
      e.chaincodeRejection = true;
      throw e;
    }
    logger.error(`[fabric] invoke infra failure for ${fcn}: ${rawStderr.slice(0, 500)}`);
    const e = new Error("blockchain network error — invoke could not complete");
    e.infraFailure = true;
    throw e;
  }
}

// ── Health check ──────────────────────────────────────────────────────────────
async function isConnected() {
  try {
    await execAsync("docker exec bdrvs_cli peer channel list");
    return true;
  } catch {
    return false;
  }
}

module.exports = { queryChaincode, invokeChaincode, isConnected };
