import { Uri, workspace } from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { LanguageClient } from 'vscode-languageclient/node';
import { ClarionSolutionTreeNode, ClarionSolutionInfo, ClarionProjectInfo, ClarionSourcerFileInfo } from '../../common/types';
import LoggerManager from './logger';

const logger = LoggerManager.getLogger("SolutionCache");
logger.setLevel("error");

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
                        
                        // Log detailed project information
                        logger.info(`📊 Solution tree details:`);
                        for (let i = 0; i < this.solutionInfo.projects.length; i++) {
                            const project = this.solutionInfo.projects[i];
                            logger.info(`📂 Project ${i+1}/${this.solutionInfo.projects.length}: ${project.name}`);
                            logger.info(`  - Path: ${project.path}`);
                            logger.info(`  - GUID: ${project.guid}`);
                            logger.info(`  - Source Files: ${project.sourceFiles?.length || 0}`);
                            logger.info(`  - File Drivers: ${project.fileDrivers?.length || 0}`);
                            logger.info(`  - Libraries: ${project.libraries?.length || 0}`);
                            logger.info(`  - Project References: ${project.projectReferences?.length || 0}`);
                            logger.info(`  - None Files: ${project.noneFiles?.length || 0}`);
                        }
                        
                        // Log detailed project information
                        for (const project of this.solutionInfo.projects) {
                            logger.info(`Project: ${project.name}`);
                            logger.info(`  Source Files: ${project.sourceFiles?.length || 0}`);
                            logger.info(`  File Drivers: ${project.fileDrivers?.length || 0} - ${project.fileDrivers?.join(', ') || 'none'}`);
                            logger.info(`  Libraries: ${project.libraries?.length || 0} - ${project.libraries?.join(', ') || 'none'}`);
                            logger.info(`  Project References: ${project.projectReferences?.length || 0} - ${project.projectReferences?.map(r => r.name).join(', ') || 'none'}`);
                            logger.info(`  None Files: ${project.noneFiles?.length || 0} - ${project.noneFiles?.join(', ') || 'none'}`);
                        }
                        
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
     * Gets search paths from the server for a specific project and file extension
     */
    public async getSearchPathsFromServer(projectName: string, extension: string): Promise<string[]> {
        if (!this.client || this.client.needsStart()) {
            logger.warn("⚠️ Language client not available or not ready. Cannot get search paths from server.");
            return [];
        }

        try {
            logger.info(`🔍 Requesting search paths from server for project ${projectName} and extension ${extension}`);

            // Use a promise with timeout to prevent hanging
            const timeoutPromise = new Promise<string[]>((resolve) => {
                setTimeout(() => {
                    logger.warn(`⚠️ Server request timed out for search paths: ${projectName}, ${extension}`);
                    resolve([]);
                }, 15000); // 15 second timeout
            });

            // Race between the actual request and the timeout
            const paths = await Promise.race([
                this.client.sendRequest<string[]>('clarion/getSearchPaths', {
                    projectName,
                    extension
                }),
                timeoutPromise
            ]);

            if (paths && paths.length) {
                logger.info(`✅ Received ${paths.length} search paths from server`);
                return paths;
            } else {
                logger.warn(`⚠️ No search paths returned from server for ${projectName} and ${extension}`);
                return [];
            }
        } catch (error) {
            logger.error(`❌ Error getting search paths from server: ${error instanceof Error ? error.message : String(error)}`);
            return [];
        }
    }

    /**
     * Gets included redirection files from the server for a specific project path
     */
    public async getIncludedRedirectionFilesFromServer(projectPath: string): Promise<string[]> {
        if (!this.client || this.client.needsStart()) {
            logger.warn("⚠️ Language client not available or not ready. Cannot get included redirection files from server.");
            return [];
        }

        try {
            logger.info(`🔍 Requesting included redirection files from server for project at ${projectPath}`);

            // Use a promise with timeout to prevent hanging
            const timeoutPromise = new Promise<string[]>((resolve) => {
                setTimeout(() => {
                    logger.warn(`⚠️ Server request timed out for included redirection files: ${projectPath}`);
                    resolve([]);
                }, 15000); // 15 second timeout
            });

            // Race between the actual request and the timeout
            const redFiles = await Promise.race([
                this.client.sendRequest<string[]>('clarion/getIncludedRedirectionFiles', {
                    projectPath
                }),
                timeoutPromise
            ]);

            if (redFiles && redFiles.length) {
                logger.info(`✅ Received ${redFiles.length} included redirection files from server`);
                return redFiles;
            } else {
                logger.warn(`⚠️ No included redirection files returned from server for ${projectPath}`);
                return [];
            }
        } catch (error) {
            logger.error(`❌ Error getting included redirection files from server: ${error instanceof Error ? error.message : String(error)}`);
            return [];
        }
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
                // Try multiple approaches to find the file
                
                // 1. Try the full path relative to the solution folder
                const fullPathFromSolution = path.join(solutionFolder, sourceFile.relativePath);
                if (fs.existsSync(fullPathFromSolution)) {
                    logger.info(`✅ File found in project source files (solution relative): ${fullPathFromSolution}`);
                    return fullPathFromSolution;
                }
                
                // 2. Try the path relative to the project folder
                const fullPathFromProject = path.join(project.path, sourceFile.relativePath);
                if (fs.existsSync(fullPathFromProject)) {
                    logger.info(`✅ File found in project source files (project relative): ${fullPathFromProject}`);
                    return fullPathFromProject;
                }
                
                // 3. Try just the filename in the project folder
                const fileInProjectFolder = path.join(project.path, path.basename(sourceFile.relativePath));
                if (fs.existsSync(fileInProjectFolder)) {
                    logger.info(`✅ File found in project folder: ${fileInProjectFolder}`);
                    return fileInProjectFolder;
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
                    }, 15000); // 15 second timeout
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
                    // If the server returned a path but it doesn't exist, try to fix it
                    // This can happen if the server is using different path separators or has a different base path
                    
                    // Try to normalize the path
                    const normalizedPath = path.normalize(serverPath);
                    if (fs.existsSync(normalizedPath)) {
                        logger.info(`✅ File found after normalizing server path: ${normalizedPath}`);
                        return normalizedPath;
                    }
                    
                    // Try to extract just the filename and search in project folders
                    const serverFileName = path.basename(serverPath);
                    for (const project of this.solutionInfo.projects) {
                        const projectFilePath = path.join(project.path, serverFileName);
                        if (fs.existsSync(projectFilePath)) {
                            logger.info(`✅ File found in project folder using server filename: ${projectFilePath}`);
                            return projectFilePath;
                        }
                    }
                    
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
                    logger.info(`✅ File found in search path: ${fullPath}`);
                    return fullPath;
                }
            }
            // Try directly in the project folder
            // This is especially important for .clw files in project subdirectories
            const projectFolder = project.path;
            const projectFilePath = path.join(projectFolder, filename);
            if (fs.existsSync(projectFilePath)) {
                logger.info(`✅ File found directly in project folder: ${projectFilePath}`);
                return projectFilePath;
            }
        }

        // Only check the solution folder as a last resort
        // All other paths should come from redirection
        const standardPaths = [
            solutionFolder
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
        // Minimal set of paths - let the server handle most path resolution through redirection
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
    

}