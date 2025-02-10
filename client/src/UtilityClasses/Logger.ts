export class Logger {
  
    private static debugMode: boolean = false; // Default to false, can be controlled via a setting

    /**
     * Enables or disables debug logging.
     * @param enabled - If true, debug logs will be shown.
     */
    public static setDebugMode(enabled: boolean): void {
        this.debugMode = enabled;
    }

    /**
     * Logs an informational message to the console, only if debug mode is enabled.
     * @param message - The message to log.
     * @param args - Additional arguments to log.
     */
    public static info(message: string, ...args: any[]): void {
        if (this.debugMode) {
            console.log(`ℹ️ [INFO] ${message}`, ...args);
        }
    }


    /**
     * Logs a warning message to the console.
     * @param message - The warning message.
     * @param args - Additional arguments to log.
     */
    public static warn(message: string, ...args: any[]): void {
        if (this.debugMode) {
            console.warn(`⚠️ [WARN] ${message}`, ...args);
        }
    }

    /**
     * Logs an error message to the console.
     * @param message - The error message.
     * @param args - Additional arguments to log.
     */
    public static error(message: string, ...args: any[]): void {
        if (this.debugMode) {
            console.error(`❌ [ERROR] ${message}`, ...args);
        }
    }

    /**
     * Logs a debug message, only if debug mode is enabled.
     * @param message - The debug message.
     * @param args - Additional arguments to log.
     */
    public static debug(message: string, ...args: any[]): void {
        if (this.debugMode) {
            console.log(`🐛 [DEBUG] ${message}`, ...args);
        }
    }
}
