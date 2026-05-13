import { LoggingConfig } from '../../common/LoggingConfig';

/**
 * Log levels:
 *   - "debug" / "info" / "warn" / "error" — standard severity axis. Each level
 *     includes higher-severity levels (info shows info+warn+error, etc.).
 *   - "perf" — SEPARATE axis. A logger set to "perf" emits perf() messages and
 *     SILENCES all standard-severity output. Use for per-module perf
 *     instrumentation that should be cleanly togglable (set to "perf" to
 *     measure, set back to "error" to silence).
 *
 * Pattern:
 *   const perfLogger = LoggerManager.getLogger("MyModule.Perf", "perf");
 *   perfLogger.perf("operation took", { time_ms: 42 });
 *   // ...later, to silence:
 *   perfLogger.setLevel("error");
 */
type LogLevel = "debug" | "info" | "warn" | "error" | "perf";

class Logger {
    private level: LogLevel;
    private name: string;
    public fullDebugging: boolean = false; // default is false, toggle externally if needed
    public static enabled: boolean = true;

    constructor(name: string, level: LogLevel = "error") {
        this.name = name;
        this.level = level;
    }

    private getTimestamp(): string {
        return new Date().toISOString();
    }

    private shouldLog(level: "debug" | "info" | "warn" | "error"): boolean {
        if (!Logger.enabled) return false;
        if (this.fullDebugging) return true;
        // "perf" level silences all standard-severity output — perf is its own channel.
        if (this.level === "perf") return false;
        const levels = ["debug", "info", "warn", "error"];
        return levels.indexOf(level) >= levels.indexOf(this.level);
    }

    debug(message: string, ...args: any[]) {
        // In perf test mode, allow PERF messages through, skip others
        if (LoggingConfig.PERF_TEST_MODE && !message.includes('🚀') && !message.includes('[PERF]')) return;
        if (this.shouldLog("debug")) {
            console.error(`[${this.getTimestamp()}] [${this.name}] 🐛 DEBUG:`, message, ...args);
        }
    }

    info(message: string, ...args: any[]) {
        // In perf test mode, allow PERF messages through, skip others
        if (LoggingConfig.PERF_TEST_MODE && !message.includes('🚀') && !message.includes('[PERF]')) return;
        if (this.shouldLog("info")) {
            console.error(`[${this.getTimestamp()}] [${this.name}] ℹ️ INFO:`, message, ...args);
        }
    }

    warn(message: string, ...args: any[]) {
        // In perf test mode, allow PERF messages through, skip others
        if (LoggingConfig.PERF_TEST_MODE && !message.includes('🚀') && !message.includes('[PERF]')) return;
        if (this.shouldLog("warn")) {
            console.error(`[${this.getTimestamp()}] [${this.name}] ⚠️ WARN:`, message, ...args);
        }
    }

    error(message: string, ...args: any[]) {
        if (this.shouldLog("error")) {
            console.error(`[${this.getTimestamp()}] [${this.name}] ❌ ERROR:`, message, ...args);
        }
    }

    /**
     * 📊 Log performance metrics. Emits when:
     *   - This logger's level is "perf" (preferred — per-module perf channel), OR
     *   - `LoggingConfig.PERF_TEST_MODE` is on globally, OR
     *   - This logger's level is "debug" (legacy — perf bundled with debug noise).
     *
     * The "perf" level is the cleanly-togglable surface: a module declares
     * `const perfLogger = LoggerManager.getLogger("X.Perf", "perf")` for
     * deliberate perf instrumentation; flip to "error" when not measuring.
     */
    perf(message: string, metrics?: Record<string, number | string>) {
        if (this.level !== "perf" && !LoggingConfig.PERF_TEST_MODE && !this.shouldLog("debug")) return;

        const timestamp = this.getTimestamp();
        if (metrics) {
            const metricsStr = Object.entries(metrics)
                .map(([key, value]) => `${key}=${value}`)
                .join(', ');
            console.error(`[${timestamp}] [${this.name}] 📊 PERF: ${message} | ${metricsStr}`);
        } else {
            console.error(`[${timestamp}] [${this.name}] 📊 PERF: ${message}`);
        }
    }

    setLevel(newLevel: LogLevel) {
        this.level = newLevel;
    }
}

class LoggerManager {
    private static loggers: Map<string, Logger> = new Map();

    /**
     * Get or create a logger instance
     * @param name Logger name (usually module/class name)
     * @param level Optional log level override. "perf" gives a perf-only logger
     *   (silences all standard severities; perf() emits). Otherwise uses
     *   environment-appropriate default.
     */
    static getLogger(name: string, level?: LogLevel): Logger {
        // Use provided level, or get default based on release/dev mode
        const logLevel = level ?? LoggingConfig.getDefaultLogLevel();

        if (!LoggerManager.loggers.has(name)) {
            LoggerManager.loggers.set(name, new Logger(name, logLevel));
        }
        return LoggerManager.loggers.get(name)!;
    }
}

export default LoggerManager;
