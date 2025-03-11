import { commands, Uri, window, ExtensionContext, TreeView, workspace, Disposable, languages, ConfigurationTarget, TextDocument, QuickPickItem, ThemeIcon, TextEditor, window as vscodeWindow, Diagnostic, DiagnosticSeverity, Range, Position, Terminal, Selection, StatusBarItem, StatusBarAlignment } from 'vscode';
import { LanguageClient, LanguageClientOptions, ServerOptions, TransportKind } from 'vscode-languageclient/node';

import * as path from 'path';

import { ClarionExtensionCommands } from './ClarionExtensionCommands';
import { ClarionHoverProvider } from './providers/hoverProvider';
import { ClarionDocumentLinkProvider } from './providers/documentLinkProvier';
import { DocumentManager } from './documentManager';

import { SolutionTreeDataProvider } from './SolutionTreeDataProvider';
import { TreeNode } from './TreeNode';
import { globalClarionPropertiesFile, globalClarionVersion, globalSettings, globalSolutionFile, setGlobalClarionSelection } from './globals';
import { parseStringPromise } from 'xml2js';
import * as fs from 'fs';
import { RedirectionFileParser } from './Parser/RedirectionFileParser';
import { SolutionParser } from './Parser/SolutionParser';

import { exec } from 'child_process';
import { runClarionBuild } from './buildTasks';
import LoggerManager from './logger';
const logger = LoggerManager.getLogger("Extension");
logger.setLevel("error");
let client: LanguageClient | undefined;
let solutionParser: SolutionParser | undefined;
let treeView: TreeView<TreeNode> | undefined;
let solutionTreeDataProvider: SolutionTreeDataProvider | undefined;
let documentManager: DocumentManager | undefined;

let configStatusBarItem: StatusBarItem;

export function updateConfigurationStatusBar(configuration: string) {
    if (!configStatusBarItem) {
        configStatusBarItem = window.createStatusBarItem(StatusBarAlignment.Left, 100);
        configStatusBarItem.command = 'clarion.setConfiguration'; // ✅ Clicking will open the config picker
    }

    configStatusBarItem.text = `$(gear) Clarion: ${configuration}`; // ✅ Show config with gear icon
    configStatusBarItem.tooltip = "Click to change Clarion configuration";
    configStatusBarItem.show();
}

export async function activate(context: ExtensionContext): Promise<void> {
    const disposables: Disposable[] = [];
    const isRefreshingRef = { value: false };

    logger.info("🔄 Activating Clarion extension...");

    if (!client) {
        logger.info("🚀 Starting Clarion Language Server...");
        startClientServer(context, documentManager!);
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
    context.subscriptions.push(
        commands.registerCommand("clarion.buildSolution", runClarionBuild)
    );

    context.subscriptions.push(commands.registerCommand("clarion.quickOpen", async () => {
        if (!workspace.isTrusted) {
            vscodeWindow.showWarningMessage("Clarion features require a trusted workspace.");
            return;
        }

        await showClarionQuickOpen();
    }));

    context.subscriptions.push(commands.registerCommand("clarion.openSolution", async () => {
        if (!workspace.isTrusted) {
            vscodeWindow.showWarningMessage("Clarion features require a trusted workspace.");
            return;
        }

        await openClarionSolution(context);
    }));

    context.subscriptions.push(commands.registerCommand("clarion.setConfiguration", async () => {
        if (!workspace.isTrusted) {
            vscodeWindow.showWarningMessage("Clarion features require a trusted workspace.");
            return;
        }

        await setConfiguration();
    }));


    // ✅ Watch for changes in Clarion configuration settings
    context.subscriptions.push(
        workspace.onDidChangeConfiguration(async (event) => {
            if (event.affectsConfiguration("clarion.defaultLookupExtensions")) {
                logger.info("🔄 Clarion defaultLookupExtensions changed. Refreshing document links...");
                await handleSettingsChange(context);
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

    // ✅ Continue initializing the solution parser
    documentManager = await reinitializeEnvironment(refreshDocs);
    createSolutionTreeView();
    registerLanguageFeatures(context);
    await commands.executeCommand("setContext", "clarion.solutionOpen", true);
    updateConfigurationStatusBar(globalSettings.configuration);
    vscodeWindow.showInformationMessage(`Clarion Solution Loaded: ${path.basename(globalSolutionFile)}`);
}



async function reinitializeEnvironment(refreshDocs: boolean = false): Promise<DocumentManager> {
    logger.info("🔄 Reinitializing SolutionParser and DocumentManager...");

    if (solutionParser) {
        logger.info("🔄 Disposing of existing SolutionParser instance...");
        solutionParser = undefined;
    }

    solutionParser = await SolutionParser.create(globalSolutionFile);

    if (documentManager) {
        logger.info("🔄 Disposing of existing DocumentManager instance...");
        documentManager = undefined;
    }

    documentManager = await DocumentManager.create(solutionParser);

    if (refreshDocs) {
        logger.info("🔄 Refreshing open documents...");
        await refreshOpenDocuments();
    }

    return documentManager; // ✅ Return documentManager instead of registering language features
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


async function handleSettingsChange(context: ExtensionContext) {

    // ✅ Reinitialize global settings from workspace settings.json
    await globalSettings.initializeFromWorkspace();
    logger.info(`🔄 Settings updated! New lookup extensions: ${JSON.stringify(globalSettings.defaultLookupExtensions)}`);

    // ✅ Reinitialize the Solution Environment
    await reinitializeEnvironment(true);

    // ✅ Re-register language features (this ensures links update properly)
    registerLanguageFeatures(context);
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
    documentLinkProviderDisposable = languages.registerDocumentLinkProvider(
        { scheme: "file", language: "clarion" },
        new ClarionDocumentLinkProvider(documentManager)
    );
    context.subscriptions.push(documentLinkProviderDisposable);

    // ✅ Fix: Ensure only one Hover Provider is registered
    if (hoverProviderDisposable) {
        hoverProviderDisposable.dispose(); // Remove old provider if it exists
    }

    logger.info("📝 Registering Hover Provider...");
    hoverProviderDisposable = languages.registerHoverProvider(
        { scheme: "file", language: "clarion" },
        new ClarionHoverProvider(documentManager)
    );
    context.subscriptions.push(hoverProviderDisposable);
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


function createSolutionTreeView() {
    if (!solutionParser) {
        logger.error("❌ Solution parser is not initialized.");
        return;
    }

    // ✅ If the tree view already exists, just refresh its data
    if (treeView && solutionTreeDataProvider) {
        logger.info("🔄 Refreshing existing solution tree...");
        solutionTreeDataProvider.refresh();
        return;
    }

    // ✅ Create the solution tree provider
    solutionTreeDataProvider = new SolutionTreeDataProvider(solutionParser);

    // ✅ Ensure `clarion.openFile` is properly registered
    // commands.getCommands().then((cmds) => {
    //     if (!cmds.includes('clarion.openFile')) {
    //         commands.registerCommand('clarion.openFile', async (filePath: string) => {
    //             if (!filePath) {
    //                 vscodeWindow.showErrorMessage("❌ No file path provided.");
    //                 return;
    //             }
    //             try {
    //                 const absolutePath = path.isAbsolute(filePath) ? filePath : path.join(workspace.rootPath || "", filePath);
    //                 const doc = await workspace.openTextDocument(Uri.file(absolutePath));
    //                 await vscodeWindow.showTextDocument(doc);
    //             } catch (error) {
    //                 logger.error(`❌ Failed to open file: ${filePath}`, error);
    //                 vscodeWindow.showErrorMessage(`❌ Failed to open file: ${filePath}`);
    //             }
    //         });
    //     }
    // });

    try {
        // ✅ Create the tree view only if it doesn't exist
        treeView = vscodeWindow.createTreeView('solutionView', {
            treeDataProvider: solutionTreeDataProvider,
            showCollapseAll: true
        });
        logger.info("✅ Solution tree view successfully registered.");
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

        // ✅ Step 4: Determine available configurations before creating the parser
        // ✅ Step 4: Determine available configurations before creating the parser
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


        // ✅ Step 5: Initialize the Solution Parser
        solutionParser = await SolutionParser.create(solutionFilePath);

        // ✅ Step 6: Update the Solution Tree Data Provider and Refresh
        if (solutionTreeDataProvider) {
            solutionTreeDataProvider.solutionParser = solutionParser;
            solutionTreeDataProvider.refresh();
        } else {
            // If the data provider is not initialized, create it
            solutionTreeDataProvider = new SolutionTreeDataProvider(solutionParser);
            treeView = vscodeWindow.createTreeView("solutionView", {
                treeDataProvider: solutionTreeDataProvider,
                showCollapseAll: true
            });
        }

        // // ✅ Step 7: Ensure the Solution View is Open
        // const registeredCommands = await commands.getCommands();
        // if (registeredCommands.includes("workbench.view.extension.solutionView")) {
        //     await commands.executeCommand("workbench.view.extension.solutionView");
        // } else {
        //     vscodeWindow.showErrorMessage("Solution View failed to register. Please restart VS Code.");
        // }
        initializeSolution(context, true);
        // ✅ Step 8: Register Language Features
        registerLanguageFeatures(context);

        // ✅ Step 9: Mark solution as open
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
    if (!globalSolutionFile) {
        logger.warn("⚠️ No Clarion solution is open. Using default VS Code Quick Open.");
        await commands.executeCommand("workbench.action.quickOpen");
        return;
    }

    const fileItems: QuickPickItem[] = [];
    const seenFiles = new Set<string>();

    // ✅ Use allowed file extensions from global settings
    const defaultSourceExtensions = [".clw", ".inc", ".equ", ".eq", ".int"];
    const allowedExtensions = [
        ...defaultSourceExtensions, 
        ...globalSettings.fileSearchExtensions.map(ext => ext.toLowerCase())
    ];

    logger.info(`🔍 Searching for files with extensions: ${JSON.stringify(allowedExtensions)}`);

    let searchPaths: string[] = [];

    // ✅ Collect search paths from all projects in the solution
    solutionParser?.solution.projects.forEach(project => {
        allowedExtensions.forEach(ext => {
            // 🔹 Use `getSearchPaths` instead of `pathsToLookin`
            const pathsForExt = project.getSearchPaths(ext);
            searchPaths.push(...pathsForExt);
        });
    });

    searchPaths = [...new Set(searchPaths)]; // ✅ Remove duplicates
    logger.info(`📂 Using search paths: ${JSON.stringify(searchPaths)}`);

    // ✅ Fetch workspace files
    const workspaceFiles = await workspace.findFiles(`**/*.*`);
    const redirectionFiles: Uri[] = [];

    for (const searchPath of searchPaths) {
        try {
            if (workspace.rootPath && searchPath.startsWith(workspace.rootPath)) {
                const files = await workspace.findFiles(`${searchPath}/**/*.*`);
                redirectionFiles.push(...files);
            } else {
                logger.info(`📌 Searching manually outside workspace: ${searchPath}`);
                const externalFiles = listFilesRecursively(searchPath);
                redirectionFiles.push(...externalFiles.map(f => Uri.file(f)));
            }
        } catch (error) {
            logger.warn(`⚠️ Error accessing search path: ${searchPath} - ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    function listFilesRecursively(dir: string): string[] {
        let results: string[] = [];
        try {
            const list = fs.readdirSync(dir);
            for (const file of list) {
                const filePath = path.join(dir, file);
                const stat = fs.statSync(filePath);
                if (stat && stat.isDirectory()) {
                    results = results.concat(listFilesRecursively(filePath));
                } else {
                    results.push(filePath);
                }
            }
        } catch (err) {
            logger.warn(`⚠️ Skipping inaccessible folder: ${dir}`);
        }
        return results;
    }

    function getIconForFile(fileExt: string): string {
        switch (fileExt) {
            case ".clw":
                return "$(file-code)";
            case ".inc":
                return "$(symbol-namespace)";
            case ".equ":
            case ".eq":
                return "$(symbol-constant)";
            case ".int":
                return "$(symbol-interface)";
            default:
                return "$(file)";
        }
    }

    workspaceFiles.forEach(file => {
        const filePath = file.fsPath;
        const fileExt = path.extname(filePath).toLowerCase();

        if (!allowedExtensions.includes(fileExt)) {
            return;
        }

        if (!seenFiles.has(filePath)) {
            seenFiles.add(filePath);
            fileItems.push({
                label: `${getIconForFile(fileExt)} ${path.basename(filePath)}`,
                description: "Workspace",
                detail: filePath,
            });
        }
    });

    redirectionFiles.forEach(file => {
        const filePath = file.fsPath;
        const fileExt = path.extname(filePath).toLowerCase();

        if (!allowedExtensions.includes(fileExt)) {
            return;
        }

        if (!seenFiles.has(filePath)) {
            seenFiles.add(filePath);
            const relativeRedirectionPath = path.relative(globalSettings.redirectionPath, path.dirname(filePath));

            fileItems.push({
                label: `${getIconForFile(fileExt)} ${path.basename(filePath)}  [${relativeRedirectionPath}]`,
                description: "Redirection",
                detail: filePath,
            });
        }
    });

    if (fileItems.length === 0) {
        vscodeWindow.showErrorMessage("No matching Clarion files found in the workspace.");
        return;
    }

    const quickPick = vscodeWindow.createQuickPick();
    quickPick.items = fileItems;
    quickPick.matchOnDescription = true;
    quickPick.matchOnDetail = false;
    quickPick.ignoreFocusOut = true;
    quickPick.title = "Clarion File Search";

    quickPick.onDidAccept(async () => {
        const selection = quickPick.selectedItems[0];
        if (selection?.detail) {
            const doc = await workspace.openTextDocument(Uri.file(selection.detail));
            await vscodeWindow.showTextDocument(doc);
        }
        quickPick.hide();
    });

    quickPick.show();
}



async function setConfiguration() {
    if (!solutionParser) {
        vscodeWindow.showErrorMessage("No Clarion solution loaded.");
        return;
    }

    const availableConfigs = solutionParser.getAvailableConfigurations();
    if (availableConfigs.length === 0) {
        vscodeWindow.showErrorMessage("No configurations found in the solution.");
        return;
    }

    const selectedConfig = await vscodeWindow.showQuickPick(availableConfigs, {
        placeHolder: "Select Clarion Configuration"
    });

    if (!selectedConfig) return;

    globalSettings.configuration = selectedConfig;
    await workspace.getConfiguration().update("clarion.configuration", selectedConfig, ConfigurationTarget.Workspace);
    vscodeWindow.showInformationMessage(`Clarion configuration set to ${selectedConfig}`);
    updateConfigurationStatusBar(globalSettings.configuration);
}


export function deactivate(): Thenable<void> | undefined {
    return stopClientServer();
}

const diagnosticCollection = languages.createDiagnosticCollection("clarion-build");




function showErrorMessages(errors: { file: string; line: number; message: string }[]) {
    errors.forEach((err) => {
        const fileUri = Uri.file(err.file);
        const message = `❌ Error: ${err.message} (File: ${err.file}, Line: ${err.line})`;

        window.showErrorMessage(message, "Open File").then((selection) => {
            if (selection === "Open File") {
                workspace.openTextDocument(fileUri).then((doc) => {
                    window.showTextDocument(doc, { preview: false }).then((editor) => {
                        const position = new Position(err.line - 1, 0);
                        editor.selection = new Selection(position, position);
                        editor.revealRange(new Range(position, position));
                    });
                });
            }
        });
    });
}
/**
 * Parses MSBuild output to extract errors and warnings.
 */
function parseBuildOutput(output: string) {
    const diagnostics: { [key: string]: Diagnostic[] } = {};
    diagnosticCollection.clear();

    // Regex to match MSBuild errors: file(line,column): error code: message
    const errorRegex = /(.+?)\((\d+),(\d+)\): (error|warning) (\w+): (.+)/g;
    let match;

    while ((match = errorRegex.exec(output)) !== null) {
        const [_, filePath, line, column, type, errorCode, message] = match;
        const severity = type === "error" ? DiagnosticSeverity.Error : DiagnosticSeverity.Warning;

        const uri = Uri.file(filePath);
        const range = new Range(new Position(parseInt(line) - 1, parseInt(column) - 1), new Position(parseInt(line) - 1, parseInt(column) + 10));
        const diagnostic = new Diagnostic(range, `${errorCode}: ${message}`, severity);

        if (!diagnostics[filePath]) {
            diagnostics[filePath] = [];
        }
        diagnostics[filePath].push(diagnostic);
    }

    Object.keys(diagnostics).forEach(file => {
        diagnosticCollection.set(Uri.file(file), diagnostics[file]);
    });

    if (Object.keys(diagnostics).length > 0) {
        vscodeWindow.showWarningMessage("❌ Build completed with errors. See the Problems panel.");
    } else {
        vscodeWindow.showInformationMessage("✅ Build successful! No errors detected.");
    }
}





function startClientServer(context: ExtensionContext, documentManager: DocumentManager) {
    logger.info("Starting Clarion Language Server...");
    let serverModule = context.asAbsolutePath(path.join('server', 'out', 'server.js'));
    let debugOptions = { execArgv: ['--nolazy', '--inspect=6009'] };

    let serverOptions: ServerOptions = {
        run: { module: serverModule, transport: TransportKind.ipc },
        debug: { module: serverModule, transport: TransportKind.ipc, options: debugOptions }
    };

    let clientOptions: LanguageClientOptions = {
        documentSelector: [{ scheme: 'file', language: 'clarion' }],
        initializationOptions: { settings: workspace.getConfiguration('clarion') },
        synchronize: { fileEvents: workspace.createFileSystemWatcher('**/*.{clw,inc}') }
    };

    client = new LanguageClient("ClarionLanguageServer", "Clarion Language Server", serverOptions, clientOptions);

    // Start the client and handle the promise
    client.start();
}



function stopClientServer() {
    if (client) {
        return client.stop();
    }
    return undefined;
}
