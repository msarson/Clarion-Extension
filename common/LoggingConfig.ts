/**
 * Centralized Logging Configuration
 * 
 * Controls logging verbosity across the entire extension (client and server).
 * Automatically detects release mode vs development mode.
 * 
 * IMPORTANT FOR PUBLISHING:
 * - Development mode: More verbose logging (warn level) for debugging
 * - Release mode: Minimal logging (error level only) for end users
 * - Mode is controlled by VSCODE_RELEASE_MODE environment variable
 * - Set VSCODE_RELEASE_MODE=true when building for marketplace publish
 */

export class LoggingConfig {
    /**
     * Detects if we're building in release mode for publishing.
     * 
     * Release mode is activated when:
     * - VSCODE_RELEASE_MODE environment variable is set to 'true'
     * 
     * This should be set ONLY when packaging for marketplace publish.
     * 
     * Note: This is a getter function so it checks the environment variable
     * at runtime (not compile time), allowing testing with F5 debugging.
     */
    private static get IS_RELEASE_MODE(): boolean {
        return process.env.VSCODE_RELEASE_MODE === 'true';
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
     * @returns true if building for release/publish, false for development
     */
    static isReleaseMode(): boolean {
        return this.IS_RELEASE_MODE;
    }
    
    /**
     * Get a human-readable description of current mode
     * Useful for logging/debugging
     */
    static getModeDescription(): string {
        return this.IS_RELEASE_MODE 
            ? `Release Mode (log level: ${this.RELEASE_LOG_LEVEL})`
            : `Development Mode (log level: ${this.DEV_LOG_LEVEL})`;
    }
}
