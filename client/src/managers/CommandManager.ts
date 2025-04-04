import { ExtensionContext, commands, window as vscodeWindow, workspace, Uri, Range, Disposable } from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import LoggerManager from '../logger';
import { SolutionCache } from '../SolutionCache';
import { ClarionProjectInfo } from 'common/types';
import { getSolutionManager } from './SolutionManager';
import { getViewManager } from './ViewManager';
import { globalSettings } from '../globals';
import { getConfigurationManager } from './ConfigurationManager';
import * as buildTasks from '../buildTasks';

const logger = LoggerManager.getLogger("CommandManager");
logger.setLevel("error");

export class CommandManager {
    /**
     * Register all commands
     * @param context Extension context
     */
    public registerCommands(context: ExtensionContext): void {
        this.registerOpenCommand(context);
        this.registerSolutionCommands(context);
        this.registerSourceFileCommands(context);
        this.registerNavigationCommands(context);
        this.registerBuildCommands(context);
    }

    /**
     * Register open file command
     * @param context Extension context
     */
    private async registerOpenCommand(context: ExtensionContext): Promise<void> {
        const existingCommands = await commands.getCommands();

        if (!existingCommands.includes('clarion.openFile')) {
            context.subscriptions.push(
                commands.registerCommand('clarion.openFile', async (filePath: string | Uri) => {
                    if (!filePath) {
                        vscodeWindow.showErrorMessage("❌ No file path provided.");
                        return;
                    }

                    // Ensure filePath is a string
                    const filePathStr = filePath instanceof Uri ? filePath.fsPath : String(filePath);

                    if (!filePathStr.trim()) {
                        vscodeWindow.showErrorMessage("❌ No valid file path provided.");
                        return;
                    }

                    try {
                        // Ensure absolute path resolution
                        let absolutePath = path.isAbsolute(filePathStr)
                            ? filePathStr
                            : path.join(vscodeWindow.activeTextEditor?.document.uri.fsPath || "", filePathStr);

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
            );
        }
    }

    /**
     * Register solution-related commands
     * @param context Extension context
     */
    private registerSolutionCommands(context: ExtensionContext): void {
        // Helper function to check workspace trust before executing commands
        const withTrustedWorkspace = (callback: () => Promise<void>) => async () => {
            if (!workspace.isTrusted) {
                vscodeWindow.showWarningMessage("Clarion features require a trusted workspace.");
                return;
            }
            await callback();
        };

        // Register commands with workspace trust check
        const solutionManager = getSolutionManager();
        const configManager = getConfigurationManager();
        
        const commandsRequiringTrust = [
            { id: "clarion.openSolution", handler: async () => { vscodeWindow.showInformationMessage("Open solution command not implemented yet"); } },
            { id: "clarion.openSolutionFromList", handler: async () => { vscodeWindow.showInformationMessage("Open solution from list command not implemented yet"); } },
            { id: "clarion.closeSolution", handler: solutionManager.closeClarionSolution.bind(solutionManager, context) },
            { id: "clarion.setConfiguration", handler: configManager.setConfiguration.bind(configManager) },
            { id: "clarion.openSolutionMenu", handler: async () => Promise.resolve() } // Empty handler for the submenu
        ];

        commandsRequiringTrust.forEach(command => {
            context.subscriptions.push(
                commands.registerCommand(command.id, withTrustedWorkspace(command.handler))
            );
        });

        // Register quick open command
        context.subscriptions.push(commands.registerCommand("clarion.quickOpen", async () => {
            if (!workspace.isTrusted) {
                vscodeWindow.showWarningMessage("Clarion features require a trusted workspace.");
                return;
            }

            await this.showClarionQuickOpen();
        }));

        // Register reinitialize solution command
        context.subscriptions.push(
            commands.registerCommand('clarion.reinitializeSolution', async () => {
                logger.info("🔄 Manually reinitializing solution...");
                const solutionManager = getSolutionManager();
                
                try {
                    await solutionManager.initializeSolution(context, true);
                    vscodeWindow.showInformationMessage("Solution reinitialized successfully.");
                } catch (error) {
                    logger.error(`❌ Error reinitializing solution: ${error instanceof Error ? error.message : String(error)}`);
                    vscodeWindow.showErrorMessage("Error reinitializing Clarion solution.");
                }
            })
        );
    }

    /**
     * Register source file commands
     * @param context Extension context
     */
    private registerSourceFileCommands(context: ExtensionContext): void {
        // Add source file command
        context.subscriptions.push(
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
                            vscodeWindow.showErrorMessage("No projects available in the current solution.");
                            return;
                        }
                        
                        const projectItems = solution.projects.map(p => ({
                            label: p.name,
                            description: p.path,
                            project: p
                        }));
                        
                        const selectedProject = await vscodeWindow.showQuickPick(projectItems, {
                            placeHolder: "Select a project to add the source file to"
                        });
                        
                        if (!selectedProject) {
                            return; // User cancelled
                        }
                        
                        projectData = selectedProject.project;
                    }
                    
                    // Prompt for the file name
                    const fileName = await vscodeWindow.showInputBox({
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
                        vscodeWindow.showInformationMessage(`Successfully added ${fileName} to project ${projectData.name}.`);
                        
                        // Refresh the solution tree view
                        const viewManager = getViewManager();
                        const solutionTreeDataProvider = viewManager.getSolutionTreeDataProvider();
                        if (solutionTreeDataProvider) {
                            await solutionTreeDataProvider.refresh();
                        }
                    } else {
                        vscodeWindow.showErrorMessage(`Failed to add ${fileName} to project ${projectData.name}.`);
                    }
                } catch (error) {
                    logger.error(`❌ Error in clarion.addSourceFile command: ${error instanceof Error ? error.message : String(error)}`);
                    vscodeWindow.showErrorMessage(`Error adding source file: ${error instanceof Error ? error.message : String(error)}`);
                }
            })
        );

        // Remove source file command
        context.subscriptions.push(
            commands.registerCommand('clarion.removeSourceFile', async (node) => {
                logger.info(`🔄 Executing clarion.removeSourceFile command`);
                
                try {
                    // Check if this is a source file node
                    if (!node || !node.data || !node.data.name || !node.data.name.toLowerCase().endsWith('.clw')) {
                        vscodeWindow.showErrorMessage("Please select a CLW file to remove.");
                        return;
                    }
                    
                    // Get the parent project node
                    if (!node.parent || !node.parent.data || !node.parent.data.guid) {
                        vscodeWindow.showErrorMessage("Cannot determine which project this file belongs to.");
                        return;
                    }
                    
                    const projectData = node.parent.data as ClarionProjectInfo;
                    const fileName = node.data.name;
                    
                    // Confirm with the user
                    const confirmation = await vscodeWindow.showWarningMessage(
                        `Are you sure you want to remove ${fileName} from project ${projectData.name}?`,
                        { modal: true },
                        "Yes",
                        "No"
                    );
                    
                    if (confirmation !== "Yes") {
                        return; // User cancelled
                    }
                    
                    // Ask if the user wants to move the file to the Recycle Bin
                    const moveToRecycleBin = await vscodeWindow.showWarningMessage(
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
                                vscodeWindow.showInformationMessage(`Successfully removed ${fileName} from project and moved to Recycle Bin.`);
                            } catch (recycleError) {
                                logger.error(`❌ Error moving file to Recycle Bin: ${recycleError instanceof Error ? recycleError.message : String(recycleError)}`);
                                vscodeWindow.showWarningMessage(`Removed ${fileName} from project but failed to move to Recycle Bin: ${recycleError instanceof Error ? recycleError.message : String(recycleError)}`);
                            }
                        } else if (moveToRecycleBin === "Yes") {
                            vscodeWindow.showWarningMessage(`Removed ${fileName} from project but could not find the file on disk.`);
                        } else {
                            vscodeWindow.showInformationMessage(`Successfully removed ${fileName} from project ${projectData.name}.`);
                        }
                        
                        // Refresh the solution tree view
                        const viewManager = getViewManager();
                        const solutionTreeDataProvider = viewManager.getSolutionTreeDataProvider();
                        if (solutionTreeDataProvider) {
                            await solutionTreeDataProvider.refresh();
                        }
                    } else {
                        vscodeWindow.showErrorMessage(`Failed to remove ${fileName} from project ${projectData.name}.`);
                    }
                } catch (error) {
                    logger.error(`❌ Error in clarion.removeSourceFile command: ${error instanceof Error ? error.message : String(error)}`);
                    vscodeWindow.showErrorMessage(`Error removing source file: ${error instanceof Error ? error.message : String(error)}`);
                }
            })
        );
    }

    /**
     * Register navigation commands
     * @param context Extension context
     */
    private registerNavigationCommands(context: ExtensionContext): void {
        // Register the goToSymbol command
        context.subscriptions.push(
            commands.registerCommand('clarion.goToSymbol', (uri: Uri, range: Range) => {
                vscodeWindow.showTextDocument(uri, { selection: range });
            })
        );

        // Add command to navigate to a project in the solution tree
        context.subscriptions.push(
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
                const viewManager = getViewManager();
                const treeView = viewManager.getSolutionTreeView();
                const solutionTreeDataProvider = viewManager.getSolutionTreeDataProvider();
                
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
            })
        );
    }

    /**
     * Register build commands
     * @param context Extension context
     */
    private registerBuildCommands(context: ExtensionContext): void {
        // Add solution build command
        context.subscriptions.push(
            commands.registerCommand('clarion.buildSolution', async () => {
                // Call the existing build function with solution as target
                await this.buildSolutionOrProject("Solution");
            })
        );

        // Add project build command
        context.subscriptions.push(
            commands.registerCommand('clarion.buildProject', async (node) => {
                // The node parameter is passed automatically from the treeview
                if (node && node.data) {
                    // If this is a file node, get the parent project node
                    if (node.data.relativePath && node.parent && node.parent.data && node.parent.data.path) {
                        // This is a file node, use its parent project
                        await this.buildSolutionOrProject("Project", node.parent.data);
                    } else if (node.data.path) {
                        // This is a project node
                        await this.buildSolutionOrProject("Project", node.data);
                    } else {
                        vscodeWindow.showErrorMessage("Cannot determine which project to build.");
                    }
                } else {
                    vscodeWindow.showErrorMessage("Cannot determine which project to build.");
                }
            })
        );
    }

    /**
     * Build a solution or project
     * @param buildTarget The build target (Solution or Project)
     * @param project The project to build (optional)
     */
    private async buildSolutionOrProject(buildTarget: "Solution" | "Project", project?: ClarionProjectInfo): Promise<void> {
        const buildConfig = {
            buildTarget,
            selectedProjectPath: project?.path ?? "",
            projectObject: project
        };

        if (!buildTasks.validateBuildEnvironment()) {
            return;
        }

        // Get solution info from the SolutionCache instead of loading a SolutionParser
        const solutionCache = SolutionCache.getInstance();
        const solutionInfo = solutionCache.getSolutionInfo();

        if (!solutionInfo) {
            // Refresh the solution tree view to show the "Open Solution" button
            const viewManager = getViewManager();
            await viewManager.createSolutionTreeView();
            vscodeWindow.showInformationMessage("No solution is currently open. Use the 'Open Solution' button in the Solution View.");
            return;
        }

        const buildParams = buildTasks.prepareBuildParameters(buildConfig);
        await buildTasks.executeBuildTask(buildParams);
    }

    /**
     * Show the Clarion quick open dialog
     */
    private async showClarionQuickOpen(): Promise<void> {
        if (!workspace.workspaceFolders) {
            vscodeWindow.showWarningMessage("No workspace is open.");
            return;
        }

        const solutionCache = SolutionCache.getInstance();
        const solutionInfo = solutionCache.getSolutionInfo();

        if (!solutionInfo) {
            // Refresh the solution tree view to show the "Open Solution" button
            const viewManager = getViewManager();
            await viewManager.createSolutionTreeView();
            vscodeWindow.showInformationMessage("No solution is currently open. Use the 'Open Solution' button in the Solution View.");
            return;
        }

        // Collect all source files from all projects
        const allFiles: { label: string; description: string; path: string }[] = [];
        const seenFiles = new Set<string>();
        const seenBaseNames = new Set<string>(); // Track base filenames to avoid duplicates

        // Use allowed file extensions from global settings
        const defaultSourceExtensions = [".clw", ".inc", ".equ", ".eq", ".int"];
        const allowedExtensions = [
            ...defaultSourceExtensions,
            ...(globalSettings.fileSearchExtensions || []).map((ext: string) => ext.toLowerCase())
        ];

        logger.info(`🔍 Searching for files with extensions: ${JSON.stringify(allowedExtensions)}`);

        // First add all source files from projects
        for (const project of solutionInfo.projects) {
            for (const sourceFile of project.sourceFiles) {
                const fullPath = path.join(project.path, sourceFile.relativePath || "");
                const baseName = sourceFile.name.toLowerCase();

                if (!seenFiles.has(fullPath)) {
                    seenFiles.add(fullPath);
                    seenBaseNames.add(baseName); // Track the base filename
                    allFiles.push({
                        label: this.getIconForFile(sourceFile.name) + " " + sourceFile.name,
                        description: project.name,
                        path: fullPath
                    });
                }
            }
        }

        // Get search paths from the server for each project and extension
        const searchPaths: string[] = [];

        try {
            logger.info("🔍 Requesting search paths from server...");

            // Request search paths for each project and extension
            for (const project of solutionInfo.projects) {
                for (const ext of allowedExtensions) {
                    const paths = await solutionCache.getSearchPathsFromServer(project.name, ext);
                    if (paths.length > 0) {
                        logger.info(`✅ Received ${paths.length} search paths for ${project.name} and ${ext}`);
                        searchPaths.push(...paths);
                    }
                }
            }
        } catch (error) {
            logger.error(`❌ Error requesting search paths: ${error instanceof Error ? error.message : String(error)}`);
        }

        // Remove duplicates from search paths
        const uniqueSearchPaths = [...new Set(searchPaths)];
        logger.info(`📂 Using search paths: ${JSON.stringify(uniqueSearchPaths)}`);

        // Add files from the solution directory
        const solutionDir = path.dirname(solutionInfo.path);
        const additionalFiles = this.listFilesRecursively(solutionDir)
            .filter(file => {
                const ext = path.extname(file).toLowerCase();
                return allowedExtensions.includes(ext);
            })
            .map(file => {
                const relativePath = path.relative(solutionDir, file);
                const filePath = file;

                const baseName = path.basename(file).toLowerCase();
                if (!seenFiles.has(filePath) && !seenBaseNames.has(baseName)) {
                    seenFiles.add(filePath);
                    seenBaseNames.add(baseName); // Add to seenBaseNames set
                    return {
                        label: this.getIconForFile(file) + " " + path.basename(file),
                        description: relativePath,
                        path: filePath
                    };
                }
                return null;
            })
            .filter(item => item !== null) as { label: string; description: string; path: string }[];

        // Combine and sort all files
        const combinedFiles = [...allFiles, ...additionalFiles]
            .sort((a, b) => a.label.localeCompare(b.label));

        // Show quick pick
        const selectedFile = await vscodeWindow.showQuickPick(combinedFiles, {
            placeHolder: "Select a Clarion file to open",
        });

        if (selectedFile) {
            try {
                const doc = await workspace.openTextDocument(selectedFile.path);
                await vscodeWindow.showTextDocument(doc);
            } catch (error) {
                vscodeWindow.showErrorMessage(`Failed to open file: ${selectedFile.path}`);
            }
        }
    }

    /**
     * List files recursively in a directory
     * @param dir The directory to list files from
     * @returns Array of file paths
     */
    private listFilesRecursively(dir: string): string[] {
        const files: string[] = [];

        try {
            const entries = fs.readdirSync(dir, { withFileTypes: true });

            for (const entry of entries) {
                const fullPath = path.join(dir, entry.name);

                if (entry.isDirectory()) {
                    // Skip certain directories
                    if (!['node_modules', '.git', 'bin', 'obj'].includes(entry.name)) {
                        files.push(...this.listFilesRecursively(fullPath));
                    }
                } else {
                    files.push(fullPath);
                }
            }
        } catch (error) {
            logger.error(`Error reading directory ${dir}:`, error);
        }

        return files;
    }

    /**
     * Get an icon for a file based on its extension
     * @param fileExt The file extension
     * @returns The icon string
     */
    private getIconForFile(fileExt: string): string {
        const ext = path.extname(fileExt).toLowerCase();

        switch (ext) {
            case '.clw': return '$(file-code)';
            case '.inc': return '$(file-submodule)';
            case '.equ':
            case '.eq': return '$(symbol-constant)';
            case '.int': return '$(symbol-interface)';
            default: return '$(file)';
        }
    }
}

// Singleton instance
let instance: CommandManager | undefined;

/**
 * Get the CommandManager instance
 * @returns The CommandManager instance
 */
export function getCommandManager(): CommandManager {
    if (!instance) {
        instance = new CommandManager();
    }
    return instance;
}