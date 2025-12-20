import { commands, window, window as vscodeWindow, Disposable, DiagnosticCollection } from 'vscode';
import { globalSolutionFile } from '../globals';
import { SolutionCache } from '../SolutionCache';
import { SolutionTreeDataProvider } from '../SolutionTreeDataProvider';
import { ClarionProjectInfo } from 'common/types';
import * as buildTasks from '../buildTasks';
import * as clarionClHelper from '../clarionClHelper';
import LoggerManager from '../LoggerManager';
import { trackPerformance } from '../telemetry';

const logger = LoggerManager.getLogger("BuildCommands");

/**
 * Registers all build-related commands
 * @param diagnosticCollection - VS Code diagnostic collection
 * @param solutionTreeDataProvider - Solution tree data provider (may be undefined)
 * @returns Array of disposables for the registered commands
 */
export function registerBuildCommands(
    diagnosticCollection: DiagnosticCollection,
    solutionTreeDataProvider: SolutionTreeDataProvider | undefined
): Disposable[] {
    return [
        // Add solution build command
        commands.registerCommand("clarion.buildSolution", async () => {
            await buildTasks.runClarionBuild();
        }),

        // Add project build command
        commands.registerCommand('clarion.buildProject', async (node) => {
            // The node parameter is passed automatically from the treeview
            if (node && node.data) {
                // If this is a file node, get the parent project node
                if (node.data.relativePath && node.parent && node.parent.data && node.parent.data.path) {
                    // This is a file node, use its parent project
                    await buildTasks.buildSolutionOrProject("Project", node.parent.data, diagnosticCollection, solutionTreeDataProvider);
                } else if (node.data.path) {
                    // This is a project node
                    await buildTasks.buildSolutionOrProject("Project", node.data, diagnosticCollection, solutionTreeDataProvider);
                } else {
                    window.showErrorMessage("Cannot determine which project to build.");
                }
            } else {
                window.showErrorMessage("Cannot determine which project to build.");
            }
        }),

        // Add ClarionCl generator commands
        commands.registerCommand('clarion.generateAllApps', async (node) => {
            await clarionClHelper.generateAllApps();
        }),

        commands.registerCommand('clarion.generateApp', async (node) => {
            if (node && node.data && node.data.absolutePath) {
                await clarionClHelper.generateApp(node.data.absolutePath);
            } else {
                window.showErrorMessage("Cannot determine which application to generate.");
            }
        }),

        // Add build current project command
        commands.registerCommand('clarion.buildCurrentProject', async () => {
            logger.info("🔄 Building current project or solution...");
            
            // Get the active editor
            const activeEditor = window.activeTextEditor;
            if (!activeEditor) {
                vscodeWindow.showWarningMessage("No active file. Please open a file to build its project.");
                return;
            }
            
            // Get the file path of the active editor
            const filePath = activeEditor.document.uri.fsPath;
            
            // Get the SolutionCache instance
            const solutionCache = SolutionCache.getInstance();
            
            // Find all projects the file belongs to
            const projects = solutionCache.findProjectsForFile(filePath);
            
            if (projects.length === 1) {
                // If exactly one project contains the file, build that project
                await buildTasks.buildSolutionOrProject("Project", projects[0], diagnosticCollection, solutionTreeDataProvider);
            } else if (projects.length > 1) {
                // If multiple projects contain the file, show a quick pick to select which one to build
                const buildOptions = [
                    "Build Full Solution",
                    ...projects.map(p => `Build Project: ${p.name}`),
                    "Cancel"
                ];
                
                const selectedOption = await vscodeWindow.showQuickPick(buildOptions, {
                    placeHolder: "Select a build target",
                });
                
                if (!selectedOption || selectedOption === "Cancel") {
                    return;
                }
                
                if (selectedOption === "Build Full Solution") {
                    await buildTasks.buildSolutionOrProject("Solution", undefined, diagnosticCollection, solutionTreeDataProvider);
                } else {
                    // Extract project name from the selected option
                    const projectName = selectedOption.replace("Build Project: ", "");
                    const selectedProject = projects.find(p => p.name === projectName);
                    
                    if (selectedProject) {
                        await buildTasks.buildSolutionOrProject("Project", selectedProject, diagnosticCollection, solutionTreeDataProvider);
                    } else {
                        vscodeWindow.showErrorMessage(`Project ${projectName} not found.`);
                    }
                }
            } else {
                // Build the entire solution if no project is found
                await buildTasks.buildSolutionOrProject("Solution", undefined, diagnosticCollection, solutionTreeDataProvider);
            }
        }),

        // Add force refresh solution cache command
        commands.registerCommand('clarion.forceRefreshSolutionCache', async () => {
            logger.info("🔄 Manually force refreshing solution cache...");
            if (globalSolutionFile) {
                try {
                    vscodeWindow.showInformationMessage("Force refreshing solution cache...");
                    
                    // Get the SolutionCache singleton
                    const solutionCache = SolutionCache.getInstance();
                    
                    // Force refresh the solution cache
                    const startTime = performance.now();
                    const result = await solutionCache.refresh(true);
                    const endTime = performance.now();
                    
                    if (result) {
                        logger.info(`✅ Solution cache force refreshed successfully in ${(endTime - startTime).toFixed(2)}ms`);
                        trackPerformance('SolutionCacheForceRefresh', endTime - startTime, { triggered: 'command' });
                        
                        // Refresh the solution tree view
                        if (solutionTreeDataProvider) {
                            await solutionTreeDataProvider.refresh();
                        }
                        
                        vscodeWindow.showInformationMessage("Solution cache force refreshed successfully.");
                    } else {
                        logger.error("❌ Failed to force refresh solution cache.");
                        vscodeWindow.showErrorMessage("Failed to force refresh solution cache. Check the logs for details.");
                    }
                } catch (error) {
                    logger.error(`❌ Error force refreshing solution cache: ${error instanceof Error ? error.message : String(error)}`);
                    vscodeWindow.showErrorMessage(`Error force refreshing solution cache: ${error instanceof Error ? error.message : String(error)}`);
                }
            } else {
                vscodeWindow.showInformationMessage("No solution is currently open. Use the 'Open Solution' button in the Solution View.");
            }
        })
    ];
}
