import { commands, window as vscodeWindow, Disposable, ExtensionContext } from 'vscode';
import { globalSolutionFile } from '../globals';
import { isClientReady, getClientReadyPromise } from '../LanguageClientManager';
import { LanguageClient } from 'vscode-languageclient/node';
import LoggerManager from '../logger';

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
