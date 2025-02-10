import { commands, Uri, window, ExtensionContext, TreeView, workspace, Disposable, languages, ConfigurationTarget } from 'vscode';
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
import { globalClarionPropertiesFile, globalClarionVersion, globalSettings, globalSolutionFile, setGlobalClarionSelection } from './globals';
import { parseStringPromise } from 'xml2js';

import * as fs from 'fs';

let client: LanguageClient | undefined;
let solutionParser: SolutionParser | undefined;
let treeView: TreeView<TreeNode> | undefined;

// Additional globals for runtime use only



export async function openClarionSolution() {
    try {
        // Step 1: Ask the user to select a `.sln` file
        const selectedFileUri = await window.showOpenDialog({
            canSelectFiles: true,
            canSelectFolders: false,
            openLabel: 'Select Clarion Solution (.sln)',
            filters: { "Solution Files": ["sln"] }
        });

        if (!selectedFileUri || selectedFileUri.length === 0) {
            window.showErrorMessage("No solution file selected.");
            return;
        }

        const solutionFilePath = selectedFileUri[0].fsPath;
        const workspaceFolder = path.dirname(solutionFilePath);
        const workspaceUri = Uri.file(workspaceFolder);
        await commands.executeCommand('vscode.openFolder', workspaceUri, false);

        // ✅ Update global settings immediately
        await setGlobalClarionSelection(solutionFilePath, globalClarionPropertiesFile, globalClarionVersion);

        // Step 2: Select or retrieve ClarionProperties.xml
        if (!globalClarionPropertiesFile || !fs.existsSync(globalClarionPropertiesFile)) {
            window.showWarningMessage("ClarionProperties.xml not set. Please select the file.");
            await ClarionExtensionCommands.configureClarionPropertiesFile();

            if (!globalClarionPropertiesFile || !fs.existsSync(globalClarionPropertiesFile)) {
                window.showErrorMessage("ClarionProperties.xml is required. Operation cancelled.");
                return;
            }

            // ✅ Save the new selection to workspace settings
            await setGlobalClarionSelection(globalSolutionFile, globalClarionPropertiesFile, globalClarionVersion);
        }

        // Step 3: Select or retrieve the Clarion version
        if (!globalClarionVersion) {
            window.showWarningMessage("Clarion version not set. Please select a version.");
            await ClarionExtensionCommands.selectClarionVersion();

            if (!globalClarionVersion) {
                window.showErrorMessage("Clarion version is required. Operation cancelled.");
                return;
            }

            // ✅ Save the new selection to workspace settings
            await setGlobalClarionSelection(globalSolutionFile, globalClarionPropertiesFile, globalClarionVersion);
        }

        // Step 4: Parse ClarionProperties.xml using global variable
        const xmlContent = fs.readFileSync(globalClarionPropertiesFile, 'utf-8');
        const parsedXml = await parseStringPromise(xmlContent);
        const versions = parsedXml.ClarionProperties?.Properties?.find((p: any) => p.$.name === "Clarion.Versions");
        const selectedVersion = versions?.Properties?.find((p: any) => p.$.name === globalClarionVersion);

        if (!selectedVersion) {
            window.showErrorMessage(`Clarion version '${globalClarionVersion}' not found in ClarionProperties.xml.`);
            return;
        }

        // Step 5: Extract and update runtime global variables (NOT saved in workspace)
        globalSettings.redirectionFile =
            selectedVersion.Properties?.find((p: any) => p.$.name === "RedirectionFile")?.Name?.[0]?.$.value || "";

        globalSettings.redirectionPath =
            selectedVersion.Properties?.find((p: any) => p.$.name === "RedirectionFile")?.Properties?.find((p: any) => p.$.name === "Macros")?.reddir?.[0]?.$.value || "";

        // globalSettings.macros = 
        //      selectedVersion.Properties?.find((p: any) => p.$.name === "RedirectionFile")?.Properties?.find((p: any) => p.$.name === "Macros") || {};
        globalSettings.macros = ClarionExtensionCommands.extractMacros(
            selectedVersion.Properties
        );
        globalSettings.libsrcPaths =
            selectedVersion.libsrc?.[0]?.$.value.split(';') || [];


        Logger.info("✅ Extracted Clarion Version Information:", {
            redirectionFile: globalSettings.redirectionFile,
            redirectionPath: globalSettings.redirectionPath,
            macros: globalSettings.macros,
            libsrcPaths: globalSettings.libsrcPaths
        });

        // Step 6: Initialize Solution Parser
        const solutionParser = new SolutionParser(globalSolutionFile);
        await solutionParser.initialize();

        commands.executeCommand('workbench.view.extension.solutionView');
        window.showInformationMessage(`Clarion Solution Loaded: ${path.basename(globalSolutionFile)}`);

    } catch (error: unknown) {
        const errMessage = error instanceof Error ? error.message : String(error);
        Logger.error("❌ Error opening solution:", error);
        window.showErrorMessage(`Error opening Clarion solution: ${errMessage}`);
    }
}




let solutionTreeDataProvider: SolutionTreeDataProvider | undefined; // Store globally

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

    let isRefreshing = false;
    let solutionTreeDataProvider: SolutionTreeDataProvider | undefined;

    // ✅ Ensure the same documentManager instance is reused
    const documentManager = new DocumentManager(solutionParser!);
    const textEditorComponent = new TextEditorComponent(documentManager);

    // ✅ Register the open solution command
    context.subscriptions.push(commands.registerCommand('clarion.openSolution', openClarionSolution));

    // ✅ Register the manual refresh command
    context.subscriptions.push(
        commands.registerCommand('clarion.refreshSolution', async () => {
            if (isRefreshing) {
                Logger.info("⏳ Refresh already in progress. Skipping...");
                return;
            }
    
            try {
                isRefreshing = true;
                Logger.info("🔄 Refreshing Clarion Solution...");
    
                // ✅ Clear existing projects to prevent duplicates
                if (solutionParser) {
                    Logger.info("🗑 Clearing existing solution projects...");
                    solutionParser.solution.projects = []; // 🔥 Reset projects before re-parsing
                }
    
                // ✅ Reinitialize solution parser
                if (!solutionParser) {
                    Logger.warn("⚠ Solution parser is not initialized. Creating...");
                    solutionParser = new SolutionParser(globalSolutionFile);
                }
                await solutionParser.initialize();
    
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
                isRefreshing = false;
            }
        })
    );
    
    
    

    // ✅ If workspace is already trusted, initialize immediately
    if (workspace.isTrusted && !isRefreshing) {
        await workspaceHasBeenTrusted(context, documentManager, textEditorComponent, disposables);
    } else {
        // ✅ If workspace is NOT trusted, set up an event listener for when it becomes trusted
        workspace.onDidGrantWorkspaceTrust(async () => {
            if (!isRefreshing) {
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

    await setGlobalClarionSelection(solutionFile, clarionPropertiesFile, clarionVersion);

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
            solutionParser = new SolutionParser(globalSolutionFile);
            await solutionParser.initialize();

            documentManager = new DocumentManager(solutionParser);
            await documentManager.initialize(solutionParser);

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
   // registerCommandIfNotExists('clarion.selectSolutionFile', ClarionExtensionCommands.selectSolutionFile);
    registerCommandIfNotExists('clarion.followLink', () => ClarionExtensionCommands.followLink(documentManager));
    // registerCommandIfNotExists('clarion.inspectFullPath', async () => {
    //     await documentManager.inspectFullPath();
    // });
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

async function handleTrustedWorkspace(
    context: ExtensionContext,
    documentManager: DocumentManager,
    textEditorComponent: TextEditorComponent,
    disposables: Disposable[]
) {
    if (!workspace.isTrusted) {
        return;
    }

    disposables.push(textEditorComponent);

    const existingCommands = await commands.getCommands();

    function registerCommandIfNotExists(command: string, callback: (...args: any[]) => any) {
        if (!existingCommands.includes(command)) {
            const disposable = commands.registerCommand(command, callback);
            disposables.push(disposable);
        }
    }

  //  registerCommandIfNotExists('clarion.selectSolutionFile', ClarionExtensionCommands.selectSolutionFile);
    registerCommandIfNotExists('clarion.followLink', () => ClarionExtensionCommands.followLink(documentManager));
    // registerCommandIfNotExists('clarion.inspectFullPath', async () => {
    //     await documentManager.inspectFullPath();
    // });
    registerCommandIfNotExists('clarion.openSolutionTree', async () => {
        createSolutionTreeView();
    });
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
