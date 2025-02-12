export class Logger {
    private debugMode: boolean; // ✅ Now instance-specific

    constructor(enableDebugMode: boolean = false) {
        this.debugMode = enableDebugMode; // ✅ Default to OFF
    }

    /**
     * Enables or disables debug logging for this instance.
     */
    public setDebugMode(enabled: boolean): void {
        this.debugMode = enabled;
    }

    /**
     * Logs an informational message, only if debug mode is enabled.
     */
    public info(message: string, ...args: any[]): void {
        if (this.debugMode) {
            console.log(`ℹ️ [INFO] ${message}`, ...args);
        }
    }

    /**
     * Logs a warning message to the console.
     */
    public warn(message: string, ...args: any[]): void {
        if (this.debugMode) {
            console.warn(`⚠️ [WARN] ${message}`, ...args);
        }
    }

    /**
     * Logs an error message to the console.
     */
    public error(message: string, ...args: any[]): void {
            console.error(`❌ [ERROR] ${message}`, ...args);
    }
}
