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
    ColorPresentation,
    TextDocumentSyncKind
} from 'vscode-languageserver-protocol';

import { TextDocument } from 'vscode-languageserver-textdocument';

import { ClarionDocumentSymbolProvider } from './ClarionDocumentSymbolProvider';

import { Token } from './ClarionTokenizer';
import { TokenCache } from './TokenCache';

import LoggerManager from './logger';
import ClarionFormatter from './ClarionFormatter';

import { ClarionColorResolver } from './ClarionColorResolver';
import ClarionFoldingProvider from './ClarionFoldingProvider';
import { serverSettings } from './serverSettings';

import { ClarionSolutionServer } from './solution/clarionSolutionServer';
import { buildClarionSolution, initializeSolutionManager } from './solution/buildClarionSolution';
import { SolutionManager } from './solution/solutionManager';
import { RedirectionFileParserServer } from './solution/redirectionFileParserServer';
import { DefinitionProvider } from './providers/DefinitionProvider';
import { HoverProvider } from './providers/HoverProvider';
import path = require('path');
import { ClarionSolutionInfo } from 'common/types';

import * as fs from 'fs';
import { URI } from 'vscode-languageserver';
const logger = LoggerManager.getLogger("Server");
logger.setLevel("error");

// Track server initialization state
export let serverInitialized = false;

// Track if a solution operation is in progress
export let solutionOperationInProgress = false;

// Make solutionOperationInProgress accessible globally
(global as any).solutionOperationInProgress = false;

// ✅ Initialize Providers

const clarionDocumentSymbolProvider = new ClarionDocumentSymbolProvider();
const definitionProvider = new DefinitionProvider();
const hoverProvider = new HoverProvider();

// ✅ Create Connection and Documents Manager
const connection = createConnection(ProposedFeatures.all);

// Add global error handling
process.on('uncaughtException', (error: Error) => {
    logger.error(`❌ [CRITICAL] Uncaught exception: ${error.message}`, error);
});

process.on('unhandledRejection', (reason: any) => {
    logger.error(`❌ [CRITICAL] Unhandled rejection: ${reason instanceof Error ? reason.message : String(reason)}`);
});
// Log all incoming requests and notifications
connection.onInitialize((params) => {
    try {
        logger.info(`📥 [CRITICAL] Initialize request received`);
        logger.info(`📥 [CRITICAL] Client capabilities: ${JSON.stringify(params.capabilities)}`);
        logger.info(`📥 [CRITICAL] Client info: ${JSON.stringify(params.clientInfo)}`);
        logger.info(`📥 [CRITICAL] Initialization options: ${JSON.stringify(params.initializationOptions)}`);
        
        // Store initialization options
        globalClarionSettings = params.initializationOptions || {};
        
        // Log workspace folders
        if (params.workspaceFolders) {
            logger.info(`📥 [CRITICAL] Workspace folders: ${JSON.stringify(params.workspaceFolders)}`);
        } else {
            logger.info(`📥 [CRITICAL] No workspace folders provided`);
        }
        
        // Log process ID
        if (params.processId) {
            logger.info(`📥 [CRITICAL] Client process ID: ${params.processId}`);
        } else {
            logger.info(`📥 [CRITICAL] No client process ID provided`);
        }
        
        // Log root URI
        if (params.rootUri) {
            logger.info(`📥 [CRITICAL] Root URI: ${params.rootUri}`);
        } else if (params.rootPath) {
            logger.info(`📥 [CRITICAL] Root path: ${params.rootPath}`);
        } else {
            logger.info(`📥 [CRITICAL] No root URI or path provided`);
        }
        
        logger.info(`📥 [CRITICAL] Responding with server capabilities`);
        
        // Return server capabilities
        return {
            capabilities: {
                textDocumentSync: TextDocumentSyncKind.Incremental,
                documentFormattingProvider: true,
                documentSymbolProvider: true,
                foldingRangeProvider: true,
                colorProvider: true,
                definitionProvider: true,
                hoverProvider: true
            }
        };
    } catch (error) {
        logger.error(`❌ [CRITICAL] Error in onInitialize: ${error instanceof Error ? error.message : String(error)}`);
        logger.error(`❌ [CRITICAL] Error stack: ${error instanceof Error && error.stack ? error.stack : 'No stack available'}`);
        
        // Return minimal capabilities to avoid crashing
        return {
            capabilities: {
                textDocumentSync: TextDocumentSyncKind.Incremental
            }
        };
    }
});

// Handle initialized notification
connection.onInitialized(() => {
    try {
        logger.info(`📥 [CRITICAL] Server initialized notification received`);
        logger.info(`📥 [CRITICAL] Server is now fully initialized`);
        
        // Set the serverInitialized flag
        serverInitialized = true;
        
        // Register SolutionManager handlers if it exists
        const solutionManager = SolutionManager.getInstance();
        if (solutionManager) {
            solutionManager.registerHandlers(connection);
            logger.info("✅ SolutionManager handlers registered");
        } else {
            logger.info("⚠️ SolutionManager not initialized yet, handlers will be registered later");
        }
        
        // Log server process information
        logger.info(`📥 [CRITICAL] Server process ID: ${process.pid}`);
        logger.info(`📥 [CRITICAL] Server platform: ${process.platform}`);
        logger.info(`📥 [CRITICAL] Server architecture: ${process.arch}`);
        logger.info(`📥 [CRITICAL] Node.js version: ${process.version}`);
        
        // Log memory usage
        const memoryUsage = process.memoryUsage();
        logger.info(`📥 [CRITICAL] Memory usage:
            - RSS: ${Math.round(memoryUsage.rss / 1024 / 1024)} MB
            - Heap total: ${Math.round(memoryUsage.heapTotal / 1024 / 1024)} MB
            - Heap used: ${Math.round(memoryUsage.heapUsed / 1024 / 1024)} MB
        `);
    } catch (error) {
        logger.error(`❌ [CRITICAL] Error in onInitialized: ${error instanceof Error ? error.message : String(error)}`);
        logger.error(`❌ [CRITICAL] Error stack: ${error instanceof Error && error.stack ? error.stack : 'No stack available'}`);
    }
});

// Log all incoming notifications
connection.onNotification((method, params) => {
    logger.info(`📥 [INCOMING] Notification received: ${method}`);
});

// Create the text documents manager
const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

// Add event listener to filter out XML files
documents.onDidOpen((event) => {
    try {
        const document = event.document;
        const uri = document.uri;
        
        // Log all document details
        logger.info(`📂 [CRITICAL] Document opened: ${uri}`);
        logger.info(`📂 [CRITICAL] Document details:
            - URI: ${uri}
            - Language ID: ${document.languageId}
            - Version: ${document.version}
            - Line Count: ${document.lineCount}
            - Content Length: ${document.getText().length}
            - First 100 chars: ${document.getText().substring(0, 100).replace(/\n/g, '\\n')}
        `);
        
        if (uri.toLowerCase().endsWith('.xml') || uri.toLowerCase().endsWith('.cwproj')) {
            logger.info(`🔍 [CRITICAL] XML file detected: ${uri}`);
            logger.info(`🔍 [CRITICAL] XML file content (first 200 chars): ${document.getText().substring(0, 200).replace(/\n/g, '\\n')}`);
            
            // Try to parse the XML to see if it's valid
            try {
                // Just check if it starts with XML declaration or a root element
                const content = document.getText();
                if (content.trim().startsWith('<?xml') || content.trim().startsWith('<')) {
                    logger.info(`🔍 [CRITICAL] File appears to be valid XML: ${uri}`);
                } else {
                    logger.warn(`⚠️ [CRITICAL] File doesn't appear to be valid XML despite extension: ${uri}`);
                }
            } catch (xmlError) {
                logger.error(`❌ [CRITICAL] Error checking XML content: ${xmlError instanceof Error ? xmlError.message : String(xmlError)}`);
            }
        }
    } catch (error) {
        logger.error(`❌ [CRITICAL] Error in onDidOpen: ${error instanceof Error ? error.message : String(error)}`);
        logger.error(`❌ [CRITICAL] Error stack: ${error instanceof Error && error.stack ? error.stack : 'No stack available'}`);
    }
});

let globalSolution: ClarionSolutionInfo | null = null;

// ✅ Initialize the token cache
const tokenCache = TokenCache.getInstance();

export let globalClarionSettings: any = {};

// ✅ Token Cache for Performance

let debounceTimeout: NodeJS.Timeout | null = null;
/**
 * ✅ Retrieves cached tokens or tokenizes the document if not cached.
 */
const parsedDocuments = new Map<string, boolean>(); // Track parsed state per document

function getTokens(document: TextDocument): Token[] {
    try {
        // Log document details for debugging
        logger.info(`🔍 [DEBUG] getTokens called for document: ${document.uri}`);
        logger.info(`🔍 [DEBUG] Document language ID: ${document.languageId}`);
        
        // Skip XML files to prevent crashes
        const fileExt = document.uri.toLowerCase();
        if (fileExt.endsWith('.xml') || fileExt.endsWith('.cwproj')) {
            logger.info(`⚠️ [DEBUG] Skipping tokenization for XML file: ${document.uri}`);
            return [];
        }
        
        // Log before getting tokens
        logger.info(`🔍 [DEBUG] Getting tokens from cache for: ${document.uri}`);
        const tokens = tokenCache.getTokens(document);
        logger.info(`🔍 [DEBUG] Successfully got ${tokens.length} tokens for: ${document.uri}`);
        return tokens;
    } catch (error) {
        logger.error(`❌ [DEBUG] Error in getTokens: ${error instanceof Error ? error.message : String(error)}`);
        return [];
    }
}




// ✅ Handle Folding Ranges (Uses Cached Tokens & Caches Results)
connection.onFoldingRanges((params: FoldingRangeParams) => {
    const perfStart = performance.now();
    try {
        logger.info(`📂 [DEBUG] Received onFoldingRanges request for: ${params.textDocument.uri}`);
        const document = documents.get(params.textDocument.uri);
        if (!document) {
            logger.warn(`⚠️ [DEBUG] Document not found for folding: ${params.textDocument.uri}`);
            return [];
        }

        const uri = document.uri;
        
        // Skip XML files
        if (uri.toLowerCase().endsWith('.xml') || uri.toLowerCase().endsWith('.cwproj')) {
            logger.info(`🔍 [DEBUG] Skipping XML file in onFoldingRanges: ${uri}`);
            return [];
        }

        if (!serverInitialized) {
            logger.info(`⚠️ [DEBUG] Server not initialized yet, delaying folding range request for ${uri}`);
            return [];
        }

        logger.info(`📂 [DEBUG] Computing folding ranges for: ${uri}, language: ${document.languageId}`);
        
        const tokenStart = performance.now();
        const tokens = getTokens(document);
        const tokenTime = performance.now() - tokenStart;
        logger.info(`🔍 [DEBUG] Got ${tokens.length} tokens for folding ranges`);
        logger.perf('Folding: getTokens', { time_ms: tokenTime.toFixed(2), tokens: tokens.length });
        
        const foldStart = performance.now();
        const foldingProvider = new ClarionFoldingProvider(tokens);
        const ranges = foldingProvider.computeFoldingRanges();
        const foldTime = performance.now() - foldStart;
        logger.info(`📂 [DEBUG] Computed ${ranges.length} folding ranges for: ${uri}`);
        
        const totalTime = performance.now() - perfStart;
        logger.perf('Folding: complete', { 
            total_ms: totalTime.toFixed(2),
            token_ms: tokenTime.toFixed(2),
            fold_ms: foldTime.toFixed(2),
            ranges: ranges.length
        });
        
        return ranges;
    } catch (error) {
        logger.error(`❌ [DEBUG] Error computing folding ranges: ${error instanceof Error ? error.message : String(error)}`);
        return [];
    }
});



// ✅ Handle Content Changes (Recompute Tokens)
documents.onDidChangeContent(event => {
    try {
        const document = event.document;
        const uri = document.uri;
        
        // Log all document details
        logger.info(`📝 [CRITICAL] Document content changed: ${uri}`);
        logger.info(`📝 [CRITICAL] Document details:
            - URI: ${uri}
            - Language ID: ${document.languageId}
            - Version: ${document.version}
            - Line Count: ${document.lineCount}
            - Content Length: ${document.getText().length}
            - First 100 chars: ${document.getText().substring(0, 100).replace(/\n/g, '\\n')}
        `);
        
        // Skip XML files
        if (uri.toLowerCase().endsWith('.xml') || uri.toLowerCase().endsWith('.cwproj')) {
            logger.info(`🔍 [CRITICAL] XML file content changed: ${uri}`);
            logger.info(`🔍 [CRITICAL] XML file content (first 200 chars): ${document.getText().substring(0, 200).replace(/\n/g, '\\n')}`);
            return;
        }

        // Clear tokens from cache
        logger.info(`🔍 [CRITICAL] Clearing tokens for changed document: ${uri}`);
        try {
            tokenCache.clearTokens(document.uri); // 🔥 Always clear immediately
            logger.info(`🔍 [CRITICAL] Successfully cleared tokens for document: ${uri}`);
        } catch (cacheError) {
            logger.error(`❌ [CRITICAL] Error clearing tokens: ${cacheError instanceof Error ? cacheError.message : String(cacheError)}`);
        }

        // Set up debounced token refresh
        if (debounceTimeout) {
            logger.info(`🔍 [CRITICAL] Clearing existing debounce timeout for: ${uri}`);
            clearTimeout(debounceTimeout);
        }

        logger.info(`🔍 [CRITICAL] Setting up debounced token refresh for: ${uri}`);
        debounceTimeout = setTimeout(() => {
            try {
                logger.info(`🔍 [CRITICAL] Debounce timeout triggered, refreshing tokens for: ${uri}`);
                const tokens = getTokens(document); // ⬅️ refreshes the cache
                logger.info(`🔍 [CRITICAL] Successfully refreshed tokens after edit: ${uri}, got ${tokens.length} tokens`);
            } catch (tokenError) {
                logger.error(`❌ [CRITICAL] Error refreshing tokens in debounce: ${tokenError instanceof Error ? tokenError.message : String(tokenError)}`);
            }
        }, 300);
    } catch (error) {
        logger.error(`❌ [CRITICAL] Error in onDidChangeContent: ${error instanceof Error ? error.message : String(error)}`);
        logger.error(`❌ [CRITICAL] Error stack: ${error instanceof Error && error.stack ? error.stack : 'No stack available'}`);
    }
});



// ✅ Handle Document Formatting (Uses Cached Tokens & Caches Results)
connection.onDocumentFormatting((params: DocumentFormattingParams): TextEdit[] => {
    try {
        logger.info(`📐 [DEBUG] Received onDocumentFormatting request for: ${params.textDocument.uri}`);
        const document = documents.get(params.textDocument.uri);
        if (!document) {
            logger.warn(`⚠️ [DEBUG] Document not found for formatting: ${params.textDocument.uri}`);
            return [];
        }

        const uri = document.uri;
        
        // Skip XML files
        if (uri.toLowerCase().endsWith('.xml') || uri.toLowerCase().endsWith('.cwproj')) {
            logger.info(`🔍 [DEBUG] Skipping XML file in onDocumentFormatting: ${uri}`);
            return [];
        }

        const text = document.getText();
        logger.info(`🔍 [DEBUG] Getting tokens for formatting document: ${uri}, language: ${document.languageId}`);
        
        // ✅ Use getTokens() instead of manually tokenizing
        const tokens = getTokens(document);
        logger.info(`🔍 [DEBUG] Got ${tokens.length} tokens for formatting`);

        const formatter = new ClarionFormatter(tokens, text, {
            formattingOptions: params.options
        });

        const formattedText = formatter.format();
        if (formattedText !== text) {
            logger.info(`🔍 [DEBUG] Document formatting changed text: ${uri}`);
            return [TextEdit.replace(
                Range.create(Position.create(0, 0), Position.create(document.lineCount, 0)),
                formattedText
            )];
        }
        logger.info(`🔍 [DEBUG] Document formatting made no changes: ${uri}`);
        return [];
    } catch (error) {
        logger.error(`❌ [DEBUG] Error formatting document: ${error instanceof Error ? error.message : String(error)}`);
        return [];
    }
});


connection.onDocumentSymbol((params: DocumentSymbolParams) => {
    const perfStart = performance.now();
    try {
        logger.info(`📂 [DEBUG] Received onDocumentSymbol request for: ${params.textDocument.uri}`);
        const document = documents.get(params.textDocument.uri);
        if (!document) {
            logger.warn(`⚠️ [DEBUG] Document not found for symbols: ${params.textDocument.uri}`);
            return [];
        }

        const uri = document.uri;
        
        // Skip XML files
        if (uri.toLowerCase().endsWith('.xml') || uri.toLowerCase().endsWith('.cwproj')) {
            logger.info(`🔍 [DEBUG] Skipping XML file in onDocumentSymbol: ${uri}`);
            return [];
        }

        if (!serverInitialized) {
            logger.info(`⚠️ [DEBUG] Server not initialized yet, delaying document symbol request for ${uri}`);
            return [];
        }

        // Check if a solution operation is in progress - if so, prioritize solution view
        if (solutionOperationInProgress || (global as any).solutionOperationInProgress) {
            logger.info(`⚠️ [DEBUG] Solution operation in progress, deferring document symbol request for: ${uri}`);
            return [];
        }

        logger.info(`📂 [DEBUG] Computing document symbols for: ${uri}, language: ${document.languageId}`);
        
        const tokenStart = performance.now();
        const tokens = getTokens(document);  // ✅ No need for async
        const tokenTime = performance.now() - tokenStart;
        logger.info(`🔍 [DEBUG] Got ${tokens.length} tokens for document symbols`);
        logger.perf('Symbols: getTokens', { time_ms: tokenTime.toFixed(2), tokens: tokens.length });
        
        const symbolStart = performance.now();
        const symbols = clarionDocumentSymbolProvider.provideDocumentSymbols(tokens, uri);
        const symbolTime = performance.now() - symbolStart;
        logger.info(`🧩 [DEBUG] Returned ${symbols.length} document symbols for ${uri}`);

        const totalTime = performance.now() - perfStart;
        logger.perf('Symbols: complete', { 
            total_ms: totalTime.toFixed(2),
            token_ms: tokenTime.toFixed(2),
            symbol_ms: symbolTime.toFixed(2),
            symbols: symbols.length
        });

        return symbols;
    } catch (error) {
        logger.error(`❌ [DEBUG] Error providing document symbols: ${error instanceof Error ? error.message : String(error)}`);
        return [];
    }
});


connection.onDocumentColor((params: DocumentColorParams): ColorInformation[] => {
    try {
        logger.info(`🎨 [DEBUG] Received onDocumentColor request for: ${params.textDocument.uri}`);
        const document = documents.get(params.textDocument.uri);
        if (!document) {
            logger.warn(`⚠️ [DEBUG] Document not found for colors: ${params.textDocument.uri}`);
            return [];
        }

        const uri = document.uri;
        
        // Skip XML files
        if (uri.toLowerCase().endsWith('.xml') || uri.toLowerCase().endsWith('.cwproj')) {
            logger.info(`🔍 [DEBUG] Skipping XML file in onDocumentColor: ${uri}`);
            return [];
        }

        logger.info(`🎨 [DEBUG] Getting tokens for document colors: ${uri}`);
        const tokens = getTokens(document);
        const colors = ClarionColorResolver.provideDocumentColors(tokens, document);
        logger.info(`🎨 [DEBUG] Found ${colors.length} colors in document: ${uri}`);
        
        return colors;
    } catch (error) {
        logger.error(`❌ [DEBUG] Error providing document colors: ${error instanceof Error ? error.message : String(error)}`);
        return [];
    }
});

connection.onColorPresentation((params: ColorPresentationParams): ColorPresentation[] => {
    try {
        logger.info(`🎨 [DEBUG] Received onColorPresentation request`);
        const { color, range } = params;
        const presentations = ClarionColorResolver.provideColorPresentations(color, range);
        logger.info(`🎨 [DEBUG] Provided ${presentations.length} color presentations`);
        return presentations;
    } catch (error) {
        logger.error(`❌ [DEBUG] Error providing color presentations: ${error instanceof Error ? error.message : String(error)}`);
        return [];
    }
});




// ✅ Handle Save (Ensure Cached Tokens Are Up-To-Date)
documents.onDidSave(event => {
    try {
        const document = event.document;
        const uri = document.uri;
        
        // Log all document details
        logger.info(`💾 [CRITICAL] Document saved: ${uri}`);
        logger.info(`💾 [CRITICAL] Document details:
            - URI: ${uri}
            - Language ID: ${document.languageId}
            - Version: ${document.version}
            - Line Count: ${document.lineCount}
            - Content Length: ${document.getText().length}
            - First 100 chars: ${document.getText().substring(0, 100).replace(/\n/g, '\\n')}
        `);
        
        // Skip XML files
        if (uri.toLowerCase().endsWith('.xml') || uri.toLowerCase().endsWith('.cwproj')) {
            logger.info(`🔍 [CRITICAL] XML file saved: ${uri}`);
            logger.info(`🔍 [CRITICAL] XML file content (first 200 chars): ${document.getText().substring(0, 200).replace(/\n/g, '\\n')}`);
            return;
        }
        
        // Ensure tokens are up-to-date
        logger.info(`🔍 [CRITICAL] Refreshing tokens for saved document: ${uri}`);
        try {
            const tokens = getTokens(document);
            logger.info(`🔍 [CRITICAL] Successfully refreshed tokens for saved document: ${uri}, got ${tokens.length} tokens`);
        } catch (tokenError) {
            logger.error(`❌ [CRITICAL] Error getting tokens for saved document: ${tokenError instanceof Error ? tokenError.message : String(tokenError)}`);
        }
    } catch (error) {
        logger.error(`❌ [CRITICAL] Error in onDidSave: ${error instanceof Error ? error.message : String(error)}`);
        logger.error(`❌ [CRITICAL] Error stack: ${error instanceof Error && error.stack ? error.stack : 'No stack available'}`);
    }
});

// ✅ Clear Cache When Document Closes
documents.onDidClose(event => {
    try {
        const document = event.document;
        const uri = document.uri;
        
        // Log all document details
        logger.info(`🗑️ [CRITICAL] Document closed: ${uri}`);
        logger.info(`🗑️ [CRITICAL] Document details:
            - URI: ${uri}
            - Language ID: ${document.languageId}
            - Version: ${document.version}
            - Line Count: ${document.lineCount}
        `);
        
        if (uri.toLowerCase().endsWith('.xml') || uri.toLowerCase().endsWith('.cwproj')) {
            logger.info(`🔍 [CRITICAL] XML file closed: ${uri}`);
        }
        
        // Always clear tokens for any document type
        logger.info(`🔍 [CRITICAL] Clearing tokens for document: ${uri}`);
        try {
            tokenCache.clearTokens(uri);
            logger.info(`🔍 [CRITICAL] Successfully cleared tokens for document: ${uri}`);
        } catch (cacheError) {
            logger.error(`❌ [CRITICAL] Error clearing tokens: ${cacheError instanceof Error ? cacheError.message : String(cacheError)}`);
        }
    } catch (error) {
        logger.error(`❌ [CRITICAL] Error in onDidClose: ${error instanceof Error ? error.message : String(error)}`);
        logger.error(`❌ [CRITICAL] Error stack: ${error instanceof Error && error.stack ? error.stack : 'No stack available'}`);
    }
});


connection.onNotification('clarion/updatePaths', async (params: {
    redirectionPaths: string[];
    projectPaths: string[];
    configuration: string;
    clarionVersion: string;
    redirectionFile: string;
    macros: Record<string, string>;
    libsrcPaths: string[];
    solutionFilePath?: string; // Add optional solution file path
    defaultLookupExtensions?: string[]; // Add default lookup extensions
}) => {
    const startTime = performance.now();
    logger.info(`🕒 Starting solution initialization`);
    
    try {
        // Update server settings
        serverSettings.redirectionPaths = params.redirectionPaths || [];
        serverSettings.projectPaths = params.projectPaths || [];
        serverSettings.configuration = params.configuration || "Debug";
        serverSettings.clarionVersion = params.clarionVersion || "";
        serverSettings.macros = params.macros || {};
        serverSettings.libsrcPaths = params.libsrcPaths || [];
        serverSettings.redirectionFile = params.redirectionFile || "";
        serverSettings.solutionFilePath = params.solutionFilePath || ""; // Store solution file path
        
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

        // Log memory usage before initialization
        const memoryBefore = process.memoryUsage();
        logger.info(`📊 Memory usage before solution initialization:
            - RSS: ${Math.round(memoryBefore.rss / 1024 / 1024)} MB
            - Heap total: ${Math.round(memoryBefore.heapTotal / 1024 / 1024)} MB
            - Heap used: ${Math.round(memoryBefore.heapUsed / 1024 / 1024)} MB
        `);

        // ✅ Initialize the solution manager before building the solution
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
        const initStartTime = performance.now();
        logger.info(`🔄 Initializing solution manager with path: ${solutionPath}`);
        try {
            await initializeSolutionManager(solutionPath);
            const initEndTime = performance.now();
            logger.info(`✅ Solution manager initialized successfully in ${(initEndTime - initStartTime).toFixed(2)}ms`);
            
            // Log the solution manager state
            const solutionManager = SolutionManager.getInstance();
            if (solutionManager) {
                logger.info(`📊 Solution manager state:`);
                logger.info(`  - Solution file path: ${solutionManager.solutionFilePath}`);
                logger.info(`  - Solution name: ${solutionManager.solution.name}`);
                logger.info(`  - Projects count: ${solutionManager.solution.projects.length}`);
                
                // Log each project
                for (let i = 0; i < solutionManager.solution.projects.length; i++) {
                    const project = solutionManager.solution.projects[i];
                    logger.info(`  - Project ${i+1}/${solutionManager.solution.projects.length}: ${project.name}`);
                    logger.info(`    - Path: ${project.path}`);
                    logger.info(`    - GUID: ${project.guid}`);
                    logger.info(`    - Source Files: ${project.sourceFiles.length}`);
                    logger.info(`    - File Drivers: ${project.fileDrivers.length}`);
                    logger.info(`    - Libraries: ${project.libraries.length}`);
                    logger.info(`    - Project References: ${project.projectReferences.length}`);
                    logger.info(`    - None Files: ${project.noneFiles.length}`);
                }
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
        const buildStartTime = performance.now();
        try {
            logger.info(`🔄 Building solution...`);
            globalSolution = await buildClarionSolution();
            const buildEndTime = performance.now();
            logger.info(`✅ Solution built successfully with ${globalSolution.projects.length} projects in ${(buildEndTime - buildStartTime).toFixed(2)}ms`);
            
            // Log each project in the global solution
            for (let i = 0; i < globalSolution.projects.length; i++) {
                const project = globalSolution.projects[i];
                logger.info(`  - Project ${i+1}/${globalSolution.projects.length}: ${project.name}`);
                logger.info(`    - Path: ${project.path}`);
                logger.info(`    - GUID: ${project.guid}`);
                logger.info(`    - Source Files: ${project.sourceFiles.length}`);
                logger.info(`    - File Drivers: ${project.fileDrivers?.length || 0}`);
                logger.info(`    - Libraries: ${project.libraries?.length || 0}`);
                logger.info(`    - Project References: ${project.projectReferences?.length || 0}`);
                logger.info(`    - None Files: ${project.noneFiles?.length || 0}`);
            }
        } catch (buildError: any) {
            logger.error(`❌ Error building solution: ${buildError.message || buildError}`);
            // Create a minimal solution info to avoid null references
            globalSolution = {
                name: path.basename(solutionPath),
                path: solutionPath,
                projects: []
            };
        }

        // Log memory usage after initialization
        const memoryAfter = process.memoryUsage();
        logger.info(`📊 Memory usage after solution initialization:
            - RSS: ${Math.round(memoryAfter.rss / 1024 / 1024)} MB
            - Heap total: ${Math.round(memoryAfter.heapTotal / 1024 / 1024)} MB
            - Heap used: ${Math.round(memoryAfter.heapUsed / 1024 / 1024)} MB
            - Difference: ${Math.round((memoryAfter.heapUsed - memoryBefore.heapUsed) / 1024 / 1024)} MB
        `);

        logger.info("🔁 Clarion paths updated:");
        logger.info("🔹 Project Paths:", serverSettings.projectPaths);
        logger.info("🔹 Redirection Paths:", serverSettings.redirectionPaths);
        logger.info("🔹 Redirection File:", serverSettings.redirectionFile);
        logger.info("🔹 Macros:", Object.keys(serverSettings.macros).length);
        logger.info("🔹 Clarion Version:", serverSettings.clarionVersion);
        logger.info("🔹 Configuration:", serverSettings.configuration);

        const endTime = performance.now();
        logger.info(`🕒 Total solution initialization time: ${(endTime - startTime).toFixed(2)}ms`);

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
    }
});


connection.onRequest('clarion/getSolutionTree', async (): Promise<ClarionSolutionInfo> => {
    const startTime = performance.now();
    logger.info("📂 Received request for solution tree");
    
    try {
        // First try to get the solution from the SolutionManager
        const solutionManager = SolutionManager.getInstance();
        if (solutionManager) {
            try {
                logger.info(`🔍 SolutionManager instance found, getting solution tree...`);
                const solutionTree = solutionManager.getSolutionTree();
                
                if (solutionTree && solutionTree.projects && solutionTree.projects.length > 0) {
                    const endTime = performance.now();
                    logger.info(`✅ Returning solution tree from SolutionManager with ${solutionTree.projects.length} projects in ${(endTime - startTime).toFixed(2)}ms`);
                    logger.info(`🔹 Solution name: ${solutionTree.name}`);
                    logger.info(`🔹 Solution path: ${solutionTree.path}`);
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
            const endTime = performance.now();
            logger.info(`✅ Returning cached solution with ${globalSolution.projects.length} projects in ${(endTime - startTime).toFixed(2)}ms`);
            logger.info(`🔹 Solution name: ${globalSolution.name}`);
            logger.info(`🔹 Solution path: ${globalSolution.path}`);
            return globalSolution;
        } else if (globalSolution) {
            logger.warn(`⚠️ Global solution exists but has no projects`);
        } else {
            logger.warn(`⚠️ No global solution available`);
        }
        
        // If all else fails, return an empty solution
        const endTime = performance.now();
        logger.warn(`⚠️ No solution available to return, creating empty solution in ${(endTime - startTime).toFixed(2)}ms`);
        return {
            name: "No Solution",
            path: "",
            projects: []
        };
    } catch (error) {
        const endTime = performance.now();
        logger.error(`❌ Unexpected error in getSolutionTree: ${error instanceof Error ? error.message : String(error)} (${(endTime - startTime).toFixed(2)}ms)`);
        return {
            name: "Error",
            path: "",
            projects: []
        };
    }
});

// Add a handler for finding files using the server-side redirection parser
connection.onRequest('clarion/findFile', async (params: { filename: string }): Promise<{ path: string, source: string }> => {
    logger.info(`🔍 Received request to find file: ${params.filename}`);
    
    try {
        const solutionManager = SolutionManager.getInstance();
        if (solutionManager) {
            const result = await solutionManager.findFileWithExtension(params.filename);
            if (result && result.path) {
                logger.info(`✅ Found file: ${result.path} (source: ${result.source})`);
                return result;
            } else {
                // If no extension is provided, try with default lookup extensions
                if (!path.extname(params.filename)) {
                    for (const ext of serverSettings.defaultLookupExtensions) {
                        const filenameWithExt = `${params.filename}${ext}`;
                        const resultWithExt = await solutionManager.findFileWithExtension(filenameWithExt);
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
connection.onRequest('clarion/documentSymbols', async (params: { uri: string }) => {
    let document = documents.get(params.uri);

    if (!document) {
        logger.warn(`⚠️ Document not open, attempting to locate on disk: ${params.uri}`);

        try {
            const solutionManager = SolutionManager.getInstance();
            if (solutionManager) {
                const fileName = decodeURIComponent(params.uri.split('/').pop() || '');
                const result = await solutionManager.findFileWithExtension(fileName);

                if (result.path && fs.existsSync(result.path)) {
                    const fileContent = fs.readFileSync(result.path, 'utf8');
                    document = TextDocument.create(params.uri, 'clarion', 1, fileContent);
                    logger.info(`✅ Successfully loaded file from disk: ${result.path} (source: ${result.source})`);
                } else {
                    logger.warn(`⚠️ Could not find file on disk: ${fileName}`);
                    return [];
                }
            } else {
                logger.warn(`⚠️ No SolutionManager instance available for symbol request.`);
                return [];
            }
        } catch (err) {
            logger.error(`❌ Error reading file for documentSymbols: ${params.uri} — ${err instanceof Error ? err.message : String(err)}`);
            return [];
        }
    }

    logger.info(`📜 [Server] Handling documentSymbols request for ${params.uri}`);
    const tokens = getTokens(document);
    const symbols = clarionDocumentSymbolProvider.provideDocumentSymbols(tokens, params.uri);
    logger.info(`✅ [Server] Returning ${symbols.length} symbols`);
    return symbols;
});

// Handle definition requests
connection.onDefinition(async (params) => {
    logger.info(`📂 Received definition request for: ${params.textDocument.uri} at position ${params.position.line}:${params.position.character}`);
    
    if (!serverInitialized) {
        logger.info(`⚠️ [DELAY] Server not initialized yet, delaying definition request`);
        return null;
    }
    
    const document = documents.get(params.textDocument.uri);
    if (!document) {
        logger.info(`⚠️ Document not found: ${params.textDocument.uri}`);
        return null;
    }
    
    try {
        const definition = await definitionProvider.provideDefinition(document, params.position);
        if (definition) {
            logger.info(`✅ Found definition for ${params.textDocument.uri}`);
        } else {
            logger.info(`⚠️ No definition found for ${params.textDocument.uri}`);
        }
        return definition;
    } catch (error) {
        logger.error(`❌ Error providing definition: ${error instanceof Error ? error.message : String(error)}`);
        return null;
    }
});

// Handle hover requests
connection.onHover(async (params) => {
    logger.info(`📂 Received hover request for: ${params.textDocument.uri} at position ${params.position.line}:${params.position.character}`);
    
    if (!serverInitialized) {
        logger.info(`⚠️ [DELAY] Server not initialized yet, delaying hover request`);
        return null;
    }
    
    const document = documents.get(params.textDocument.uri);
    if (!document) {
        logger.info(`⚠️ Document not found: ${params.textDocument.uri}`);
        return null;
    }
    
    try {
        const hover = await hoverProvider.provideHover(document, params.position);
        if (hover) {
            logger.info(`✅ Found hover info for ${params.textDocument.uri}`);
        } else {
            logger.info(`⚠️ No hover info found for ${params.textDocument.uri}`);
        }
        return hover;
    } catch (error) {
        logger.error(`❌ Error providing hover: ${error instanceof Error ? error.message : String(error)}`);
        return null;
    }
});





// Note: Duplicate onInitialize/onInitialized handlers removed - see lines 89-172 for the active handlers

// ✅ Start Listening
documents.listen(connection);
connection.listen();

// Add a handler for getting performance metrics
connection.onRequest('clarion/getPerformanceMetrics', () => {
    return {
        memoryUsage: process.memoryUsage().heapUsed,
        cpuUsage: process.cpuUsage(),
        uptime: process.uptime()
    };
});

logger.info("🟢  Clarion Language Server is now listening for requests.");