﻿import { commands, Uri, window, ExtensionContext, TreeView, workspace, Disposable, languages, ConfigurationTarget, TextDocument, TextEditor, window as vscodeWindow, Diagnostic, DiagnosticSeverity, Range, StatusBarItem, StatusBarAlignment, extensions, DiagnosticCollection } from 'vscode';
import { LanguageClient, LanguageClientOptions, ServerOptions, TransportKind, ErrorAction, CloseAction } from 'vscode-languageclient/node';

import * as path from 'path';
import * as fs from 'fs';

import { ClarionExtensionCommands } from './ClarionExtensionCommands';
import { ClarionHoverProvider } from './providers/hoverProvider';
import { ClarionDocumentLinkProvider } from './providers/documentLinkProvier';
import { ClarionImplementationProvider } from './providers/implementationProvider';
import { ClarionDefinitionProvider } from './providers/definitionProvider';
import { DocumentManager } from './documentManager';
import { ClarionDecorator } from './ClarionDecorator';

import { SolutionTreeDataProvider } from './SolutionTreeDataProvider';
import { StructureViewProvider } from './StructureViewProvider';
import { StatusViewProvider } from './StatusViewProvider';
import { TreeNode } from './TreeNode';
import { globalClarionPropertiesFile, globalClarionVersion, globalSettings, globalSolutionFile, setGlobalClarionSelection, ClarionSolutionSettings } from './globals';
import * as buildTasks from './buildTasks';
import LoggerManager from './logger';
import { SolutionCache } from './SolutionCache';
import { LanguageClientManager, isClientReady, getClientReadyPromise, setLanguageClient } from './LanguageClientManager';
import { redirectionService } from './paths/RedirectionService';

import { ClarionProjectInfo } from 'common/types';

const logger = LoggerManager.getLogger("Extension");
logger.setLevel("error");
let client: LanguageClient | undefined;
// clientReady is now managed by LanguageClientManager
let treeView: TreeView<TreeNode> | undefined;
let solutionTreeDataProvider: SolutionTreeDataProvider | undefined;
let structureViewProvider: StructureViewProvider | undefined;
let structureView: TreeView<any> | undefined;
let statusViewProvider: StatusViewProvider | undefined;
let statusView: TreeView<any> | undefined;
let documentManager: DocumentManager | undefined;

let configStatusBarItem: StatusBarItem;
let buildProjectStatusBarItem: StatusBarItem;

export async function updateConfigurationStatusBar(configuration: string) {
    if (!configStatusBarItem) {
        configStatusBarItem = window.createStatusBarItem(StatusBarAlignment.Left, 100);
        configStatusBarItem.command = 'clarion.setConfiguration'; // ✅ Clicking will open the config picker
    }

    configStatusBarItem.text = `$(gear) Clarion: ${configuration}`;
    configStatusBarItem.tooltip = "Click to change Clarion configuration";
    configStatusBarItem.show();

    // ✅ Ensure the setting is updated
    const currentConfig = workspace.getConfiguration().get<string>("clarion.configuration");

    if (currentConfig !== configuration) {
        logger.info(`🔄 Updating workspace configuration: clarion.configuration = ${configuration}`);
        await workspace.getConfiguration().update("clarion.configuration", configuration, ConfigurationTarget.Workspace);
    }
}

export async function updateBuildProjectStatusBar() {
    // Only proceed if we have a solution open
    if (!globalSolutionFile) {
        if (buildProjectStatusBarItem) {
            buildProjectStatusBarItem.hide();
        }
        return;
    }

    // Check if there's an active editor
    const activeEditor = window.activeTextEditor;
    if (!activeEditor) {
        if (buildProjectStatusBarItem) {
            buildProjectStatusBarItem.hide();
        }
        return;
    }

    // Get the file path of the active editor
    const filePath = activeEditor.document.uri.fsPath;
    
    // Get the SolutionCache instance
    const solutionCache = SolutionCache.getInstance();
    
    // Find all projects the file belongs to
    const projects = solutionCache.findProjectsForFile(filePath);
    
    // Create the status bar item if it doesn't exist
    if (!buildProjectStatusBarItem) {
        buildProjectStatusBarItem = window.createStatusBarItem(StatusBarAlignment.Left, 99); // Position it to the right of the configuration status bar
        buildProjectStatusBarItem.command = 'clarion.buildCurrentProject';
    }
    
    if (projects.length === 1) {
        // If we found exactly one project, show "Build [project name]"
        buildProjectStatusBarItem.text = `$(play) Build ${projects[0].name}`;
        buildProjectStatusBarItem.tooltip = `Build project ${projects[0].name}`;
        buildProjectStatusBarItem.show();
    } else if (projects.length > 1) {
        // If the file is in multiple projects, show "Build (Multiple Projects...)"
        buildProjectStatusBarItem.text = `$(play) Build (Multiple Projects...)`;
        buildProjectStatusBarItem.tooltip = `File is in multiple projects. Click to select which to build.`;
        buildProjectStatusBarItem.show();
    } else {
        // If no project was found, show "Build Solution" instead
        buildProjectStatusBarItem.text = `$(play) Build Solution`;
        buildProjectStatusBarItem.tooltip = `Build the entire solution`;
        buildProjectStatusBarItem.show();
    }
}


// Helper function to escape special characters in file paths for RegExp
function escapeRegExp(string: string): string {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Create file watchers for solution-specific files
async function createSolutionFileWatchers(context: ExtensionContext) {
    // Dispose any existing watchers
    const fileWatchers = context.subscriptions.filter(d => (d as any)._isFileWatcher);
    for (const watcher of fileWatchers) {
        watcher.dispose();
    }

    if (!globalSolutionFile) {
        logger.warn("⚠️ No solution file set, skipping file watcher creation");
        return;
    }

    const solutionDir = path.dirname(globalSolutionFile);
    logger.info(`🔍 Creating file watchers for solution directory: ${solutionDir}`);

    // Create watchers for the solution file itself
    const solutionWatcher = workspace.createFileSystemWatcher(globalSolutionFile);

    // Mark as a file watcher for cleanup
    (solutionWatcher as any)._isFileWatcher = true;

    solutionWatcher.onDidChange(async (uri) => {
        logger.info(`🔄 Solution file changed: ${uri.fsPath}`);
        await handleSolutionFileChange(context);
    });

    context.subscriptions.push(solutionWatcher);

    // Get the solution cache to access project information
    const solutionCache = SolutionCache.getInstance();
    const solutionInfo = solutionCache.getSolutionInfo();

    if (solutionInfo && solutionInfo.projects) {
        // Create watchers for each project file
        for (const project of solutionInfo.projects) {
            const projectFilePath = path.join(project.path, `${project.name}.cwproj`);

            if (fs.existsSync(projectFilePath)) {
                const projectWatcher = workspace.createFileSystemWatcher(projectFilePath);

                // Mark as a file watcher for cleanup
                (projectWatcher as any)._isFileWatcher = true;

                projectWatcher.onDidChange(async (uri) => {
                    logger.info(`🔄 Project file changed: ${uri.fsPath}`);
                    await handleProjectFileChange(context, uri);
                });

                context.subscriptions.push(projectWatcher);
                logger.info(`✅ Added watcher for project file: ${projectFilePath}`);
            }

            // Create watchers for redirection files in this project
            const projectRedFile = path.join(project.path, globalSettings.redirectionFile);

            if (fs.existsSync(projectRedFile)) {
                const redFileWatcher = workspace.createFileSystemWatcher(projectRedFile);

                // Mark as a file watcher for cleanup
                (redFileWatcher as any)._isFileWatcher = true;

                redFileWatcher.onDidChange(async (uri) => {
                    logger.info(`🔄 Redirection file changed: ${uri.fsPath}`);
                    await handleRedirectionFileChange(context);
                });

                context.subscriptions.push(redFileWatcher);
                logger.info(`✅ Added watcher for redirection file: ${projectRedFile}`);

                // Get included redirection files from the server
                try {
                    // Get the solution cache to access the server
                    const solutionCache = SolutionCache.getInstance();

                    // Get included redirection files from the server
                    const includedRedFiles = await solutionCache.getIncludedRedirectionFilesFromServer(project.path);

                    // Create watchers for each included redirection file
                    for (const redFile of includedRedFiles) {
                        if (redFile !== projectRedFile && fs.existsSync(redFile)) {
                            const includedRedWatcher = workspace.createFileSystemWatcher(redFile);

                            // Mark as a file watcher for cleanup
                            (includedRedWatcher as any)._isFileWatcher = true;

                            includedRedWatcher.onDidChange(async (uri) => {
                                logger.info(`🔄 Included redirection file changed: ${uri.fsPath}`);
                                await handleRedirectionFileChange(context);
                            });

                            context.subscriptions.push(includedRedWatcher);
                            logger.info(`✅ Added watcher for included redirection file: ${redFile}`);
                        }
                    }
                } catch (error) {
                    logger.error(`❌ Error getting included redirection files for ${projectRedFile}: ${error instanceof Error ? error.message : String(error)}`);
                }
            }
        }
    }

    // Also watch the global redirection file if it exists
    const globalRedFile = path.join(globalSettings.redirectionPath, globalSettings.redirectionFile);

    if (fs.existsSync(globalRedFile)) {
        const globalRedWatcher = workspace.createFileSystemWatcher(globalRedFile);

        // Mark as a file watcher for cleanup
        (globalRedWatcher as any)._isFileWatcher = true;

        globalRedWatcher.onDidChange(async (uri) => {
            logger.info(`🔄 Global redirection file changed: ${uri.fsPath}`);
            await handleRedirectionFileChange(context);
        });

        context.subscriptions.push(globalRedWatcher);
        logger.info(`✅ Added watcher for global redirection file: ${globalRedFile}`);
    }
}

export async function activate(context: ExtensionContext): Promise<void> {
    const disposables: Disposable[] = [];
    const isRefreshingRef = { value: false };
    const diagnosticCollection = languages.createDiagnosticCollection("clarion");
    context.subscriptions.push(diagnosticCollection);
    logger.info("🔄 Activating Clarion extension...");
    
    // Check if fushnisoft.clarion extension is installed
    const fushinsoftExtension = extensions.getExtension('fushnisoft.clarion');
    if (fushinsoftExtension) {
        const hasShownFushinsoftMessage = context.globalState.get<boolean>('clarion.hasShownFushinsoftMessage', false);
        
        if (!hasShownFushinsoftMessage) {
            const action = await window.showInformationMessage(
                "The fushnisoft.clarion extension is no longer needed. All syntax highlighting and language features are now included in Clarion Extensions. Would you like to uninstall it?",
                "Uninstall fushnisoft.clarion",
                "Keep Both",
                "Don't Show Again"
            );
            
            if (action === "Uninstall fushnisoft.clarion") {
                try {
                    await commands.executeCommand('workbench.extensions.uninstallExtension', 'fushnisoft.clarion');
                    window.showInformationMessage("fushnisoft.clarion has been uninstalled. Please reload VS Code for changes to take effect.", "Reload Now").then(selection => {
                        if (selection === "Reload Now") {
                            commands.executeCommand('workbench.action.reloadWindow');
                        }
                    });
                } catch (error) {
                    logger.error("Failed to uninstall fushnisoft.clarion", error);
                    window.showWarningMessage("Could not automatically uninstall fushnisoft.clarion. Please uninstall it manually from the Extensions view.");
                }
            }
            // Mark as shown regardless of action to avoid nagging
            await context.globalState.update('clarion.hasShownFushinsoftMessage', true);
        }
    }
    
    // Add event listener for active editor changes to update the build status bar
    context.subscriptions.push(
        window.onDidChangeActiveTextEditor(() => {
            updateBuildProjectStatusBar();
        })
    );

    // Check for open XML files to avoid conflicts with redhat.vscode-xml extension
    const openXmlFiles = workspace.textDocuments.filter(doc =>
        doc.languageId === 'xml' || doc.fileName.toLowerCase().endsWith('.xml')
    );
    
    if (openXmlFiles.length > 0) {
        logger.warn(`⚠️ Found ${openXmlFiles.length} open XML files. This may cause conflicts with the XML extension.`);
        logger.warn("⚠️ Consider closing XML files before using Clarion features to avoid conflicts.");
        // We'll still continue activation, but with a longer delay to allow XML extension to initialize
    }

    // Icons are already in the images directory
    logger.info("✅ Using SVG icons from images directory");

    // ✅ Always start the language server for basic features (symbols, folding, formatting)
    if (!client) {
        logger.info("🚀 Starting Clarion Language Server...");
        // Use a longer delay if XML files are open
        await startClientServer(context, openXmlFiles.length > 0);
    }

    // ✅ Check workspace and trust status
    const hasWorkspace = !!workspace.workspaceFolders;
    const isTrusted = workspace.isTrusted;

    // ✅ Show one-time notification if no workspace (use context.globalState to track)
    if (!hasWorkspace) {
        const hasShownNoWorkspaceMessage = context.globalState.get<boolean>('clarion.hasShownNoWorkspaceMessage', false);
        
        if (!hasShownNoWorkspaceMessage) {
            logger.info("ℹ️ No workspace detected. Basic features enabled (symbols, folding, hover). Full features require a saved workspace.");
            
            const action = await window.showInformationMessage(
                "Clarion: Basic features enabled. Save a workspace for solution management and enhanced navigation.",
                "Save Workspace",
                "Don't Show Again"
            );
            
            if (action === "Save Workspace") {
                await commands.executeCommand('workbench.action.files.saveWorkspaceAs');
            } else if (action === "Don't Show Again") {
                await context.globalState.update('clarion.hasShownNoWorkspaceMessage', true);
            }
        }
        
        // Continue with limited activation - don't return here
        logger.info("📝 Operating in no-workspace mode: basic language features available");
    }

    // ✅ Early exit only if workspace exists but isn't trusted
    if (hasWorkspace && !isTrusted) {
        logger.warn("⚠️ Workspace is not trusted. Clarion features will remain disabled until trust is granted.");
        window.showWarningMessage("Clarion extension requires workspace trust to enable features.");
        return; // ⛔ Exit early only for untrusted workspace
    }

    // ✅ Load workspace settings if we have a workspace
    if (hasWorkspace) {
        await globalSettings.initializeFromWorkspace();
        
        // Log the current state of global variables after loading workspace settings
        logger.info(`🔍 Global settings state after loading workspace settings:
            - globalSolutionFile: ${globalSolutionFile || 'not set'}
            - globalClarionPropertiesFile: ${globalClarionPropertiesFile || 'not set'}
            - globalClarionVersion: ${globalClarionVersion || 'not set'}`);
    } else {
        logger.info("ℹ️ Skipping workspace settings - no workspace available");
    }

    // ✅ Register basic commands that work without workspace
    registerOpenCommand(context);

    context.subscriptions.push(commands.registerCommand("clarion.quickOpen", async () => {
        if (!hasWorkspace) {
            window.showInformationMessage("This feature requires a saved workspace. Use File → Save Workspace As...");
            return;
        }
        if (!isTrusted) {
            window.showWarningMessage("Clarion features require a trusted workspace.");
            return;
        }

        await showClarionQuickOpen();
    }));

    // Helper function to check workspace and trust before executing commands
    const withWorkspaceAndTrust = (callback: () => Promise<void>) => async () => {
        if (!hasWorkspace) {
            window.showInformationMessage("This feature requires a saved workspace. Use File → Save Workspace As...");
            return;
        }
        if (!isTrusted) {
            window.showWarningMessage("Clarion features require a trusted workspace.");
            return;
        }
        await callback();
    };

    // Register workspace-dependent commands
    const commandsRequiringWorkspace = [
        { id: "clarion.openSolution", handler: openClarionSolution.bind(null, context) },
        { id: "clarion.openSolutionFromList", handler: openSolutionFromList.bind(null, context) },
        { id: "clarion.closeSolution", handler: closeClarionSolution.bind(null, context) },
        { id: "clarion.setConfiguration", handler: setConfiguration },
        { id: "clarion.openSolutionMenu", handler: async () => Promise.resolve() } // Empty handler for the submenu
    ];

    commandsRequiringWorkspace.forEach(command => {
        context.subscriptions.push(
            commands.registerCommand(command.id, withWorkspaceAndTrust(command.handler))
        );
    });

    // ✅ Only setup workspace-dependent features if we have a workspace
    if (hasWorkspace && isTrusted) {
        // ✅ Watch for changes in Clarion configuration settings
        context.subscriptions.push(
            workspace.onDidChangeConfiguration(async (event) => {
                if (event.affectsConfiguration("clarion.defaultLookupExtensions") || event.affectsConfiguration("clarion.configuration")) {
                    logger.info("🔄 Clarion configuration changed. Refreshing the solution cache...");
                    await handleSettingsChange(context);
                }
            })
        );

        // Create the file watchers initially
        if (globalSolutionFile) {
            await createSolutionFileWatchers(context);
        }

        // Re-create file watchers when the solution changes
        context.subscriptions.push(
            workspace.onDidChangeConfiguration(async (event) => {
                if (event.affectsConfiguration("clarion.redirectionFile") ||
                    event.affectsConfiguration("clarion.redirectionPath")) {
                    logger.info("🔄 Redirection settings changed. Recreating file watchers...");
                    await createSolutionFileWatchers(context);
                }
            })
        );

        // ✅ Ensure all restored tabs are properly indexed (workspace with trust)
        if (!isRefreshingRef.value) {
            await refreshOpenDocuments();

            // Check if we have a solution file loaded from workspace settings
            if (globalSolutionFile) {
                logger.info(`✅ Solution file found in workspace settings: ${globalSolutionFile}`);
                
                // Wait for the language client to be ready before initializing the solution
                if (client) {
                    logger.info("⏳ Waiting for language client to be ready before initializing solution...");
                    
                    if (isClientReady()) {
                        logger.info("✅ Language client is already ready. Proceeding with solution initialization...");
                        await workspaceHasBeenTrusted(context, disposables);
                    } else {
                        // Use the LanguageClientManager's readyPromise
                        getClientReadyPromise().then(async () => {
                            logger.info("✅ Language client is ready. Proceeding with solution initialization...");
                            await workspaceHasBeenTrusted(context, disposables);
                        }).catch(error => {
                            logger.error(`❌ Error waiting for language client: ${error instanceof Error ? error.message : String(error)}`);
                            vscodeWindow.showErrorMessage("Error initializing Clarion solution: Language client failed to start.");
                        });
                    }
                } else {
                    logger.error("❌ Language client is not available.");
                    vscodeWindow.showErrorMessage("Error initializing Clarion solution: Language client is not available.");
                }
            } else {
                logger.warn("⚠️ No solution file found in workspace settings.");
            }
        }
    } else {
        // No workspace - log that advanced features are disabled
        logger.info("ℹ️ Advanced features disabled: no workspace or workspace not trusted");
    }

    // ✅ ALWAYS create the views (they work without workspace)
    // Initialize the solution open context variable
    await commands.executeCommand("setContext", "clarion.solutionOpen", hasWorkspace && !!globalSolutionFile);
    
    // Always create the solution tree view (shows "Open Solution" button when no solution)
    await createSolutionTreeView(context);
    
    // Always create the structure view (shows document outline, works without workspace)
    await createStructureView(context);
    
    // Always create the status view (shows extension status and diagnostics)
    await createStatusView(context);

    context.subscriptions.push(...disposables);

    // Register the commands programmatically to avoid conflicts with other extensions
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
    );



    context.subscriptions.push(
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
        
        // Add solution build command
        // commands.registerCommand('clarion.buildSolution', async () => {
        //     // Call the existing build function with solution as target
        //     await buildSolutionOrProject("Solution", undefined, diagnosticCollection);
        // }),
        commands.registerCommand("clarion.buildSolution", async () => {
            await buildTasks.runClarionBuild();//"Solution", diagnosticCollection);
        }),
        // Add project build command
        commands.registerCommand('clarion.buildProject', async (node) => {
            // The node parameter is passed automatically from the treeview
            if (node && node.data) {
                // If this is a file node, get the parent project node
                if (node.data.relativePath && node.parent && node.parent.data && node.parent.data.path) {
                    // This is a file node, use its parent project
                    await buildSolutionOrProject("Project", node.parent.data, diagnosticCollection);
                } else if (node.data.path) {
                    // This is a project node
                    await buildSolutionOrProject("Project", node.data, diagnosticCollection);
                } else {
                    window.showErrorMessage("Cannot determine which project to build.");
                }
            } else {
                window.showErrorMessage("Cannot determine which project to build.");
            }
        }),

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
                await buildSolutionOrProject("Project", projects[0], diagnosticCollection);
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
                    await buildSolutionOrProject("Solution", undefined, diagnosticCollection);
                } else {
                    // Extract project name from the selected option
                    const projectName = selectedOption.replace("Build Project: ", "");
                    const selectedProject = projects.find(p => p.name === projectName);
                    
                    if (selectedProject) {
                        await buildSolutionOrProject("Project", selectedProject, diagnosticCollection);
                    } else {
                        vscodeWindow.showErrorMessage(`Project ${projectName} not found.`);
                    }
                }
            } else {
                // Build the entire solution if no project is found
                await buildSolutionOrProject("Solution", undefined, diagnosticCollection);
            }
        }),

        // Commands for adding/removing source files are already registered above
    );
}

async function workspaceHasBeenTrusted(context: ExtensionContext, disposables: Disposable[]): Promise<void> {
    logger.info("✅ Workspace has been trusted or refreshed. Initializing...");

    // Read solution file directly from workspace settings first
    const solutionFileFromSettings = workspace.getConfiguration().get<string>("clarion.solutionFile", "");
    logger.info(`🔍 Solution file from workspace settings: ${solutionFileFromSettings || 'not set'}`);

    // Load settings from workspace.json
    await globalSettings.initialize();
    await globalSettings.initializeFromWorkspace();
    
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
        
        // If properties file or version is missing, try to set defaults
        if (!globalClarionPropertiesFile || !globalClarionVersion) {
            logger.warn("⚠️ Missing Clarion properties file or version. Attempting to use defaults...");
            
            // Try to find a default properties file if not set
            if (!globalClarionPropertiesFile) {
                const defaultPropertiesPath = path.join(process.env.APPDATA || '', 'SoftVelocity', 'Clarion', 'ClarionProperties.xml');
                if (fs.existsSync(defaultPropertiesPath)) {
                    logger.info(`✅ Using default properties file: ${defaultPropertiesPath}`);
                    await workspace.getConfiguration().update('clarion.propertiesFile', defaultPropertiesPath, ConfigurationTarget.Workspace);
                    
                    // Use the setGlobalClarionSelection function to update the global variables
                    await setGlobalClarionSelection(
                        globalSolutionFile,
                        defaultPropertiesPath,
                        globalClarionVersion || "Clarion11",
                        globalSettings.configuration
                    );
                }
            }
            
            // Set a default version if not set
            if (!globalClarionVersion) {
                const defaultVersion = "Clarion11";
                logger.info(`✅ Using default Clarion version: ${defaultVersion}`);
                await workspace.getConfiguration().update('clarion.version', defaultVersion, ConfigurationTarget.Workspace);
                
                // Use the setGlobalClarionSelection function to update the global variables
                await setGlobalClarionSelection(
                    globalSolutionFile,
                    globalClarionPropertiesFile,
                    defaultVersion,
                    globalSettings.configuration
                );
            }
        }
        
        // Try to initialize even if some settings are missing
        try {
            logger.info("✅ Attempting to initialize Clarion Solution...");
            await initializeSolution(context);
            
            // ✅ Register language features NOW
            registerLanguageFeatures(context);
        } catch (error) {
            logger.error(`❌ Error initializing solution: ${error instanceof Error ? error.message : String(error)}`);
            vscodeWindow.showErrorMessage(`Error initializing Clarion solution. Try using the "Reinitialize Solution" command.`);
        }
    } else {
        logger.warn("⚠️ No solution file found in settings.");
        // Don't show the information message as the solution view will now show an "Open Solution" button
        
        // Make sure the solution tree view is created
        await createSolutionTreeView();
    }
}

async function initializeSolution(context: ExtensionContext, refreshDocs: boolean = false): Promise<void> {
    logger.info("🔄 Initializing Clarion Solution...");

    if (!globalSolutionFile || !globalClarionPropertiesFile || !globalClarionVersion) {
        logger.warn("⚠️ Missing required settings (solution file, properties file, or version). Initialization aborted.");
        return;
    }

    // ✅ Get configurations from the solution file
    const solutionFileContent = fs.readFileSync(globalSolutionFile, 'utf-8');
    const availableConfigs = extractConfigurationsFromSolution(solutionFileContent);

    // ✅ Step 2: Validate the stored configuration
    if (!availableConfigs.includes(globalSettings.configuration)) {
        logger.warn(`⚠️ Invalid configuration detected: ${globalSettings.configuration}. Asking user to select a valid one.`);

        // ✅ Step 3: Prompt user to select a valid configuration
        const selectedConfig = await vscodeWindow.showQuickPick(availableConfigs, {
            placeHolder: "Invalid configuration detected. Select a valid configuration:",
        });

        if (!selectedConfig) {
            vscodeWindow.showWarningMessage("No valid configuration selected. Using 'Debug' as a fallback.");
            globalSettings.configuration = "Debug"; // ⬅️ Safe fallback
        } else {
            globalSettings.configuration = selectedConfig;
        }

        // ✅ Save the new selection
        await workspace.getConfiguration().update("clarion.configuration", globalSettings.configuration, ConfigurationTarget.Workspace);
        logger.info(`✅ Updated configuration: ${globalSettings.configuration}`);
    }
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
            defaultLookupExtensions: globalSettings.defaultLookupExtensions // Add default lookup extensions
        });
        logger.info("✅ Clarion paths/config/version sent to the language server.");
    } else {
        logger.error("❌ Language client is not available.");
        vscodeWindow.showErrorMessage("Error initializing Clarion solution: Language client is not available.");
        return;
    }
    const startTime = performance.now();
    logger.info("🔄 Initializing solution environment...");
    
    // ✅ Continue initializing the solution cache and document manager
    documentManager = await reinitializeEnvironment(refreshDocs);
    logger.info("✅ Environment initialized");
    
    await createSolutionTreeView(context);
    logger.info("✅ Solution tree view created");
    
    registerLanguageFeatures(context);
    logger.info("✅ Language features registered");
    
    await commands.executeCommand("setContext", "clarion.solutionOpen", true);
    statusViewProvider?.refresh(); // Refresh status view when solution opens
    updateConfigurationStatusBar(globalSettings.configuration);
    updateBuildProjectStatusBar(); // Update the build project status bar
    
    // Create file watchers for the solution, project, and redirection files
    await createSolutionFileWatchers(context);
    logger.info("✅ File watchers created");
    
    // Force refresh all open documents to ensure links are generated
    await refreshOpenDocuments();
    logger.info("✅ Open documents refreshed");
    
    const endTime = performance.now();
    logger.info(`✅ Solution initialization completed in ${(endTime - startTime).toFixed(2)}ms`);
    
    vscodeWindow.showInformationMessage(`Clarion Solution Loaded: ${path.basename(globalSolutionFile)}`);
}

async function reinitializeEnvironment(refreshDocs: boolean = false): Promise<DocumentManager> {
    const startTime = performance.now();
    logger.info("🔄 Initializing SolutionCache and DocumentManager...");

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
        const result = await solutionCache.initialize(globalSolutionFile);
        const cacheEndTime = performance.now();
        logger.info(`✅ SolutionCache initialized in ${(cacheEndTime - cacheStartTime).toFixed(2)}ms (${result ? 'success' : 'failed'})`);
        
        // If initialization failed or returned empty solution, force a refresh from server
        if (!result) {
            logger.warn("⚠️ Solution cache initialization failed. Forcing refresh from server...");
            const refreshStartTime = performance.now();
            const refreshResult = await solutionCache.refresh(true);
            const refreshEndTime = performance.now();
            logger.info(`✅ SolutionCache force refreshed in ${(refreshEndTime - refreshStartTime).toFixed(2)}ms (${refreshResult ? 'success' : 'failed'})`);
            
            if (!refreshResult) {
                logger.error("❌ Failed to refresh solution cache from server. Solution features may not work correctly.");
            }
        }
    } else {
        logger.warn("⚠️ No solution file path available. SolutionCache will not be initialized.");
    }
    
    // Mark activation as complete in SolutionCache
    solutionCache.markActivationComplete();
    logger.info("✅ Marked activation as complete in SolutionCache");

    if (documentManager) {
        logger.info("🔄 Disposing of existing DocumentManager instance...");
        documentManager.dispose();
        documentManager = undefined;
    }

    // Create a new DocumentManager (no longer needs SolutionParser)
    const dmStartTime = performance.now();
    documentManager = await DocumentManager.create();
    const dmEndTime = performance.now();
    logger.info(`✅ DocumentManager created in ${(dmEndTime - dmStartTime).toFixed(2)}ms`);

    if (refreshDocs) {
        logger.info("🔄 Refreshing open documents...");
        await refreshOpenDocuments();
    }

    const endTime = performance.now();
    logger.info(`✅ Environment reinitialized in ${(endTime - startTime).toFixed(2)}ms`);
    return documentManager;
}

/**
 * Retrieves all open documents across all tab groups.
 * If a document is not tracked in `workspace.textDocuments`, it forces VS Code to load it.
 */
export async function getAllOpenDocuments(): Promise<TextDocument[]> {
    const openDocuments: TextDocument[] = [];

    if ("tabGroups" in window) {
        logger.info("✅ Using `window.tabGroups.all` to fetch open tabs.");

        const tabGroups = (window as any).tabGroups.all;

        for (const group of tabGroups) {
            for (const tab of group.tabs) {
                if (tab.input && "uri" in tab.input) {
                    const documentUri = (tab.input as any).uri as Uri;

                    // Check if this is a file URI (not a settings or other special URI)
                    if (documentUri.scheme === 'file') {
                        let doc = workspace.textDocuments.find(d => d.uri.toString() === documentUri.toString());

                        if (!doc) {
                            try {
                                doc = await workspace.openTextDocument(documentUri);
                            } catch (error) {
                                logger.error(`❌ Failed to open document: ${documentUri.fsPath}`, error);
                            }
                        }

                        if (doc) {
                            openDocuments.push(doc);
                            logger.info(`📄 Added document to open list: ${documentUri.fsPath}`);
                        }
                    } else {
                        logger.info(`⚠️ Skipping non-file URI: ${documentUri.toString()}`);
                    }
                } else {
                    logger.warn("⚠️ Tab does not contain a valid document URI:", tab);
                }
            }
        }
    } else {
        logger.warn("⚠️ `tabGroups` API not available, falling back to `visibleTextEditors`.");
        return vscodeWindow.visibleTextEditors.map((editor: TextEditor) => editor.document);
    }

    logger.info(`🔍 Found ${openDocuments.length} open documents.`);
    return openDocuments;
}

/**
 * Handles changes to redirection files (.red)
 * Refreshes the solution cache and updates the UI
 */
async function handleRedirectionFileChange(context: ExtensionContext) {
    logger.info("🔄 Redirection file changed. Refreshing environment...");

    // Clear the redirection service cache
    redirectionService.clearCache();
    logger.info("✅ Redirection service cache cleared");

    // Reinitialize the Solution Cache and Document Manager
    await reinitializeEnvironment(true);

    // Refresh the solution tree view
    await createSolutionTreeView(context);

    // Re-register language features
    registerLanguageFeatures(context);

    vscodeWindow.showInformationMessage("Redirection file updated. Solution cache refreshed.");
}

/**
 * Handles changes to solution files (.sln)
 * Refreshes the solution cache and updates the UI
 */
async function handleSolutionFileChange(context: ExtensionContext) {
    logger.info("🔄 Solution file changed. Refreshing environment...");

    // If the current solution file is the one that changed, refresh it
    if (globalSolutionFile) {
        // Reinitialize the Solution Cache and Document Manager
        await reinitializeEnvironment(true);

        // Refresh the solution tree view
        await createSolutionTreeView(context);

        // Re-register language features
        registerLanguageFeatures(context);

        vscodeWindow.showInformationMessage("Solution file updated. Solution cache refreshed.");
    }
}

/**
 * Handles changes to project files (.cwproj)
 * Refreshes the solution cache and updates the UI
 */
async function handleProjectFileChange(context: ExtensionContext, uri: Uri) {
    logger.info(`🔄 Project file changed: ${uri.fsPath}. Refreshing environment...`);

    // Reinitialize the Solution Cache and Document Manager
    await reinitializeEnvironment(true);

    // Refresh the solution tree view
    await createSolutionTreeView(context);

    // Re-register language features
    registerLanguageFeatures(context);

    vscodeWindow.showInformationMessage("Project file updated. Solution cache refreshed.");
}

async function handleSettingsChange(context: ExtensionContext) {
    logger.info("🔄 Updating settings from workspace...");

    // Reinitialize global settings from workspace settings.json
    await globalSettings.initializeFromWorkspace();

    // Reinitialize the Solution Cache and Document Manager
    await reinitializeEnvironment(true);

    // Refresh the solution tree view
    await createSolutionTreeView(context);

    // Re-register language features (ensuring links update properly)
    registerLanguageFeatures(context);

    vscodeWindow.showInformationMessage("Clarion configuration updated. Solution cache refreshed.");
}

let hoverProviderDisposable: Disposable | null = null;
let documentLinkProviderDisposable: Disposable | null = null;
let implementationProviderDisposable: Disposable | null = null;
let definitionProviderDisposable: Disposable | null = null;
let semanticTokensProviderDisposable: Disposable | null = null;

function registerLanguageFeatures(context: ExtensionContext) {
    if (!documentManager) {
        logger.warn("⚠️ Cannot register language features: documentManager is undefined!");
        return;
    }

    // ✅ Fix: Ensure only one Document Link Provider is registered
    if (documentLinkProviderDisposable) {
        documentLinkProviderDisposable.dispose(); // Remove old provider if it exists
    }

    logger.info("🔗 Registering Document Link Provider...");

    // Get the default lookup extensions from settings
    const lookupExtensions = globalSettings.defaultLookupExtensions || [".clw", ".inc", ".equ", ".eq", ".int"];

    // Create document selectors for all Clarion file extensions
    const documentSelectors = [
        { scheme: "file", language: "clarion" },
        ...lookupExtensions.map(ext => ({ scheme: "file", pattern: `**/*${ext}` }))
    ];

    // Register the document link provider for all selectors
    documentLinkProviderDisposable = languages.registerDocumentLinkProvider(
        documentSelectors,
        new ClarionDocumentLinkProvider(documentManager)
    );
    context.subscriptions.push(documentLinkProviderDisposable);

    logger.info(`📄 Registered Document Link Provider for extensions: ${lookupExtensions.join(', ')}`);

    // ✅ Fix: Ensure only one Hover Provider is registered
    if (hoverProviderDisposable) {
        hoverProviderDisposable.dispose(); // Remove old provider if it exists
    }

    logger.info("📝 Registering Hover Provider...");
    hoverProviderDisposable = languages.registerHoverProvider(
        documentSelectors,
        new ClarionHoverProvider(documentManager)
    );
    context.subscriptions.push(hoverProviderDisposable);

    logger.info(`📄 Registered Hover Provider for extensions: ${lookupExtensions.join(', ')}`);
    
    // ✅ Register Implementation Provider for "Go to Implementation" functionality
    if (implementationProviderDisposable) {
        implementationProviderDisposable.dispose(); // Remove old provider if it exists
    }
    
    logger.info("🔍 Registering Implementation Provider...");
    implementationProviderDisposable = languages.registerImplementationProvider(
        documentSelectors,
        new ClarionImplementationProvider(documentManager)
    );
    context.subscriptions.push(implementationProviderDisposable);
    
    logger.info(`📄 Registered Implementation Provider for extensions: ${lookupExtensions.join(', ')}`);
    
    // ✅ DISABLED: Client-side Definition Provider blocks server-side providers
    // All definition requests now handled by server-side DefinitionProvider
    // This includes: variables, parameters, methods, structures, etc.
    /*
    if (definitionProviderDisposable) {
        definitionProviderDisposable.dispose();
    }
    
    logger.info("🔍 Registering Definition Provider for class methods...");
    definitionProviderDisposable = languages.registerDefinitionProvider(
        documentSelectors,
        new ClarionDefinitionProvider(documentManager)
    );
    context.subscriptions.push(definitionProviderDisposable);
    
    logger.info(`📄 Registered Definition Provider for extensions: ${lookupExtensions.join(', ')}`);
    */
    // ✅ Register Prefix Decorator for variable highlighting
    if (semanticTokensProviderDisposable) {
        semanticTokensProviderDisposable.dispose(); // Remove old provider if it exists
    }
    
    logger.info("🎨 Registering Clarion Decorator for variable and comment highlighting...");
    const clarionDecorator = new ClarionDecorator();
    semanticTokensProviderDisposable = {
        dispose: () => clarionDecorator.dispose()
    };
    context.subscriptions.push(semanticTokensProviderDisposable);
    
    logger.info(`🎨 Registered Clarion Decorator for variable and comment highlighting`);
}

async function refreshOpenDocuments() {
    const startTime = performance.now();
    logger.info("🔄 Refreshing all open documents...");

    try {
        const defaultLookupExtensions = globalSettings.defaultLookupExtensions;
        logger.info(`🔍 Loaded defaultLookupExtensions: ${JSON.stringify(defaultLookupExtensions)}`);

        // ✅ Fetch ALL open documents using the updated method
        const docsStartTime = performance.now();
        const openDocuments = await getAllOpenDocuments(); // <-- Await the function here
        const docsEndTime = performance.now();
        logger.info(`✅ Retrieved ${openDocuments.length} open documents in ${(docsEndTime - docsStartTime).toFixed(2)}ms`);

        if (openDocuments.length === 0) {
            logger.warn("⚠️ No open documents found.");
            return;
        }

        // Process documents in parallel for better performance
        const updatePromises = openDocuments.map(async (document) => {
            try {
                const docStartTime = performance.now();
                // ✅ Ensure the document manager updates the links
                if (documentManager) {
                    await documentManager.updateDocumentInfo(document);
                }
                const docEndTime = performance.now();
                logger.debug(`✅ Updated document ${document.uri.fsPath} in ${(docEndTime - docStartTime).toFixed(2)}ms`);
            } catch (docError) {
                logger.error(`❌ Error updating document ${document.uri.fsPath}: ${docError instanceof Error ? docError.message : String(docError)}`);
            }
        });

        // Wait for all document updates to complete
        await Promise.all(updatePromises);

        const endTime = performance.now();
        logger.info(`✅ Successfully refreshed ${openDocuments.length} open documents in ${(endTime - startTime).toFixed(2)}ms`);
    } catch (error) {
        logger.error(`❌ Error in refreshOpenDocuments: ${error instanceof Error ? error.message : String(error)}`);
    }
}

async function registerOpenCommand(context: ExtensionContext) {
    const existingCommands = await commands.getCommands();

    if (!existingCommands.includes('clarion.openFile')) {
        context.subscriptions.push(
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
                   // vscodeWindow.showInformationMessage(`✅ Opened file: ${absolutePath}`);
                } catch (error) {
                    vscodeWindow.showErrorMessage(`❌ Failed to open file: ${filePathStr}`);
                    console.error(`❌ Error opening file: ${filePathStr}`, error);
                }
            })
        );
    }
}
async function createSolutionTreeView(context?: ExtensionContext) {
    // ✅ If the tree view already exists, just refresh its data
    if (treeView && solutionTreeDataProvider) {
        logger.info("🔄 Refreshing existing solution tree...");
        await solutionTreeDataProvider.refresh();
        return;
    }

    // ✅ Create the solution tree provider
    solutionTreeDataProvider = new SolutionTreeDataProvider();

    try {
        // ✅ Create the tree view only if it doesn't exist
        treeView = vscodeWindow.createTreeView('solutionView', {
            treeDataProvider: solutionTreeDataProvider,
            showCollapseAll: true
        });

        // Register filter commands
        const filterCommand = commands.registerCommand('clarion.solutionView.filter', async () => {
            const filterText = await vscodeWindow.showInputBox({
                placeHolder: 'Filter solution tree...',
                prompt: 'Enter text to filter the solution tree',
                value: solutionTreeDataProvider?.getFilterText() || ''
            });
            
            if (filterText !== undefined) { // User didn't cancel
                if (solutionTreeDataProvider) {
                    solutionTreeDataProvider.setFilterText(filterText);
                }
            }
        });
        if (context) {
            context.subscriptions.push(filterCommand);
        }

        const clearFilterCommand = commands.registerCommand('clarion.solutionView.clearFilter', () => {
            if (solutionTreeDataProvider) {
                solutionTreeDataProvider.clearFilter();
            }
        });
        if (context) {
            context.subscriptions.push(clearFilterCommand);
        }

        // Initial refresh to load data
        await solutionTreeDataProvider.refresh();

        logger.info("✅ Solution tree view successfully registered and populated.");
    } catch (error) {
        logger.error("❌ Error registering solution tree view:", error);
    }
}

async function createStructureView(context: ExtensionContext) {
    // If the structure view already exists, just refresh its data
    if (structureView && structureViewProvider) {
        logger.info("🔄 Refreshing existing structure view...");
        structureViewProvider.refresh();
        return;
    }

    // Create the structure view provider
    structureViewProvider = new StructureViewProvider();

    try {
        // Create the tree view
        structureView = vscodeWindow.createTreeView('clarionStructureView', {
            treeDataProvider: structureViewProvider,
            showCollapseAll: true
        });

        // 🔥 Inject the TreeView back into the provider!
        structureViewProvider.setTreeView(structureView);

        // Register the expand all command
        context.subscriptions.push(
            commands.registerCommand('clarion.structureView.expandAll', async () => {
                if (structureViewProvider) {
                    await structureViewProvider.expandAll();
                }
            })
        );

        // Register filter commands
        const filterCommand = commands.registerCommand('clarion.structureView.filter', async () => {
            const filterText = await vscodeWindow.showInputBox({
                placeHolder: 'Filter structure view...',
                prompt: 'Enter text to filter the structure view',
                value: structureViewProvider?.getFilterText() || ''
            });
            
            if (filterText !== undefined) { // User didn't cancel
                if (structureViewProvider) {
                    structureViewProvider.setFilterText(filterText);
                }
            }
        });
        context.subscriptions.push(filterCommand);

        const clearFilterCommand = commands.registerCommand('clarion.structureView.clearFilter', () => {
            if (structureViewProvider) {
                structureViewProvider.clearFilter();
            }
        });
        context.subscriptions.push(clearFilterCommand);
        // Register the toggle follow cursor command
        const toggleFollowCursorCommand = commands.registerCommand('clarion.structureView.toggleFollowCursor', async () => {
            if (structureViewProvider) {
                const isEnabled = structureViewProvider.toggleFollowCursor();
                // Set context variable for the menu checkmark
                await commands.executeCommand('setContext', 'clarion.followCursorEnabled', isEnabled);
                logger.info(`Set clarion.followCursorEnabled context to ${isEnabled}`);
                
                // Force refresh the menu by triggering a context change
                await commands.executeCommand('setContext', 'clarionStructureViewVisible', false);
                await commands.executeCommand('setContext', 'clarionStructureViewVisible', true);
            }
        });
        context.subscriptions.push(toggleFollowCursorCommand);
        
        // Register the structure view menu command (empty handler for the submenu)
        const structureViewMenuCommand = commands.registerCommand('clarion.structureView.menu', () => {
            // This is just a placeholder for the submenu
            logger.info('Structure view menu clicked');
        });
        context.subscriptions.push(structureViewMenuCommand);
        
        

        structureView.title = "Structure";
        structureView.message = "Current document structure";
        structureView.description = "Clarion";

        structureView.onDidChangeVisibility(async e => {
            await commands.executeCommand('setContext', 'clarionStructureViewVisible', e.visible);
            
            // If the view becomes visible, ensure the follow cursor context is set correctly
            if (e.visible && structureViewProvider) {
                const isEnabled = structureViewProvider.isFollowCursorEnabled();
                await commands.executeCommand('setContext', 'clarion.followCursorEnabled', isEnabled);
                logger.info(`Refreshed clarion.followCursorEnabled context to ${isEnabled}`);
            }
        });
        
        // Set the initial visibility context
        await commands.executeCommand('setContext', 'clarionStructureViewVisible', true);

        logger.info("✅ Structure view successfully registered.");
    } catch (error) {
        logger.error("❌ Error registering structure view:", error);
    }
}

async function createStatusView(context: ExtensionContext) {
    // Always create a fresh provider
    statusViewProvider = new StatusViewProvider();
    statusView = window.createTreeView('clarionStatusView', {
        treeDataProvider: statusViewProvider
    });
    
    // Inject the treeView reference so provider can update title
    statusViewProvider.setTreeView(statusView);
    
    // Set initial title
    statusViewProvider.refresh();
    
    context.subscriptions.push(statusView);
    logger.info("✅ Status view created");
    
    // Refresh status view when workspace changes
    context.subscriptions.push(
        workspace.onDidChangeWorkspaceFolders(() => {
            statusViewProvider?.refresh();
        })
    );
    
    // Refresh status view when workspace trust changes
    context.subscriptions.push(
        workspace.onDidGrantWorkspaceTrust(() => {
            statusViewProvider?.refresh();
            logger.info("🔒 Workspace trust granted - refreshing status view");
        })
    );
    
    // Export refresh function for use elsewhere
    (global as any).refreshStatusView = () => {
        statusViewProvider?.refresh();
    };
}


export async function closeClarionSolution(context: ExtensionContext) {
    try {
        logger.info("🔄 Closing Clarion solution...");
        
        // Clear solution-related settings from workspace
        await workspace.getConfiguration().update("clarion.solutionFile", "", ConfigurationTarget.Workspace);
        
        // Clear the current solution setting
        await workspace.getConfiguration().update("clarion.currentSolution", "", ConfigurationTarget.Workspace);
        logger.info("✅ Cleared current solution setting");
        
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
        if (buildProjectStatusBarItem) {
            buildProjectStatusBarItem.hide();
        }
        
        if (configStatusBarItem) {
            configStatusBarItem.hide();
        }
        
        // Mark solution as closed
        await commands.executeCommand("setContext", "clarion.solutionOpen", false);
        statusViewProvider?.refresh(); // Refresh status view when solution closes
        
        // Clear document link provider
        if (documentLinkProviderDisposable) {
            documentLinkProviderDisposable.dispose();
            documentLinkProviderDisposable = null;
            logger.info("✅ Cleared document link provider");
        }
        
        // Clear hover provider
        if (hoverProviderDisposable) {
            hoverProviderDisposable.dispose();
            hoverProviderDisposable = null;
            logger.info("✅ Cleared hover provider");
        }
        
        // Clear implementation provider
        if (implementationProviderDisposable) {
            implementationProviderDisposable.dispose();
            implementationProviderDisposable = null;
            logger.info("✅ Cleared implementation provider");
        }
        
        // Clear definition provider
        if (definitionProviderDisposable) {
            definitionProviderDisposable.dispose();
            definitionProviderDisposable = null;
            logger.info("✅ Cleared definition provider");
        }
        
        // Clear semantic token provider
        if (semanticTokensProviderDisposable) {
            semanticTokensProviderDisposable.dispose();
            semanticTokensProviderDisposable = null;
            logger.info("✅ Cleared semantic token provider");
        }
        
        // Refresh the solution tree view to show the "Open Solution" button
        await createSolutionTreeView(context);
        // Hide the build project status bar if it exists
        if (buildProjectStatusBarItem) {
            buildProjectStatusBarItem.hide();
        }
        
        
        // Dispose of any file watchers
        await createSolutionFileWatchers(context);
        
        vscodeWindow.showInformationMessage("Clarion solution closed successfully.");
    } catch (error) {
        const errMessage = error instanceof Error ? error.message : String(error);
        logger.error("❌ Error closing solution:", error);
        vscodeWindow.showErrorMessage(`Error closing Clarion solution: ${errMessage}`);
    }
}
/**
 * Opens a solution from the list of available solutions in the workspace
 * If a solution is already open, it will be closed first
 */
export async function openSolutionFromList(context: ExtensionContext) {
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
            await openClarionSolution(context);
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

export async function openClarionSolution(context: ExtensionContext) {
    try {
        // ✅ Check if workspace exists - offer to create one if not
        if (!workspace.workspaceFolders) {
            const choice = await window.showInformationMessage(
                "Solutions require a workspace. Would you like to create one?",
                { modal: true },
                "Create Workspace & Open Solution",
                "Cancel"
            );
            
            if (choice !== "Create Workspace & Open Solution") {
                return;
            }
            
            // Let user pick solution file first
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
            const solutionName = path.basename(solutionPath, '.sln');
            const defaultWorkspacePath = path.join(solutionFolder, `${solutionName}.code-workspace`);
            
            // Ask where to save workspace
            const workspaceChoice = await window.showInformationMessage(
                `Create workspace in solution folder?\n${solutionFolder}`,
                { modal: true },
                "Create Here",
                "Choose Different Location",
                "Cancel"
            );
            
            if (workspaceChoice === "Cancel" || !workspaceChoice) {
                window.showInformationMessage("Workspace creation canceled.");
                return;
            }
            
            let finalWorkspacePath = defaultWorkspacePath;
            
            if (workspaceChoice === "Choose Different Location") {
                const saveUri = await window.showSaveDialog({
                    defaultUri: Uri.file(defaultWorkspacePath),
                    filters: { 'Workspace': ['code-workspace'] },
                    title: 'Save Workspace As'
                });
                
                if (!saveUri) {
                    window.showInformationMessage("Workspace creation canceled.");
                    return;
                }
                finalWorkspacePath = saveUri.fsPath;
            }
            
            // Create workspace file
            const workspaceContent = {
                folders: [{ path: solutionFolder }],
                settings: {
                    "clarion.solutionFile": solutionPath
                }
            };
            
            try {
                fs.writeFileSync(finalWorkspacePath, JSON.stringify(workspaceContent, null, 2));
                logger.info(`✅ Created workspace file: ${finalWorkspacePath}`);
                
                // Open the workspace (VS Code will reload)
                window.showInformationMessage(`Workspace created. Opening ${solutionName}...`);
                await commands.executeCommand('vscode.openFolder', Uri.file(finalWorkspacePath));
                
                return;
            } catch (error) {
                logger.error(`❌ Error creating workspace: ${error instanceof Error ? error.message : String(error)}`);
                window.showErrorMessage(`Failed to create workspace: ${error instanceof Error ? error.message : String(error)}`);
                return;
            }
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

function extractConfigurationsFromSolution(solutionContent: string): string[] {
    // Extract the SolutionConfigurationPlatforms section
    const sectionPattern = /GlobalSection\(SolutionConfigurationPlatforms\)\s*=\s*preSolution([\s\S]*?)EndGlobalSection/;
    const match = sectionPattern.exec(solutionContent);

    if (!match) {
        logger.warn("⚠️ No configurations found in solution file. Defaulting to Debug/Release.");
        return ["Debug", "Release"];
    }

    const sectionContent = match[1];
    const configurations = sectionContent
        .split('\n')
        .map(line => line.trim())
        .filter(line => line && !line.startsWith("GlobalSection")) // ✅ Remove section header
        .map(line => line.split('=')[0].trim()) // ✅ Extract left-hand side (config name)
        .map(config => config.split('|')[0].trim()) // ✅ Extract everything before the pipe
        .filter(config => config.length > 0); // ✅ Ensure only valid names remain

    logger.info(`📂 Extracted configurations from solution: ${JSON.stringify(configurations)}`);
    return configurations.length > 0 ? configurations : ["Debug", "Release"];
}

export async function showClarionQuickOpen(): Promise<void> {
    if (!workspace.workspaceFolders) {
        vscodeWindow.showWarningMessage("No workspace is open.");
        return;
    }

    const solutionCache = SolutionCache.getInstance();
    const solutionInfo = solutionCache.getSolutionInfo();

    if (!solutionInfo) {
        // Refresh the solution tree view to show the "Open Solution" button
        await createSolutionTreeView();
        vscodeWindow.showInformationMessage("No solution is currently open. Use the 'Open Solution' button in the Solution View.");
        return;
    }

    // Collect all source files from all projects
    const allFiles: { label: string; description: string; path: string }[] = [];
    const seenFiles = new Set<string>();
    const seenBaseNames = new Set<string>(); // Track base filenames to avoid duplicates

    // ✅ Use allowed file extensions from global settings
    const defaultSourceExtensions = [".clw", ".inc", ".equ", ".eq", ".int"];
    const allowedExtensions = [
        ...defaultSourceExtensions,
        ...globalSettings.fileSearchExtensions.map(ext => ext.toLowerCase())
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
                    label: getIconForFile(sourceFile.name) + " " + sourceFile.name,
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
    const additionalFiles = listFilesRecursively(solutionDir)
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
                    label: getIconForFile(file) + " " + path.basename(file),
                    description: relativePath,
                    path: filePath
                };
            }
            return null;
        })
        .filter(item => item !== null) as { label: string; description: string; path: string }[];

    // Add files from redirection paths
    const redirectionFiles: { label: string; description: string; path: string }[] = [];

    for (const searchPath of uniqueSearchPaths) {
        try {
            if (workspace.rootPath && searchPath.startsWith(workspace.rootPath)) {
                // If the path is inside the workspace, use VS Code's findFiles
                const files = await workspace.findFiles(`${searchPath}/**/*.*`);

                for (const file of files) {
                    const filePath = file.fsPath;
                    const ext = path.extname(filePath).toLowerCase();

                    const baseName = path.basename(filePath).toLowerCase();
                    if (allowedExtensions.includes(ext) && !seenFiles.has(filePath) && !seenBaseNames.has(baseName)) {
                        seenFiles.add(filePath);
                        redirectionFiles.push({
                            label: getIconForFile(filePath) + " " + path.basename(filePath),
                            description: `Redirection: ${path.relative(searchPath, path.dirname(filePath))}`,
                            path: filePath
                        });
                    }
                }
            } else {
                // If the path is outside the workspace, use recursive file listing
                logger.info(`📌 Searching manually outside workspace: ${searchPath}`);
                const externalFiles = listFilesRecursively(searchPath);

                for (const filePath of externalFiles) {
                    const ext = path.extname(filePath).toLowerCase();

                    const baseName = path.basename(filePath).toLowerCase();
                    if (allowedExtensions.includes(ext) && !seenFiles.has(filePath) && !seenBaseNames.has(baseName)) {
                        seenFiles.add(filePath);
                        redirectionFiles.push({
                            label: getIconForFile(filePath) + " " + path.basename(filePath),
                            description: `Redirection: ${path.relative(searchPath, path.dirname(filePath))}`,
                            path: filePath
                        });
                    }
                }
            }
        } catch (error) {
            logger.warn(`⚠️ Error accessing search path: ${searchPath} - ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    // Combine and sort all files
    const combinedFiles = [...allFiles, ...additionalFiles, ...redirectionFiles]
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

    function listFilesRecursively(dir: string): string[] {
        const files: string[] = [];

        try {
            const entries = fs.readdirSync(dir, { withFileTypes: true });

            for (const entry of entries) {
                const fullPath = path.join(dir, entry.name);

                if (entry.isDirectory()) {
                    // Skip certain directories
                    if (!['node_modules', '.git', 'bin', 'obj'].includes(entry.name)) {
                        files.push(...listFilesRecursively(fullPath));
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

    function getIconForFile(fileExt: string): string {
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

async function setConfiguration() {
    if (!globalSolutionFile) {
        // Refresh the solution tree view to show the "Open Solution" button
        await createSolutionTreeView();
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
        await workspace.getConfiguration().update("clarion.configuration", selectedConfig, ConfigurationTarget.Workspace);
        updateConfigurationStatusBar(selectedConfig);
        vscodeWindow.showInformationMessage(`Configuration set to: ${selectedConfig}`);
    }
}

export function deactivate(): Thenable<void> | undefined {
    if (!client) {
        return undefined;
    }
    return client.stop();
}

// Error handling for build output
function showErrorMessages(errors: { file: string; line: number; message: string }[]) {
    // Create diagnostics collection
    const diagnosticCollection = languages.createDiagnosticCollection('clarion');

    // Group errors by file
    const errorsByFile = new Map<string, Diagnostic[]>();

    for (const error of errors) {
        const uri = Uri.file(error.file);
        const diagnostic = new Diagnostic(
            new Range(error.line - 1, 0, error.line - 1, 100),
            error.message,
            DiagnosticSeverity.Error
        );

        if (!errorsByFile.has(uri.toString())) {
            errorsByFile.set(uri.toString(), []);
        }

        errorsByFile.get(uri.toString())!.push(diagnostic);
    }

    // Set diagnostics
    diagnosticCollection.clear();
    for (const [uriString, diagnostics] of errorsByFile.entries()) {
        diagnosticCollection.set(Uri.parse(uriString), diagnostics);
    }
}

// Parse build output for errors
function parseBuildOutput(output: string) {
    const errors: { file: string; line: number; message: string }[] = [];
    const lines = output.split('\n');

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();

        // Match Clarion error patterns
        const errorMatch = line.match(/^Error\s+(\d+):\s+(.+?)\((\d+)\)\s*:\s*(.+)$/i);
        if (errorMatch) {
            const [, , file, lineNum, message] = errorMatch;
            errors.push({
                file,
                line: parseInt(lineNum, 10),
                message: message.trim()
            });
        }
    }

    return errors;
}
async function startClientServer(context: ExtensionContext, hasOpenXmlFiles: boolean = false): Promise<void> {
    try {
        logger.info("🔍 [DEBUG] Starting Clarion Language Server...");
        
        // Log XML extension status
        try {
            const xmlExtension = extensions.getExtension('redhat.vscode-xml');
            logger.info(`🔍 [DEBUG] XML extension status: ${xmlExtension ? (xmlExtension.isActive ? 'active' : 'inactive') : 'not installed'}`);
        } catch (xmlError) {
            logger.error(`🔍 [DEBUG] Error checking XML extension: ${xmlError instanceof Error ? xmlError.message : String(xmlError)}`);
        }
        
        // Log open documents
        try {
            const openDocs = workspace.textDocuments;
            logger.info(`🔍 [DEBUG] Open documents (${openDocs.length}): ${openDocs.map(d => d.fileName).join(', ')}`);
            
            // Check for XML files and log details
            for (const doc of openDocs) {
                if (doc.fileName.toLowerCase().endsWith('.xml') || doc.fileName.toLowerCase().endsWith('.cwproj')) {
                    logger.info(`🔍 [DEBUG] XML file details: ${doc.fileName}, language: ${doc.languageId}, version: ${doc.version}`);
                }
            }
        } catch (docsError) {
            logger.error(`🔍 [DEBUG] Error checking open documents: ${docsError instanceof Error ? docsError.message : String(docsError)}`);
        }
        
        // Skip the delay if there are XML files open
        if (hasOpenXmlFiles) {
            logger.info(`🔍 [DEBUG] XML files are open, skipping delay and proceeding with initialization...`);
        } else {
            // Minimal delay to allow other extensions to initialize first
            const delayTime = 100; // Reduced to minimal delay
            logger.info(`🔍 [DEBUG] Minimal wait for other extensions (${delayTime}ms delay)...`);
            
            // Simple timeout instead of polling
            await new Promise(resolve => setTimeout(resolve, delayTime));
            
            logger.info("🔍 [DEBUG] Delay completed. Continuing with Clarion Language Server initialization...");
        }
    } catch (startupError) {
        logger.error(`🔍 [DEBUG] Error during startup delay: ${startupError instanceof Error ? startupError.message : String(startupError)}`);
    }
    let serverModule = context.asAbsolutePath(path.join('out', 'server', 'src', 'server.js'));
    let debugOptions = { execArgv: ['--nolazy', '--inspect=6009'] };

    let serverOptions: ServerOptions = {
        run: { module: serverModule, transport: TransportKind.ipc },
        debug: { module: serverModule, transport: TransportKind.ipc, options: debugOptions }
    };

    // Get the default lookup extensions from settings
    const lookupExtensions = globalSettings.defaultLookupExtensions || [".clw", ".inc", ".equ", ".eq", ".int"];

    // Create document selectors for all Clarion file extensions
    const documentSelectors = [
        { scheme: 'file', language: 'clarion' },
        ...lookupExtensions.map(ext => ({ scheme: 'file', pattern: `**/*${ext}` }))
    ];

    // Create file watcher pattern for all extensions
    const fileWatcherPattern = `**/*.{${lookupExtensions.map(ext => ext.replace('.', '')).join(',')}}`;

    // Create file watcher pattern for redirection, solution, and project files
    const projectFileWatcherPattern = "**/*.{red,sln,cwproj}";

    let clientOptions: LanguageClientOptions = {
        documentSelector: documentSelectors,
        initializationOptions: {
            settings: workspace.getConfiguration('clarion'),
            lookupExtensions: lookupExtensions
        },
        synchronize: {
            fileEvents: [
                workspace.createFileSystemWatcher(fileWatcherPattern),
                workspace.createFileSystemWatcher(projectFileWatcherPattern)
            ],
        },
        middleware: {
            provideDefinition: (document, position, token, next) => {
                logger.info(`🔥 CLIENT MIDDLEWARE: Definition request for ${document.uri.toString()} at ${position.line}:${position.character}`);
                return next(document, position, token);
            }
        },
        // Add error handling options
        errorHandler: {
            error: (error, message, count) => {
                logger.error(`Language server error: ${error.message || error}`);
                return ErrorAction.Continue;
            },
            closed: () => {
                logger.warn("Language server connection closed");
                // Always try to restart the server
                return CloseAction.Restart;
            }
        }
    };

    logger.info(`📄 Configured Language Client for extensions: ${lookupExtensions.join(', ')}`);

    client = new LanguageClient("ClarionLanguageServer", "Clarion Language Server", serverOptions, clientOptions);
    
    // Start the language client
    const disposable = client.start();
    context.subscriptions.push(disposable);

    // Set the client in the LanguageClientManager
    setLanguageClient(client);

    try {
        // Wait for the language client to become ready
        await getClientReadyPromise();
        logger.info("✅ Language client started and is ready");
        
        // Log server capabilities
        const capabilities = client.initializeResult?.capabilities;
        logger.info(`📋 Server capabilities: ${JSON.stringify(capabilities, null, 2)}`);
        logger.info(`📋 Full initializeResult: ${JSON.stringify(client.initializeResult, null, 2)}`);
        if (capabilities?.definitionProvider) {
            logger.info("✅ Server reports definitionProvider capability is enabled");
        } else {
            logger.error("❌ Server does NOT report definitionProvider capability!");
            logger.error(`❌ Capabilities object: ${JSON.stringify(capabilities)}`);
        }
    } catch (err) {
        logger.error("❌ Language client failed to start properly", err);
        vscodeWindow.showWarningMessage("Clarion Language Server had issues during startup. Some features may not work correctly.");
        client = undefined;
    }

}
async function buildSolutionOrProject(
    buildTarget: "Solution" | "Project",
    project: ClarionProjectInfo | undefined,
    diagnosticCollection: DiagnosticCollection   // 🔹 required
) {
    const buildConfig = {
        buildTarget,
        selectedProjectPath: project?.path ?? "",
        projectObject: project
    };

    if (!buildTasks.validateBuildEnvironment()) {
        return;
    }

    const solutionCache = SolutionCache.getInstance();
    const solutionInfo = solutionCache.getSolutionInfo();

    if (!solutionInfo) {
        await createSolutionTreeView();
        vscodeWindow.showInformationMessage(
            "No solution is currently open. Use the 'Open Solution' button in the Solution View."
        );
        return;
    }

    const buildParams = {
        ...buildTasks.prepareBuildParameters(buildConfig),
        diagnosticCollection
    };

    await buildTasks.executeBuildTask(buildParams);
}




