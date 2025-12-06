import { commands, window, ExtensionContext, TreeView, workspace, Disposable, languages, extensions, DiagnosticCollection, window as vscodeWindow } from 'vscode';
import { LanguageClient } from 'vscode-languageclient/node';

import { DocumentManager } from './documentManager';
import { SolutionTreeDataProvider } from './SolutionTreeDataProvider';
import { StructureViewProvider } from './StructureViewProvider';
import { StatusViewProvider } from './StatusViewProvider';
import { TreeNode } from './TreeNode';
import { globalClarionPropertiesFile, globalClarionVersion, globalSettings, globalSolutionFile } from './globals';
import LoggerManager from './logger';
import { isClientReady, getClientReadyPromise } from './LanguageClientManager';

import { initializeTelemetry, trackPerformance } from './telemetry';
import { GlobalSolutionHistory } from './utils/GlobalSolutionHistory';
import { updateBuildProjectStatusBar } from './statusbar/StatusBarManager';
import { registerNavigationCommands } from './commands/NavigationCommands';
import { registerBuildCommands } from './commands/BuildCommands';
import { registerSolutionManagementCommands, registerSolutionOpeningCommands, registerMiscSolutionCommands } from './commands/SolutionCommands';
import { registerProjectFileCommands } from './commands/ProjectFileCommands';
import { createSolutionTreeView, createStructureView, createStatusView } from './views/ViewManager';
import { registerLanguageFeatures } from './providers/LanguageFeatureManager';
import { createSolutionFileWatchers, handleSettingsChange } from './providers/FileWatcherManager';
import * as SolutionOpener from './solution/SolutionOpener';
import { showClarionQuickOpen } from './navigation/QuickOpenProvider';
import * as SolutionInitializer from './solution/SolutionInitializer';
import { startLanguageServer } from './server/LanguageServerManager';
import { setConfiguration } from './config/ConfigurationManager';
import { refreshOpenDocuments } from './document/DocumentRefreshManager';

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
    logger.info("🚀 ========== ACTIVATION START ==========");
    logger.info("🔄 Phase 1: Extension activation begin...");
    
    // Initialize global solution history
    GlobalSolutionHistory.initialize(context);
    logger.info("✅ Global solution history initialized");
    
    // Initialize telemetry (track initialization time separately)
    logger.info("🔄 Phase 2: Initializing telemetry...");
    const telemetryInitStart = Date.now();
    await initializeTelemetry(context);
    const telemetryInitDuration = Date.now() - telemetryInitStart;
    trackPerformance('TelemetryInitialization', telemetryInitDuration);
    logger.info(`✅ Phase 2 complete: Telemetry initialized in ${telemetryInitDuration}ms`);
    
    // Check if fushnisoft.clarion extension is installed
    logger.info("🔄 Phase 3: Checking for conflicting extensions...");
    const fushinsoftExtension = extensions.getExtension('fushnisoft.clarion');
    if (fushinsoftExtension) {
        const hasShownFushinsoftMessage = context.globalState.get<boolean>('clarion.hasShownFushinsoftMessage', false);
        
        if (!hasShownFushinsoftMessage) {
            const action = await window.showInformationMessage(
                "The fushnisoft.clarion extension is no longer needed. All syntax highlighting and language features are now included in Clarion Extensions. Would you like to uninstall it?",
                "Uninstall fushnisoft.clarion",
                "Keep Both",
                "Don't Show Again"
            );
            
            if (action === "Uninstall fushnisoft.clarion") {
                try {
                    await commands.executeCommand('workbench.extensions.uninstallExtension', 'fushnisoft.clarion');
                    window.showInformationMessage("fushnisoft.clarion has been uninstalled. Please reload VS Code for changes to take effect.", "Reload Now").then(selection => {
                        if (selection === "Reload Now") {
                            commands.executeCommand('workbench.action.reloadWindow');
                        }
                    });
                } catch (error) {
                    logger.error("Failed to uninstall fushnisoft.clarion", error);
                    window.showWarningMessage("Could not automatically uninstall fushnisoft.clarion. Please uninstall it manually from the Extensions view.");
                }
            }
            // Mark as shown regardless of action to avoid nagging
            await context.globalState.update('clarion.hasShownFushinsoftMessage', true);
        }
    }
    logger.info("✅ Phase 3 complete: Conflict check done");
    
    logger.info("🔄 Phase 4: Setting up event listeners...");
    // Add event listener for active editor changes to update the build status bar
    context.subscriptions.push(
        window.onDidChangeActiveTextEditor(() => {
            updateBuildProjectStatusBar();
        })
    );
    logger.info("✅ Phase 4 complete: Event listeners registered");

    logger.info("🔄 Phase 5: Checking for open XML files...");
    // Check for open XML files to avoid conflicts with redhat.vscode-xml extension
    const openXmlFiles = workspace.textDocuments.filter(doc =>
        doc.languageId === 'xml' || doc.fileName.toLowerCase().endsWith('.xml')
    );
    
    if (openXmlFiles.length > 0) {
        logger.warn(`⚠️ Found ${openXmlFiles.length} open XML files. This may cause conflicts with the XML extension.`);
        logger.warn("⚠️ Consider closing XML files before using Clarion features to avoid conflicts.");
        // We'll still continue activation, but with a longer delay to allow XML extension to initialize
    }
    logger.info("✅ Phase 5 complete: XML check done");

    logger.info("🔄 Phase 6: Starting language server...");
    // Icons are already in the images directory
    logger.info("✅ Using SVG icons from images directory");

    // ✅ Always start the language server for basic features (symbols, folding, formatting)
    if (!client) {
        logger.info("🚀 Starting Clarion Language Server...");
        // Use a longer delay if XML files are open
        await startClientServer(context, openXmlFiles.length > 0);
    }
    logger.info("✅ Phase 6 complete: Language server started");

    logger.info("🔄 Phase 7: Checking folder status...");
    // ✅ Check folder status - we just need an open folder, not a workspace file
    const hasFolder = !!(workspace.workspaceFolders && workspace.workspaceFolders.length > 0);
    const isTrusted = workspace.isTrusted;
    logger.info(`   - Has folder open: ${hasFolder}`);
    logger.info(`   - Is trusted: ${isTrusted}`);
    if (workspace.workspaceFolders) {
        logger.info(`   - Folders: ${workspace.workspaceFolders.map(f => f.uri.fsPath).join(', ')}`);
    }

    logger.info("🔄 Phase 8: Handling no-folder scenario...");
    // ✅ No popup needed - Solution View shows recent solutions when no folder is open
    if (!hasFolder) {
        logger.info("ℹ️ No folder open. Solution View will show recent solutions.");
        // Continue with limited activation - don't return here
        logger.info("📝 Operating in no-folder mode: basic language features available");
    }
    logger.info("✅ Phase 8 complete");

    logger.info("🔄 Phase 9: Checking folder trust...");
    // ✅ Early exit only if folder exists but isn't trusted
    if (hasFolder && !isTrusted) {
        logger.warn("⚠️ Folder is not trusted. Clarion features will remain disabled until trust is granted.");
        window.showWarningMessage("Clarion extension requires folder trust to enable features.");
        return; // ⛔ Exit early only for untrusted folder
    }
    logger.info("✅ Phase 9 complete");

    logger.info("🔄 Phase 10: Loading folder settings...");
    // ✅ Load folder settings if we have a folder open
    if (hasFolder) {
        logger.info("   - Calling globalSettings.initializeFromWorkspace()...");
        try {
            await globalSettings.initializeFromWorkspace();
            logger.info("   - initializeFromWorkspace() completed successfully");
        } catch (error) {
            logger.error("   - ❌ Error in initializeFromWorkspace():", error);
            throw error; // Re-throw to see full stack trace
        }
        
        // Log the current state of global variables after loading folder settings
        logger.info(`🔍 Global settings state after loading folder settings:
            - globalSolutionFile: ${globalSolutionFile || 'not set'}
            - globalClarionPropertiesFile: ${globalClarionPropertiesFile || 'not set'}
            - globalClarionVersion: ${globalClarionVersion || 'not set'}`);
    } else {
        logger.info("ℹ️ Skipping folder settings - no folder open");
    }
    logger.info("✅ Phase 10 complete");

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

    // ✅ Only setup folder-dependent features if we have a folder open
    if (hasFolder && isTrusted) {
        // ✅ Watch for changes in Clarion configuration settings
        context.subscriptions.push(
            workspace.onDidChangeConfiguration(async (event) => {
                if (event.affectsConfiguration("clarion.defaultLookupExtensions") || event.affectsConfiguration("clarion.configuration")) {
                    logger.info("🔄 Clarion configuration changed. Refreshing the solution cache...");
                    await handleSettingsChange(context, reinitializeEnvironment, documentManager);
                }
            })
        );

        // Create the file watchers initially
        if (globalSolutionFile) {
            await createSolutionFileWatchers(context, reinitializeEnvironment, documentManager);
        }

        // Re-create file watchers when the solution changes
        context.subscriptions.push(
            workspace.onDidChangeConfiguration(async (event) => {
                if (event.affectsConfiguration("clarion.redirectionFile") ||
                    event.affectsConfiguration("clarion.redirectionPath")) {
                    logger.info("🔄 Redirection settings changed. Recreating file watchers...");
                    await createSolutionFileWatchers(context, reinitializeEnvironment, documentManager);
                }
            })
        );

        // ✅ Ensure all restored tabs are properly indexed (folder with trust)
        if (!isRefreshingRef.value) {
            await refreshOpenDocuments(documentManager);

            // Check if we have a solution file loaded from folder settings
            if (globalSolutionFile) {
                logger.info(`✅ Solution file found in folder settings: ${globalSolutionFile}`);
                
                // Wait for the language client to be ready before initializing the solution
                if (client) {
                    logger.info("⏳ Waiting for language client to be ready before initializing solution...");
                    
                    if (isClientReady()) {
                        logger.info("✅ Language client is already ready. Proceeding with solution initialization...");
                        await workspaceHasBeenTrusted(context, disposables);
                    } else {
                        // Use the LanguageClientManager's readyPromise
                        getClientReadyPromise().then(async () => {
                            logger.info("✅ Language client is ready. Proceeding with solution initialization...");
                            await workspaceHasBeenTrusted(context, disposables);
                        }).catch(error => {
                            logger.error(`❌ Error waiting for language client: ${error instanceof Error ? error.message : String(error)}`);
                            vscodeWindow.showErrorMessage("Error initializing Clarion solution: Language client failed to start.");
                        });
                    }
                } else {
                    logger.error("❌ Language client is not available.");
                    vscodeWindow.showErrorMessage("Error initializing Clarion solution: Language client is not available.");
                }
            } else {
                logger.warn("⚠️ No solution file found in folder settings.");
            }
        }
    } else {
        // No folder - log that advanced features are disabled
        logger.info("ℹ️ Advanced features disabled: no folder open or folder not trusted");
    }

    // ✅ ALWAYS create the views (they work without folder)
    // Initialize the solution open context variable
    await commands.executeCommand("setContext", "clarion.solutionOpen", hasFolder && !!globalSolutionFile);
    
    // Always create the solution tree view (shows "Open Solution" button when no solution)
    const solutionTreeResult = await createSolutionTreeView(context, treeView, solutionTreeDataProvider);
    treeView = solutionTreeResult.treeView;
    solutionTreeDataProvider = solutionTreeResult.provider;
    context.subscriptions.push(treeView);
    
    // Always create the structure view (shows document outline, works without workspace)
    const structureViewResult = await createStructureView(context, structureView, structureViewProvider);
    structureView = structureViewResult.structureView;
    structureViewProvider = structureViewResult.provider;
    context.subscriptions.push(structureView);
    
    // Always create the status view (shows extension status and diagnostics)
    const statusViewResult = await createStatusView(context);
    statusView = statusViewResult.statusView;
    statusViewProvider = statusViewResult.provider;
    context.subscriptions.push(statusView);

    context.subscriptions.push(...disposables);

    // Register the commands programmatically to avoid conflicts with other extensions
    context.subscriptions.push(
        ...registerProjectFileCommands(solutionTreeDataProvider),
        ...registerSolutionOpeningCommands(context, initializeSolution, solutionTreeDataProvider, statusViewProvider)
    );



    context.subscriptions.push(
        ...registerNavigationCommands(treeView, solutionTreeDataProvider),
        ...registerBuildCommands(diagnosticCollection, solutionTreeDataProvider),
        ...registerSolutionManagementCommands(context, client, initializeSolution, createSolutionTreeView),
        
        // Commands for adding/removing source files are already registered above
    );
    
    // ✅ Create DocumentManager early for standalone file support
    // This enables features like Goto Implementation, Hover, etc. without a solution
    if (!documentManager) {
        logger.info("🔍 Creating DocumentManager for standalone file support...");
        try {
            documentManager = await DocumentManager.create();
            logger.info("✅ DocumentManager created for standalone files");
            
            // ✅ Register language features now that documentManager exists
            logger.info("🔍 Registering language features...");
            registerLanguageFeatures(context, documentManager);
        } catch (error) {
            logger.error(`❌ Error creating DocumentManager: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    
    // Track total activation time
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

async function startClientServer(context: ExtensionContext, hasOpenXmlFiles: boolean = false): Promise<void> {
    client = await startLanguageServer(context, documentManager, structureViewProvider);
}













