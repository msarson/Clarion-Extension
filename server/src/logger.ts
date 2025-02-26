import * as winston from "winston";
import * as path from "path";
import * as fs from "fs";

// ✅ Ensure previous instances are closed
winston.loggers.close("default");

// ✅ Explicitly set log file
const logFile = path.join(__dirname, "server.log");
console.log("Log File:", logFile);
// ✅ Remove the log file if it exists (so it starts fresh)
// if (fs.existsSync(logFile)) {
//     fs.unlinkSync(logFile);
// }

// ✅ Define log format
const logFormat = winston.format.combine(
    winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
    winston.format.printf(({ timestamp, level, message }) => `[${timestamp}] ${level.toUpperCase()}: ${message}`)
);

// ✅ Create Winston logger
const logger = winston.createLogger({
    level: "debug", // 🔥 Ensure all logs (debug, info, warn, error) are recorded
    format: logFormat,
    transports: [
        new winston.transports.Console({ level: "debug" }), // ✅ Send ALL logs to Debug Console
        new winston.transports.File({ filename: logFile, level: "debug" }) // ✅ Save ALL logs to file
    ]
});

// ✅ Debug Test Message
logger.debug("🚀 Winston Logger Initialized");

export default logger;
