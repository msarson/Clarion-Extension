/**
 * Centralized Logging Configuration
 * 
 * Controls logging verbosity across the entire extension (client and server).
 * Automatically detects release mode vs development mode.
 * 
 * IMPORTANT FOR PUBLISHING:
 * - Development mode: More verbose logging (warn level) for debugging
 * - Release mode: Minimal logging (error level only) for end users
 * - Mode is determined by checking if we're in production (no source files available)
 * - When packaged for marketplace, source files are excluded, triggering release mode
 */

export class LoggingConfig {
    /**
     * Detects if we're running in release mode (packaged extension).
     * 
     * Release mode is detected when:
     * - Running from a packaged VSIX (no TypeScript source files present)
     * 
     * During development with F5, source files exist so this returns false.
     * In packaged extension distributed via marketplace, source files are
     * excluded by .vscodeignore, so this returns true.
     */
    private static get IS_RELEASE_MODE(): boolean {
        // Check if we're running from compiled code without source files
        // In development, __dirname might be like: .../out/common
        // In production (packaged), source files won't exist
        try {
            const fs = require('fs');
            const path = require('path');
            // Try to find the common source directory
            const sourceCheck = path.join(__dirname, '..', '..', 'common', 'LoggingConfig.ts');
            return !fs.existsSync(sourceCheck);
        } catch {
            // If we can't check, assume release mode (safer default)
            return true;
        }
    }
    
    /**
     * Log level for release builds (marketplace)
     * Only errors are logged to avoid cluttering user's console
     */
    static readonly RELEASE_LOG_LEVEL: "debug" | "info" | "warn" | "error" = "error";
    
    /**
     * Log level for development builds
     * More verbose to help with debugging during development
     */
    static readonly DEV_LOG_LEVEL: "debug" | "info" | "warn" | "error" = "warn";
    
    /**
     * Gets the appropriate default log level based on current mode
     * @returns Log level for current environment (development or release)
     */
    static getDefaultLogLevel(): "debug" | "info" | "warn" | "error" {
        return this.IS_RELEASE_MODE ? this.RELEASE_LOG_LEVEL : this.DEV_LOG_LEVEL;
    }
    
    /**
     * Check if we're currently in release mode
     * @returns true if running from packaged extension, false for development
     */
    static isReleaseMode(): boolean {
        return this.IS_RELEASE_MODE;
    }
    
    /**
     * Get a human-readable description of current mode
     * Useful for logging/debugging
     */
    static getModeDescription(): string {
        const mode = this.IS_RELEASE_MODE 
            ? `Release Mode (log level: ${this.RELEASE_LOG_LEVEL})`
            : `Development Mode (log level: ${this.DEV_LOG_LEVEL})`;
        return mode;
    }
}
