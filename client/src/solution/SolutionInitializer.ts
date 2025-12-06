import { workspace, window as vscodeWindow, ExtensionContext, Disposable, commands } from 'vscode';
import { LanguageClient } from 'vscode-languageclient/node';
import { globalSolutionFile, globalClarionPropertiesFile, globalClarionVersion, globalSettings, setGlobalClarionSelection, getClarionConfigTarget } from '../globals';
import { SolutionCache } from '../SolutionCache';
import { DocumentManager } from '../documentManager';
import { extractConfigurationsFromSolution } from '../utils/ExtensionHelpers';
import { updateConfigurationStatusBar, updateBuildProjectStatusBar } from '../statusbar/StatusBarManager';
import { refreshSolutionTreeView } from '../views/ViewManager';
import { registerLanguageFeatures } from '../providers/LanguageFeatureManager';
import { createSolutionFileWatchers } from '../providers/FileWatcherManager';
import { isClientReady, getClientReadyPromise } from '../LanguageClientManager';
import { trackPerformance } from '../telemetry';
import LoggerManager from '../logger';
import * as path from 'path';
import * as fs from 'fs';

const logger = LoggerManager.getLogger("SolutionInitializer");

/**
 * Handles workspace trust and initial solution setup
 * @param context - Extension context
 * @param disposables - Array of disposables to clean up
 * @param initializeSolution - Function to initialize the solution
 * @param documentManager - Document manager instance
 */
export async function workspaceHasBeenTrusted(
    context: ExtensionContext,
    disposables: Disposable[],
    initializeSolution: (context: ExtensionContext, refreshDocs?: boolean) => Promise<void>,
    documentManager: DocumentManager | undefined
): Promise<void> {
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
        await refreshSolutionTreeView();
    }
}

/**
 * Initializes a Clarion solution with all necessary components
 * @param context - Extension context
 * @param refreshDocs - Whether to refresh open documents
 * @param client - Language client instance
 * @param reinitializeEnvironment - Function to reinitialize environment
 * @param documentManager - Document manager instance
 * @param statusViewProvider - Status view provider
 * @param refreshOpenDocuments - Function to refresh open documents
 */
export async function initializeSolution(
    context: ExtensionContext,
    refreshDocs: boolean = false,
    client: LanguageClient | undefined,
    reinitializeEnvironment: (refreshDocs: boolean) => Promise<DocumentManager>,
    documentManager: DocumentManager | undefined,
    statusViewProvider: any,
    refreshOpenDocuments: () => Promise<void>
): Promise<void> {
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
    
    await refreshSolutionTreeView();
    logger.info("✅ Solution tree view refreshed");
    
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

/**
 * Reinitializes the solution environment (cache and document manager)
 * @param refreshDocs - Whether to refresh open documents
 * @param client - Language client instance
 * @param documentManager - Current document manager instance
 * @param refreshOpenDocuments - Function to refresh open documents
 * @returns New document manager instance
 */
export async function reinitializeEnvironment(
    refreshDocs: boolean = false,
    client: LanguageClient | undefined,
    documentManager: DocumentManager | undefined,
    refreshOpenDocuments: () => Promise<void>
): Promise<DocumentManager> {
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
