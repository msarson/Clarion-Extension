import {
    createConnection,
    TextDocuments,
    ProposedFeatures,
    Diagnostic,
    CodeLensRefreshRequest,
    CancellationTokenSource
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
    CodeAction,
    DocumentFormattingParams,
    DocumentRangeFormattingParams,
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
import { TrailingCoalescer } from './utils/TrailingCoalescer';

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
import { GenerateRoutineCodeActionProvider } from './providers/GenerateRoutineCodeActionProvider';
import { IntroduceEquateCodeActionProvider } from './providers/IntroduceEquateCodeActionProvider';
import { SelectionRangeProvider } from './providers/SelectionRangeProvider';
import { ClarionCodeLensProvider, formatReferenceCount, formatApproximateReferenceCount } from './providers/ClarionCodeLensProvider';
import { DiagnosticProvider } from './providers/DiagnosticProvider';
import { initializingHoverFallback, buildIndexingHover } from './utils/InitializingHover';
import { SignatureHelpProvider } from './providers/SignatureHelpProvider';
import { ImplementationProvider } from './providers/ImplementationProvider';
import { ReferencesProvider } from './providers/ReferencesProvider';
import { RenameProvider } from './providers/RenameProvider';
import { DocumentHighlightProvider } from './providers/DocumentHighlightProvider';
import { ClarionInlayHintsProvider } from './providers/ClarionInlayHintsProvider';
import { WorkspaceSymbolProvider } from './providers/WorkspaceSymbolProvider';
import { UnreachableCodeProvider } from './providers/UnreachableCodeProvider';
import { CompletionProvider } from './providers/CompletionProvider';
import { DocumentLinkProvider } from './providers/DocumentLinkProvider';
import { MemberLocatorService } from './services/MemberLocatorService';
import { CrossFileCache } from './providers/hover/CrossFileCache';
import { LoggingConfig } from '../../common/LoggingConfig';
import { SymbolFinderService } from './services/SymbolFinderService';
import { ReferenceIndex } from './services/ReferenceIndex';
import { ScopeAnalyzer } from './utils/ScopeAnalyzer';
import { pathToCanonicalUri } from './utils/UriUtils';
import { ClarionSolutionInfo } from 'common/types';
import { URI } from 'vscode-languageserver';
import { setServerInitialized, serverInitialized } from './serverState';
import { TokenHelper } from './utils/TokenHelper';
import { evictIncludeChainIndexes } from './services/SymbolFinderService';
import { bumpCrossFileEpoch } from './utils/crossFileEpoch';
import { IncludeVerifier } from './utils/IncludeVerifier';
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
// "perf" level → these phase markers ALWAYS emit, even in a packaged (release) VSIX where the
// default log level is "error". Low-volume startup/solution-load timeline so users (and support)
// can see where solution loading spends its time in the "Clarion Language Server" output channel.
const perfLogger = LoggerManager.getLogger("StartupPerf", "perf");
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
// #289: the async cross-file validators additionally wait for the SDI structure-index prebuild.
// Several of them block on the index INTERNALLY (MemberLocatorService/SymbolFinderService await
// getOrBuildIndex), so running them earlier just parks them behind the 30s+ build — measured:
// ONE member resolution in discardedReturn = 40.4s while the index built. Deferring until the
// prebuild completes turns three async passes (open/drain → solutionReady → sdiReady) into ONE
// fast pass (~1-3s measured post-index). Sync diagnostics still publish immediately throughout.
let sdiPipelineReady = false;
// #301: true from solution announcement until the sequenced background chain (SDI -> FRG ->
// revalidation) finishes - the window in which hover uses the "still indexing" fallback.
let startupBackgroundActive = false;
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
let codeLensPrecomputeGeneration = 0;

// (collectSolutionSourceFilePaths removed with the #293 follow-up: the CodeLens precompute
// now warms open documents only — see precomputeCodeLensReferenceCounts. Recover from git
// history if the one-pass inverted reference index (#294) wants solution-wide enumeration.)

/**
 * #189 Phase 4 (initial) — declaration-position probe for FAR fast-path.
 *
 * If the cursor is on a line that has a CodeLens declaration symbol, return its
 * lens data so `onReferences` can hit the precomputed reference cache in O(1)
 * (same cache used by CodeLens resolve) before falling back to live FAR scans.
 */
function findCodeLensDataAtPosition(
    document: TextDocument,
    position: { line: number; character: number }
): { uri: string; line: number; character: number; symbolName: string } | null {
    const lenses = codeLensProvider.provideCodeLenses(document);
    const sameLine = lenses
        .map(l => l.data as { uri: string; line: number; character: number; symbolName: string } | undefined)
        .filter((d): d is { uri: string; line: number; character: number; symbolName: string } => !!d && d.line === position.line);
    if (sameLine.length === 0) return null;

    // Prefer a candidate whose method/proc segment range covers the cursor.
    for (const data of sameLine) {
        const shortName = (data.symbolName ?? '').split('.').pop() ?? '';
        const start = data.character;
        const end = start + shortName.length;
        if (position.character >= start && position.character <= end) return data;
    }

    // Fallback: nearest declaration anchor on this line.
    sameLine.sort((a, b) => Math.abs(position.character - a.character) - Math.abs(position.character - b.character));
    return sameLine[0] ?? null;
}

/**
 * #189 Phase 2 — background precompute for CodeLens reference counts.
 * Builds the existing declaration-keyed cache (`uri:line:char`) once at solution-ready
 * so most `onCodeLensResolve` calls hit O(1) map lookups. Resolve still falls back to
 * live FAR whenever precompute is unavailable/incomplete, so correctness is preserved.
 */
async function precomputeCodeLensReferenceCounts(solution: ClarionSolutionInfo): Promise<void> {
    const generation = ++codeLensPrecomputeGeneration;
    codeLensRefCache.clear();
    codeLensRefIndex.clear(); // also marks ready=false

    if (!serverSettings.referencesCodeLensEnabled) return;

    // #293 follow-up: warm OPEN DOCUMENTS only, not the whole solution. The whole-solution
    // sweep was designed pre-#293, when the resolution bug meant it only ever saw ~13 files
    // (52-96s measured). At true solution scale the cost is lenses × full-FAR-scan with BOTH
    // factors ~75× larger — unaffordable as a background job. Open files (where lenses are
    // visible) get warm counts; everything else resolves lazily per visible lens with
    // per-symbol caching, exactly as unopened files always effectively did. The proper
    // long-term fix is a one-pass inverted reference index (tracked on #290/#294).
    void solution; // retained in the signature for the settings-toggle re-kick path
    const filePaths = documents.all()
        .map(d => {
            try { return decodeURIComponent(d.uri.replace(/^file:\/\/\/?/i, '')).replace(/\//g, '\\'); }
            catch { return ''; }
        })
        .filter(p => p && /\.(clw|inc|equ|int)$/i.test(p));
    let scannedFiles = 0;
    let indexedLenses = 0;
    let missingFiles = 0;
    const startedAt = Date.now();

    for (const absPath of filePaths) {
        if (generation !== codeLensPrecomputeGeneration) return; // superseded by a newer build
        // #290: count (don't hide) paths that fail the existence probe — Mark's run showed
        // files=13 of ~3016 solution entries, i.e. the project.path + relativePath join may not
        // reconstruct the real location for most files. A large `missing` count here means the
        // precompute is silently covering a fraction of the solution (everything else falls back
        // to live-FAR per visible lens — exactly the slow path #189 was built to avoid).
        if (!fs.existsSync(absPath)) {
            missingFiles++;
            if (missingFiles <= 3) {
                logger.info(`⚠️ [CodeLens precompute] path does not exist: ${absPath}`);
            }
            continue;
        }

        const uri = pathToCanonicalUri(absPath);
        const openDoc = documents.get(uri);
        const doc = openDoc ?? TextDocument.create(uri, 'clarion', 1, fs.readFileSync(absPath, 'utf8'));
        const lenses = codeLensProvider.provideCodeLenses(doc);

        for (const lens of lenses) {
            if (generation !== codeLensPrecomputeGeneration) return;
            const data = lens.data as { uri: string; line: number; character: number; symbolName: string } | undefined;
            if (!data) continue;

            const refs = await referencesProvider.provideReferences(
                doc,
                { line: data.line, character: data.character },
                { includeDeclaration: true }
            ) ?? [];

            const cacheKey = `${data.uri}:${data.line}:${data.character}`;
            const shortName = (data.symbolName ?? '').split('.').pop()?.toLowerCase() ?? '';
            codeLensRefCache.set(cacheKey, { refs, shortName });
            codeLensRefIndex.removeSymbol(cacheKey);
            for (const loc of refs) {
                codeLensRefIndex.add(cacheKey, {
                    uri: loc.uri,
                    line: loc.range.start.line,
                    character: loc.range.start.character,
                });
            }

            indexedLenses++;
            // #290: yield after EVERY lens — each provideReferences is a cross-file scan; batching
            // 25 of them between yields produced multi-second event-loop blocks that froze
            // hover/F12 during startup.
            await new Promise<void>(resolve => setImmediate(resolve));
        }

        scannedFiles++;
        // #290: yield after every file — provideCodeLenses tokenizes the whole (closed) file
        // synchronously; ten large generated files between yields blocked the loop for seconds.
        await new Promise<void>(resolve => setImmediate(resolve));
    }

    if (generation === codeLensPrecomputeGeneration) {
        codeLensRefIndex.setReady(true);
        logger.info(`⚡ CodeLens reference precompute ready: ${indexedLenses} lenses across ${scannedFiles} files in ${Date.now() - startedAt}ms`);
        perfLogger.perf("Phase: CodeLens reference precompute complete (background)", {
            ms: Date.now() - startedAt,
            lenses: indexedLenses,
            files: scannedFiles,
            missing: missingFiles,
            total_paths: filePaths.length,
            since_module_load_ms: Date.now() - serverModuleLoadedAt
        });
    }
}

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
const inlayHintsProvider = new ClarionInlayHintsProvider();
const workspaceSymbolProvider = new WorkspaceSymbolProvider();
const completionProvider = new CompletionProvider();
const documentLinkProvider = new DocumentLinkProvider();

// ✅ Create Connection and Documents Manager
const connection = createConnection(ProposedFeatures.all);

// #297 fix 14 (audit): dispatch instrumentation — the decisive experiment. The server is
// single-threaded, so "the tree spinner" is always SOME handler occupying the loop; the lag
// sampler proves occupancy but not identity. Wrap every handler registered via
// connection.onRequest/onNotification and log any that holds the loop or runs long, so a perf
// log names the culprit instead of leaving us inferring from gaps. Installed BEFORE any
// registration so all clarion/* handlers (server.ts + SolutionManager) are covered; built-in
// feature handlers (onDocumentSymbol etc.) register through dedicated methods and keep their
// own perf lines.
{
    const SLOW_HANDLER_MS = 100;
    const methodName = (type: unknown): string =>
        typeof type === 'string' ? type : ((type as { method?: string })?.method ?? 'unknown');
    const wrapHandler = (kind: 'request' | 'notification', method: string, handler: (...args: unknown[]) => unknown) =>
        async (...args: unknown[]) => {
            const t0 = Date.now();
            try {
                return await handler(...args);
            } finally {
                const ms = Date.now() - t0;
                if (ms >= SLOW_HANDLER_MS) {
                    perfLogger.perf("LSP slow handler", { kind, method, ms });
                }
            }
        };
    const origOnRequest = connection.onRequest.bind(connection);
    (connection as { onRequest: unknown }).onRequest = (type: unknown, handler?: (...args: unknown[]) => unknown) =>
        handler === undefined
            ? origOnRequest(type as never) // star-handler overload — pass through untouched
            : origOnRequest(type as never, wrapHandler('request', methodName(type), handler) as never);
    const origOnNotification = connection.onNotification.bind(connection);
    (connection as { onNotification: unknown }).onNotification = (type: unknown, handler?: (...args: unknown[]) => unknown) =>
        handler === undefined
            ? origOnNotification(type as never)
            : origOnNotification(type as never, wrapHandler('notification', methodName(type), handler) as never);

    // The built-in feature registrars (onDocumentSymbol, onCodeLens, onHover, didChange sync…)
    // bypass connection.onRequest, so the first VM run's 6.2s sync block never produced a
    // slow-handler line. Wrap every dedicated `onXxx(handler)` registrar too — only when the
    // first argument is a function (onProgress and friends have different signatures and pass
    // through untouched).
    const conn = connection as unknown as Record<string, unknown>;
    for (const key of Object.keys(conn)) {
        if (key === 'onRequest' || key === 'onNotification') continue;
        const fn = conn[key];
        if (typeof fn !== 'function' || !/^on[A-Z]/.test(key)) continue;
        conn[key] = (...args: unknown[]) => {
            if (typeof args[0] === 'function') {
                args[0] = wrapHandler('request', key, args[0] as (...a: unknown[]) => unknown);
            }
            return (fn as (...a: unknown[]) => unknown).apply(connection, args);
        };
    }
    // languages.* sub-registrars (semanticTokens.on/onDelta/onRange, inlayHint.on)
    const languages = (connection as unknown as { languages?: Record<string, unknown> }).languages;
    for (const feature of ['semanticTokens', 'inlayHint']) {
        const obj = languages?.[feature] as Record<string, unknown> | undefined;
        if (!obj) continue;
        for (const key of Object.keys(obj)) {
            const fn = obj[key];
            if (typeof fn !== 'function' || !/^on/.test(key)) continue;
            obj[key] = (...args: unknown[]) => {
                if (typeof args[0] === 'function') {
                    args[0] = wrapHandler('request', `${feature}.${key}`, args[0] as (...a: unknown[]) => unknown);
                }
                return (fn as (...a: unknown[]) => unknown).apply(obj, args);
            };
        }
    }
}

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

        // #297 (revised): perf channels are opt-in via clarion.log.performance.enabled.
        // Read it here — onInitialize is the server's first breath, so when enabled the
        // whole startup timeline (bar the two module-load lines) is captured.
        const logOpts = (params.initializationOptions as
            { settings?: { log?: { performance?: { enabled?: boolean } } } } | undefined)?.settings?.log?.performance;
        LoggingConfig.PERF_CHANNELS_ENABLED = logOpts?.enabled === true;

        // #289: a configured solution announces itself IN the initialize request (race-free — this
        // handler runs at t≈4ms, before any validation or timer can compete). The explicit
        // `configuredSolutionFile` field is the contract; the settings fallback covers older
        // clients. Sets the flag the 2s no-solution fallback checks, so the expensive async
        // validation pass stays deferred until clarion/solutionReady instead of draining mid-load
        // in degraded no-solution mode (which starved the solution load itself on big solutions).
        const initOpts = params.initializationOptions as
            { configuredSolutionFile?: string; settings?: { currentSolution?: string; solutionFile?: string } } | undefined;
        const announcedSolution = initOpts?.configuredSolutionFile
            || initOpts?.settings?.currentSolution
            || initOpts?.settings?.solutionFile
            || '';
        if (announcedSolution) {
            solutionAnnounced = true;
            startupBackgroundActive = true;
            perfLogger.perf("Phase: solution announced via initializationOptions", {
                since_module_load_ms: Date.now() - serverModuleLoadedAt,
                solution: path.basename(announcedSolution)
            });
        }
        
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
                documentRangeFormattingProvider: true,
                documentSymbolProvider: true,
                foldingRangeProvider: true,
                colorProvider: true,
                definitionProvider: true,
                implementationProvider: true,
                referencesProvider: true,
                renameProvider: { prepareProvider: true },
                documentHighlightProvider: true,
                // Inlay hints DISABLED (2026-07-07): they added too much visual noise for Clarion.
                // The provider, handler, and settings are kept intact but dormant — NOT advertising
                // this capability means VS Code never requests inlay hints, so the handler below is
                // never called. To re-enable: restore `inlayHintProvider: true` here (and, if desired,
                // re-add the `clarion.inlayHints.*` settings to package.json).
                // inlayHintProvider: true,
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

        // Provide a live-document getter so both sync and async cross-file diagnostics
        // can read open files even when the TokenCache entry was cleared.
        const getOpenDocumentContent = (absPath: string): string | null => {
            const normalizedPath = absPath.toLowerCase().replace(/\\/g, '/');
            for (const doc of documents.all()) {
                const docPath = decodeURIComponent(doc.uri.replace(/^file:\/\/\//i, '')).toLowerCase().replace(/\\/g, '/');
                if (docPath === normalizedPath) return doc.getText();
            }
            return null;
        };

        // PERFORMANCE: Use cached tokens instead of re-tokenizing
        const tokens = getTokens(document);
        const syncStart = Date.now();
        const diagnostics = DiagnosticProvider.validateDocument(document, tokens, caller, getOpenDocumentContent);
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
        // #289: gate widened — async validators wait for BOTH the solution AND the SDI structure
        // index (several block on the index internally; see sdiPipelineReady above). Applies to
        // every caller, so an edit during the index-build window defers instead of stalling 40s.
        // The sdiReady pass re-validates all open docs once both flags are set.
        if (!solutionPipelineReady || !sdiPipelineReady) {
            deferredAsyncDocs.add(document.uri);
            perfLogger.perf("validateTextDocument async deferred (pipeline pending)", {
                total_ms: Date.now() - validateStart,
                sync_ms: syncMs,
                solution_ready: String(solutionPipelineReady),
                sdi_ready: String(sdiPipelineReady),
                token_count: tokens.length,
                diag_count: diagnostics.length,
                uri: document.uri,
                caller
            });
            return;
        }

        // Async pass: detect discarded return values via cross-file type resolution
        // #305: per-pass CrossFileCache — the locator's loadDocument otherwise re-reads
        // the same INC files from disk for every resolution in this pass. Per-pass (not
        // shared) so edits between passes are never served stale.
        const memberLocator = new MemberLocatorService(new CrossFileCache(tokenCache));
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
        // #297: thunks, not eagerly-started promises — the batch startup pass must be able to
        // run these one at a time. Seven concurrent validator chains awaiting mostly-cached
        // (already-resolved) promises advance on the MICROTASK queue, so the event loop never
        // reaches its poll phase to read incoming LSP messages while any chain has work — a
        // cooperative yield inside one validator doesn't help while the other six keep the
        // microtask queue full. VM run 5: a tree expand starved through a 20s+ validator window
        // even with time-sliced loops. Sequential execution restores the yields' effect; total
        // work is unchanged (single thread — the concurrency never bought parallelism).
        const validatorThunks: [string, () => Promise<Diagnostic[]>][] = [
            // #352: moved out of the sync pass — its cold include-chain walk blocked
            // onDidOpen ~4.4s. Runs first so its perf line stays comparable across logs.
            ['viewProjectFields', () => DiagnosticProvider.validateViewProjectFields(tokens, document, getOpenDocumentContent)],
            ['discardedReturn', () => DiagnosticProvider.validateDiscardedReturnValues(tokens, document, memberLocator, getOpenDocumentContent)],
            ['missingIncludes', () => DiagnosticProvider.validateMissingIncludes(tokens, document)],
            ['missingConstants', () => DiagnosticProvider.validateMissingConstants(tokens, document)],
            ['missingMapDecl', () => DiagnosticProvider.validateMissingMapDeclarations(tokens, document, getOpenDocumentContent)],
            ['missingImpl', () => DiagnosticProvider.validateMissingImplementations(tokens, document, getOpenDocumentContent)],
            ['undeclaredVar', () => DiagnosticProvider.validateUndeclaredVariables(tokens, document, symbolFinder)],
            ['ifaceImpl', () => DiagnosticProvider.validateClassInterfaceImplementation(tokens, document, memberLocator)],
        ];
        const [viewProjectFieldsDiags, discardedReturnDiags, missingIncludeDiags, missingConstantsDiags, missingMapDeclDiags, missingImplDiags, undeclaredVarDiags, ifaceImplDiags] =
            caller === 'sdiReady'
                ? await (async () => {
                    const results: Diagnostic[][] = [];
                    for (const [name, thunk] of validatorThunks) {
                        results.push(await timeIt(name, thunk()));
                        // Real macrotask yield between validators — lets queued requests in
                        await new Promise<void>(resolve => setImmediate(resolve));
                    }
                    return results;
                })()
                : await Promise.all(validatorThunks.map(([name, thunk]) => timeIt(name, thunk())));
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

        const asyncDiags = [...viewProjectFieldsDiags, ...discardedReturnDiags, ...missingIncludeDiags, ...missingConstantsDiags, ...missingMapDeclDiags, ...missingImplDiags, ...undeclaredVarDiags, ...ifaceImplDiags];
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
// #303: a document under libsrcPaths gets NO reference-count lenses. Opening a library class
// INC (e.g. via F12 from a hover) emitted a lens per method, and one resolve's cross-file scan
// held the loop for 106 SECONDS as a single sync block on Mark's VM — every request behind it
// died. Counting solution-wide references for library headers costs a full scan per method for
// near-zero informational value.
function isUnderLibsrcPath(uri: string): boolean {
    if (!serverSettings.libsrcPaths?.length) return false;
    const fsPath = decodeURIComponent(uri.replace(/^file:\/\/\/?/i, '')).replace(/\//g, '\\').toLowerCase();
    return serverSettings.libsrcPaths.some(p => {
        const dir = p.replace(/\//g, '\\').toLowerCase().replace(/\\+$/, '') + '\\';
        return fsPath.startsWith(dir);
    });
}
connection.onCodeLens((params) => {
    // #185 — reference-count CodeLens is opt-out; when disabled, emit no lenses
    // so no reference searches run (resolveCodeLens is never called).
    if (!serverSettings.referencesCodeLensEnabled) return [];
    if (isUnderLibsrcPath(params.textDocument.uri)) return [];
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
// #297 fix 8 (audit H1 #5): each cold resolve is a cross-file reference scan measured at
// 0.5-2.8s — VS Code fires one resolve per visible lens, so a screenful of lenses on a big
// generated module stacked seconds of scans onto the interactive queue.
//
// Follow-up (Mark's VM, GLQuarter): the original budget CANCELLED the scan and returned
// "0+ references" — which VS Code then cached indefinitely, so hot symbols (whose scans always
// exceed the budget) never showed a real count. The scan is no longer cancelled: it runs to
// completion in the background (time-sliced — FILES_PER_YIELD=5 keeps it cooperative), the
// response beyond the budget is an honest "counting…" placeholder, and when the scan finishes
// the server asks the client to refresh its lenses (workspace/codeLens/refresh) — the
// re-resolve then answers instantly from the cache with the REAL count. One in-flight scan per
// lens, so refresh-triggered re-resolves never duplicate work.
//
// #318 exact-lazy: the approximate index count (word occurrences, no receiver resolution —
// measured ~195 shown vs 3 real on common method names) is demoted from final answer to
// PLACEHOLDER. Every uncached resolve now also starts the exact scoped scan in the background;
// the estimate shows immediately and the exact count replaces it via the refresh. This is
// affordable because the #315 arc made an app-scoped FAR ~100ms — the model TS/rust-analyzer
// use (exact per visible lens), with clangd's persisted-ref index tracked on #316 as endgame.
const CODELENS_RESOLVE_BUDGET_MS = 500;
const inflightLensScans = new Map<string, Promise<Location[]>>();

// #318: a screenful of lenses (~10-30) resolves at once; each exact scan is fast but dozens
// launched together would still contend the single LSP thread. Scans run at most N-wide;
// queued scans keep their inflight entry (no duplicate work on refresh re-resolves) and the
// #303 ceiling clock starts only when a scan leaves the queue.
const MAX_CONCURRENT_LENS_SCANS = 3;
let activeLensScans = 0;
const lensScanQueue: Array<() => void> = [];
function acquireLensScanSlot(): Promise<void> {
    if (activeLensScans < MAX_CONCURRENT_LENS_SCANS) {
        activeLensScans++;
        return Promise.resolve();
    }
    return new Promise(resolve => lensScanQueue.push(resolve));
}
function releaseLensScanSlot(): void {
    const next = lensScanQueue.shift();
    if (next) next();
    else activeLensScans--;
}
let lensRefreshTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleLensRefresh() {
    if (lensRefreshTimer) return;
    lensRefreshTimer = setTimeout(() => {
        lensRefreshTimer = null;
        connection.sendRequest(CodeLensRefreshRequest.type).catch(() => {
            // client without refresh support — the count appears on the next natural refresh
        });
    }, 250);
}
connection.onCodeLensResolve(async (lens) => {
    try {
        const data = lens.data as { uri: string; line: number; character: number; symbolName: string; fileScoped?: boolean; routine?: boolean } | undefined;
        if (!data) return lens;

        // #315 belt-and-braces on the #303 gate: a lens emitted for a libsrc doc
        // before libsrcPaths arrived must never trigger counting on resolve.
        if (isUnderLibsrcPath(data.uri)) return lens;

        const document = documents.get(data.uri);
        if (!document) return lens;

        const cacheKey = `${data.uri}:${data.line}:${data.character}`;
        const cached = codeLensRefCache.get(cacheKey);

        // #294: once the reference-count index is built, it answers a count in O(1).
        // The count is APPROXIMATE (comment/string-stripped identifier occurrences by
        // name, no receiver resolution) — #318: it is now only the placeholder shown
        // while the exact scoped scan below runs; the refresh swaps in the real count.
        let placeholderTitle: string | undefined;
        // #320: routine lenses skip the approximate index AND the index-building
        // gate — their exact count is a same-file procedure-scoped scan (Route R),
        // fast at any startup phase. Straight to the scan path below.
        if (!cached && !data.routine) {
            const { ReferenceCountIndex } = await import('./services/ReferenceCountIndex');
            const refIndex = ReferenceCountIndex.getInstance();
            // #315 follow-up: a lens on a class DECLARED in this CLW (e.g.
            // CapeSoft GPF Reporter generates an identical ThisGPF into every
            // app) never counts across applications. Scope by where the CLW
            // sits: a PROGRAM file's global classes are visible app-wide, so
            // count across the program + its MEMBER modules (the file graph
            // knows the family); a MEMBER module's class is file-local.
            let idxCount: number | undefined;
            if (data.fileScoped) {
                const { FileRelationshipGraph } = await import('./FileRelationshipGraph');
                const graph = FileRelationshipGraph.getInstance();
                const fsPath = decodeURIComponent(data.uri.replace(/^file:\/\/\/?/i, ''));
                const memberFiles = graph.isBuilt ? graph.getMemberFiles(fsPath) : [];
                if (memberFiles.length) {
                    idxCount = refIndex.getCountInFiles(data.symbolName ?? '', [fsPath, ...memberFiles]);
                } else {
                    idxCount = refIndex.getCountInFile(data.symbolName ?? '', data.uri);
                }
                if (idxCount === undefined && refIndex.isBuilt) {
                    // File not indexed (e.g. outside the project list) — sync the
                    // live buffer we already have in hand, then answer from it.
                    refIndex.updateFile(data.uri, document.getText());
                    idxCount = refIndex.getCountInFile(data.symbolName ?? '', data.uri);
                }
            } else {
                idxCount = refIndex.getCount(data.symbolName ?? '');
            }
            if (idxCount !== undefined) {
                // #315: the '~' marks the count as an estimate — #318: it shows only
                // until the background exact scan lands and the refresh replaces it.
                placeholderTitle = formatApproximateReferenceCount(idxCount);
            } else if (solutionAnnounced || SolutionManager.getInstance()?.solution) {
                // #294 follow-up: while the index is still building (solution mode), do NOT
                // fall back to the scan path — that path is exactly the 106s/114s/110s block
                // family (a lens resolve at +6s cold-tokenized the whole solution inside
                // buildInheritanceMap before any checkpoint could land). Show the honest
                // placeholder; the index-built refresh repaints every visible lens moments
                // later (#318: exact scans only start once the index — and its mayContain
                // pruning — is warm). No-solution mode (index never builds) keeps the scan
                // path — its search space is a single file + directory.
                lens.command = {
                    title: 'counting…',
                    command: 'clarion.showReferences',
                    arguments: [data.uri, { line: data.line, character: data.character }, []],
                };
                return lens;
            }
        }

        let refs: Location[] | null;
        if (cached) {
            refs = cached.refs;
        } else {
            let scan = inflightLensScans.get(cacheKey);
            if (!scan) {
                const queuedAt = Date.now();
                scan = acquireLensScanSlot().then(async () => {
                    // #303: hard ceiling on the background scan. The refresh design wants scans
                    // to complete, but unbounded they can run away (a libsrc-INC scan held the
                    // loop 106s). 15s is far above any healthy scan; the cancellation lands at
                    // the scan's cooperative checkpoints. The clock starts when the scan leaves
                    // the #318 queue, not when it enters it.
                    const ceiling = new CancellationTokenSource();
                    const ceilingTimer = setTimeout(() => ceiling.cancel(), 15_000);
                    const scanStart = Date.now();
                    try {
                        const found = await referencesProvider.provideReferences(
                            document,
                            { line: data.line, character: data.character },
                            { includeDeclaration: true },
                            ceiling.token
                        );
                        // #318 experiment: one perf line per exact lens count — this is the
                        // measurement that decides whether exact-lazy stays. (#309: always
                        // name the symbol so slow scans are diagnosable from user logs.)
                        perfLogger.perf("CodeLens exact count", {
                            ms: Date.now() - scanStart,
                            queued_ms: scanStart - queuedAt,
                            symbol: data.symbolName,
                            results: found?.length ?? 0,
                            cancelled: String(ceiling.token.isCancellationRequested),
                            uri: data.uri
                        });
                        const resolved = found ?? [];
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
                        return resolved;
                    } finally {
                        clearTimeout(ceilingTimer);
                        releaseLensScanSlot();
                    }
                }).finally(() => {
                    inflightLensScans.delete(cacheKey);
                });
                inflightLensScans.set(cacheKey, scan);
            }

            const raced = await Promise.race([
                scan,
                new Promise<'budget'>(resolve =>
                    setTimeout(() => resolve('budget'), CODELENS_RESOLVE_BUDGET_MS))
            ]);
            if (raced === 'budget') {
                // Real count arrives via the refresh once the background scan lands. #318:
                // the approximate index count is the interim answer when available — far
                // more useful than "counting…", and visibly marked '~' until the flip.
                scan.then(() => scheduleLensRefresh()).catch(() => { /* logged at source */ });
                lens.command = {
                    title: placeholderTitle ?? 'counting…',
                    command: 'clarion.showReferences',
                    arguments: [data.uri, { line: data.line, character: data.character }, []],
                };
                return lens;
            }
            refs = raced;
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
    
    // 🚀 PERF: Get cached text to detect what changed
    // If no cache exists, this is first edit - let incremental handle it
    // #260: use the public accessor (the private-map reach would silently miss
    // now that cache keys are canonicalized).
    const cachedText = tokenCache.getDocumentText(document.uri);
    if (!cachedText) {
        return false; // No baseline to compare, incremental will handle
    }

    // 🚀 PERF: Quick length check - if document length changed significantly, likely structural
    const lengthDiff = Math.abs(text.length - cachedText.length);
    if (lengthDiff > 50) {
        return true; // Large changes likely affect structure
    }

    // 🔍 CORRECTNESS: Detect changed lines by comparing text
    const newLines = text.split(/\r?\n/);
    const oldLines = cachedText.split(/\r?\n/);
    
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
        const isProgramFile = TokenHelper.findProgramHeaderToken(tokens) !== undefined;
        const memberToken = TokenHelper.findMemberHeaderToken(tokens);

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

// #340: the client already forwards workspace file events for all lookup
// extensions (synchronize.fileEvents in LanguageServerManager) — but no server
// handler existed, so changes made OUTSIDE the editor (appgen regeneration,
// git checkout/pull, external editors) never evicted the caches: cross-file
// consumers kept serving stale tokens/text until a window reload. Evict per
// changed file immediately; revalidate open documents once, debounced (a
// regeneration touches hundreds of files — one sweep, not one per event).
let watchedFilesRevalidateTimer: ReturnType<typeof setTimeout> | undefined;
connection.onDidChangeWatchedFiles(params => {
    try {
        let evicted = 0;
        for (const change of params.changes) {
            // Open documents are authoritative via their live buffer/version —
            // evicting them just forces one cheap re-tokenize; closed files are
            // the actual stale-cache hazard.
            tokenCache.clearTokens(change.uri);
            evicted++;
        }
        if (evicted > 0) {
            // #344: any changed file can invalidate any include-chain index.
            evictIncludeChainIndexes();
            // #345 phase 4: invalidate every cross-file result memo
            // (viewProjectFields, RVD receiver types/enumerations) and the
            // include verifier's in-memory caches (disk entries stay —
            // they're mtime-guarded).
            bumpCrossFileEpoch();
            IncludeVerifier.getInstance().clearCache();
            logger.info(`🔄 [#340] Watched-file change: evicted ${evicted} cache entr${evicted === 1 ? 'y' : 'ies'}`);
            if (watchedFilesRevalidateTimer !== undefined) clearTimeout(watchedFilesRevalidateTimer);
            watchedFilesRevalidateTimer = setTimeout(() => {
                watchedFilesRevalidateTimer = undefined;
                for (const openDoc of documents.all()) {
                    validateTextDocument(openDoc, 'watchedFilesChanged');
                }
            }, 500);
        }
    } catch (err) {
        logger.error(`[#340] onDidChangeWatchedFiles: ${err instanceof Error ? err.message : String(err)}`);
    }
});

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

        // #294: keep the approximate reference-count index in sync with the live
        // buffer — a single regex re-scan of THIS file, totals adjusted by delta.
        void import('./services/ReferenceCountIndex').then(({ ReferenceCountIndex }) =>
            ReferenceCountIndex.getInstance().updateFile(uri, document.getText())
        ).catch(() => { /* non-fatal — counts self-heal on next build */ });

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
        symbolCacheVersions.delete(uri);
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

connection.onDocumentRangeFormatting((params: DocumentRangeFormattingParams): TextEdit[] => {
    try {
        logger.info(`📐 [DEBUG] Received onDocumentRangeFormatting request for: ${params.textDocument.uri}`);
        const document = documents.get(params.textDocument.uri);
        if (!document) {
            logger.warn(`⚠️ [DEBUG] Document not found for range formatting: ${params.textDocument.uri}`);
            return [];
        }

        const uri = document.uri;
        if (uri.toLowerCase().endsWith('.xml') || uri.toLowerCase().endsWith('.cwproj')) {
            logger.info(`🔍 [DEBUG] Skipping XML file in onDocumentRangeFormatting: ${uri}`);
            return [];
        }

        const text = document.getText();
        const tokens = getTokens(document);
        const formatter = new ClarionFormatter(tokens, text, {
            formattingOptions: params.options
        });

        if (document.lineCount === 0) {
            return [];
        }

        const startLine = Math.max(0, Math.min(params.range.start.line, document.lineCount - 1));
        const rawEndLine = params.range.end.character === 0
            ? params.range.end.line - 1
            : params.range.end.line;
        const endLine = Math.max(startLine, Math.min(rawEndLine, document.lineCount - 1));
        let replacement = formatter.formatRange(startLine, endLine);

        // Some clients report selection end at column 0 of the *next* line; others use
        // the final selected line with non-zero character. If the normalized range no-ops,
        // retry once with the raw end-line interpretation to avoid false "no change".
        if (replacement === null) {
            const altEndLine = Math.max(startLine, Math.min(params.range.end.line, document.lineCount - 1));
            if (altEndLine !== endLine) {
                replacement = formatter.formatRange(startLine, altEndLine);
            }
        }

        if (replacement === null) {
            return [];
        }

        const eol = text.includes('\r\n') ? '\r\n' : '\n';
        const hasNextLine = endLine + 1 < document.lineCount;
        const startOffset = document.offsetAt(Position.create(startLine, 0));
        const endOffset = hasNextLine
            ? document.offsetAt(Position.create(endLine + 1, 0))
            : text.length;

        return [TextEdit.replace(
            Range.create(document.positionAt(startOffset), document.positionAt(endOffset)),
            hasNextLine ? replacement + eol : replacement
        )];
    } catch (error) {
        logger.error(`❌ [DEBUG] Error range-formatting document: ${error instanceof Error ? error.message : String(error)}`);
        return [];
    }
});


// Cache for document symbols to avoid recomputing during rapid typing
const symbolCache = new Map<string, DocumentSymbol[]>();
// #297 S5: version stamp for symbolCache entries — an unchanged document answers
// onDocumentSymbol straight from cache (VS Code re-requests symbols on every focus change;
// each recompute was 100-800ms of loop time on generated modules).
const symbolCacheVersions = new Map<string, number>();
const foldingCache = new Map<string, FoldingRange[]>();

connection.onDocumentLinks((params: DocumentLinkParams): DocumentLink[] => {
    const document = documents.get(params.textDocument.uri);
    if (!document) return [];
    // #297: while an announced solution is still loading, the FRG's no-solution guard falls
    // through and builds a THROWAWAY degraded-mode graph for this document (measured 3.2s on
    // the queue during the busiest window). Skip — the server sends
    // clarion/refreshDocumentLinks at solutionReady, so links populate then.
    if (solutionAnnounced && !SolutionManager.getInstance()?.solution) return [];
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

        // #297 S5: same document version → same symbols; skip the recompute entirely.
        if (symbolCacheVersions.get(uri) === document.version && symbolCache.has(uri)) {
            return symbolCache.get(uri)!;
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
        symbolCacheVersions.set(uri, document.version);
        
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
            symbolCacheVersions.delete(uri);
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


// #289: the client announces a configured solution the moment its language client is ready —
// long before the heavy init flow sends clarion/updatePaths. This is what lets the 2s
// no-solution fallback below know a solution is on its way (previously it had NO signal until
// updatePaths arrived, fired mid-startup, and the degraded async validation pass it drained
// starved the solution load itself).
let solutionAnnounced = false;
connection.onNotification('clarion/solutionPending', (params: { solutionFilePath?: string }) => {
    solutionAnnounced = true;
    startupBackgroundActive = true;
    perfLogger.perf("Phase: clarion/solutionPending received", {
        since_module_load_ms: Date.now() - serverModuleLoadedAt,
        solution: params?.solutionFilePath ? path.basename(params.solutionFilePath) : '(unnamed)'
    });
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
    inlayHintsParameterNames?: boolean;  // inlay hints opt-out
    inlayHintsImplicitTypes?: boolean;   // inlay hints opt-out
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

        // #315: lenses requested BEFORE libsrcPaths arrived bypassed the #303
        // libsrc gate (empty list matches nothing) and stick in the editor.
        // Re-request them now that the gate can answer correctly.
        if (serverSettings.libsrcPaths.length) scheduleLensRefresh();

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
        if (params.inlayHintsParameterNames !== undefined) {
            serverSettings.inlayHintsParameterNames = params.inlayHintsParameterNames === true;
        }
        if (params.inlayHintsImplicitTypes !== undefined) {
            serverSettings.inlayHintsImplicitTypes = params.inlayHintsImplicitTypes === true;
        }
        if (params.referencesCodeLensEnabled !== undefined) {
            serverSettings.referencesCodeLensEnabled = params.referencesCodeLensEnabled === true;
            if (!serverSettings.referencesCodeLensEnabled) {
                codeLensPrecomputeGeneration++;
                codeLensRefCache.clear();
                codeLensRefIndex.clear();
            } else if (globalSolution) {
                setImmediate(() => {
                    precomputeCodeLensReferenceCounts(globalSolution!).catch(err =>
                        logger.error(`❌ CodeLens reference precompute failed after setting toggle: ${err instanceof Error ? err.message : String(err)}`)
                    );
                });
            }
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
            perfLogger.perf("Phase: SolutionManager init (parse .sln + load project source files)", {
                ms: Math.round(initEndTime - initStartTime),
                project_count: SolutionManager.getInstance()?.solution.projects.length ?? 0,
                since_module_load_ms: Date.now() - serverModuleLoadedAt
            });
            
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
            perfLogger.perf("Phase: buildClarionSolution", {
                ms: Math.round(buildEndTime - buildStartTime),
                project_count: globalSolution.projects.length,
                source_file_count: globalSolution.projects.reduce((n, p) => n + p.sourceFiles.length, 0),
                since_module_load_ms: Date.now() - serverModuleLoadedAt
            });
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
                // #263: must be the solution FILE path — the client compares it against its
                // globalSolutionFile to reject stale notifications. `solutionPath` here is the
                // solution DIRECTORY (projectPaths[0]), which never matches and silently killed
                // the deferred-activation path for slow-loading solutions.
                solutionFilePath: serverSettings.solutionFilePath || solutionPath,
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

            // #306: while the SDI is still pending, this pass was pure waste — its sync
            // validators are same-file (already ran at onDidOpen, same content) and its
            // async validators defer anyway; the sdiReady pass re-validates everything
            // with full context. Running it blocked the loop ~1s per open doc inside the
            // clarion/updatePaths handler. Queue the docs for the sdiReady pass instead;
            // if the SDI is somehow already ready (tiny solutions), validate now.
            if (!sdiPipelineReady) {
                for (const doc of openDocs) deferredAsyncDocs.add(doc.uri);
            } else {
                for (const doc of openDocs) {
                    validateTextDocument(doc, 'solutionReady');
                }
            }
            perfLogger.perf("Phase: Post-solution re-validation dispatched", {
                dispatch_ms: Date.now() - revalDispatchStart,
                doc_count: openDocs.length,
                deferred_drained: deferredCount,
                deferred_to_sdi_pass: String(!sdiPipelineReady),
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

            // #189 Phase 2 — precompute CodeLens reference counts in the background.
            // #290: moved to run AFTER the sdiReady validation pass (see the SDI prebuild block
            // below). It performs a cross-file reference scan per lens (measured 4,140 scans /
            // ~96s on a large solution) — started here it interleaved with the deferred
            // validators and multiplied their wall time (a 1-3s member resolution stretched to
            // 33s). Live-FAR fallback covers CodeLens counts until the cache warms, so it is
            // safe to be last in line.

            // Pre-build structure declaration index for all project paths in the background.
            // Without this, the first hover on a CLASS/INTERFACE/EQUATE etc. triggers a full scan
            // of all .inc files (potentially thousands), causing a 4-5s freeze.
            setImmediate(async () => {
                const { StructureDeclarationIndexer } = await import('./utils/StructureDeclarationIndexer');
                const indexer = StructureDeclarationIndexer.getInstance();
                // #355: the index now returns cache-trusted (no startup stat sweep) and
                // validates mtimes in the background. If that sweep finds an external
                // change made between sessions, treat it exactly like a #340 watched-file
                // change: drop every cross-file memo and revalidate open docs (debounced —
                // a regeneration drifts many files but must trigger one sweep).
                indexer.onDrift = (driftedProject) => {
                    logger.info(`🔄 [#355] SDI background validation found drift (${path.basename(driftedProject)}) — revalidating`);
                    evictIncludeChainIndexes();
                    bumpCrossFileEpoch();
                    IncludeVerifier.getInstance().clearCache();
                    if (watchedFilesRevalidateTimer !== undefined) clearTimeout(watchedFilesRevalidateTimer);
                    watchedFilesRevalidateTimer = setTimeout(() => {
                        watchedFilesRevalidateTimer = undefined;
                        for (const openDoc of documents.all()) {
                            validateTextDocument(openDoc, 'sdiDrift');
                        }
                    }, 500);
                };
                // #357 phase A: defer the SDI drift sweep onto the sequential
                // background lane. The cache-trusted build (#355) returns fast; its
                // 4,104-stat validation sweep must NOT race FRG / RefIndex / the
                // revalidation pass / interactive code actions on an op-rate-bound
                // disk — the [352-355] retest showed those overlapping and starving
                // code actions 9-26s. The sweep is drained as the LAST lane step below.
                indexer.deferBackgroundValidation = true;
                const projectPaths = [...new Set(
                    globalSolution!.projects.map(p => p.path).filter(Boolean)
                )];
                const sdiStart = Date.now();
                logger.info(`⏱️ [STARTUP] SDI build starting for ${projectPaths.length} project(s) at +${sdiStart - globalStartTime}ms`);
                await Promise.all(projectPaths.map(async p => {
                    const t = Date.now();
                    await indexer.getOrBuildIndex(p).catch(err =>
                        logger.error(`❌ [INDEX] Background build failed for ${p}: ${err}`)
                    );
                    perfLogger.perf("SDI: project structure index built", {
                        ms: Date.now() - t,
                        project: path.basename(p)
                    });
                }));
                logger.info(`⏱️ [STARTUP] SDI build complete in ${Date.now() - sdiStart}ms (total +${Date.now() - globalStartTime}ms)`);
                perfLogger.perf("Phase: SDI structure-index build complete (background)", {
                    ms: Date.now() - sdiStart,
                    project_count: projectPaths.length,
                    since_module_load_ms: Date.now() - serverModuleLoadedAt
                });

                // #289: the async cross-file validators were deferred until this point (several
                // block on the index internally — running them earlier parked them behind the
                // build). Index ready → user edits validate normally from here on.
                sdiPipelineReady = true;
                deferredAsyncDocs.clear();
                lastValidatedVersions.clear();

                // #290/#294: the automatic CodeLens precompute is GONE. Even scoped to open
                // documents, it ran a project-wide reference scan PER LENS (a large generated
                // module ≈ 178 lenses × ~178 files) — minutes of main-thread churn that made the
                // IDE unresponsive right after load, for a pure optimization. Counts now resolve
                // lazily per VISIBLE lens (user-proportional work) with per-symbol caching; the
                // settings-toggle path can still trigger a manual warm. The real fix — off-thread
                // or persisted reference indexing — is tracked in #294/#295.

                // #297: background work is strictly sequenced, and the ORDER matters. VM run 3
                // put the batch revalidation first (all docs Promise.all'd) and it pinned the
                // loop for 35s+ — cross-file validators fall back to directory scans while the
                // FRG doesn't exist yet, and a tree expand at +44s starved to its 15s timeout on
                // an in-memory getProjectFiles. So: short settle (client's post-ready burst
                // drains) → FRG build (yields every 10 files — interactive requests interleave)
                // → revalidation ONE DOC AT A TIME, each pass benefiting from the built graph.
                await new Promise<void>(resolve => setTimeout(resolve, 2000));
                await buildFileRelationshipGraph();

                // #319: the reference-count index builds BEFORE the revalidation pass.
                // The undeclaredVar validator's cross-file miss path (the sibling-MEMBER
                // walk in SymbolFinderService) prunes through this index; under the old
                // #294 "last and lowest priority" order the first revalidation ran with
                // the index unbuilt and cold-tokenized the whole program family per miss
                // (8.2s sync block on Mark's VM). Warm start is stat-only (~0.5s); the
                // batched build yields, and moving it up also gets lens estimates + the
                // exact-scan gate (#318) live sooner. Net: the flag-drop below happens
                // EARLIER because the revalidation stops paying the un-pruned walk.
                const { ReferenceCountIndex } = await import('./services/ReferenceCountIndex');
                const refIdxFiles: string[] = [];
                const smForIdx = SolutionManager.getInstance();
                if (smForIdx?.solution) {
                    for (const project of smForIdx.solution.projects) {
                        for (const sourceFile of project.sourceFiles) {
                            const absPath = sourceFile.getAbsolutePath();
                            if (absPath) refIdxFiles.push(absPath);
                        }
                    }
                }
                await ReferenceCountIndex.getInstance().buildInBackground(refIdxFiles).catch(err =>
                    logger.error(`❌ [RefIndex] Background build failed: ${err}`)
                );
                // Counts are now O(1) — repaint visible lenses with real numbers.
                scheduleLensRefresh();

                const revalStart = Date.now();
                let revalCount = 0;
                for (const doc of documents.all()) {
                    try {
                        await validateTextDocument(doc, 'sdiReady');
                    } catch { /* validator errors are logged at source */ }
                    revalCount++;
                }
                perfLogger.perf("Phase: sdiReady revalidation pass complete", {
                    ms: Date.now() - revalStart,
                    doc_count: revalCount,
                    since_module_load_ms: Date.now() - serverModuleLoadedAt
                });

                // #357 phase A: LAST lane step — the deferred SDI drift sweep. It only
                // reconciles an external change made between sessions (rare; #355
                // contract), so it runs alone here after every user-facing consumer,
                // never contending with them. onDrift still fires the debounced
                // revalidation if the sweep finds drift.
                // Reset the flag FIRST so any on-demand index build after startup
                // (a file opened in a not-yet-indexed project) validates immediately
                // rather than deferring onto a lane that has already drained.
                const driftStart = Date.now();
                indexer.deferBackgroundValidation = false;
                await indexer.runDeferredValidations();
                perfLogger.perf("Phase: SDI deferred drift sweep complete (lane tail)", {
                    ms: Date.now() - driftStart,
                    since_module_load_ms: Date.now() - serverModuleLoadedAt
                });

                // #301: end of the startup background chain - hover drops the "still indexing"
                // fallback from here on.
                startupBackgroundActive = false;
            });

            // Build the file-relationship graph (MODULE/INCLUDE/MEMBER edges) in the background.
            // Enables O(1) reverse lookups for local MAP scope (#91) and include chains (#52).
            // #297: invoked from the sequenced background chain above, no longer self-starting.
            const buildFileRelationshipGraph = async () => {
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
                perfLogger.perf("Phase: FRG file-relationship-graph build complete (background)", {
                    ms: Date.now() - frgStart,
                    file_count: allFiles.length,
                    scanned: graph.lastBuildStats?.scanned ?? -1,
                    reused_from_disk: graph.lastBuildStats?.reusedFromDisk ?? -1,
                    // #315: memberEdges=0 on a real solution = degraded resolution
                    // environment — the direct signal for the poisoned-cache family
                    // of failures (frg_member_edges_of_doc=0 in FAR traces).
                    member_edges: graph.lastBuildStats?.memberEdges ?? -1,
                    include_edges: graph.lastBuildStats?.includeEdges ?? -1,
                    module_edges: graph.lastBuildStats?.moduleEdges ?? -1,
                    since_module_load_ms: Date.now() - serverModuleLoadedAt
                });
                connection.sendNotification('clarion/graphStatus', {
                    status: 'built',
                    fileCount: graph.fileCount,
                    edgeCount: graph.edgeCount,
                    durationMs: graph.buildDurationMs
                });
            };

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
//
// #317: the client fires this once PER PROJECT (40x on a real solution) — the old
// handler re-validated every open document and reset the file-relationship graph
// per notification (~25 revalidations of the same unchanged file in one burst;
// one missingConstants pass measured 44s during the concurrent FRG cold-rescan
// window it caused itself). Coalesced: a burst costs ONE pass. The FRG is also
// REBUILT, not just reset — a bare reset left it dead until the next restart,
// degrading every family-scoped consumer (FAR scope, sibling-walk prune, hover).
const projectConstantsCoalescer = new TrailingCoalescer(500, async () => {
    const passStart = Date.now();
    // Clear the version-skip cache so validateTextDocument doesn't skip documents
    // whose source hasn't changed but whose cwproj has.
    lastValidatedVersions.clear();

    // Rebuild the file relationship graph — the project file list may have changed.
    const { FileRelationshipGraph } = await import('./FileRelationshipGraph');
    const graph = FileRelationshipGraph.getInstance();
    graph.reset();
    const smForGraph = SolutionManager.getInstance();
    const graphFiles: string[] = [];
    if (smForGraph?.solution) {
        for (const project of smForGraph.solution.projects) {
            for (const sourceFile of project.sourceFiles) {
                const absPath = sourceFile.getAbsolutePath();
                if (absPath) graphFiles.push(absPath);
            }
        }
    }
    if (graphFiles.length) {
        await graph.buildInBackground(graphFiles).catch(err =>
            logger.error(`❌ [FRG] constants-change rebuild failed: ${err}`));
    }

    // One doc at a time — same discipline as the startup revalidation chain.
    let docCount = 0;
    for (const document of documents.all()) {
        try {
            await validateTextDocument(document, 'constantsChanged');
        } catch (err) {
            logger.error(`❌ Re-validation error for ${document.uri}: ${err}`);
        }
        docCount++;
    }
    perfLogger.perf("projectConstantsChanged coalesced pass complete", {
        ms: Date.now() - passStart,
        doc_count: docCount,
        frg_files: graphFiles.length
    });
});
connection.onNotification('clarion/projectConstantsChanged', () => {
    logger.test('📥 clarion/projectConstantsChanged — coalescing (#317)');
    projectConstantsCoalescer.trigger();
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
            // #329: resolve owner-project-first on behalf of the requesting source file.
            const fromFsPath = params.sourceUri
                ? decodeURIComponent(params.sourceUri.replace(/^file:\/\/\/?/i, '')).replace(/\//g, '\\')
                : undefined;
            const result = await solutionManager.findFileWithExtension(params.filename, fromFsPath);
            if (result && result.path) {
                logger.info(`✅ Found file: ${result.path} (source: ${result.source})`);
                return result;
            } else {
                // If no extension is provided, try with default lookup extensions
                if (!path.extname(params.filename)) {
                    for (const ext of serverSettings.defaultLookupExtensions) {
                        const filenameWithExt = `${params.filename}${ext}`;
                        const resultWithExt = await solutionManager.findFileWithExtension(filenameWithExt, fromFsPath);
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
                // #329: the sought file's own path is the owner anchor here.
                const fromFsPath = decodeURIComponent(params.uri.replace(/^file:\/\/\/?/i, '')).replace(/\//g, '\\');
                const result = await solutionManager.findFileWithExtension(fileName, fromFsPath);

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
    // #297 S5: open documents answer from the version-keyed cache (disk-loaded fallbacks
    // above have no live version to key on, so they compute fresh).
    if (documents.get(params.uri) && symbolCacheVersions.get(params.uri) === document.version && symbolCache.has(params.uri)) {
        return symbolCache.get(params.uri)!;
    }
    const tokens = getTokens(document);
    const symbols = clarionDocumentSymbolProvider.provideDocumentSymbols(tokens, params.uri, document);
    if (documents.get(params.uri)) {
        symbolCache.set(params.uri, symbols);
        symbolCacheVersions.set(params.uri, document.version);
    }
    logger.info(`✅ [Server] Returning ${symbols.length} symbols`);
    return symbols;
});

// Handle definition requests
connection.onDefinition(async (params, token) => {

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
        // #360: thread the LSP cancellation token so a giving-up user can abort a
        // slow F12 (parity with onImplementation), and so the trace records it.
        const definition = await definitionProvider.provideDefinition(document, params.position, token);
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
connection.onImplementation(async (params, token) => {
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
        const implementation = await implementationProvider.provideImplementation(document, params.position, token);
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
connection.onReferences(async (params: ReferenceParams, token) => {
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
        // #189 Phase 4 (initial): if cursor is on a declaration symbol that has a
        // precomputed CodeLens reference entry, serve FAR directly from that cache.
        // Keeps FAR O(1) for the common declaration-path while preserving the full
        // live provider fallback for every other case.
        const lensData = findCodeLensDataAtPosition(document, params.position);
        if (lensData) {
            const cacheKey = `${lensData.uri}:${lensData.line}:${lensData.character}`;
            const cached = codeLensRefCache.get(cacheKey);
            if (cached) {
                let refs = cached.refs;
                if (!params.context.includeDeclaration) {
                    refs = refs.filter(loc =>
                        !(loc.uri === lensData.uri && loc.range.start.line === lensData.line)
                    );
                }
                logger.info(`⚡ [FAR] Cache hit for declaration ${cacheKey}: ${refs.length} reference(s)`);
                return refs;
            }
        }

        // #315: this used to race the scan against a 15s timeout that resolved
        // null — the peek showed NOTHING while the scan burned on in the
        // background (Mark's log: 7× onReferences at ~15.0-15.5s, empty peek
        // each time, re-click, repeat). A slow right answer beats a fast empty
        // one; the client's cancellation token still aborts abandoned requests.
        const farStart = Date.now();
        const references = await referencesProvider.provideReferences(document, params.position, params.context, token);
        const farMs = Date.now() - farStart;
        if (farMs >= 1_000) {
            perfLogger.perf("FAR slow", {
                ms: farMs,
                count: references?.length ?? 0,
                cancelled: String(token.isCancellationRequested),
                line: params.position.line,
                uri: params.textDocument.uri
            });
        }

        // A completed FAR at a lens declaration IS the exact count — persist it
        // so the lens title upgrades from the ~estimate and repeat clicks are O(1).
        if (lensData && references && params.context.includeDeclaration && !token.isCancellationRequested) {
            const cacheKey = `${lensData.uri}:${lensData.line}:${lensData.character}`;
            const shortName = (lensData.symbolName ?? '').split('.').pop()?.toLowerCase() ?? '';
            codeLensRefCache.set(cacheKey, { refs: references, shortName });
            codeLensRefIndex.removeSymbol(cacheKey);
            for (const loc of references) {
                codeLensRefIndex.add(cacheKey, {
                    uri: loc.uri,
                    line: loc.range.start.line,
                    character: loc.range.start.character,
                });
            }
            scheduleLensRefresh();
        }

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

// Inlay hints — implicit-variable types + parameter-name hints at call sites.
// DORMANT (2026-07-07): the `inlayHintProvider` capability is no longer advertised (see the
// server capabilities block above), so VS Code never calls this handler. Kept for easy re-enable.
connection.languages.inlayHint.on((params) => {
    if (!serverInitialized) return null;
    const document = documents.get(params.textDocument.uri);
    if (!document) return null;
    try {
        const tokens = getTokens(document);
        if (!tokens || tokens.length === 0) return [];
        return inlayHintsProvider.provideInlayHints(document, params.range, tokens);
    } catch (error) {
        logger.error(`❌ Error providing inlay hints: ${error instanceof Error ? error.message : String(error)}`);
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

    // #301: while startup pipelines run, an unresolved hover shows a "still indexing" note
    // instead of null — a null makes VS Code's "Loading…" placeholder vanish silently, which
    // reads as "this symbol has no hover" when the truth is "not ready yet".
    const hoverReadiness = () => ({
        serverInitialized,
        solutionAnnounced,
        solutionPipelineReady,
        sdiPipelineReady
    });

    if (!serverInitialized) {
        logger.info(`⚠️ [DELAY] Server not initialized yet, delaying hover request`);
        return initializingHoverFallback(null, hoverReadiness());
    }

    const document = documents.get(params.textDocument.uri);
    if (!document) {
        logger.info(`⚠️ Document not found: ${params.textDocument.uri}`);
        return null;
    }

    try {
        const hoverPromise: Promise<import('vscode-languageserver/node').Hover | null> = (async () => {
            try {
                return await hoverProvider.provideHover(document, params.position);
            } catch (error) {
                logger.error(`❌ Error providing hover: ${error instanceof Error ? error.message : String(error)}`);
                return null;
            }
        })();

        // #301 follow-up: during the startup background window, resolution is exactly what
        // crawls (queued behind indexing) — waiting for it meant VS Code dismissed the tooltip
        // before any answer arrived, so the first cut of the "still indexing" note never
        // rendered. RACE the real resolution against a short budget: a fast hover still wins
        // (same-file info works fine mid-startup); a slow or empty one yields the note
        // immediately, early enough to actually display. The resolution keeps running in the
        // background and warms the caches for the next attempt.
        if (startupBackgroundActive || !solutionPipelineReady || !sdiPipelineReady) {
            const raced = await Promise.race([
                hoverPromise,
                new Promise<'busy'>(resolve => setTimeout(() => resolve('busy'), 300))
            ]);
            if (raced === 'busy' || raced === null) {
                return buildIndexingHover();
            }
            return raced;
        }

        const hover = await hoverPromise;
        if (hover) {
            logger.info(`✅ Found hover info for ${params.textDocument.uri}`);
        } else {
            logger.info(`⚠️ No hover info found for ${params.textDocument.uri}`);
        }
        return initializingHoverFallback(hover, hoverReadiness());
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

        // #312: VS Code fires code-action requests on every cursor move — on large
        // generated modules the chain measured 100-300ms per invocation. Run the
        // providers through a timed table so a slow request NAMES its provider in
        // the release perf log (the per-provider info lines are suppressed there).
        const providerRuns: Array<[string, () => CodeAction[] | Promise<CodeAction[]>]> = [
            ['classConstants', () => new ClassConstantsCodeActionProvider().provideCodeActions(document, params.range, params.context, params as any)],
            ['flatten', () => new FlattenCodeActionProvider().provideCodeActions(document, params.range)],
            ['mapModule', () => new MapModuleCodeActionProvider().provideCodeActions(document, params.range)],
            ['mapDecl', () => new MapDeclarationCodeActionProvider().provideCodeActions(document, params.range, params.context)],
            ['unicode', () => new UnicodeCodeActionProvider().provideCodeActions(document, params.range, params.context)],
            ['generateRoutine', () => new GenerateRoutineCodeActionProvider().provideCodeActions(document, params.range)],
            ['introduceEquate', () => new IntroduceEquateCodeActionProvider().provideCodeActions(document, params.range)],
        ];

        const allActions: CodeAction[] = [];
        const timings: Array<[string, number]> = [];
        for (const [name, run] of providerRuns) {
            const t0 = Date.now();
            const produced = await run();
            const ms = Date.now() - t0;
            timings.push([name, ms]);
            logger.info(`⏱️ [CODE-ACTION] ${name} done: ${ms}ms → ${produced.length} actions`);
            allActions.push(...produced);
        }

        const totalMs = Date.now() - caStart;
        if (totalMs >= 100) {
            const top = timings
                .filter(([, ms]) => ms >= 10)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 4)
                .map(([name, ms]) => `${name}=${ms}`)
                .join(', ');
            perfLogger.perf("CodeAction chain slow", {
                total_ms: totalMs,
                top: top || '(spread below 10ms each)',
                line: params.range.start.line,
                uri: params.textDocument.uri
            });
        }
        logger.info(`⏱️ [CODE-ACTION] ■ total ${totalMs}ms → ${allActions.length} actions returned`);
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
            // vscode-languageclient@8: activeSignature/activeParameter are optional uinteger
            // (number | undefined) — the old undefined→null conversion is no longer valid.
            return signatureHelp;
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
//
// #289: when a solution IS on its way (path known / manager created / load in
// flight), RESCHEDULE instead of draining. Draining mid-load ran the full
// async cross-file pass on every deferred doc in degraded no-solution mode,
// only for solutionReady to re-validate them all again — double the most
// expensive work on exactly the biggest solutions. Genuine no-solution
// workspaces have none of these signals and still drain at 2s as before.
const drainDeferredIfNoSolution = () => {
    if (solutionPipelineReady) return;
    const sinceLoad = Date.now() - serverModuleLoadedAt;
    const solutionOnItsWay =
        solutionAnnounced ||
        (global as any).solutionOperationInProgress === true ||
        SolutionManager.getInstance() !== null ||
        !!serverSettings.solutionFilePath;
    // Hard cap: if an announced solution never finishes loading (load failure), don't defer
    // async diagnostics forever — drain after 60s regardless.
    if (solutionOnItsWay && sinceLoad < 60_000) {
        perfLogger.perf("Phase B addendum — no-solution timeout deferred (solution load under way)", {
            since_module_load_ms: sinceLoad,
            deferred_count: deferredAsyncDocs.size
        });
        setTimeout(drainDeferredIfNoSolution, 2000);
        return;
    }
    perfLogger.perf("Phase B addendum — no-solution timeout fired, draining deferred async queue", {
        since_module_load_ms: Date.now() - serverModuleLoadedAt,
        deferred_count: deferredAsyncDocs.size
    });
    solutionPipelineReady = true;
    startupBackgroundActive = false; // #301: nothing is coming - drop the hover fallback
    sdiPipelineReady = true; // no solution → no SDI prebuild will ever fire; unblock the async pass
    const queuedUris = Array.from(deferredAsyncDocs);
    deferredAsyncDocs.clear();
    for (const uri of queuedUris) {
        const doc = documents.get(uri);
        if (doc) validateTextDocument(doc, 'noSolutionTimeout');
    }
};
setTimeout(drainDeferredIfNoSolution, 2000);

// #289 diagnostics: event-loop lag sampler for the first 120s. A 100ms heartbeat drifts by
// however long the loop was blocked; the max drift per 5s window is reported (only when it
// exceeds 100ms, to keep the log lean). This directly distinguishes "phase X is genuinely slow"
// from "phase X's wall-clock ballooned because something else starved the single-threaded loop"
// — the run-3/run-4 SolutionManager-init variance (0.7s vs 15s, identical work) needs exactly
// this attribution.
{
    const samplerStart = Date.now();
    let lastTick = Date.now();
    let windowMaxLag = 0;
    const heartbeat = setInterval(() => {
        const now = Date.now();
        const lag = now - lastTick - 100;
        lastTick = now;
        if (lag > windowMaxLag) windowMaxLag = lag;
    }, 100);
    const reporter = setInterval(() => {
        if (windowMaxLag > 100) {
            perfLogger.perf("EventLoop lag", {
                max_blocked_ms: windowMaxLag,
                since_module_load_ms: Date.now() - serverModuleLoadedAt
            });
        }
        windowMaxLag = 0;
        if (Date.now() - samplerStart > 120_000) {
            clearInterval(heartbeat);
            clearInterval(reporter);
        }
    }, 5000);
}

// Listen on the connection
logger.info("🚀 SERVER: Starting to listen on connection [361-HOVER BUILD]");
console.error("🚀 SERVER: Starting to listen on connection [361-HOVER BUILD] at " + new Date().toISOString());
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
