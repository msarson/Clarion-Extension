import { LoggingConfig } from '../../../common/LoggingConfig';

interface OutputChannel {
    appendLine(value: string): void;
}

class Logger {
    private level: "debug" | "info" | "warn" | "error";
    private name: string;
    public fullDebugging: boolean = false;
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

    perf(message: string, metrics?: Record<string, number | string>) {
        if (!LoggingConfig.PERF_TEST_MODE && !this.shouldLog("debug")) return;
        const suffix = metrics
            ? ` | ${Object.entries(metrics).map(([k, v]) => `${k}=${v}`).join(', ')}`
            : '';
        this.emit('📊 PERF:', message + suffix, []);
    }

    setLevel(newLevel: "debug" | "info" | "warn" | "error") {
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

    static getLogger(name: string, level?: "debug" | "info" | "warn" | "error"): Logger {
        const logLevel = level ?? LoggingConfig.getDefaultLogLevel();
        if (!LoggerManager.loggers.has(name)) {
            LoggerManager.loggers.set(name, new Logger(name, logLevel));
        }
        return LoggerManager.loggers.get(name)!;
    }
}

export default LoggerManager;
