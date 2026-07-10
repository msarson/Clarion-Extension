import * as fs from 'fs';
import * as path from 'path';
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
 *   - "test" — SEPARATE axis. A logger set to "test" emits test() messages and
 *     SILENCES all standard-severity output. Use for temporary, targeted
 *     diagnostic tracing: flip a module to "test" to see ONLY its test() lines
 *     (no info/debug flood), then set back to "error".
 *
 * Pattern:
 *   const perfLogger = LoggerManager.getLogger("MyModule.Perf", "perf");
 *   perfLogger.perf("operation took", { time_ms: 42 });
 *   // ...later, to silence:
 *   perfLogger.setLevel("error");
 */
type LogLevel = "debug" | "info" | "warn" | "error" | "perf" | "test";

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
        // "perf" / "test" levels are their own channels — they silence all
        // standard-severity output.
        if (this.level === "perf" || this.level === "test") return false;
        const levels = ["debug", "info", "warn", "error"];
        return levels.indexOf(level) >= levels.indexOf(this.level);
    }

    private emit(label: string, message: string, args: any[]) {
        const line = args.length
            ? `[${this.getTimestamp()}] [${this.name}] ${label} ${message} ${args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ')}`
            : `[${this.getTimestamp()}] [${this.name}] ${label} ${message}`;
        console.log(line);
        LoggerManager.outputChannel?.appendLine(line);
        LoggerManager.writeToFileSink(line);
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
        // Mirrors server logger: "perf" channels are additionally gated behind
        // clarion.log.performance.enabled (LoggingConfig.PERF_CHANNELS_ENABLED).
        const perfChannelOn = this.level === "perf" && LoggingConfig.PERF_CHANNELS_ENABLED;
        if (!perfChannelOn && !LoggingConfig.PERF_TEST_MODE && !this.shouldLog("debug")) return;
        const suffix = metrics
            ? ` | ${Object.entries(metrics).map(([k, v]) => `${k}=${v}`).join(', ')}`
            : '';
        this.emit('📊 PERF:', message + suffix, []);
    }

    /**
     * 🔬 Targeted diagnostic trace. Emits ONLY when this logger's level is "test"
     * (a clean, flood-free channel for temporary instrumentation — no need to
     * enable "info" and drown in unrelated output). Set the module's logger to
     * "test" to capture, back to "error" to silence.
     */
    test(message: string, ...args: any[]) {
        if (this.level !== "test") return;
        this.emit('🔬 TEST:', message, args);
    }

    setLevel(newLevel: LogLevel) {
        this.level = newLevel;
    }
}

class LoggerManager {
    private static loggers: Map<string, Logger> = new Map();
    static outputChannel: OutputChannel | undefined;
    private static fileSinkPath: string | undefined;

    /**
     * Register a VS Code OutputChannel to receive all log messages.
     * Call once from extension.ts activate() with window.createOutputChannel(...)
     */
    static setOutputChannel(channel: OutputChannel): void {
        LoggerManager.outputChannel = channel;
    }

    /**
     * Open a per-session log file. Truncates on call so each VS Code session
     * starts with a fresh log. Subsequent emit() calls append synchronously.
     * Failures are reported to the console only — never throw, never block
     * extension activation.
     */
    static initFileSink(filePath: string): void {
        try {
            fs.mkdirSync(path.dirname(filePath), { recursive: true });
            fs.writeFileSync(filePath, `# Clarion client log — session start ${new Date().toISOString()}\n`, 'utf8');
            LoggerManager.fileSinkPath = filePath;
        } catch (err) {
            console.warn(`[LoggerManager] file sink init failed for ${filePath}: ${err instanceof Error ? err.message : String(err)}`);
            LoggerManager.fileSinkPath = undefined;
        }
    }

    // #295: buffered async sink. The previous per-line appendFileSync ran ON THE EXTENSION HOST
    // (UI) thread — the CPU profile showed writeFileUtf8 as the single largest non-idle cost
    // (2.1s of sync writes), i.e. the diagnostic logging was itself causing UI lag. Lines are
    // buffered and flushed asynchronously at most every 250ms.
    private static pendingLines: string[] = [];
    private static flushTimer: ReturnType<typeof setTimeout> | undefined;

    static writeToFileSink(line: string): void {
        if (!LoggerManager.fileSinkPath) return;
        LoggerManager.pendingLines.push(line);
        if (LoggerManager.flushTimer) return;
        LoggerManager.flushTimer = setTimeout(() => {
            LoggerManager.flushTimer = undefined;
            const batch = LoggerManager.pendingLines.join('\n') + '\n';
            LoggerManager.pendingLines = [];
            fs.appendFile(LoggerManager.fileSinkPath!, batch, 'utf8', () => { /* diagnostic-only */ });
        }, 250);
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
