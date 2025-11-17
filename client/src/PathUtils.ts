import * as path from 'path';
import * as fs from 'fs';
import LoggerManager from './logger';

const logger = LoggerManager.getLogger("PathUtils");
const fileResolutionLogger = LoggerManager.getLogger("FileResolution");

/**
 * Utility functions for path handling and normalization
 * These functions ensure consistent path handling across the codebase
 */
export class PathUtils {
    /**
     * Normalizes a path for use as a cache key or for comparison
     * - Converts to lowercase on Windows
     * - Resolves to absolute path
     * - Normalizes path separators
     * - Removes trailing slashes
     * 
     * @param p The path to normalize
     * @param basePath Optional base path to resolve relative paths against
     * @returns Normalized path string suitable for keys and comparison
     */
    public static normalizeForKey(p: string, basePath?: string): string {
        if (!p) return '';
        
        try {
            // If it's already absolute, just normalize it
            let normalizedPath: string;
            if (path.isAbsolute(p)) {
                normalizedPath = path.normalize(p);
            } else if (basePath) {
                // If we have a base path, resolve against it
                normalizedPath = path.resolve(basePath, p);
            } else {
                // Can't normalize a relative path without a base
                fileResolutionLogger.debug(`[FILE_RESOLUTION] Cannot normalize relative path without base: ${p}`);
                return '';
            }
            
            // Remove trailing slashes and convert to lowercase on Windows
            normalizedPath = normalizedPath.replace(/[\/\\]+$/, '');
            if (process.platform === 'win32') {
                normalizedPath = normalizedPath.toLowerCase();
            }
            
            return normalizedPath;
        } catch (error) {
            logger.error(`Error normalizing path: ${error instanceof Error ? error.message : String(error)}`);
            return '';
        }
    }
    
    /**
     * Checks if a file path is under a root directory
     * Handles case sensitivity appropriately for the platform
     * 
     * @param filePath The file path to check
     * @param rootPath The root directory path
     * @param allowExternal If true, files outside the root are allowed if they exist
     * @returns True if the file is under the root or allowed external
     */
    public static isUnderRoot(filePath: string, rootPath: string, allowExternal: boolean = false): boolean {
        if (!filePath || !rootPath) return false;
        
        try {
            const normalizedFile = this.normalizeForKey(filePath);
            const normalizedRoot = this.normalizeForKey(rootPath);
            
            if (!normalizedFile || !normalizedRoot) return false;
            
            // Check if the file is under the root directory
            const isUnder = normalizedFile.startsWith(normalizedRoot);
            
            // If it's under the root, it's valid
            if (isUnder) {
                fileResolutionLogger.debug(`[FILE_RESOLUTION] File is under root: ${normalizedFile} under ${normalizedRoot}`);
                return true;
            }
            
            // If external files are allowed and the file exists, it's valid
            if (allowExternal && fs.existsSync(normalizedFile)) {
                fileResolutionLogger.debug(`[FILE_RESOLUTION] External file allowed and exists: ${normalizedFile}`);
                return true;
            }
            
            fileResolutionLogger.debug(`[FILE_RESOLUTION] File is not under root: ${normalizedFile} not under ${normalizedRoot}`);
            return false;
        } catch (error) {
            logger.error(`Error checking if file is under root: ${error instanceof Error ? error.message : String(error)}`);
            return false;
        }
    }
    
    /**
     * Compares two paths for equality, accounting for platform differences
     * 
     * @param a First path
     * @param b Second path
     * @returns True if the paths are equivalent
     */
    public static equalPath(a: string, b: string): boolean {
        if (!a || !b) return false;
        
        try {
            const normalizedA = this.normalizeForKey(a);
            const normalizedB = this.normalizeForKey(b);
            
            if (!normalizedA || !normalizedB) return false;
            
            return normalizedA === normalizedB;
        } catch (error) {
            logger.error(`Error comparing paths: ${error instanceof Error ? error.message : String(error)}`);
            return false;
        }
    }
    
    /**
     * Checks if a file exists at the given path
     * 
     * @param filePath The file path to check
     * @returns True if the file exists
     */
    public static fileExists(filePath: string): boolean {
        if (!filePath) return false;
        
        try {
            return fs.existsSync(filePath);
        } catch (error) {
            logger.error(`Error checking if file exists: ${error instanceof Error ? error.message : String(error)}`);
            return false;
        }
    }
    
    /**
     * Gets the modification time of a file
     * 
     * @param filePath The file path
     * @returns The modification time in milliseconds, or 0 if the file doesn't exist
     */
    public static getFileMTime(filePath: string): number {
        if (!filePath) return 0;
        
        try {
            if (!fs.existsSync(filePath)) return 0;
            
            const stats = fs.statSync(filePath);
            return stats.mtimeMs;
        } catch (error) {
            logger.error(`Error getting file mtime: ${error instanceof Error ? error.message : String(error)}`);
            return 0;
        }
    }
    
    /**
     * Computes a simple hash of a file's content
     * This is used for cache invalidation when the file content changes
     * 
     * @param filePath The file path
     * @returns A string hash of the file content, or empty string if the file doesn't exist
     */
    public static getFileHash(filePath: string): string {
        if (!filePath) return '';
        
        try {
            if (!fs.existsSync(filePath)) return '';
            
            const content = fs.readFileSync(filePath, 'utf8');
            
            // Simple hash function for strings
            let hash = 0;
            for (let i = 0; i < content.length; i++) {
                const char = content.charCodeAt(i);
                hash = ((hash << 5) - hash) + char;
                hash = hash & hash; // Convert to 32bit integer
            }
            
            return hash.toString(16);
        } catch (error) {
            logger.error(`Error computing file hash: ${error instanceof Error ? error.message : String(error)}`);
            return '';
        }
    }
}