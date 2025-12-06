import { commands, Uri, window, ExtensionContext, TreeView, workspace, Disposable, languages, ConfigurationTarget, TextDocument, TextEditor, window as vscodeWindow, Diagnostic, DiagnosticSeverity, Range, StatusBarItem, StatusBarAlignment, extensions, DiagnosticCollection, Location, Position } from 'vscode';
import { LanguageClient, LanguageClientOptions, ServerOptions, TransportKind, ErrorAction, CloseAction } from 'vscode-languageclient/node';

import * as path from 'path';
import * as fs from 'fs';

import { ClarionExtensionCommands } from './ClarionExtensionCommands';
import { ClarionHoverProvider } from './providers/hoverProvider';
import { ClarionDocumentLinkProvider } from './providers/documentLinkProvier';
import { ClarionImplementationProvider } from './providers/implementationProvider';
import { ClarionDefinitionProvider } from './providers/definitionProvider';
import { DocumentManager } from './documentManager';
import { ClarionDecorator } from './ClarionDecorator';

import { SolutionTreeDataProvider } from './SolutionTreeDataProvider';
import { StructureViewProvider } from './StructureViewProvider';
import { StatusViewProvider } from './StatusViewProvider';
import { TreeNode } from './TreeNode';
import { globalClarionPropertiesFile, globalClarionVersion, globalSettings, globalSolutionFile, setGlobalClarionSelection, ClarionSolutionSettings, getClarionConfigTarget } from './globals';
import * as buildTasks from './buildTasks';
import * as clarionClHelper from './clarionClHelper';
import LoggerManager from './logger';
import { SolutionCache } from './SolutionCache';
import { LanguageClientManager, isClientReady, getClientReadyPromise, setLanguageClient } from './LanguageClientManager';
import { redirectionService } from './paths/RedirectionService';

import { ClarionProjectInfo } from 'common/types';
import { initializeTelemetry, trackEvent, trackPerformance } from './telemetry';
import { SmartSolutionOpener } from './utils/SmartSolutionOpener';
import { GlobalSolutionHistory } from './utils/GlobalSolutionHistory';
import { escapeRegExp, getAllOpenDocuments, extractConfigurationsFromSolution } from './utils/ExtensionHelpers';
import { updateConfigurationStatusBar, updateBuildProjectStatusBar, hideConfigurationStatusBar, hideBuildProjectStatusBar } from './statusbar/StatusBarManager';
import { registerNavigationCommands } from './commands/NavigationCommands';
import { registerBuildCommands } from './commands/BuildCommands';
import { registerSolutionManagementCommands, registerSolutionOpeningCommands, registerMiscSolutionCommands } from './commands/SolutionCommands';
import { registerSolutionViewCommands, registerStructureViewCommands } from './commands/ViewCommands';
import { registerProjectFileCommands } from './commands/ProjectFileCommands';
import { createSolutionTreeView, createStructureView, createStatusView } from './views/ViewManager';
import { registerLanguageFeatures, disposeLanguageFeatures } from './providers/LanguageFeatureManager';
import { createSolutionFileWatchers, handleSettingsChange } from './providers/FileWatcherManager';
import * as SolutionOpener from './solution/SolutionOpener';

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
            setConfiguration,
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
            await refreshOpenDocuments();

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
    
    // Always create the structure view (shows document outline, works without workspace)
    const structureViewResult = await createStructureView(context, structureView, structureViewProvider);
    structureView = structureViewResult.structureView;
    structureViewProvider = structureViewResult.provider;
    
    // Always create the status view (shows extension status and diagnostics)
    const statusViewResult = await createStatusView(context);
    statusView = statusViewResult.statusView;
    statusViewProvider = statusViewResult.provider;

    context.subscriptions.push(...disposables);

    // Register the commands programmatically to avoid conflicts with other extensions
    context.subscriptions.push(
        ...registerProjectFileCommands(solutionTreeDataProvider),
        ...registerSolutionOpeningCommands(context, initializeSolution, solutionTreeDataProvider, statusViewProvider)
    );



    context.subscriptions.push(
        ...registerNavigationCommands(treeView, solutionTreeDataProvider),
        ...registerBuildCommands(diagnosticCollection, buildSolutionOrProject, solutionTreeDataProvider),
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

async function workspaceHasBeenTrusted(context: ExtensionContext, disposables: Disposable[]): Promise<void> {
    logger.info("✅ Workspace has been trusted or refreshed. Initializing...");

    // Read solution file directly from workspace settings first
    const solutionFileFromSettings = workspace.getConfiguration().get<string>("clarion.solutionFile", "");
    logger.info(`🔍 Solution file from workspace settings: ${solutionFileFromSettings || 'not set'}`);

    // Load settings from workspace.json
    await globalSettings.initialize();
    await globalSettings.initializeFromWorkspace();
    
    // Set environment variable for the server to use if we have a solution file
    if (solutionFileFromSettings && fs.existsSync(solutionFileFromSettings)) {
        process.env.CLARION_SOLUTION_FILE = solutionFileFromSettings;
        logger.info(`✅ Set CLARION_SOLUTION_FILE environment variable from workspace settings: ${solutionFileFromSettings}`);
    }

    // Log the current state of global variables
    logger.info(`🔍 Global settings state after initialization:
        - globalSolutionFile: ${globalSolutionFile || 'not set'}
        - globalClarionPropertiesFile: ${globalClarionPropertiesFile || 'not set'}
        - globalClarionVersion: ${globalClarionVersion || 'not set'}
        - configuration: ${globalSettings.configuration || 'not set'}
        - redirectionFile: ${globalSettings.redirectionFile || 'not set'}
        - redirectionPath: ${globalSettings.redirectionPath || 'not set'}`);

    // Dispose of old subscriptions
    disposables.forEach(disposable => disposable.dispose());
    disposables.length = 0;

    // ✅ Only initialize if a solution exists in settings
    if (globalSolutionFile) {
        logger.info("✅ Solution file found. Proceeding with initialization...");
        
        // If properties file or version is missing, try to set defaults
        if (!globalClarionPropertiesFile || !globalClarionVersion) {
            logger.warn("⚠️ Missing Clarion properties file or version. Attempting to use defaults...");
            
            // Try to find a default properties file if not set
            if (!globalClarionPropertiesFile) {
                const defaultPropertiesPath = path.join(process.env.APPDATA || '', 'SoftVelocity', 'Clarion', 'ClarionProperties.xml');
                if (fs.existsSync(defaultPropertiesPath)) {
                    logger.info(`✅ Using default properties file: ${defaultPropertiesPath}`);
                    const target = getClarionConfigTarget();
                    if (target && workspace.workspaceFolders) {
                        const config = workspace.getConfiguration("clarion", workspace.workspaceFolders[0].uri);
                        await config.update('propertiesFile', defaultPropertiesPath, target);
                    }
                    
                    // Use the setGlobalClarionSelection function to update the global variables
                    await setGlobalClarionSelection(
                        globalSolutionFile,
                        defaultPropertiesPath,
                        globalClarionVersion || "Clarion11",
                        globalSettings.configuration
                    );
                }
            }
            
            // Set a default version if not set
            if (!globalClarionVersion) {
                const defaultVersion = "Clarion11";
                logger.info(`✅ Using default Clarion version: ${defaultVersion}`);
                const target = getClarionConfigTarget();
                if (target && workspace.workspaceFolders) {
                    const config = workspace.getConfiguration("clarion", workspace.workspaceFolders[0].uri);
                    await config.update('version', defaultVersion, target);
                }
                
                // Use the setGlobalClarionSelection function to update the global variables
                await setGlobalClarionSelection(
                    globalSolutionFile,
                    globalClarionPropertiesFile,
                    defaultVersion,
                    globalSettings.configuration
                );
            }
        }
        
        // Try to initialize even if some settings are missing
        try {
            logger.info("✅ Attempting to initialize Clarion Solution...");
            await initializeSolution(context);
            
            // ✅ Register language features NOW
            registerLanguageFeatures(context, documentManager);
        } catch (error) {
            logger.error(`❌ Error initializing solution: ${error instanceof Error ? error.message : String(error)}`);
            vscodeWindow.showErrorMessage(`Error initializing Clarion solution. Try using the "Reinitialize Solution" command.`);
        }
    } else {
        logger.warn("⚠️ No solution file found in settings.");
        // Don't show the information message as the solution view will now show an "Open Solution" button
        
        // Make sure the solution tree view is created
        await createSolutionTreeView();
    }
}

async function initializeSolution(context: ExtensionContext, refreshDocs: boolean = false): Promise<void> {
    logger.info("🔄 Initializing Clarion Solution...");
    
    logger.info(`🔍 BEFORE CHECK - Global variables state:
        - globalSolutionFile: ${globalSolutionFile || 'NOT SET'}
        - globalClarionPropertiesFile: ${globalClarionPropertiesFile || 'NOT SET'}
        - globalClarionVersion: ${globalClarionVersion || 'NOT SET'}`);

    if (!globalSolutionFile || !globalClarionPropertiesFile || !globalClarionVersion) {
        logger.warn("⚠️ Missing required settings (solution file, properties file, or version). Initialization aborted.");
        logger.warn(`    - globalSolutionFile: ${globalSolutionFile || 'MISSING'}`);
        logger.warn(`    - globalClarionPropertiesFile: ${globalClarionPropertiesFile || 'MISSING'}`);
        logger.warn(`    - globalClarionVersion: ${globalClarionVersion || 'MISSING'}`);
        return;
    }

    // ✅ Get configurations from the solution file
    const solutionFileContent = fs.readFileSync(globalSolutionFile, 'utf-8');
    const availableConfigs = extractConfigurationsFromSolution(solutionFileContent);

    // ✅ Step 2: Validate the stored configuration
    if (!availableConfigs.includes(globalSettings.configuration)) {
        logger.warn(`⚠️ Invalid configuration detected: ${globalSettings.configuration}. Asking user to select a valid one.`);

        // ✅ Step 3: Prompt user to select a valid configuration
        const selectedConfig = await vscodeWindow.showQuickPick(availableConfigs, {
            placeHolder: "Invalid configuration detected. Select a valid configuration:",
        });

        if (!selectedConfig) {
            vscodeWindow.showWarningMessage("No valid configuration selected. Using 'Debug' as a fallback.");
            globalSettings.configuration = "Debug"; // ⬅️ Safe fallback
        } else {
            globalSettings.configuration = selectedConfig;
        }

        // ✅ Save the new selection
        const target = getClarionConfigTarget();
        if (target && workspace.workspaceFolders) {
            const config = workspace.getConfiguration("clarion", workspace.workspaceFolders[0].uri);
            await config.update("configuration", globalSettings.configuration, target);
            logger.info(`✅ Updated configuration: ${globalSettings.configuration}`);
        }
    }
    // ✅ Wait for the language client to be ready before proceeding
    if (client) {
        if (!isClientReady()) {
            logger.info("⏳ Waiting for language client to be ready...");
            try {
                await getClientReadyPromise();
                logger.info("✅ Language client is now ready.");
            } catch (error) {
                logger.error(`❌ Error waiting for language client: ${error instanceof Error ? error.message : String(error)}`);
                vscodeWindow.showErrorMessage("Error initializing Clarion solution: Language client failed to start.");
                return;
            }
        }
    updateBuildProjectStatusBar(); // Update the build project status bar

        // Get the solution directory
        const solutionDir = path.dirname(globalSolutionFile);

        // Send notification to initialize the server-side solution manager
        client.sendNotification('clarion/updatePaths', {
            redirectionPaths: [globalSettings.redirectionPath],
            projectPaths: [solutionDir],
            solutionFilePath: globalSolutionFile, // Send the full solution file path
            configuration: globalSettings.configuration,
            clarionVersion: globalClarionVersion,
            redirectionFile: globalSettings.redirectionFile,
            macros: globalSettings.macros,
            libsrcPaths: globalSettings.libsrcPaths,
            defaultLookupExtensions: globalSettings.defaultLookupExtensions // Add default lookup extensions
        });
        logger.info("✅ Clarion paths/config/version sent to the language server.");
        
        // Wait a moment for the server to process the notification and initialize
        // This prevents a race condition where we request the solution tree before it's built
        logger.info("⏳ Waiting for server to initialize solution...");
        await new Promise(resolve => setTimeout(resolve, 1000));
        logger.info("✅ Server initialization delay complete");
    } else {
        logger.error("❌ Language client is not available.");
        vscodeWindow.showErrorMessage("Error initializing Clarion solution: Language client is not available.");
        return;
    }
    const startTime = performance.now();
    logger.info("🔄 Initializing solution environment...");
    
    // ✅ Continue initializing the solution cache and document manager
    documentManager = await reinitializeEnvironment(refreshDocs);
    logger.info("✅ Environment initialized");
    
    await createSolutionTreeView(context);
    logger.info("✅ Solution tree view created");
    
    registerLanguageFeatures(context, documentManager);
    logger.info("✅ Language features registered");
    
    await commands.executeCommand("setContext", "clarion.solutionOpen", true);
    statusViewProvider?.refresh(); // Refresh status view when solution opens
    updateConfigurationStatusBar(globalSettings.configuration);
    updateBuildProjectStatusBar(); // Update the build project status bar
    
    // Create file watchers for the solution, project, and redirection files
    await createSolutionFileWatchers(context, reinitializeEnvironment, documentManager);
    logger.info("✅ File watchers created");
    
    // Force refresh all open documents to ensure links are generated
    await refreshOpenDocuments();
    logger.info("✅ Open documents refreshed");
    
    const endTime = performance.now();
    logger.info(`✅ Solution initialization completed in ${(endTime - startTime).toFixed(2)}ms`);
    trackPerformance('SolutionInitialization', endTime - startTime);
    
    vscodeWindow.showInformationMessage(`Clarion Solution Loaded: ${path.basename(globalSolutionFile)}`);
}

async function reinitializeEnvironment(refreshDocs: boolean = false): Promise<DocumentManager> {
    const startTime = performance.now();
    logger.info("🔄 Initializing SolutionCache and DocumentManager...");

    // Get the SolutionCache singleton
    const solutionCache = SolutionCache.getInstance();

    // Set the language client in the solution cache
    if (client) {
        solutionCache.setLanguageClient(client);
    } else {
        logger.error("❌ Language client not available. Cannot initialize SolutionCache properly.");
    }

    // Initialize the solution cache with the solution file path
    if (globalSolutionFile) {
        const cacheStartTime = performance.now();
        const result = await solutionCache.initialize(globalSolutionFile);
        const cacheEndTime = performance.now();
        logger.info(`✅ SolutionCache initialized in ${(cacheEndTime - cacheStartTime).toFixed(2)}ms (${result ? 'success' : 'failed'})`);
        trackPerformance('SolutionCacheInit', cacheEndTime - cacheStartTime, { success: result ? 'true' : 'false' });        
        // If initialization failed or returned empty solution, force a refresh from server
        if (!result) {
            logger.warn("⚠️ Solution cache initialization failed. Forcing refresh from server...");
            const refreshStartTime = performance.now();
            const refreshResult = await solutionCache.refresh(true);
            const refreshEndTime = performance.now();
            logger.info(`✅ SolutionCache force refreshed in ${(refreshEndTime - refreshStartTime).toFixed(2)}ms (${refreshResult ? 'success' : 'failed'})`);
            trackPerformance('SolutionCacheRefresh', refreshEndTime - refreshStartTime, { success: refreshResult ? 'true' : 'false', forced: 'true' });            
            if (!refreshResult) {
                logger.error("❌ Failed to refresh solution cache from server. Solution features may not work correctly.");
            }
        }
    } else {
        logger.warn("⚠️ No solution file path available. SolutionCache will not be initialized.");
    }
    
    // Mark activation as complete in SolutionCache
    solutionCache.markActivationComplete();
    logger.info("✅ Marked activation as complete in SolutionCache");

    if (documentManager) {
        logger.info("🔄 Disposing of existing DocumentManager instance...");
        documentManager.dispose();
        documentManager = undefined;
    }

    // Create a new DocumentManager (no longer needs SolutionParser)
    const dmStartTime = performance.now();
    documentManager = await DocumentManager.create();
    const dmEndTime = performance.now();
    logger.info(`✅ DocumentManager created in ${(dmEndTime - dmStartTime).toFixed(2)}ms`);
    trackPerformance('DocumentManagerCreation', dmEndTime - dmStartTime);

    if (refreshDocs) {
        logger.info("🔄 Refreshing open documents...");
        await refreshOpenDocuments();
    }

    const endTime = performance.now();
    logger.info(`✅ Environment reinitialized in ${(endTime - startTime).toFixed(2)}ms`);
    trackPerformance('EnvironmentReinitialization', endTime - startTime, { refreshDocs: refreshDocs ? 'true' : 'false' });
    return documentManager;
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

async function refreshOpenDocuments() {
    const startTime = performance.now();
    logger.info("🔄 Refreshing all open documents...");

    try {
        const defaultLookupExtensions = globalSettings.defaultLookupExtensions;
        logger.info(`🔍 Loaded defaultLookupExtensions: ${JSON.stringify(defaultLookupExtensions)}`);

        // ✅ Fetch ALL open documents using the updated method
        const docsStartTime = performance.now();
        const openDocuments = await getAllOpenDocuments(); // <-- Await the function here
        const docsEndTime = performance.now();
        logger.info(`✅ Retrieved ${openDocuments.length} open documents in ${(docsEndTime - docsStartTime).toFixed(2)}ms`);

        if (openDocuments.length === 0) {
            logger.warn("⚠️ No open documents found.");
            return;
        }

        // Process documents in parallel for better performance
        const updatePromises = openDocuments.map(async (document) => {
            try {
                const docStartTime = performance.now();
                // ✅ Ensure the document manager updates the links
                if (documentManager) {
                    await documentManager.updateDocumentInfo(document);
                }
                const docEndTime = performance.now();
                logger.debug(`✅ Updated document ${document.uri.fsPath} in ${(docEndTime - docStartTime).toFixed(2)}ms`);
            } catch (docError) {
                logger.error(`❌ Error updating document ${document.uri.fsPath}: ${docError instanceof Error ? docError.message : String(docError)}`);
            }
        });

        // Wait for all document updates to complete
        await Promise.all(updatePromises);

        const endTime = performance.now();
        logger.info(`✅ Successfully refreshed ${openDocuments.length} open documents in ${(endTime - startTime).toFixed(2)}ms`);
    } catch (error) {
        logger.error(`❌ Error in refreshOpenDocuments: ${error instanceof Error ? error.message : String(error)}`);
    }
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





export async function showClarionQuickOpen(): Promise<void> {
    if (!workspace.workspaceFolders) {
        vscodeWindow.showWarningMessage("No workspace is open.");
        return;
    }

    const solutionCache = SolutionCache.getInstance();
    const solutionInfo = solutionCache.getSolutionInfo();

    if (!solutionInfo) {
        // Refresh the solution tree view to show the "Open Solution" button
        await createSolutionTreeView();
        vscodeWindow.showInformationMessage("No solution is currently open. Use the 'Open Solution' button in the Solution View.");
        return;
    }

    // Collect all source files from all projects
    const allFiles: { label: string; description: string; path: string }[] = [];
    const seenFiles = new Set<string>();
    const seenBaseNames = new Set<string>(); // Track base filenames to avoid duplicates

    // ✅ Use allowed file extensions from global settings
    const defaultSourceExtensions = [".clw", ".inc", ".equ", ".eq", ".int"];
    const allowedExtensions = [
        ...defaultSourceExtensions,
        ...globalSettings.fileSearchExtensions.map(ext => ext.toLowerCase())
    ];

    logger.info(`🔍 Searching for files with extensions: ${JSON.stringify(allowedExtensions)}`);

    // First add all source files from projects
    for (const project of solutionInfo.projects) {
        for (const sourceFile of project.sourceFiles) {
            const fullPath = path.join(project.path, sourceFile.relativePath || "");
            const baseName = sourceFile.name.toLowerCase();

            if (!seenFiles.has(fullPath)) {
                seenFiles.add(fullPath);
                seenBaseNames.add(baseName); // Track the base filename
                allFiles.push({
                    label: getIconForFile(sourceFile.name) + " " + sourceFile.name,
                    description: project.name,
                    path: fullPath
                });
            }
        }
    }

    // Get search paths from the server for each project and extension
    const searchPaths: string[] = [];

    try {
        logger.info("🔍 Requesting search paths from server...");

        // Request search paths for each project and extension
        for (const project of solutionInfo.projects) {
            for (const ext of allowedExtensions) {
                const paths = await solutionCache.getSearchPathsFromServer(project.name, ext);
                if (paths.length > 0) {
                    logger.info(`✅ Received ${paths.length} search paths for ${project.name} and ${ext}`);
                    searchPaths.push(...paths);
                }
            }
        }
    } catch (error) {
        logger.error(`❌ Error requesting search paths: ${error instanceof Error ? error.message : String(error)}`);
    }

    // Remove duplicates from search paths
    const uniqueSearchPaths = [...new Set(searchPaths)];
    logger.info(`📂 Using search paths: ${JSON.stringify(uniqueSearchPaths)}`);

    // Add files from the solution directory
    const solutionDir = path.dirname(solutionInfo.path);
    const additionalFiles = listFilesRecursively(solutionDir)
        .filter(file => {
            const ext = path.extname(file).toLowerCase();
            return allowedExtensions.includes(ext);
        })
        .map(file => {
            const relativePath = path.relative(solutionDir, file);
            const filePath = file;

            const baseName = path.basename(file).toLowerCase();
            if (!seenFiles.has(filePath) && !seenBaseNames.has(baseName)) {
                seenFiles.add(filePath);
                seenBaseNames.add(baseName); // Add to seenBaseNames set
                return {
                    label: getIconForFile(file) + " " + path.basename(file),
                    description: relativePath,
                    path: filePath
                };
            }
            return null;
        })
        .filter(item => item !== null) as { label: string; description: string; path: string }[];

    // Add files from redirection paths
    const redirectionFiles: { label: string; description: string; path: string }[] = [];

    for (const searchPath of uniqueSearchPaths) {
        try {
            if (workspace.rootPath && searchPath.startsWith(workspace.rootPath)) {
                // If the path is inside the workspace, use VS Code's findFiles
                const files = await workspace.findFiles(`${searchPath}/**/*.*`);

                for (const file of files) {
                    const filePath = file.fsPath;
                    const ext = path.extname(filePath).toLowerCase();

                    const baseName = path.basename(filePath).toLowerCase();
                    if (allowedExtensions.includes(ext) && !seenFiles.has(filePath) && !seenBaseNames.has(baseName)) {
                        seenFiles.add(filePath);
                        redirectionFiles.push({
                            label: getIconForFile(filePath) + " " + path.basename(filePath),
                            description: `Redirection: ${path.relative(searchPath, path.dirname(filePath))}`,
                            path: filePath
                        });
                    }
                }
            } else {
                // If the path is outside the workspace, use recursive file listing
                logger.info(`📌 Searching manually outside workspace: ${searchPath}`);
                const externalFiles = listFilesRecursively(searchPath);

                for (const filePath of externalFiles) {
                    const ext = path.extname(filePath).toLowerCase();

                    const baseName = path.basename(filePath).toLowerCase();
                    if (allowedExtensions.includes(ext) && !seenFiles.has(filePath) && !seenBaseNames.has(baseName)) {
                        seenFiles.add(filePath);
                        redirectionFiles.push({
                            label: getIconForFile(filePath) + " " + path.basename(filePath),
                            description: `Redirection: ${path.relative(searchPath, path.dirname(filePath))}`,
                            path: filePath
                        });
                    }
                }
            }
        } catch (error) {
            logger.warn(`⚠️ Error accessing search path: ${searchPath} - ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    // Combine and sort all files
    const combinedFiles = [...allFiles, ...additionalFiles, ...redirectionFiles]
        .sort((a, b) => a.label.localeCompare(b.label));

    // Show quick pick
    const selectedFile = await vscodeWindow.showQuickPick(combinedFiles, {
        placeHolder: "Select a Clarion file to open",
    });

    if (selectedFile) {
        try {
            const doc = await workspace.openTextDocument(selectedFile.path);
            await vscodeWindow.showTextDocument(doc);
        } catch (error) {
            vscodeWindow.showErrorMessage(`Failed to open file: ${selectedFile.path}`);
        }
    }

    function listFilesRecursively(dir: string): string[] {
        const files: string[] = [];

        try {
            const entries = fs.readdirSync(dir, { withFileTypes: true });

            for (const entry of entries) {
                const fullPath = path.join(dir, entry.name);

                if (entry.isDirectory()) {
                    // Skip certain directories
                    if (!['node_modules', '.git', 'bin', 'obj'].includes(entry.name)) {
                        files.push(...listFilesRecursively(fullPath));
                    }
                } else {
                    files.push(fullPath);
                }
            }
        } catch (error) {
            logger.error(`Error reading directory ${dir}:`, error);
        }

        return files;
    }

    function getIconForFile(fileExt: string): string {
        const ext = path.extname(fileExt).toLowerCase();

        switch (ext) {
            case '.clw': return '$(file-code)';
            case '.inc': return '$(file-submodule)';
            case '.equ':
            case '.eq': return '$(symbol-constant)';
            case '.int': return '$(symbol-interface)';
            default: return '$(file)';
        }
    }
}

async function setConfiguration() {
    if (!globalSolutionFile) {
        // Refresh the solution tree view to show the "Open Solution" button
        await createSolutionTreeView();
        vscodeWindow.showInformationMessage("No solution is currently open. Use the 'Open Solution' button in the Solution View.");
        return;
    }

    const solutionCache = SolutionCache.getInstance();
    
    // Check if the solution file path is set in the SolutionCache
    const currentSolutionPath = solutionCache.getSolutionFilePath();
    if (!currentSolutionPath && globalSolutionFile) {
        // Initialize the SolutionCache with the global solution file
        await solutionCache.initialize(globalSolutionFile);
    }
    
    const availableConfigs = solutionCache.getAvailableConfigurations();

    if (availableConfigs.length === 0) {
        vscodeWindow.showWarningMessage("No configurations found in the solution file.");
        return;
    }

    const selectedConfig = await vscodeWindow.showQuickPick(availableConfigs, {
        placeHolder: "Select a configuration",
    });

    if (selectedConfig) {
        globalSettings.configuration = selectedConfig;
        const target = getClarionConfigTarget();
        if (target && workspace.workspaceFolders) {
            const config = workspace.getConfiguration("clarion", workspace.workspaceFolders[0].uri);
            await config.update("configuration", selectedConfig, target);
        }
        updateConfigurationStatusBar(selectedConfig);
        vscodeWindow.showInformationMessage(`Configuration set to: ${selectedConfig}`);
    }
}

export function deactivate(): Thenable<void> | undefined {
    if (!client) {
        return undefined;
    }
    return client.stop();
}

// Error handling for build output
async function startClientServer(context: ExtensionContext, hasOpenXmlFiles: boolean = false): Promise<void> {
    try {
        logger.info("🔍 [DEBUG] Starting Clarion Language Server...");
        
        // Log XML extension status
        try {
            const xmlExtension = extensions.getExtension('redhat.vscode-xml');
            logger.info(`🔍 [DEBUG] XML extension status: ${xmlExtension ? (xmlExtension.isActive ? 'active' : 'inactive') : 'not installed'}`);
        } catch (xmlError) {
            logger.error(`🔍 [DEBUG] Error checking XML extension: ${xmlError instanceof Error ? xmlError.message : String(xmlError)}`);
        }
        
        // Log open documents
        try {
            const openDocs = workspace.textDocuments;
            logger.info(`🔍 [DEBUG] Open documents (${openDocs.length}): ${openDocs.map(d => d.fileName).join(', ')}`);
            
            // Check for XML files and log details
            for (const doc of openDocs) {
                if (doc.fileName.toLowerCase().endsWith('.xml') || doc.fileName.toLowerCase().endsWith('.cwproj')) {
                    logger.info(`🔍 [DEBUG] XML file details: ${doc.fileName}, language: ${doc.languageId}, version: ${doc.version}`);
                }
            }
        } catch (docsError) {
            logger.error(`🔍 [DEBUG] Error checking open documents: ${docsError instanceof Error ? docsError.message : String(docsError)}`);
        }
        
        // Skip the delay if there are XML files open
        if (hasOpenXmlFiles) {
            logger.info(`🔍 [DEBUG] XML files are open, skipping delay and proceeding with initialization...`);
        } else {
            // Minimal delay to allow other extensions to initialize first
            const delayTime = 100; // Reduced to minimal delay
            logger.info(`🔍 [DEBUG] Minimal wait for other extensions (${delayTime}ms delay)...`);
            
            // Simple timeout instead of polling
            await new Promise(resolve => setTimeout(resolve, delayTime));
            
            logger.info("🔍 [DEBUG] Delay completed. Continuing with Clarion Language Server initialization...");
        }
    } catch (startupError) {
        logger.error(`🔍 [DEBUG] Error during startup delay: ${startupError instanceof Error ? startupError.message : String(startupError)}`);
    }
    let serverModule = context.asAbsolutePath(path.join('out', 'server', 'src', 'server.js'));
    let debugOptions = { execArgv: ['--nolazy', '--inspect=6009'] };

    let serverOptions: ServerOptions = {
        run: { module: serverModule, transport: TransportKind.ipc },
        debug: { module: serverModule, transport: TransportKind.ipc, options: debugOptions }
    };

    // Get the default lookup extensions from settings
    const lookupExtensions = globalSettings.defaultLookupExtensions || [".clw", ".inc", ".equ", ".eq", ".int"];

    // Create document selectors for all Clarion file extensions
    const documentSelectors = [
        { scheme: 'file', language: 'clarion' },
        ...lookupExtensions.map(ext => ({ scheme: 'file', pattern: `**/*${ext}` }))
    ];

    // Create file watcher pattern for all extensions
    const fileWatcherPattern = `**/*.{${lookupExtensions.map(ext => ext.replace('.', '')).join(',')}}`;

    // Create file watcher pattern for redirection, solution, and project files
    const projectFileWatcherPattern = "**/*.{red,sln,cwproj}";

    let clientOptions: LanguageClientOptions = {
        documentSelector: documentSelectors,
        initializationOptions: {
            settings: workspace.getConfiguration('clarion'),
            lookupExtensions: lookupExtensions
        },
        synchronize: {
            fileEvents: [
                workspace.createFileSystemWatcher(fileWatcherPattern),
                workspace.createFileSystemWatcher(projectFileWatcherPattern)
            ],
        },
        middleware: {
            provideDefinition: async (document, position, token, next) => {
                logger.info(`🔥 CLIENT MIDDLEWARE: Definition request for ${document.uri.toString()} at ${position.line}:${position.character}`);
                
                // First check if we're on a PROCEDURE implementation - if so, find MAP declaration
                // This handles reverse navigation: implementation → declaration
                if (documentManager) {
                    const line = document.lineAt(position.line);
                    const lineText = line.text;
                    
                    // Match: ProcName PROCEDURE(...) or Class.MethodName PROCEDURE(...)
                    const procMatch = lineText.match(/^\s*([A-Za-z_][A-Za-z0-9_\.]*)\s+PROCEDURE/i);
                    if (procMatch) {
                        const fullName = procMatch[1];
                        const simpleName = fullName.includes('.') ? fullName.split('.').pop()! : fullName;
                        
                        logger.info(`Detected PROCEDURE implementation: ${fullName} (simple: ${simpleName})`);
                        
                        // Search for MAP declaration
                        const content = document.getText();
                        const lines = content.split('\n');
                        
                        for (let i = 0; i < lines.length; i++) {
                            const mapLine = lines[i].trim().toUpperCase();
                            
                            if (mapLine === 'MAP') {
                                logger.info(`Found MAP block at line ${i}`);
                                logger.info(`End of MAP block searching for: ${simpleName}`);
                                
                                for (let j = i + 1; j < lines.length; j++) {
                                    const declLine = lines[j].trim();
                                    logger.info(`Checking MAP declaration: ${declLine} against ${simpleName}`);
                                    
                                    if (declLine.toUpperCase().startsWith('END')) {
                                        break;
                                    }
                                    
                                    // Match procedure name at start of line, possibly followed by whitespace and PROCEDURE keyword
                                    const declMatch = declLine.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s+(PROCEDURE|FUNCTION|CLASS)/i);
                                    if (declMatch && declMatch[1].toUpperCase() === simpleName.toUpperCase()) {
                                        logger.info(`Found MAP declaration for ${simpleName} at line ${j} - returning location`);
                                        return [new Location(document.uri, new Position(j, 0))];
                                    }
                                }
                                break;
                            }
                        }
                    }
                }
                
                // Not a PROCEDURE implementation, let server handle it
                return next(document, position, token);
            }
        },
        // Add error handling options
        errorHandler: {
            error: (error, message, count) => {
                logger.error(`Language server error: ${error.message || error}`);
                return ErrorAction.Continue;
            },
            closed: () => {
                logger.warn("Language server connection closed");
                // Always try to restart the server
                return CloseAction.Restart;
            }
        }
    };

    logger.info(`📄 Configured Language Client for extensions: ${lookupExtensions.join(', ')}`);

    client = new LanguageClient("ClarionLanguageServer", "Clarion Language Server", serverOptions, clientOptions);
    
    // Start the language client
    const disposable = client.start();
    context.subscriptions.push(disposable);

    // Set the client in the LanguageClientManager
    setLanguageClient(client);

    try {
        // Wait for the language client to become ready
        await getClientReadyPromise();
        logger.info("✅ Language client started and is ready");
        
        // Log server capabilities
        const capabilities = client.initializeResult?.capabilities;
        logger.info(`📋 Server capabilities: ${JSON.stringify(capabilities, null, 2)}`);
        logger.info(`📋 Full initializeResult: ${JSON.stringify(client.initializeResult, null, 2)}`);
        if (capabilities?.definitionProvider) {
            logger.info("✅ Server reports definitionProvider capability is enabled");
        } else {
            logger.error("❌ Server does NOT report definitionProvider capability!");
            logger.error(`❌ Capabilities object: ${JSON.stringify(capabilities)}`);
        }
        
        // 🔄 Listen for symbol refresh notifications from server
        client.onNotification('clarion/symbolsRefreshed', (params: { uri: string }) => {
            logger.info(`🔄 Received symbolsRefreshed notification for: ${params.uri}`);
            if (structureViewProvider) {
                structureViewProvider.refresh();
            }
        });
    } catch (err) {
        logger.error("❌ Language client failed to start properly", err);
        vscodeWindow.showWarningMessage("Clarion Language Server had issues during startup. Some features may not work correctly.");
        client = undefined;
    }

}
async function buildSolutionOrProject(
    buildTarget: "Solution" | "Project",
    project: ClarionProjectInfo | undefined,
    diagnosticCollection: DiagnosticCollection   // 🔹 required
) {
    const buildConfig = {
        buildTarget,
        selectedProjectPath: project?.path ?? "",
        projectObject: project
    };

    if (!buildTasks.validateBuildEnvironment()) {
        return;
    }

    const solutionCache = SolutionCache.getInstance();
    const solutionInfo = solutionCache.getSolutionInfo();

    if (!solutionInfo) {
        await createSolutionTreeView();
        vscodeWindow.showInformationMessage(
            "No solution is currently open. Use the 'Open Solution' button in the Solution View."
        );
        return;
    }

    const buildParams = {
        ...buildTasks.prepareBuildParameters(buildConfig),
        diagnosticCollection
    };

    await buildTasks.executeBuildTask(buildParams);
}










