import winston from "winston";


winston.loggers.close("default"); // ✅ Force clearing previous instances
// Determine if running in client or server based on __dirname
const logFile = "client.log";

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
        new winston.transports.File({ filename: logFile, level: "warn" }) // ✅ Logs to client.log or server.log
    ]
});

// Export logger for use in other files
export default logger;
