import { commands, ExtensionContext, TreeView, workspace, Disposable, languages, DiagnosticCollection } from 'vscode';
import { LanguageClient } from 'vscode-languageclient/node';

import { DocumentManager } from './documentManager';
import { SolutionTreeDataProvider } from './SolutionTreeDataProvider';
import { StructureViewProvider } from './StructureViewProvider';
import { StatusViewProvider } from './StatusViewProvider';
import { TreeNode } from './TreeNode';
import { globalSolutionFile } from './globals';
import LoggerManager from './logger';

import { trackPerformance } from './telemetry';
import { registerNavigationCommands } from './commands/NavigationCommands';
import { registerBuildCommands } from './commands/BuildCommands';
import { registerSolutionManagementCommands, registerSolutionOpeningCommands, registerMiscSolutionCommands } from './commands/SolutionCommands';
import { registerProjectFileCommands } from './commands/ProjectFileCommands';
import { createSolutionTreeView, createStructureView, createStatusView } from './views/ViewManager';
import { registerLanguageFeatures } from './providers/LanguageFeatureManager';
import * as SolutionOpener from './solution/SolutionOpener';
import { showClarionQuickOpen } from './navigation/QuickOpenProvider';
import * as SolutionInitializer from './solution/SolutionInitializer';
import { setConfiguration } from './config/ConfigurationManager';
import * as ActivationManager from './activation/ActivationManager';

const logger = LoggerManager.getLogger("Extension");
logger.setLevel("error"); // PERF: Only log errors to reduce overhead
let client: LanguageClient | undefined;
// clientReady is now managed by LanguageClientManager
let treeView: TreeView<TreeNode> | undefined;
let solutionTreeDataProvider: SolutionTreeDataProvider | undefined;
let structureViewProvider: StructureViewProvider | undefined;
let structureView: TreeView<any> | undefined;
let statusViewProvider: StatusViewProvider | undefined;
let statusView: TreeView<any> | undefined;
let documentManager: DocumentManager | undefined;


// Helper function to escape special characters in file paths for RegExp

export async function activate(context: ExtensionContext): Promise<void> {
    const activationStartTime = Date.now();
    const disposables: Disposable[] = [];
    const isRefreshingRef = { value: false };
    const diagnosticCollection = languages.createDiagnosticCollection("clarion");
    context.subscriptions.push(diagnosticCollection);
    
    const state: ActivationManager.ActivationState = {
        client,
        treeView,
        solutionTreeDataProvider,
        structureViewProvider,
        structureView,
        statusViewProvider,
        statusView,
        documentManager,
        diagnosticCollection
    };
    
    logger.info("🚀 ========== ACTIVATION START ==========");
    
    // Phase 1-5: Core initialization
    await ActivationManager.initializeGlobalState(context);
    await ActivationManager.initializeTelemetryTracking(context);
    await ActivationManager.checkConflictingExtensions(context);
    ActivationManager.registerEventListeners(context);
    const xmlFileCount = ActivationManager.checkForOpenXmlFiles();
    
    // Phase 6: Start language server
    await ActivationManager.startClientServer(context, state, xmlFileCount > 0);
    client = state.client;
    
    // Phase 7-10: Check environment and load settings
    const { hasFolder, isTrusted } = ActivationManager.checkFolderStatus();
    ActivationManager.handleNoFolderScenario(hasFolder);
    
    if (!ActivationManager.checkFolderTrust(hasFolder, isTrusted)) {
        return;
    }
    
    await ActivationManager.loadFolderSettings(hasFolder);
    
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
    
    // Always create views
    await commands.executeCommand("setContext", "clarion.solutionOpen", hasFolder && !!globalSolutionFile);
    
    const solutionTreeResult = await createSolutionTreeView(context, treeView, solutionTreeDataProvider);
    treeView = solutionTreeResult.treeView;
    solutionTreeDataProvider = solutionTreeResult.provider;
    context.subscriptions.push(treeView);
    
    const structureViewResult = await createStructureView(context, structureView, structureViewProvider);
    structureView = structureViewResult.structureView;
    structureViewProvider = structureViewResult.provider;
    context.subscriptions.push(structureView);
    
    const statusViewResult = await createStatusView(context);
    statusView = statusViewResult.statusView;
    statusViewProvider = statusViewResult.provider;
    context.subscriptions.push(statusView);
    
    context.subscriptions.push(...disposables);
    
    // Register remaining commands
    context.subscriptions.push(
        ...registerProjectFileCommands(solutionTreeDataProvider),
        ...registerSolutionOpeningCommands(context, initializeSolution, solutionTreeDataProvider, statusViewProvider)
    );
    
    context.subscriptions.push(
        ...registerNavigationCommands(treeView, solutionTreeDataProvider),
        ...registerBuildCommands(diagnosticCollection, solutionTreeDataProvider),
        ...registerSolutionManagementCommands(context, client, initializeSolution, createSolutionTreeView)
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
    logger.info(`✅ Extension activation completed in ${activationDuration}ms`);
    trackPerformance('ExtensionActivation', activationDuration);
}


// Wrapper functions for solution initialization that inject dependencies
async function workspaceHasBeenTrusted(context: ExtensionContext, disposables: Disposable[]): Promise<void> {
    await SolutionInitializer.workspaceHasBeenTrusted(context, disposables, initializeSolution, documentManager);
}

async function initializeSolution(context: ExtensionContext, refreshDocs: boolean = false): Promise<void> {
    await SolutionInitializer.initializeSolution(context, refreshDocs, client, reinitializeEnvironment, documentManager, statusViewProvider);
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
    await SolutionOpener.openSolutionFromList(context, initializeSolution, closeClarionSolution, statusViewProvider);
}

export async function openClarionSolution(context: ExtensionContext) {
    await SolutionOpener.openClarionSolution(context, initializeSolution, statusViewProvider);
}

export async function closeClarionSolution(context: ExtensionContext) {
    await SolutionOpener.closeClarionSolution(context, reinitializeEnvironment, documentManager, statusViewProvider);
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
    if (!client) {
        return undefined;
    }
    return client.stop();
}









