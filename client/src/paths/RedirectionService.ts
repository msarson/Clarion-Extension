import * as path from 'path';
import * as fs from 'fs';
import LoggerManager from '../logger';
import { globalSettings } from '../globals';
import { getLanguageClient, isClientReady } from '../LanguageClientManager';

const logger = LoggerManager.getLogger("RedirectionService");
logger.setLevel("error");

/**
 * Represents a resolved redirection entry
 */
interface RedirectionEntry {
    extension: string;
    paths: string[];
    mtime: number;
}

/**
 * Represents a parsed redirection file
 */
interface ParsedRedirectionFile {
    path: string;
    entries: RedirectionEntry[];
    mtime: number;
    includeFiles: string[];
}

/**
 * RedirectionService is a singleton class that manages redirection file resolution
 * It caches parsed redirection files to avoid repeated parsing
 */
export class RedirectionService {
    private static instance: RedirectionService | null = null;
    private redFileCache: Map<string, ParsedRedirectionFile> = new Map();
    private resolvedPathCache: Map<string, string> = new Map();
    
    private constructor() {
        // Private constructor to enforce singleton pattern
    }
    
    /**
     * Gets the singleton instance of RedirectionService
     */
    public static getInstance(): RedirectionService {
        if (!RedirectionService.instance) {
            RedirectionService.instance = new RedirectionService();
        }
        return RedirectionService.instance;
    }
    
    /**
     * Gets the modification time of a file
     * @param filePath The path to the file
     * @returns The modification time in milliseconds, or 0 if the file doesn't exist
     */
    private getFileMtime(filePath: string): number {
        try {
            if (fs.existsSync(filePath)) {
                const stats = fs.statSync(filePath);
                return stats.mtimeMs;
            }
        } catch (error) {
            logger.error(`Error getting file mtime: ${error instanceof Error ? error.message : String(error)}`);
        }
        return 0;
    }
    
    /**
     * Parses a redirection file and caches the result
     * @param redFilePath The path to the redirection file
     * @returns The parsed redirection file
     */
    private parseRedirectionFile(redFilePath: string): ParsedRedirectionFile | null {
        try {
            // Check if we have a cached version that's still valid
            const cachedFile = this.redFileCache.get(redFilePath);
            const currentMtime = this.getFileMtime(redFilePath);
            
            if (cachedFile && cachedFile.mtime === currentMtime) {
                logger.debug(`Using cached redirection file: ${redFilePath}`);
                return cachedFile;
            }
            
            if (!fs.existsSync(redFilePath)) {
                logger.warn(`Redirection file not found: ${redFilePath}`);
                return null;
            }
            
            logger.info(`Parsing redirection file: ${redFilePath}`);
            const content = fs.readFileSync(redFilePath, 'utf-8');
            const lines = content.split('\n');
            const entries: RedirectionEntry[] = [];
            const includeFiles: string[] = [];
            const redPath = path.dirname(redFilePath);
            let currentSection = "Common";
            
            // Add default entry
            entries.push({
                extension: "*.*",
                paths: ["."],
                mtime: currentMtime
            });
            
            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed || trimmed.startsWith("--")) continue;
                
                // Check for section
                const sectionMatch = trimmed.match(/^\[([^\]]+)\]$/);
                if (sectionMatch) {
                    currentSection = sectionMatch[1].trim();
                    continue;
                }
                
                // Check for include
                if (trimmed.startsWith("{include")) {
                    const includeMatch = trimmed.match(/\{include\s+([^}]+)\}/i);
                    if (includeMatch && includeMatch[1]) {
                        let includePath = this.resolveMacro(includeMatch[1]);
                        includePath = path.isAbsolute(includePath) ? includePath : path.resolve(redPath, includePath);
                        includeFiles.push(includePath);
                        
                        // Parse the included file
                        const includedFile = this.parseRedirectionFile(includePath);
                        if (includedFile) {
                            // Add entries from included file
                            entries.push(...includedFile.entries);
                        }
                    }
                    continue;
                }
                
                // Check for path entry
                if (trimmed.includes("=")) {
                    const equalPos = trimmed.indexOf('=');
                    if (equalPos > 0) {
                        const extension = trimmed.substring(0, equalPos).trim();
                        const pathsStr = trimmed.substring(equalPos + 1).trim();
                        const pathParts = pathsStr.split(";");
                        const paths: string[] = [];
                        
                        for (const part of pathParts) {
                            const resolved = this.resolveMacro(part.trim());
                            paths.push(resolved);
                        }
                        
                        entries.push({
                            extension,
                            paths,
                            mtime: currentMtime
                        });
                    }
                }
            }
            
            // Cache the result
            const parsedFile: ParsedRedirectionFile = {
                path: redFilePath,
                entries,
                mtime: currentMtime,
                includeFiles
            };
            
            this.redFileCache.set(redFilePath, parsedFile);
            
            const ruleCount = entries.length;
            const includeCount = includeFiles.length;
            logger.info(`[RED] init rules=${ruleCount} includes=${includeCount} ms=${Date.now() - currentMtime}`);
            
            return parsedFile;
        } catch (error) {
            logger.error(`Error parsing redirection file ${redFilePath}: ${error instanceof Error ? error.message : String(error)}`);
            return null;
        }
    }
    
    /**
     * Resolves macros in a path
     * @param input The path with macros
     * @returns The resolved path
     */
    private resolveMacro(input: string): string {
        // Quick check if there are any macros to resolve
        if (!input.includes('%')) {
            return path.normalize(input);
        }
        
        const macroPattern = /%([^%]+)%/g;
        let resolved = input;
        
        // Use a more efficient approach with a single replace call
        resolved = resolved.replace(macroPattern, (match, macroName) => {
            const macro = macroName.toLowerCase();
            let value = globalSettings.macros[macro];
            
            if (!value) {
                if (macro === "bin") {
                    value = globalSettings.redirectionPath;
                } else if (macro === "redname") {
                    value = path.basename(globalSettings.redirectionFile);
                } else {
                    value = match;
                }
            }
            
            return value;
        });
        
        return path.normalize(resolved);
    }
    
    /**
     * Checks if a filename matches a mask
     * @param mask The mask to check against (e.g., "*.inc")
     * @param filename The filename to check
     * @returns True if the filename matches the mask
     */
    private matchesMask(mask: string, filename: string): boolean {
        if (mask === "*.*") return true;
        
        // Cache the processed mask for better performance
        const maskLower = mask.toLowerCase();
        const filenameLower = filename.toLowerCase();
        
        // Handle the common case of extension matching (e.g., "*.clw")
        if (maskLower.startsWith("*.")) {
            const ext = maskLower.substring(1); // Get ".clw"
            return filenameLower.endsWith(ext);
        }
        
        // Handle other mask patterns
        return filenameLower.endsWith(maskLower.replace("*", ""));
    }
    
    /**
     * Gets a resolver for a specific project path
     * @param projectPath The project path
     * @returns A function that resolves file paths
     */
    public getResolver(projectPath: string): (filename: string) => string {
        // Parse the project's redirection file
        const projectRedFile = path.join(projectPath, globalSettings.redirectionFile);
        const globalRedFile = path.join(globalSettings.redirectionPath, globalSettings.redirectionFile);
        
        let parsedRedFile: ParsedRedirectionFile | null = null;
        
        // Try project redirection file first
        if (fs.existsSync(projectRedFile)) {
            parsedRedFile = this.parseRedirectionFile(projectRedFile);
        }
        
        // Fall back to global redirection file
        if (!parsedRedFile && fs.existsSync(globalRedFile)) {
            parsedRedFile = this.parseRedirectionFile(globalRedFile);
        }
        
        // Return a resolver function
        return (filename: string): string => {
            // Check cache first
            const cacheKey = `${projectPath}|${filename}`;
            if (this.resolvedPathCache.has(cacheKey)) {
                return this.resolvedPathCache.get(cacheKey) || "";
            }
            
            // If we have a parsed redirection file, use it to resolve the path
            if (parsedRedFile) {
                const checkedPaths = new Set<string>();
                
                for (const entry of parsedRedFile.entries) {
                    if (this.matchesMask(entry.extension, filename)) {
                        for (const dir of entry.paths) {
                            const candidate = path.join(dir, filename);
                            const normalizedCandidate = path.normalize(candidate);
                            
                            // Skip if we've already checked this path
                            if (checkedPaths.has(normalizedCandidate)) {
                                continue;
                            }
                            
                            checkedPaths.add(normalizedCandidate);
                            
                            if (fs.existsSync(normalizedCandidate)) {
                                // Cache the result
                                this.resolvedPathCache.set(cacheKey, normalizedCandidate);
                                return normalizedCandidate;
                            }
                        }
                    }
                }
            }
            
            // If we couldn't resolve the path locally, try the server
            if (isClientReady()) {
                const client = getLanguageClient();
                if (client) {
                    // This is async, but we're in a sync context, so we can't wait for it
                    // We'll just return an empty string for now and let the caller handle it
                    client.sendRequest<{ path: string, source: string }>('clarion/findFile', { filename })
                        .then(result => {
                            if (result.path && fs.existsSync(result.path)) {
                                // Cache the result for future use
                                this.resolvedPathCache.set(cacheKey, result.path);
                            }
                        })
                        .catch(error => {
                            logger.error(`Error requesting file from server: ${error instanceof Error ? error.message : String(error)}`);
                        });
                }
            }
            
            return "";
        };
    }
    
    /**
     * Clears the cache
     */
    public clearCache(): void {
        this.redFileCache.clear();
        this.resolvedPathCache.clear();
        logger.info("Redirection cache cleared");
    }
}

// Export a singleton instance
export const redirectionService = RedirectionService.getInstance();