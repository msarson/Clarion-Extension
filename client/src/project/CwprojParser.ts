import * as fs from 'fs';
import * as path from 'path';
import { glob } from 'glob';
import LoggerManager from '../utils/LoggerManager';

const logger = LoggerManager.getLogger("CwprojParser");

// Create a specialized debug logger for file resolution issues
const fileResolutionLogger = LoggerManager.getLogger("FileResolution");
fileResolutionLogger.setLevel("error");

/**
 * Represents a parsed file from a .cwproj file
 */
export type ParsedItem = {
  /** Absolute path if resolved, otherwise null */
  absolutePath: string | null;
  /** Original Include text from the cwproj */
  displayPath: string;
  /** Lowercased file extension from absolutePath or displayPath */
  ext: string;
  /** Kind derived from item type */
  kind: 'code' | 'include' | 'other';
  /** Whether absolutePath exists on disk */
  exists: boolean;
  /** Where the resolution succeeded (local/join, redirection, glob) or 'unresolved' */
  source: 'local' | 'redirection' | 'glob' | 'unresolved';
};

/**
 * Result of parsing a .cwproj file
 */
export interface CwprojParseResult {
  /** The parsed items from the .cwproj file */
  files: ParsedItem[];
  /** A hash of the ItemGroup sections for cache invalidation */
  hash: string;
  /** The modification time of the .cwproj file */
  mtime: number;
}

/**
 * CwprojParser is responsible for parsing .cwproj files to extract source files
 * and other project information. It's used for lazy loading project contents
 * when a project node is expanded in the Solution Tree.
 */
export class CwprojParser {
    // Clarion-relevant file extensions
    private static readonly CLARION_EXTENSIONS = new Set([
        '.clw', '.inc', '.equ', '.eq', '.int'
    ]);

    /**
     * Parses a .cwproj file to extract source files
     * @param projectPath The path to the .cwproj file or the directory containing it
     * @returns A promise that resolves to an array of ParsedFile objects
     */
    /**
     * Parses a .cwproj file to extract source files with additional metadata
     * This is the new version that returns a CwprojParseResult with hash and mtime
     */
    public static async parseWithMetadata(
        cwprojFilePath: string,
        opts?: {
          /** Project GUID or name (if available) for logging/resolution */
          projectGuid?: string;
          /** Optional override; defaults to dirname(cwprojFilePath) */
          projectDir?: string;
          /** Optional override for solution dir discovery */
          solutionDir?: string;
          /**
           * Project-scoped resolver for Clarion redirection:
           * given the Include (possibly relative), return an absolute path (if any)
           */
          resolveWithRedirection?: (include: string) => Promise<string | undefined>;
          /** Whether to log verbose file-resolution diagnostics */
          verbose?: boolean;
        }
    ): Promise<CwprojParseResult> {
        const startTime = performance.now();
        logger.info(`[CWPROJ] Parsing .cwproj file with metadata: ${cwprojFilePath}`);
        
        try {
            // Use provided projectDir or default to dirname(cwprojFilePath)
            let projectDir = opts?.projectDir || path.dirname(cwprojFilePath);
            let solutionDir = opts?.solutionDir || '';
            
            // Verify the file exists and is a .cwproj file
            if (!fs.existsSync(cwprojFilePath)) {
                throw new Error(`Project file not found: ${cwprojFilePath}`);
            }
            
            if (!cwprojFilePath.toLowerCase().endsWith('.cwproj')) {
                logger.warn(`Warning: File does not have .cwproj extension: ${cwprojFilePath}`);
            }
            
            logger.info(`[CWPROJ] Project directory: ${projectDir}`);
            
            // Try to determine the solution directory (parent of project directory)
            try {
                // Look for .sln files in parent directories
                let currentDir = projectDir;
                let foundSln = false;
                
                // Go up to 3 levels to find a solution file
                for (let i = 0; i < 3; i++) {
                    const parentDir = path.dirname(currentDir);
                    if (parentDir === currentDir) break; // Reached root
                    
                    const files = fs.readdirSync(parentDir);
                    if (files.some(file => file.endsWith('.sln'))) {
                        solutionDir = parentDir;
                        foundSln = true;
                        break;
                    }
                    
                    currentDir = parentDir;
                }
                
                if (!foundSln) {
                    // If no .sln found, assume solution dir is same as project dir
                    solutionDir = projectDir;
                }
            } catch (error) {
                logger.warn(`Could not determine solution directory: ${error instanceof Error ? error.message : String(error)}`);
                solutionDir = projectDir; // Fallback
            }
            
            // Read the .cwproj file
            const cwprojContent = fs.readFileSync(cwprojFilePath, 'utf-8');
            
            // Get the file's modification time
            const stats = fs.statSync(cwprojFilePath);
            const mtime = stats.mtimeMs;
            
            // Compute a hash of the ItemGroup sections for cache invalidation
            const itemGroupHash = this.computeItemGroupHash(cwprojContent);
            logger.info(`[CWPROJ] Computed hash for ${path.basename(cwprojFilePath)}: ${itemGroupHash}`);
            
            // Extract property values from PropertyGroup sections
            const properties = this.extractMSBuildProperties(cwprojContent, projectDir, solutionDir, cwprojFilePath);
            
            // Log the extracted properties for debugging
            fileResolutionLogger.debug(`[FILE_RESOLUTION] MSBuild properties for ${path.basename(cwprojFilePath)}:`);
            properties.forEach((value, key) => {
                fileResolutionLogger.debug(`[FILE_RESOLUTION]   - ${key}: ${value}`);
            });
            
            // Extract source files from the .cwproj file
            const parsedItems: ParsedItem[] = [];
            
            // Process all ItemGroup sections - handle attributes/conditions
            const itemGroupRegex = /<ItemGroup\b[^>]*>([\s\S]*?)<\/ItemGroup>/gi;
            let itemGroupMatch;
            
            while ((itemGroupMatch = itemGroupRegex.exec(cwprojContent)) !== null) {
                const itemGroupContent = itemGroupMatch[1];
                
                // Process all items with Include attributes in this ItemGroup
                await this.processItemsWithInclude(
                    itemGroupContent,
                    properties,
                    parsedItems,
                    projectDir,
                    opts?.resolveWithRedirection,
                    opts?.verbose || false
                );
            }
            
            // Don't filter by extension - include all declared items
            const endTime = performance.now();
            
            // Log the first few items for debugging
            const firstThree = parsedItems.slice(0, 3).map(item => path.basename(item.displayPath)).join(', ');
            logger.info(`[CWPROJ] parsed ${parsedItems.length} items for ${path.basename(cwprojFilePath)} in ${Math.round(endTime - startTime)}ms (first 3: ${firstThree})`);
            
            return {
                files: parsedItems,
                hash: itemGroupHash,
                mtime: mtime
            };
        } catch (error) {
            logger.error(`[CWPROJ] Failed parsing project ${cwprojFilePath}: ${error instanceof Error ? error.message : String(error)}`);
            return {
                files: [],
                hash: '',
                mtime: 0
            };
        }
    }

    /**
     * Parses a .cwproj file to extract source files
     * This is the original version that returns an array of ParsedItem for backward compatibility
     */
    public static async parse(
        cwprojFilePath: string,
        opts?: {
          /** Project GUID or name (if available) for logging/resolution */
          projectGuid?: string;
          /** Optional override; defaults to dirname(cwprojFilePath) */
          projectDir?: string;
          /** Optional override for solution dir discovery */
          solutionDir?: string;
          /**
           * Project-scoped resolver for Clarion redirection:
           * given the Include (possibly relative), return an absolute path (if any)
           */
          resolveWithRedirection?: (include: string) => Promise<string | undefined>;
          /** Whether to log verbose file-resolution diagnostics */
          verbose?: boolean;
        }
    ): Promise<ParsedItem[]> {
        try {
            // Call the new method and extract just the files
            const result = await this.parseWithMetadata(cwprojFilePath, opts);
            return result.files;
        } catch (error: any) {
            logger.error(`[CWPROJ] Failed parsing project ${cwprojFilePath}: ${error instanceof Error ? error.message : String(error)}`);
            return [];
        }
    }
    
    /**
     * Extracts MSBuild properties from PropertyGroup sections
     */
    private static extractMSBuildProperties(
        cwprojContent: string,
        projectDir: string,
        solutionDir: string,
        cwprojFilePath: string
    ): Map<string, string> {
        const properties = new Map<string, string>();
        
        // Add built-in properties - case-insensitive keys but preserve value case
        properties.set('projectdir', projectDir);
        properties.set('solutiondir', solutionDir);
        properties.set('msbuildprojectdirectory', projectDir);
        properties.set('projectdirectory', projectDir);
        properties.set('msbuildthisfiledirectory', projectDir);
        properties.set('msbuildprojectname', path.basename(cwprojFilePath, path.extname(cwprojFilePath)));
        
        // Extract custom properties from PropertyGroup sections
        const propertyGroupRegex = /<PropertyGroup\b[^>]*>([\s\S]*?)<\/PropertyGroup>/gi;
        let propertyGroupMatch;
        
        while ((propertyGroupMatch = propertyGroupRegex.exec(cwprojContent)) !== null) {
            const propertyGroupContent = propertyGroupMatch[1];
            
            // Match any property in the form <PropertyName>Value</PropertyName>
            const propertyRegex = /<([^>\s]+)>([^<]+)<\/\1>/g;
            let propertyMatch;
            
            while ((propertyMatch = propertyRegex.exec(propertyGroupContent)) !== null) {
                const propertyName = propertyMatch[1].toLowerCase(); // Case-insensitive keys
                const propertyValue = propertyMatch[2].trim(); // Keep original case for values
                properties.set(propertyName, propertyValue);
            }
        }
        
        return properties;
    }
    
    /**
     * Processes all items with Include attributes in an ItemGroup
     */
    private static async processItemsWithInclude(
        itemGroupContent: string,
        properties: Map<string, string>,
        parsedItems: ParsedItem[],
        projectDir: string,
        resolveWithRedirection?: (include: string) => Promise<string | undefined>,
        verbose: boolean = false
    ): Promise<void> {
        // Match any element with an Include attribute
        // This will catch Compile, None, Content, ClInclude, ClwFile, etc.
        const itemRegex = /<([^>\s]+)\s+Include="([^"]+)"/gi; // Case-insensitive matching
        let itemMatch;
        
        while ((itemMatch = itemRegex.exec(itemGroupContent)) !== null) {
            const itemType = itemMatch[1].toLowerCase(); // e.g., "compile", "none", "content"
            const includePath = itemMatch[2];
            
            // Only process Compile items - skip other item types
            if (itemType !== 'compile' && itemType !== 'clwfile') {
                continue;
            }
            
            // Expand MSBuild properties in the path
            const expandedPath = this.expandProperties(includePath, properties, verbose);
            
            // Determine the kind based on item type
            let kind: 'code' | 'include' | 'other';
            switch (itemType.toLowerCase()) {
                case 'compile':
                case 'clwfile':
                    kind = 'code';
                    break;
                case 'clinclude':
                case 'include':
                    kind = 'include';
                    break;
                case 'none':
                case 'content':
                    kind = 'other';
                    break;
                default:
                    kind = 'other';
            }
            
            // Handle wildcards in the path
            if (expandedPath.includes('*')) {
                await this.processWildcardPath(expandedPath, projectDir, kind, parsedItems, includePath, verbose);
            } else {
                // Regular path without wildcards - implement resolution order
                let finalAbs: string | null = null;
                let source: ParsedItem['source'] = 'unresolved';
                
                // 1. If expanded path is absolute and exists
                if (path.isAbsolute(expandedPath) && fs.existsSync(expandedPath)) {
                    finalAbs = path.normalize(expandedPath);
                    source = 'local';
                } else {
                    // 2. Try joining with project directory
                    const candidate = path.normalize(path.resolve(projectDir, expandedPath));
                    if (fs.existsSync(candidate)) {
                        finalAbs = candidate;
                        source = 'local';
                    } else if (resolveWithRedirection) {
                        // 3. Try redirection resolution if provided
                        const viaRed = await resolveWithRedirection(includePath);
                        if (viaRed && fs.existsSync(viaRed)) {
                            finalAbs = path.normalize(viaRed);
                            source = 'redirection';
                        }
                    }
                }
                
                // Log the path resolution if verbose
                if (verbose) {
                    logger.info(`[CWPROJ] Resolved path: ${expandedPath} -> ${finalAbs || 'unresolved'}`);
                    
                    // Add detailed diagnostics for file resolution
                    fileResolutionLogger.debug(`[FILE_RESOLUTION] Path resolution in CwprojParser:`);
                    fileResolutionLogger.debug(`[FILE_RESOLUTION]   - Original: ${includePath}`);
                    fileResolutionLogger.debug(`[FILE_RESOLUTION]   - Expanded: ${expandedPath}`);
                    fileResolutionLogger.debug(`[FILE_RESOLUTION]   - Final: ${finalAbs || 'unresolved'}`);
                    fileResolutionLogger.debug(`[FILE_RESOLUTION]   - Project dir: ${projectDir}`);
                    fileResolutionLogger.debug(`[FILE_RESOLUTION]   - Source: ${source}`);
                    fileResolutionLogger.debug(`[FILE_RESOLUTION]   - Exists: ${!!finalAbs && fs.existsSync(finalAbs)}`);
                }
                
                // Create ParsedItem with the new structure
                parsedItems.push({
                    absolutePath: finalAbs,
                    displayPath: includePath,
                    ext: path.extname(finalAbs ?? expandedPath).toLowerCase(),
                    kind: kind,
                    exists: !!finalAbs && fs.existsSync(finalAbs),
                    source: source
                });
            }
        }
    }
    
    /**
     * Expands MSBuild properties in a path string
     */
    private static expandProperties(pathStr: string, properties: Map<string, string>, verbose: boolean = false): string {
        let result = pathStr;
        
        // Log the original path for debugging if verbose
        if (verbose) {
            fileResolutionLogger.debug(`[FILE_RESOLUTION] Expanding properties in: ${pathStr}`);
        }
        
        // Replace all $(PropertyName) references
        const propertyRefRegex = /\$\(([^)]+)\)/g;
        result = result.replace(propertyRefRegex, (match, propertyName) => {
            const key = propertyName.toLowerCase(); // Case-insensitive lookup
            const value = properties.has(key) ? properties.get(key)! : match; // Keep original case of value
            
            // Log each property replacement if verbose
            if (verbose) {
                if (properties.has(key)) {
                    fileResolutionLogger.debug(`[FILE_RESOLUTION]   - Replaced $(${propertyName}) with: ${value}`);
                } else {
                    fileResolutionLogger.debug(`[FILE_RESOLUTION]   - Property not found: $(${propertyName})`);
                }
            }
            
            return value;
        });
        
        // Log the final expanded path if verbose
        if (verbose && result !== pathStr) {
            fileResolutionLogger.debug(`[FILE_RESOLUTION] Expanded result: ${result}`);
        }
        
        return result;
    }
    
    /**
     * Processes a path with wildcards, expanding it to multiple files
     */
    private static async processWildcardPath(
        wildcardPath: string,
        projectDir: string,
        kind: 'code' | 'include' | 'other',
        parsedItems: ParsedItem[],
        displayPath: string,
        verbose: boolean = false
    ): Promise<void> {
        try {
            // Make the path absolute if it's relative
            const absoluteWildcardPath = path.isAbsolute(wildcardPath)
                ? wildcardPath
                : path.join(projectDir, wildcardPath);
                
            if (verbose) {
                logger.info(`[CWPROJ] Expanding wildcard: ${wildcardPath} -> ${absoluteWildcardPath}`);
            }
            
            // Convert to POSIX path for glob and use windowsPathsNoEscape
            const posixPath = absoluteWildcardPath.replace(/\\/g, '/');
            const matches = await glob(posixPath, { nodir: true, windowsPathsNoEscape: true });
            
            // Add each matched file to the results
            for (const match of matches) {
                const normalizedPath = path.normalize(match);
                parsedItems.push({
                    absolutePath: normalizedPath,
                    displayPath: displayPath,
                    ext: path.extname(normalizedPath).toLowerCase(),
                    kind: kind,
                    exists: fs.existsSync(normalizedPath),
                    source: 'glob'
                });
            }
        } catch (error) {
            logger.warn(`Failed to process wildcard path ${wildcardPath}: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    
    /**
     * Computes a hash of the ItemGroup sections in a .cwproj file
     * This is used for cache invalidation when the file content changes
     *
     * @param cwprojContent The content of the .cwproj file
     * @returns A string hash of the ItemGroup sections
     */
    public static computeItemGroupHash(cwprojContent: string): string {
        try {
            // Extract all ItemGroup sections
            const itemGroupRegex = /<ItemGroup\b[^>]*>([\s\S]*?)<\/ItemGroup>/gi;
            let itemGroupMatch;
            let itemGroupContent = '';
            
            while ((itemGroupMatch = itemGroupRegex.exec(cwprojContent)) !== null) {
                itemGroupContent += itemGroupMatch[1];
            }
            
            // Simple hash function for strings
            let hash = 0;
            for (let i = 0; i < itemGroupContent.length; i++) {
                const char = itemGroupContent.charCodeAt(i);
                hash = ((hash << 5) - hash) + char;
                hash = hash & hash; // Convert to 32bit integer
            }
            
            return hash.toString(16);
        } catch (error) {
            logger.error(`Error computing ItemGroup hash: ${error instanceof Error ? error.message : String(error)}`);
            return '';
        }
    }
}