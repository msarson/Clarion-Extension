import { Connection } from 'vscode-languageserver';
import { ClarionSolutionInfo } from 'common/types';
import { SolutionManager } from '../solution/solutionManager';
import { buildClarionSolution } from '../solution/buildClarionSolution';
import { RedirectionFileParserServer } from '../solution/redirectionFileParserServer';
import { serverSettings } from '../serverSettings';
import LoggerManager from '../logger';
import * as path from 'path';

const logger = LoggerManager.getLogger("RequestHandler");
logger.setLevel("error");

// Track if a solution operation is in progress
let solutionOperationInProgress = false;

// Make solutionOperationInProgress accessible globally
(global as any).solutionOperationInProgress = false;

// Global solution cache
let globalSolution: ClarionSolutionInfo | null = null;

/**
 * Handles client requests
 */
export class RequestHandler {
    /**
     * Register all request handlers
     * @param connection The connection
     */
    public registerRequestHandlers(connection: Connection): void {
        this.registerSolutionTreeHandler(connection);
        this.registerFindFileHandler(connection);
        this.registerSearchPathsHandler(connection);
        this.registerSourceFileHandlers(connection);
        this.registerRedirectionFilesHandler(connection);
        this.registerPathsNotificationHandler(connection);
    }

    /**
     * Register the solution tree handler
     * @param connection The connection
     */
    private registerSolutionTreeHandler(connection: Connection): void {
        connection.onRequest('clarion/getSolutionTree', async (): Promise<ClarionSolutionInfo> => {
            logger.info("📂 Received request for solution tree");
            
            try {
                // First try to get the solution from the SolutionManager
                const solutionManager = SolutionManager.getInstance();
                if (solutionManager) {
                    try {
                        logger.info(`🔍 SolutionManager instance found, getting solution tree...`);
                        const solutionTree = solutionManager.getSolutionTree();
                        
                        if (solutionTree && solutionTree.projects && solutionTree.projects.length > 0) {
                            logger.info(`✅ Returning solution tree from SolutionManager with ${solutionTree.projects.length} projects`);
                            logger.info(`🔹 Solution name: ${solutionTree.name}`);
                            logger.info(`🔹 Solution path: ${solutionTree.path}`);
                            solutionTree.projects.forEach(project => {
                                logger.info(`🔹 Project: ${project.name} with ${project.sourceFiles?.length || 0} source files`);
                            });
                            return solutionTree;
                        } else {
                            logger.warn(`⚠️ SolutionManager returned empty or invalid solution tree`);
                        }
                    } catch (error) {
                        logger.error(`❌ Error getting solution tree from SolutionManager: ${error instanceof Error ? error.message : String(error)}`);
                        // Fall through to use globalSolution
                    }
                } else {
                    logger.warn(`⚠️ No SolutionManager instance available`);
                }
                
                // Fall back to the cached globalSolution
                if (globalSolution && globalSolution.projects && globalSolution.projects.length > 0) {
                    logger.info(`✅ Returning cached solution with ${globalSolution.projects.length} projects`);
                    logger.info(`🔹 Solution name: ${globalSolution.name}`);
                    logger.info(`🔹 Solution path: ${globalSolution.path}`);
                    return globalSolution;
                } else if (globalSolution) {
                    logger.warn(`⚠️ Global solution exists but has no projects`);
                } else {
                    logger.warn(`⚠️ No global solution available`);
                }
                
                // If all else fails, return an empty solution
                logger.warn("⚠️ No solution available to return, creating empty solution");
                return {
                    name: "No Solution",
                    path: "",
                    projects: []
                };
            } catch (error) {
                logger.error(`❌ Unexpected error in getSolutionTree: ${error instanceof Error ? error.message : String(error)}`);
                return {
                    name: "Error",
                    path: "",
                    projects: []
                };
            }
        });
    }

    /**
     * Register the find file handler
     * @param connection The connection
     */
    private registerFindFileHandler(connection: Connection): void {
        connection.onRequest('clarion/findFile', (params: { filename: string }): { path: string, source: string } => {
            logger.info(`🔍 Received request to find file: ${params.filename}`);
            
            try {
                const solutionManager = SolutionManager.getInstance();
                if (solutionManager) {
                    const result = solutionManager.findFileWithExtension(params.filename);
                    if (result && result.path) {
                        logger.info(`✅ Found file: ${result.path} (source: ${result.source})`);
                        return result;
                    } else {
                        // If no extension is provided, try with default lookup extensions
                        if (!path.extname(params.filename)) {
                            for (const ext of serverSettings.defaultLookupExtensions) {
                                const filenameWithExt = `${params.filename}${ext}`;
                                const resultWithExt = solutionManager.findFileWithExtension(filenameWithExt);
                                if (resultWithExt && resultWithExt.path) {
                                    logger.info(`✅ Found file with added extension: ${resultWithExt.path} (source: ${resultWithExt.source})`);
                                    return resultWithExt;
                                }
                            }
                        }
                        logger.warn(`⚠️ File not found: ${params.filename}`);
                    }
                } else {
                    logger.warn(`⚠️ No SolutionManager instance available to find file: ${params.filename}`);
                }
            } catch (error) {
                logger.error(`❌ Error finding file ${params.filename}: ${error instanceof Error ? error.message : String(error)}`);
            }
            
            return { path: "", source: "" };
        });
    }

    /**
     * Register the search paths handler
     * @param connection The connection
     */
    private registerSearchPathsHandler(connection: Connection): void {
        connection.onRequest('clarion/getSearchPaths', (params: { projectName: string, extension: string }): string[] => {
            logger.info(`🔍 Received request for search paths for project ${params.projectName} and extension ${params.extension}`);
            
            try {
                const solutionManager = SolutionManager.getInstance();
                if (solutionManager) {
                    // Find the project by name
                    const project = solutionManager.solution.projects.find(p => p.name === params.projectName);
                    
                    if (project) {
                        // Get search paths for the extension
                        const searchPaths = project.getSearchPaths(params.extension);
                        logger.info(`✅ Found ${searchPaths.length} search paths for ${params.projectName} and ${params.extension}`);
                        return searchPaths;
                    } else {
                        logger.warn(`⚠️ Project not found: ${params.projectName}`);
                    }
                } else {
                    logger.warn(`⚠️ No SolutionManager instance available to get search paths`);
                }
            } catch (error) {
                logger.error(`❌ Error getting search paths for ${params.projectName} and ${params.extension}: ${error instanceof Error ? error.message : String(error)}`);
            }
            
            return [];
        });
    }

    /**
     * Register source file handlers
     * @param connection The connection
     */
    private registerSourceFileHandlers(connection: Connection): void {
        // Add a handler for removing a source file from a project
        connection.onRequest('clarion/removeSourceFile', async (params: { projectGuid: string, fileName: string }): Promise<boolean> => {
            logger.info(`🔄 Received request to remove source file ${params.fileName} from project with GUID ${params.projectGuid}`);
            
            try {
                const solutionManager = SolutionManager.getInstance();
                if (!solutionManager) {
                    logger.warn(`⚠️ No SolutionManager instance available to remove source file`);
                    return false;
                }
                
                // Find the project by GUID
                const project = solutionManager.solution.projects.find(p => p.guid === params.projectGuid);
                if (!project) {
                    logger.warn(`⚠️ Project with GUID ${params.projectGuid} not found`);
                    return false;
                }
                
                // Remove the source file from the project
                const result = await project.removeSourceFile(params.fileName);
                if (result) {
                    logger.info(`✅ Successfully removed source file ${params.fileName} from project ${project.name}`);
                    
                    // Rebuild the solution to reflect the changes
                    try {
                        globalSolution = await buildClarionSolution();
                        logger.info(`✅ Solution rebuilt successfully after removing source file`);
                    } catch (buildError: any) {
                        logger.error(`❌ Error rebuilding solution after removing source file: ${buildError.message || buildError}`);
                    }
                } else {
                    logger.warn(`⚠️ Failed to remove source file ${params.fileName} from project ${project.name}`);
                }
                
                return result;
            } catch (error) {
                logger.error(`❌ Error removing source file: ${error instanceof Error ? error.message : String(error)}`);
                return false;
            }
        });

        // Add a handler for adding a new source file to a project
        connection.onRequest('clarion/addSourceFile', async (params: { projectGuid: string, fileName: string }): Promise<boolean> => {
            logger.info(`🔄 Received request to add source file ${params.fileName} to project with GUID ${params.projectGuid}`);
            
            try {
                const solutionManager = SolutionManager.getInstance();
                if (!solutionManager) {
                    logger.warn(`⚠️ No SolutionManager instance available to add source file`);
                    return false;
                }
                
                // Find the project by GUID
                const project = solutionManager.solution.projects.find(p => p.guid === params.projectGuid);
                if (!project) {
                    logger.warn(`⚠️ Project with GUID ${params.projectGuid} not found`);
                    return false;
                }
                
                // Add the source file to the project
                const result = await project.addSourceFile(params.fileName);
                if (result) {
                    logger.info(`✅ Successfully added source file ${params.fileName} to project ${project.name}`);
                    
                    // Rebuild the solution to reflect the changes
                    try {
                        globalSolution = await buildClarionSolution();
                        logger.info(`✅ Solution rebuilt successfully after adding source file`);
                    } catch (buildError: any) {
                        logger.error(`❌ Error rebuilding solution after adding source file: ${buildError.message || buildError}`);
                    }
                } else {
                    logger.warn(`⚠️ Failed to add source file ${params.fileName} to project ${project.name}`);
                }
                
                return result;
            } catch (error) {
                logger.error(`❌ Error adding source file: ${error instanceof Error ? error.message : String(error)}`);
                return false;
            }
        });
    }

    /**
     * Register the redirection files handler
     * @param connection The connection
     */
    private registerRedirectionFilesHandler(connection: Connection): void {
        connection.onRequest('clarion/getIncludedRedirectionFiles', (params: { projectPath: string }): string[] => {
            logger.info(`🔍 Received request for included redirection files for project at ${params.projectPath}`);
            
            try {
                const redParser = new RedirectionFileParserServer();
                const redirectionEntries = redParser.parseRedFile(params.projectPath);
                
                // Extract all unique redirection files
                const redFiles = new Set<string>();
                for (const entry of redirectionEntries) {
                    redFiles.add(entry.redFile);
                }
                
                const result = Array.from(redFiles);
                logger.info(`✅ Found ${result.length} redirection files for project at ${params.projectPath}`);
                return result;
            } catch (error) {
                logger.error(`❌ Error getting included redirection files for ${params.projectPath}: ${error instanceof Error ? error.message : String(error)}`);
            }
            
            return [];
        });
    }

    /**
     * Register the paths notification handler
     * @param connection The connection
     */
    private registerPathsNotificationHandler(connection: Connection): void {
        connection.onNotification('clarion/updatePaths', async (params: {
            redirectionPaths: string[];
            projectPaths: string[];
            configuration: string;
            clarionVersion: string;
            redirectionFile: string;
            macros: Record<string, string>;
            libsrcPaths: string[];
            solutionFilePath?: string;
            defaultLookupExtensions?: string[];
        }) => {
            try {
                // Set solution operation in progress flag
                solutionOperationInProgress = true;
                (global as any).solutionOperationInProgress = true;

                // Update server settings
                serverSettings.redirectionPaths = params.redirectionPaths || [];
                serverSettings.projectPaths = params.projectPaths || [];
                serverSettings.configuration = params.configuration || "Debug";
                serverSettings.clarionVersion = params.clarionVersion || "";
                serverSettings.macros = params.macros || {};
                serverSettings.libsrcPaths = params.libsrcPaths || [];
                serverSettings.redirectionFile = params.redirectionFile || "";
                serverSettings.solutionFilePath = params.solutionFilePath || "";
                
                // Update default lookup extensions if provided
                if (params.defaultLookupExtensions && params.defaultLookupExtensions.length > 0) {
                    serverSettings.defaultLookupExtensions = params.defaultLookupExtensions;
                    logger.info(`✅ Updated default lookup extensions: ${params.defaultLookupExtensions.join(', ')}`);
                }

                // Log the solution file path
                if (params.solutionFilePath) {
                    logger.info(`🔍 Received solution file path: ${params.solutionFilePath}`);
                } else {
                    logger.warn("⚠️ No solution file path provided in updatePaths notification");
                }

                // Import solution-related modules
                const { initializeSolutionManager } = require('../solution/buildClarionSolution');

                // Initialize the solution manager before building the solution
                const solutionPath = params.projectPaths?.[0];
                if (!solutionPath) {
                    logger.error("❌ No projectPaths provided. Cannot initialize SolutionManager.");
                    return;
                }

                // Register handlers for the solution manager first, so they're available even if initialization fails
                const existingSolutionManager = SolutionManager.getInstance();
                if (existingSolutionManager) {
                    existingSolutionManager.registerHandlers(connection);
                    logger.info("✅ SolutionManager handlers registered from existing instance");
                }

                // Initialize the solution manager
                logger.info(`🔄 Initializing solution manager with path: ${solutionPath}`);
                try {
                    await initializeSolutionManager(solutionPath);
                    logger.info(`✅ Solution manager initialized successfully`);
                    
                    // Log the solution manager state
                    const solutionManager = SolutionManager.getInstance();
                    if (solutionManager) {
                        logger.info(`📊 Solution manager state:`);
                        logger.info(`  - Solution file path: ${solutionManager.solutionFilePath}`);
                        logger.info(`  - Solution name: ${solutionManager.solution.name}`);
                        logger.info(`  - Projects count: ${solutionManager.solution.projects.length}`);
                    } else {
                        logger.warn(`⚠️ Solution manager is null after initialization`);
                    }
                } catch (error) {
                    logger.error(`❌ Error initializing solution manager: ${error instanceof Error ? error.message : String(error)}`);
                }
                
                // Register handlers again if we have a new instance
                const solutionManager = SolutionManager.getInstance();
                if (solutionManager && solutionManager !== existingSolutionManager) {
                    solutionManager.registerHandlers(connection);
                    logger.info("✅ SolutionManager handlers registered from new instance");
                }
                
                // Build the solution after registering handlers
                try {
                    logger.info(`🔄 Building solution...`);
                    globalSolution = await buildClarionSolution();
                    logger.info(`✅ Solution built successfully with ${globalSolution.projects.length} projects`);
                } catch (buildError: any) {
                    logger.error(`❌ Error building solution: ${buildError.message || buildError}`);
                    // Create a minimal solution info to avoid null references
                    globalSolution = {
                        name: path.basename(solutionPath),
                        path: solutionPath,
                        projects: []
                    };
                }

                logger.info("🔁 Clarion paths updated:");
                logger.info("🔹 Project Paths:", serverSettings.projectPaths);
                logger.info("🔹 Redirection Paths:", serverSettings.redirectionPaths);
                logger.info("🔹 Redirection File:", serverSettings.redirectionFile);
                logger.info("🔹 Macros:", Object.keys(serverSettings.macros).length);
                logger.info("🔹 Clarion Version:", serverSettings.clarionVersion);
                logger.info("🔹 Configuration:", serverSettings.configuration);

            } catch (error: any) {
                logger.error(`❌ Failed to initialize and build solution: ${error.message || error}`);
                // Ensure we have a valid globalSolution even after errors
                if (!globalSolution) {
                    globalSolution = {
                        name: "Error",
                        path: params.projectPaths?.[0] || "",
                        projects: []
                    };
                }
            } finally {
                // Clear solution operation in progress flag
                solutionOperationInProgress = false;
                (global as any).solutionOperationInProgress = false;
            }
        });
    }

    /**
     * Get the global solution
     * @returns The global solution
     */
    public getGlobalSolution(): ClarionSolutionInfo | null {
        return globalSolution;
    }

    /**
     * Set the global solution
     * @param solution The solution
     */
    public setGlobalSolution(solution: ClarionSolutionInfo | null): void {
        globalSolution = solution;
    }

    /**
     * Check if a solution operation is in progress
     * @returns True if a solution operation is in progress
     */
    public isSolutionOperationInProgress(): boolean {
        return solutionOperationInProgress;
    }

    /**
     * Set the solution operation in progress flag
     * @param inProgress Whether a solution operation is in progress
     */
    public setSolutionOperationInProgress(inProgress: boolean): void {
        solutionOperationInProgress = inProgress;
        (global as any).solutionOperationInProgress = inProgress;
    }
}

// Singleton instance
let instance: RequestHandler | undefined;

/**
 * Get the RequestHandler instance
 * @returns The RequestHandler instance
 */
export function getRequestHandler(): RequestHandler {
    if (!instance) {
        instance = new RequestHandler();
    }
    return instance;
}