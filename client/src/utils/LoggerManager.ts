import { LoggingConfig } from '../../../common/LoggingConfig';

interface OutputChannel {
    appendLine(value: string): void;
}

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
    public fullDebugging: boolean = false;
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

    private emit(label: string, message: string, args: any[]) {
        const line = args.length
            ? `[${this.getTimestamp()}] [${this.name}] ${label} ${message} ${args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ')}`
            : `[${this.getTimestamp()}] [${this.name}] ${label} ${message}`;
        console.log(line);
        LoggerManager.outputChannel?.appendLine(line);
    }

    debug(message: string, ...args: any[]) {
        if (LoggingConfig.PERF_TEST_MODE && !message.includes('🚀') && !message.includes('[PERF]')) return;
        if (this.shouldLog("debug")) this.emit('🐛 DEBUG:', message, args);
    }

    info(message: string, ...args: any[]) {
        if (LoggingConfig.PERF_TEST_MODE && !message.includes('🚀') && !message.includes('[PERF]')) return;
        if (this.shouldLog("info")) this.emit('ℹ️ INFO:', message, args);
    }

    warn(message: string, ...args: any[]) {
        if (LoggingConfig.PERF_TEST_MODE && !message.includes('🚀') && !message.includes('[PERF]')) return;
        if (this.shouldLog("warn")) this.emit('⚠️ WARN:', message, args);
    }

    error(message: string, ...args: any[]) {
        if (this.shouldLog("error")) this.emit('❌ ERROR:', message, args);
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
        const suffix = metrics
            ? ` | ${Object.entries(metrics).map(([k, v]) => `${k}=${v}`).join(', ')}`
            : '';
        this.emit('📊 PERF:', message + suffix, []);
    }

    setLevel(newLevel: LogLevel) {
        this.level = newLevel;
    }
}

class LoggerManager {
    private static loggers: Map<string, Logger> = new Map();
    static outputChannel: OutputChannel | undefined;

    /**
     * Register a VS Code OutputChannel to receive all log messages.
     * Call once from extension.ts activate() with window.createOutputChannel(...)
     */
    static setOutputChannel(channel: OutputChannel): void {
        LoggerManager.outputChannel = channel;
    }

    /**
     * Get or create a logger instance.
     * @param name Logger name (usually module/class name)
     * @param level Optional log level. "perf" gives a perf-only logger
     *   (silences all standard severities; perf() emits). Otherwise uses
     *   environment-appropriate default.
     */
    static getLogger(name: string, level?: LogLevel): Logger {
        const logLevel = level ?? LoggingConfig.getDefaultLogLevel();
        if (!LoggerManager.loggers.has(name)) {
            LoggerManager.loggers.set(name, new Logger(name, logLevel));
        }
        return LoggerManager.loggers.get(name)!;
    }
}

export default LoggerManager;
