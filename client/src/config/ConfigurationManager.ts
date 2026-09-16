import { workspace, window as vscodeWindow } from 'vscode';
import { globalSolutionFile, globalSettings, getClarionConfigTarget, setGlobalClarionSelection, globalClarionPropertiesFile, globalClarionVersion } from '../globals';
import { SolutionCache } from '../SolutionCache';
import { SolutionTreeDataProvider } from '../SolutionTreeDataProvider';
import { updateConfigurationStatusBar } from '../statusbar/StatusBarManager';
import { readActiveConfigFromSlnCache, patchSlnCacheConfig, buildFullConfig } from '../utils/SlnCacheUtils';
import { writeIdePreferences } from '../solution/ClarionIdePreferences';
import { updateSolutionToolbar, refreshSolutionTreeView } from '../views/ViewManager';
import LoggerManager from '../utils/LoggerManager';
import { getLanguageClient, isClientReady } from '../LanguageClientManager'; // #564

const logger = LoggerManager.getLogger("ConfigurationManager");
logger.setLevel("error"); // Production: Only log errors

/**
 * Opens the configuration picker and allows the user to select a configuration
 * @param solutionTreeDataProvider - Optional solution tree provider to refresh if no solution is open
 */
export async function setConfiguration(solutionTreeDataProvider?: SolutionTreeDataProvider): Promise<void> {
    logger.info("🔧 setConfiguration called");
    
    if (!globalSolutionFile) {
        // Refresh the solution tree view to show the "Open Solution" button
        if (solutionTreeDataProvider) {
            await solutionTreeDataProvider.refresh();
        }
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
        logger.info(`✅ User selected configuration: ${selectedConfig}`);
        logger.info(`📊 Current globalSettings.configuration BEFORE update: ${globalSettings.configuration}`);
        
        vscodeWindow.showInformationMessage(`Configuration set to: ${selectedConfig}`);
        
        // Update global settings and save to workspace
        globalSettings.configuration = selectedConfig;
        logger.info(`📊 Updated globalSettings.configuration TO: ${globalSettings.configuration}`);
        
        await setGlobalClarionSelection(
            globalSolutionFile,
            globalClarionPropertiesFile,
            globalClarionVersion,
            selectedConfig
        );
        logger.info(`💾 Called setGlobalClarionSelection with config: ${selectedConfig}`);

        // Patch .sln.cache if it already exists so Clarion IDE sees the updated config
        if (globalSolutionFile) {
            const existingFull = readActiveConfigFromSlnCache(globalSolutionFile);
            patchSlnCacheConfig(globalSolutionFile, buildFullConfig(selectedConfig, existingFull));
        }

        // Sync configuration back to Clarion IDE preferences
        if (globalSolutionFile && globalClarionPropertiesFile) {
            const parts = selectedConfig.split('|');
            await writeIdePreferences(globalSolutionFile, globalClarionPropertiesFile, {
                activeConfiguration: parts[0],
                activePlatform: parts[1] ?? 'Win32'
            });
        }

        // #563 — status bar, Tools pane and Solution View from the one stored value.
        await applyActiveConfiguration(selectedConfig);
        logger.info(`🔄 Updated status bar, Tools pane and Solution View to: ${selectedConfig}`);
    } else {
        logger.info("❌ User cancelled configuration selection");
    }
}

/**
 * #563 — make `configuration` the active build configuration everywhere it is shown or used:
 * the stored value (which the build reads), the status bar, the Tools pane and the Solution View
 * label. Both the picker and a hand edit of `clarion.configuration` go through here, so the
 * screen cannot disagree with itself or with the build. Does not write settings.
 */
export async function applyActiveConfiguration(configuration: string): Promise<void> {
    globalSettings.configuration = configuration;
    await updateConfigurationStatusBar(configuration);
    updateSolutionToolbar();
    await refreshSolutionTreeView();
    // #564 — the language server resolves files through the redirection file's sections for
    // this configuration; it only heard the configuration at solution load until now.
    const client = getLanguageClient();
    if (client && isClientReady()) {
        client.sendNotification('clarion/updateConfiguration', { configuration });
    }
}
