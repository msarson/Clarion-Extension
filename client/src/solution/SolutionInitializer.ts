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
import { refreshOpenDocuments } from '../document/DocumentRefreshManager';
import { GlobalSolutionHistory } from '../utils/GlobalSolutionHistory';
import { readIdePreferences } from './ClarionIdePreferences';
import LoggerManager from '../utils/LoggerManager';
import * as path from 'path';
import * as fs from 'fs';

const logger = LoggerManager.getLogger("SolutionInitializer");
logger.setLevel("error");

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

    // Read current solution directly from workspace settings
    const solutionFileFromSettings = workspace.getConfiguration().get<string>("clarion.currentSolution", "")
        || workspace.getConfiguration().get<string>("clarion.solutionFile", "");
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
        
        // If properties file or version is missing, check global history first
        // (they may have been stored during a cross-workspace switch)
        if (!globalClarionPropertiesFile || !globalClarionVersion) {
            logger.info("🔍 Settings incomplete — checking GlobalSolutionHistory for stored settings...");
            const history = await GlobalSolutionHistory.getReferences();
            const historyEntry = history.find(r =>
                r.solutionFile.toLowerCase() === globalSolutionFile.toLowerCase()
            );
            if (historyEntry?.propertiesFile && historyEntry?.version) {
                logger.info(`✅ Restoring settings from global history: propertiesFile=${historyEntry.propertiesFile}, version=${historyEntry.version}`);
                await setGlobalClarionSelection(
                    globalSolutionFile,
                    historyEntry.propertiesFile,
                    historyEntry.version,
                    historyEntry.configuration || globalSettings.configuration || 'Release'
                );
            }
        }

        // If still missing, try defaults as a last resort
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
                
                await setGlobalClarionSelection(
                    globalSolutionFile,
                    globalClarionPropertiesFile,
                    defaultVersion,
                    globalSettings.configuration
                );
            }
        }
        
        // Apply Clarion IDE preferences (configuration) before initializing so the right config is used
        let idePrefStartupGuid: string | undefined;
        if (globalSolutionFile && globalClarionPropertiesFile) {
            const idePrefs = await readIdePreferences(globalSolutionFile, globalClarionPropertiesFile);
            if (idePrefs) {
                // Apply active configuration so initializeSolution validates/uses the IDE's choice
                if (idePrefs.activeConfiguration && idePrefs.activePlatform) {
                    const ideConfig = `${idePrefs.activeConfiguration}|${idePrefs.activePlatform}`;
                    if (ideConfig !== globalSettings.configuration) {
                        logger.info(`🔄 Applying IDE configuration: ${ideConfig}`);
                        globalSettings.configuration = ideConfig;
                    }
                } else if (idePrefs.activeConfiguration) {
                    // Platform not specified — attempt prefix match against current config
                    if (!globalSettings.configuration?.startsWith(idePrefs.activeConfiguration + '|')) {
                        logger.info(`🔄 Applying IDE configuration (no platform): ${idePrefs.activeConfiguration}`);
                        globalSettings.configuration = idePrefs.activeConfiguration;
                    }
                }
                idePrefStartupGuid = idePrefs.startupProjectGuid;
            }
        }

        // Try to initialize even if some settings are missing
        try {
            logger.info("✅ Attempting to initialize Clarion Solution...");
            await initializeSolution(context);

            // Sync IDE startup project into workspace config after successful load
            if (idePrefStartupGuid) {
                const config = workspace.getConfiguration('clarion');
                const current = config.get<string>('startupProject', '');
                if (current.replace(/[{}]/g, '').toLowerCase() !== idePrefStartupGuid.replace(/[{}]/g, '').toLowerCase()) {
                    logger.info(`🔄 Applying IDE startup project: ${idePrefStartupGuid}`);
                    await config.update('startupProject', idePrefStartupGuid, false);
                }
            }
            
            // ✅ Register language features NOW
            registerLanguageFeatures(context, documentManager);

            // After initialization, check if redirection path was resolved.
            // If empty, settings are incomplete — prompt the user to configure.
            if (globalSolutionFile && !globalSettings.redirectionPath) {
                logger.warn("⚠️ Initialization completed but redirectionPath is empty — settings may be incomplete.");
                const action = await vscodeWindow.showWarningMessage(
                    `Clarion settings are incomplete for "${path.basename(globalSolutionFile)}". ` +
                    `ClarionProperties.xml or Clarion version may be missing or incorrect. ` +
                    `Build and language features may not work.`,
                    "Configure Now",
                    "Dismiss"
                );
                if (action === "Configure Now") {
                    await commands.executeCommand('clarion.openSolution');
                }
            }
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
 */
export async function initializeSolution(
    context: ExtensionContext,
    refreshDocs: boolean = false,
    client: LanguageClient | undefined,
    reinitializeEnvironment: (refreshDocs: boolean) => Promise<DocumentManager>,
    documentManager: DocumentManager | undefined
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
    let needsConfigUpdate = !availableConfigs.includes(globalSettings.configuration);
    
    // Try to auto-migrate old-style configuration (e.g., "Debug" -> "Debug|Win32")
    if (needsConfigUpdate && globalSettings.configuration) {
        const matchingConfig = availableConfigs.find(config => 
            config.startsWith(globalSettings.configuration + '|')
        );
        
        if (matchingConfig) {
            logger.info(`🔄 Auto-migrating configuration: ${globalSettings.configuration} -> ${matchingConfig}`);
            globalSettings.configuration = matchingConfig;
            needsConfigUpdate = false; // We found a match, update but don't prompt user
            
            // Save the migrated configuration
            await setGlobalClarionSelection(
                globalSolutionFile,
                globalClarionPropertiesFile,
                globalClarionVersion,
                globalSettings.configuration
            );
            updateConfigurationStatusBar(globalSettings.configuration);
            logger.info(`✅ Auto-migrated to configuration: ${globalSettings.configuration}`);
        }
    }
    
    // If still invalid after migration attempt, prompt user
    if (needsConfigUpdate) {
        logger.warn(`⚠️ Invalid configuration detected: ${globalSettings.configuration}. Asking user to select a valid one.`);

        // ✅ Step 3: Prompt user to select a valid configuration
        const selectedConfig = await vscodeWindow.showQuickPick(availableConfigs, {
            placeHolder: "Invalid configuration detected. Select a valid configuration:",
        });

        if (!selectedConfig) {
            vscodeWindow.showWarningMessage("No valid configuration selected. Using first available configuration as fallback.");
            globalSettings.configuration = availableConfigs[0] || "Debug|Win32"; // ⬅️ Safe fallback with platform
        } else {
            globalSettings.configuration = selectedConfig;
        }

        // ✅ Save the new selection using setGlobalClarionSelection to update solutions array
        await setGlobalClarionSelection(
            globalSolutionFile,
            globalClarionPropertiesFile,
            globalClarionVersion,
            globalSettings.configuration
        );
        
        // ✅ Update the status bar
        updateConfigurationStatusBar(globalSettings.configuration);
        logger.info(`✅ Updated configuration: ${globalSettings.configuration}`);
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

        // Register a one-shot handler for clarion/solutionReady BEFORE sending updatePaths
        // so we never miss the notification due to a race. The handler defers refreshOpenDocuments
        // until the server has real project data, avoiding thousands of clarion/findFile requests
        // flooding the LSP pipe when getSolutionTree returns 0 projects on startup.
        let solutionReadyDisposable: Disposable | null = null;
        solutionReadyDisposable = client.onNotification('clarion/solutionReady', async (params: { solutionFilePath: string, projectCount: number }) => {
            // Ignore stale notifications from a previous solution load
            if (params.solutionFilePath !== globalSolutionFile) {
                logger.warn(`⚠️ clarion/solutionReady ignored — path mismatch (got ${params.solutionFilePath}, expected ${globalSolutionFile})`);
                return;
            }
            if (params.projectCount === 0) {
                logger.warn(`⚠️ clarion/solutionReady received with 0 projects — skipping refresh`);
                return;
            }
            // Dispose immediately so subsequent re-initializations register a fresh handler
            solutionReadyDisposable?.dispose();
            solutionReadyDisposable = null;

            logger.error(`⏱️ [STARTUP] clarion/solutionReady received: ${params.projectCount} projects — refreshing solution tree and open documents`);
            const solutionCache = SolutionCache.getInstance();
            const refreshStart = Date.now();
            await solutionCache.refresh(true);
            logger.error(`⏱️ [STARTUP] solutionCache.refresh(true) in solutionReady handler done in ${Date.now() - refreshStart}ms (${solutionCache.getSolutionInfo()?.projects?.length ?? 0} projects)`);
            await refreshSolutionTreeView();
            const deferredRdStart = Date.now();
            solutionCache.beginActivationRefresh();
            await refreshOpenDocuments(documentManager);
            logger.error(`⏱️ [STARTUP] deferred refreshOpenDocuments complete in ${Date.now() - deferredRdStart}ms`);
            SolutionCache.getInstance().markActivationComplete();
            logger.error(`✅ [STARTUP] COMPLETE — extension ready for user interaction`);
        });

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
        logger.error(`⏱️ [STARTUP] clarion/updatePaths sent`);
        
        // Wait a moment for the server to process the notification and initialize
        // This prevents a race condition where we request the solution tree before it's built
        logger.info("⏳ Waiting for server to initialize solution...");
        await new Promise(resolve => setTimeout(resolve, 1000));
        logger.error(`⏱️ [STARTUP] 1s delay complete, calling reinitializeEnvironment`);
    } else {
        logger.error("❌ Language client is not available.");
        vscodeWindow.showErrorMessage("Error initializing Clarion solution: Language client is not available.");
        return;
    }
    const startTime = performance.now();
    logger.info("🔄 Initializing solution environment...");
    
    // ✅ Continue initializing the solution cache and document manager
    documentManager = await reinitializeEnvironment(refreshDocs);
    logger.error(`⏱️ [STARTUP] reinitializeEnvironment complete`);
    logger.info("✅ Environment initialized");
    
    await refreshSolutionTreeView();
    logger.error(`⏱️ [STARTUP] refreshSolutionTreeView complete`);
    logger.info("✅ Solution tree view refreshed");
    
    registerLanguageFeatures(context, documentManager);
    logger.info("✅ Language features registered");
    
    await commands.executeCommand("setContext", "clarion.solutionOpen", true);
    updateConfigurationStatusBar(globalSettings.configuration);
    updateBuildProjectStatusBar(); // Update the build project status bar
    
    // Create file watchers for the solution, project, and redirection files
    const fwStart = Date.now();
    await createSolutionFileWatchers(context, reinitializeEnvironment, documentManager);
    logger.error(`⏱️ [STARTUP] createSolutionFileWatchers complete in ${Date.now() - fwStart}ms`);
    logger.info("✅ File watchers created");
    
    // Only call refreshOpenDocuments immediately if we already have project data.
    // If the solution wasn't ready yet (0 projects), the clarion/solutionReady handler
    // registered above will call it once the server finishes building the solution.
    const solutionCache = SolutionCache.getInstance();
    if ((solutionCache.getSolutionInfo()?.projects?.length ?? 0) > 0) {
        const rdStart = Date.now();
        await refreshOpenDocuments(documentManager);
        logger.error(`⏱️ [STARTUP] refreshOpenDocuments complete in ${Date.now() - rdStart}ms`);
        solutionCache.markActivationComplete();
        logger.error(`✅ [STARTUP] COMPLETE — extension ready for user interaction`);
    } else {
        logger.error(`⏱️ [STARTUP] refreshOpenDocuments deferred — solution not ready yet (waiting for clarion/solutionReady)`);
    }
    
    const endTime = performance.now();
    logger.info(`✅ Solution initialization completed in ${(endTime - startTime).toFixed(2)}ms`);
    
    vscodeWindow.showInformationMessage(`Clarion Solution Loaded: ${path.basename(globalSolutionFile)}`);
}

/**
 * Reinitializes the solution environment (cache and document manager)
 * @param refreshDocs - Whether to refresh open documents
 * @param client - Language client instance
 * @param documentManager - Current document manager instance
 * @returns New document manager instance
 */
export async function reinitializeEnvironment(
    refreshDocs: boolean = false,
    client: LanguageClient | undefined,
    documentManager: DocumentManager | undefined
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
        logger.error(`⏱️ [STARTUP] solutionCache.initialize starting`);
        const result = await solutionCache.initialize(globalSolutionFile);
        const cacheEndTime = performance.now();
        logger.error(`⏱️ [STARTUP] solutionCache.initialize done in ${(cacheEndTime - cacheStartTime).toFixed(0)}ms (${result ? 'success' : 'failed'})`);
        logger.info(`✅ SolutionCache initialized in ${(cacheEndTime - cacheStartTime).toFixed(2)}ms (${result ? 'success' : 'failed'})`);
        
        // If initialization failed or returned empty solution, force a refresh from server
        if (!result) {
            logger.warn("⚠️ Solution cache initialization failed. Forcing refresh from server...");
            const refreshStartTime = performance.now();
            logger.error(`⏱️ [STARTUP] solutionCache.refresh (forced) starting`);
            const refreshResult = await solutionCache.refresh(true);
            const refreshEndTime = performance.now();
            logger.error(`⏱️ [STARTUP] solutionCache.refresh (forced) done in ${(refreshEndTime - refreshStartTime).toFixed(0)}ms`);
            logger.info(`✅ SolutionCache force refreshed in ${(refreshEndTime - refreshStartTime).toFixed(2)}ms (${refreshResult ? 'success' : 'failed'})`);
            
            if (!refreshResult) {
                logger.error("❌ Failed to refresh solution cache from server. Solution features may not work correctly.");
            }
        }
    } else {
        logger.warn("⚠️ No solution file path available. SolutionCache will not be initialized.");
    }
    
    // Mark activation as complete AFTER document refresh so that clarion/findFile
    // server calls are suppressed during refreshOpenDocuments (prevents 100+ queued
    // requests from blocking the LSP pipe for 5+ seconds after startup).
    // markActivationComplete() is called by the caller after refreshOpenDocuments returns.

    if (documentManager) {
        logger.info("🔄 Disposing of existing DocumentManager instance...");
        documentManager.dispose();
        documentManager = undefined;
    }

    // Create a new DocumentManager (no longer needs SolutionParser)
    const dmStartTime = performance.now();
    logger.error(`⏱️ [STARTUP] DocumentManager.create starting`);
    documentManager = await DocumentManager.create();
    const dmEndTime = performance.now();
    logger.error(`⏱️ [STARTUP] DocumentManager.create done in ${(dmEndTime - dmStartTime).toFixed(0)}ms`);
    logger.info(`✅ DocumentManager created in ${(dmEndTime - dmStartTime).toFixed(2)}ms`);

    if (refreshDocs) {
        logger.info("🔄 Refreshing open documents...");
        await refreshOpenDocuments(documentManager);
    }

    const endTime = performance.now();
    logger.info(`✅ Environment reinitialized in ${(endTime - startTime).toFixed(2)}ms`);
    
    return documentManager;
}
