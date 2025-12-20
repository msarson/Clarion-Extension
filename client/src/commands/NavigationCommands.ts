import { commands, Uri, window as vscodeWindow, workspace, Range, TreeView, Disposable } from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { SolutionCache } from '../SolutionCache';
import { SolutionTreeDataProvider } from '../SolutionTreeDataProvider';
import { TreeNode } from '../TreeNode';
import { ClarionProjectInfo } from 'common/types';
import LoggerManager from '../LoggerManager';

const logger = LoggerManager.getLogger("NavigationCommands");

/**
 * Registers all navigation-related commands
 * @param treeView - The solution tree view (may be undefined)
 * @param solutionTreeDataProvider - The solution tree data provider (may be undefined)
 * @returns Array of disposables for the registered commands
 */
export function registerNavigationCommands(
    treeView: TreeView<TreeNode> | undefined,
    solutionTreeDataProvider: SolutionTreeDataProvider | undefined
): Disposable[] {
    return [
        // Register the goToSymbol command
        commands.registerCommand('clarion.goToSymbol', (uri: Uri, range: Range) => {
            vscodeWindow.showTextDocument(uri, { selection: range });
        }),

        // Add command to navigate to method implementation
        commands.registerCommand('clarion.goToMethodImplementation', (filePath: string, line: number, character: number = 0) => {
            const uri = Uri.file(filePath);
            const position = new Range(line, character, line, character);
            vscodeWindow.showTextDocument(uri, { selection: position });
        }),

        // Add command to navigate to a project in the solution tree
        commands.registerCommand('clarion.navigateToProject', async (projectGuid: string) => {
            if (!projectGuid) {
                logger.warn("⚠️ No project GUID provided for navigation");
                return;
            }

            logger.info(`🔍 Navigating to project with GUID: ${projectGuid}`);
            
            // Get the solution cache to find the project
            const solutionCache = SolutionCache.getInstance();
            const solution = solutionCache.getSolutionInfo();
            
            if (!solution || !solution.projects) {
                logger.warn("⚠️ No solution available for project navigation");
                return;
            }
            
            // Find the project by GUID
            const project = solution.projects.find(p => p.guid === projectGuid);
            if (!project) {
                logger.warn(`⚠️ Project with GUID ${projectGuid} not found in solution`);
                return;
            }
            
            logger.info(`✅ Found project: ${project.name}`);
            
            // Reveal the project in the solution tree view
            if (treeView && solutionTreeDataProvider) {
                // Refresh the tree view to ensure it's up to date
                await solutionTreeDataProvider.refresh();
                
                // Find the project node in the tree
                const rootNodes = await solutionTreeDataProvider.getChildren();
                if (rootNodes && rootNodes.length > 0) {
                    const solutionNode = rootNodes[0];
                    const projectNodes = await solutionTreeDataProvider.getChildren(solutionNode);
                    
                    // Find the project node with matching GUID
                    const projectNode = projectNodes.find(node =>
                        node.data && (node.data as ClarionProjectInfo).guid === projectGuid
                    );
                    
                    if (projectNode) {
                        // Reveal the project node in the tree view
                        treeView.reveal(projectNode, { select: true, focus: true });
                        
                        // Open the project file
                        const projectFilePath = path.join(project.path, project.filename);
                        if (fs.existsSync(projectFilePath)) {
                            await commands.executeCommand('clarion.openFile', projectFilePath);
                        }
                    }
                }
            }
        }),

        // Register the openFile command
        commands.registerCommand('clarion.openFile', async (filePath: string | Uri) => {
            if (!filePath) {
                vscodeWindow.showErrorMessage("❌ No file path provided.");
                return;
            }

            // ✅ Ensure filePath is a string
            const filePathStr = filePath instanceof Uri ? filePath.fsPath : String(filePath);

            if (!filePathStr.trim()) {
                vscodeWindow.showErrorMessage("❌ No valid file path provided.");
                return;
            }

            try {
                // 🔹 Ensure absolute path resolution
                let absolutePath = path.isAbsolute(filePathStr)
                    ? filePathStr
                    : path.join(workspace.workspaceFolders?.[0]?.uri.fsPath || "", filePathStr);

                if (!fs.existsSync(absolutePath)) {
                    vscodeWindow.showErrorMessage(`❌ File not found: ${absolutePath}`);
                    return;
                }

                const doc = await workspace.openTextDocument(Uri.file(absolutePath));
                await vscodeWindow.showTextDocument(doc);
            } catch (error) {
                vscodeWindow.showErrorMessage(`❌ Failed to open file: ${filePathStr}`);
                console.error(`❌ Error opening file: ${filePathStr}`, error);
            }
        })
    ];
}
