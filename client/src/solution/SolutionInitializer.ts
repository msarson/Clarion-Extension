import { workspace, window as vscodeWindow, ExtensionContext, Disposable, commands } from 'vscode';
import { LanguageClient } from 'vscode-languageclient/node';
import { globalSolutionFile, globalClarionPropertiesFile, globalClarionVersion, globalSettings, setGlobalClarionSelection, getClarionConfigTarget } from '../globals';
import { SolutionCache } from '../SolutionCache';
import { extractConfigurationsFromSolution } from '../utils/ExtensionHelpers';
import {
    completeInitializationStatusBar,
    failInitializationStatusBar,
    updateConfigurationStatusBar,
    updateBuildProjectStatusBar,
    updateInitializationStatusBar
} from '../statusbar/StatusBarManager';
import { refreshSolutionTreeView, setToolbarGraphStatus } from '../views/ViewManager';
import { registerLanguageFeatures } from '../providers/LanguageFeatureManager';
import { createSolutionFileWatchers } from '../providers/FileWatcherManager';
import { isClientReady, getClientReadyPromise } from '../LanguageClientManager';
import { GlobalSolutionHistory } from '../utils/GlobalSolutionHistory';
import { readIdePreferences } from './ClarionIdePreferences';
import LoggerManager from '../utils/LoggerManager';
import { PathUtils } from '../PathUtils';
import * as path from 'path';
import * as fs from 'fs';

const logger = LoggerManager.getLogger("SolutionInitializer");
// #297 (revised): the ⏱️ [STARTUP] timeline follows the same opt-in as the perf
// channels — info only when clarion.log.performance.enabled, errors otherwise.
// (Was pinned to "info" for the #295 diagnosis campaign.)
logger.setLevel(
    workspace.getConfiguration('clarion').get<boolean>('log.performance.enabled', false)
        ? 'info' : 'error'
);

/**
 * Handles workspace trust and initial solution setup
 * @param context - Extension context
 * @param disposables - Array of disposables to clean up
 * @param initializeSolution - Function to initialize the solution
 */
export async function workspaceHasBeenTrusted(
    context: ExtensionContext,
    disposables: Disposable[],
    initializeSolution: (context: ExtensionContext, refreshDocs?: boolean) => Promise<void>
): Promise<void> {
    logger.info("✅ Workspace has been trusted or refreshed. Initializing...");

    // #146 sticky-until-open suppression is handled INSIDE
    // `initializeFromWorkspace` (line 62 below). When the flag is set, that
    // function returns early without populating `globalSolutionFile`, which
    // naturally routes the rest of this function into the `else` branch at
    // line ~209 (welcome-view refresh).
    //
    // Previously this function had an early-return defensive guard here
    // when `explicitlyClosed=true`. That short-circuit blocked legitimate
    // trust-init side effects (language feature registration, FRG build,
    // file watchers, etc.) which then didn't re-fire when the user later
    // explicitly opened a solution. Removed in favor of letting the
    // single-source-of-truth suppression in `initializeFromWorkspace`
    // handle the flag — the natural code flow already routes to the
    // welcome-view branch when `globalSolutionFile` stays empty.

    // Read current solution directly from workspace settings
    const solutionFileFromSettings = workspace.getConfiguration().get<string>("clarion.currentSolution", "")
        || workspace.getConfiguration().get<string>("clarion.solutionFile", "");
    logger.info(`🔍 Solution file from workspace settings: ${solutionFileFromSettings || 'not set'}`);

    // Load settings from workspace.json
    await globalSettings.initialize();
    await globalSettings.initializeFromWorkspace(context);
    
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

        // If still missing — pre-#132/#141 era used to hardcode legacy defaults
        // (`Clarion11` + `%APPDATA%\SoftVelocity\Clarion\ClarionProperties.xml`)
        // AND write them back to workspace settings.json. That was an
        // anti-pattern: it stomped good user state with bad legacy values when
        // upstream version-resolution had failed for unrelated reasons (e.g.
        // version-format mismatch between legacy `Clarion11` token and the
        // new `Clarion 11.1.13855` installation-entry-name format from #132).
        //
        // Post-#141, the authoritative default lives at the User-scope
        // `clarion.activeVersion` (L1) — workspace-scope writes here would
        // either duplicate or contradict that source. Better to surface the
        // missing-config diagnostic (warning fires at line ~174 below) than to
        // silently corrupt settings with stale-format values.
        //
        // If recovery from missing config is needed, the proper path is the
        // version picker (#134 two-stage) which writes the new-format value
        // to L1 default. The warning at line ~174 already offers that as the
        // "Configure Now" action.
        if (!globalClarionPropertiesFile || !globalClarionVersion) {
            logger.warn(
                `⚠️ Missing Clarion properties file or version after upstream load — ` +
                `globalClarionPropertiesFile="${globalClarionPropertiesFile || 'MISSING'}", ` +
                `globalClarionVersion="${globalClarionVersion || 'MISSING'}". ` +
                `Surfacing diagnostic at line ~174 instead of writing legacy defaults that would stomp user state.`
            );
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
            registerLanguageFeatures(context);

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
            failInitializationStatusBar(error instanceof Error ? error.message : String(error));
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
 */
export async function initializeSolution(
    context: ExtensionContext,
    refreshDocs: boolean = false,
    client: LanguageClient | undefined,
    reinitializeEnvironment: (refreshDocs: boolean) => Promise<void>
): Promise<void> {
    const solutionName = globalSolutionFile ? path.basename(globalSolutionFile) : undefined;
    updateInitializationStatusBar('loading-solution', solutionName);

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
        failInitializationStatusBar('Missing required Clarion solution settings');
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
    // #297 fix 2: shared between the solutionReady handler (registered inside the client block)
    // and the eager path's completion check further down — must be function-scoped.
    // `started` is flipped at handler ENTRY (the handler's refresh pass can take 15s+ on a busy
    // server — Mark's VM run showed the 30s fallback firing MID-handler and running a competing
    // document pass because only the end-of-handler flag existed). The fallback timer handle is
    // kept so the handler can cancel it outright.
    let startupRefreshDone = false;
    let startupRefreshStarted = false;
    let startupFallbackTimer: ReturnType<typeof setTimeout> | null = null;

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
        // #297 fix 2 (audit H1): SINGLE startup pipeline. Previously the eager init path AND this
        // handler both ran the full completion (two tree refreshes, two open-document passes, two
        // cache clears) — all heavy work happened twice, exactly in the server's busiest window.
        // The solutionReady handler is now the sole completion driver; the eager path defers to it
        // (with a 30s fallback if the notification never arrives — see below).
        let solutionReadyDisposable: Disposable | null = null;
        solutionReadyDisposable = client.onNotification('clarion/solutionReady', async (params: { solutionFilePath: string, projectCount: number }) => {
            // Ignore stale notifications from a previous solution load.
            // #263: compare via PathUtils.equalPath (normalized, case-insensitive) — a strict
            // !== here rejected every notification when the server echoed a differently-spelled
            // path, permanently blocking the deferred-activation path below.
            if (!PathUtils.equalPath(params.solutionFilePath, globalSolutionFile)) {
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

            // Claim the startup completion NOW and kill the fallback — this handler's refresh
            // pass can run long, and the fallback must not start a competing pass mid-flight.
            startupRefreshStarted = true;
            if (startupFallbackTimer) {
                clearTimeout(startupFallbackTimer);
                startupFallbackTimer = null;
            }

            logger.info(`⏱️ [STARTUP] clarion/solutionReady received: ${params.projectCount} projects — refreshing solution tree and open documents`);
            updateInitializationStatusBar('indexing-solution', `${params.projectCount} projects`);

            const solutionCache = SolutionCache.getInstance();
            // #297 fix 3 (audit H1): arm the activation suppression BEFORE any cache clear or tree
            // re-render. Previously refresh(true) cleared the findFile cache and the whole-tree
            // re-render ran guard-off against the cold cache — a burst of per-node findFile
            // requests at the server's busiest moment. try/finally guarantees the guard drops.
            solutionCache.beginActivationRefresh();
            try {
                const refreshStart = Date.now();
                await solutionCache.refresh(true);
                logger.info(`⏱️ [STARTUP] solutionCache.refresh(true) in solutionReady handler done in ${Date.now() - refreshStart}ms (${solutionCache.getSolutionInfo()?.projects?.length ?? 0} projects)`);
                await refreshSolutionTreeView();
            } finally {
                solutionCache.markActivationComplete();
            }
            startupRefreshDone = true;
            logger.info(`✅ [STARTUP] COMPLETE — extension ready for user interaction`);
            completeInitializationStatusBar(solutionName);
        });

        // Track FileRelationshipGraph build progress in the Actions toolbar
        context.subscriptions.push(
            client.onNotification('clarion/graphStatus', (params: {
                status: 'building' | 'built';
                fileCount?: number;
                edgeCount?: number;
                durationMs?: number;
            }) => {
                setToolbarGraphStatus(params);
            })
        );

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
            defaultLookupExtensions: globalSettings.defaultLookupExtensions, // Add default lookup extensions
            undeclaredVariablesEnabled: globalSettings.undeclaredVariablesEnabled, // #62 opt-in
            indistinguishablePrototypesEnabled: globalSettings.indistinguishablePrototypesEnabled, // #121 opt-in
            referencesCodeLensEnabled: globalSettings.referencesCodeLensEnabled, // #185 opt-out
            inlayHintsParameterNames: globalSettings.inlayHintsParameterNames,   // inlay opt-out
            inlayHintsImplicitTypes: globalSettings.inlayHintsImplicitTypes      // inlay opt-out
        });
        logger.info(`⏱️ [STARTUP] clarion/updatePaths sent`);
        updateInitializationStatusBar('indexing-solution', solutionName);
        
        // #297 S1: the 1s sleep that lived here ("wait for the server to process updatePaths")
        // is gone. The race it papered over is handled properly now: an early getSolutionTree
        // just returns the empty/cached tree (the client keeps existing info on an empty
        // response), and the clarion/solutionReady handler refreshes with the real tree. On the
        // VM run 8, the server had the solution READY in 2.0s — this sleep was pure added
        // latency on the eager path.
        logger.info(`⏱️ [STARTUP] calling reinitializeEnvironment (no artificial delay)`);
    } else {
        logger.error("❌ Language client is not available.");
        failInitializationStatusBar('Language client is not available');
        vscodeWindow.showErrorMessage("Error initializing Clarion solution: Language client is not available.");
        return;
    }
    const startTime = performance.now();
    logger.info("🔄 Initializing solution environment...");
    
    // ✅ Continue initializing the solution cache and document manager
    await reinitializeEnvironment(refreshDocs);
    logger.info(`⏱️ [STARTUP] reinitializeEnvironment complete`);
    logger.info("✅ Environment initialized");
    
    await refreshSolutionTreeView();
    logger.info(`⏱️ [STARTUP] refreshSolutionTreeView complete`);
    logger.info("✅ Solution tree view refreshed");
    
    registerLanguageFeatures(context);
    logger.info("✅ Language features registered");
    
    await commands.executeCommand("setContext", "clarion.solutionOpen", true);
    updateConfigurationStatusBar(globalSettings.configuration);
    updateBuildProjectStatusBar(); // Update the build project status bar
    
    // Create file watchers for the solution, project, and redirection files
    const fwStart = Date.now();
    await createSolutionFileWatchers(context, reinitializeEnvironment);
    logger.info(`⏱️ [STARTUP] createSolutionFileWatchers complete in ${Date.now() - fwStart}ms`);
    logger.info("✅ File watchers created");
    
    // #297 fix 2 (audit H1): the eager path no longer runs its own completion pass — the
    // clarion/solutionReady handler is the single startup pipeline (it refreshes the cache, the
    // tree, and the open documents under the activation guard, then marks completion). If the
    // handler already ran, there is nothing left to do; otherwise arm a 30s fallback so a server
    // that never sends solutionReady can't leave document links unrefreshed and findFile
    // suppressed forever.
    const solutionCache = SolutionCache.getInstance();
    if (startupRefreshDone) {
        logger.info(`⏱️ [STARTUP] solutionReady handler already completed the startup refresh — no duplicate pass`);
    } else {
        logger.info(`⏱️ [STARTUP] startup completion deferred to the clarion/solutionReady handler (single pipeline)`);
        startupFallbackTimer = setTimeout(async () => {
            if (startupRefreshDone || startupRefreshStarted) return;
            startupRefreshDone = true;
            logger.warn(`⚠️ [STARTUP] clarion/solutionReady not received within 30s — running fallback completion`);
            solutionCache.beginActivationRefresh();
            solutionCache.markActivationComplete();
            completeInitializationStatusBar(solutionName);
        }, 30_000);
    }
    
    const endTime = performance.now();
    logger.info(`✅ Solution initialization completed in ${(endTime - startTime).toFixed(2)}ms`);
    
    // Status bar now carries startup/ready UX; avoid extra startup popups.
}

/**
 * Reinitializes the solution environment (cache and document manager)
 * @param refreshDocs - Whether to refresh open documents
 * @param client - Language client instance
 */
export async function reinitializeEnvironment(
    refreshDocs: boolean = false,
    client: LanguageClient | undefined
): Promise<void> {
    const startTime = performance.now();
    logger.info("🔄 Initializing SolutionCache...");

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
        logger.info(`⏱️ [STARTUP] solutionCache.initialize starting`);
        const result = await solutionCache.initialize(globalSolutionFile);
        const cacheEndTime = performance.now();
        logger.info(`⏱️ [STARTUP] solutionCache.initialize done in ${(cacheEndTime - cacheStartTime).toFixed(0)}ms (${result ? 'success' : 'failed'})`);
        logger.info(`✅ SolutionCache initialized in ${(cacheEndTime - cacheStartTime).toFixed(2)}ms (${result ? 'success' : 'failed'})`);
        
        // If initialization failed or returned empty solution, force a refresh from server
        if (!result) {
            logger.warn("⚠️ Solution cache initialization failed. Forcing refresh from server...");
            const refreshStartTime = performance.now();
            logger.info(`⏱️ [STARTUP] solutionCache.refresh (forced) starting`);
            const refreshResult = await solutionCache.refresh(true);
            const refreshEndTime = performance.now();
            logger.info(`⏱️ [STARTUP] solutionCache.refresh (forced) done in ${(refreshEndTime - refreshStartTime).toFixed(0)}ms`);
            logger.info(`✅ SolutionCache force refreshed in ${(refreshEndTime - refreshStartTime).toFixed(2)}ms (${refreshResult ? 'success' : 'failed'})`);
            
            if (!refreshResult) {
                logger.error("❌ Failed to refresh solution cache from server. Solution features may not work correctly.");
            }
        }
    } else {
        logger.warn("⚠️ No solution file path available. SolutionCache will not be initialized.");
    }
    
    const endTime = performance.now();
    logger.info(`✅ Environment reinitialized in ${(endTime - startTime).toFixed(2)}ms`);
}
