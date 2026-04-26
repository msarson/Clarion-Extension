import { Uri, workspace, window, Progress, ProgressLocation } from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { LanguageClient } from 'vscode-languageclient/node';
import { ClarionSolutionTreeNode, ClarionSolutionInfo, ClarionProjectInfo, ClarionSourcerFileInfo } from '../../common/types';
import LoggerManager from './utils/LoggerManager';
import { globalSettings } from './globals';
import { LanguageClientManager, isClientReady, getClientReadyPromise } from './LanguageClientManager';
import { SolutionParser } from './SolutionParser';
import { redirectionService } from './paths/RedirectionService';
import { ProjectIndex } from './ProjectIndex';

const logger = LoggerManager.getLogger("SolutionCache");
logger.setLevel("error");

// Cache schema version - increment when changing the structure
const CACHE_SCHEMA_VERSION = 2;

// Source of project files data
type BuiltFrom = 'cwproj' | 'server';

// Project files data transfer object
interface ProjectFilesDTO {
  cacheVersion: number;             // = 2
  projectGuid: string;
  projectName: string;
  cwprojPath: string;               // absolute
  cwprojMTime: number;              // fs.stat.mtimeMs
  cwprojSize: number;               // fs.stat.size
  cwprojHash: string;               // hash of ItemGroup sections
  builtFrom: BuiltFrom;             // MUST be 'cwproj' to persist
  files: Array<{
    name: string;
    absolutePath: string;           // required, normalized
    relativePath?: string;          // optional
    exists?: boolean;               // optional hint
  }>;
}

// Solution cache file structure
interface SolutionCacheDTO {
  cacheVersion: number;
  solutionPath: string;
  timestamp: number;
  solutionFilePath: string;
  solutionInfo: any;
  projects: ProjectFilesDTO[];
}

// The atomicWriteJson function has been removed as part of the refactoring
// to eliminate file-based caching

/**
 * Validates a ProjectFilesDTO to ensure it meets the requirements for persistence
 *
 * @param p The ProjectFilesDTO to validate
 * @returns true if the DTO is valid, false otherwise
 */
function isValidProjectDTO(p: ProjectFilesDTO): boolean {
  // Check schema version
  if (p.cacheVersion !== CACHE_SCHEMA_VERSION) return false;
  
  // Check if it's a valid .cwproj file
  if (!p.cwprojPath?.toLowerCase().endsWith('.cwproj')) return false;
  
  // Only authoritative parses from .cwproj files can be persisted
  if (p.builtFrom !== 'cwproj') return false;
  
  // Must have at least one file
  if (!Array.isArray(p.files) || p.files.length === 0) return false;

  // Check for duplicate absolute paths
  const seen = new Set<string>();
  for (const f of p.files) {
    if (!f.name || !f.absolutePath) return false;
    const abs = path.normalize(f.absolutePath).toLowerCase();
    if (seen.has(abs)) return false;
    seen.add(abs);
  }
  
  return true;
}

/**
 * Checks if a cached project DTO should be invalidated based on the .cwproj file's stats
 *
 * @param p The ProjectFilesDTO to check
 * @returns true if the DTO should be invalidated, false if it's still valid
 */
function shouldInvalidate(p: ProjectFilesDTO): boolean {
  // First check if the DTO is valid according to our schema
  if (!isValidProjectDTO(p)) {
    logger.info(`[CACHE] load v=${p.cacheVersion} -> invalidate reason=invalid`);
    return true;
  }
  
  // Then check if the .cwproj file still exists and has the same stats
  try {
    const st = fs.statSync(p.cwprojPath);
    
    // If the file has been modified or its size has changed, invalidate the cache
    if (st.mtimeMs !== p.cwprojMTime || st.size !== p.cwprojSize) {
      logger.info(`[CACHE] load v=${p.cacheVersion} -> invalidate reason=stat-mismatch`);
      return true;
    }
    
    // If we have a hash and it doesn't match, invalidate the cache
    if (p.cwprojHash) {
        try {
            // Read the file content
            const content = fs.readFileSync(p.cwprojPath, 'utf-8');
            
            // Import the CwprojParser dynamically to avoid circular dependencies
            const { CwprojParser } = require('./project/CwprojParser');
            
            // Compute the hash
            const hash = CwprojParser.computeItemGroupHash(content);
            
            // If the hash doesn't match, invalidate the cache
            if (hash !== p.cwprojHash) {
                logger.info(`[CACHE] load v=${p.cacheVersion} -> invalidate reason=hash-mismatch hash=${hash} cached=${p.cwprojHash}`);
                return true;
            }
        } catch (error) {
            logger.warn(`[CACHE] Error checking hash for ${p.cwprojPath}: ${error instanceof Error ? error.message : String(error)}`);
            return true; // Invalidate if we can't check the hash
        }
    }
    
    logger.info(`[CACHE] load v=${p.cacheVersion} -> ok`);
    return false;
  } catch {
    // If the file doesn't exist anymore, invalidate the cache
    logger.info(`[CACHE] load v=${p.cacheVersion} -> invalidate reason=file-not-found`);
    return true;
  }
}

/**
 * SolutionCache is a singleton class that caches the solution tree returned from the language server.
 * It communicates with the server-side solution management to get solution information.
 * It implements an in-memory cache mechanism to improve performance.
 */
export class SolutionCache {
    /**
     * Clears the solution cache state
     * This should be called when a solution is closed
     */
    public clear(): void {
        this.solutionInfo = null;
        
        // Clear the in-memory cache for this solution
        if (this.solutionFilePath) {
            SolutionCache.inMemoryCache.delete(this.solutionFilePath);
            
            // Also clear the server-side cache if the client is ready
            this.clearServerCache(this.solutionFilePath).catch(error => {
                logger.warn(`⚠️ Failed to clear server-side cache: ${error instanceof Error ? error.message : String(error)}`);
            });
        }
        
        this.solutionFilePath = '';
        this.projectDetailsCache.clear();
        logger.info("✅ Solution cache cleared");
    }
    
    /**
     * Clears the server-side cache for a specific solution file
     * @param solutionPath The path to the solution file to clear the cache for
     */
    private async clearServerCache(solutionPath: string): Promise<void> {
        if (!this.client || this.client.needsStart()) {
            logger.warn("⚠️ Language client not ready. Cannot clear server-side cache.");
            return;
        }
        
        try {
            logger.info(`🔄 Requesting server to clear cache for: ${solutionPath}`);
            const result = await this.client.sendRequest<{ success: boolean, message: string }>('clarion/clearSolutionCache', { solutionPath });
            logger.info(`✅ Server cache cleared: ${result.message}`);
        } catch (error) {
            logger.error(`❌ Error clearing server cache: ${error instanceof Error ? error.message : String(error)}`);
            throw error;
        }
    }
    
    /**
     * Clears all server-side caches
     * This is useful for troubleshooting or when major changes are made to the project structure
     */
    public async clearAllServerCaches(): Promise<void> {
        if (!this.client || this.client.needsStart()) {
            logger.warn("⚠️ Language client not ready. Cannot clear server-side caches.");
            return;
        }
        
        try {
            logger.info(`🔄 Requesting server to clear all caches`);
            const result = await this.client.sendRequest<{ success: boolean, message: string }>('clarion/clearSolutionCache', {});
            logger.info(`✅ All server caches cleared: ${result.message}`);
        } catch (error) {
            logger.error(`❌ Error clearing all server caches: ${error instanceof Error ? error.message : String(error)}`);
            throw error;
        }
    }

    private static instance: SolutionCache | null = null;
    // Static in-memory cache to store solution trees by their file paths
    private static inMemoryCache: Map<string, SolutionCacheDTO> = new Map();
    private client: LanguageClient | null = null;
    private solutionInfo: ClarionSolutionInfo | null = null;
    private solutionFilePath: string = '';
    private projectIndex: ProjectIndex;
    private lastCacheTime: number = 0;
    private firstFetchAttempted: boolean = false;
    private fetchInProgress: boolean = false;
    private backgroundRefreshScheduled: boolean = false;
    private activationInProgress: boolean = true;
    private filePathCache: Map<string, string> = new Map();
    

    private constructor() {
        // Private constructor to enforce singleton pattern
        this.projectIndex = ProjectIndex.getInstance();
    }

    /**
     * Gets the first fetch timeout value from configuration
     * @returns The timeout value in milliseconds
     */
    private getFirstFetchTimeoutMs(): number {
        return workspace.getConfiguration().get<number>("clarion.firstFetchTimeoutMs", 2500);
    }

    /**
     * Checks if local .sln fallback is enabled in configuration
     * @returns True if local .sln fallback is enabled, false otherwise
     */
    private isLocalSlnFallbackEnabled(): boolean {
        return workspace.getConfiguration().get<boolean>("clarion.enableLocalSlnFallback", true);
    }
    
    /**
     * Gets the resolve timeout value based on whether activation is in progress
     * @returns The timeout value in milliseconds
     */
    private getResolveTimeoutMs(): number {
        if (this.activationInProgress) {
            return workspace.getConfiguration().get<number>("clarion.resolveTimeoutInitMs", 500);
        } else {
            return workspace.getConfiguration().get<number>("clarion.resolveTimeoutMs", 5000);
        }
    }
    
    /**
     * Checks if a path is a library source file
     * This is used to skip project search for library files
     * @param filePath The file path to check
     * @returns True if the path is a library source file, false otherwise
     */
    private isLibSrcPath(filePath: string): boolean {
        // Normalize the path for case-insensitive comparison
        const normalizedPath = filePath.toLowerCase();
        
        // Check if the path contains 'libsrc' directory
        if (normalizedPath.includes('libsrc')) {
            return true;
        }
        
        // Check if the file is in the system module denylist
        const fileName = path.basename(normalizedPath);
        
        
        return false;
    }
    
    /**
     * Marks the activation as complete
     * This is called when the extension is fully activated
     */
    public markActivationComplete(): void {
        this.activationInProgress = false;
        logger.info("✅ Activation marked as complete in SolutionCache");
    }

    /**
     * Re-arms the activation guard so the next refreshOpenDocuments call
     * (e.g. the deferred refresh triggered by clarion/solutionReady) blocks
     * server calls while the document refresh is in progress.
     */
    public beginActivationRefresh(): void {
        this.activationInProgress = true;
        logger.info("🔄 Activation guard re-armed for deferred refresh");
    }

    /**
     * Tries to parse the solution tree from the local .sln file
     * @param solutionFilePath The path to the .sln file
     * @returns A promise that resolves to the solution tree, or null if parsing failed
     */
    private async tryLocalParseFromSln(solutionFilePath: string): Promise<ClarionSolutionInfo | null> {
        if (!this.isLocalSlnFallbackEnabled()) {
            logger.info("⚠️ Local .sln fallback is disabled in configuration");
            return null;
        }

        const startTime = performance.now();
        logger.info("🔄 Attempting to parse solution tree from local .sln file...");

        try {
            const solutionInfo = await SolutionParser.parseFromSolutionFile(solutionFilePath);
            
            if (solutionInfo && solutionInfo.projects.length > 0) {
                const endTime = performance.now();
                logger.info(`✅ Successfully parsed solution tree from local .sln file with ${solutionInfo.projects.length} projects in ${(endTime - startTime).toFixed(2)}ms`);
                return solutionInfo;
            } else {
                logger.warn("⚠️ Failed to parse solution tree from local .sln file or no projects found");
                return null;
            }
        } catch (error) {
            logger.error(`❌ Error parsing solution tree from local .sln file: ${error instanceof Error ? error.message : String(error)}`);
            return null;
        }
    }

    /**
     * Creates a promise that resolves after the specified timeout
     * @param timeoutMs The timeout in milliseconds
     * @returns A promise that resolves after the specified timeout
     */
    private createTimeoutPromise<T>(timeoutMs: number): Promise<T | null> {
        return new Promise<T | null>((resolve) => {
            setTimeout(() => {
                resolve(null);
            }, timeoutMs);
        });
    }

    /**
     * Schedules a background refresh of the solution cache once the language client is ready
     * This is a non-blocking operation that won't clear the cache immediately
     */
    private scheduleBackgroundRefresh(): void {
        if (this.backgroundRefreshScheduled) {
            return;
        }

        this.backgroundRefreshScheduled = true;
        logger.info("🔄 Scheduling non-blocking background refresh once language client is ready");

        // Wait for the language client to be ready, then refresh the solution cache
        getClientReadyPromise().then(async () => {
            try {
                logger.info("✅ Language client is now ready. Performing background refresh of solution cache...");
                const startTime = performance.now();
                
                // Get the solution tree from the server
                const serverSolution = await this.fetchSolutionFromServer();
                
                // Only update if the server returned a valid solution with projects
                if (serverSolution && serverSolution.projects && serverSolution.projects.length > 0) {
                    // Update the solution info
                    this.solutionInfo = serverSolution;
                    
                    // Save to in-memory cache
                    this.saveToInMemoryCache();
                    
                    const endTime = performance.now();
                    logger.info(`✅ Background refresh completed successfully in ${(endTime - startTime).toFixed(2)}ms`);
                    
                    // Notify any listeners that the solution cache has been refreshed
                    window.showInformationMessage("🌳 Updated solution tree from server.");
                } else {
                    logger.warn("⚠️ Background refresh skipped - server returned empty or invalid solution");
                }
            } catch (error) {
                logger.error(`❌ Error in background refresh: ${error instanceof Error ? error.message : String(error)}`);
            } finally {
                this.backgroundRefreshScheduled = false;
            }
        }).catch(error => {
            logger.error(`❌ Error waiting for language client in background refresh: ${error instanceof Error ? error.message : String(error)}`);
            this.backgroundRefreshScheduled = false;
        });
    }
    
    /**
     * Fetches the solution tree from the server
     * @returns The solution tree, or null if the fetch failed
     */
    // Debounce mechanism to prevent multiple simultaneous requests
    private fetchInProgressPromise: Promise<ClarionSolutionInfo | null> | null = null;
    private fetchDebounceTimeoutId: NodeJS.Timeout | null = null;
    private readonly FETCH_DEBOUNCE_DELAY = 300; // ms
    
    /**
     * Fetches the solution tree from the server with debouncing to prevent multiple simultaneous requests
     * @returns The solution tree, or null if the fetch failed
     */
    private async fetchSolutionFromServer(): Promise<ClarionSolutionInfo | null> {
        if (!this.client || this.client.needsStart()) {
            logger.warn("⚠️ Language client not ready. Cannot fetch solution from server.");
            return null;
        }
        
        // If there's already a fetch in progress, return that promise
        if (this.fetchInProgressPromise) {
            logger.info("⏳ Fetch already in progress, reusing existing request");
            return this.fetchInProgressPromise;
        }
        
        // Clear any existing debounce timeout
        if (this.fetchDebounceTimeoutId) {
            clearTimeout(this.fetchDebounceTimeoutId);
            this.fetchDebounceTimeoutId = null;
        }
        
        // Create a new debounced fetch promise
        this.fetchInProgressPromise = new Promise<ClarionSolutionInfo | null>((resolve) => {
            // Set a debounce timeout to prevent rapid successive requests
            this.fetchDebounceTimeoutId = setTimeout(async () => {
                try {
                    const startTime = performance.now();
                    logger.info("🔄 Fetching solution tree from server...");
                    
                    // Set a timeout to prevent hanging if the server doesn't respond
                    // 🚀 PERFORMANCE: Reduced from 8 seconds to 5 seconds
                    const timeoutPromise = new Promise<null>((timeoutResolve) => {
                        setTimeout(() => {
                            logger.warn("[SolutionCache] ⚠️ Server request timed out after 5 seconds");
                            timeoutResolve(null);
                        }, 5000);
                    });
                    
                    // Race between the actual request and the timeout
                    const solution = await Promise.race([
                        this.client!.sendRequest<ClarionSolutionInfo | null>('clarion/getSolutionTree'),
                        timeoutPromise
                    ]);
                    
                    const endTime = performance.now();
                    
                    if (solution && solution.projects && solution.projects.length > 0) {
                        logger.info(`✅ Solution tree fetched with ${solution.projects.length} projects in ${(endTime - startTime).toFixed(2)}ms`);
                        resolve(solution);
                    } else {
                        if (solution === null) {
                            logger.warn("⚠️ Server request timed out or returned null");
                        } else {
                            logger.warn(`⚠️ Server returned empty solution tree (${solution?.projects?.length || 0} projects)`);
                        }
                        resolve(null);
                    }
                } catch (error) {
                    // 🔧 FIX: Provide better error context
                    if (error instanceof Error && error.message.includes("reading 'sendRequest'")) {
                        logger.error(`❌ Error fetching solution tree: Language client not initialized yet. This is normal during startup.`);
                    } else {
                        logger.error(`❌ Error fetching solution tree: ${error instanceof Error ? error.message : String(error)}`);
                    }
                    resolve(null);
                } finally {
                    // Clear the in-progress promise after a short delay to prevent immediate re-requests
                    setTimeout(() => {
                        this.fetchInProgressPromise = null;
                    }, 100);
                }
            }, this.FETCH_DEBOUNCE_DELAY);
        });
        
        return this.fetchInProgressPromise;
    }

    // Removed getPersistentCachePath method as it's no longer needed with in-memory caching

    /**
     * Loads the solution tree from the persistent cache
     * @returns True if the cache was loaded successfully, false otherwise
     */
    private loadFromInMemoryCache(): boolean {
        if (!this.solutionFilePath) {
            logger.info(`❌ No solution file path specified`);
            return false;
        }

        try {
            const startTime = performance.now();
            logger.info(`🔄 Loading solution tree from in-memory cache for: ${this.solutionFilePath}`);
            
            // Get the cached data from the static map
            const cacheJson = SolutionCache.inMemoryCache.get(this.solutionFilePath);
            
            if (!cacheJson) {
                logger.info(`❌ No in-memory cache found for: ${this.solutionFilePath}`);
                return false;
            }
            
            // Validate the cache data
            if (!cacheJson.solutionInfo || !cacheJson.timestamp || !cacheJson.solutionFilePath) {
                logger.warn("⚠️ Invalid cache data format");
                return false;
            }
            
            // Check if the cache is for the current solution
            if (cacheJson.solutionFilePath !== this.solutionFilePath) {
                logger.warn(`⚠️ Cache is for a different solution: ${cacheJson.solutionFilePath} vs ${this.solutionFilePath}`);
                return false;
            }
            
            // Check if the solution file has been modified since the cache was created
            if (fs.existsSync(this.solutionFilePath)) {
                const solutionStats = fs.statSync(this.solutionFilePath);
                const solutionModified = solutionStats.mtimeMs;
                
                if (solutionModified > cacheJson.timestamp) {
                    logger.warn(`⚠️ Solution file has been modified since cache was created (${new Date(solutionModified).toISOString()} vs ${new Date(cacheJson.timestamp).toISOString()})`);
                    return false;
                }
            }
            
            // Check cache version
            if (cacheJson.cacheVersion !== CACHE_SCHEMA_VERSION) {
                logger.warn(`[CACHE] load v=${cacheJson.cacheVersion || 'unknown'} -> invalidate reason=version`);
                return false;
            }
            
            // Process projects with validation
            if (cacheJson.projects && Array.isArray(cacheJson.projects)) {
                // Validate each project DTO
                const validProjects: ProjectFilesDTO[] = [];
                
                for (const projectDto of cacheJson.projects) {
                    // Check if this project should be invalidated
                    if (shouldInvalidate(projectDto)) {
                        logger.info(`[CACHE] Project ${projectDto.projectName} invalidated`);
                        continue;
                    }
                    
                    // Only include projects built from .cwproj files
                    if (projectDto.builtFrom !== 'cwproj') {
                        logger.info(`[CACHE] Project ${projectDto.projectName} skipped: non-authoritative source`);
                        continue;
                    }
                    
                    validProjects.push(projectDto);
                }
                
                // Update the projects in the cache
                cacheJson.projects = validProjects;
                logger.info(`[CACHE] Loaded ${validProjects.length} valid projects from cache`);
            }
            
            // Use the solution info directly without conversion
            this.solutionInfo = cacheJson.solutionInfo;
            this.lastCacheTime = cacheJson.timestamp;
            
            // Validate the solution info has projects
            if (!this.solutionInfo || !this.solutionInfo.projects || this.solutionInfo.projects.length === 0) {
                logger.warn(`⚠️ Cache contains invalid solution info or empty projects array`);
                return false;
            }
            
            const endTime = performance.now();
            logger.info(`✅ Solution tree loaded from in-memory cache with ${this.solutionInfo?.projects?.length || 0} projects in ${(endTime - startTime).toFixed(2)}ms`);
            
            return true;
        } catch (error) {
            logger.error(`❌ Error loading from in-memory cache: ${error instanceof Error ? error.message : String(error)}`);
            return false;
        }
    }

    // The solutionToDTO and dtoToSolution methods have been removed as part of the
    // refactoring to eliminate client-side caching. The solution data is now
    // always requested from the server and used directly without conversion.

    /**
     * Saves the solution tree to the in-memory cache
     */
    private saveToInMemoryCache(): void {
        if (!this.solutionInfo || !this.solutionFilePath) {
            return;
        }

        try {
            const startTime = performance.now();
            logger.info(`🔄 Saving solution tree to in-memory cache for: ${this.solutionFilePath}`);
            
            // Skip saving if the solution has no projects
            if (!this.solutionInfo || !this.solutionInfo.projects || this.solutionInfo.projects.length === 0) {
                logger.warn(`⚠️ Skipping cache save - solution has no projects`);
                logger.info(`[CACHE] write rejected reason=empty`);
                return;
            }
            
            // Create a solution cache DTO with schema version
            const cacheData: SolutionCacheDTO = {
                cacheVersion: CACHE_SCHEMA_VERSION,
                solutionPath: this.solutionInfo.path,
                timestamp: Date.now(),
                solutionFilePath: this.solutionFilePath,
                solutionInfo: this.solutionInfo,
                projects: [] // Will be populated with validated projects
            };
            
            // Process each project to ensure only authoritative data is saved
            if (this.solutionInfo.projects) {
                for (const project of this.solutionInfo.projects) {
                    // Skip projects without a valid .cwproj file
                    const cwprojPath = path.join(project.path, project.filename);
                    if (!cwprojPath.toLowerCase().endsWith('.cwproj') || !fs.existsSync(cwprojPath)) {
                        logger.info(`[CACHE] Project ${project.name} skipped: no valid .cwproj file`);
                        continue;
                    }
                    
                    try {
                        // Get the .cwproj file stats
                        const stat = fs.statSync(cwprojPath);
                        
                        // Create a project DTO
                        const projectDto: ProjectFilesDTO = {
                            cacheVersion: CACHE_SCHEMA_VERSION,
                            projectGuid: project.guid,
                            projectName: project.name,
                            cwprojPath: cwprojPath,
                            cwprojMTime: stat.mtimeMs,
                            cwprojSize: stat.size,
                            cwprojHash: '', // Will be computed later
                            builtFrom: 'cwproj', // Mark all as authoritative for now
                            files: []
                        };
                        
                        // Compute the hash for the project file
                        try {
                            // Import the CwprojParser dynamically to avoid circular dependencies
                            import('./project/CwprojParser').then(({ CwprojParser }) => {
                                // Read the file content
                                const content = fs.readFileSync(cwprojPath, 'utf-8');
                                
                                // Compute the hash
                                projectDto.cwprojHash = CwprojParser.computeItemGroupHash(content);
                                logger.info(`[CACHE] Computed hash for ${path.basename(cwprojPath)}: ${projectDto.cwprojHash}`);
                            }).catch(error => {
                                logger.warn(`[CACHE] Error computing hash for ${path.basename(cwprojPath)}: ${error instanceof Error ? error.message : String(error)}`);
                            });
                        } catch (error) {
                            logger.warn(`[CACHE] Error computing hash for ${path.basename(cwprojPath)}: ${error instanceof Error ? error.message : String(error)}`);
                        }
                        
                        // Process source files — skip fs.existsSync (synchronous I/O on 3000+ files is slow)
                        if (project.sourceFiles && Array.isArray(project.sourceFiles)) {
                            for (const sourceFile of project.sourceFiles) {
                                if (!sourceFile.name) continue;
                                
                                // Compute absolute path if needed
                                let absolutePath = '';
                                if (sourceFile.relativePath) {
                                    absolutePath = path.isAbsolute(sourceFile.relativePath)
                                        ? sourceFile.relativePath
                                        : path.join(project.path, sourceFile.relativePath);
                                } else {
                                    // Skip files without a path
                                    continue;
                                }
                                
                                projectDto.files.push({
                                    name: sourceFile.name,
                                    absolutePath: path.normalize(absolutePath),
                                    relativePath: sourceFile.relativePath
                                    // exists: omitted — checking existence synchronously for 3000+ files causes startup hangs
                                });
                            }
                        }
                        
                        // Only add valid projects to the cache
                        if (isValidProjectDTO(projectDto)) {
                            cacheData.projects.push(projectDto);
                        } else {
                            logger.warn(`[CACHE] Project ${project.name} validation failed`);
                        }
                    } catch (error) {
                        logger.warn(`[CACHE] Error processing project ${project.name}: ${error instanceof Error ? error.message : String(error)}`);
                    }
                }
            }
            
            // Store the cache data in the in-memory cache
            SolutionCache.inMemoryCache.set(this.solutionFilePath, cacheData);
            this.lastCacheTime = cacheData.timestamp;
            
            const endTime = performance.now();
            const projectCount = cacheData.projects.length;
            const fileCount = cacheData.projects.reduce((sum: number, project: ProjectFilesDTO) =>
                sum + project.files.length, 0);
            
            logger.info(`[CACHE] saved DTO projects=${projectCount} files=${fileCount} ok`);
            logger.info(`✅ Solution tree saved to in-memory cache in ${(endTime - startTime).toFixed(2)}ms`);
        } catch (error) {
            logger.error(`❌ Error saving to in-memory cache: ${error instanceof Error ? error.message : String(error)}`);
            logger.info(`[CACHE] write rejected reason=error`);
        }
    }

    /**
     * Gets the singleton instance of SolutionCache
     */
    public static getInstance(): SolutionCache {
        if (!SolutionCache.instance) {
            SolutionCache.instance = new SolutionCache();
        }
        return SolutionCache.instance;
    }

    /**
     * Sets the language client used to communicate with the server
     */
    public setLanguageClient(client: LanguageClient): void {
        this.client = client;
        logger.info("✅ Language client set in SolutionCache");
    }

    /**
     * Initializes the solution cache by fetching the solution tree from the server
     * First tries to load from persistent cache, then falls back to server request
     */
    public async initialize(solutionFilePath: string): Promise<boolean> {
        const startTime = performance.now();
        this.solutionFilePath = solutionFilePath;

        try {
            // First try to load from in-memory cache
            if (this.loadFromInMemoryCache()) {
                const endTime = performance.now();
                logger.info(`✅ Solution initialized from in-memory cache in ${(endTime - startTime).toFixed(2)}ms`);
                return true;
            } else {
                logger.info(`⚠️ Could not load from in-memory cache, falling back to server request`);
            }

            // Check if language client is ready
            if (!isClientReady()) {
                logger.info("⏳ Language client not ready; deferring first solution fetch until ready.");
                
                // If this is the first fetch attempt, use a short timeout and fallback to local parsing
                if (!this.firstFetchAttempted && this.isLocalSlnFallbackEnabled()) {
                    logger.info(`⏳ First fetch attempt with ${this.getFirstFetchTimeoutMs()}ms timeout and local fallback.`);
                    
                    // Try to get a quick response from the server with a short timeout
                    const quickResult = await this.fetchWithTimeout();
                    
                    if (quickResult) {
                        // Server responded quickly, use the result
                        const endTime = performance.now();
                        logger.info(`✅ Solution initialized from quick server fetch in ${(endTime - startTime).toFixed(2)}ms`);
                        this.firstFetchAttempted = true;
                        return true;
                    } else {
                        // Server didn't respond in time, try local parsing
                        logger.warn(`⚠️ First server fetch timed out at ${this.getFirstFetchTimeoutMs()}ms; using local .sln fallback.`);
                        const localTree = await this.tryLocalParseFromSln(solutionFilePath);
                        
                        if (localTree) {
                            // Local parsing succeeded, use the result
                            this.solutionInfo = localTree;
                            this.saveToInMemoryCache();
                            
                            // Schedule a non-blocking background refresh once the client is ready
                            // but don't clear the cache immediately
                            this.scheduleBackgroundRefresh();
                            
                            const endTime = performance.now();
                            logger.info(`✅ Solution initialized from local .sln parse in ${(endTime - startTime).toFixed(2)}ms`);
                            this.firstFetchAttempted = true;
                            return true;
                        }
                    }
                }
                
                // Wait for the language client to be ready before proceeding
                logger.info("⏳ Waiting for language client to be ready...");
                await getClientReadyPromise();
                logger.info("✅ Language client ready; proceeding with solution fetch.");
            }

            // Client is ready, proceed with normal fetch
            if (this.fetchInProgress) {
                logger.info("⏳ Fetch already in progress, waiting for it to complete...");
                return false;
            }

            this.fetchInProgress = true;
            
            try {
                // Guard: client must be set before we can make requests
                if (!this.client) {
                    logger.info("⏳ Language client not yet set in SolutionCache; deferring until setLanguageClient() is called.");
                    this.fetchInProgress = false;
                    return false;
                }

                // Show progress notification
                await window.withProgress({
                    location: ProgressLocation.Notification,
                    title: 'Loading solution...',
                    cancellable: false
                }, async (progress: Progress<{ message?: string; increment?: number }>) => {
                    progress.report({ message: 'Fetching solution structure...' });
                    
                    // Set a timeout to prevent hanging if the server doesn't respond
                    const timeoutPromise = new Promise<null>((resolve) => {
                        setTimeout(() => {
                            logger.warn("⚠️ Server request timed out");
                            resolve(null);
                        }, 15000); // 15 second timeout for normal fetches
                    });

                    const requestStartTime = performance.now();
                    logger.info(`⏱️ [STARTUP] clarion/getSolutionTree request sent`);
                    // Race between the actual request and the timeout
                    this.solutionInfo = await Promise.race([
                        this.client!.sendRequest<ClarionSolutionInfo | null>('clarion/getSolutionTree'),
                        timeoutPromise
                    ]);
                    const requestEndTime = performance.now();
                    logger.info(`⏱️ [STARTUP] clarion/getSolutionTree response received in ${(requestEndTime - requestStartTime).toFixed(0)}ms (${this.solutionInfo?.projects?.length ?? 0} projects)`);
                    logger.info(`🕒 Server request completed in ${(requestEndTime - requestStartTime).toFixed(2)}ms`);

                    if (this.solutionInfo && this.solutionInfo.projects && this.solutionInfo.projects.length > 0) {
                        logger.info(`✅ Solution tree fetched with ${this.solutionInfo.projects.length} projects`);
                        
                        // Save to in-memory cache
                        const saveStart = performance.now();
                        logger.info(`⏱️ [STARTUP] saveToInMemoryCache starting`);
                        this.saveToInMemoryCache();
                        logger.info(`⏱️ [STARTUP] saveToInMemoryCache done in ${(performance.now() - saveStart).toFixed(0)}ms`);
                        
                        // Log basic project information
                        logger.info(`📊 Solution tree structure:`);
                        for (let i = 0; i < this.solutionInfo.projects.length; i++) {
                            const project = this.solutionInfo.projects[i];
                            logger.info(`📂 Project ${i + 1}/${this.solutionInfo.projects.length}: ${project.name}`);
                            
                            // Log counts instead of full details
                            // Use optional chaining and type assertion to avoid TypeScript errors
                            const projectWithCounts = project as any;
                            logger.info(`  - Source Files: ${projectWithCounts.sourceFilesCount || project.sourceFiles?.length || 0}`);
                            logger.info(`  - File Drivers: ${projectWithCounts.fileDriversCount || project.fileDrivers?.length || 0}`);
                            logger.info(`  - Libraries: ${projectWithCounts.librariesCount || project.libraries?.length || 0}`);
                            logger.info(`  - Project References: ${projectWithCounts.projectReferencesCount || project.projectReferences?.length || 0}`);
                            logger.info(`  - None Files: ${projectWithCounts.noneFilesCount || project.noneFiles?.length || 0}`);
                        }
                        
                        progress.report({ message: 'Solution loaded successfully', increment: 100 });
                    } else {
                        logger.warn("⚠️ Server returned null solution tree");
                        
                        // Try local parsing as a fallback
                        if (this.isLocalSlnFallbackEnabled()) {
                            logger.info("🔄 Attempting local .sln parsing as fallback...");
                            const localTree = await this.tryLocalParseFromSln(this.solutionFilePath);
                            
                            if (localTree) {
                                this.solutionInfo = localTree;
                                logger.info("✅ Using locally parsed solution tree as fallback");
                                this.saveToInMemoryCache();
                            } else {
                                // Create an empty solution info
                                this.solutionInfo = {
                                    name: path.basename(this.solutionFilePath),
                                    path: this.solutionFilePath,
                                    projects: []
                                };
                            }
                        } else {
                            // Create an empty solution info
                            this.solutionInfo = {
                                name: path.basename(this.solutionFilePath),
                                path: this.solutionFilePath,
                                projects: []
                            };
                        }
                    }
                });
                
                const endTime = performance.now();
                logger.info(`✅ Solution initialized from server in ${(endTime - startTime).toFixed(2)}ms`);
                this.firstFetchAttempted = true;
                return this.solutionInfo !== null && this.solutionInfo.projects.length > 0;
            } catch (error) {
                logger.error(`❌ Error fetching solution tree: ${error instanceof Error ? error.message : String(error)}`);
                
                // Try local parsing as a fallback
                if (this.isLocalSlnFallbackEnabled()) {
                    logger.info("🔄 Attempting local .sln parsing as fallback after error...");
                    const localTree = await this.tryLocalParseFromSln(this.solutionFilePath);
                    
                    if (localTree) {
                        this.solutionInfo = localTree;
                        logger.info("✅ Using locally parsed solution tree as fallback after error");
                        this.saveToInMemoryCache();
                        this.firstFetchAttempted = true;
                        return true;
                    }
                }
                
                // Create an empty solution info
                this.solutionInfo = {
                    name: path.basename(this.solutionFilePath),
                    path: this.solutionFilePath,
                    projects: []
                };
                this.firstFetchAttempted = true;
                return false;
            } finally {
                this.fetchInProgress = false;
            }
        } catch (error) {
            logger.error(`❌ Error initializing solution cache: ${error instanceof Error ? error.message : String(error)}`);

            // Create an empty solution info
            this.solutionInfo = {
                name: path.basename(this.solutionFilePath),
                path: this.solutionFilePath,
                projects: []
            };
            this.firstFetchAttempted = true;
            return false;
        }
    }

    /**
     * Fetches the solution tree from the server with a short timeout
     * @returns A promise that resolves to true if the fetch was successful, false otherwise
     */
    /**
     * Fetches the solution tree from the server with a short timeout
     * Uses the debounce mechanism to prevent multiple simultaneous requests
     * @returns A promise that resolves to true if the fetch was successful, false otherwise
     */
    private async fetchWithTimeout(): Promise<boolean> {
        // If there's already a fetch in progress, return that promise
        if (this.fetchInProgressPromise) {
            logger.info("⏳ Fetch already in progress, reusing existing request");
            const result = await this.fetchInProgressPromise;
            if (result && result.projects && result.projects.length > 0) {
                this.solutionInfo = result;
                this.saveToInMemoryCache();
                return true;
            }
            return false;
        }

        const fetchStartTime = performance.now();
        
        try {
            // Use a short timeout for the first fetch attempt
            const timeoutMs = this.getFirstFetchTimeoutMs();
            
            if (!this.client) {
                logger.warn("⚠️ Language client not available for fetch with timeout");
                return false;
            }
            
            logger.info(`🔄 Fetching solution tree from server with ${timeoutMs}ms timeout...`);
            
            // Create a new debounced fetch promise
            this.fetchInProgressPromise = new Promise<ClarionSolutionInfo | null>(async (resolve) => {
                try {
                    // Create a timeout promise
                    const timeoutPromise = new Promise<null>((timeoutResolve) => {
                        setTimeout(() => {
                            logger.warn(`[SolutionCache] ⚠️ Quick fetch timed out after ${timeoutMs}ms`);
                            timeoutResolve(null);
                        }, timeoutMs);
                    });
                    
                    // Race between the actual request and the timeout
                    const solution = await Promise.race([
                        this.client!.sendRequest<ClarionSolutionInfo | null>('clarion/getSolutionTree'),
                        timeoutPromise
                    ]);
                    
                    resolve(solution);
                } catch (error) {
                    logger.error(`❌ Error in fetch with timeout: ${error instanceof Error ? error.message : String(error)}`);
                    resolve(null);
                }
            });
            
            // Wait for the fetch to complete
            const solution = await this.fetchInProgressPromise;
            
            const fetchEndTime = performance.now();
            const fetchDuration = fetchEndTime - fetchStartTime;
            
            if (solution && solution.projects && solution.projects.length > 0) {
                logger.info(`✅ Solution tree fetched with ${solution.projects.length} projects in ${fetchDuration.toFixed(2)}ms`);
                this.solutionInfo = solution;
                this.saveToInMemoryCache();
                
                // Clear the in-progress promise after a short delay
                setTimeout(() => {
                    this.fetchInProgressPromise = null;
                }, 100);
                
                return true;
            } else {
                logger.warn(`⚠️ Server fetch timed out or returned null after ${fetchDuration.toFixed(2)}ms`);
                
                // Clear the in-progress promise immediately for timeout cases
                this.fetchInProgressPromise = null;
                
                return false;
            }
        } catch (error) {
            logger.error(`❌ Error in fetch with timeout: ${error instanceof Error ? error.message : String(error)}`);
            this.fetchInProgressPromise = null;
            return false;
        }
    }

    /**
     * Refreshes the solution cache by fetching the latest solution tree from the server
     * @param forceRefresh If true, bypasses the persistent cache and forces a refresh from the server
     */
    public async refresh(forceRefresh: boolean = false): Promise<boolean> {
        const startTime = performance.now();
        if (!this.solutionFilePath) {
            logger.error("❌ Solution file path not set. Cannot refresh SolutionCache.");
            return false;
        }

        // Prevent duplicate refresh attempts when client is not ready
        if (!isClientReady() && !forceRefresh) {
            logger.info("🧯 Skipping server refresh (client not ready). Using cached/local tree.");
            
            // If we don't have a solution tree yet, try local parsing
            if (!this.solutionInfo || this.solutionInfo.projects.length === 0) {
                if (this.isLocalSlnFallbackEnabled()) {
                    logger.info("🔄 Attempting local .sln parsing for refresh when client not ready...");
                    const localParseStartTime = performance.now();
                    const localTree = await this.tryLocalParseFromSln(this.solutionFilePath);
                    const localParseEndTime = performance.now();
                    
                    if (localTree) {
                        this.solutionInfo = localTree;
                        logger.info(`✅ Using locally parsed solution tree for refresh when client not ready (parsed in ${(localParseEndTime - localParseStartTime).toFixed(2)}ms)`);
                        this.saveToInMemoryCache();
                        
                        // Schedule a non-blocking background refresh once the client is ready
                        // but don't clear the cache immediately
                        this.scheduleBackgroundRefresh();
                        
                        const endTime = performance.now();
                        logger.info(`✅ Solution refreshed from local .sln parse in ${(endTime - startTime).toFixed(2)}ms`);
                        return true;
                    }
                }
            }
            
            // Schedule a background refresh once the client is ready if we have a solution tree
            if (this.solutionInfo && this.solutionInfo.projects.length > 0) {
                this.scheduleBackgroundRefresh();
            }
            
            const endTime = performance.now();
            logger.info(`⏩ Refresh skipped (client not ready) in ${(endTime - startTime).toFixed(2)}ms`);
            return this.solutionInfo !== null && this.solutionInfo.projects.length > 0;
        }

        // Prevent concurrent refreshes
        if (this.fetchInProgress) {
            logger.info("⏳ Refresh already in progress, waiting for it to complete...");
            return false;
        }

        // Clear any cached project details
        this.projectDetailsCache.clear();
        
        // If force refresh, clear the persistent cache
        if (forceRefresh) {
            // Clear the in-memory cache for this solution
            if (this.solutionFilePath) {
                SolutionCache.inMemoryCache.delete(this.solutionFilePath);
            }
            // Clear the file path resolution cache so stale paths are re-resolved
            this.filePathCache.clear();
            logger.info("🔄 Forcing refresh from server (bypassing cache)");
            
            // Initialize directly from server, bypassing cache
            const serverStartTime = performance.now();
            const result = await this.initializeFromServer();
            const serverEndTime = performance.now();
            logger.info(`✅ Solution cache force refreshed from server in ${(serverEndTime - serverStartTime).toFixed(2)}ms`);
            
            const endTime = performance.now();
            logger.info(`✅ Total solution cache force refresh completed in ${(endTime - startTime).toFixed(2)}ms`);
            return result;
        }
        
        const initStartTime = performance.now();
        const result = await this.initialize(this.solutionFilePath);
        const initEndTime = performance.now();
        logger.info(`✅ Solution cache initialized in ${(initEndTime - initStartTime).toFixed(2)}ms`);
        
        const endTime = performance.now();
        logger.info(`✅ Solution cache refreshed in ${(endTime - startTime).toFixed(2)}ms`);
        return result;
    }
    
    /**
     * Initializes the solution cache directly from the server, bypassing the cache
     * This is used when force refreshing
     */
    private async initializeFromServer(): Promise<boolean> {
        const startTime = performance.now();
        
        try {
            // Check if client is ready before trying to use it
            if (!this.client || this.client.needsStart()) {
                if (this.client) {
                    logger.warn(`⚠️ Language client not ready (needsStart: ${this.client.needsStart()})`);
                } else {
                    logger.warn("⚠️ Language client not available");
                }
                return false;
            }
            
            logger.info("🔄 Fetching solution tree from server (bypassing cache)...");
            
            try {
                // Show progress notification
                await window.withProgress({
                    location: ProgressLocation.Notification,
                    title: 'Loading solution...',
                    cancellable: false
                }, async (progress: Progress<{ message?: string; increment?: number }>) => {
                    progress.report({ message: 'Fetching solution structure...' });
                    
                    // Set a timeout to prevent hanging if the server doesn't respond
                    const timeoutPromise = new Promise<null>((resolve) => {
                        setTimeout(() => {
                            logger.warn("⚠️ Server request timed out");
                            resolve(null);
                        }, 15000); // 15 second timeout
                    });
                    
                    const requestStartTime = performance.now();
                    // Race between the actual request and the timeout
                    const serverSolution = await Promise.race([
                        this.client!.sendRequest<ClarionSolutionInfo | null>('clarion/getSolutionTree'),
                        timeoutPromise
                    ]);
                    const requestEndTime = performance.now();
                    logger.info(`🕒 Server request completed in ${(requestEndTime - requestStartTime).toFixed(2)}ms`);
                    
                    if (serverSolution && serverSolution.projects && serverSolution.projects.length > 0) {
                        logger.info(`✅ Solution tree fetched with ${serverSolution.projects.length} projects`);
                        
                        // Update the solution info
                        this.solutionInfo = serverSolution;
                        
                        // Save to in-memory cache
                        this.saveToInMemoryCache();
                        
                        // Log basic project information
                        logger.info(`📊 Solution tree structure:`);
                        for (let i = 0; i < this.solutionInfo.projects.length; i++) {
                            const project = this.solutionInfo.projects[i];
                            logger.info(`📂 Project ${i + 1}/${this.solutionInfo.projects.length}: ${project.name}`);
                            
                            // Log counts instead of full details
                            // Use optional chaining and type assertion to avoid TypeScript errors
                            const projectWithCounts = project as any;
                            logger.info(`  - Source Files: ${projectWithCounts.sourceFilesCount || project.sourceFiles?.length || 0}`);
                            logger.info(`  - File Drivers: ${projectWithCounts.fileDriversCount || project.fileDrivers?.length || 0}`);
                            logger.info(`  - Libraries: ${projectWithCounts.librariesCount || project.libraries?.length || 0}`);
                            logger.info(`  - Project References: ${projectWithCounts.projectReferencesCount || project.projectReferences?.length || 0}`);
                            logger.info(`  - None Files: ${projectWithCounts.noneFilesCount || project.noneFiles?.length || 0}`);
                        }
                        
                        progress.report({ message: 'Solution loaded successfully', increment: 100 });
                    } else {
                        logger.warn("⚠️ Server returned null or empty solution tree");
                        
                        // Don't overwrite existing solution info if it has projects
                        if (!this.solutionInfo || !this.solutionInfo.projects || this.solutionInfo.projects.length === 0) {
                            logger.info("ℹ️ No existing solution info with projects, creating minimal placeholder");
                            // Create an empty solution info only if we don't have one already
                            this.solutionInfo = {
                                name: path.basename(this.solutionFilePath),
                                path: this.solutionFilePath,
                                projects: []
                            };
                        } else {
                            logger.info(`ℹ️ Keeping existing solution info with ${this.solutionInfo.projects.length} projects`);
                        }
                    }
                });
                
                const endTime = performance.now();
                logger.info(`✅ Solution initialized from server in ${(endTime - startTime).toFixed(2)}ms`);
                return this.solutionInfo !== null && this.solutionInfo.projects.length > 0;
            } catch (error) {
                logger.error(`❌ Error fetching solution tree: ${error instanceof Error ? error.message : String(error)}`);
                // Create an empty solution info
                this.solutionInfo = {
                    name: path.basename(this.solutionFilePath),
                    path: this.solutionFilePath,
                    projects: []
                };
                return false;
            }
        } catch (error) {
            logger.error(`❌ Error initializing solution cache from server: ${error instanceof Error ? error.message : String(error)}`);
            return false;
        }
    }
    
    // Cache for project details to avoid repeated requests
    private projectDetailsCache: Map<string, any> = new Map();
    
    /**
     * Gets detailed information for a specific project
     * This implements lazy loading of project details
     */
    // Map to track in-progress project details requests
    private projectDetailsInProgress: Map<string, Promise<any>> = new Map();
    
    /**
     * Gets detailed information for a specific project
     * This implements lazy loading of project details with debouncing
     */
    public async getProjectDetails(projectGuid: string): Promise<any> {
        const startTime = performance.now();
        
        // Check cache first
        if (this.projectDetailsCache.has(projectGuid)) {
            logger.info(`✅ Using cached project details for ${projectGuid}`);
            return this.projectDetailsCache.get(projectGuid);
        }
        
        // Check if there's already a request in progress for this project
        if (this.projectDetailsInProgress.has(projectGuid)) {
            logger.info(`⏳ Project details request already in progress for ${projectGuid}, reusing existing request`);
            return this.projectDetailsInProgress.get(projectGuid);
        }
        
        if (!this.client || this.client.needsStart()) {
            logger.warn("⚠️ Language client not ready. Cannot get project details.");
            return null;
        }
        
        // Create a new promise for this project details request
        const detailsPromise = new Promise<any>(async (resolve) => {
            try {
                logger.info(`🔄 Fetching project details for ${projectGuid} from server...`);
                
                // Set a timeout to prevent hanging if the server doesn't respond
                const timeoutPromise = new Promise<null>((timeoutResolve) => {
                    setTimeout(() => {
                        logger.warn(`⚠️ Server request timed out for project details: ${projectGuid}`);
                        timeoutResolve(null);
                    }, 10000); // 10 second timeout
                });
                
                const requestStartTime = performance.now();
                // Race between the actual request and the timeout
                const projectDetails = await Promise.race([
                    this.client!.sendRequest('clarion/getProjectDetails', { projectGuid }),
                    timeoutPromise
                ]);
                const requestEndTime = performance.now();
                logger.info(`🕒 Project details request completed in ${(requestEndTime - requestStartTime).toFixed(2)}ms`);
                
                if (projectDetails) {
                    const endTime = performance.now();
                    logger.info(`✅ Project details fetched for ${projectGuid} in ${(endTime - startTime).toFixed(2)}ms`);
                    
                    // Cache the result
                    this.projectDetailsCache.set(projectGuid, projectDetails);
                    
                    resolve(projectDetails);
                } else {
                    logger.warn(`⚠️ Server returned null project details for ${projectGuid}`);
                    resolve(null);
                }
            } catch (error) {
                logger.error(`❌ Error fetching project details: ${error instanceof Error ? error.message : String(error)}`);
                resolve(null);
            } finally {
                // Remove this request from the in-progress map after a short delay
                setTimeout(() => {
                    this.projectDetailsInProgress.delete(projectGuid);
                }, 100);
            }
        });
        
        // Store the promise in the in-progress map
        this.projectDetailsInProgress.set(projectGuid, detailsPromise);
        
        return detailsPromise;
    }

    /**
     * Gets the cached solution info (synchronous version)
     * This is the original method to maintain backward compatibility
     */
    public getSolutionInfo(): ClarionSolutionInfo | null {
        return this.solutionInfo;
    }

    /**
     * Gets the cached solution info with optional refresh (asynchronous version)
     * @param forceRefresh If true, forces a refresh from the server before returning
     */
    public async getSolutionInfoAsync(forceRefresh: boolean = false): Promise<ClarionSolutionInfo | null> {
        if (forceRefresh) {
            await this.refresh(true);
        }
        return this.solutionInfo;
    }

    /**
     * Gets the solution file path
     */
    public getSolutionFilePath(): string {
        return this.solutionFilePath;
    }

    /**
     * Gets search paths from the server for a specific project and file extension
     */
    // Map to track in-progress search paths requests
    private searchPathsInProgress: Map<string, Promise<string[]>> = new Map();
    
    /**
     * Gets search paths from the server for a specific project and file extension
     * Implements debouncing to prevent multiple simultaneous requests
     */
    public async getSearchPathsFromServer(projectName: string, extension: string): Promise<string[]> {
        if (!this.client || this.client.needsStart()) {
            logger.warn("⚠️ Language client not available or not ready. Cannot get search paths from server.");
            return [];
        }
        
        // Create a unique key for this request
        const requestKey = `${projectName}:${extension}`;
        
        // Check if there's already a request in progress for these parameters
        if (this.searchPathsInProgress.has(requestKey)) {
            logger.info(`⏳ Search paths request already in progress for ${projectName} and ${extension}, reusing existing request`);
            return this.searchPathsInProgress.get(requestKey)!;
        }

        // Create a new promise for this search paths request
        const searchPathsPromise = new Promise<string[]>(async (resolve) => {
            try {
                const startTime = performance.now();
                logger.info(`🔍 Requesting search paths from server for project ${projectName} and extension ${extension}`);

                // Use a promise with timeout to prevent hanging
                const timeoutPromise = new Promise<string[]>((timeoutResolve) => {
                    setTimeout(() => {
                        logger.warn(`⚠️ Server request timed out for search paths: ${projectName}, ${extension}`);

                        // Try to find project and provide basic search paths as fallback
                        try {
                            if (this.solutionInfo) {
                                const project = this.solutionInfo.projects.find(p => p.name === projectName);
                                if (project) {
                                    logger.info(`✅ Found project for fallback search paths: ${projectName}`);
                                    // Provide basic search paths
                                    const fallbackPaths = [
                                        project.path,
                                        path.dirname(this.solutionFilePath),
                                        path.join(path.dirname(this.solutionFilePath), 'include'),
                                        path.join(path.dirname(this.solutionFilePath), 'libsrc')
                                    ];
                                    timeoutResolve(fallbackPaths);
                                    return;
                                }
                            }
                        } catch (fallbackError) {
                            logger.error(`❌ Error in fallback for search paths: ${fallbackError instanceof Error ? fallbackError.message : String(fallbackError)}`);
                        }

                        timeoutResolve([]);
                    }, 15000); // Reduced to 15 second timeout to avoid UI freezes
                });

                // Race between the actual request and the timeout
                const paths = await Promise.race([
                    this.client!.sendRequest<string[]>('clarion/getSearchPaths', {
                        projectName,
                        extension
                    }),
                    timeoutPromise
                ]);
                
                const endTime = performance.now();

                if (paths && paths.length) {
                    logger.info(`✅ Received ${paths.length} search paths from server in ${(endTime - startTime).toFixed(2)}ms`);
                    resolve(paths);
                } else {
                    logger.warn(`⚠️ No search paths returned from server for ${projectName} and ${extension} in ${(endTime - startTime).toFixed(2)}ms`);
                    resolve([]);
                }
            } catch (error) {
                logger.error(`❌ Error getting search paths from server: ${error instanceof Error ? error.message : String(error)}`);
                resolve([]);
            } finally {
                // Remove this request from the in-progress map after a short delay
                setTimeout(() => {
                    this.searchPathsInProgress.delete(requestKey);
                }, 100);
            }
        });
        
        // Store the promise in the in-progress map
        this.searchPathsInProgress.set(requestKey, searchPathsPromise);
        
        return searchPathsPromise;
    }

    /**
     * Gets included redirection files from the server for a specific project path
     */
    // Map to track in-progress redirection files requests
    private redirectionFilesInProgress: Map<string, Promise<string[]>> = new Map();
    
    /**
     * Gets included redirection files from the server for a specific project path
     * Implements debouncing to prevent multiple simultaneous requests
     */
    public async getIncludedRedirectionFilesFromServer(projectPath: string): Promise<string[]> {
        if (!this.client || this.client.needsStart()) {
            logger.warn("⚠️ Language client not available or not ready. Cannot get included redirection files from server.");
            return [];
        }
        
        // Normalize the project path for use as a cache key
        const normalizedPath = path.normalize(projectPath).toLowerCase();
        
        // Check if there's already a request in progress for this project path
        if (this.redirectionFilesInProgress.has(normalizedPath)) {
            logger.info(`⏳ Redirection files request already in progress for ${projectPath}, reusing existing request`);
            return this.redirectionFilesInProgress.get(normalizedPath)!;
        }

        // Create a new promise for this redirection files request
        const redirectionFilesPromise = new Promise<string[]>(async (resolve) => {
            try {
                const startTime = performance.now();
                logger.info(`🔍 Requesting included redirection files from server for project at ${projectPath}`);

                // Use a promise with timeout to prevent hanging
                const timeoutPromise = new Promise<string[]>((timeoutResolve) => {
                    setTimeout(() => {
                        logger.warn(`⚠️ Server request timed out for included redirection files: ${projectPath}`);

                        // Try to find redirection files directly as a fallback
                        try {
                            const redFileName = globalSettings.redirectionFile;
                            const redFilePath = path.join(projectPath, redFileName);

                            if (fs.existsSync(redFilePath)) {
                                logger.info(`✅ Found redirection file using fallback direct path: ${redFilePath}`);
                                timeoutResolve([redFilePath]);
                                return;
                            }
                        } catch (fallbackError) {
                            logger.error(`❌ Error in fallback for redirection files: ${fallbackError instanceof Error ? fallbackError.message : String(fallbackError)}`);
                        }

                        timeoutResolve([]);
                    }, 15000); // Reduced to 15 second timeout to avoid UI freezes
                });

                // Race between the actual request and the timeout
                const redFiles = await Promise.race([
                    this.client!.sendRequest<string[]>('clarion/getIncludedRedirectionFiles', {
                        projectPath
                    }),
                    timeoutPromise
                ]);
                
                const endTime = performance.now();

                if (redFiles && redFiles.length) {
                    logger.info(`✅ Received ${redFiles.length} included redirection files from server in ${(endTime - startTime).toFixed(2)}ms`);
                    resolve(redFiles);
                } else {
                    logger.warn(`⚠️ No included redirection files returned from server for ${projectPath} in ${(endTime - startTime).toFixed(2)}ms`);
                    resolve([]);
                }
            } catch (error) {
                logger.error(`❌ Error getting included redirection files from server: ${error instanceof Error ? error.message : String(error)}`);
                resolve([]);
            } finally {
                // Remove this request from the in-progress map after a short delay
                setTimeout(() => {
                    this.redirectionFilesInProgress.delete(normalizedPath);
                }, 100);
            }
        });
        
        // Store the promise in the in-progress map
        this.redirectionFilesInProgress.set(normalizedPath, redirectionFilesPromise);
        
        return redirectionFilesPromise;
    }

    /**
     * Finds a project that contains the specified file
     * @deprecated Use findProjectsForFile instead to handle files in multiple projects
     */
    public findProjectForFile(fileName: string): ClarionProjectInfo | undefined {
        const projects = this.findProjectsForFile(fileName);
        return projects.length > 0 ? projects[0] : undefined;
    }

    /**
     * Finds all projects that contain the specified file
     * @returns Array of projects containing the file (empty if none found)
     */
    /**
     * Finds all projects that contain the specified file
     * This method is more precise than the previous implementation, considering both file name and path
     * @param fileName The file name or path to search for
     * @returns Array of projects containing the file (empty if none found)
     */
    public findProjectsForFile(fileName: string): ClarionProjectInfo[] {
        const startTime = performance.now();
        if (!this.solutionInfo) return [];

        logger.info(`🔍 Searching for projects containing file: ${fileName}`);

        // Use the ProjectIndex to find projects containing this file
        const projectIds = this.projectIndex.projectsContainingFile(fileName);
        
        if (projectIds.length === 0) {
            const endTime = performance.now();
            logger.info(`❌ File "${path.basename(fileName)}" not found in any project. (${Math.round(endTime - startTime)}ms)`);
            return [];
        }
        
        // Convert project IDs to project objects
        const matchingProjects: ClarionProjectInfo[] = [];
        for (const projectId of projectIds) {
            const project = this.solutionInfo.projects.find(p => p.guid === projectId);
            if (project) {
                matchingProjects.push(project);
            }
        }

        const endTime = performance.now();
        if (matchingProjects.length > 0) {
            // When multiple projects are found, log the absolute paths that produced the hits
            if (matchingProjects.length > 1) {
                logger.info(`[INDEX] projectsContainingFile("${path.basename(fileName)}") returned ${matchingProjects.length} projects`);
                
                // Log the absolute paths for each project
                for (const project of matchingProjects) {
                    const files = this.projectIndex.filesForProject(project.guid);
                    const matchingFiles = files.filter(f => path.basename(f).toLowerCase() === path.basename(fileName).toLowerCase());
                    
                    if (matchingFiles.length > 0) {
                        logger.info(`[INDEX] Project ${project.name} contains: ${matchingFiles.join(', ')}`);
                    }
                }
            }
            
            logger.info(`✅ File "${path.basename(fileName)}" found in ${matchingProjects.length} projects: ${matchingProjects.map(p => p.name).join(', ')}. (${Math.round(endTime - startTime)}ms)`);
        }
        
        return matchingProjects;
    }

    /**
     * Finds a source file in any project by its path
     */
    /**
     * Finds a source file in any project by its path
     * This method is more precise than the previous implementation, considering both file name and path
     * @param filePath The file path to search for
     * @returns The source file info if found, undefined otherwise
     */
    public findSourceInProject(filePath: string): ClarionSourcerFileInfo | undefined {
        if (!this.solutionInfo) return undefined;

        try {
            // Normalize the file path for case-insensitive comparison
            const normalizedFilePath = filePath.toLowerCase();
            const baseFileName = path.basename(filePath).toLowerCase();
            
            logger.info(`[SOURCE_LOOKUP] Looking for source file: ${baseFileName} (from ${filePath})`);
            logger.info(`[SOURCE_LOOKUP] Searching across ${this.solutionInfo.projects.length} projects`);

            // First, try to find an exact match by full path
            for (const project of this.solutionInfo.projects) {
                logger.info(`[SOURCE_LOOKUP] Checking project: ${project.name} (${project.guid})`);
                logger.info(`[SOURCE_LOOKUP] Project has ${project.sourceFiles.length} source files`);
                
                // Try to match by absolute path
                for (const sourceFile of project.sourceFiles) {
                    if (!sourceFile.relativePath) continue;
                    
                    // Check if the file's absolute path matches the input path
                    const fullPath = path.isAbsolute(sourceFile.relativePath)
                        ? sourceFile.relativePath.toLowerCase()
                        : path.join(project.path, sourceFile.relativePath).toLowerCase();
                    
                    if (fullPath === normalizedFilePath) {
                        logger.info(`[SOURCE_LOOKUP] Exact path match found: ${fullPath} in project ${project.name}`);
                        logger.info(`✅ Found source file by exact path in project: ${project.name} (${project.guid})`);
                        return sourceFile;
                    }
                }
                
                // Try to match by relative path
                const foundByPath = project.sourceFiles.find(sourceFile => {
                    if (!sourceFile.relativePath) return false;
                    
                    const match = sourceFile.relativePath.toLowerCase() === normalizedFilePath;
                    if (match) {
                        logger.info(`[SOURCE_LOOKUP] Relative path match found: ${sourceFile.relativePath} in project ${project.name}`);
                    }
                    return match;
                });

                if (foundByPath) {
                    logger.info(`✅ Found source file by relative path in project: ${project.name} (${project.guid})`);
                    return foundByPath;
                }
            }
            
            // If no exact path match, try to find a match by filename
            // Only consider this a match if the file is actually in the project's directory
            for (const project of this.solutionInfo.projects) {
                const foundByName = project.sourceFiles.find(sourceFile => {
                    const sourceFileName = path.basename(sourceFile.name).toLowerCase();
                    const match = sourceFileName === baseFileName;
                    
                    if (match) {
                        logger.info(`[SOURCE_LOOKUP] Name match found: ${sourceFile.name} in project ${project.name}`);
                        
                        // If we have a relative path, check if the file exists in the project directory
                        if (sourceFile.relativePath) {
                            logger.info(`[SOURCE_LOOKUP] File relative path: ${sourceFile.relativePath}`);
                            
                            // Check if the file exists in the project directory
                            const fullPath = path.isAbsolute(sourceFile.relativePath)
                                ? sourceFile.relativePath
                                : path.join(project.path, sourceFile.relativePath);
                                
                            if (fs.existsSync(fullPath)) {
                                logger.info(`[SOURCE_LOOKUP] File exists at: ${fullPath}`);
                                return true;
                            } else {
                                logger.info(`[SOURCE_LOOKUP] File does not exist at: ${fullPath}`);
                                return false;
                            }
                        }
                        
                        // If we don't have a relative path, just use the name match
                        return true;
                    }
                    
                    return false;
                });

                if (foundByName) {
                    logger.info(`✅ Found source file by name in project: ${project.name} (${project.guid})`);
                    return foundByName;
                }
            }
            
            logger.info(`❌ Source file "${baseFileName}" not found in any project.`);
        } catch (error) {
            logger.error(`❌ Error finding source in project: ${error instanceof Error ? error.message : String(error)}`);
        }

        return undefined;
    }

    /**
     * Finds a file with the specified extension in any project's search paths
     * @param filename The filename to search for
     * @param sourceFilePath Optional path to the file that is including/referencing this file
     * @returns The file path if found, or an empty string if not found
     */
    public async findFileWithExtension(filename: string, sourceFilePath?: string): Promise<string> {
        const startTime = performance.now();
        
        // Normalize the filename for case-insensitive comparison
        const normalizedFilename = filename.toLowerCase();
        
        // Create a cache key that includes the source file path if provided
        const cacheKey = sourceFilePath ? `${normalizedFilename}|${sourceFilePath}` : normalizedFilename;
        
        // Check source-specific cache first, then global (filename-only) cache.
        // The global cache is populated when a file resolves outside the source's own directory
        // (e.g., libsrc files, project files), allowing cross-document cache sharing.
        if (this.filePathCache.has(cacheKey)) {
            const cachedPath = this.filePathCache.get(cacheKey)!;
            logger.info(`✅ Cache hit for ${filename}: ${cachedPath}`);
            return cachedPath;
        }
        if (sourceFilePath && this.filePathCache.has(normalizedFilename)) {
            const cachedPath = this.filePathCache.get(normalizedFilename)!;
            logger.info(`✅ Global cache hit for ${filename}: ${cachedPath}`);
            this.filePathCache.set(cacheKey, cachedPath); // warm the source-specific key too
            return cachedPath;
        }
        
        if (!this.solutionInfo) {
            logger.info(`❌ No solution info available when searching for ${filename}`);
            return "";
        }

        if (!this.solutionFilePath || this.solutionFilePath.trim() === "") {
            logger.info(`❌ No solution file path set when searching for ${filename}`);
            return "";
        }

        logger.info(`🔍 Searching for file: ${filename}${sourceFilePath ? ` (from ${sourceFilePath})` : ''}`);
        
        // Skip server lookup entirely during activation/refresh — all 113 parallel
        // clarion/findFile requests queue on the server and block it for 5+ seconds.
        // Files not found locally during refresh will resolve lazily on first user interaction.
        if (this.activationInProgress) {
            logger.info(`⏩ Skipping server lookup during activation: ${filename}`);
            return "";
        }
        
        // Try FS + redirection first before calling the server
        const fsResult = await this.tryFindFileLocally(filename, sourceFilePath);
        if (fsResult) {
            const endTime = performance.now();
            logger.info(`✅ File found locally: ${fsResult} in ${(endTime - startTime).toFixed(2)}ms`);
            
            // Cache with source-specific key
            this.filePathCache.set(cacheKey, fsResult);
            
            // Also cache globally (filename-only) if the file was NOT found in the source's
            // own directory. This allows other documents referencing the same INCLUDE/MODULE
            // to skip resolution entirely (libsrc, project files, etc.).
            if (sourceFilePath) {
                const sourceDir = path.dirname(sourceFilePath).toLowerCase();
                const resultDir = path.dirname(fsResult).toLowerCase();
                if (sourceDir !== resultDir) {
                    this.filePathCache.set(normalizedFilename, fsResult);
                }
            } else {
                this.filePathCache.set(normalizedFilename, fsResult);
            }
            
            return fsResult;
        }

        // Safety net: if we have no projects yet (server still building), skip the server
        // request entirely. This prevents thousands of clarion/findFile requests flooding
        // the LSP stdio pipe during startup, causing 50s+ hangs.
        if (!this.solutionInfo?.projects?.length) {
            logger.info(`⏩ [REFRESH] Skipping server lookup for ${filename} — solution not ready (0 projects)`);
            return "";
        }

        // Only call the server if the client is ready
        if (this.client && !this.client.needsStart()) {
            try {
                const requestStartTime = performance.now();
                logger.info(`🔄 Requesting file path from server for: ${filename}`);

                // Use a promise with timeout to prevent hanging
                // Use shorter timeout during activation
                const timeoutMs = this.getResolveTimeoutMs();
                const timeoutPromise = new Promise<{ path: string, source: string }>((resolve) => {
                    setTimeout(() => {
                        logger.warn(`⚠️ Server request timed out for file: ${filename} after ${timeoutMs}ms`);
                        resolve({ path: "", source: "" });
                    }, timeoutMs);
                });

                // Race between the actual request and the timeout
                const result = await Promise.race([
                    this.client.sendRequest<{ path: string, source: string }>('clarion/findFile', { filename }),
                    timeoutPromise
                ]);

                const requestEndTime = performance.now();
                logger.info(`🕒 File path request completed in ${(requestEndTime - requestStartTime).toFixed(2)}ms`);
                
                if (result.path && fs.existsSync(result.path)) {
                    const endTime = performance.now();
                    logger.info(`✅ File found by server: ${result.path} (source: ${result.source}) in ${(endTime - startTime).toFixed(2)}ms`);
                    
                    // Cache the result
                    this.filePathCache.set(normalizedFilename, result.path);
                    
                    return result.path;
                } else if (result.path) {
                    // If the server returned a path but it doesn't exist, try to fix it
                    // This can happen if the server is using different path separators or has a different base path

                    // Try to normalize the path
                    const normalizedPath = path.normalize(result.path);
                    if (fs.existsSync(normalizedPath)) {
                        logger.info(`✅ File found after normalizing server path: ${normalizedPath}`);
                        
                        // Cache the result
                        this.filePathCache.set(normalizedFilename, normalizedPath);
                        
                        return normalizedPath;
                    }

                    logger.warn(`⚠️ Server returned path but file doesn't exist: ${result.path}`);
                }
            } catch (error) {
                logger.error(`❌ Error requesting file from server: ${error instanceof Error ? error.message : String(error)}`);
            }
        } else {
            logger.warn(`⚠️ Language client not available or not ready. Cannot request file from server.`);
        }

        const endTime = performance.now();
        logger.info(`❌ File '${filename}' not found. (${(endTime - startTime).toFixed(2)}ms)`);
        // Cache the negative result to avoid repeated server calls for the same unresolvable file
        this.filePathCache.set(cacheKey, "");
        return "";
    }
    
    /**
     * Tries to find a file locally using filesystem and redirection files
     * @param filename The filename to find
     * @returns The full path if found, or empty string if not found
     */
    private async tryFindFileLocally(filename: string, sourceFilePath?: string): Promise<string> {
        const startTime = performance.now();
        logger.info(`🔍 Trying to find file locally: ${filename}${sourceFilePath ? ` (from ${sourceFilePath})` : ''}`);
        
        // Try direct path first
        if (fs.existsSync(filename)) {
            logger.info(`✅ File exists at direct path: ${filename}`);
            return filename;
        }
        
        // If we have a source file path, try to find the file in the same directory first
        if (sourceFilePath) {
            const sourceDir = path.dirname(sourceFilePath);
            const localPath = path.join(sourceDir, filename);
            if (fs.existsSync(localPath)) {
                logger.info(`✅ File found in same directory as source: ${localPath}`);
                return localPath;
            }
        }

        // During activation/refresh skip the expensive 40-project loop and libsrc scan.
        // Return "" so findFileWithExtension also skips the server call (checked separately).
        // Files resolve lazily on first user interaction after startup.
        if (this.activationInProgress) {
            return "";
        }
        
        // Try in solution directory
        if (this.solutionFilePath) {
            const solutionDir = path.dirname(this.solutionFilePath);
            const solutionPath = path.join(solutionDir, filename);
            
            if (fs.existsSync(solutionPath)) {
                logger.info(`✅ File found in solution directory: ${solutionPath}`);
                return solutionPath;
            }
            
            // Try in solution's include directory
            const includeDir = path.join(solutionDir, 'include');
            if (fs.existsSync(includeDir)) {
                const includePath = path.join(includeDir, filename);
                if (fs.existsSync(includePath)) {
                    logger.info(`✅ File found in solution's include directory: ${includePath}`);
                    return includePath;
                }
            }
            
            // Try in solution's libsrc directory
            const libsrcDir = path.join(solutionDir, 'libsrc');
            if (fs.existsSync(libsrcDir)) {
                const libsrcPath = path.join(libsrcDir, filename);
                if (fs.existsSync(libsrcPath)) {
                    logger.info(`✅ File found in solution's libsrc directory: ${libsrcPath}`);
                    return libsrcPath;
                }
            }
            
            // Try using the RedirectionService with the solution directory
            const solutionResolver = redirectionService.getResolver(solutionDir);
            const solutionResolvedPath = solutionResolver(filename);
            
            if (solutionResolvedPath && fs.existsSync(solutionResolvedPath)) {
                logger.info(`✅ File found via RedirectionService (solution): ${solutionResolvedPath}`);
                return solutionResolvedPath;
            }
        }
        
        // Check Clarion libsrc paths BEFORE scanning all projects.
        // Standard library files (EQUATES.CLW, etc.) live in libsrc and are never in
        // project directories. Checking 40 projects × N files first costs thousands of
        // fs.existsSync() calls (~1-2ms each on Windows) before reaching the result.
        // Project-specific files are caught by the same-dir and solution-dir checks above,
        // and by the per-project loop below for redirection-mapped files.
        const libsrcPaths = globalSettings.libsrcPaths;
        if (libsrcPaths?.length) {
            for (const libsrcDir of libsrcPaths) {
                const libsrcFilePath = path.join(libsrcDir, filename);
                if (fs.existsSync(libsrcFilePath)) {
                    logger.info(`✅ File found in libsrc path: ${libsrcFilePath}`);
                    return libsrcFilePath;
                }
            }
        }

        // Try in each project directory (fallback for project-specific/redirection-mapped files)
        if (this.solutionInfo) {
            for (const project of this.solutionInfo.projects) {
                const projectPath = path.join(project.path, filename);
                if (fs.existsSync(projectPath)) {
                    logger.info(`✅ File found in project directory: ${projectPath}`);
                    return projectPath;
                }
                
                // Use the RedirectionService to resolve the file
                const resolver = redirectionService.getResolver(project.path);
                const resolvedPath = resolver(filename);
                
                if (resolvedPath && fs.existsSync(resolvedPath)) {
                    logger.info(`✅ File found via RedirectionService (project): ${resolvedPath}`);
                    return resolvedPath;
                }
            }
        }
        
        const endTime = performance.now();
        logger.info(`❌ File not found locally in ${(endTime - startTime).toFixed(2)}ms: ${filename}`);
        return "";
    }

    // Removed getProjectSearchPaths method as all path resolution is now handled by the server

    /**
     * Gets the available build configurations from the solution
     */
    public getAvailableConfigurations(): string[] {
        if (!this.solutionFilePath || !fs.existsSync(this.solutionFilePath)) {
            logger.error("❌ Solution file path is not set or does not exist.");
            return [];
        }

        const solutionContent = fs.readFileSync(this.solutionFilePath, "utf-8");

        // First extract the SolutionConfigurationPlatforms section
        const sectionPattern = /GlobalSection\(SolutionConfigurationPlatforms\)\s*=\s*preSolution([\s\S]*?)EndGlobalSection/;
        const sectionMatch = sectionPattern.exec(solutionContent);

        if (!sectionMatch) {
            logger.warn("⚠️ No SolutionConfigurationPlatforms section found in solution file. Defaulting to Debug/Release.");
            return ["Debug", "Release"];
        }

        // Now extract configurations from just that section
        const configPattern = /^\s*(.*?)\|(.*?)\s*=/gm; // Matches any platform format like `Debug|Win32` or `Debug|Any CPU`
        const sectionContent = sectionMatch[1];
        const configurations: Set<string> = new Set();

        let match;
        while ((match = configPattern.exec(sectionContent)) !== null) {
            configurations.add(match[1].trim()); // Extracts 'Debug', 'Release', etc.
        }

        return Array.from(configurations);
    }

    /**
     * Removes a source file from a project
     * @param projectGuid The GUID of the project to remove the file from
     * @param fileName The name of the source file to remove (e.g., "someclwfile.clw")
     * @returns True if the file was removed successfully, false otherwise
     */
    public async removeSourceFile(projectGuid: string, fileName: string): Promise<boolean> {
        if (!this.client || this.client.needsStart()) {
            logger.warn("⚠️ Language client not ready. Cannot remove source file.");
            return false;
        }

        try {
            logger.info(`🔄 Requesting to remove source file ${fileName} from project with GUID ${projectGuid}`);

            // Use a promise with timeout to prevent hanging
            const timeoutPromise = new Promise<boolean>((resolve) => {
                setTimeout(() => {
                    logger.warn(`⚠️ Server request timed out for removing source file: ${fileName}`);
                    resolve(false);
                }, 15000); // 15 second timeout
            });

            // Race between the actual request and the timeout
            const result = await Promise.race([
                this.client.sendRequest<boolean>('clarion/removeSourceFile', {
                    projectGuid,
                    fileName
                }),
                timeoutPromise
            ]);

            if (result) {
                logger.info(`✅ Successfully removed source file ${fileName} from project`);

                // Refresh the solution cache to get the updated project information
                await this.refresh();
                return true;
            } else {
                logger.warn(`⚠️ Failed to remove source file ${fileName} from project`);
                return false;
            }
        } catch (error) {
            logger.error(`❌ Error removing source file: ${error instanceof Error ? error.message : String(error)}`);
            return false;
        }
    }

    /**
     * Adds a new source file to a project
     * @param projectGuid The GUID of the project to add the file to
     * @param fileName The name of the source file to add (e.g., "someclwfile.clw")
     * @returns True if the file was added successfully, false otherwise
     */
    public async addSourceFile(projectGuid: string, fileName: string): Promise<boolean> {
        if (!this.client || this.client.needsStart()) {
            logger.warn("⚠️ Language client not ready. Cannot add source file.");
            return false;
        }

        try {
            logger.info(`🔄 Requesting to add source file ${fileName} to project with GUID ${projectGuid}`);

            // Use a promise with timeout to prevent hanging
            const timeoutPromise = new Promise<boolean>((resolve) => {
                setTimeout(() => {
                    logger.warn(`⚠️ Server request timed out for adding source file: ${fileName}`);
                    resolve(false);
                }, 15000); // 15 second timeout
            });

            // Race between the actual request and the timeout
            const result = await Promise.race([
                this.client.sendRequest<boolean>('clarion/addSourceFile', {
                    projectGuid,
                    fileName
                }),
                timeoutPromise
            ]);

            if (result) {
                logger.info(`✅ Successfully added source file ${fileName} to project`);

                // Refresh the solution cache to get the updated project information
                await this.refresh();
                return true;
            } else {
                logger.warn(`⚠️ Failed to add source file ${fileName} to project`);
                return false;
            }
        } catch (error) {
            logger.error(`❌ Error adding source file: ${error instanceof Error ? error.message : String(error)}`);
            return false;
        }
    }

    /**
 * Gets document symbols for a specific file by calling the language server.
 */
    public async getSymbolsForFile(filePath: string): Promise<any[]> {
        if (!this.client || this.client.needsStart()) {
            logger.warn("⚠️ Language client not ready. Cannot retrieve symbols.");
            return [];
        }

        try {
            const uri = Uri.file(filePath).toString();
            const symbols = await this.client.sendRequest('clarion/documentSymbols', { uri });
            return Array.isArray(symbols) ? symbols : [];
        } catch (error) {
            logger.error(`❌ Error fetching document symbols for ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
            return [];
        }
    }


    /**
     * Gets a project by ID from the cache, optionally only from in-memory cache
     * @param projectId The ID of the project to get
     * @param inMemoryOnly If true, only check the in-memory cache
     * @returns The project if found, null otherwise
     */
    public static getProjectById(projectId: string): ClarionProjectInfo | null {
        const instance = SolutionCache.getInstance();
        if (!instance.solutionInfo || !instance.solutionInfo.projects) {
            return null;
        }

        const project = instance.solutionInfo.projects.find(p => p.guid === projectId);
        return project || null;
    }

    /**
     * Gets a project by path from the cache, optionally only from in-memory cache
     * @param projectPath The path of the project to get
     * @param inMemoryOnly If true, only check the in-memory cache
     * @returns The project if found, null otherwise
     */
    public static getProjectByPath(projectPath: string): ClarionProjectInfo | null {
        const instance = SolutionCache.getInstance();
        if (!instance.solutionInfo || !instance.solutionInfo.projects) {
            return null;
        }

        const project = instance.solutionInfo.projects.find(p => p.path === projectPath);
        return project || null;
    }

    /**
     * Attaches an ephemeral project to the solution
     * This is used when a project node is expanded but the project is not in the cache
     * @param projectInfo Basic project info to create an ephemeral project
     * @returns The created ephemeral project
     */
    public static attachEphemeralProject(projectInfo: { id: string, path: string, name: string }): ClarionProjectInfo {
        const instance = SolutionCache.getInstance();
        if (!instance.solutionInfo) {
            throw new Error("Cannot attach ephemeral project: No solution info available");
        }

        // Create a minimal project object
        const project: ClarionProjectInfo = {
            name: projectInfo.name,
            type: "ClarionProject",
            path: projectInfo.path,
            guid: projectInfo.id,
            filename: `${projectInfo.name}.cwproj`,
            sourceFiles: []
        };

        // Add to the solution's projects array if not already there
        if (!instance.solutionInfo.projects.some(p => p.guid === project.guid)) {
            instance.solutionInfo.projects.push(project);
            logger.info(`✅ Attached ephemeral project: ${project.name}`);
        }

        return project;
    }

    // The saveProjectFilesDTO method has been removed as part of the refactoring
    // to eliminate file-based caching. Project files are now always requested
    // from the server when needed.
}