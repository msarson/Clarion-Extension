// Updated server-side version using serverSettings and supporting per-project redirection files, respecting compile mode/configuration

import * as path from "path";
import * as fs from "fs";
import LoggerManager from "../logger";
import { serverSettings } from "../serverSettings";

const logger = LoggerManager.getLogger("RedirectionParserServer");
logger.setLevel("error");

/**
 * Represents the source of a resolved file path
 */
export enum FilePathSource {
  Redirected = "redirected",
  Project = "project",
  Solution = "solution"
}

/**
 * Represents a resolved file path with its source
 */
export interface ResolvedFilePath {
  path: string;
  source: FilePathSource;
  entry?: RedirectionEntry;
}

export interface RedirectionEntry {
  redFile: string;
  section: string;
  extension: string;
  paths: string[];
}

export class RedirectionFileParserServer {
  private readonly macros: Record<string, string>;
  private static redFileCache: Map<string, RedirectionEntry[]> = new Map();
  private static includeCache: Map<string, RedirectionEntry[]> = new Map();
  private entries: RedirectionEntry[] = [];
  // Track parse sequence for debugging
  private static parseSeq: number = 0;

  constructor() {
    this.macros = serverSettings.macros;
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
   * Creates a cache key using the file path and modification time
   * @param filePath The path to the file
   * @returns A cache key string in the format "filePath|mtime"
   */
  private createCacheKey(filePath: string): string {
    const mtime = this.getFileMtime(filePath);
    return `${filePath}|${mtime}`;
  }

  /**
   * Generate a simple hash code for this instance (for logging)
   */
  private hashCode(): number {
    return Math.floor(Math.random() * 10000);
  }

  public parseRedFile(projectPath: string): RedirectionEntry[] {
    const projectRedFile = path.join(projectPath, serverSettings.redirectionFile);
    const globalRedFile = path.join(serverSettings.primaryRedirectionPath, serverSettings.redirectionFile);

    let redFileToParse = "";
    try {
      if (fs.existsSync(projectRedFile)) {
        redFileToParse = projectRedFile;
        logger.info(`Using project-specific redirection file: ${projectRedFile}`);
      } else if (fs.existsSync(globalRedFile)) {
        redFileToParse = globalRedFile;
        logger.warn(`Project-specific redirection file not found. Using global: ${globalRedFile}`);
      } else {
        logger.error("No valid redirection file found.");
        this.entries = [];
        return this.entries;
      }

      // Create a cache key using the file path and mtime
      const cacheKey = this.createCacheKey(redFileToParse);
      
      // Check if we have cached entries for this file path and mtime
      if (RedirectionFileParserServer.redFileCache.has(cacheKey)) {
        logger.info(`✅ Using cached redirection entries for: ${redFileToParse} (mtime: ${this.getFileMtime(redFileToParse)})`);
        this.entries = RedirectionFileParserServer.redFileCache.get(cacheKey) || [];
        return this.entries;
      }

      // Add instrumentation
      const id = ++RedirectionFileParserServer.parseSeq;
      const caller = new Error().stack?.split('\n')[2]?.trim() ?? 'unknown';
      const started = Date.now();
      logger.info(`[RED][parse:start] #${id} file=${redFileToParse} mtime=${this.getFileMtime(redFileToParse)} caller=${caller}`);

      this.entries = this.parseRedFileRecursive(redFileToParse, [], true);
      
      // Cache the result with the new cache key
      RedirectionFileParserServer.redFileCache.set(cacheKey, this.entries);
      
      const duration = Date.now() - started;
      logger.info(`[RED][parse:end] #${id} file=${redFileToParse} rules=${this.entries.length} durMs=${duration}`);
      logger.info(`✅ Cached ${this.entries.length} redirection entries for: ${redFileToParse} (mtime: ${this.getFileMtime(redFileToParse)})`);
      
      return this.entries;
    } catch (error) {
      logger.error(`Error in parseRedFile: ${error instanceof Error ? error.message : String(error)}`);
      this.entries = [];
      return this.entries;
    }
  }

  // Async version of parseRedFile for better performance
  public async parseRedFileAsync(projectPath: string): Promise<RedirectionEntry[]> {
    const projectRedFile = path.join(projectPath, serverSettings.redirectionFile);
    const globalRedFile = path.join(serverSettings.primaryRedirectionPath, serverSettings.redirectionFile);

    try {
      // Use async file existence check
      let redFileToParse = "";
      try {
        await fs.promises.access(projectRedFile, fs.constants.F_OK);
        redFileToParse = projectRedFile;
        logger.info(`Using project-specific redirection file: ${projectRedFile}`);
      } catch {
        try {
          await fs.promises.access(globalRedFile, fs.constants.F_OK);
          redFileToParse = globalRedFile;
          logger.warn(`Project-specific redirection file not found. Using global: ${globalRedFile}`);
        } catch {
          logger.error("No valid redirection file found.");
          this.entries = [];
          return this.entries;
        }
      }

      // Create a cache key using the file path and mtime
      const cacheKey = this.createCacheKey(redFileToParse);
      
      // Check if we have cached entries for this file path and mtime
      if (RedirectionFileParserServer.redFileCache.has(cacheKey)) {
        logger.info(`✅ Using cached redirection entries for: ${redFileToParse} (mtime: ${this.getFileMtime(redFileToParse)})`);
        this.entries = RedirectionFileParserServer.redFileCache.get(cacheKey) || [];
        return this.entries;
      }

      // Add instrumentation
      const id = ++RedirectionFileParserServer.parseSeq;
      const caller = new Error().stack?.split('\n')[2]?.trim() ?? 'unknown';
      const started = Date.now();
      logger.info(`[RED][parse:start] #${id} file=${redFileToParse} mtime=${this.getFileMtime(redFileToParse)} caller=${caller}`);

      this.entries = await this.parseRedFileRecursiveAsync(redFileToParse, [], true);
      
      // Cache the result with the new cache key
      RedirectionFileParserServer.redFileCache.set(cacheKey, this.entries);
      
      const duration = Date.now() - started;
      logger.info(`[RED][parse:end] #${id} file=${redFileToParse} rules=${this.entries.length} durMs=${duration}`);
      logger.info(`✅ Cached ${this.entries.length} redirection entries for: ${redFileToParse} (mtime: ${this.getFileMtime(redFileToParse)})`);
      
      return this.entries;
    } catch (error) {
      logger.error(`Error in parseRedFileAsync: ${error instanceof Error ? error.message : String(error)}`);
      this.entries = [];
      return this.entries;
    }
  }

  private parseRedFileRecursive(
    redFileToParse: string,
    entries: RedirectionEntry[],
    isFirst: boolean
  ): RedirectionEntry[] {
    if (!fs.existsSync(redFileToParse)) {
      logger.error(`Redirection file not found: ${redFileToParse}`);
      return entries;
    }

    try {
      // Check if we have this include file cached
      if (!isFirst) {
        const includeCacheKey = this.createCacheKey(redFileToParse);
        if (RedirectionFileParserServer.includeCache.has(includeCacheKey)) {
          logger.info(`✅ Using cached include file: ${redFileToParse} (mtime: ${this.getFileMtime(redFileToParse)})`);
          const cachedEntries = RedirectionFileParserServer.includeCache.get(includeCacheKey) || [];
          // Add the cached entries to our entries array
          entries.push(...cachedEntries);
          return entries;
        }
      }

      logger.info(`Parsing redirection file: ${redFileToParse}`);
      const content = fs.readFileSync(redFileToParse, "utf-8");
      const redPath = path.dirname(redFileToParse);
      let currentSection: string | null = null;

      // For include files, we'll collect their entries separately to cache them
      const includeEntries: RedirectionEntry[] = [];

      if (isFirst) {
        entries.push({ redFile: redFileToParse, section: "Common", extension: "*.*", paths: ["."] });
        logger.info(`Added default *.* = '.' entry for ${redFileToParse}`);
      }

      // Use a more efficient approach to process the file
      const lines = content.split("\n");
      for (let i = 0; i < lines.length; i++) {
        const trimmed = lines[i].trim();
        if (!trimmed || trimmed.startsWith("--")) continue;

        const sectionMatch = trimmed.match(/^\[([^\]]+)\]$/);
        if (sectionMatch) {
          currentSection = sectionMatch[1].trim();
          logger.info(`Found section: [${currentSection}] in ${redFileToParse}`);
          continue;
        }

        if (!currentSection) currentSection = "Common";

        if (trimmed.startsWith("{include")) {
          const includeMatch = trimmed.match(/\{include\s+([^}]+)\}/i);
          if (includeMatch && includeMatch[1]) {
            let includePath = this.resolveMacro(includeMatch[1]);
            includePath = path.isAbsolute(includePath) ? includePath : path.resolve(redPath, includePath);
            logger.info(`Processing include: ${includePath} from ${redFileToParse}`);
            this.parseRedFileRecursive(includePath, entries, false);
          }
          continue;
        }

        if (trimmed.includes("=") && currentSection) {
          // Process all sections, filtering will happen when using the entries
          const equalPos = trimmed.indexOf('=');
          if (equalPos > 0) {
            const mask = trimmed.substring(0, equalPos).trim();
            const raw = trimmed.substring(equalPos + 1).trim();
            
            // Pre-allocate array size for better performance
            const pathParts = raw.split(";");
            const paths = new Array(pathParts.length);
            
            for (let j = 0; j < pathParts.length; j++) {
              const resolved = this.resolveMacro(pathParts[j].trim());
              paths[j] = resolved;
            }
            
            const entry = {
              redFile: redFileToParse,
              section: currentSection,
              extension: mask,
              paths
            };
            
            entries.push(entry);
            
            // If this is an include file, also add to the include entries
            if (!isFirst) {
              includeEntries.push(entry);
            }
            
            logger.info(`Added entry: ${mask} = ${paths.join(';')} in section [${currentSection}]`);
          }
        }
      }

      // Cache the include file entries if this is an include
      if (!isFirst && includeEntries.length > 0) {
        const includeCacheKey = this.createCacheKey(redFileToParse);
        RedirectionFileParserServer.includeCache.set(includeCacheKey, includeEntries);
        logger.info(`✅ Cached ${includeEntries.length} entries for include file: ${redFileToParse}`);
      }
    } catch (error) {
      logger.error(`Error parsing redirection file ${redFileToParse}: ${error instanceof Error ? error.message : String(error)}`);
    }

    return entries;
  }
  
  // Async version of parseRedFileRecursive
  private async parseRedFileRecursiveAsync(
    redFileToParse: string,
    entries: RedirectionEntry[],
    isFirst: boolean
  ): Promise<RedirectionEntry[]> {
    try {
      // Check if file exists
      try {
        await fs.promises.access(redFileToParse, fs.constants.F_OK);
      } catch {
        logger.error(`Redirection file not found: ${redFileToParse}`);
        return entries;
      }

      // Check if we have this include file cached
      if (!isFirst) {
        const includeCacheKey = this.createCacheKey(redFileToParse);
        if (RedirectionFileParserServer.includeCache.has(includeCacheKey)) {
          logger.info(`✅ Using cached include file: ${redFileToParse} (mtime: ${this.getFileMtime(redFileToParse)})`);
          const cachedEntries = RedirectionFileParserServer.includeCache.get(includeCacheKey) || [];
          // Add the cached entries to our entries array
          entries.push(...cachedEntries);
          return entries;
        }
      }

      logger.info(`Parsing redirection file: ${redFileToParse}`);
      const content = await fs.promises.readFile(redFileToParse, "utf-8");
      const redPath = path.dirname(redFileToParse);
      let currentSection: string | null = null;

      // For include files, we'll collect their entries separately to cache them
      const includeEntries: RedirectionEntry[] = [];

      if (isFirst) {
        entries.push({ redFile: redFileToParse, section: "Common", extension: "*.*", paths: ["."] });
        logger.info(`Added default *.* = '.' entry for ${redFileToParse}`);
      }

      // Process the file line by line
      const lines = content.split("\n");
      
      // Create an array to collect include promises
      const includePromises: Promise<void>[] = [];
      
      for (let i = 0; i < lines.length; i++) {
        const trimmed = lines[i].trim();
        if (!trimmed || trimmed.startsWith("--")) continue;

        const sectionMatch = trimmed.match(/^\[([^\]]+)\]$/);
        if (sectionMatch) {
          currentSection = sectionMatch[1].trim();
          logger.info(`Found section: [${currentSection}] in ${redFileToParse}`);
          continue;
        }

        if (!currentSection) currentSection = "Common";

        if (trimmed.startsWith("{include")) {
          const includeMatch = trimmed.match(/\{include\s+([^}]+)\}/i);
          if (includeMatch && includeMatch[1]) {
            let includePath = this.resolveMacro(includeMatch[1]);
            includePath = path.isAbsolute(includePath) ? includePath : path.resolve(redPath, includePath);
            logger.info(`Processing include: ${includePath} from ${redFileToParse}`);
            
            // Create a promise for processing this include file
            const includePromise = this.parseRedFileRecursiveAsync(includePath, entries, false)
              .then(() => {}); // Convert to Promise<void> by ignoring the result
            includePromises.push(includePromise);
          }
          continue;
        }

        if (trimmed.includes("=") && currentSection) {
          // Process all sections, filtering will happen when using the entries
          const equalPos = trimmed.indexOf('=');
          if (equalPos > 0) {
            const mask = trimmed.substring(0, equalPos).trim();
            const raw = trimmed.substring(equalPos + 1).trim();
            
            // Pre-allocate array size for better performance
            const pathParts = raw.split(";");
            const paths = new Array(pathParts.length);
            
            for (let j = 0; j < pathParts.length; j++) {
              const resolved = this.resolveMacro(pathParts[j].trim());
              paths[j] = resolved;
            }
            
            const entry = {
              redFile: redFileToParse,
              section: currentSection,
              extension: mask,
              paths
            };
            
            entries.push(entry);
            
            // If this is an include file, also add to the include entries
            if (!isFirst) {
              includeEntries.push(entry);
            }
            
            logger.info(`Added entry: ${mask} = ${paths.join(';')} in section [${currentSection}]`);
          }
        }
      }
      
      // Wait for all include files to be processed
      await Promise.all(includePromises);
      
      // Cache the include file entries if this is an include
      if (!isFirst && includeEntries.length > 0) {
        const includeCacheKey = this.createCacheKey(redFileToParse);
        RedirectionFileParserServer.includeCache.set(includeCacheKey, includeEntries);
        logger.info(`✅ Cached ${includeEntries.length} entries for include file: ${redFileToParse}`);
      }
    } catch (error) {
      logger.error(`Error parsing redirection file ${redFileToParse}: ${error instanceof Error ? error.message : String(error)}`);
    }

    return entries;
  }

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
      let value = this.macros[macro];

      if (!value) {
        if (macro === "bin") {
          value = serverSettings.primaryRedirectionPath;
        } else if (macro === "redname") {
          value = path.basename(serverSettings.redirectionFile);
        } else {
          value = match;
        }
      }

      return value;
    });

    return path.normalize(resolved);
  }

  /**
   * Finds a file in the redirection paths
   * @param filename The filename to find
   * @returns The resolved file path info if found, null otherwise
   */
  public findFile(filename: string): ResolvedFilePath | null {
    // Add instrumentation
    const t0 = Date.now();
    const resolverInstanceId = this.hashCode();
    logger.debug(`[RED][resolve] name="${filename}" instId=${resolverInstanceId}`);

    // Create a map to track which paths we've already checked to avoid duplicates
    const checkedPaths = new Set<string>();
    
    for (const entry of this.entries) {
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
            const result = {
              path: normalizedCandidate,
              source: FilePathSource.Redirected,
              entry: entry
            };
            
            const duration = Date.now() - t0;
            logger.debug(`[RED][resolve:end] name="${filename}" → ${normalizedCandidate} durMs=${duration}`);
            return result;
          }
        }
      }
    }
    
    const duration = Date.now() - t0;
    logger.debug(`[RED][resolve:end] name="${filename}" → NOT_FOUND durMs=${duration}`);
    return null;
  }
  
  // Async version of findFile
  public async findFileAsync(filename: string): Promise<ResolvedFilePath | null> {
    // Add instrumentation
    const t0 = Date.now();
    const resolverInstanceId = this.hashCode();
    logger.debug(`[RED][resolve] name="${filename}" instId=${resolverInstanceId}`);

    // Helper for async existence check
    const fileExists = async (filePath: string) => {
      try {
        await fs.promises.access(filePath, fs.constants.F_OK);
        return true;
      } catch {
        return false;
      }
    };
    
    // Create a map to track which paths we've already checked to avoid duplicates
    const checkedPaths = new Set<string>();
    
    // Create an array of promises to check all possible paths in parallel
    const checkPromises: Promise<ResolvedFilePath | null>[] = [];
    
    for (const entry of this.entries) {
      if (this.matchesMask(entry.extension, filename)) {
        for (const dir of entry.paths) {
          const candidate = path.join(dir, filename);
          const normalizedCandidate = path.normalize(candidate);
          
          // Skip if we've already checked this path
          if (checkedPaths.has(normalizedCandidate)) {
            continue;
          }
          
          checkedPaths.add(normalizedCandidate);
          
          // Create a promise to check this path
          const checkPromise = fileExists(normalizedCandidate).then(exists => {
            if (exists) {
              return {
                path: normalizedCandidate,
                source: FilePathSource.Redirected,
                entry: entry
              };
            }
            return null;
          });
          
          checkPromises.push(checkPromise);
        }
      }
    }
    
    // Wait for all checks to complete and find the first successful result
    const results = await Promise.all(checkPromises);
    const result = results.find(result => result !== null) || null;
    
    const duration = Date.now() - t0;
    if (result) {
      logger.debug(`[RED][resolve:end] name="${filename}" → ${result.path} durMs=${duration}`);
    } else {
      logger.debug(`[RED][resolve:end] name="${filename}" → NOT_FOUND durMs=${duration}`);
    }
    
    return result;
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
}
