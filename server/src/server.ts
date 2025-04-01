import {
    createConnection,
    TextDocuments,
    ProposedFeatures
} from 'vscode-languageserver/node';

// Add global error handlers to prevent crashes
process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    // Don't exit the process
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    // Don't exit the process
});

import {
    DocumentFormattingParams,
    DocumentSymbolParams,
    FoldingRangeParams,
    InitializeParams,
    InitializeResult,
    TextEdit,
    Range,
    Position,
    DocumentColorParams,
    ColorInformation,
    ColorPresentationParams,
    ColorPresentation
} from 'vscode-languageserver-protocol';

import { TextDocument } from 'vscode-languageserver-textdocument';

import { ClarionDocumentSymbolProvider } from './ClarionDocumentSymbolProvider';

import { ClarionTokenizer, Token } from './ClarionTokenizer';

import LoggerManager from './logger';
import ClarionFormatter from './ClarionFormatter';

import { ClarionColorResolver } from './ClarionColorResolver';
import ClarionFoldingProvider from './ClarionFoldingProvider';
import { serverSettings } from './serverSettings';

import { ClarionSolutionServer } from './solution/clarionSolutionServer';
import { buildClarionSolution, initializeSolutionManager } from './solution/buildClarionSolution';
import { SolutionManager } from './solution/solutionManager';
import { RedirectionFileParserServer } from './solution/redirectionFileParserServer';
import path = require('path');
import { ClarionSolutionInfo } from 'common/types';
const logger = LoggerManager.getLogger("Server");
logger.setLevel("info");
// ✅ Initialize Providers

const clarionDocumentSymbolProvider = new ClarionDocumentSymbolProvider();

// ✅ Create Connection and Documents Manager
const connection = createConnection(ProposedFeatures.all);
const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);
let globalSolution: ClarionSolutionInfo | null = null;

// ✅ Global Token Cache
interface CachedTokenData {
    version: number;
    tokens: Token[];
}

const tokenCache = new Map<string, CachedTokenData>();

export let globalClarionSettings: any = {};

// ✅ Token Cache for Performance



let debounceTimeout: NodeJS.Timeout | null = null;
/**
 * ✅ Retrieves cached tokens or tokenizes the document if not cached.
 */
const parsedDocuments = new Map<string, boolean>(); // Track parsed state per document

function getTokens(document: TextDocument): Token[] {
    const cached = tokenCache.get(document.uri);
    if (cached && cached.version === document.version) {
        logger.info(`🟢 Using cached tokens for ${document.uri} (version ${document.version})`);
        return cached.tokens;
    }

    logger.info(`🟢 Running tokenizer for ${document.uri} (version ${document.version})`);
    const tokenizer = new ClarionTokenizer(document.getText());
    const tokens = tokenizer.tokenize();
    tokenCache.set(document.uri, { version: document.version, tokens });
    return tokens;
}




// ✅ Handle Folding Ranges (Uses Cached Tokens & Caches Results)
connection.onFoldingRanges((params: FoldingRangeParams) => {
    const document = documents.get(params.textDocument.uri);
    if (!document) return [];

    if (!serverInitialized) {
        logger.info(`⚠️  [DELAY] Server not initialized yet, delaying folding range request for ${params.textDocument.uri}`);
        return [];
    }

    logger.info(`📂  Computing fresh folding ranges for: ${params.textDocument.uri}`);

    const tokens = getTokens(document);
    const foldingProvider = new ClarionFoldingProvider(tokens);
    return foldingProvider.computeFoldingRanges();
});



// ✅ Handle Content Changes (Recompute Tokens)
documents.onDidChangeContent(event => {
    const document = event.document;

    tokenCache.delete(document.uri); // 🔥 Always delete immediately

    if (debounceTimeout) clearTimeout(debounceTimeout);

    debounceTimeout = setTimeout(() => {
        logger.info(`[REFRESH] Re-parsing tokens after edit: ${document.uri}`);
        getTokens(document); // ⬅️ refreshes the cache
    }, 300);
});



// ✅ Handle Document Formatting (Uses Cached Tokens & Caches Results)
connection.onDocumentFormatting((params: DocumentFormattingParams): TextEdit[] => {
    logger.info(`📐 Received onDocumentFormatting request for: ${params.textDocument.uri}`);
    const document = documents.get(params.textDocument.uri);
    if (!document) return [];

    const text = document.getText();
    try {
        // ✅ Use getTokens() instead of manually tokenizing
        const tokens = getTokens(document);

        const formatter = new ClarionFormatter(tokens, text, {
            formattingOptions: params.options
        });

        const formattedText = formatter.format();
        if (formattedText !== text) {
            return [TextEdit.replace(
                Range.create(Position.create(0, 0), Position.create(document.lineCount, 0)),
                formattedText
            )];
        }
        return [];
    } catch (error) {
        logger.error(`❌ Error formatting document: ${error}`);
        return [];
    }
});


connection.onDocumentSymbol((params: DocumentSymbolParams) => {
    logger.info(`📂  Received onDocumentSymbol request for: ${params.textDocument.uri}`);
    const document = documents.get(params.textDocument.uri);
    if (!document) return [];

    if (!serverInitialized) {
        logger.info(`⚠️  [DELAY] Server not initialized yet, delaying document symbol request for ${document.uri}`);
        return [];
    }

    logger.info(`📂  Computing fresh document symbols for: ${document.uri}`);
    const tokens = getTokens(document);  // ✅ No need for async
    const symbols = clarionDocumentSymbolProvider.provideDocumentSymbols(tokens, document.uri);
    logger.info(`🧩 Returned ${symbols.length} document symbols`);

    logger.info(`✅ Finished processing tokens. ${symbols.length} top-level symbols`);

   
    return symbols;

});


connection.onDocumentColor((params: DocumentColorParams): ColorInformation[] => {
    const document = documents.get(params.textDocument.uri);
    if (!document) return [];

    const tokens = getTokens(document);
    return ClarionColorResolver.provideDocumentColors(tokens, document);
});

connection.onColorPresentation((params: ColorPresentationParams): ColorPresentation[] => {
    const { color, range } = params;
    return ClarionColorResolver.provideColorPresentations(color, range);
});




// ✅ Handle Save (Ensure Cached Tokens Are Up-To-Date)
documents.onDidSave(event => {
    const document = event.document;

    logger.info(`💾 [SAVE] Document saved: ${document.uri}, ensuring tokens are fresh...`);

    // ✅ Refresh token cache after save
    getTokens(document);
});

// ✅ Clear Cache When Document Closes
// ✅ Clear Cache When Document Closes
documents.onDidClose(event => {
    logger.info(`🗑️  [CACHE CLEAR] Removing cached data for ${event.document.uri}`);

    // ✅ Remove tokens from both caches to free memory
    tokenCache.delete(event.document.uri);
});


connection.onNotification('clarion/updatePaths', async (params: {
    redirectionPaths: string[];
    projectPaths: string[];
    configuration: string;
    clarionVersion: string;
    redirectionFile: string;
    macros: Record<string, string>;
    libsrcPaths: string[];
    solutionFile?: string; // Add optional solutionFile parameter
}) => {
    try {
        // Update server settings
        serverSettings.redirectionPaths = params.redirectionPaths || [];
        serverSettings.projectPaths = params.projectPaths || [];
        serverSettings.configuration = params.configuration || "Debug";
        serverSettings.clarionVersion = params.clarionVersion || "";
        serverSettings.macros = params.macros || {};
        serverSettings.libsrcPaths = params.libsrcPaths || [];
        serverSettings.redirectionFile = params.redirectionFile || "";

        // ✅ Initialize the solution manager with the specific solution file
        if (!params.solutionFile) {
            logger.error("❌ No solution file provided. Cannot initialize SolutionManager.");
            return;
        }
        
        logger.info(`🔄 Using solution file: ${params.solutionFile}`);
        
        // Initialize the solution manager with the specific solution file
        await initializeSolutionManager(params.solutionFile);

        // Register handlers for the solution manager first, so they're available even if initialization fails
        const existingSolutionManager = SolutionManager.getInstance();
        if (existingSolutionManager) {
            existingSolutionManager.registerHandlers(connection);
            logger.info("✅ SolutionManager handlers registered from existing instance");
        }
        
        // Register handlers again if we have a new instance
        const solutionManager = SolutionManager.getInstance();
        if (solutionManager && solutionManager !== existingSolutionManager) {
            solutionManager.registerHandlers(connection);
            logger.info("✅ SolutionManager handlers registered from new instance");
        }
        
        // Build the solution after registering handlers
        try {
            globalSolution = await buildClarionSolution();
        } catch (buildError: any) {
            logger.error(`❌ Error building solution: ${buildError.message || buildError}`);
            // Create a minimal solution info to avoid null references
            globalSolution = {
                name: path.basename(params.solutionFile),
                path: params.solutionFile,
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
                path: params.solutionFile || "",
                projects: []
            };
        }
    }
});


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

// Add a handler for finding files using the server-side redirection parser
connection.onRequest('clarion/findFile', (params: { filename: string }): string => {
    logger.info(`🔍 Received request to find file: ${params.filename}`);
    
    try {
        const solutionManager = SolutionManager.getInstance();
        if (solutionManager) {
            const filePath = solutionManager.findFileWithExtension(params.filename);
            if (filePath) {
                logger.info(`✅ Found file: ${filePath}`);
                return filePath;
            } else {
                logger.warn(`⚠️ File not found: ${params.filename}`);
            }
        } else {
            logger.warn(`⚠️ No SolutionManager instance available to find file: ${params.filename}`);
        }
    } catch (error) {
        logger.error(`❌ Error finding file ${params.filename}: ${error instanceof Error ? error.message : String(error)}`);
    }
    
    return "";
});

// Add a handler for getting search paths for a project and extension
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

// Add a handler for getting included redirection files for a project
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

// Add a handler for checking if the server is ready
connection.onRequest('clarion/serverReady', () => {
    logger.info("📡 Received server readiness check request");
    
    // Check if the solution manager is initialized
    const solutionManager = SolutionManager.getInstance();
    if (!solutionManager) {
        logger.warn("⚠️ SolutionManager not initialized yet");
        throw new Error("SolutionManager not initialized");
    }
    
    // Check if the solution has been built
    if (!globalSolution || !globalSolution.projects) {
        logger.warn("⚠️ Solution not built yet");
        throw new Error("Solution not built");
    }
    
    logger.info("✅ Server is ready with initialized solution");
    return true;
});

// ✅ Server Initialization
connection.onInitialize((params: InitializeParams): InitializeResult => {
    logger.info("⚡  Received onInitialize request from VS Code.");
    globalClarionSettings = params.initializationOptions || {};
    return {
        capabilities: {
            foldingRangeProvider: true,
            documentSymbolProvider: true,
            documentFormattingProvider: true,
            colorProvider: true
        }
    };
});

export let serverInitialized = false;

// ✅ Server Fully Initialized
connection.onInitialized(() => {
    logger.info("✅  Clarion Language Server fully initialized.");
    serverInitialized = true;
    
    // Register SolutionManager handlers if it exists
    const solutionManager = SolutionManager.getInstance();
    if (solutionManager) {
        solutionManager.registerHandlers(connection);
        logger.info("✅ SolutionManager handlers registered");
    } else {
        logger.info("⚠️ SolutionManager not initialized yet, handlers will be registered later");
    }
});

// ✅ Start Listening
documents.listen(connection);
connection.listen();

logger.info("🟢  Clarion Language Server is now listening for requests.");