import { commands, Uri, window, ExtensionContext, TreeView, workspace, Disposable, languages, QuickPickItem, ConfigurationTarget } from 'vscode';
import * as path from 'path';
import { LanguageClient, LanguageClientOptions, ServerOptions, TransportKind } from 'vscode-languageclient/node';
import { ClarionExtensionCommands } from './ClarionExtensionCommands';
import { TextEditorComponent } from './TextEditorComponent';
import { ClarionHoverProvider } from './providers/hoverProvider';
import { ClarionDocumentLinkProvider } from './providers/documentLinkProvier';
import { DocumentManager } from './documentManager';
import { SolutionParser } from './SolutionParser';
import { SolutionTreeDataProvider, TreeNode } from './SolutionTreeDataProvider';
import { Logger } from './UtilityClasses/Logger';
import {  globalClarionPropertiesFile, globalClarionVersion, globalSettings, globalSolutionFile, setGlobalClarionSelection } from './globals';
import { parseStringPromise } from 'xml2js';

import * as fs from 'fs';
import { RedirectionFileParser } from './UtilityClasses/RedirectionFileParser';

let client: LanguageClient | undefined;
let solutionParser: SolutionParser | undefined;
let treeView: TreeView<TreeNode> | undefined;
let solutionTreeDataProvider: SolutionTreeDataProvider | undefined; // Store globally
// Additional globals for runtime use only



/**
 * Retrieves the project path for the currently active file.
 */


export function getProjectPathForCurrentDocument(): string | undefined {
    const editor = window.activeTextEditor;
    if (!editor) {
        Logger.warn("⚠️ No active editor found.");
        return undefined;
    }

    const documentPath = editor.document.uri.fsPath;
    Logger.info(`📂 Active Document: ${documentPath}`);

    // ✅ Step 1: Check if it's part of a known project
    const project = solutionParser?.findProjectForFile(path.basename(documentPath));
    if (project) {
        Logger.info(`✅ Found project for file: ${project.name} -> ${project.path}`);
        return project.path;
    }

    // ✅ Step 2: Use redirection settings if project is not found
    Logger.warn(`⚠️ File not found in parsed projects, searching redirection paths...`);

    const redirectionParser = new RedirectionFileParser(globalSettings.configuration, "");
    const extensions = [".clw", ".inc", ".equ", ".int"];

    for (const ext of extensions) {
        const searchPaths = redirectionParser.getSearchPaths(ext, "");
        for (const searchPath of searchPaths) {
            const fullPath = path.join(searchPath, path.basename(documentPath));
            if (fs.existsSync(fullPath)) {
                Logger.info(`✅ Found file in redirection path: ${fullPath}`);
                return path.dirname(fullPath);
            }
        }
    }

    Logger.warn("❌ Could not determine project path for the current document.");
    return undefined;
}



/**
 * Displays a QuickPick interface for selecting Clarion-related files from both the
 * current workspace and any configured redirection paths.
 *
 * @remarks
 * This function consolidates items without duplicates, leveraging a set to track
 * previously encountered file paths. It shows the resulting list in a QuickPick widget
 * with live filtering enabled. When a file is chosen, that file is opened in a new editor tab.
 *
 * @returns A promise that resolves when the user selects and opens a file, or completes
 * if no file is selected.
 */
export async function showClarionQuickOpen(): Promise<void> {
    const fileItems: QuickPickItem[] = [];
    const seenFiles = new Set<string>(); // ✅ Prevent duplicates

    // Step 1: Get default workspace files (VS Code behavior)
    const workspaceFiles = await workspace.findFiles(`**/*.*`); // 🔍 Fetch all files

    workspaceFiles.forEach(file => {
        const filePath = file.fsPath;
        if (!seenFiles.has(filePath)) { // ✅ Avoid duplicates
            seenFiles.add(filePath);
            fileItems.push({
                label: path.basename(filePath),
                description: `Workspace (${path.dirname(filePath)})`,
                detail: filePath
            });
        }
    });

    // Step 2: Search redirection paths **for each extension separately**
    if (globalSettings.redirectionPath) {
        Logger.setDebugMode(true);
        Logger.info('🔍 Searching Redirection Paths:');
        

        let projectPath = getProjectPathForCurrentDocument() || globalSettings.redirectionPath;
        const redirectionParser = new RedirectionFileParser(globalSettings.configuration, projectPath);
        const extensions = [".clw", ".inc", ".equ", ".int"];

        // ✅ **Store paths separately for each extension**
        const redirectionPaths: Record<string, string[]> = {};
        for (const ext of extensions) {
            redirectionPaths[ext] = redirectionParser.getSearchPaths(ext, projectPath);
        }

        // ✅ **Search only in relevant paths for each file type**
        for (const ext of extensions) {
            redirectionPaths[ext].forEach(searchPath => {
                const normalizedPath = path.isAbsolute(searchPath)
                    ? path.normalize(searchPath) 
                    : path.resolve(projectPath, searchPath);  // ✅ Resolve relative paths properly
            
                if (fs.existsSync(normalizedPath)) {  // ✅ Prevent ENOENT error
                    try {
                        const files = fs.readdirSync(normalizedPath)
                            .filter(file => path.extname(file) === ext); // ✅ Filter only relevant files
            
                        files.forEach(file => {
                            const fullPath = path.join(normalizedPath, file);
                            if (!seenFiles.has(fullPath)) { // ✅ Avoid duplicates
                                seenFiles.add(fullPath);
                                fileItems.push({
                                    label: file,
                                    description: `Redirection Path (${normalizedPath})`,
                                    detail: fullPath
                                });
                            }
                        });
                    } catch (error) {
                        Logger.warn(`⚠️ Error reading directory: ${normalizedPath}`, error);
                    }
                } else {
                    Logger.warn(`⚠️ Skipping non-existent directory: ${normalizedPath}`);
                }
            });
            
        }
    }

    // Step 3: Show Quick Pick options with **live filtering**
    const selectedItem = await window.showQuickPick(fileItems, {
        placeHolder: "Start typing to filter files...",
        ignoreFocusOut: false // Keeps the QuickPick open unless explicitly dismissed
    });

    // ✅ Ensure `selectedItem` has `detail` before using it
    if (selectedItem && typeof selectedItem !== "string" && selectedItem.detail) {
        const fileUri = Uri.file(selectedItem.detail);
        const document = await workspace.openTextDocument(fileUri);
        await window.showTextDocument(document);
    }
    Logger.setDebugMode(false);
}



export async function openClarionSolution() {
    try {
        // ✅ Store current values in case user cancels
        const previousSolutionFile = globalSolutionFile;
        const previousPropertiesFile = globalClarionPropertiesFile;
        const previousVersion = globalClarionVersion;
        const previousConfiguration = globalSettings.configuration;

        // ✅ Reset stored workspace settings (temporary)
        await setGlobalClarionSelection("", "", "", "");

        // Step 1: Ask the user to select a `.sln` file
        const selectedFileUri = await window.showOpenDialog({
            canSelectFiles: true,
            canSelectFolders: false,
            openLabel: 'Select Clarion Solution (.sln)',
            filters: { "Solution Files": ["sln"] }
        });

        if (!selectedFileUri || selectedFileUri.length === 0) {
            window.showWarningMessage("Solution selection canceled. Restoring previous settings.");
            await setGlobalClarionSelection(previousSolutionFile, previousPropertiesFile, previousVersion, previousConfiguration);
            return;
        }

        const solutionFilePath = selectedFileUri[0].fsPath;
        const workspaceFolder = path.dirname(solutionFilePath);
        const workspaceUri = Uri.file(workspaceFolder);
        await commands.executeCommand('vscode.openFolder', workspaceUri, false);

        // ✅ Update global settings immediately
        await setGlobalClarionSelection(solutionFilePath, "", "", "");

        // Step 2: Select or retrieve ClarionProperties.xml
        if (!globalClarionPropertiesFile || !fs.existsSync(globalClarionPropertiesFile)) {
            window.showWarningMessage("ClarionProperties.xml not set. Please select the file.");
            await ClarionExtensionCommands.configureClarionPropertiesFile();

            if (!globalClarionPropertiesFile || !fs.existsSync(globalClarionPropertiesFile)) {
                window.showErrorMessage("ClarionProperties.xml is required. Operation cancelled.");
                await setGlobalClarionSelection(previousSolutionFile, previousPropertiesFile, previousVersion, previousConfiguration);
                return;
            }

            // ✅ Save the new selection to workspace settings
            await setGlobalClarionSelection(globalSolutionFile, globalClarionPropertiesFile, "", "");
        }

        // Step 3: Select or retrieve the Clarion version
        if (!globalClarionVersion) {
            window.showWarningMessage("Clarion version not set. Please select a version.");
            await ClarionExtensionCommands.selectClarionVersion();

            if (!globalClarionVersion) {
                window.showErrorMessage("Clarion version is required. Operation cancelled.");
                await setGlobalClarionSelection(previousSolutionFile, previousPropertiesFile, previousVersion, previousConfiguration);
                return;
            }

            // ✅ Save the new selection to workspace settings
            await setGlobalClarionSelection(globalSolutionFile, globalClarionPropertiesFile, globalClarionVersion, globalSettings.configuration);
        }

        // Step 4: Parse ClarionProperties.xml using global variable
        const xmlContent = fs.readFileSync(globalClarionPropertiesFile, 'utf-8');
        const parsedXml = await parseStringPromise(xmlContent);
        const versions = parsedXml.ClarionProperties?.Properties?.find((p: any) => p.$.name === "Clarion.Versions");
        const selectedVersion = versions?.Properties?.find((p: any) => p.$.name === globalClarionVersion);

        if (!selectedVersion) {
            window.showErrorMessage(`Clarion version '${globalClarionVersion}' not found in ClarionProperties.xml.`);
            await setGlobalClarionSelection(previousSolutionFile, previousPropertiesFile, previousVersion, previousConfiguration);
            return;
        }

        // Step 5: Extract and update runtime global variables (NOT saved in workspace)
        globalSettings.redirectionFile =
            selectedVersion.Properties?.find((p: any) => p.$.name === "RedirectionFile")?.Name?.[0]?.$.value || "";

        globalSettings.redirectionPath =
            selectedVersion.Properties?.find((p: any) => p.$.name === "RedirectionFile")?.Properties?.find((p: any) => p.$.name === "Macros")?.reddir?.[0]?.$.value || "";

        globalSettings.macros = ClarionExtensionCommands.extractMacros(selectedVersion.Properties);
        globalSettings.libsrcPaths =
            selectedVersion.libsrc?.[0]?.$.value.split(';') || [];

        Logger.info("✅ Extracted Clarion Version Information:", {
            redirectionFile: globalSettings.redirectionFile,
            redirectionPath: globalSettings.redirectionPath,
            macros: globalSettings.macros,
            libsrcPaths: globalSettings.libsrcPaths
        });

        // Step 6: Initialize Solution Parser
        // const solutionParser = await SolutionParser.create(globalSolutionFile);
        // await solutionParser.initialize();

        commands.executeCommand('workbench.view.extension.solutionView');
        await commands.executeCommand('setContext', 'clarion.solutionOpen', true);
        window.showInformationMessage(`Clarion Solution Loaded: ${path.basename(globalSolutionFile)}`);

    } catch (error: unknown) {
        const errMessage = error instanceof Error ? error.message : String(error);
        Logger.error("❌ Error opening solution:", error);
        window.showErrorMessage(`Error opening Clarion solution: ${errMessage}`);
    }
}

async function refreshClarionSolution(isRefreshingRef: { value: boolean }) {
    if (isRefreshingRef.value) {
        Logger.info("⏳ Refresh already in progress. Skipping...");
        return;
    }

    try {
        isRefreshingRef.value = true;
        Logger.info("🔄 Refreshing Clarion Solution...");

        // ✅ Clear existing projects to prevent duplicates
        if (solutionParser) {
            Logger.info("🗑 Clearing existing solution projects...");
            solutionParser.solution.projects = []; // 🔥 Reset projects before re-parsing
        }

        // ✅ Reinitialize solution parser
        if (!solutionParser) {
            Logger.warn("⚠ Solution parser is not initialized. Creating...");
            solutionParser = await SolutionParser.create(globalSolutionFile);
        }

        // ✅ Ensure solution tree data provider is recreated properly
        if (!solutionTreeDataProvider) {
            Logger.warn("⚠ Solution tree data provider is not initialized. Creating...");
            createSolutionTreeView();
        } else {
            Logger.info("🔄 Refreshing existing solution tree...");
            solutionTreeDataProvider.refresh(); // ✅ Refresh the tree
        }

        Logger.info("✅ Solution tree refreshed.");
    } finally {
        isRefreshingRef.value = false;
    }
}

function createSolutionTreeView() {
    if (!solutionParser) {
        Logger.error("❌ Solution parser is not initialized.");
        return;
    }

    // ✅ If the tree view already exists, just refresh its data
    if (treeView && solutionTreeDataProvider) {
        Logger.info("🔄 Refreshing existing solution tree...");
        solutionTreeDataProvider.refresh();
        return;
    }

    // ✅ Create the solution tree provider
    solutionTreeDataProvider = new SolutionTreeDataProvider(solutionParser);

    commands.getCommands().then((cmds) => {
        if (!cmds.includes('clarion.openFile')) {
            const openFileCommand = commands.registerCommand(
                'clarion.openFile',
                async (filePath: string) => {
                    await solutionTreeDataProvider!.solutionParser.openFile(filePath);
                }
            );
            workspace.getConfiguration().update('clarion.openFileCommand', openFileCommand);
        }
    });

    try {
        // ✅ Create the tree view only if it doesn't exist
        treeView = window.createTreeView('solutionView', {
            treeDataProvider: solutionTreeDataProvider,
            showCollapseAll: true
        });
        Logger.info("✅ Solution tree view successfully registered.");
    } catch (error) {
        Logger.error("❌ Error registering solution tree view:", error);
    }
}

export async function activate(context: ExtensionContext): Promise<void> {
    const disposables: Disposable[] = [];

    const isRefreshingRef = { value: false };
    let solutionTreeDataProvider: SolutionTreeDataProvider | undefined;

    // ✅ Ensure the same documentManager instance is reused
    const documentManager = await DocumentManager.create(solutionParser!);
    const textEditorComponent = new TextEditorComponent(documentManager);

    // ✅ Register the open solution command
    context.subscriptions.push(commands.registerCommand('clarion.openSolution', openClarionSolution));
    context.subscriptions.push(
        commands.registerCommand("clarion.quickOpen", showClarionQuickOpen)
    );
    context.subscriptions.push(commands.registerCommand("clarion.setConfiguration", setConfiguration))

    // ✅ Override default Ctrl+P behavior to include redirection paths
    context.subscriptions.push(
        commands.registerCommand("workbench.action.quickOpen", async () => {
            await showClarionQuickOpen();
        })
    );

    // ✅ Register the manual refresh command
    context.subscriptions.push(
        commands.registerCommand('clarion.refreshSolution', async () => {
            await refreshClarionSolution(isRefreshingRef);
        })
    );


    // ✅ If workspace is already trusted, initialize immediately
    if (workspace.isTrusted && !isRefreshingRef.value) {
        await workspaceHasBeenTrusted(context, documentManager, textEditorComponent, disposables);
    } else {
        // ✅ If workspace is NOT trusted, set up an event listener for when it becomes trusted
        workspace.onDidGrantWorkspaceTrust(async () => {
            if (!isRefreshingRef.value) {
                await workspaceHasBeenTrusted(context, documentManager, textEditorComponent, disposables);
            }
        });
    }

    context.subscriptions.push(...disposables);
}

async function workspaceHasBeenTrusted(
    context: ExtensionContext,
    documentManager: DocumentManager,
    textEditorComponent: TextEditorComponent,
    disposables: Disposable[]
) {
    Logger.info("✅ Workspace has been trusted or refreshed. Initializing...");

    // 🔄 Dispose of old subscriptions to avoid duplication
    disposables.forEach(disposable => disposable.dispose());
    disposables.length = 0; // Clear the array

    disposables.push(textEditorComponent);

    function registerCommandIfNotExists(command: string, callback: (...args: any[]) => any) {
        commands.getCommands().then((cmds) => {
            if (!cmds.includes(command)) {
                const disposable = commands.registerCommand(command, callback);
                disposables.push(disposable);
            }
        });
    }

    // ✅ Load stored workspace settings and update globals
    const solutionFile = workspace.getConfiguration().get<string>('clarion.solutionFile', '') || "";
    const clarionPropertiesFile = workspace.getConfiguration().get<string>('clarion.propertiesFile', '') || "";
    const clarionVersion = workspace.getConfiguration().get<string>('clarion.version', '') || "";
    const clarionConfiguration = workspace.getConfiguration().get<string>('clarion.configuration', '') || "Release";
    await setGlobalClarionSelection(solutionFile, clarionPropertiesFile, clarionVersion, clarionConfiguration);

    // ✅ If all required settings exist, initialize solution parsing and settings
    if (globalSolutionFile && globalClarionPropertiesFile && globalClarionVersion) {
        try {
            // ✅ Read and parse ClarionProperties.xml
            const xmlContent = fs.readFileSync(globalClarionPropertiesFile, 'utf-8');
            const parsedXml = await parseStringPromise(xmlContent);

            const versions = parsedXml.ClarionProperties?.Properties?.find((p: any) => p.$.name === "Clarion.Versions");
            const selectedVersion = versions?.Properties?.find((p: any) => p.$.name === globalClarionVersion);

            if (selectedVersion) {
                // ✅ Ensure runtime global settings (NOT saved in workspace) are set properly
                globalSettings.redirectionFile =
                    selectedVersion.Properties?.find((p: any) => p.$.name === "RedirectionFile")?.Name?.[0]?.$.value ||
                    globalSettings.redirectionFile ||
                    "";

                globalSettings.redirectionPath =
                    selectedVersion.Properties?.find((p: any) => p.$.name === "RedirectionFile")?.Properties?.find((p: any) => p.$.name === "Macros")?.reddir?.[0]?.$.value ||
                    globalSettings.redirectionPath ||
                    "";

                globalSettings.macros = ClarionExtensionCommands.extractMacros(
                    selectedVersion.Properties
                );
                globalSettings.libsrcPaths =
                    selectedVersion.libsrc?.[0]?.$.value.split(';') ||
                    globalSettings.libsrcPaths ||
                    [];

                Logger.info("✅ Loaded Clarion settings from workspace:", globalSettings);
            } else {
                Logger.warn(`⚠ Clarion version '${globalClarionVersion}' not found in ClarionProperties.xml.`);
            }

            // 🔄 RESET solutionParser & documentManager
            solutionParser = await SolutionParser.create(globalSolutionFile);

            documentManager = await DocumentManager.create(solutionParser);

            // 🔄 Re-register document features
            context.subscriptions.push(
                languages.registerHoverProvider(
                    { scheme: "file", language: "clarion" },
                    new ClarionHoverProvider(documentManager)
                )
            );

            context.subscriptions.push(
                languages.registerDocumentLinkProvider(
                    { scheme: "file", language: "clarion" },
                    new ClarionDocumentLinkProvider(documentManager)
                )
            );

        } catch (error) {
            Logger.error("❌ Error parsing ClarionProperties.xml on startup:", error);
        }
    }

    // 🔄 Ensure old tree view is removed & recreated
    if (treeView) {
        treeView.dispose();
        treeView = undefined;
    }
    if (workspace.workspaceFolders) {
        createSolutionTreeView();
    }

    // ✅ Register essential commands
    registerCommandIfNotExists('clarion.followLink', () => ClarionExtensionCommands.followLink(documentManager));
    registerCommandIfNotExists('clarion.openSolutionTree', async () => {
        createSolutionTreeView();
    });

    // ✅ Restart language client
    startClientServer(context, documentManager);
}

export function deactivate(): Thenable<void> | undefined {
    stopClientServer();
    return undefined;
}

async function setConfiguration() {
    const options = ["Debug", "Release"];
    
    // Show selection prompt
    const selectedConfig = await window.showQuickPick(options, {
        placeHolder: "Select Clarion Configuration (Debug or Release)"
    });

    if (!selectedConfig) {
        window.showInformationMessage("Configuration change cancelled.");
        return;
    }

    // ✅ Update globalClarionConfiguration in memory
    globalSettings.configuration = selectedConfig;

    // ✅ Save to workspace settings
    await workspace.getConfiguration().update(
        "clarion.configuration", 
        selectedConfig, 
        ConfigurationTarget.Workspace
    );

    window.showInformationMessage(`Clarion configuration set to ${selectedConfig}`);
}
function startClientServer(context: ExtensionContext, documentManager: DocumentManager) {
    let serverModule = context.asAbsolutePath(path.join('server', 'out', 'server.js'));
    let debugOptions = { execArgv: ['--nolazy', '--inspect=6009'] };

    let serverOptions: ServerOptions = {
        run: { module: serverModule, transport: TransportKind.ipc },
        debug: {
            module: serverModule,
            transport: TransportKind.ipc,
            options: debugOptions
        }
    };

    let clientOptions: LanguageClientOptions = {
        documentSelector: [{ scheme: 'file', language: 'clarion' }],
        initializationOptions: {
            settings: workspace.getConfiguration('clarion')
        },
        synchronize: {
            fileEvents: workspace.createFileSystemWatcher('**/*.{clw,inc}')
        }
    };

    client = new LanguageClient(
        'ClarionLanguageServer',
        'Clarion Language Server',
        serverOptions,
        clientOptions
    );

    client.start();
}

function stopClientServer() {
    if (client) {
        client.stop();
        client = undefined;
    }
}





