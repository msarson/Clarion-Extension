import * as fs from 'fs';
import * as path from 'path';
import { ClarionSolutionServer } from './clarionSolutionServer';
import LoggerManager from '../logger';
import { ClarionProjectServer } from './clarionProjectServer';
import { Connection } from 'vscode-languageserver';
import { Token } from '../ClarionTokenizer';
import { TokenCache } from '../TokenCache';
import { solutionOperationInProgress } from '../server';

const logger = LoggerManager.getLogger("SolutionManager");
logger.setLevel("info");

export class SolutionManager {
    public solution: ClarionSolutionServer;
    public solutionFilePath: string;
    private static instance: SolutionManager | null = null;
    private fileCache: Map<string, string> = new Map();
    private static readonly CACHE_VERSION = 1; // Increment when cache format changes
    
    // Static in-memory cache to store solution data by file path (similar to client-side implementation)
    private static inMemoryCache: Map<string, {
        version: number,
        timestamp: number,
        solution: ClarionSolutionServer
    }> = new Map();

    private constructor(filePath: string) {
        this.solutionFilePath = filePath;
        const solutionName = path.basename(filePath);
        this.solution = new ClarionSolutionServer(solutionName, filePath);
        logger.info(`📂 Created SolutionManager for ${solutionName}`);
    }

    public getAllSourceFiles(): { fullPath: string, tokens: Token[] }[] {
        const allFiles: { fullPath: string, tokens: Token[] }[] = [];
    
        for (const project of this.solution.projects) {
            for (const file of project.sourceFiles) {
                const fullPath = path.join(project.path, file.relativePath);
                const documentUri = `file:///${fullPath.replace(/\\/g, "/")}`;
                const document = project.getTextDocumentByPath?.(fullPath);
                if (!document) continue;
    
                const tokens = TokenCache.getInstance().getTokens(document);
                allFiles.push({ fullPath, tokens });
            }
        }
    
        return allFiles;
    }
    
    /**
     * Clears the in-memory cache for a specific solution file
     * @param filePath The path to the solution file to clear the cache for
     */
    public static clearCache(filePath: string): void {
        if (SolutionManager.inMemoryCache.has(filePath)) {
            SolutionManager.inMemoryCache.delete(filePath);
            logger.info(`✅ Cleared in-memory cache for: ${filePath}`);
        }
    }

    /**
     * Clears all in-memory caches
     */
    public static clearAllCaches(): void {
        SolutionManager.inMemoryCache.clear();
        logger.info(`✅ Cleared all in-memory caches`);
    }

    public static async create(filePath: string): Promise<SolutionManager> {
        try {
            // Set the solution operation flag to true
            (global as any).solutionOperationInProgress = true;
            
            const stat = fs.statSync(filePath);
            if (stat.isDirectory()) {
                throw new Error(`❌ Expected a file path but received a directory: ${filePath}`);
            }

            if (!SolutionManager.instance) {
                SolutionManager.instance = new SolutionManager(filePath);
                await SolutionManager.instance.initialize();
            } else if (SolutionManager.instance.solutionFilePath !== filePath) {
                // If the solution file has changed, create a new instance
                SolutionManager.instance = new SolutionManager(filePath);
                await SolutionManager.instance.initialize();
            }

            return SolutionManager.instance;
        } finally {
            // Reset the solution operation flag when done
            (global as any).solutionOperationInProgress = false;
        }
    }

    public static getInstance(): SolutionManager | null {
        return SolutionManager.instance;
    }

    private async initialize() {
        const startTime = performance.now();
        logger.info(`🕒 Starting initialize`);
        
        try {
            // Set the solution operation flag to true
            (global as any).solutionOperationInProgress = true;
            
            logger.info(`🔄 Initializing solution from ${this.solutionFilePath}`);
            
            // Log memory usage before parsing
            const memoryBefore = process.memoryUsage();
            logger.info(`📊 Memory usage before solution parsing:
                - RSS: ${Math.round(memoryBefore.rss / 1024 / 1024)} MB
                - Heap total: ${Math.round(memoryBefore.heapTotal / 1024 / 1024)} MB
                - Heap used: ${Math.round(memoryBefore.heapUsed / 1024 / 1024)} MB
            `);
            
            this.solution = await this.parseSolution();
            
            // Log memory usage after parsing
            const memoryAfter = process.memoryUsage();
            logger.info(`📊 Memory usage after solution parsing:
                - RSS: ${Math.round(memoryAfter.rss / 1024 / 1024)} MB
                - Heap total: ${Math.round(memoryAfter.heapTotal / 1024 / 1024)} MB
                - Heap used: ${Math.round(memoryAfter.heapUsed / 1024 / 1024)} MB
            `);
            
            logger.info(`✅ Solution initialized with ${this.solution.projects.length} projects`);
            
            const endTime = performance.now();
            logger.info(`🕒 initialize completed in ${(endTime - startTime).toFixed(2)}ms`);
        } finally {
            // Reset the solution operation flag when done
            (global as any).solutionOperationInProgress = false;
        }
    }

    private async parseSolution(): Promise<ClarionSolutionServer> {
        const startTime = performance.now();
        logger.info(`🕒 Starting parseSolution`);
        
        try {
            // Try to load from cache first
            if (await this.loadFromCache()) {
                const endTime = performance.now();
                logger.info(`🕒 parseSolution completed in ${(endTime - startTime).toFixed(2)}ms (loaded from cache)`);
                return this.solution;
            }
            
            // Use async file existence check
            try {
                await fs.promises.access(this.solutionFilePath, fs.constants.F_OK);
            } catch {
                logger.error(`❌ Solution file not found: ${this.solutionFilePath}`);
                return new ClarionSolutionServer();
            }

            try {
                // Use async file reading
                const content = await fs.promises.readFile(this.solutionFilePath, 'utf-8');
                logger.info(`📂 Solution file content length: ${content.length} bytes`);
                
                // Count the number of project entries in the solution file
                const projectCount = (content.match(/Project\("/g) || []).length;
                logger.info(`📂 Found ${projectCount} project entries in solution file`);
                
                const regex = /Project\("([^\"]+)"\) = "([^\"]+)", "([^\"]+)", "([^\"]+)"/g;
                let match: RegExpExecArray | null;
                
                const solution = new ClarionSolutionServer(
                    path.basename(this.solutionFilePath, '.sln'),
                    this.solutionFilePath
                );

                // Create an array of promises for loading projects in parallel
                const projectPromises: Promise<void>[] = [];
                const projectsToAdd: ClarionProjectServer[] = [];

                while ((match = regex.exec(content)) !== null) {
                    try {
                        const [, projectType, projectName, projectPath, projectGuid] = match;
                        if (!projectPath.toLowerCase().endsWith('.cwproj')) continue;

                        logger.info(`📂 Found project: ${projectName} (${projectPath})`);
                        const absoluteProjectDir = path.dirname(path.resolve(this.solutionFilePath, '..', projectPath));
                        const project = new ClarionProjectServer(projectName, projectType, absoluteProjectDir, projectGuid);
                        
                        // Add to the list of projects to add to the solution
                        projectsToAdd.push(project);
                        
                        // Create a promise for loading this project's source files
                        const projectPromise = project.loadSourceFilesFromProjectFile()
                            .catch(projectError => {
                                logger.error(`❌ Error loading source files for project ${projectName}: ${projectError instanceof Error ? projectError.message : String(projectError)}`);
                                // We'll still add the project even if loading source files failed
                            });
                        
                        projectPromises.push(projectPromise);
                    } catch (matchError) {
                        logger.error(`❌ Error processing project match: ${matchError instanceof Error ? matchError.message : String(matchError)}`);
                    }
                }

                // Wait for all projects to load in parallel
                await Promise.all(projectPromises);
                
                // Add all projects to the solution
                for (const project of projectsToAdd) {
                    solution.projects.push(project);
                    logger.info(`✅ Added project ${project.name} with ${project.sourceFiles.length} source files`);
                }

                logger.info(`📂 Finished parsing solution file. Found ${solution.projects.length} projects.`);
                
                // Save the parsed solution to cache
                this.solution = solution;
                await this.saveToCache();

                const endTime = performance.now();
                logger.info(`🕒 parseSolution completed in ${(endTime - startTime).toFixed(2)}ms`);
                
                return solution;
            } catch (readError) {
                logger.error(`❌ Error reading solution file: ${readError instanceof Error ? readError.message : String(readError)}`);
                return new ClarionSolutionServer();
            }
        } catch (error) {
            logger.error(`❌ Unexpected error in parseSolution: ${error instanceof Error ? error.message : String(error)}`);
            return new ClarionSolutionServer();
        }
    }

    public findProjectForFile(filePath: string): ClarionProjectServer | undefined {
        const baseName = path.basename(filePath).toLowerCase();
        return this.solution.projects.find(project =>
            project.sourceFiles.some(f => f.name.toLowerCase() === baseName)
        );
    }

    public async findFileWithExtension(filename: string): Promise<{ path: string, source: string }> {
        try {
            // Helper for async existence check
            const fileExists = async (filePath: string) => {
                try {
                    await fs.promises.access(filePath, fs.constants.F_OK);
                    return true;
                } catch {
                    return false;
                }
            };
    
            // Check cache first
            if (this.fileCache.has(filename)) {
                const cachedPath = this.fileCache.get(filename)!;
                if (await fileExists(cachedPath)) {
                    logger.info(`✅ Found file in cache: ${cachedPath}`);
                    return { path: cachedPath, source: "cache" };
                } else {
                    // Remove invalid cache entry
                    this.fileCache.delete(filename);
                }
            }
    
            logger.info(`🔍 Searching for file: ${filename}`);
            
            // Handle potential undefined or null filename
            if (!filename) {
                logger.warn(`⚠️ Filename is undefined or null`);
                return { path: '', source: "" };
            }
            
            const ext = path.extname(filename).toLowerCase();
    
            // Create an array of promises to check all possible locations in parallel
            const checkPromises: Promise<{ path: string, source: string } | null>[] = [];
    
            // Check project source files
            for (const project of this.solution.projects) {
                // Skip if project has no source files
                if (!project.sourceFiles || project.sourceFiles.length === 0) {
                    continue;
                }
                
                const sourceFile = project.sourceFiles.find(sf => {
                    // Handle potential undefined name
                    if (!sf || !sf.name) {
                        return false;
                    }
                    return sf.name.toLowerCase() === path.basename(filename).toLowerCase();
                });

            if (sourceFile) {
                // Handle potential undefined relativePath
                if (sourceFile.relativePath) {
                    const fullPath = path.join(project.path, sourceFile.relativePath);
                    checkPromises.push(
                        fileExists(fullPath).then(exists => {
                            if (exists) {
                                logger.info(`✅ Found file in project source files: ${fullPath}`);
                                this.fileCache.set(filename, fullPath);
                                return { path: fullPath, source: "project" };
                            }
                            return null;
                        })
                    );
                } else {
                    logger.warn(`⚠️ Source file ${sourceFile.name || 'unknown'} has no relativePath`);
                }
            }
        }

        // Check redirection entries and search paths
        for (const project of this.solution.projects) {
            // Try using the redirection parser directly
            const redParser = project.getRedirectionParser();
            const redResult = redParser.findFile(filename);
            if (redResult && redResult.path) {
                checkPromises.push(
                    fileExists(redResult.path).then(exists => {
                        if (exists) {
                            logger.info(`✅ Found file through redirection: ${redResult.path}`);
                            this.fileCache.set(filename, redResult.path);
                            return { path: redResult.path, source: "redirected" };
                        }
                        return null;
                    })
                );
            }

            // Check search paths
            const searchPaths = project.getSearchPaths(ext);
            for (const searchPath of searchPaths) {
                const fullPath = path.join(searchPath, filename);
                checkPromises.push(
                    fileExists(fullPath).then(exists => {
                        if (exists) {
                            logger.info(`✅ Found file in search path: ${fullPath}`);
                            this.fileCache.set(filename, fullPath);
                            return { path: fullPath, source: "project-search-path" };
                        }
                        return null;
                    })
                );
            }
        }

        // Wait for all checks to complete and find the first successful result
        const results = await Promise.all(checkPromises);
        const firstMatch = results.find(result => result !== null);

        if (firstMatch) {
            return firstMatch;
        }

        logger.warn(`❌ File '${filename}' not found in any project paths.`);
        return { path: '', source: "" };
    } catch (error) {
        logger.error(`❌ Error searching for file: ${error instanceof Error ? error.message : String(error)}`);
        return { path: '', source: "" };
    }
    }

    public registerHandlers(connection: Connection): void {
        logger.info("🔄 Registering solution manager handlers");
        
        connection.onRequest('clarion/getSolutionTree', () => {
            try {
                // Set the solution operation flag to true
                (global as any).solutionOperationInProgress = true;
                
                logger.info("📂 Received request for solution tree");
                const tree = this.getSolutionTree();
                logger.info(`📂 Returning solution tree with ${tree.projects.length} projects`);
                return tree;
            } finally {
                // Reset the solution operation flag when done
                (global as any).solutionOperationInProgress = false;
            }
        });
        
        // Add a new handler for getting project details on demand
        connection.onRequest('clarion/getProjectDetails', (params: { projectGuid: string }) => {
            try {
                // Set the solution operation flag to true
                (global as any).solutionOperationInProgress = true;
                
                logger.info(`📂 Received request for project details: ${params.projectGuid}`);
                const details = this.getProjectDetails(params.projectGuid);
                return details;
            } finally {
                // Reset the solution operation flag when done
                (global as any).solutionOperationInProgress = false;
            }
        });
        
        // Add a new handler for getting project files
        connection.onRequest('clarion/getProjectFiles', (params: { projectGuid: string }) => {
            try {
                // Set the solution operation flag to true
                (global as any).solutionOperationInProgress = true;
                
                logger.info(`📂 Received request for project files: ${params.projectGuid}`);
                
                // Log all available project GUIDs for debugging
                logger.info(`📂 Available project GUIDs: ${this.solution.projects.map(p => p.guid).join(', ')}`);
                
                // Normalize the requested GUID by removing curly braces
                const normalizedRequestGuid = params.projectGuid.replace(/[{}]/g, '');
                logger.info(`📂 Normalized requested GUID: ${normalizedRequestGuid}`);
                
                // First try exact match with normalized GUIDs
                const project = this.solution.projects.find(p =>
                    p.guid.replace(/[{}]/g, '') === normalizedRequestGuid
                );
                
                if (!project) {
                    logger.warn(`⚠️ Project with GUID ${params.projectGuid} not found`);
                    
                    // Try a case-insensitive search as a fallback
                    const projectCaseInsensitive = this.solution.projects.find(p =>
                        p.guid.replace(/[{}]/g, '').toLowerCase() === normalizedRequestGuid.toLowerCase()
                    );
                    
                    if (projectCaseInsensitive) {
                        logger.info(`✅ Found project with case-insensitive GUID match: ${projectCaseInsensitive.name} (${projectCaseInsensitive.guid})`);
                        
                        // Add detailed logging about the project's source files
                        logger.info(`📂 Project ${projectCaseInsensitive.name} has ${projectCaseInsensitive.sourceFiles ? projectCaseInsensitive.sourceFiles.length : 0} source files (case-insensitive match)`);
                        
                        if (!projectCaseInsensitive.sourceFiles || projectCaseInsensitive.sourceFiles.length === 0) {
                            logger.warn(`⚠️ Project ${projectCaseInsensitive.name} has no source files (case-insensitive match)`);
                            
                            // Log additional project details for debugging
                            logger.info(`📂 Project details: path=${projectCaseInsensitive.path}, filename=${projectCaseInsensitive.filename}`);
                            
                            // Check if the project file exists
                            const projectFilePath = path.join(projectCaseInsensitive.path, projectCaseInsensitive.filename);
                            try {
                                const exists = fs.existsSync(projectFilePath);
                                logger.info(`📂 Project file ${projectFilePath} exists: ${exists}`);
                                
                                if (exists) {
                                    // Try to read the project file content
                                    try {
                                        const content = fs.readFileSync(projectFilePath, 'utf-8');
                                        logger.info(`📂 Project file content length: ${content.length} bytes`);
                                        
                                        // Count the number of source file entries in the project file
                                        const sourceFileCount = (content.match(/<Compile Include/g) || []).length;
                                        logger.info(`📂 Found ${sourceFileCount} <Compile Include> entries in project file`);
                                    } catch (readError) {
                                        logger.error(`❌ Error reading project file: ${readError instanceof Error ? readError.message : String(readError)}`);
                                    }
                                }
                            } catch (error) {
                                logger.error(`❌ Error checking project file: ${error instanceof Error ? error.message : String(error)}`);
                            }
                        }
                        
                        // Filter the source files to only include Compile Include entries
                        // This ensures we only show source code files in the tree view
                        const sourceFiles = (projectCaseInsensitive.sourceFiles || []).filter(file => {
                            // We only want to include actual source files (from Compile Include entries)
                            // We can identify these by checking if they have a .clw or other source file extension
                            if (!file || !file.name) {
                                return false;
                            }
                            
                            const ext = path.extname(file.name).toLowerCase();
                            // Include only source code files with relevant extensions
                            return ['.clw', '.inc', '.txa', '.tpl', '.tpw', '.trn', '.clw', '.txa'].includes(ext);
                        });
                        
                        logger.info(`📂 Filtered source files for project ${projectCaseInsensitive.name}: ${sourceFiles.length} out of ${(projectCaseInsensitive.sourceFiles || []).length} total files`);
                        
                        // Return only the filtered source files for the project
                        const files = sourceFiles.map(file => {
                            if (!file) {
                                logger.warn(`⚠️ Found null or undefined source file in project ${projectCaseInsensitive.name}`);
                                return {
                                    name: "unknown",
                                    relativePath: "",
                                    project: {
                                        name: projectCaseInsensitive.name,
                                        type: projectCaseInsensitive.type,
                                        path: projectCaseInsensitive.path,
                                        guid: projectCaseInsensitive.guid,
                                        filename: projectCaseInsensitive.filename
                                    }
                                };
                            }
                            // Log the file details for debugging
                            logger.info(`📂 Processing file: name=${file.name || 'undefined'}, relativePath=${file.relativePath || 'undefined'}`);
                            
                            // Ensure name is never undefined
                            // First try to use the file name directly
                            // If that's undefined, try to extract it from relativePath
                            // If both are undefined, use a unique identifier to avoid duplicate files
                            const fileName = file.name ||
                                (file.relativePath ? path.basename(file.relativePath) : null) ||
                                `unknown-file-${Math.random().toString(36).substring(2, 10)}`;
                            
                            // Log the file name resolution for debugging
                            logger.info(`📂 File name resolution for project ${projectCaseInsensitive.name}: name=${file.name}, relativePath=${file.relativePath}, resolved=${fileName}`);
                            
                            return {
                                name: fileName,
                                relativePath: file.relativePath || fileName,
                                project: {
                                    name: projectCaseInsensitive.name,
                                    type: projectCaseInsensitive.type,
                                    path: projectCaseInsensitive.path,
                                    guid: projectCaseInsensitive.guid,
                                    filename: projectCaseInsensitive.filename
                                }
                            };
                        });
                        
                        logger.info(`📂 Returning ${files.length} files for project ${projectCaseInsensitive.name} (case-insensitive match)`);
                        return { files };
                    }
                    
                    return { files: [] };
                }
                
                // Add detailed logging about the project's source files
                logger.info(`📂 Project ${project.name} has ${project.sourceFiles ? project.sourceFiles.length : 0} source files`);
                
                if (!project.sourceFiles || project.sourceFiles.length === 0) {
                    logger.warn(`⚠️ Project ${project.name} has no source files`);
                    
                    // Log additional project details for debugging
                    logger.info(`📂 Project details: path=${project.path}, filename=${project.filename}`);
                    
                    // Check if the project file exists
                    const projectFilePath = path.join(project.path, project.filename);
                    try {
                        const exists = fs.existsSync(projectFilePath);
                        logger.info(`📂 Project file ${projectFilePath} exists: ${exists}`);
                        
                        if (exists) {
                            // Try to read the project file content
                            try {
                                const content = fs.readFileSync(projectFilePath, 'utf-8');
                                logger.info(`📂 Project file content length: ${content.length} bytes`);
                                
                                // Count the number of source file entries in the project file
                                const sourceFileCount = (content.match(/<Compile Include/g) || []).length;
                                logger.info(`📂 Found ${sourceFileCount} <Compile Include> entries in project file`);
                            } catch (readError) {
                                logger.error(`❌ Error reading project file: ${readError instanceof Error ? readError.message : String(readError)}`);
                            }
                        }
                    } catch (error) {
                        logger.error(`❌ Error checking project file: ${error instanceof Error ? error.message : String(error)}`);
                    }
                }
                
                // Filter the source files to only include Compile Include entries
                // This ensures we only show source code files in the tree view
                const sourceFiles = (project.sourceFiles || []).filter(file => {
                    // We only want to include actual source files (from Compile Include entries)
                    // We can identify these by checking if they have a .clw or other source file extension
                    if (!file || !file.name) {
                        return false;
                    }
                    
                    const ext = path.extname(file.name).toLowerCase();
                    // Include only source code files with relevant extensions
                    return ['.clw', '.inc', '.txa', '.tpl', '.tpw', '.trn', '.clw', '.txa'].includes(ext);
                });
                
                logger.info(`📂 Filtered source files for project ${project.name}: ${sourceFiles.length} out of ${(project.sourceFiles || []).length} total files`);
                
                // Return only the filtered source files for the project
                const files = sourceFiles.map(file => {
                    if (!file) {
                        logger.warn(`⚠️ Found null or undefined source file in project ${project.name}`);
                        return {
                            name: "unknown",
                            relativePath: "",
                            project: {
                                name: project.name,
                                type: project.type,
                                path: project.path,
                                guid: project.guid,
                                filename: project.filename
                            }
                        };
                    }
                    // Log the file details for debugging
                    logger.info(`📂 Processing file: name=${file.name || 'undefined'}, relativePath=${file.relativePath || 'undefined'}`);
                    
                    // Ensure name is never undefined
                    // First try to use the file name directly
                    // If that's undefined, try to extract it from relativePath
                    // If both are undefined, use a unique identifier to avoid duplicate files
                    const fileName = file.name ||
                        (file.relativePath ? path.basename(file.relativePath) : null) ||
                        `unknown-file-${Math.random().toString(36).substring(2, 10)}`;
                    
                    // Log the file name resolution for debugging
                    logger.info(`📂 File name resolution for project ${project.name}: name=${file.name}, relativePath=${file.relativePath}, resolved=${fileName}`);
                    
                    return {
                        name: fileName,
                        relativePath: file.relativePath || fileName,
                        project: {
                            name: project.name,
                            type: project.type,
                            path: project.path,
                            guid: project.guid,
                            filename: project.filename
                        }
                    };
                });
                
                logger.info(`📂 Returning ${files.length} files for project ${project.name}`);
                return { files };
            } finally {
                // Reset the solution operation flag when done
                (global as any).solutionOperationInProgress = false;
            }
        });
        
        // Add a new handler for clearing the solution cache
        connection.onRequest('clarion/clearSolutionCache', (params: { solutionPath?: string }) => {
            try {
                // Set the solution operation flag to true
                (global as any).solutionOperationInProgress = true;
                
                if (params.solutionPath) {
                    logger.info(`🔄 Clearing cache for solution: ${params.solutionPath}`);
                    SolutionManager.clearCache(params.solutionPath);
                    return { success: true, message: `Cache cleared for ${params.solutionPath}` };
                } else {
                    logger.info(`🔄 Clearing all solution caches`);
                    SolutionManager.clearAllCaches();
                    return { success: true, message: 'All solution caches cleared' };
                }
            } finally {
                // Reset the solution operation flag when done
                (global as any).solutionOperationInProgress = false;
            }
        });
    }

    public getSolutionTree() {
        const startTime = performance.now();
        logger.info(`🕒 Starting getSolutionTree`);
        
        if (!this.solution) {
            logger.warn("⚠️ No solution object available to return");
            return {
                name: "No Solution",
                path: "",
                projects: []
            };
        }
        
        if (!this.solution.projects) {
            logger.warn("⚠️ Solution exists but projects array is undefined");
            return {
                name: this.solution.name || "Invalid Solution",
                path: this.solutionFilePath || "",
                projects: []
            };
        }
        
        if (!Array.isArray(this.solution.projects)) {
            logger.warn(`⚠️ Solution projects is not an array: ${typeof this.solution.projects}`);
            return {
                name: this.solution.name || "Invalid Solution",
                path: this.solutionFilePath || "",
                projects: []
            };
        }
        
        try {
            logger.info(`📂 Building solution tree with ${this.solution.projects.length} projects`);
            
            // Validate each project before mapping
            const validProjects = this.solution.projects.filter(project => {
                if (!project) {
                    logger.warn("⚠️ Found null or undefined project in solution");
                    return false;
                }
                if (!project.sourceFiles) {
                    logger.warn(`⚠️ Project ${project.name || 'unnamed'} has no sourceFiles array`);
                    return true; // Still include it, but with empty sourceFiles
                }
                return true;
            });
            
            logger.info(`📂 Found ${validProjects.length} valid projects out of ${this.solution.projects.length} total`);
            
            // Create a lightweight solution tree with minimal information
            // This speeds up the initial tree rendering
            const result = {
                name: this.solution.name,
                path: this.solutionFilePath,
                projects: validProjects.map(project => {
                    // For the initial tree, only include basic project info and source file count
                    return {
                        name: project.name,
                        type: project.type,
                        path: project.path,
                        guid: project.guid,
                        filename: project.filename,
                        // Include counts but not full details for initial load
                        fileDriversCount: project.fileDrivers?.length || 0,
                        librariesCount: project.libraries?.length || 0,
                        projectReferencesCount: project.projectReferences?.length || 0,
                        noneFilesCount: project.noneFiles?.length || 0,
                        sourceFilesCount: project.sourceFiles?.length || 0,
                        // Include empty arrays for these collections - they'll be populated on demand
                        fileDrivers: [],
                        libraries: [],
                        projectReferences: [],
                        noneFiles: [],
                        sourceFiles: []
                    };
                })
            };
            
            const endTime = performance.now();
            logger.info(`🕒 getSolutionTree completed in ${(endTime - startTime).toFixed(2)}ms`);
            
            return result;
        } catch (error) {
            logger.error(`Error creating solution tree: ${error instanceof Error ? error.message : String(error)}`);
            return {
                name: "Error",
                path: this.solutionFilePath || "",
                projects: []
            };
        }
    }
    
    /**
     * Loads the solution from in-memory cache if available and valid
     * @returns True if the solution was loaded from cache, false otherwise
     */
    private async loadFromCache(): Promise<boolean> {
        try {
            // Check if we have a cache entry for this solution file
            if (!SolutionManager.inMemoryCache.has(this.solutionFilePath)) {
                logger.info(`📂 No in-memory cache found for: ${this.solutionFilePath}`);
                return false;
            }
            
            // Get the cached data
            const cache = SolutionManager.inMemoryCache.get(this.solutionFilePath)!;
            
            // Check cache version
            if (cache.version !== SolutionManager.CACHE_VERSION) {
                logger.info(`📂 Cache version mismatch (${cache.version} vs ${SolutionManager.CACHE_VERSION})`);
                return false;
            }
            
            // Check if cache is still valid
            try {
                const solutionStat = await fs.promises.stat(this.solutionFilePath);
                if (cache.timestamp < solutionStat.mtimeMs) {
                    logger.info(`📂 Cache is outdated (${new Date(cache.timestamp).toISOString()} vs ${new Date(solutionStat.mtimeMs).toISOString()})`);
                    return false;
                }
                
                // Check if any project files have changed
                for (const project of cache.solution.projects) {
                    const projectFile = path.join(project.path, `${project.name}.cwproj`);
                    try {
                        const projectStat = await fs.promises.stat(projectFile);
                        if (cache.timestamp < projectStat.mtimeMs) {
                            logger.info(`📂 Project file ${projectFile} has changed since cache was created`);
                            return false;
                        }
                    } catch {
                        logger.info(`📂 Project file ${projectFile} not found`);
                        return false;
                    }
                }
                
                // Cache is valid, use it
                logger.info(`✅ Using solution from in-memory cache`);
                this.solution = cache.solution;
                return true;
            } catch (error) {
                logger.error(`❌ Error checking file timestamps: ${error instanceof Error ? error.message : String(error)}`);
                return false;
            }
        } catch (error) {
            logger.error(`❌ Error loading from in-memory cache: ${error instanceof Error ? error.message : String(error)}`);
            return false;
        }
    }
    
    /**
     * Saves the solution to in-memory cache
     */
    private async saveToCache(): Promise<void> {
        try {
            const cache = {
                version: SolutionManager.CACHE_VERSION,
                timestamp: Date.now(),
                solution: this.solution
            };
            
            // Store in the static in-memory cache
            SolutionManager.inMemoryCache.set(this.solutionFilePath, cache);
            logger.info(`✅ Saved solution to in-memory cache`);
        } catch (error) {
            logger.error(`❌ Error saving to in-memory cache: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    
    /**
     * Gets detailed information for a specific project
     * This implements lazy loading of project details
     */
    public getProjectDetails(projectGuid: string) {
        try {
            // Normalize the requested GUID by removing curly braces
            const normalizedRequestGuid = projectGuid.replace(/[{}]/g, '');
            logger.info(`📂 Normalized requested GUID for project details: ${normalizedRequestGuid}`);
            
            // First try exact match with normalized GUIDs
            const project = this.solution.projects.find(p =>
                p.guid.replace(/[{}]/g, '') === normalizedRequestGuid
            );
            
            if (!project) {
                logger.warn(`⚠️ Project with GUID ${projectGuid} not found`);
                
                // Try a case-insensitive search as a fallback
                const projectCaseInsensitive = this.solution.projects.find(p =>
                    p.guid.replace(/[{}]/g, '').toLowerCase() === normalizedRequestGuid.toLowerCase()
                );
                
                if (projectCaseInsensitive) {
                    logger.info(`✅ Found project with normalized case-insensitive GUID match: ${projectCaseInsensitive.name} (${projectCaseInsensitive.guid})`);
                    
                    // Return the project details for the case-insensitive match
                    return {
                        name: projectCaseInsensitive.name,
                        type: projectCaseInsensitive.type,
                        path: projectCaseInsensitive.path,
                        guid: projectCaseInsensitive.guid,
                        filename: projectCaseInsensitive.filename,
                        // Include the full project information
                        fileDrivers: projectCaseInsensitive.fileDrivers || [],
                        libraries: projectCaseInsensitive.libraries || [],
                        projectReferences: projectCaseInsensitive.projectReferences || [],
                        noneFiles: projectCaseInsensitive.noneFiles || [],
                        sourceFiles: (projectCaseInsensitive.sourceFiles || [])
                            // Filter to only include source code files
                            .filter(file => {
                                if (!file || !file.name) {
                                    return false;
                                }
                                const ext = path.extname(file.name).toLowerCase();
                                return ['.clw', '.inc', '.txa', '.tpl', '.tpw', '.trn', '.clw', '.txa'].includes(ext);
                            })
                            .map(file => {
                                if (!file) {
                                    logger.warn(`⚠️ Found null or undefined source file in project ${projectCaseInsensitive.name}`);
                                    return {
                                        name: "unknown",
                                        relativePath: "",
                                        project: {
                                            name: projectCaseInsensitive.name,
                                            type: projectCaseInsensitive.type,
                                            path: projectCaseInsensitive.path,
                                            guid: projectCaseInsensitive.guid,
                                            filename: projectCaseInsensitive.filename
                                        }
                                    };
                                }
                                // Log the file details for debugging
                                logger.info(`📂 Processing file for project details: name=${file.name || 'undefined'}, relativePath=${file.relativePath || 'undefined'}`);
                                
                                // Ensure name is never undefined
                                const fileName = file.name || path.basename(file.relativePath || "unknown-file");
                                
                                return {
                                    name: fileName,
                                    relativePath: file.relativePath || fileName,
                                    project: {
                                        name: projectCaseInsensitive.name,
                                        type: projectCaseInsensitive.type,
                                        path: projectCaseInsensitive.path,
                                        guid: projectCaseInsensitive.guid,
                                        filename: projectCaseInsensitive.filename
                                    }
                                };
                            })
                    };
                }
                
                return null;
            }
            
            logger.info(`📂 Getting detailed information for project ${project.name}`);
            
            return {
                name: project.name,
                type: project.type,
                path: project.path,
                guid: project.guid,
                filename: project.filename,
                // Include the full project information
                fileDrivers: project.fileDrivers || [],
                libraries: project.libraries || [],
                projectReferences: project.projectReferences || [],
                noneFiles: project.noneFiles || [],
                sourceFiles: (project.sourceFiles || [])
                    // Filter to only include source code files
                    .filter(file => {
                        if (!file || !file.name) {
                            return false;
                        }
                        const ext = path.extname(file.name).toLowerCase();
                        return ['.clw', '.inc', '.txa', '.tpl', '.tpw', '.trn', '.clw', '.txa'].includes(ext);
                    })
                    .map(file => {
                        if (!file) {
                            logger.warn(`⚠️ Found null or undefined source file in project ${project.name}`);
                            return {
                                name: "unknown",
                                relativePath: "",
                                project: {
                                    name: project.name,
                                    type: project.type,
                                    path: project.path,
                                    guid: project.guid,
                                    filename: project.filename
                                }
                            };
                        }
                        // Log the file details for debugging
                        logger.info(`📂 Processing file: name=${file.name || 'undefined'}, relativePath=${file.relativePath || 'undefined'}`);
                        
                        // Ensure name is never undefined
                        const fileName = file.name || path.basename(file.relativePath || "unknown-file");
                        
                        return {
                            name: fileName,
                            relativePath: file.relativePath || fileName,
                            project: {
                                name: project.name,
                                type: project.type,
                                path: project.path,
                                guid: project.guid,
                                filename: project.filename
                            }
                        };
                    })
            };
        } catch (error) {
            logger.error(`Error getting project details: ${error instanceof Error ? error.message : String(error)}`);
            return null;
        }
    }
}
