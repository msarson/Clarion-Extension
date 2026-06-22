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
    DocumentSymbol,
    FoldingRangeParams,
    FoldingRange,
    InitializeParams,
    InitializeResult,
    TextEdit,
    Range,
    Position,
    Location,
    DocumentColorParams,
    ColorInformation,
    ColorPresentationParams,
    ColorPresentation,
    TextDocumentSyncKind,
    SignatureHelp,
    ReferenceParams,
    RenameParams,
    DocumentLink,
    DocumentLinkParams
} from 'vscode-languageserver-protocol';

import { TextDocument } from 'vscode-languageserver-textdocument';

import { ClarionDocumentSymbolProvider } from './providers/ClarionDocumentSymbolProvider';
import { ClarionSemanticTokensProvider } from './providers/ClarionSemanticTokensProvider';

import { Token, TokenType } from './ClarionTokenizer';
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
import { resolveFileInNoSolutionMode } from './solution/findFileNoSolution';
import { DefinitionProvider } from './providers/DefinitionProvider';
import { HoverProvider } from './providers/HoverProvider';
import { ClassConstantsCodeActionProvider } from './providers/ClassConstantsCodeActionProvider';
import { FlattenCodeActionProvider } from './providers/FlattenCodeActionProvider';
import { MapModuleCodeActionProvider } from './providers/MapModuleCodeActionProvider';
import { MapDeclarationCodeActionProvider } from './providers/MapDeclarationCodeActionProvider';
import { UnicodeCodeActionProvider } from './providers/UnicodeCodeActionProvider';
import { SelectionRangeProvider } from './providers/SelectionRangeProvider';
import { ClarionCodeLensProvider, formatReferenceCount } from './providers/ClarionCodeLensProvider';
import { DiagnosticProvider } from './providers/DiagnosticProvider';
import { SignatureHelpProvider } from './providers/SignatureHelpProvider';
import { ImplementationProvider } from './providers/ImplementationProvider';
import { ReferencesProvider } from './providers/ReferencesProvider';
import { RenameProvider } from './providers/RenameProvider';
import { DocumentHighlightProvider } from './providers/DocumentHighlightProvider';
import { WorkspaceSymbolProvider } from './providers/WorkspaceSymbolProvider';
import { UnreachableCodeProvider } from './providers/UnreachableCodeProvider';
import { CompletionProvider } from './providers/CompletionProvider';
import { DocumentLinkProvider } from './providers/DocumentLinkProvider';
import { MemberLocatorService } from './services/MemberLocatorService';
import { SymbolFinderService } from './services/SymbolFinderService';
import { ReferenceIndex } from './services/ReferenceIndex';
import { ScopeAnalyzer } from './utils/ScopeAnalyzer';
import { ClarionSolutionInfo } from 'common/types';
import { URI } from 'vscode-languageserver';
import { setServerInitialized, serverInitialized } from './serverState';
import * as fs from 'fs';
import * as path from 'path';

const logger = LoggerManager.getLogger("Server");
logger.setLevel("error");

// #158 — startup-perf instrumentation. Set level to "perf" to emit; flip to
// "error" to silence post-investigation. Captures the 7 startup-phase
// boundaries Bob named in the dispatch + per-document validation timing.
// Pattern per the `perfLogger` infrastructure from `0d70270`.
// #158 — perfLogger level set to "error" post-investigation. Calls remain
// in place; flip back to "perf" for future startup-time investigations
// (toggle is a single-character edit per logger).
const perfLogger = LoggerManager.getLogger("StartupPerf", "error");
const serverModuleLoadedAt = Date.now();
perfLogger.perf("Server module loaded", { wallclock_ms: 0 });

const globalStartTime = Date.now();
logger.info(`⏱️ [STARTUP] Server process started at ${new Date().toISOString()}`);

// #158 — first-call flags for one-shot phase boundaries.
let firstDocumentOpenFired = false;
let firstValidateFired = false;

// #158 Phase B addendum — defer async validators until solution-ready.
// Mark's perf-data insight: initial onDidOpen fires at t~63ms but
// libsrcPaths isn't populated until clarion/solutionReady fires (~11s in
// Mark's setup). The P3 libsrc-skip can't catch the initial async scan
// because libsrcPaths is empty → libsrc files get the full 14s async pass
// despite being structurally exempt.
//
// Fix: hold the async validator pass on `onDidOpen` until solution-ready
// drains the queue. Sync diagnostics still fire immediately (fast
// feedback). Once solution loads, libsrcPaths is populated, the drain
// loop hits the now-effective P3 libsrc-skip on first deferred async
// pass — eliminating ~15s of redundant async work.
//
// No-solution-mode safety net: a 2s timeout marks the pipeline ready +
// drains the queue if solutionReady never fires (loose .clw in
// non-Clarion workspace). 2s is well under perceived-startup-blocking
// threshold; loose-file users wait 2s for async diagnostics instead of
// getting them at t=63ms. Acceptable per Bob's dispatch.
let solutionPipelineReady = false;
const deferredAsyncDocs = new Set<string>();

// Temporary diagnostic tracer — set to "warn" so traces appear in OUTPUT panel
// Track if a solution operation is in progress
export let solutionOperationInProgress = false;

// CodeLens reference-count cache — keyed by "uri:line:char" (the symbol's declaration
// position). `refs` is the Find-All-References result (the displayed count is always
// refs.length, unchanged from before); `shortName` is the symbol's last dotted segment,
// used for invalidation. Presence in the map = "resolved" (so a genuine 0-ref count is
// distinguishable from "not yet computed").
//
// #189 Phase 2: invalidation is per-file, not global. `codeLensRefIndex` tracks which
// files each cached symbol's references live in (cacheKey → site files), so editing one
// file evicts only the counts that file can affect — counts for other files stay warm
// across edits instead of every count recomputing on every keystroke.
const codeLensRefCache = new Map<string, { refs: Location[]; shortName: string }>();
const codeLensRefIndex = new ReferenceIndex();

// Make solutionOperationInProgress accessible globally
(global as any).solutionOperationInProgress = false;

// ✅ Initialize Providers

const clarionDocumentSymbolProvider = new ClarionDocumentSymbolProvider();
const clarionSemanticTokensProvider = new ClarionSemanticTokensProvider();
const definitionProvider = new DefinitionProvider();
const hoverProvider = new HoverProvider();
const signatureHelpProvider = new SignatureHelpProvider();
const implementationProvider = new ImplementationProvider();
const referencesProvider = new ReferencesProvider();
const codeLensProvider = new ClarionCodeLensProvider();
const renameProvider = new RenameProvider();
const documentHighlightProvider = new DocumentHighlightProvider();
const workspaceSymbolProvider = new WorkspaceSymbolProvider();
const completionProvider = new CompletionProvider();
const documentLinkProvider = new DocumentLinkProvider();

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
    const t0 = Date.now();
    logger.info(`⏱️ [STARTUP] onInitialize called at ${new Date().toISOString()}`);
    perfLogger.perf("Phase: LSP onInitialize received", {
        since_module_load_ms: t0 - serverModuleLoadedAt
    });
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
        const result: InitializeResult = {
            capabilities: {
                textDocumentSync: TextDocumentSyncKind.Incremental,
                documentFormattingProvider: true,
                documentSymbolProvider: true,
                foldingRangeProvider: true,
                colorProvider: true,
                definitionProvider: true,
                implementationProvider: true,
                referencesProvider: true,
                renameProvider: { prepareProvider: true },
                documentHighlightProvider: true,
                workspaceSymbolProvider: true,
                hoverProvider: true,
                codeActionProvider: true,
                selectionRangeProvider: true,
                codeLensProvider: { resolveProvider: true },
                signatureHelpProvider: {
                    triggerCharacters: ['(', ','],
                    retriggerCharacters: [')']
                },
                completionProvider: {
                    triggerCharacters: ['.', ':'],
                    resolveProvider: false
                },
                documentLinkProvider: { resolveProvider: false },
                semanticTokensProvider: {
                    legend: clarionSemanticTokensProvider.getLegend(),
                    range: false,
                    full: true
                }
            }
        };
        logger.info(`⏱️ [STARTUP] onInitialize complete in ${Date.now() - t0}ms`);
        perfLogger.perf("Phase: LSP onInitialize complete", {
            handler_ms: Date.now() - t0,
            since_module_load_ms: Date.now() - serverModuleLoadedAt
        });
        return result;
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
        perfLogger.perf("Phase: Client initialize handshake complete (onInitialized)", {
            since_module_load_ms: Date.now() - serverModuleLoadedAt
        });
        
        // Set the serverInitialized flag
        setServerInitialized(true);
        
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

// #196: give RenameProvider live document versions for `documentChanges` so VS Code
// applies each rename edit against the version it was computed for (open cross-file
// files carry their real version; closed files resolve to null = best-effort).
renameProvider.setDocumentVersionResolver((uri) => documents.get(uri)?.version ?? null);

// Add event listener to filter out XML files
documents.onDidOpen((event) => {
    try {
        const document = event.document;
        const uri = document.uri;

        logger.info(`📂 Document opened: ${uri}`);

        if (!firstDocumentOpenFired) {
            firstDocumentOpenFired = true;
            perfLogger.perf("Phase: First onDidOpen", {
                since_module_load_ms: Date.now() - serverModuleLoadedAt,
                uri
            });
        }

        if (uri.toLowerCase().endsWith('.xml') || uri.toLowerCase().endsWith('.cwproj')) {
            return;
        }

        // Validate document for diagnostics
        validateTextDocument(document, 'onDidOpen');

        // Notify client so the structure view refreshes on initial open.
        // (clarion/symbolsRefreshed is otherwise only sent from onDidChangeContent,
        // so the outline would stay empty until the user edited or switched tabs.)
        connection.sendNotification('clarion/symbolsRefreshed', { uri });
    } catch (error) {
        logger.error(`❌ Error in onDidOpen: ${error instanceof Error ? error.message : String(error)}`);
    }
});

let globalSolution: ClarionSolutionInfo | null = null;

// ✅ Initialize the token cache
const tokenCache = TokenCache.getInstance();

export let globalClarionSettings: any = {};

// Track last validated document versions to avoid duplicate work
const lastValidatedVersions = new Map<string, number>();

// ✅ Diagnostic validation function
async function validateTextDocument(document: TextDocument, caller: string = 'unknown'): Promise<void> {
    try {
        // Skip non-Clarion files
        if (!document.uri.toLowerCase().endsWith('.clw') &&
            !document.uri.toLowerCase().endsWith('.inc') &&
            !document.uri.toLowerCase().endsWith('.equ')) {
            return;
        }

        // 🚀 PERF: Skip if we just validated this exact version
        // Exception: cross-file re-validation must bypass this guard because the
        // document content hasn't changed but a *related* file has, so diagnostics
        // that reference the related file may now be stale.
        const lastVersion = lastValidatedVersions.get(document.uri);
        if (lastVersion === document.version && caller !== 'crossFileUpdate') {
            logger.info(`⚡ [DIAG] Skipping duplicate validation caller=${caller} v${document.version} uri=${document.uri}`);
            return;
        }

        // #158 — startup-perf instrumentation
        const validateStart = Date.now();
        if (!firstValidateFired) {
            firstValidateFired = true;
            perfLogger.perf("Phase: First validateTextDocument", {
                since_module_load_ms: validateStart - serverModuleLoadedAt,
                caller,
                uri: document.uri
            });
        }

        // Record version before any async work so duplicate-skip still works
        const startVersion = document.version;
        lastValidatedVersions.set(document.uri, document.version);

        // PERFORMANCE: Use cached tokens instead of re-tokenizing
        const tokens = getTokens(document);
        const syncStart = Date.now();
        const diagnostics = DiagnosticProvider.validateDocument(document, tokens, caller);
        const syncMs = Date.now() - syncStart;

        // #158 Phase B Priority 3 — skip async validators for libsrcPaths-hosted
        // files. Library files (StringTheory, ABC, etc.) are stable, read-only
        // by convention, and don't change based on user edits. Their async
        // diagnostics (discardedReturn / missingIncludes / undeclaredVar /
        // missingImpl) impose massive cost on large files (Mark's Phase A:
        // 13.9s on 72k-token StringTheory.clw) for ~zero user-actionable
        // value: users don't fix lint warnings inside library code they
        // didn't write.
        //
        // Trade-off: a user who DOES edit a libsrc file (e.g., extending
        // ABC) will silently miss async diagnostics. Acceptable per Bob's
        // dispatch — release-build trade-off for the perf win. Sync
        // diagnostics still run normally so syntax / structure errors
        // remain visible.
        //
        // Detection: case-insensitive prefix match of normalized
        // `document.uri` filesystem path against each `serverSettings.libsrcPaths`
        // entry. Uses the same URI → fs-path pattern as the rest of
        // server.ts (decodeURIComponent + replace).
        const docFsPath = decodeURIComponent(document.uri.replace(/^file:\/\/\/?/i, '')).replace(/\//g, '\\').toLowerCase();
        const isLibsrcFile = (serverSettings.libsrcPaths ?? []).some(libDir => {
            if (!libDir) return false;
            const normalizedLibDir = libDir.replace(/\//g, '\\').toLowerCase();
            return docFsPath.startsWith(normalizedLibDir + '\\') || docFsPath.startsWith(normalizedLibDir + '/');
        });

        if (isLibsrcFile) {
            // Send only sync diagnostics; skip the async Promise.all entirely.
            connection.sendDiagnostics({ uri: document.uri, diagnostics });
            perfLogger.perf("validateTextDocument libsrc-skip (async validators bypassed)", {
                total_ms: Date.now() - validateStart,
                sync_ms: syncMs,
                token_count: tokens.length,
                diag_count: diagnostics.length,
                uri: document.uri,
                caller
            });
            return;
        }

        // Send sync diagnostics immediately for fast feedback
        connection.sendDiagnostics({ uri: document.uri, diagnostics });

        // #158 Phase B addendum — defer async validators until solution-ready
        // when the caller is the initial `onDidOpen`. At t=63ms (first
        // onDidOpen), libsrcPaths is empty so the P3 libsrc-skip can't fire;
        // running the full async pass on a libsrc file like StringTheory.clw
        // burns ~14s of pointless work. By the time solutionReady fires
        // (~11s in), libsrcPaths is populated, and the drain loop hits the
        // now-effective P3 libsrc-skip on first deferred async pass.
        //
        // No-solution timeout fallback (registered at bottom of file) marks
        // pipeline ready after 2s if solutionReady never fires.
        if (!solutionPipelineReady && caller === 'onDidOpen') {
            deferredAsyncDocs.add(document.uri);
            perfLogger.perf("validateTextDocument async deferred (solution pending)", {
                total_ms: Date.now() - validateStart,
                sync_ms: syncMs,
                token_count: tokens.length,
                diag_count: diagnostics.length,
                uri: document.uri,
                caller
            });
            return;
        }

        // Async pass: detect discarded return values via cross-file type resolution
        const memberLocator = new MemberLocatorService();
        // Provide a live-document getter so validateMissingImplementations can read
        // open files even when the TokenCache has been cleared (e.g. structure-affecting edit).
        const getOpenDocumentContent = (absPath: string): string | null => {
            const normalizedPath = absPath.toLowerCase().replace(/\\/g, '/');
            for (const doc of documents.all()) {
                const docPath = decodeURIComponent(doc.uri.replace(/^file:\/\/\//i, '')).toLowerCase().replace(/\\/g, '/');
                if (docPath === normalizedPath) return doc.getText();
            }
            return null;
        };
        // 6b40d7da Phase B (#115): undeclared-variable validator runs in this async
        // pass for cross-file scope resolution via SymbolFinderService.
        const scopeAnalyzer = new ScopeAnalyzer(tokenCache, undefined as never);
        const symbolFinder = new SymbolFinderService(tokenCache, scopeAnalyzer);
        // #158 — per-validator timing. Wrap each Promise.all element with a
        // perf-timed shim that captures its individual wallclock.
        const asyncStart = Date.now();
        const timeIt = async <T>(name: string, p: Promise<T>): Promise<T> => {
            const t0 = Date.now();
            const result = await p;
            perfLogger.perf(`Validator ${name}`, {
                ms: Date.now() - t0,
                uri: document.uri
            });
            return result;
        };
        const [discardedReturnDiags, missingIncludeDiags, missingConstantsDiags, missingMapDeclDiags, missingImplDiags, undeclaredVarDiags, ifaceImplDiags] = await Promise.all([
            timeIt('discardedReturn', DiagnosticProvider.validateDiscardedReturnValues(tokens, document, memberLocator)),
            timeIt('missingIncludes', DiagnosticProvider.validateMissingIncludes(tokens, document)),
            timeIt('missingConstants', DiagnosticProvider.validateMissingConstants(tokens, document)),
            timeIt('missingMapDecl', DiagnosticProvider.validateMissingMapDeclarations(tokens, document)),
            timeIt('missingImpl', DiagnosticProvider.validateMissingImplementations(tokens, document, getOpenDocumentContent)),
            timeIt('undeclaredVar', DiagnosticProvider.validateUndeclaredVariables(tokens, document, symbolFinder)),
            timeIt('ifaceImpl', DiagnosticProvider.validateClassInterfaceImplementation(tokens, document, memberLocator)),
        ]);
        const asyncMs = Date.now() - asyncStart;

        // Stale-version guard: document may have changed while we were resolving types
        const currentDoc = documents.get(document.uri);
        if (!currentDoc || currentDoc.version !== startVersion) {
            perfLogger.perf("validateTextDocument stale-skip", {
                total_ms: Date.now() - validateStart,
                token_count: tokens.length,
                uri: document.uri,
                caller
            });
            return;
        }

        const asyncDiags = [...discardedReturnDiags, ...missingIncludeDiags, ...missingConstantsDiags, ...missingMapDeclDiags, ...missingImplDiags, ...undeclaredVarDiags, ...ifaceImplDiags];
        // Always send the final combined list so previously-raised async diagnostics
        // (e.g. map-impl-signature-mismatch) are cleared when they are no longer relevant.
        diagnostics.push(...asyncDiags);
        connection.sendDiagnostics({ uri: document.uri, diagnostics });

        // #158 — per-document final perf summary
        perfLogger.perf("validateTextDocument complete", {
            total_ms: Date.now() - validateStart,
            sync_ms: syncMs,
            async_ms: asyncMs,
            token_count: tokens.length,
            diag_count: diagnostics.length,
            uri: document.uri,
            caller
        });
    } catch (error) {
        logger.error(`❌ Error validating document: ${error instanceof Error ? error.message : String(error)}`);
    }
}

// ✅ Token Cache for Performance

// 🚀 PERF: Per-document debounce map
const debounceTimeouts = new Map<string, NodeJS.Timeout>();

// 🚀 PERF: Track documents being actively edited (serve stale tokens during typing)
const documentsBeingEdited = new Set<string>();

// 🚀 PERF: Track last processed document version to avoid redundant work
const lastProcessedVersions = new Map<string, number>();
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
        
        // 🚀 PERF: If document is being edited, return cached folding ranges immediately
        if (documentsBeingEdited.has(uri) && foldingCache.has(uri)) {
            logger.info(`⚡ [PERF] Document being edited, returning cached folding ranges`);
            return foldingCache.get(uri)!;
        }
        
        const tokenStart = performance.now();
        const tokens = getTokens(document);
        const tokenTime = performance.now() - tokenStart;
        
        // If tokenization took > 50ms, return cached folding ranges to avoid blocking the UI
        if (tokenTime > 50 && foldingCache.has(uri)) {
            logger.info(`⚡ [PERF] Returning cached folding ranges (tokenization took ${tokenTime.toFixed(0)}ms)`);
            return foldingCache.get(uri)!;
        }
        
        logger.info(`🔍 [DEBUG] Got ${tokens.length} tokens for folding ranges`);
        logger.perf('Folding: getTokens', { time_ms: tokenTime.toFixed(2), tokens: tokens.length });
        
        const foldStart = performance.now();
        const foldingProvider = new ClarionFoldingProvider(tokens, document);
        const ranges = foldingProvider.computeFoldingRanges();
        const foldTime = performance.now() - foldStart;
        
        // 🚀 PERF: Cache the folding ranges
        foldingCache.set(uri, ranges);
        
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

// Handle selection range requests (Shift+Alt+→ expand selection)
connection.onSelectionRanges((params) => {
    const document = documents.get(params.textDocument.uri);
    if (!document) return [];
    try {
        const provider = new SelectionRangeProvider();
        return provider.provideSelectionRanges(document, params.positions);
    } catch (error) {
        logger.error(`❌ Error providing selection ranges: ${error instanceof Error ? error.message : String(error)}`);
        return [];
    }
});

// Handle CodeLens requests — return unresolved lenses (ranges + data only)
connection.onCodeLens((params) => {
    // #185 — reference-count CodeLens is opt-out; when disabled, emit no lenses
    // so no reference searches run (resolveCodeLens is never called).
    if (!serverSettings.referencesCodeLensEnabled) return [];
    const document = documents.get(params.textDocument.uri);
    if (!document) return [];
    try {
        return codeLensProvider.provideCodeLenses(document);
    } catch (error) {
        logger.error(`❌ Error providing code lenses: ${error instanceof Error ? error.message : String(error)}`);
        return [];
    }
});

// Handle CodeLens resolve — fill in title + command by counting references
connection.onCodeLensResolve(async (lens) => {
    try {
        const data = lens.data as { uri: string; line: number; character: number; symbolName: string } | undefined;
        if (!data) return lens;

        const document = documents.get(data.uri);
        if (!document) return lens;

        const cacheKey = `${data.uri}:${data.line}:${data.character}`;
        const cached = codeLensRefCache.get(cacheKey);

        let refs: Location[] | null;
        if (cached) {
            refs = cached.refs;
        } else {
            refs = await referencesProvider.provideReferences(
                document,
                { line: data.line, character: data.character },
                { includeDeclaration: true }
            );
            const resolved = refs ?? [];
            // last dotted segment, e.g. "StringTheory.AddLine" -> "addline"; used for
            // name-based invalidation when an edit adds a new reference (#189 Phase 2).
            const shortName = (data.symbolName ?? '').split('.').pop()?.toLowerCase() ?? '';
            codeLensRefCache.set(cacheKey, { refs: resolved, shortName });
            // Track which files this symbol's references live in, so a later edit to one
            // of those files evicts this count (and only the affected counts).
            codeLensRefIndex.removeSymbol(cacheKey);
            for (const loc of resolved) {
                codeLensRefIndex.add(cacheKey, {
                    uri: loc.uri,
                    line: loc.range.start.line,
                    character: loc.range.start.character,
                });
            }
        }

        const count = refs?.length ?? 0;
        lens.command = {
            title: formatReferenceCount(count),
            command: 'clarion.showReferences',
            arguments: [
                data.uri,
                { line: data.line, character: data.character },
                refs ?? []
            ],
        };
    } catch (error) {
        logger.error(`❌ Error resolving code lens: ${error instanceof Error ? error.message : String(error)}`);
    }
    return lens;
});



/**
 * 🔍 Detect if a document edit may affect structure lifecycle
 * Structure-affecting edits require full re-tokenization to maintain correctness
 * 
 * An edit is structure-affecting if it involves:
 * - Structure keywords: IF, CASE, LOOP, CLASS, MAP, GROUP, QUEUE, RECORD, etc.
 * - Structure terminators: END, standalone dot (.)
 * - CODE keyword (starts executable section)
 * - Structural indentation changes (column 0 keywords)
 * 
 * @param document Current document state
 * @returns true if edit may affect structure lifecycle, false otherwise
 */
function isStructureAffectingEdit(document: TextDocument): boolean {
    // Get current document text
    const text = document.getText();
    
    // 🚀 PERF: Get cached tokens to detect what changed
    // If no cache exists, this is first edit - let incremental handle it
    const cached = tokenCache['cache'].get(document.uri);
    if (!cached || !cached.documentText) {
        return false; // No baseline to compare, incremental will handle
    }
    
    // 🚀 PERF: Quick length check - if document length changed significantly, likely structural
    const lengthDiff = Math.abs(text.length - cached.documentText.length);
    if (lengthDiff > 50) {
        return true; // Large changes likely affect structure
    }
    
    // 🔍 CORRECTNESS: Detect changed lines by comparing text
    const newLines = text.split(/\r?\n/);
    const oldLines = cached.documentText.split(/\r?\n/);
    
    // Check each changed line for structure-affecting keywords
    const maxLines = Math.max(newLines.length, oldLines.length);
    for (let i = 0; i < maxLines; i++) {
        const newLine = newLines[i] || '';
        const oldLine = oldLines[i] || '';
        
        if (newLine !== oldLine) {
            // Line changed - check if it contains structure-affecting content
            const combinedLine = (newLine + ' ' + oldLine).toUpperCase();
            
            // Check for structure keywords
            if (/\b(IF|CASE|LOOP|CLASS|MAP|GROUP|QUEUE|RECORD|FILE|INTERFACE|MODULE|EXECUTE|BEGIN|ACCEPT|ROUTINE|CODE|END)\b/.test(combinedLine)) {
                return true;
            }
            
            // Check for standalone dot (period not part of number/member access)
            // Pattern: whitespace followed by dot followed by whitespace/comment/EOL
            if (/\s+\.\s*(!|$)/.test(newLine) || /\s+\.\s*(!|$)/.test(oldLine)) {
                return true;
            }
        }
    }
    
    return false; // No structure-affecting changes detected
}

// ✅ Handle Content Changes (Recompute Tokens)
/**
 * After any file change, re-validate documents that share a PROGRAM/MEMBER relationship
 * with the changed file so cross-file diagnostics clear automatically:
 *   - PROGRAM file changed → re-validate open MEMBER files that reference it
 *   - MEMBER file changed  → re-validate the open PROGRAM file it references
 */
function revalidateRelatedDocuments(changedDocument: TextDocument, tokens: Token[]): void {
    try {
        const isProgramFile = tokens.some(t =>
            t.type === TokenType.ClarionDocument && t.value.toUpperCase() === 'PROGRAM' && t.line < 5
        );
        const memberToken = tokens.find(t =>
            t.type === TokenType.ClarionDocument && t.value.toUpperCase() === 'MEMBER' && t.line < 5 && t.referencedFile
        );

        if (isProgramFile) {
            // Re-validate any open MEMBER files that reference this PROGRAM file
            const changedBasename = path.basename(
                decodeURIComponent(changedDocument.uri.replace(/^file:\/\/\//i, ''))
            ).toLowerCase();
            for (const openDoc of documents.all()) {
                if (openDoc.uri === changedDocument.uri) continue;
                const openTokens = tokenCache.getCachedTokens(openDoc);
                if (!openTokens) continue;
                const openMemberToken = openTokens.find(t =>
                    t.type === TokenType.ClarionDocument && t.value.toUpperCase() === 'MEMBER' && t.referencedFile
                );
                if (openMemberToken?.referencedFile &&
                    path.basename(openMemberToken.referencedFile).toLowerCase() === changedBasename) {
                    validateTextDocument(openDoc, 'crossFileUpdate');
                }
            }
        }

        if (memberToken?.referencedFile) {
            // Re-validate the PROGRAM file this MEMBER file references (if it's open).
            // Avoid URI format mismatch (e.g. file:///f%3A vs file:///F:/) by comparing
            // normalised paths instead of constructing a URI and calling documents.get().
            const programBasename = path.basename(memberToken.referencedFile).toLowerCase();
            for (const openDoc of documents.all()) {
                if (openDoc.uri === changedDocument.uri) continue;
                const openPath = decodeURIComponent(openDoc.uri.replace(/^file:\/\/\//i, '')).replace(/\//g, '\\');
                if (path.basename(openPath).toLowerCase() === programBasename) {
                    validateTextDocument(openDoc, 'crossFileUpdate');
                }
            }
        }
    } catch (err) {
        logger.error(`❌ Error in revalidateRelatedDocuments: ${err instanceof Error ? err.message : String(err)}`);
    }
}

/**
 * #189 Phase 2 — evict only the CodeLens reference counts that an edit to `document`
 * can affect, instead of the old blunt "invalidate everything on any change". The
 * displayed count is unchanged (still refs.length from Find-All-References); this only
 * decides WHICH cached counts survive an edit, so switching between files keeps their
 * counts warm rather than recomputing on every keystroke.
 *
 * A count can change from an edit to this file in three ways, all covered:
 *   (a) the symbol is DECLARED here  (its own lens),
 *   (b) a reference to it LIVES here and was removed/changed (tracked via the index),
 *   (c) a reference to it was just ADDED here (its name now appears in the text).
 * (c) over-approximates (names in strings/comments included) — safe, worst case is an
 * extra recompute. Brand-new cross-file references still settle on the other file's
 * next change; closing that fully is Phase 4 (forward extraction).
 */
function invalidateCodeLensForFile(document: TextDocument): void {
    if (codeLensRefCache.size === 0) return;
    const uriLower = document.uri.toLowerCase();
    const toEvict = new Set<string>();

    // (a) symbols declared in this file — cacheKey is `${uri}:${line}:${char}`
    for (const key of codeLensRefCache.keys()) {
        if (key.toLowerCase().startsWith(uriLower + ':')) toEvict.add(key);
    }

    // (b) symbols whose references live in this file (removed/changed calls)
    for (const key of codeLensRefIndex.keysReferencingFile(document.uri)) toEvict.add(key);

    // (c) symbols whose name now appears in this file (newly-added calls)
    const names = document.getText().match(/[A-Za-z_]\w*/g);
    if (names) {
        const nameSet = new Set(names.map(n => n.toLowerCase()));
        for (const [key, entry] of codeLensRefCache) {
            if (entry.shortName && nameSet.has(entry.shortName)) toEvict.add(key);
        }
    }

    for (const key of toEvict) {
        codeLensRefCache.delete(key);
        codeLensRefIndex.removeSymbol(key);
    }
}

documents.onDidChangeContent(event => {
    try {
        const document = event.document;
        const uri = document.uri;
        const currentVersion = document.version;
        
        // 🚀 PERF: Skip if we've already processed this version
        const lastVersion = lastProcessedVersions.get(uri);
        if (lastVersion !== undefined && lastVersion >= currentVersion) {
            logger.info(`⏭️ Skipping duplicate onDidChangeContent: ${uri} version=${currentVersion} (already processed ${lastVersion})`);
            return;
        }
        
        logger.info(`📝 onDidChangeContent: ${uri} version=${currentVersion}`);
        
        // #189 Phase 2: invalidate only the CodeLens counts this edit can affect,
        // instead of every cached count. Counts for other files stay warm.
        invalidateCodeLensForFile(document);

        // Skip XML files
        if (uri.toLowerCase().endsWith('.xml') || uri.toLowerCase().endsWith('.cwproj')) {
            return;
        }

        // Update last processed version
        lastProcessedVersions.set(uri, currentVersion);

        // 🚀 PERF: Per-document debounce - clear existing timeout for THIS document
        const existingTimeout = debounceTimeouts.get(uri);
        if (existingTimeout) {
            logger.info(`🔄 Resetting debounce for: ${uri}`);
            clearTimeout(existingTimeout);
        }

        // 🚀 PERF: Mark document as being edited (serve stale tokens)
        documentsBeingEdited.add(uri);
        
        // 🚀 PERF: Invalidate caches immediately so fresh data is computed after debounce
        symbolCache.delete(uri);
        foldingCache.delete(uri);
        
        // Invalidate cross-file cache for this document
        const filePath = decodeURIComponent(uri.replace('file:///', ''));
        hoverProvider.invalidateCache(filePath);

        // 🔍 CORRECTNESS: Check if this edit affects structure lifecycle
        // If so, clear token cache to force full re-tokenization
        // Otherwise, let incremental tokenization optimize performance
        const isStructureAffecting = isStructureAffectingEdit(document);
        if (isStructureAffecting) {
            logger.info(`🔄 Structure-affecting edit detected, clearing token cache for: ${uri}`);
            tokenCache.clearTokens(uri);
        }

        // 🚀 PERF: Don't clear cache until debounce completes
        // This allows other features to use stale tokens while user is typing
        const timeout = setTimeout(async () => {
            try {
                logger.info(`🔍 Debounce timeout triggered, refreshing tokens for: ${uri}`);
                
                // Clear "being edited" flag FIRST
                documentsBeingEdited.delete(uri);
                
                // Caches already cleared immediately on change - no need to clear again
                
                // Token cache already cleared if structure-affecting (above)
                // Otherwise incremental tokenization will handle it efficiently
                const tokensStart = performance.now();
                const tokens = getTokens(document);
                const tokensMs = (performance.now() - tokensStart).toFixed(1);
                logger.info(`⏱️ [SERVER] getTokens: ${tokensMs}ms, ${tokens.length} tokens for ${path.basename(decodeURIComponent(uri))}`);
                logger.info(`🔍 Successfully refreshed tokens after edit: ${uri}, got ${tokens.length} tokens`);
                
                // Remove stale duplicate cache entries for this URI (e.g., file:///f:/ vs file:///f%3A/)
                // CrossFileResolver may have created unencoded-URI entries from disk reads; these
                // become stale after VS Code updates the document via the encoded URI.
                const normalizedUri = decodeURIComponent(uri.replace(/^file:\/\/\//i, '')).toLowerCase().replace(/\\/g, '/');
                for (const cachedUri of tokenCache.getAllCachedUris()) {
                    if (cachedUri !== uri) {
                        const cachedNorm = decodeURIComponent(cachedUri.replace(/^file:\/\/\//i, '')).toLowerCase().replace(/\\/g, '/');
                        if (cachedNorm === normalizedUri) {
                            tokenCache.clearTokens(cachedUri);
                        }
                    }
                }

                // Validate document using fresh tokens
                validateTextDocument(document, 'onDidChangeContent');

                // Re-validate any related PROGRAM/MEMBER files so cross-file diagnostics clear
                revalidateRelatedDocuments(document, tokens);

                // Update file relationship graph edges for this file
                const { FileRelationshipGraph } = await import('./FileRelationshipGraph');
                FileRelationshipGraph.getInstance().updateFile(uri).catch(err =>
                    logger.error(`❌ [FRG] updateFile failed for ${uri}: ${err}`)
                );

                // 🔄 Notify client that document symbols have changed
                // This triggers structure view to refresh with fresh symbols
                connection.sendNotification('clarion/symbolsRefreshed', { uri });
                
                // Clean up timeout from map
                debounceTimeouts.delete(uri);
            } catch (tokenError) {
                logger.error(`❌ Error refreshing tokens in debounce: ${tokenError instanceof Error ? tokenError.message : String(tokenError)}`);
                documentsBeingEdited.delete(uri); // Cleanup on error
            }
        }, 500);
        
        // Store timeout for this document
        debounceTimeouts.set(uri, timeout);
    } catch (error) {
        logger.error(`❌ Error in onDidChangeContent: ${error instanceof Error ? error.message : String(error)}`);
        logger.error(`❌ Error stack: ${error instanceof Error && error.stack ? error.stack : 'No stack available'}`);
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


// Cache for document symbols to avoid recomputing during rapid typing
const symbolCache = new Map<string, DocumentSymbol[]>();
const foldingCache = new Map<string, FoldingRange[]>();

connection.onDocumentLinks((params: DocumentLinkParams): DocumentLink[] => {
    const document = documents.get(params.textDocument.uri);
    if (!document) return [];
    return documentLinkProvider.provideDocumentLinks(document);
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

        logger.info(`📂 [DEBUG] Computing document symbols for: ${uri}, language: ${document.languageId}`);
        
        const tokenStart = performance.now();
        const tokens = getTokens(document);  // ✅ No need for async
        const tokenTime = performance.now() - tokenStart;
        
        // If tokenization took > 50ms, return cached symbols to avoid blocking the UI
        if (tokenTime > 50 && symbolCache.has(uri)) {
            logger.info(`⚡ [PERF] Returning cached symbols (tokenization took ${tokenTime.toFixed(0)}ms)`);
            return symbolCache.get(uri)!;
        }
        
        logger.info(`🔍 [DEBUG] Got ${tokens.length} tokens for document symbols`);
        logger.perf('Symbols: getTokens', { time_ms: tokenTime.toFixed(2), tokens: tokens.length });
        
        const symbolStart = performance.now();
        const symbols = clarionDocumentSymbolProvider.provideDocumentSymbols(tokens, uri, document);
        const symbolTime = performance.now() - symbolStart;
        
        // Cache the symbols for quick retrieval during typing
        symbolCache.set(uri, symbols);
        
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
            symbolCache.delete(uri);
            foldingCache.delete(uri);
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
    undeclaredVariablesEnabled?: boolean; // #62 opt-in
    indistinguishablePrototypesEnabled?: boolean; // #121 opt-in
    referencesCodeLensEnabled?: boolean; // #185 opt-out
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

        // Clear the SDI cache so any stale empty index (built before redirectionFile was known)
        // is discarded — it will be rebuilt with correct paths by the setImmediate below.
        if (params.redirectionFile) {
            const { StructureDeclarationIndexer } = await import('./utils/StructureDeclarationIndexer');
            StructureDeclarationIndexer.getInstance().clearCache();
            logger.info("🗑️ SDI cache cleared — will rebuild with correct redirection paths");
        }
        
        // Update default lookup extensions if provided
        if (params.defaultLookupExtensions && params.defaultLookupExtensions.length > 0) {
            serverSettings.defaultLookupExtensions = params.defaultLookupExtensions;
            logger.info(`✅ Updated default lookup extensions: ${params.defaultLookupExtensions.join(', ')}`);
        }

        // Preserve the constructor default when a (legacy) client doesn't include
        // the field. Only an explicit boolean from the client wins. (#62 fix)
        if (params.undeclaredVariablesEnabled !== undefined) {
            serverSettings.undeclaredVariablesEnabled = params.undeclaredVariablesEnabled === true;
        }
        if (params.indistinguishablePrototypesEnabled !== undefined) {
            serverSettings.indistinguishablePrototypesEnabled = params.indistinguishablePrototypesEnabled === true;
        }
        if (params.referencesCodeLensEnabled !== undefined) {
            serverSettings.referencesCodeLensEnabled = params.referencesCodeLensEnabled === true;
        }

        // Always-visible startup summary of Clarion folder configuration
        // Use logger.error so it's visible even when log level is set to "error"
        logger.test(`\n📦 Clarion Extension — Solution Load\n` +
            `  Solution : ${params.solutionFilePath || '(none)'}\n` +
            `  Version  : ${params.clarionVersion || '(unknown)'}\n` +
            `  Config   : ${params.configuration || '(none)'}\n` +
            `  Red. File: ${params.redirectionFile || '(none)'}\n` +
            `  Red. Path: ${(params.redirectionPaths || []).join('; ') || '(none)'}\n` +
            `  LibSrc   : ${(params.libsrcPaths || []).join('\n           : ') || '(none)'}\n` +
            `  Proj.Dir : ${(params.projectPaths || []).join('\n           : ') || '(none)'}\n` +
            `  Macros   : ${Object.keys(params.macros || {}).length} defined`
        );

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
            logger.info(`⏱️ [STARTUP] Solution build started at +${Date.now() - (globalStartTime ?? Date.now())}ms`);
            logger.info(`🔄 Building solution...`);
            globalSolution = await buildClarionSolution();
            const buildEndTime = performance.now();
            logger.info(`⏱️ [STARTUP] Solution build done: ${globalSolution.projects.length} projects, ${globalSolution.projects.reduce((n, p) => n + p.sourceFiles.length, 0)} source files in ${(buildEndTime - buildStartTime).toFixed(0)}ms`);
            logger.info(`✅ Solution built successfully with ${globalSolution.projects.length} projects in ${(buildEndTime - buildStartTime).toFixed(2)}ms`);
            
            // Always-visible project summary
            const projectSummary = globalSolution.projects.map((p, i) =>
                `  [${i+1}] ${p.name}  (${p.sourceFiles.length} sources)  ${p.path}`
            ).join('\n');
            logger.test(`\n✅ Solution ready: ${globalSolution.name}\n` +
                `  Projects (${globalSolution.projects.length}):\n` +
                (projectSummary || '  (none)'));
            
            // Notify the client that the solution is ready so it can defer refreshOpenDocuments
            // until after we have real project data (avoids flooding the LSP pipe with
            // thousands of clarion/findFile requests when getSolutionTree returns 0 projects).
            connection.sendNotification('clarion/solutionReady', {
                solutionFilePath: solutionPath,
                projectCount: globalSolution.projects.length
            });
            logger.info(`⏱️ [STARTUP] clarion/solutionReady sent: ${globalSolution.projects.length} projects`);
            perfLogger.perf("Phase: Solution loaded (clarion/solutionReady sent)", {
                since_module_load_ms: Date.now() - serverModuleLoadedAt,
                project_count: globalSolution.projects.length
            });

            // Re-validate all open documents now that cross-file type info is available.
            // The async diagnostic pass (discarded return value detection) needs the solution
            // to be ready; it may have already run (and silently skipped resolutions) before
            // this point, so force a fresh pass on every open file.
            logger.info("🔁 Re-validating open documents after solution ready...");
            const revalDispatchStart = Date.now();
            const openDocs = documents.all();
            lastValidatedVersions.clear();

            // #158 Phase B addendum — mark pipeline ready BEFORE the
            // re-validation loop so deferred docs hit the (now-effective) P3
            // libsrc-skip on their first async pass. `documents.all()`
            // already covers every doc (including the deferred ones), so
            // calling `validateTextDocument` on each is sufficient — no
            // separate `deferredAsyncDocs` drain loop needed. Clear the set
            // for hygiene.
            solutionPipelineReady = true;
            const deferredCount = deferredAsyncDocs.size;
            deferredAsyncDocs.clear();

            for (const doc of openDocs) {
                validateTextDocument(doc, 'solutionReady');
            }
            perfLogger.perf("Phase: Post-solution re-validation dispatched", {
                dispatch_ms: Date.now() - revalDispatchStart,
                doc_count: openDocs.length,
                deferred_drained: deferredCount,
                since_module_load_ms: Date.now() - serverModuleLoadedAt
            });
            // NOTE: dispatch_ms only measures the synchronous loop. Each
            // validateTextDocument runs async; individual completion times appear
            // as `validateTextDocument complete` perf entries above.

            // Doc-link refresh post-solution-ready. DocumentLinkProvider uses
            // FRG, which isn't ready until solution-load completes; editors
            // request links right after onDidOpen and cache the empty result.
            // Custom notification (rather than a standard LSP refresh request,
            // which doesn't exist for document links — see GH #160). Client
            // re-invokes the provider per visible editor.
            connection.sendNotification('clarion/refreshDocumentLinks');
            logger.info("🔗 Document-link refresh notification sent to client");

            // Pre-build structure declaration index for all project paths in the background.
            // Without this, the first hover on a CLASS/INTERFACE/EQUATE etc. triggers a full scan
            // of all .inc files (potentially thousands), causing a 4-5s freeze.
            setImmediate(async () => {
                const { StructureDeclarationIndexer } = await import('./utils/StructureDeclarationIndexer');
                const indexer = StructureDeclarationIndexer.getInstance();
                const projectPaths = [...new Set(
                    globalSolution!.projects.map(p => p.path).filter(Boolean)
                )];
                const sdiStart = Date.now();
                logger.info(`⏱️ [STARTUP] SDI build starting for ${projectPaths.length} project(s) at +${sdiStart - globalStartTime}ms`);
                await Promise.all(projectPaths.map(p =>
                    indexer.getOrBuildIndex(p).catch(err =>
                        logger.error(`❌ [INDEX] Background build failed for ${p}: ${err}`)
                    )
                ));
                logger.info(`⏱️ [STARTUP] SDI build complete in ${Date.now() - sdiStart}ms (total +${Date.now() - globalStartTime}ms)`);
            });
            
            // Build the file-relationship graph (MODULE/INCLUDE/MEMBER edges) in the background.
            // Enables O(1) reverse lookups for local MAP scope (#91) and include chains (#52).
            setImmediate(async () => {
                const { FileRelationshipGraph } = await import('./FileRelationshipGraph');
                const graph = FileRelationshipGraph.getInstance();
                const solutionManager = SolutionManager.getInstance();
                const allFiles: string[] = [];
                if (solutionManager?.solution) {
                    for (const project of solutionManager.solution.projects) {
                        for (const sourceFile of project.sourceFiles) {
                            const absPath = sourceFile.getAbsolutePath();
                            if (absPath) allFiles.push(absPath);
                        }
                    }
                }
                const frgStart = Date.now();
                logger.info(`⏱️ [STARTUP] FRG build starting for ${allFiles.length} source file(s) at +${frgStart - globalStartTime}ms`);
                connection.sendNotification('clarion/graphStatus', { status: 'building', fileCount: allFiles.length });
                await graph.buildInBackground(allFiles).catch(err =>
                    logger.error(`❌ [FRG] Background build failed: ${err}`)
                );
                logger.info(`⏱️ [STARTUP] FRG build complete in ${Date.now() - frgStart}ms (total +${Date.now() - globalStartTime}ms)`);
                connection.sendNotification('clarion/graphStatus', {
                    status: 'built',
                    fileCount: graph.fileCount,
                    edgeCount: graph.edgeCount,
                    durationMs: graph.buildDurationMs
                });
            });

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


// Re-validate all open documents when a .cwproj changes (e.g. after addClassConstants).
// The source .clw hasn't changed so the LSP wouldn't otherwise re-run diagnostics.
connection.onNotification('clarion/projectConstantsChanged', () => {
    logger.test('📥 clarion/projectConstantsChanged — re-validating all open documents');
    // Clear the version-skip cache so validateTextDocument doesn't skip documents
    // whose source hasn't changed but whose cwproj has.
    lastValidatedVersions.clear();
    for (const document of documents.all()) {
        validateTextDocument(document).catch(err =>
            logger.error(`❌ Re-validation error for ${document.uri}: ${err}`)
        );
    }
    // Reset file relationship graph — project file list may have changed
    import('./FileRelationshipGraph').then(({ FileRelationshipGraph }) => {
        FileRelationshipGraph.getInstance().reset();
    });
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

// Add a handler for finding files using the server-side redirection parser.
// No-solution-mode resolution (#113): when SolutionManager is null, walk
// localDir(sourceUri) → serverSettings.libsrcPaths → extension fallback.
// Substrate: serverSettings.libsrcPaths is version-bound per dd87633f B1.
connection.onRequest('clarion/findFile', async (params: { filename: string, sourceUri?: string }): Promise<{ path: string, source: string }> => {
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
            // No-solution mode (#113): delegate to the resolver in findFileNoSolution.ts
            // (extracted for testability — see server/src/test/FindFile.NoSolutionResolution.test.ts).
            const noSolutionHit = resolveFileInNoSolutionMode(params.filename, params.sourceUri);
            if (noSolutionHit) {
                logger.info(`✅ Found file (no-solution): ${noSolutionHit.path} (source: ${noSolutionHit.source})`);
                return noSolutionHit;
            }

            // Silent-miss diagnostic: if libsrcPaths is empty here, the user likely
            // has no Clarion version selected (ensureActiveClarionVersion did not
            // populate the substrate). Surface this in logs so misses are traceable.
            if (!serverSettings.libsrcPaths?.length) {
                logger.warn(`[clarion/findFile] no-solution mode, libsrcPaths empty — no Clarion version selected?`);
            }
            logger.warn(`⚠️ File not found (no-solution mode): ${params.filename}`);
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

// Get all CLW-candidate directories from the redirection file for a project
connection.onRequest('clarion/getClwDirectories', (params: { projectGuid: string }): { label: string; dir: string; section: string }[] => {
    logger.info(`🔍 getClwDirectories for project ${params.projectGuid}`);
    try {
        const sm = SolutionManager.getInstance();
        const project = sm?.solution?.projects.find(p => p.guid === params.projectGuid);
        if (!project) {
            logger.warn(`⚠️ Project ${params.projectGuid} not found`);
            return [];
        }
        return project.getClwDirectories();
    } catch (error) {
        logger.error(`❌ getClwDirectories error: ${error instanceof Error ? error.message : String(error)}`);
        return [];
    }
});

// Create a new member CLW module and register it in the project
connection.onRequest('clarion/addModuleWithProcedure', async (params: {
    projectGuid: string;
    moduleName: string;
    procedureName: string;
    targetDir: string;
    firstClwFile: string;
    indentString: string;
    isLocalMap?: boolean;
    prototypeStyle?: string;
}): Promise<{ success: boolean; filePath: string }> => {
    logger.info(`🔄 addModuleWithProcedure: ${params.moduleName}`);
    try {
        const sm = SolutionManager.getInstance();
        const project = sm?.solution?.projects.find(p => p.guid === params.projectGuid);
        if (!project) {
            logger.warn(`⚠️ Project ${params.projectGuid} not found`);
            return { success: false, filePath: '' };
        }
        const result = await project.addModuleWithProcedure(
            params.moduleName,
            params.procedureName,
            params.targetDir,
            params.firstClwFile,
            params.indentString,
            params.isLocalMap ?? false,
            params.prototypeStyle ?? 'keyword'
        );
        if (result.success) {
            try {
                globalSolution = await buildClarionSolution();
            } catch (buildError: any) {
                logger.error(`❌ Error rebuilding solution after addModuleWithProcedure: ${buildError.message || buildError}`);
            }
        }
        return result;
    } catch (error) {
        logger.error(`❌ addModuleWithProcedure error: ${error instanceof Error ? error.message : String(error)}`);
        return { success: false, filePath: '' };
    }
});

// Resolve the absolute path of a CLW file referenced by a MODULE token
connection.onRequest('clarion/resolveModuleClwPath', (params: {
    referencedFile: string;
    projectGuid: string;
}): { clwFilePath: string } | null => {
    try {
        const sm = SolutionManager.getInstance();
        const projects = sm?.solution?.projects ?? [];

        const project = params.projectGuid
            ? projects.find(p => p.guid === params.projectGuid)
            : projects[0];

        if (!project) {
            logger.warn(`⚠️ resolveModuleClwPath: no project found`);
            return null;
        }

        const sf = project.findSourceFileByName(params.referencedFile);
        if (!sf) {
            logger.warn(`⚠️ resolveModuleClwPath: ${params.referencedFile} not in project source files`);
            return null;
        }

        const clwFilePath = path.join(project.path, sf.relativePath || sf.name);
        logger.info(`✅ resolveModuleClwPath: ${clwFilePath}`);
        return { clwFilePath };
    } catch (error) {
        logger.error(`❌ resolveModuleClwPath error: ${error instanceof Error ? error.message : String(error)}`);
        return null;
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
    const symbols = clarionDocumentSymbolProvider.provideDocumentSymbols(tokens, params.uri, document);
    logger.info(`✅ [Server] Returning ${symbols.length} symbols`);
    return symbols;
});

// Handle definition requests
connection.onDefinition(async (params) => {
    
    if (!serverInitialized) {
        logger.info(`⚠️ [DELAY] Server not initialized yet, delaying definition request`);
        return null;
    }
    
    const document = documents.get(params.textDocument.uri);
    if (!document) {
        logger.test(`⚠️ [SERVER] Document not found for definition: ${params.textDocument.uri}`);
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

// Handle implementation requests
connection.onImplementation(async (params) => {
    logger.info(`⏱️ [SERVER] onImplementation received: ${params.textDocument.uri.split('/').pop()} at ${params.position.line}:${params.position.character}`);
    
    if (!serverInitialized) {
        logger.info(`⚠️ [DELAY] Server not initialized yet, delaying implementation request`);
        return null;
    }
    
    const document = documents.get(params.textDocument.uri);
    if (!document) {
        logger.info(`⚠️ Document not found: ${params.textDocument.uri}`);
        return null;
    }
    
    try {
        const implementation = await implementationProvider.provideImplementation(document, params.position);
        if (implementation) {
            logger.info(`✅ Found implementation for ${params.textDocument.uri}`);
        } else {
            logger.info(`⚠️ No implementation found for ${params.textDocument.uri}`);
        }
        return implementation;
    } catch (error) {
        logger.error(`❌ Error providing implementation: ${error instanceof Error ? error.message : String(error)}`);
        return null;
    }
});

// Handle find all references requests
connection.onReferences(async (params: ReferenceParams) => {
    logger.info(`📂 Received references request for: ${params.textDocument.uri} at ${params.position.line}:${params.position.character}`);

    if (!serverInitialized) {
        logger.info(`⚠️ [DELAY] Server not initialized yet, delaying references request`);
        return null;
    }

    const document = documents.get(params.textDocument.uri);
    if (!document) {
        logger.info(`⚠️ Document not found: ${params.textDocument.uri}`);
        return null;
    }

    try {
        const references = await Promise.race([
            referencesProvider.provideReferences(document, params.position, params.context),
            new Promise<null>(resolve => setTimeout(() => resolve(null), 15000))
        ]);
        logger.info(references ? `✅ Found ${references.length} reference(s)` : `⚠️ No references found`);
        return references;
    } catch (error) {
        logger.error(`❌ Error providing references: ${error instanceof Error ? error.message : String(error)}`);
        return null;
    }
});

// Handle prepareRename (validation before rename input box appears)
connection.onPrepareRename(async (params) => {
    if (!serverInitialized) return null;

    const document = documents.get(params.textDocument.uri);
    if (!document) return null;

    try {
        return await renameProvider.prepareRename(document, params.position);
    } catch (error: any) {
        // Re-throw ResponseErrors so VS Code shows the message inline
        throw error;
    }
});

// Handle rename requests
connection.onRenameRequest(async (params: RenameParams) => {
    if (!serverInitialized) return null;

    const document = documents.get(params.textDocument.uri);
    if (!document) return null;

    try {
        return await renameProvider.provideRename(document, params.position, params.newName);
    } catch (error) {
        logger.error(`❌ Error providing rename: ${error instanceof Error ? error.message : String(error)}`);
        return null;
    }
});

// Handle document highlight requests
connection.onDocumentHighlight(async (params) => {
    if (!serverInitialized) return null;

    const document = documents.get(params.textDocument.uri);
    if (!document) return null;

    try {
        return await documentHighlightProvider.provideDocumentHighlights(document, params.position);
    } catch (error) {
        logger.error(`❌ Error providing document highlights: ${error instanceof Error ? error.message : String(error)}`);
        return null;
    }
});

// Handle workspace symbol search
connection.onWorkspaceSymbol(async (params, token) => {
    if (!serverInitialized) return [];

    try {
        return await workspaceSymbolProvider.provideWorkspaceSymbols(params.query, token);
    } catch (error) {
        logger.error(`❌ Error providing workspace symbols: ${error instanceof Error ? error.message : String(error)}`);
        return [];
    }
});

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

// Handle code actions (lightbulb) requests
connection.onCodeAction(async (params) => {
    logger.info(`⏱️ [CODE-ACTION] ▶ triggered line=${params.range.start.line} file="${params.textDocument.uri.split('/').pop()}"`);
    
    if (!serverInitialized) {
        logger.info(`⏱️ [CODE-ACTION] ⚠ server not initialized, returning []`);
        return [];
    }
    
    const document = documents.get(params.textDocument.uri);
    if (!document) {
        logger.info(`⏱️ [CODE-ACTION] ⚠ document not found`);
        return [];
    }
    
    try {
        const caStart = Date.now();

        const t0 = Date.now();
        logger.info(`⏱️ [CODE-ACTION] ClassConstants starting`);
        const codeActionProvider = new ClassConstantsCodeActionProvider();
        const actions = await codeActionProvider.provideCodeActions(
            document,
            params.range,
            params.context,
            params as any
        );
        logger.info(`⏱️ [CODE-ACTION] ClassConstants done: ${Date.now() - t0}ms → ${actions.length} actions`);

        const t2 = Date.now();
        const flattenProvider = new FlattenCodeActionProvider();
        const flattenActions = flattenProvider.provideCodeActions(document, params.range);
        logger.info(`⏱️ [CODE-ACTION] Flatten done: ${Date.now() - t2}ms → ${flattenActions.length} actions`);

        const t4 = Date.now();
        const mapModuleProvider = new MapModuleCodeActionProvider();
        const mapModuleActions = mapModuleProvider.provideCodeActions(document, params.range);
        logger.info(`⏱️ [CODE-ACTION] MapModule done: ${Date.now() - t4}ms → ${mapModuleActions.length} actions`);

        const t6 = Date.now();
        const mapDeclProvider = new MapDeclarationCodeActionProvider();
        const mapDeclActions = mapDeclProvider.provideCodeActions(document, params.range, params.context);
        logger.info(`⏱️ [CODE-ACTION] MapDecl done: ${Date.now() - t6}ms → ${mapDeclActions.length} actions`);

        const t8 = Date.now();
        const unicodeProvider = new UnicodeCodeActionProvider();
        const unicodeActions = unicodeProvider.provideCodeActions(document, params.range, params.context);
        logger.info(`⏱️ [CODE-ACTION] Unicode done: ${Date.now() - t8}ms → ${unicodeActions.length} actions`);

        const allActions = [...actions, ...flattenActions, ...mapModuleActions, ...mapDeclActions, ...unicodeActions];
        logger.info(`⏱️ [CODE-ACTION] ■ total ${Date.now() - caStart}ms → ${allActions.length} actions returned`);
        return allActions;
    } catch (error) {
        logger.error(`❌ Error providing code actions: ${error instanceof Error ? error.message : String(error)}`);
        return [];
    }
});

// Handle signature help requests
connection.onSignatureHelp(async (params) => {
    logger.debug(`🔔 [SIG-HELP] Received signature help request for: ${params.textDocument.uri} at position ${params.position.line}:${params.position.character}`);
    
    if (!serverInitialized) {
        logger.debug(`⚠️ [SIG-HELP] Server not initialized yet, delaying signature help request`);
        return undefined;
    }
    
    const document = documents.get(params.textDocument.uri);
    if (!document) {
        logger.debug(`⚠️ [SIG-HELP] Document not found: ${params.textDocument.uri}`);
        return undefined;
    }
    
    try {
        const signatureHelp = await signatureHelpProvider.provideSignatureHelp(document, params.position);
        if (signatureHelp) {
            logger.debug(`✅ [SIG-HELP] Found ${signatureHelp.signatures.length} signature(s) for ${params.textDocument.uri}`);
            logger.debug(`✅ [SIG-HELP] Active signature: ${signatureHelp.activeSignature}, Active parameter: ${signatureHelp.activeParameter}`);
            // Convert undefined to null for activeSignature and activeParameter to match protocol
            return {
                ...signatureHelp,
                activeSignature: signatureHelp.activeSignature ?? null,
                activeParameter: signatureHelp.activeParameter ?? null
            };
        } else {
            logger.debug(`⚠️ [SIG-HELP] No signature help found for ${params.textDocument.uri}`);
        }
        return signatureHelp || undefined;
    } catch (error) {
        console.error(`❌ [SIG-HELP] Error providing signature help: ${error instanceof Error ? error.message : String(error)}`);
        console.error(`❌ [SIG-HELP] Stack: ${error instanceof Error ? error.stack : 'No stack'}`);
        return undefined;
    }
});

// ✅ Handle Completion Request (dot-triggered member completion)
connection.onCompletion(async (params) => {
    try {
        const document = documents.get(params.textDocument.uri);
        if (!document || !serverInitialized) return [];
        return await completionProvider.onCompletion(params, document);
    } catch (error) {
        logger.error(`❌ [COMPLETION] Error: ${error instanceof Error ? error.message : String(error)}`);
        return [];
    }
});

// ✅ Handle Semantic Tokens Request
connection.languages.semanticTokens.on((params) => {
    const perfStart = performance.now();
    try {
        logger.info(`🎨 [DEBUG] Received semantic tokens request for: ${params.textDocument.uri}`);
        const document = documents.get(params.textDocument.uri);
        if (!document) {
            logger.warn(`⚠️ [DEBUG] Document not found for semantic tokens: ${params.textDocument.uri}`);
            return { data: [] };
        }

        const uri = document.uri;
        
        // Get tokens from cache (uses incremental tokenization automatically)
        const tokenStart = performance.now();
        const tokens = getTokens(document);
        const tokenTime = performance.now() - tokenStart;
        
        logger.info(`🎨 [DEBUG] Got ${tokens.length} tokens for semantic tokens`);
        logger.perf('SemanticTokens: getTokens', { time_ms: tokenTime.toFixed(2), tokens: tokens.length });
        
        // Generate semantic tokens
        const semanticStart = performance.now();
        const semanticTokens = clarionSemanticTokensProvider.provideSemanticTokens(tokens);
        const semanticTime = performance.now() - semanticStart;
        
        const totalTime = performance.now() - perfStart;
        logger.info(`🎨 [DEBUG] Generated semantic tokens for: ${uri} in ${totalTime.toFixed(2)}ms (tokenize: ${tokenTime.toFixed(2)}ms, semantic: ${semanticTime.toFixed(2)}ms)`);
        logger.perf('SemanticTokens: total', { 
            time_ms: totalTime.toFixed(2), 
            tokenize_ms: tokenTime.toFixed(2),
            semantic_ms: semanticTime.toFixed(2),
            data_length: semanticTokens.data.length 
        });
        
        return semanticTokens;
    } catch (error) {
        logger.error(`❌ [DEBUG] Error providing semantic tokens: ${error instanceof Error ? error.message : String(error)}`);
        return { data: [] };
    }
});





// Note: Duplicate onInitialize/onInitialized handlers removed - see lines 89-172 for the active handlers

// ✅ Start Listening
documents.listen(connection);

// Add shutdown handlers
connection.onShutdown(() => {
    logger.setLevel("error");
    const shutdownLogPath = path.join(__dirname, '..', '..', 'shutdown.log');
    const logMessage = (msg: string) => {
        const timestamp = new Date().toISOString();
        const fullMsg = `[${timestamp}] ${msg}\n`;
        logger.info(msg);
        console.error(`🛑 ${msg}`);
        try {
            fs.appendFileSync(shutdownLogPath, fullMsg);
        } catch (e) {
            console.error("Failed to write to shutdown log:", e);
        }
    };
    
    logMessage("SERVER SHUTDOWN: onShutdown handler called");
    logMessage(`SERVER SHUTDOWN: Active documents: ${documents.all().length}`);
    logMessage("SERVER SHUTDOWN: Clearing caches...");
    
    return new Promise((resolve) => {
        setTimeout(() => {
            logMessage("SERVER SHUTDOWN: Shutdown handler complete");
            resolve();
        }, 100);
    });
});

connection.onExit(() => {
    const timestamp = new Date().toISOString();
    logger.info("SERVER EXIT: onExit handler called");
    console.error(`🛑 SERVER EXIT: onExit handler called at ${timestamp}`);
    const shutdownLogPath = path.join(__dirname, '..', '..', 'shutdown.log');
    try {
        fs.appendFileSync(shutdownLogPath, `[${timestamp}] SERVER EXIT: onExit handler called\n`);
    } catch (e) {
        // Ignore - server is exiting anyway
    }
});

// #158 Phase B addendum — no-solution-mode safety net for deferred async
// queue. If `clarion/solutionReady` never fires within 2s of server start
// (loose `.clw` opened in a non-Clarion workspace), mark the pipeline ready
// + drain the queue so deferred docs get their async pass.
//
// 2s threshold rationale: solutionReady on Mark's setup arrives at ~11s;
// real no-solution-mode workspaces produce no solutionReady at all. 2s is
// well under perceived-startup-blocking; loose-file users wait 2s for
// async diagnostics instead of getting them at t=63ms. Acceptable trade.
setTimeout(() => {
    if (!solutionPipelineReady) {
        perfLogger.perf("Phase B addendum — no-solution timeout fired, draining deferred async queue", {
            since_module_load_ms: Date.now() - serverModuleLoadedAt,
            deferred_count: deferredAsyncDocs.size
        });
        solutionPipelineReady = true;
        const queuedUris = Array.from(deferredAsyncDocs);
        deferredAsyncDocs.clear();
        for (const uri of queuedUris) {
            const doc = documents.get(uri);
            if (doc) validateTextDocument(doc, 'noSolutionTimeout');
        }
    }
}, 2000);

// Listen on the connection
logger.info("🚀 SERVER: Starting to listen on connection");
console.error("🚀 SERVER: Starting to listen on connection at " + new Date().toISOString());
perfLogger.perf("Phase: Server listening (connection.listen called)", {
    since_module_load_ms: Date.now() - serverModuleLoadedAt
});
connection.listen();

// Add a handler for getting performance metrics
connection.onRequest('clarion/getPerformanceMetrics', () => {
    return {
        memoryUsage: process.memoryUsage().heapUsed,
        cpuUsage: process.cpuUsage(),
        uptime: process.uptime()
    };
});

// Add handler for unreachable code detection
connection.onRequest('clarion/unreachableRanges', (params: { textDocument: { uri: string } }): Range[] => {
    try {
        const document = documents.get(params.textDocument.uri);
        if (!document) {
            logger.warn(`Document not found for unreachable code analysis: ${params.textDocument.uri}`);
            return [];
        }
        
        return UnreachableCodeProvider.provideUnreachableRanges(document);
    } catch (error) {
        logger.error(`Error providing unreachable ranges: ${error instanceof Error ? error.message : String(error)}`);
        return [];
    }
});

connection.onRequest('clarion/getFileRelationshipGraph', async (): Promise<{
    edges: Array<{ type: string; fromFile: string; toFile: string; fromLine?: number; containingProcedure?: string; containingClass?: string }>;
    isBuilt: boolean;
    isBuilding: boolean;
    buildDurationMs: number | undefined;
    buildStartTime: string | undefined;
    buildEndTime: string | undefined;
}> => {
    const { FileRelationshipGraph } = await import('./FileRelationshipGraph');
    const graph = FileRelationshipGraph.getInstance();
    return {
        edges: graph.getAllEdges(),
        isBuilt: graph.isBuilt,
        isBuilding: graph.isBuilding,
        buildDurationMs: graph.buildDurationMs,
        buildStartTime: graph.buildStartTime?.toISOString(),
        buildEndTime: graph.buildEndTime?.toISOString(),
    };
});

logger.info("🟢  Clarion Language Server is now listening for requests.");
