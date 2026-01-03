import * as fs from 'fs';
import * as path from 'path';
import { RedirectionFileParserServer, RedirectionEntry } from '../solution/redirectionFileParserServer';
import LoggerManager from '../logger';
import { serverSettings } from '../serverSettings';

const logger = LoggerManager.getLogger('ClassDefinitionIndexer');

/**
 * Represents a single class definition found in a file
 */
export interface ClassDefinitionInfo {
    className: string;
    filePath: string;
    lineNumber: number;
    isType: boolean;
    parentClass?: string;
    lineContent: string;
}

/**
 * Represents the complete index of class definitions for a project
 */
export interface ClassIndex {
    classes: Map<string, ClassDefinitionInfo[]>;
    lastIndexed: number;
    projectPath: string;
}

/**
 * Indexes class definitions from .inc and .clw files found via redirection paths
 * Provides fast lookup of class definitions by name
 */
export class ClassDefinitionIndexer {
    private indexes: Map<string, ClassIndex> = new Map(); // projectPath -> ClassIndex
    private static readonly CLASS_PATTERN = /^(\w+)\s+CLASS\s*([\(,\s]|$)/i;

    /**
     * Gets or builds the class index for a project
     * @param projectPath The project directory path
     * @returns The class index for the project
     */
    async getOrBuildIndex(projectPath: string): Promise<ClassIndex> {
        const normalizedPath = path.normalize(projectPath);
        
        if (this.indexes.has(normalizedPath)) {
            logger.debug(`Using cached index for project: ${normalizedPath}`);
            return this.indexes.get(normalizedPath)!;
        }

        logger.info(`Building index for project: ${normalizedPath}`);
        const index = await this.buildIndex(projectPath);
        this.indexes.set(normalizedPath, index);
        
        return index;
    }

    /**
     * Builds a class definition index for a project by scanning all .inc files
     * found in the redirection paths
     * @param projectPath The project directory path
     * @returns The built class index
     */
    async buildIndex(projectPath: string): Promise<ClassIndex> {
        const startTime = Date.now();
        const classes = new Map<string, ClassDefinitionInfo[]>();

        try {
            // Get redirection paths
            const redirectionParser = new RedirectionFileParserServer();
            const entries = await redirectionParser.parseRedFileAsync(projectPath);

            // Extract all unique directory paths from redirection entries
            const searchPaths = this.extractSearchPathsFromEntries(entries);
            
            // Also include libsrc paths from serverSettings
            // These are configured from ClarionProperties.xml and contain paths to standard library includes
            if (serverSettings.libsrcPaths && serverSettings.libsrcPaths.length > 0) {
                logger.info(`Adding ${serverSettings.libsrcPaths.length} libsrc paths from serverSettings`);
                for (const libPath of serverSettings.libsrcPaths) {
                    if (fs.existsSync(libPath) && fs.statSync(libPath).isDirectory()) {
                        searchPaths.push(libPath);
                    }
                }
            }
            
            logger.info(`Found ${searchPaths.length} total search paths (redirection + libsrc)`);

            // Scan all .inc files in these paths
            const allFiles: string[] = [];
            for (const searchPath of searchPaths) {
                if (fs.existsSync(searchPath)) {
                    const files = fs.readdirSync(searchPath)
                        .filter(f => f.toLowerCase().endsWith('.inc'))
                        .map(f => path.join(searchPath, f));
                    allFiles.push(...files);
                }
            }

            logger.info(`Scanning ${allFiles.length} .inc files for class definitions`);

            // Scan files for class definitions
            let totalClassesFound = 0;
            for (const filePath of allFiles) {
                const definitions = await this.scanFileForClasses(filePath);
                totalClassesFound += definitions.length;

                for (const def of definitions) {
                    // Store by lowercase key for case-insensitive lookup
                    const key = def.className.toLowerCase();
                    if (!classes.has(key)) {
                        classes.set(key, []);
                    }
                    classes.get(key)!.push(def);
                }
            }

            const duration = Date.now() - startTime;
            logger.info(`Index built in ${duration}ms: ${totalClassesFound} classes found, ${classes.size} unique names`);

            return {
                classes,
                lastIndexed: Date.now(),
                projectPath: path.normalize(projectPath)
            };

        } catch (error) {
            logger.error(`Error building index: ${error instanceof Error ? error.message : String(error)}`);
            // Return empty index on error
            return {
                classes,
                lastIndexed: Date.now(),
                projectPath: path.normalize(projectPath)
            };
        }
    }

    /**
     * Finds class definition(s) by name (case-insensitive)
     * @param className The class name to find
     * @param projectPath Optional project path to search in specific project index
     * @returns Array of class definitions, or null if not found
     */
    findClass(className: string, projectPath?: string): ClassDefinitionInfo[] | null {
        const key = className.toLowerCase();

        if (projectPath) {
            const normalizedPath = path.normalize(projectPath);
            const index = this.indexes.get(normalizedPath);
            if (index) {
                return index.classes.get(key) || null;
            }
            return null;
        }

        // Search all indexes if no specific project specified
        for (const index of this.indexes.values()) {
            const result = index.classes.get(key);
            if (result) {
                return result;
            }
        }

        return null;
    }

    /**
     * Finds all class definitions in a specific include file (case-insensitive filename)
     * @param fileName The include filename (e.g., "StringTheory.inc")
     * @param projectPath Optional project path to search in specific project index
     * @returns Array of class definitions found in the file
     */
    findClassesByFile(fileName: string, projectPath?: string): ClassDefinitionInfo[] {
        const results: ClassDefinitionInfo[] = [];
        const fileNameLower = fileName.toLowerCase();

        const searchIndex = (index: ClassIndex) => {
            for (const definitions of index.classes.values()) {
                for (const def of definitions) {
                    if (path.basename(def.filePath).toLowerCase() === fileNameLower) {
                        results.push(def);
                    }
                }
            }
        };

        if (projectPath) {
            const normalizedPath = path.normalize(projectPath);
            const index = this.indexes.get(normalizedPath);
            if (index) {
                searchIndex(index);
            }
        } else {
            // Search all indexes
            for (const index of this.indexes.values()) {
                searchIndex(index);
            }
        }

        return results;
    }

    /**
     * Extracts unique directory paths from redirection entries
     * @param entries The redirection entries from the parser
     * @returns Array of unique directory paths
     */
    private extractSearchPathsFromEntries(entries: RedirectionEntry[]): string[] {
        const paths = new Set<string>();

        if (!entries || entries.length === 0) {
            logger.warn('No redirection entries found');
            return [];
        }

        for (const entry of entries) {
            if (!entry || !entry.paths) continue;
            
            for (const dirPath of entry.paths) {
                // Resolve relative paths
                let resolvedPath = dirPath;
                if (!path.isAbsolute(dirPath)) {
                    const redFileDir = path.dirname(entry.redFile);
                    resolvedPath = path.resolve(redFileDir, dirPath);
                }
                
                resolvedPath = path.normalize(resolvedPath);
                
                if (fs.existsSync(resolvedPath)) {
                    const stats = fs.statSync(resolvedPath);
                    if (stats.isDirectory()) {
                        paths.add(resolvedPath);
                    }
                }
            }
        }

        return Array.from(paths);
    }

    /**
     * Scans a single file for class definitions
     * @param filePath The file path to scan
     * @returns Array of class definitions found in the file
     */
    private async scanFileForClasses(filePath: string): Promise<ClassDefinitionInfo[]> {
        const definitions: ClassDefinitionInfo[] = [];

        try {
            const content = await fs.promises.readFile(filePath, 'utf-8');
            const lines = content.split('\n');

            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                const match = ClassDefinitionIndexer.CLASS_PATTERN.exec(line);

                if (match) {
                    const className = match[1];
                    const remainder = line.substring(match[0].length);

                    // Determine if it's a TYPE definition
                    const isType = /,\s*TYPE/i.test(remainder);

                    // Try to extract parent class from CLASS(ParentClass)
                    let parentClass: string | undefined;
                    const parentMatch = /CLASS\s*\(\s*(\w+)\s*\)/i.exec(line);
                    if (parentMatch) {
                        parentClass = parentMatch[1];
                    }

                    definitions.push({
                        className,
                        filePath,
                        lineNumber: i + 1, // 1-based line numbers
                        isType,
                        parentClass,
                        lineContent: line.trim()
                    });

                    logger.debug(`Found class: ${className} in ${path.basename(filePath)}:${i + 1}`);
                }
            }
        } catch (error) {
            logger.error(`Error reading file ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
        }

        return definitions;
    }

    /**
     * Clears all cached indexes
     */
    clearCache(): void {
        this.indexes.clear();
        logger.info('All class definition indexes cleared');
    }

    /**
     * Clears the index for a specific project
     * @param projectPath The project path
     */
    clearProjectCache(projectPath: string): void {
        const normalizedPath = path.normalize(projectPath);
        this.indexes.delete(normalizedPath);
        logger.info(`Cleared index for project: ${normalizedPath}`);
    }
}
