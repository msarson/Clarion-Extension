import { commands, window, workspace, Uri, Disposable } from 'vscode';
import { SolutionCache } from '../SolutionCache';
import { SolutionTreeDataProvider } from '../SolutionTreeDataProvider';
import { ClarionProjectInfo } from 'common/types';
import LoggerManager from '../LoggerManager';
import * as path from 'path';
import * as fs from 'fs';

const logger = LoggerManager.getLogger("ProjectFileCommands");

/**
 * Registers project file management commands (add/remove source files)
 * @param solutionTreeDataProvider - Solution tree data provider (may be undefined)
 * @returns Array of disposables for the registered commands
 */
export function registerProjectFileCommands(
    solutionTreeDataProvider: SolutionTreeDataProvider | undefined
): Disposable[] {
    return [
        commands.registerCommand('clarion.addSourceFile', async (node) => {
            logger.info(`🔄 Executing clarion.addSourceFile command`);
            
            try {
                // Get the project node
                let projectNode = node;
                let projectData: ClarionProjectInfo | null = null;
                
                // If this is a file node or section node, get the parent project node
                if (node && node.parent && node.parent.data && node.parent.data.guid) {
                    // This is a child node, use its parent project
                    projectNode = node.parent;
                }
                
                if (projectNode && projectNode.data && projectNode.data.guid) {
                    projectData = projectNode.data as ClarionProjectInfo;
                }
                
                if (!projectData) {
                    // If no node was provided or it's not a valid project node,
                    // show a quick pick to select a project
                    const solutionCache = SolutionCache.getInstance();
                    const solution = solutionCache.getSolutionInfo();
                    
                    if (!solution || !solution.projects || solution.projects.length === 0) {
                        window.showErrorMessage("No projects available in the current solution.");
                        return;
                    }
                    
                    const projectItems = solution.projects.map(p => ({
                        label: p.name,
                        description: p.path,
                        project: p
                    }));
                    
                    const selectedProject = await window.showQuickPick(projectItems, {
                        placeHolder: "Select a project to add the source file to"
                    });
                    
                    if (!selectedProject) {
                        return; // User cancelled
                    }
                    
                    projectData = selectedProject.project;
                }
                
                // Prompt for the file name
                const fileName = await window.showInputBox({
                    prompt: "Enter the name of the source file to add (e.g., someclwfile.clw)",
                    placeHolder: "someclwfile.clw",
                    validateInput: (value) => {
                        if (!value) {
                            return "File name is required";
                        }
                        if (!value.toLowerCase().endsWith('.clw')) {
                            return "File name must have a .clw extension";
                        }
                        return null; // Valid input
                    }
                });
                
                if (!fileName) {
                    return; // User cancelled
                }
                
                // Add the source file to the project
                const solutionCache = SolutionCache.getInstance();
                const result = await solutionCache.addSourceFile(projectData.guid, fileName);
                
                if (result) {
                    window.showInformationMessage(`Successfully added ${fileName} to project ${projectData.name}.`);
                    
                    // Refresh the solution tree view
                    if (solutionTreeDataProvider) {
                        await solutionTreeDataProvider.refresh();
                    }
                } else {
                    window.showErrorMessage(`Failed to add ${fileName} to project ${projectData.name}.`);
                }
            } catch (error) {
                logger.error(`❌ Error in clarion.addSourceFile command: ${error instanceof Error ? error.message : String(error)}`);
                window.showErrorMessage(`Error adding source file: ${error instanceof Error ? error.message : String(error)}`);
            }
        }),
        
        commands.registerCommand('clarion.removeSourceFile', async (node) => {
            logger.info(`🔄 Executing clarion.removeSourceFile command`);
            
            try {
                // Check if this is a source file node
                if (!node || !node.data || !node.data.name || !node.data.name.toLowerCase().endsWith('.clw')) {
                    window.showErrorMessage("Please select a CLW file to remove.");
                    return;
                }
                
                // Get the parent project node
                if (!node.parent || !node.parent.data || !node.parent.data.guid) {
                    window.showErrorMessage("Cannot determine which project this file belongs to.");
                    return;
                }
                
                const projectData = node.parent.data as ClarionProjectInfo;
                const fileName = node.data.name;
                
                // Confirm with the user
                const confirmation = await window.showWarningMessage(
                    `Are you sure you want to remove ${fileName} from project ${projectData.name}?`,
                    { modal: true },
                    "Yes",
                    "No"
                );
                
                if (confirmation !== "Yes") {
                    return; // User cancelled
                }
                
                // Ask if the user wants to move the file to the Recycle Bin
                const moveToRecycleBin = await window.showWarningMessage(
                    `Do you want to move ${fileName} to the Recycle Bin?`,
                    { modal: true },
                    "Yes",
                    "No"
                );
                
                // Get the solution cache
                const solutionCache = SolutionCache.getInstance();
                
                // First, try to find the file path BEFORE removing it from the project
                let filePath = "";
                
                // Try multiple methods to find the file
                try {
                    // Method 1: Try to find the source file in the project
                    const sourceFile = solutionCache.findSourceInProject(fileName);
                    if (sourceFile && sourceFile.project) {
                        // Get the absolute path using the project's path and relative path
                        const possiblePath = path.join(sourceFile.project.path, sourceFile.relativePath);
                        if (fs.existsSync(possiblePath)) {
                            filePath = possiblePath;
                            logger.info(`✅ Found file using project path: ${filePath}`);
                        }
                    }
                    
                    // Method 2: If not found, try using findFileWithExtension
                    if (!filePath || !fs.existsSync(filePath)) {
                        const resolvedPath = await solutionCache.findFileWithExtension(fileName);
                        if (resolvedPath && resolvedPath.trim() !== "" && fs.existsSync(resolvedPath)) {
                            filePath = resolvedPath;
                            logger.info(`✅ Found file using findFileWithExtension: ${filePath}`);
                        }
                    }
                    
                    logger.info(`🔍 File path resolution result for ${fileName}: ${filePath || 'Not found'}`);
                } catch (pathError) {
                    logger.error(`❌ Error finding file path: ${pathError instanceof Error ? pathError.message : String(pathError)}`);
                }
                
                // Now remove the source file from the project
                const result = await solutionCache.removeSourceFile(projectData.guid, fileName);
                
                if (result) {
                    // If user wants to move the file to the Recycle Bin
                    if (moveToRecycleBin === "Yes" && filePath && fs.existsSync(filePath)) {
                        try {
                            // Use VS Code's workspace.fs.delete API to move the file to the Recycle Bin
                            await workspace.fs.delete(Uri.file(filePath), { useTrash: true });
                            window.showInformationMessage(`Successfully removed ${fileName} from project and moved to Recycle Bin.`);
                        } catch (recycleError) {
                            logger.error(`❌ Error moving file to Recycle Bin: ${recycleError instanceof Error ? recycleError.message : String(recycleError)}`);
                            window.showWarningMessage(`Removed ${fileName} from project but failed to move to Recycle Bin: ${recycleError instanceof Error ? recycleError.message : String(recycleError)}`);
                        }
                    } else if (moveToRecycleBin === "Yes") {
                        window.showWarningMessage(`Removed ${fileName} from project but could not find the file on disk.`);
                    } else {
                        window.showInformationMessage(`Successfully removed ${fileName} from project ${projectData.name}.`);
                    }
                    
                    // Refresh the solution tree view
                    if (solutionTreeDataProvider) {
                        await solutionTreeDataProvider.refresh();
                    }
                } else {
                    window.showErrorMessage(`Failed to remove ${fileName} from project ${projectData.name}.`);
                }
            } catch (error) {
                logger.error(`❌ Error in clarion.removeSourceFile command: ${error instanceof Error ? error.message : String(error)}`);
                window.showErrorMessage(`Error removing source file: ${error instanceof Error ? error.message : String(error)}`);
            }
        })
    ];
}
