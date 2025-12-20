import { commands, Uri, window, ExtensionContext, workspace, window as vscodeWindow } from 'vscode';
import { globalClarionPropertiesFile, globalClarionVersion, globalSettings, globalSolutionFile, setGlobalClarionSelection, ClarionSolutionSettings, getClarionConfigTarget } from '../globals';
import { ClarionExtensionCommands } from '../ClarionExtensionCommands';
import { extractConfigurationsFromSolution } from '../utils/ExtensionHelpers';
import { GlobalSolutionHistory } from '../utils/GlobalSolutionHistory';
import { SolutionCache } from '../SolutionCache';
import { hideConfigurationStatusBar, hideBuildProjectStatusBar } from '../statusbar/StatusBarManager';
import { disposeLanguageFeatures } from '../providers/LanguageFeatureManager';
import { refreshSolutionTreeView } from '../views/ViewManager';
import { createSolutionFileWatchers } from '../providers/FileWatcherManager';
import { DocumentManager } from '../documentManager';
import LoggerManager from '../utils/LoggerManager';
import * as path from 'path';
import * as fs from 'fs';

const logger = LoggerManager.getLogger("SolutionOpener");

/**
 * Opens a solution from the configured solutions list
 * @param context - Extension context
 * @param initializeSolution - Function to initialize the solution
 * @param closeClarionSolution - Function to close current solution
 * @param statusViewProvider - Status view provider for refresh
 */
export async function openSolutionFromList(
    context: ExtensionContext,
    initializeSolution: (context: ExtensionContext, refreshDocs: boolean) => Promise<void>,
    closeClarionSolution: (context: ExtensionContext) => Promise<void>,
    statusViewProvider: any
) {
    try {
        // Get the list of solutions from workspace settings
        const config = workspace.getConfiguration("clarion");
        const solutions = config.get<ClarionSolutionSettings[]>("solutions", []);
        
        // Filter out the current solution if it's open
        const otherSolutions = solutions.filter(s => s.solutionFile !== globalSolutionFile);
        
        // If there are no other solutions, show the regular open dialog
        if (otherSolutions.length === 0) {
            // No other solutions found, redirect to regular open solution dialog
            vscodeWindow.showInformationMessage("No other solutions found. Opening solution selection dialog.");
            await openClarionSolution(context, initializeSolution, statusViewProvider);
            return;
        }
        
        // Create quick pick items for the solutions
        const quickPickItems = otherSolutions.map(s => ({
            label: `$(file) ${path.basename(s.solutionFile)}`,
            description: path.dirname(s.solutionFile),
            solution: s
        }));
        
        // Show the quick pick
        const selectedItem = await vscodeWindow.showQuickPick(quickPickItems, {
            placeHolder: "Select a solution to open",
        });
        
        if (!selectedItem) {
            return; // User cancelled
        }
        
        // Check if a solution is already open
        if (globalSolutionFile) {
            logger.info(`🔄 Closing current solution before opening: ${selectedItem.solution.solutionFile}`);
            await closeClarionSolution(context);
        }
        
        // Open the selected solution
        logger.info(`📂 Opening solution: ${selectedItem.solution.solutionFile}`);
        
        // Set environment variable for the server to use
        process.env.CLARION_SOLUTION_FILE = selectedItem.solution.solutionFile;
        logger.info(`✅ Set CLARION_SOLUTION_FILE environment variable: ${selectedItem.solution.solutionFile}`);
        
        // Set global variables
        await setGlobalClarionSelection(
            selectedItem.solution.solutionFile,
            selectedItem.solution.propertiesFile,
            selectedItem.solution.version,
            selectedItem.solution.configuration
        );
        
        // Initialize the Solution
        await initializeSolution(context, true);
        
        // Mark solution as open
        await commands.executeCommand("setContext", "clarion.solutionOpen", true);
        statusViewProvider?.refresh(); // Refresh status view when solution opens
        vscodeWindow.showInformationMessage(`Clarion Solution Loaded: ${path.basename(selectedItem.solution.solutionFile)}`);
    } catch (error) {
        const errMessage = error instanceof Error ? error.message : String(error);
        logger.error("❌ Error opening solution from list:", error);
        vscodeWindow.showErrorMessage(`Error opening Clarion solution: ${errMessage}`);
    }
}

/**
 * Opens a Clarion solution with full configuration
 * @param context - Extension context
 * @param initializeSolution - Function to initialize the solution
 * @param statusViewProvider - Status view provider for refresh
 */
export async function openClarionSolution(
    context: ExtensionContext,
    initializeSolution: (context: ExtensionContext, refreshDocs: boolean) => Promise<void>,
    statusViewProvider: any
) {
    try {
        // ✅ If no folder is open, let user pick solution and we'll open its folder
        if (!workspace.workspaceFolders) {
            const solutionUris = await window.showOpenDialog({
                canSelectFiles: true,
                canSelectFolders: false,
                canSelectMany: false,
                filters: { 'Clarion Solution': ['sln'] },
                title: 'Select Clarion Solution'
            });
            
            if (!solutionUris || solutionUris.length === 0) {
                window.showInformationMessage("Solution selection canceled.");
                return;
            }
            
            const solutionPath = solutionUris[0].fsPath;
            const solutionFolder = path.dirname(solutionPath);
            
            // ✅ Add to global history BEFORE opening folder so it's remembered after reload
            await GlobalSolutionHistory.addSolution(solutionPath, solutionFolder);
            logger.info(`✅ Added solution to global history before opening folder`);
            
            // Open the folder containing the solution
            logger.info(`📂 Opening folder: ${solutionFolder}`);
            await commands.executeCommand('vscode.openFolder', Uri.file(solutionFolder), false);
            
            // VS Code will reload with the folder open, and the extension will activate
            // The solution will be detected and shown in the solution view
            return;
        }

        // ✅ Store current values in case user cancels
        const previousSolutionFile = globalSolutionFile;
        const previousPropertiesFile = globalClarionPropertiesFile;
        const previousVersion = globalClarionVersion;
        const previousConfiguration = globalSettings.configuration;

        // ✅ Step 1: Check if we should use an existing solution from the solutions array
        const config = workspace.getConfiguration("clarion");
        const solutions = config.get<ClarionSolutionSettings[]>("solutions", []);
        
        // If we have solutions in the array, offer them as quick picks
        let solutionFilePath = "";
        
        if (solutions.length > 0) {
            // Define the types for our quick pick items
            type NewSolutionQuickPickItem = { label: string; description: string; solution?: undefined };
            type ExistingSolutionQuickPickItem = { label: string; description: string; solution: ClarionSolutionSettings };
            type SolutionQuickPickItem = NewSolutionQuickPickItem | ExistingSolutionQuickPickItem;
            
            // Create quick pick items for existing solutions and a "New Solution" option
            const quickPickItems: SolutionQuickPickItem[] = [
                { label: "$(add) New Solution...", description: "Select a new Clarion solution file" },
                ...solutions.map(s => ({
                    label: `$(file) ${path.basename(s.solutionFile)}`,
                    description: path.dirname(s.solutionFile),
                    solution: s
                }))
            ];
            
            const selectedItem = await vscodeWindow.showQuickPick(quickPickItems, {
                placeHolder: "Select an existing solution or create a new one",
            });
            
            if (!selectedItem) {
                vscodeWindow.showWarningMessage("Solution selection canceled. Restoring previous settings.");
                await setGlobalClarionSelection(previousSolutionFile, previousPropertiesFile, previousVersion, previousConfiguration);
                return;
            }
            
            // If user selected an existing solution
            if (selectedItem.solution) {
                logger.info(`📂 Selected existing Clarion solution: ${selectedItem.solution.solutionFile}`);
                
                // Use the existing solution settings
                await setGlobalClarionSelection(
                    selectedItem.solution.solutionFile,
                    selectedItem.solution.propertiesFile,
                    selectedItem.solution.version,
                    selectedItem.solution.configuration
                );
                
                // Add to global solution history
                if (workspace.workspaceFolders && workspace.workspaceFolders.length > 0) {
                    const folderPath = path.dirname(selectedItem.solution.solutionFile);
                    await GlobalSolutionHistory.addSolution(selectedItem.solution.solutionFile, folderPath);
                    logger.info("✅ Added to global solution history");
                }
                
                // Set environment variable for the server to use
                process.env.CLARION_SOLUTION_FILE = selectedItem.solution.solutionFile;
                logger.info(`✅ Set CLARION_SOLUTION_FILE environment variable: ${selectedItem.solution.solutionFile}`);
                
                // Initialize the Solution
                await initializeSolution(context, true);
                
                // Mark solution as open
                await commands.executeCommand("setContext", "clarion.solutionOpen", true);
                statusViewProvider?.refresh(); // Refresh status view when solution opens
                
                vscodeWindow.showInformationMessage(`Clarion Solution Loaded: ${path.basename(selectedItem.solution.solutionFile)}`);
                
                return;
            }
            
            // If we get here, user selected "New Solution..."
        }
        
        // Ask the user to select a new .sln file
        const selectedFileUri = await vscodeWindow.showOpenDialog({
            canSelectFiles: true,
            canSelectFolders: false,
            openLabel: "Select Clarion Solution (.sln)",
            filters: { "Solution Files": ["sln"] },
        });

        if (!selectedFileUri || selectedFileUri.length === 0) {
            vscodeWindow.showWarningMessage("Solution selection canceled. Restoring previous settings.");
            await setGlobalClarionSelection(previousSolutionFile, previousPropertiesFile, previousVersion, previousConfiguration);
            return;
        }

        solutionFilePath = selectedFileUri[0].fsPath;
        logger.info(`📂 Selected new Clarion solution: ${solutionFilePath}`);

        // ✅ Step 2: Select or retrieve ClarionProperties.xml
        if (!globalClarionPropertiesFile || !fs.existsSync(globalClarionPropertiesFile)) {
            logger.info("📂 No ClarionProperties.xml found. Prompting user for selection...");
            await ClarionExtensionCommands.configureClarionPropertiesFile();

            if (!globalClarionPropertiesFile || !fs.existsSync(globalClarionPropertiesFile)) {
                vscodeWindow.showErrorMessage("ClarionProperties.xml is required. Operation cancelled.");
                await setGlobalClarionSelection(previousSolutionFile, previousPropertiesFile, previousVersion, previousConfiguration);
                return;
            }
        }

        // ✅ Step 3: Select or retrieve the Clarion version
        if (!globalClarionVersion) {
            logger.info("🔍 No Clarion version selected. Prompting user...");
            await ClarionExtensionCommands.selectClarionVersion();

            if (!globalClarionVersion) {
                vscodeWindow.showErrorMessage("Clarion version is required. Operation cancelled.");
                await setGlobalClarionSelection(previousSolutionFile, previousPropertiesFile, previousVersion, previousConfiguration);
                return;
            }
        }

        // ✅ Step 4: Determine available configurations
        const solutionFileContent = fs.readFileSync(solutionFilePath, 'utf-8');
        const availableConfigs = extractConfigurationsFromSolution(solutionFileContent);

        // ✅ Prompt the user **only if multiple configurations exist**
        if (availableConfigs.length > 1) {
            const selectedConfig = await vscodeWindow.showQuickPick(availableConfigs, {
                placeHolder: "Select Clarion Configuration",
            });

            if (!selectedConfig) {
                vscodeWindow.showWarningMessage("Configuration selection canceled. Using 'Debug' as fallback.");
                globalSettings.configuration = "Debug"; // ⬅️ Safe fallback
            } else {
                globalSettings.configuration = selectedConfig;
            }
        } else {
            globalSettings.configuration = availableConfigs[0] || "Debug"; // ⬅️ Single config or fallback
        }

        // ✅ Step 4: Save final selections to workspace settings
        await setGlobalClarionSelection(solutionFilePath, globalClarionPropertiesFile, globalClarionVersion, globalSettings.configuration);
        logger.info(`⚙️ Selected configuration: ${globalSettings.configuration}`);
        
        // ✅ Add to global solution history
        const folderPath = path.dirname(solutionFilePath);
        await GlobalSolutionHistory.addSolution(solutionFilePath, folderPath);
        logger.info("✅ Added to global solution history");
        
        // ✅ Set environment variable for the server to use
        process.env.CLARION_SOLUTION_FILE = solutionFilePath;
        logger.info(`✅ Set CLARION_SOLUTION_FILE environment variable: ${solutionFilePath}`);

        // ✅ Step 5: Initialize the Solution
        await initializeSolution(context, true);

        // ✅ Step 6: Mark solution as open
        await commands.executeCommand("setContext", "clarion.solutionOpen", true);
        statusViewProvider?.refresh(); // Refresh status view when solution opens
        
        vscodeWindow.showInformationMessage(`Clarion Solution Loaded: ${path.basename(globalSolutionFile)}`);

    } catch (error) {
        const errMessage = error instanceof Error ? error.message : String(error);
        logger.error("❌ Error opening solution:", error);
        vscodeWindow.showErrorMessage(`Error opening Clarion solution: ${errMessage}`);
    }
}

/**
 * Closes the currently open Clarion solution
 * @param context - Extension context
 * @param reinitializeEnvironment - Function to reinitialize environment
 * @param documentManager - Document manager instance
 * @param statusViewProvider - Status view provider for refresh
 */
export async function closeClarionSolution(
    context: ExtensionContext,
    reinitializeEnvironment: (refreshDocs: boolean) => Promise<DocumentManager>,
    documentManager: DocumentManager | undefined,
    statusViewProvider: any
) {
    try {
        logger.info("🔄 Closing Clarion solution...");
        
        const target = getClarionConfigTarget();
        if (target && workspace.workspaceFolders) {
            const config = workspace.getConfiguration("clarion", workspace.workspaceFolders[0].uri);
            
            // Clear solution-related settings from folder settings
            await config.update("solutionFile", "", target);
            
            // Clear the current solution setting
            await config.update("currentSolution", "", target);
            logger.info("✅ Cleared current solution setting");
        }
        
        // Reset global variables
        await setGlobalClarionSelection("", globalClarionPropertiesFile, globalClarionVersion, "");
        
        // Clear the environment variable
        process.env.CLARION_SOLUTION_FILE = "";
        logger.info("✅ Cleared CLARION_SOLUTION_FILE environment variable");
        
        // Clear the solution cache to remove any stored locations
        const solutionCache = SolutionCache.getInstance();
        solutionCache.clear();
        logger.info("✅ Cleared solution cache");
        
        // Hide the status bar items
        hideConfigurationStatusBar();
        hideBuildProjectStatusBar();
        
        // Mark solution as closed
        await commands.executeCommand("setContext", "clarion.solutionOpen", false);
        statusViewProvider?.refresh(); // Refresh status view when solution closes
        
        // Clear all language feature providers
        disposeLanguageFeatures();
        logger.info("✅ Cleared all language feature providers");
        
        // Refresh the solution tree view to show the "Open Solution" button
        await refreshSolutionTreeView();
        // Hide the build project status bar if it exists
        hideBuildProjectStatusBar();
        
        
        // Dispose of any file watchers
        await createSolutionFileWatchers(context, reinitializeEnvironment, documentManager);
        
        vscodeWindow.showInformationMessage("Clarion solution closed successfully.");
    } catch (error) {
        const errMessage = error instanceof Error ? error.message : String(error);
        logger.error("❌ Error closing solution:", error);
        vscodeWindow.showErrorMessage(`Error closing Clarion solution: ${errMessage}`);
    }
}
