import { Uri, workspace } from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { LanguageClient } from 'vscode-languageclient/node';
import { ClarionSolutionTreeNode, ClarionSolutionInfo, ClarionProjectInfo, ClarionSourcerFileInfo } from '../../common/types';
import LoggerManager from './logger';

const logger = LoggerManager.getLogger("SolutionCache");
logger.setLevel("info");

/**
 * SolutionCache is a singleton class that caches the solution tree returned from the language server.
 * It communicates with the server-side solution management to get solution information.
 */
export class SolutionCache {
    private static instance: SolutionCache | null = null;
    private client: LanguageClient | null = null;
    private solutionInfo: ClarionSolutionInfo | null = null;
    private solutionFilePath: string = '';

    private constructor() {
        // Private constructor to enforce singleton pattern
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
     * Falls back to client-side SolutionParser if server is not available
     */
    public async initialize(solutionFilePath: string): Promise<boolean> {
        this.solutionFilePath = solutionFilePath;
        
        try {
            // Check if client is ready before trying to use it
            if (this.client && !this.client.needsStart()) {
                logger.info("🔄 Fetching solution tree from server...");
                
                try {
                    // Set a timeout to prevent hanging if the server doesn't respond
                    const timeoutPromise = new Promise<null>((resolve) => {
                        setTimeout(() => {
                            logger.warn("⚠️ Server request timed out");
                            resolve(null);
                        }, 15000); // 15 second timeout
                    });
                    
                    // Race between the actual request and the timeout
                    this.solutionInfo = await Promise.race([
                        this.client.sendRequest<ClarionSolutionInfo | null>('clarion/getSolutionTree'),
                        timeoutPromise
                    ]);
                    
                    if (this.solutionInfo) {
                        logger.info(`✅ Solution tree fetched with ${this.solutionInfo.projects.length} projects`);
                        return true;
                    } else {
                        logger.warn("⚠️ Server returned null solution tree");
                        // Create an empty solution info
                        this.solutionInfo = {
                            name: path.basename(this.solutionFilePath),
                            path: this.solutionFilePath,
                            projects: []
                        };
                        return false;
                    }
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
            } else {
                if (this.client) {
                    logger.warn(`⚠️ Language client not ready (needsStart: ${this.client.needsStart()})`);
                } else {
                    logger.warn("⚠️ Language client not available");
                }
                
                // Create an empty solution info
                this.solutionInfo = {
                    name: path.basename(this.solutionFilePath),
                    path: this.solutionFilePath,
                    projects: []
                };
                return false;
            }
        } catch (error) {
            logger.error(`❌ Error initializing solution cache: ${error instanceof Error ? error.message : String(error)}`);
            
            // Create an empty solution info
            this.solutionInfo = {
                name: path.basename(this.solutionFilePath),
                path: this.solutionFilePath,
                projects: []
            };
            return false;
        }
    }

    /**
     * Refreshes the solution cache by fetching the latest solution tree from the server
     */
    public async refresh(): Promise<boolean> {
        if (!this.solutionFilePath) {
            logger.error("❌ Solution file path not set. Cannot refresh SolutionCache.");
            return false;
        }
        
        return this.initialize(this.solutionFilePath);
    }

    /**
     * Gets the cached solution info
     */
    public getSolutionInfo(): ClarionSolutionInfo | null {
        return this.solutionInfo;
    }

    /**
     * Gets the solution file path
     */
    public getSolutionFilePath(): string {
        return this.solutionFilePath;
    }

    /**
     * Finds a project that contains the specified file
     */
    public findProjectForFile(fileName: string): ClarionProjectInfo | undefined {
        if (!this.solutionInfo) return undefined;
        
        logger.info(`🔍 Searching for project containing file: ${fileName}`);
        
        // Extract just the filename from the full path
        const baseFileName = path.basename(fileName).toLowerCase();
        
        for (const project of this.solutionInfo.projects) {
            const foundSourceFile = project.sourceFiles.find(sourceFile =>
                sourceFile.name.toLowerCase() === baseFileName
            );
            
            if (foundSourceFile) {
                logger.info(`✅ Found project for file: ${baseFileName} in project ${project.name}`);
                return project;
            }
        }
        
        logger.info(`❌ File "${baseFileName}" not found in any project.`);
        return undefined;
    }

    /**
     * Finds a source file in any project by its path
     */
    public findSourceInProject(filePath: string): ClarionSourcerFileInfo | undefined {
        if (!this.solutionInfo) return undefined;
        
        try {
            // Try to match by relative path or filename
            const baseFileName = path.basename(filePath).toLowerCase();
            
            for (const project of this.solutionInfo.projects) {
                // First try to match by relative path
                const foundByPath = project.sourceFiles.find(sourceFile =>
                    sourceFile.relativePath?.toLowerCase() === filePath.toLowerCase()
                );
                
                if (foundByPath) {
                    return foundByPath;
                }
                
                // Then try to match by filename
                const foundByName = project.sourceFiles.find(sourceFile =>
                    sourceFile.name.toLowerCase() === baseFileName
                );
                
                if (foundByName) {
                    return foundByName;
                }
            }
        } catch (error) {
            logger.info(String(error));
        }
        
        return undefined;
    }

    /**
     * Finds a file with the specified extension in any project's search paths
     */
    public async findFileWithExtension(filename: string): Promise<string> {
        if (!this.solutionInfo) {
            logger.info(`❌ No solution info available when searching for ${filename}`);
            return "";
        }
        
        if (!this.solutionFilePath || this.solutionFilePath.trim() === "") {
            logger.info(`❌ No solution file path set when searching for ${filename}`);
            return "";
        }
        
        logger.info(`🔍 Searching for file: ${filename}`);
        const extension = path.extname(filename).toLowerCase();
        const solutionFolder = path.dirname(this.solutionFilePath);
        
        // First check if the file exists in any project's source files
        for (const project of this.solutionInfo.projects) {
            const sourceFile = project.sourceFiles.find(sf =>
                sf.name.toLowerCase() === path.basename(filename).toLowerCase()
            );
            
            if (sourceFile && sourceFile.relativePath) {
                const fullPath = path.join(solutionFolder, sourceFile.relativePath);
                if (fs.existsSync(fullPath)) {
                    logger.info(`✅ File found in project source files: ${fullPath}`);
                    return fullPath;
                }
            }
        }
        
        // Try to get the file path from the server using the language client
        if (this.client && !this.client.needsStart()) {
            try {
                logger.info(`🔄 Requesting file path from server for: ${filename}`);
                
                // Use a promise with timeout to prevent hanging
                const timeoutPromise = new Promise<string>((resolve) => {
                    setTimeout(() => {
                        logger.warn(`⚠️ Server request timed out for file: ${filename}`);
                        resolve("");
                    }, 5000); // 5 second timeout
                });
                
                // Race between the actual request and the timeout
                const serverPath = await Promise.race([
                    this.client.sendRequest<string>('clarion/findFile', { filename }),
                    timeoutPromise
                ]);
                
                if (serverPath && fs.existsSync(serverPath)) {
                    logger.info(`✅ File found by server: ${serverPath}`);
                    return serverPath;
                } else if (serverPath) {
                    logger.warn(`⚠️ Server returned path but file doesn't exist: ${serverPath}`);
                }
            } catch (error) {
                logger.error(`❌ Error requesting file from server: ${error instanceof Error ? error.message : String(error)}`);
            }
        }
        
        // Then check in project search paths
        for (const project of this.solutionInfo.projects) {
            logger.info(`🔍 Searching for '${filename}' in project: ${project.name}`);
            
            // Get search paths for this extension
            const searchPaths = this.getProjectSearchPaths(project, extension);
            
            for (const searchPath of searchPaths) {
                let resolvedPath = searchPath === '.' ? solutionFolder : searchPath;
                const fullPath = path.join(resolvedPath, filename);
                
                if (fs.existsSync(fullPath)) {
                    logger.info(`✅ File found: ${fullPath}`);
                    return fullPath;
                }
            }
        }
        
        // Try standard Clarion include directories
        const standardPaths = [
            path.join(solutionFolder, 'include'),
            path.join(solutionFolder, 'libsrc'),
            path.join(solutionFolder, '..', 'include'),
            path.join(solutionFolder, '..', 'libsrc')
        ];
        
        for (const standardPath of standardPaths) {
            const fullPath = path.join(standardPath, filename);
            if (fs.existsSync(fullPath)) {
                logger.info(`✅ File found in standard path: ${fullPath}`);
                return fullPath;
            }
        }
        
        logger.info(`❌ File '${filename}' not found in any project paths.`);
        return "";
    }

    /**
     * Gets the search paths for a project and extension
     */
    private getProjectSearchPaths(project: ClarionProjectInfo, extension: string): string[] {
        // For now, return a basic set of search paths
        // In a more complete implementation, we would get this from the server
        return [
            '.',
            project.path
        ];
    }

    /**
     * Gets the available build configurations from the solution
     */
    public getAvailableConfigurations(): string[] {
        if (!this.solutionFilePath || !fs.existsSync(this.solutionFilePath)) {
            logger.error("❌ Solution file path is not set or does not exist.");
            return [];
        }

        const solutionContent = fs.readFileSync(this.solutionFilePath, "utf-8");
        const configPattern = /^\s*(.*?)\|Win32\s*=/gm; // Matches `Debug|Win32 = Debug|Win32`
        const configurations: Set<string> = new Set();

        let match;
        while ((match = configPattern.exec(solutionContent)) !== null) {
            configurations.add(match[1].trim()); // Extracts 'Debug', 'Release', etc.
        }

        return Array.from(configurations);
    }
}