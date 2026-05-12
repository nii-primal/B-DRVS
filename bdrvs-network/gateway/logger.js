"use strict";

const { createLogger, format, transports } = require("winston");
const path = require("path");
const fs = require("fs");

const logDir = path.join(__dirname, "logs");
if (!fs.existsSync(logDir)) fs.mkdirSync(logDir);

const logger = createLogger({
  level: process.env.NODE_ENV === "development" ? "debug" : "info",
  format: format.combine(
    format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
    format.errors({ stack: true }),
    format.printf(({ timestamp, level, message, stack }) =>
      stack
        ? `${timestamp} [${level.toUpperCase()}] ${message}\n${stack}`
        : `${timestamp} [${level.toUpperCase()}] ${message}`
    )
  ),
  transports: [
    new transports.Console(),
    new transports.File({ filename: path.join(logDir, "gateway.log") }),
  ],
});

module.exports = logger;
