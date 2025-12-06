import { workspace, window as vscodeWindow } from 'vscode';
import { globalSolutionFile, globalSettings, getClarionConfigTarget } from '../globals';
import { SolutionCache } from '../SolutionCache';
import { SolutionTreeDataProvider } from '../SolutionTreeDataProvider';
import { updateConfigurationStatusBar } from '../statusbar/StatusBarManager';

/**
 * Opens the configuration picker and allows the user to select a configuration
 * @param solutionTreeDataProvider - Optional solution tree provider to refresh if no solution is open
 */
export async function setConfiguration(solutionTreeDataProvider?: SolutionTreeDataProvider): Promise<void> {
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
