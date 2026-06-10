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
  const { stdout, stderr } = await execAsync(cmd);

  // peer chaincode invoke prints the result to stderr
  const combined = stdout.trim() + stderr.trim();
  logger.debug(`[fabric] invoke result: ${combined}`);
  return combined;
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
