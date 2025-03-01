class Logger {
    private level: "debug" | "info" | "warn" | "error";
    
    constructor(level: "debug" | "info" | "warn" | "error" = "debug") {
        this.level = level;


    }

    private getTimestamp(): string {
        return new Date().toISOString(); // ✅ ISO Timestamp
    }

    private shouldLog(level: "debug" | "info" | "warn" | "error"): boolean {
        const levels = ["debug", "info", "warn", "error"];
        return levels.indexOf(level) >= levels.indexOf(this.level);
    }

    debug(message: string, ...args: any[]) {
        if (this.shouldLog("debug")) {
           console.log(`[${this.getTimestamp()}] 🐛 DEBUG:`, message, ...args);
        }
    }

    info(message: string, ...args: any[]) {
        if (this.shouldLog("info")) {
            console.log(`[${this.getTimestamp()}] ℹ️ INFO:`, message, ...args);
        }
    }

    warn(message: string, ...args: any[]) {
        if (this.shouldLog("warn")) {
            console.log(`[${this.getTimestamp()}] ⚠️ WARN:`, message, ...args);
        }
    }

    error(message: string, ...args: any[]) {
        if (this.shouldLog("error")) {
            console.log(`[${this.getTimestamp()}] ❌ ERROR:`, message, ...args);
        }
    }

    setLevel(newLevel: "debug" | "info" | "warn" | "error") {
        this.level = newLevel;
         console.log(`[${this.getTimestamp()}] 🔄 LOG LEVEL SET TO: ${newLevel.toUpperCase()}`);
    }
}

// ✅ Export an instance of the logger
const logger = new Logger("warn"); // Default level: debug
logger.info("✅ [Logger] Direct logger.info inside logger");
logger.info("✅ [Logger] Logging function called!");
logger.info("✅ [Logger] Logging function finished!");

export default logger;
