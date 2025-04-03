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
logger.setLevel("error");

export class SolutionManager {
    public solution: ClarionSolutionServer;
    public solutionFilePath: string;
    private static instance: SolutionManager | null = null;
    private fileCache: Map<string, string> = new Map();

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
        try {
            // Set the solution operation flag to true
            (global as any).solutionOperationInProgress = true;
            
            logger.info(`🔄 Initializing solution from ${this.solutionFilePath}`);
            this.solution = await this.parseSolution();
            logger.info(`✅ Solution initialized with ${this.solution.projects.length} projects`);
        } finally {
            // Reset the solution operation flag when done
            (global as any).solutionOperationInProgress = false;
        }
    }

    private async parseSolution(): Promise<ClarionSolutionServer> {
        try {
            if (!fs.existsSync(this.solutionFilePath)) {
                logger.error(`❌ Solution file not found: ${this.solutionFilePath}`);
                return new ClarionSolutionServer();
            }

            try {
                const content = fs.readFileSync(this.solutionFilePath, 'utf-8');
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

                while ((match = regex.exec(content)) !== null) {
                    try {
                        const [, projectType, projectName, projectPath, projectGuid] = match;
                        if (!projectPath.toLowerCase().endsWith('.cwproj')) continue;

                        logger.info(`📂 Found project: ${projectName} (${projectPath})`);
                        const absoluteProjectDir = path.dirname(path.resolve(this.solutionFilePath, '..', projectPath));
                        const project = new ClarionProjectServer(projectName, projectType, absoluteProjectDir, projectGuid);
                        
                        try {
                            await project.loadSourceFilesFromProjectFile();
                            solution.projects.push(project);
                            logger.info(`✅ Added project ${projectName} with ${project.sourceFiles.length} source files`);
                        } catch (projectError) {
                            logger.error(`❌ Error loading source files for project ${projectName}: ${projectError instanceof Error ? projectError.message : String(projectError)}`);
                            // Still add the project even if loading source files failed
                            solution.projects.push(project);
                        }
                    } catch (matchError) {
                        logger.error(`❌ Error processing project match: ${matchError instanceof Error ? matchError.message : String(matchError)}`);
                    }
                }

                logger.info(`📂 Finished parsing solution file. Found ${solution.projects.length} projects.`);
                for (const project of solution.projects) {
                    logger.info(`📂 Project: ${project.name} (${project.path})`);
                }

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

    public findFileWithExtension(filename: string): { path: string, source: string } {
        // Check cache first
        if (this.fileCache.has(filename)) {
            const cachedPath = this.fileCache.get(filename)!;
            if (fs.existsSync(cachedPath)) {
                logger.info(`✅ Found file in cache: ${cachedPath}`);
                return { path: cachedPath, source: "cache" };
            } else {
                // Remove invalid cache entry
                this.fileCache.delete(filename);
            }
        }
        
        logger.info(`🔍 Searching for file: ${filename}`);
        const ext = path.extname(filename).toLowerCase();
        
        // First try to find the file in project source files
        for (const project of this.solution.projects) {
            const sourceFile = project.sourceFiles.find(sf =>
                sf.name.toLowerCase() === path.basename(filename).toLowerCase()
            );
            
            if (sourceFile && sourceFile.relativePath) {
                const fullPath = path.join(project.path, sourceFile.relativePath);
                if (fs.existsSync(fullPath)) {
                    logger.info(`✅ Found file in project source files: ${fullPath}`);
                    this.fileCache.set(filename, fullPath);
                    return { path: fullPath, source: "project" };
                }
            }
        }
        
        // Then try project search paths from redirection entries
        for (const project of this.solution.projects) {
            logger.info(`🔍 Searching in project: ${project.name}`);
            
            // Try using the redirection parser directly
            const redParser = project.getRedirectionParser();
            const redResult = redParser.findFile(filename);
            if (redResult && redResult.path) {
                logger.info(`✅ Found file through redirection: ${redResult.path}`);
                this.fileCache.set(filename, redResult.path);
                return { path: redResult.path, source: "redirected" };
            }
            
            // Fallback to search paths
            const searchPaths = project.getSearchPaths(ext);
            
            for (const searchPath of searchPaths) {
                const fullPath = path.join(searchPath, filename);
                if (fs.existsSync(fullPath)) {
                    logger.info(`✅ Found file in search path: ${fullPath}`);
                    this.fileCache.set(filename, fullPath);
                    return { path: fullPath, source: "project-search-path" };
                }
            }
        }
        
        logger.warn(`❌ File '${filename}' not found in any project paths.`);
        return { path: '', source: "" };
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
        
        connection.onRequest('clarion/findFile', (params: { filename: string }): { path: string, source: string } => {
            try {
                // Set the solution operation flag to true
                (global as any).solutionOperationInProgress = true;
                
                logger.setLevel("info"); // Temporarily increase log level
                logger.info(`🔍 [DEBUG] Received request to find file: ${params.filename}`);
                
                try {
                    // Log solution state
                    logger.info(`🔍 [DEBUG] Solution state: ${this.solution ? 'exists' : 'null'}`);
                    logger.info(`🔍 [DEBUG] Solution projects: ${this.solution?.projects?.length || 0}`);
                    logger.info(`🔍 [DEBUG] Solution file path: ${this.solutionFilePath}`);
                    
                    const result = this.findFileWithExtension(params.filename);
                    
                    if (result.path) {
                        logger.info(`✅ [DEBUG] Found file: ${result.path} (source: ${result.source})`);
                        logger.info(`✅ [DEBUG] File exists check: ${fs.existsSync(result.path)}`);
                    } else {
                        logger.info(`⚠️ [DEBUG] File not found: ${params.filename}`);
                        
                        // Try a direct path as last resort
                        const solutionDir = path.dirname(this.solutionFilePath);
                        const directPath = path.join(solutionDir, params.filename);
                        if (fs.existsSync(directPath)) {
                            logger.info(`✅ [DEBUG] Found file using direct path: ${directPath}`);
                            return { path: directPath, source: "direct" };
                        }
                    }
                    
                    return result;
                } catch (error) {
                    logger.error(`❌ [DEBUG] Error in findFile request: ${error instanceof Error ? error.message : String(error)}`);
                    logger.error(`❌ [DEBUG] Stack: ${error instanceof Error && error.stack ? error.stack : 'No stack'}`);
                    return { path: '', source: "error" };
                } finally {
                    logger.setLevel("error"); // Reset log level
                }
            } finally {
                // Reset the solution operation flag when done
                (global as any).solutionOperationInProgress = false;
            }
        });
    }

    public getSolutionTree() {
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
            
            return {
                name: this.solution.name,
                path: this.solutionFilePath,
                projects: validProjects.map(project => {
                    logger.info(`Processing project ${project.name} for solution tree`);
                    logger.info(`  File Drivers: ${project.fileDrivers?.length || 0}`);
                    logger.info(`  Libraries: ${project.libraries?.length || 0}`);
                    logger.info(`  Project References: ${project.projectReferences?.length || 0}`);
                    logger.info(`  None Files: ${project.noneFiles?.length || 0}`);
                    
                    return {
                        name: project.name,
                        type: project.type,
                        path: project.path,
                        guid: project.guid,
                        filename: project.filename,
                        // Include the additional project information
                        fileDrivers: project.fileDrivers || [],
                        libraries: project.libraries || [],
                        projectReferences: project.projectReferences || [],
                        noneFiles: project.noneFiles || [],
                        sourceFiles: (project.sourceFiles || []).map(file => {
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
                            return {
                                name: file.name,
                                relativePath: file.relativePath,
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
                })
            };
        } catch (error) {
            logger.error(`Error creating solution tree: ${error instanceof Error ? error.message : String(error)}`);
            return {
                name: "Error",
                path: this.solutionFilePath || "",
                projects: []
            };
        }
    }
}
