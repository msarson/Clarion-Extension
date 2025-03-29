﻿import { commands, Uri, window, ExtensionContext, TreeView, workspace, Disposable, languages, ConfigurationTarget, TextDocument, TextEditor, window as vscodeWindow, Diagnostic, DiagnosticSeverity, Range, StatusBarItem, StatusBarAlignment } from 'vscode';
import { LanguageClient, LanguageClientOptions, ServerOptions, TransportKind, ErrorAction, CloseAction } from 'vscode-languageclient/node';

import * as path from 'path';
import * as fs from 'fs';

import { ClarionExtensionCommands } from './ClarionExtensionCommands';
import { ClarionHoverProvider } from './providers/hoverProvider';
import { ClarionDocumentLinkProvider } from './providers/documentLinkProvier';
import { DocumentManager } from './documentManager';

import { SolutionTreeDataProvider } from './SolutionTreeDataProvider';
import { TreeNode } from './TreeNode';
import { globalClarionPropertiesFile, globalClarionVersion, globalSettings, globalSolutionFile, setGlobalClarionSelection } from './globals';
import * as buildTasks from './buildTasks'; 
import LoggerManager from './logger';
import { SolutionCache } from './SolutionCache';

import { ClarionProjectInfo } from 'common/types';

const logger = LoggerManager.getLogger("Extension");
logger.setLevel("info");
let client: LanguageClient | undefined;
let treeView: TreeView<TreeNode> | undefined;
let solutionTreeDataProvider: SolutionTreeDataProvider | undefined;
let documentManager: DocumentManager | undefined;

let configStatusBarItem: StatusBarItem;

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

    logger.info("🔄 Activating Clarion extension...");

    if (!client) {
        logger.info("🚀 Starting Clarion Language Server...");
        startClientServer(context);
    }

    // ✅ Step 1: Ensure a workspace is saved
    if (!workspace.workspaceFolders) {
        logger.warn("⚠️ No saved workspace detected. Clarion features will be disabled until a workspace is saved.");
        return; // ⛔ Exit early
    }

    // ✅ Step 2: Ensure the workspace is trusted
    if (!workspace.isTrusted) {
        logger.warn("⚠️ Workspace is not trusted. Clarion features will remain disabled until trust is granted.");
        return; // ⛔ Exit early
    }

    // ✅ Step 3: Load workspace settings before initialization
    await globalSettings.initializeFromWorkspace();

    registerOpenCommand(context);
    
    context.subscriptions.push(commands.registerCommand("clarion.quickOpen", async () => {
        if (!workspace.isTrusted) {
            vscodeWindow.showWarningMessage("Clarion features require a trusted workspace.");
            return;
        }

        await showClarionQuickOpen();
    }));

    // Helper function to check workspace trust before executing commands
    const withTrustedWorkspace = (callback: () => Promise<void>) => async () => {
        if (!workspace.isTrusted) {
            vscodeWindow.showWarningMessage("Clarion features require a trusted workspace.");
            return;
        }
        await callback();
    };
    
    // Register commands with workspace trust check
    const commandsRequiringTrust = [
        { id: "clarion.openSolution", handler: openClarionSolution.bind(null, context) },
        { id: "clarion.setConfiguration", handler: setConfiguration }
    ];
    
    commandsRequiringTrust.forEach(command => {
        context.subscriptions.push(
            commands.registerCommand(command.id, withTrustedWorkspace(command.handler))
        );
    });

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

    // ✅ Ensure all restored tabs are properly indexed (if workspace is already trusted)
    if (workspace.isTrusted && !isRefreshingRef.value) {
        await refreshOpenDocuments();

        // ✅ **Re-added workspaceHasBeenTrusted!**
        await workspaceHasBeenTrusted(context, disposables);
    }

    context.subscriptions.push(...disposables);

    context.subscriptions.push(
        // Add solution build command
        commands.registerCommand('clarion.buildSolution', async () => {
            // Call the existing build function with solution as target
            await buildSolutionOrProject("Solution");
        }),
        
        // Add project build command
        commands.registerCommand('clarion.buildProject', async (node) => {
            // The node parameter is passed automatically from the treeview
            if (node && node.data && node.data.path) {
                await buildSolutionOrProject("Project", node.data);
            } else {
                window.showErrorMessage("Cannot determine which project to build.");
            }
        })
    );
}

async function workspaceHasBeenTrusted(context: ExtensionContext, disposables: Disposable[]): Promise<void> {
    logger.info("✅ Workspace has been trusted or refreshed. Initializing...");

    // Load settings from workspace.json
    await globalSettings.initialize();
    await globalSettings.initializeFromWorkspace();

    // Dispose of old subscriptions
    disposables.forEach(disposable => disposable.dispose());
    disposables.length = 0;

    // ✅ Only initialize if a solution exists in settings
    if (globalSolutionFile && globalClarionPropertiesFile && globalClarionVersion) {
        logger.info("✅ Existing solution settings found. Automatically initializing Clarion Solution...");
        await initializeSolution(context);

        // ✅ Register language features NOW
        registerLanguageFeatures(context);
    } else {
        logger.warn("⚠️ No solution found in settings. Solution View will not be created.");
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

    // ✅ Send paths/config/version to the language server first
    if (client) {
        // Get the solution directory
        const solutionDir = path.dirname(globalSolutionFile);
        
        // Send notification to initialize the server-side solution manager
        client.sendNotification('clarion/updatePaths', {
            redirectionPaths: [globalSettings.redirectionPath],
            projectPaths: [solutionDir],
            configuration: globalSettings.configuration,
            clarionVersion: globalClarionVersion,
            redirectionFile: globalSettings.redirectionFile,
            macros: globalSettings.macros,
            libsrcPaths: globalSettings.libsrcPaths
        });
        logger.info("✅ Clarion paths/config/version sent to the language server.");
    }
    
    // Wait a moment for the server to initialize the solution
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // ✅ Continue initializing the solution cache and document manager
    documentManager = await reinitializeEnvironment(refreshDocs);
    await createSolutionTreeView();
    registerLanguageFeatures(context);
    await commands.executeCommand("setContext", "clarion.solutionOpen", true);
    updateConfigurationStatusBar(globalSettings.configuration);
    
    // Create file watchers for the solution, project, and redirection files
    await createSolutionFileWatchers(context);
    
    // Force refresh all open documents to ensure links are generated
    await refreshOpenDocuments();
    
    vscodeWindow.showInformationMessage(`Clarion Solution Loaded: ${path.basename(globalSolutionFile)}`);
}

async function reinitializeEnvironment(refreshDocs: boolean = false): Promise<DocumentManager> {
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
    await solutionCache.initialize(globalSolutionFile);

    if (documentManager) {
        logger.info("🔄 Disposing of existing DocumentManager instance...");
        documentManager.dispose();
        documentManager = undefined;
    }

    // Create a new DocumentManager (no longer needs SolutionParser)
    documentManager = await DocumentManager.create();

    if (refreshDocs) {
        logger.info("🔄 Refreshing open documents...");
        await refreshOpenDocuments();
    }

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

                    let doc = workspace.textDocuments.find(d => d.uri.toString() === documentUri.toString());

                    if (!doc) {
                        //   logger.warn(`⚠️ Document not tracked, forcing VS Code to open: ${documentUri.fsPath}`);
                        try {
                            doc = await workspace.openTextDocument(documentUri);
                        } catch (error) {
                            logger.error(`❌ Failed to open document: ${documentUri.fsPath}`, error);
                        }
                    }

                    if (doc) {
                        openDocuments.push(doc);
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
    
    // Reinitialize the Solution Cache and Document Manager
    await reinitializeEnvironment(true);
    
    // Refresh the solution tree view
    await createSolutionTreeView();
    
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
        await createSolutionTreeView();
        
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
    await createSolutionTreeView();
    
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
    await createSolutionTreeView();

    // Re-register language features (ensuring links update properly)
    registerLanguageFeatures(context);

    vscodeWindow.showInformationMessage("Clarion configuration updated. Solution cache refreshed.");
}

let hoverProviderDisposable: Disposable | null = null;
let documentLinkProviderDisposable: Disposable | null = null;

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
}

async function refreshOpenDocuments() {
    logger.info("🔄 Refreshing all open documents...");

    const defaultLookupExtensions = globalSettings.defaultLookupExtensions;
    logger.info(`🔍 Loaded defaultLookupExtensions: ${JSON.stringify(defaultLookupExtensions)}`);

    // ✅ Fetch ALL open documents using the updated method
    const openDocuments = await getAllOpenDocuments(); // <-- Await the function here

    if (openDocuments.length === 0) {
        logger.warn("⚠️ No open documents found.");
        return;
    }

    for (const document of openDocuments) {
        const documentUri = document.uri;

        // ✅ Ensure the document manager updates the links
        if (documentManager) {
            await documentManager.updateDocumentInfo(document);
        }
    }

    logger.info(`✅ Successfully refreshed ${openDocuments.length} open documents.`);
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
                    vscodeWindow.showInformationMessage(`✅ Opened file: ${absolutePath}`);
                } catch (error) {
                    vscodeWindow.showErrorMessage(`❌ Failed to open file: ${filePathStr}`);
                    console.error(`❌ Error opening file: ${filePathStr}`, error);
                }
            })
        );
    }
}

async function createSolutionTreeView() {
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
        
        // Initial refresh to load data
        await solutionTreeDataProvider.refresh();
        
        logger.info("✅ Solution tree view successfully registered and populated.");
    } catch (error) {
        logger.error("❌ Error registering solution tree view:", error);
    }
}

export async function openClarionSolution(context: ExtensionContext) {
    try {
        // ✅ Store current values in case user cancels
        const previousSolutionFile = globalSolutionFile;
        const previousPropertiesFile = globalClarionPropertiesFile;
        const previousVersion = globalClarionVersion;
        const previousConfiguration = globalSettings.configuration;

        // ✅ Step 1: Ask the user to select a `.sln` file
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

        const solutionFilePath = selectedFileUri[0].fsPath;
        logger.info(`📂 Selected Clarion solution: ${solutionFilePath}`);

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

        // ✅ Step 5: Initialize the Solution
        await initializeSolution(context, true);

        // ✅ Step 6: Mark solution as open
        await commands.executeCommand("setContext", "clarion.solutionOpen", true);
        vscodeWindow.showInformationMessage(`Clarion Solution Loaded: ${path.basename(globalSolutionFile)}`);

    } catch (error) {
        const errMessage = error instanceof Error ? error.message : String(error);
        logger.error("❌ Error opening solution:", error);
        vscodeWindow.showErrorMessage(`Error opening Clarion solution: ${errMessage}`);
    }
}

function extractConfigurationsFromSolution(solutionContent: string): string[] {
    const configPattern = /GlobalSection\(SolutionConfigurationPlatforms\) = preSolution([\s\S]*?)EndGlobalSection/g;
    const match = configPattern.exec(solutionContent);

    if (!match) {
        logger.warn("⚠️ No configurations found in solution file. Defaulting to Debug/Release.");
        return ["Debug", "Release"];
    }

    const configurations = match[1]
        .split('\n')
        .map(line => line.trim())
        .filter(line => line && !line.startsWith("GlobalSection")) // ✅ Remove section header
        .map(line => line.split('=')[0].trim()) // ✅ Extract left-hand side (config name)
        .map(config => config.replace("|Win32", "").trim()) // ✅ Remove "|Win32"
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
        vscodeWindow.showWarningMessage("No Clarion solution is loaded.");
        return;
    }

    // Collect all source files from all projects
    const allFiles: { label: string; description: string; path: string }[] = [];
    const seenFiles = new Set<string>();
    
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
            
            if (!seenFiles.has(fullPath)) {
                seenFiles.add(fullPath);
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
            
            if (!seenFiles.has(filePath)) {
                seenFiles.add(filePath);
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
                    
                    if (allowedExtensions.includes(ext) && !seenFiles.has(filePath)) {
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
                    
                    if (allowedExtensions.includes(ext) && !seenFiles.has(filePath)) {
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
        vscodeWindow.showWarningMessage("No Clarion solution is loaded.");
        return;
    }

    const solutionCache = SolutionCache.getInstance();
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
function startClientServer(context: ExtensionContext) {
    logger.info("Starting Clarion Language Server...");
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

    // Start the client
    const disposable = client.start();
    
    // Add error handling for client startup
    context.subscriptions.push(disposable);
    
    // Set a timeout to check if the client is ready
    setTimeout(() => {
        if (client && !client.needsStart()) {
            logger.info("✅ Language client started successfully");
        } else {
            logger.error("❌ Language client failed to start properly");
            // If the client fails to start, set it to null so we can try again later
            client = undefined;
        }
    }, 5000); // Check after 5 seconds
}
async function buildSolutionOrProject(buildTarget: "Solution" | "Project", project?: ClarionProjectInfo) {
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
        vscodeWindow.showErrorMessage("No solution information available. Please open a solution first.");
        return;
    }

    const buildParams = buildTasks.prepareBuildParameters(buildConfig);
    await buildTasks.executeBuildTask(buildParams);
}

