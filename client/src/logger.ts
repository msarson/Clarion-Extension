class Logger {
    private level: "debug" | "info" | "warn" | "error";
    private name: string;
    public fullDebugging: boolean = false; // default is false, toggle externally if needed
    public static enabled: boolean = true; 

    constructor(name: string, level: "debug" | "info" | "warn" | "error" = "error") {
        this.name = name;
        this.level = level;
    }

    private getTimestamp(): string {
        return new Date().toISOString();
    }

    private shouldLog(level: "debug" | "info" | "warn" | "error"): boolean {
        if (!Logger.enabled) return false;
        if (this.fullDebugging) return true;
        const levels = ["debug", "info", "warn", "error"];
        return levels.indexOf(level) >= levels.indexOf(this.level);
    }

    debug(message: string, ...args: any[]) {
        if (this.shouldLog("debug")) {
            console.log(`[${this.getTimestamp()}] [${this.name}] 🐛 DEBUG:`, message, ...args);
        }
    }

    info(message: string, ...args: any[]) {
        if (this.shouldLog("info")) {
            console.log(`[${this.getTimestamp()}] [${this.name}] ℹ️ INFO:`, message, ...args);
        }
    }

    warn(message: string, ...args: any[]) {
        if (this.shouldLog("warn")) {
            console.log(`[${this.getTimestamp()}] [${this.name}] ⚠️ WARN:`, message, ...args);
        }
    }

    error(message: string, ...args: any[]) {
        if (this.shouldLog("error")) {
            console.log(`[${this.getTimestamp()}] [${this.name}] ❌ ERROR:`, message, ...args);
        }
    }

    setLevel(newLevel: "debug" | "info" | "warn" | "error") {
        this.level = newLevel;
    }
}

class LoggerManager {
    private static loggers: Map<string, Logger> = new Map();

    static getLogger(name: string, level: "debug" | "info" | "warn" | "error" = "warn"): Logger {
        if (!LoggerManager.loggers.has(name)) {
            LoggerManager.loggers.set(name, new Logger(name, level));
        }
        return LoggerManager.loggers.get(name)!;
    }
}

export default LoggerManager;
