import winston from "winston";
import { fileURLToPath } from 'url';
import path from 'path';

// ES Module equivalent for __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

winston.loggers.close("default"); // ✅ Force clearing previous instances

// Define log path - using the current directory as reference
const logFile = path.join(__dirname, '..', 'server.log');

// Define log format
const logFormat = winston.format.combine(
    winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
    winston.format.printf(({ timestamp, level, message }) => `[${timestamp}] ${level.toUpperCase()}: ${message}`)
);

// ✅ Create Winston logger
const logger = winston.createLogger({
    level: "warn", // Set log level (debug, info, warn, error)
    format: logFormat,
    transports: [
        new winston.transports.Console({level: "warn"}), // ✅ Logs to console
        new winston.transports.File({ filename: logFile, level: "warn" }) // ✅ Logs to server.log
    ]
});

// Export logger for use in other files
export default logger;
