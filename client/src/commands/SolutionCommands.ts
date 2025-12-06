import { commands, window as vscodeWindow, workspace, Uri, Disposable, ExtensionContext } from 'vscode';
import { globalSolutionFile } from '../globals';
import { isClientReady, getClientReadyPromise } from '../LanguageClientManager';
import { LanguageClient } from 'vscode-languageclient/node';
import { SmartSolutionOpener } from '../utils/SmartSolutionOpener';
import { GlobalSolutionHistory } from '../utils/GlobalSolutionHistory';
import { SolutionTreeDataProvider } from '../SolutionTreeDataProvider';
import { StatusViewProvider } from '../StatusViewProvider';
import LoggerManager from '../logger';
import * as path from 'path';

const logger = LoggerManager.getLogger("SolutionCommands");

// Type for initializeSolution function
type InitializeSolutionFn = (context: ExtensionContext, forceRefresh: boolean) => Promise<void>;

// Type for createSolutionTreeView function  
type CreateSolutionTreeViewFn = (context?: ExtensionContext) => Promise<void>;

/**
 * Registers solution management commands
 * @param context - Extension context
 * @param client - Language client instance
 * @param initializeSolution - Function to initialize solution
 * @param createSolutionTreeView - Function to create solution tree view
 * @returns Array of disposables for the registered commands
 */
export function registerSolutionManagementCommands(
    context: ExtensionContext,
    client: LanguageClient | undefined,
    initializeSolution: InitializeSolutionFn,
    createSolutionTreeView: CreateSolutionTreeViewFn
): Disposable[] {
    return [
        // Add reinitialize solution command
        commands.registerCommand('clarion.reinitializeSolution', async () => {
            logger.info("🔄 Manually reinitializing solution...");
            if (globalSolutionFile) {
                // Wait for the language client to be ready before initializing the solution
                if (client) {
                    logger.info("⏳ Waiting for language client to be ready before reinitializing solution...");
                    
                    try {
                        if (!isClientReady()) {
                            await getClientReadyPromise();
                            logger.info("✅ Language client is now ready for reinitialization.");
                        }
                        
                        await initializeSolution(context, true);
                        vscodeWindow.showInformationMessage("Solution reinitialized successfully.");
                    } catch (error) {
                        logger.error(`❌ Error waiting for language client: ${error instanceof Error ? error.message : String(error)}`);
                        vscodeWindow.showErrorMessage("Error reinitializing Clarion solution: Language client failed to start.");
                    }
                } else {
                    logger.error("❌ Language client is not available for reinitialization.");
                    vscodeWindow.showErrorMessage("Error reinitializing Clarion solution: Language client is not available.");
                }
            } else {
                // Refresh the solution tree view to show the "Open Solution" button
                await createSolutionTreeView(context);
                vscodeWindow.showInformationMessage("No solution is currently open. Use the 'Open Solution' button in the Solution View.");
            }
        })
    ];
}

/**
 * Registers solution opening commands (openRecentSolution, openDetectedSolution)
 * @param context - Extension context
 * @param initializeSolution - Function to initialize solution
 * @param solutionTreeDataProvider - Solution tree data provider (may be undefined)
 * @param statusViewProvider - Status view provider (may be undefined)
 * @returns Array of disposables for the registered commands
 */
export function registerSolutionOpeningCommands(
    context: ExtensionContext,
    initializeSolution: InitializeSolutionFn,
    solutionTreeDataProvider: SolutionTreeDataProvider | undefined,
    statusViewProvider: StatusViewProvider | undefined
): Disposable[] {
    return [
        commands.registerCommand('clarion.openRecentSolution', async (folderPath: string, solutionPath: string) => {
            logger.info(`🔄 Opening recent solution: ${solutionPath} in folder: ${folderPath}`);
            
            try {
                // Always use the solution's actual folder, not what's stored (might be stale)
                const actualSolutionFolder = path.dirname(solutionPath);
                const currentFolder = workspace.workspaceFolders?.[0]?.uri.fsPath;
                
                logger.info(`   - Current folder: ${currentFolder}`);
                logger.info(`   - Solution's actual folder: ${actualSolutionFolder}`);
                logger.info(`   - Stored folder: ${folderPath}`);
                
                if (currentFolder && currentFolder.toLowerCase() === actualSolutionFolder.toLowerCase()) {
                    // Already in the correct folder - just open the solution
                    logger.info(`✅ Already in correct folder, opening solution directly`);
                    await SmartSolutionOpener.openDetectedSolution(solutionPath);
                } else {
                    // Different folder - need to switch folders
                    // First, add the solution to global history with CORRECT folder path
                    await GlobalSolutionHistory.addSolution(solutionPath, actualSolutionFolder);
                    logger.info(`✅ Added solution to global history with correct folder path`);
                    
                    // Open the folder - VS Code will reload
                    await commands.executeCommand('vscode.openFolder', Uri.file(actualSolutionFolder), false);
                    logger.info(`✅ Folder opened: ${actualSolutionFolder}`);
                    // After reload, the solution should be in that folder's settings.json
                }
            } catch (error) {
                logger.error(`❌ Error opening recent solution:`, error);
                vscodeWindow.showErrorMessage(`Failed to open solution: ${error instanceof Error ? error.message : String(error)}`);
            }
        }),
        
        commands.registerCommand('clarion.openDetectedSolution', async (solutionPath: string) => {
            console.log(`🔄🔄🔄 COMMAND clarion.openDetectedSolution TRIGGERED for ${solutionPath}`);
            logger.info(`🔄 Executing clarion.openDetectedSolution command for ${solutionPath}`);
            
            try {
                const success = await SmartSolutionOpener.openDetectedSolution(solutionPath);
                
                console.log(`🎯🎯🎯 SmartSolutionOpener returned: ${success}`);
                
                if (success) {
                    // Global variables are already set by SmartSolutionOpener, no need to reload
                    console.log(`✅✅✅ Solution opened successfully. Current globals:
                        - globalSolutionFile: ${globalSolutionFile || 'not set'}
                        - globalClarionPropertiesFile: ${globalSolutionFile || 'not set'}
                        - globalClarionVersion: ${globalSolutionFile || 'not set'}`);
                    
                    // Initialize the solution
                    console.log("🚀🚀🚀 About to call initializeSolution");
                    await initializeSolution(context, true);
                    console.log("✅✅✅ initializeSolution completed");
                    
                    // Explicitly refresh the tree view to show projects/apps
                    if (solutionTreeDataProvider) {
                        await solutionTreeDataProvider.refresh();
                    }
                    
                    // Refresh status view
                    if (statusViewProvider) {
                        statusViewProvider.refresh();
                    }
                }
            } catch (error) {
                logger.error(`❌ Error in clarion.openDetectedSolution command: ${error instanceof Error ? error.message : String(error)}`);
                vscodeWindow.showErrorMessage(`Error opening solution: ${error instanceof Error ? error.message : String(error)}`);
            }
        })
    ];
}
