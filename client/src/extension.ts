import * as path from 'path';
import { commands, ExtensionContext, TreeView, workspace, Disposable, languages, DiagnosticCollection, window } from 'vscode';
import { LanguageClient } from 'vscode-languageclient/node';

import { DocumentManager } from './documentManager';
import { SolutionTreeDataProvider } from './SolutionTreeDataProvider';
import { StructureViewProvider } from './views/StructureViewProvider';
import { TreeNode } from './TreeNode';
import { globalSolutionFile, activateClarionVersionState } from './globals';
import LoggerManager from './utils/LoggerManager';
import { SolutionCloseReason } from './utils/SolutionFallbackPolicy';

import { registerNavigationCommands } from './commands/NavigationCommands';
import { registerBuildCommands } from './commands/BuildCommands';
import { registerRunCommands } from './commands/RunCommands';
import { registerSolutionManagementCommands, registerSolutionOpeningCommands, registerMiscSolutionCommands } from './commands/SolutionCommands';
import { registerTreeCommands } from './commands/TreeCommands';
import { registerProjectFileCommands } from './commands/ProjectFileCommands';
import { registerStatusCommands } from './commands/ViewCommands';
import { registerTextEditingCommands } from './commands/TextEditingCommands';
import { registerRefactorCommands } from './commands/RefactorCommands';
import { registerClassCreationCommands } from './commands/ClassCreationCommands';
import { registerImplementationCommands } from './commands/ImplementationCommands';
import { registerClassConstantCommands } from './commands/ClassConstantCommands';
import { registerIncludeStatementCommands } from './commands/IncludeStatementCommands';
import { registerNewSolutionCommands } from './commands/NewSolutionCommands';
import { registerMapModuleCommands } from './commands/MapModuleCommands';
import { registerDebugCommands } from './commands/DebugCommands';
import { createSolutionTreeView, createStructureView, registerSolutionToolbar, updateSolutionToolbar } from './views/ViewManager';
import { registerLanguageFeatures } from './providers/LanguageFeatureManager';
import * as SolutionOpener from './solution/SolutionOpener';
import { showClarionQuickOpen } from './navigation/QuickOpenProvider';
import * as SolutionInitializer from './solution/SolutionInitializer';
import { setConfiguration } from './config/ConfigurationManager';
import * as ActivationManager from './activation/ActivationManager';
// #273 — the initialization indicator is now a Clarion-scoped language status item driven by the
// solution-load lifecycle (SolutionInitializer), not painted unconditionally on activation. So a
// non-Clarion (or solution-free) folder shows nothing; per-file language features are unaffected.

const logger = LoggerManager.getLogger("Extension");
logger.setLevel("error");
let client: LanguageClient | undefined;
// clientReady is now managed by LanguageClientManager
let treeView: TreeView<TreeNode> | undefined;
let solutionTreeDataProvider: SolutionTreeDataProvider | undefined;
let structureViewProvider: StructureViewProvider | undefined;
let structureView: TreeView<any> | undefined;
let documentManager: DocumentManager | undefined;


// Helper function to escape special characters in file paths for RegExp

export async function activate(context: ExtensionContext): Promise<void> {
    const activationStartTime = Date.now();
    const disposables: Disposable[] = [];
    const isRefreshingRef = { value: false };
    const diagnosticCollection = languages.createDiagnosticCollection("clarion");
    context.subscriptions.push(diagnosticCollection);

    // Route all client-side logger output to the Output window
    const clientOutputChannel = window.createOutputChannel("Clarion Extension (Client)");
    context.subscriptions.push(clientOutputChannel);
    LoggerManager.setOutputChannel(clientOutputChannel);

    // Per-session log file — truncates on activate so each session is fresh.
    // Diagnostic sink; failures are silent. Path: <workspace>/.clarion-debug/client.log
    // (or extension log dir when no workspace is open).
    const wsRoot = workspace.workspaceFolders?.[0]?.uri.fsPath;
    const logBaseDir = wsRoot ?? context.logUri.fsPath;
    LoggerManager.initFileSink(path.join(logBaseDir, '.clarion-debug', 'client.log'));

    // #295 diagnosis: EXTENSION-HOST event-loop lag sampler (mirror of the server's). The tree
    // view, structure view, and every provider run on the extension host — if THIS thread blocks,
    // the UI spins no matter how healthy the language server is. A 100ms heartbeat's drift is the
    // block length; max per 5s window, reported when >100ms, for the first 5 minutes.
    {
        const clientPerf = LoggerManager.getLogger("ClientPerf", "perf");
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
                clientPerf.perf("ExtensionHost EventLoop lag", {
                    max_blocked_ms: windowMaxLag,
                    since_activation_ms: Date.now() - activationStartTime
                });
            }
            windowMaxLag = 0;
            if (Date.now() - samplerStart > 300_000) {
                clearInterval(heartbeat);
                clearInterval(reporter);
            }
        }, 5000);
        context.subscriptions.push({ dispose: () => { clearInterval(heartbeat); clearInterval(reporter); } });
    }

    // #148 — register the Actions-pane webview provider EARLY, before any
    // awaits in the activation flow. The view's `visibility: "visible"`
    // contribution in package.json triggers VS Code to start setting up the
    // webview iframe + service worker as soon as the view container is
    // available. If our provider isn't registered yet when VS Code tries to
    // resolve the view, VS Code's SW registration hits an `InvalidStateError`
    // (the SW tries to attach to a half-set-up document). #132 B3 widened
    // the activation chain (added `activateClarionVersionState` + LSP server
    // start awaits) enough to expose this latent race deterministically.
    //
    // The provider only depends on `context.extensionUri` (immediately
    // available); no need to wait on globalState/solution/LSP/folder-settings
    // before registering. Existing late-call at line ~141 removed.
    registerSolutionToolbar(context);

    const state: ActivationManager.ActivationState = {
        client,
        treeView,
        solutionTreeDataProvider,
        structureViewProvider,
        structureView,
        documentManager,
        diagnosticCollection
    };
    
    logger.info(`⏱️ [STARTUP] Client activation started at ${new Date().toISOString()}`);
    logger.info("🚀 ========== ACTIVATION START ==========");
    
    // #132 / dd87633f B3 — first-run version migration + on-activation
    // status-bar paint. Solution-free; runs once per activation. Auto-promotes
    // a legacy `solutions[].version` to User-scope `clarion.activeVersion`
    // (gated by `clarion.versionMigrated`) and refreshes the version status
    // bar item from the User-scope value.
    //
    // #141 B3 — `context` is passed through so the L3 backfill (legacy
    // `solutions[].version` → `solutionVersionMemory` globalState seed) can
    // run on first post-#141 activation. Gated by a separate flag from
    // `versionMigrated` so pre-#141 users who already have L1 set still get
    // their per-solution intent preserved.
    try {
        await activateClarionVersionState(context);
    } catch (err) {
        logger.warn(`⚠️ Clarion-version activation failed: ${err instanceof Error ? err.message : String(err)}`);
        // Non-fatal — extension continues activating.
    }

    // Phase 1-5: Core initialization
    await ActivationManager.initializeGlobalState(context);
    await ActivationManager.checkConflictingExtensions(context);
    ActivationManager.registerEventListeners(context);
    const xmlFileCount = ActivationManager.checkForOpenXmlFiles();
    
    // Phase 6: Start language server (starts for per-file language features regardless of whether
    // a solution is open; #273 — no status ping here, the solution-load path surfaces its own).
    await ActivationManager.startClientServer(context, state, xmlFileCount > 0);
    client = state.client;
    
    // Phase 7-10: Check environment and load settings
    const { hasFolder, isTrusted } = ActivationManager.checkFolderStatus();
    ActivationManager.handleNoFolderScenario(hasFolder);
    
    if (!ActivationManager.checkFolderTrust(hasFolder, isTrusted)) {
        return;
    }
    
    await ActivationManager.loadFolderSettings(hasFolder, context);
    
    // Phase 11: Register commands
    logger.info("🔄 Phase 11: Registering commands...");
    registerOpenCommand(context);
    
    context.subscriptions.push(
        ...registerMiscSolutionCommands(
            context,
            hasFolder,
            isTrusted,
            openClarionSolution,
            openSolutionFromList,
            closeClarionSolution,
            () => setConfiguration(solutionTreeDataProvider),
            showClarionQuickOpen
        )
    );
    
    // Setup folder-dependent features
    await ActivationManager.setupFolderDependentFeatures(
        context,
        hasFolder,
        isTrusted,
        state,
        isRefreshingRef,
        reinitializeEnvironment,
        workspaceHasBeenTrusted,
        disposables
    );

    // #273 — no solution being initialized → stay silent (no "Clarion: Ready"). The init
    // indicator is solution-load feedback only, driven by SolutionInitializer.

    // Always create views
    await commands.executeCommand("setContext", "clarion.solutionOpen", hasFolder && !!globalSolutionFile);
    
    const solutionTreeResult = await createSolutionTreeView(context, treeView, solutionTreeDataProvider);
    treeView = solutionTreeResult.treeView;
    solutionTreeDataProvider = solutionTreeResult.provider;
    context.subscriptions.push(treeView);

    // #148 — `registerSolutionToolbar(context)` moved to the top of activate(),
    // right after logger setup, to avoid VS Code's webview SW registration
    // racing against our late-registration in the original flow.

    const structureViewResult = await createStructureView(context, structureView, structureViewProvider);
    structureView = structureViewResult.structureView;
    structureViewProvider = structureViewResult.provider;
    context.subscriptions.push(structureView);
    
    // Register status command (replaces old status view)
    context.subscriptions.push(...registerStatusCommands(context));
    
    // Register text editing commands (paste as string)
    context.subscriptions.push(...registerTextEditingCommands(context));

    // Register refactor commands (#277 — Surround With)
    context.subscriptions.push(...registerRefactorCommands(context));

    // Register class creation commands
    context.subscriptions.push(...registerClassCreationCommands(context));
    
    // Register implementation commands
    context.subscriptions.push(...registerImplementationCommands(context));
    
    // Register class constant commands
    context.subscriptions.push(...registerClassConstantCommands(context));
    
    // Register include statement commands
    context.subscriptions.push(...registerIncludeStatementCommands(context));

    // Register new solution command
    context.subscriptions.push(...registerNewSolutionCommands(context));

    // Register MAP module command (Add MODULE with PROCEDURE from MAP code action)
    context.subscriptions.push(...registerMapModuleCommands(context));

    // Register debug commands (show internal graph state)
    context.subscriptions.push(...registerDebugCommands(context, client));
    
    context.subscriptions.push(...disposables);
    
    // Register remaining commands
    context.subscriptions.push(
        ...registerProjectFileCommands(solutionTreeDataProvider),
        ...registerSolutionOpeningCommands(context, initializeSolution, solutionTreeDataProvider)
    );
    
    context.subscriptions.push(
        ...registerNavigationCommands(treeView, solutionTreeDataProvider),
        ...registerBuildCommands(diagnosticCollection, solutionTreeDataProvider),
        ...registerRunCommands(solutionTreeDataProvider),
        ...registerSolutionManagementCommands(context, client, initializeSolution, createSolutionTreeView),
        ...registerTreeCommands(solutionTreeDataProvider)
    );
    
    // Create DocumentManager for standalone file support
    if (!documentManager) {
        logger.info("🔍 Creating DocumentManager for standalone file support...");
        try {
            documentManager = await DocumentManager.create();
            logger.info("✅ DocumentManager created for standalone files");
            
            logger.info("🔍 Registering language features...");
            registerLanguageFeatures(context, documentManager);
        } catch (error) {
            logger.error(`❌ Error creating DocumentManager: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    
    const activationDuration = Date.now() - activationStartTime;
    logger.info(`⏱️ [STARTUP] Client activation complete in ${activationDuration}ms`);
    logger.info(`✅ Extension activation completed in ${activationDuration}ms`);
}


// Wrapper functions for solution initialization that inject dependencies
async function workspaceHasBeenTrusted(context: ExtensionContext, disposables: Disposable[]): Promise<void> {
    await SolutionInitializer.workspaceHasBeenTrusted(context, disposables, initializeSolution, documentManager);
}

async function initializeSolution(context: ExtensionContext, refreshDocs: boolean = false): Promise<void> {
    await SolutionInitializer.initializeSolution(context, refreshDocs, client, reinitializeEnvironment, documentManager);
    updateSolutionToolbar();
}

async function reinitializeEnvironment(refreshDocs: boolean = false): Promise<DocumentManager> {
    return await SolutionInitializer.reinitializeEnvironment(refreshDocs, client, documentManager);
}




/**
 * Retrieves all open documents across all tab groups.
 * If a document is not tracked in `workspace.textDocuments`, it forces VS Code to load it.
 */

// Export wrappers for solution opening/closing that inject dependencies
export async function openSolutionFromList(context: ExtensionContext) {
    await SolutionOpener.openSolutionFromList(context, initializeSolution, closeClarionSolution);
}

export async function openClarionSolution(context: ExtensionContext) {
    await SolutionOpener.openClarionSolution(context, initializeSolution);
}

export async function closeClarionSolution(context: ExtensionContext, reason: SolutionCloseReason = 'user') {
    await SolutionOpener.closeClarionSolution(context, reinitializeEnvironment, documentManager, reason);
    updateSolutionToolbar();
}

async function registerOpenCommand(context: ExtensionContext) {
    const existingCommands = await commands.getCommands();

    if (!existingCommands.includes('clarion.openFile')) {
    }
}


/**
 * Opens a solution from the list of available solutions in the workspace
 * If a solution is already open, it will be closed first
 */

// Re-export showClarionQuickOpen from QuickOpenProvider
export { showClarionQuickOpen } from './navigation/QuickOpenProvider';









export function deactivate(): Thenable<void> | undefined {
    logger.setLevel("error");
    logger.info("🛑 DEACTIVATE: Starting extension deactivation");
    console.log("🛑 DEACTIVATE: Starting extension deactivation at " + new Date().toISOString());
    
    if (!client) {
        logger.info("🛑 DEACTIVATE: No client to stop");
        console.log("🛑 DEACTIVATE: No client to stop");
        return undefined;
    }
    
    logger.info("🛑 DEACTIVATE: Stopping language client...");
    console.log("🛑 DEACTIVATE: Stopping language client at " + new Date().toISOString());
    
    const stopPromise = client.stop();
    
    // Add timeout monitoring
    const timeoutId = setTimeout(() => {
        logger.info("🛑 DEACTIVATE: Client stop() taking longer than 5 seconds...");
        console.log("🛑 DEACTIVATE: Client stop() taking longer than 5 seconds at " + new Date().toISOString());
    }, 5000);
    
    if (stopPromise) {
        return stopPromise.then(() => {
            clearTimeout(timeoutId);
            logger.info("🛑 DEACTIVATE: Language client stopped successfully");
            console.log("🛑 DEACTIVATE: Language client stopped successfully at " + new Date().toISOString());
        }).catch((error) => {
            clearTimeout(timeoutId);
            logger.info(`🛑 DEACTIVATE: Error stopping client: ${error}`);
            console.log(`🛑 DEACTIVATE: Error stopping client: ${error} at ` + new Date().toISOString());
        });
    }
    
    return undefined;
}








