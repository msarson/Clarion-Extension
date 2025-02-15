import { commands, Uri, window, ExtensionContext, TreeView, workspace, Disposable, languages, ConfigurationTarget, TextDocument, QuickPickItem } from 'vscode';
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
import { RedirectionFileParser } from './UtilityClasses/RedirectionFileParser';

let client: LanguageClient | undefined;
let solutionParser: SolutionParser | undefined;
let treeView: TreeView<TreeNode> | undefined;
let solutionTreeDataProvider: SolutionTreeDataProvider | undefined;
let documentManager: DocumentManager | undefined;



export async function activate(context: ExtensionContext): Promise<void> {

    // ✅ Correctly check if `tabGroups` exists
    const hasTabGroups = "tabGroups" in window;

    const disposables: Disposable[] = [];
    const isRefreshingRef = { value: false };
    const logger = new Logger();

    logger.info("🔄 Activating Clarion extension...");

    // ✅ Step 1: Load workspace settings and update global settings before initialization
    await globalSettings.initializeFromWorkspace();

    // ✅ Step 2: Register commands
    context.subscriptions.push(commands.registerCommand("clarion.openSolution", openClarionSolution));
    context.subscriptions.push(commands.registerCommand("clarion.quickOpen", showClarionQuickOpen));
    context.subscriptions.push(commands.registerCommand("clarion.setConfiguration", setConfiguration));

    // ✅ Watch for changes in Clarion configuration settings
    context.subscriptions.push(
        workspace.onDidChangeConfiguration(async (event) => {
            if (event.affectsConfiguration("clarion.defaultLookupExtensions")) {
                const logger = new Logger();
                logger.info("🔄 Clarion defaultLookupExtensions changed. Refreshing document links...");

                await handleSettingsChange(context);
            }
        })
    );



    // ✅ Ensure workspace trust event is handled
    if (workspace.isTrusted && !isRefreshingRef.value) {
        // ✅ 🔄 Ensure ALL restored tabs are properly indexed
        await refreshOpenDocuments();
        await workspaceHasBeenTrusted(context, disposables);
    } else {
        workspace.onDidGrantWorkspaceTrust(async () => {
            if (!isRefreshingRef.value) {
                // ✅ 🔄 Ensure ALL restored tabs are properly indexed
                await refreshOpenDocuments();
                await workspaceHasBeenTrusted(context, disposables);
            }
        });
    }

    context.subscriptions.push(...disposables);
}



/**
 * Retrieves all open documents across all tab groups.
 */

/**
 * Retrieves all open documents across all tab groups.
 * If a document is not tracked in `workspace.textDocuments`, it forces VS Code to load it.
 */
export async function getAllOpenDocuments(): Promise<TextDocument[]> {
    const logger = new Logger(); // Replace with your Logger instance if needed
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
        return window.visibleTextEditors.map(editor => editor.document);
    }

    logger.info(`🔍 Found ${openDocuments.length} open documents.`);
    return openDocuments;
}


async function handleSettingsChange(context: ExtensionContext) {
    const logger = new Logger();

    // ✅ Reinitialize global settings from workspace settings.json
    await globalSettings.initializeFromWorkspace();
    logger.info(`🔄 Settings updated! New lookup extensions: ${JSON.stringify(globalSettings.defaultLookupExtensions)}`);

    // ✅ Dispose of old solutionParser and documentManager
    if (solutionParser) {
        logger.info("🔄 Disposing of existing SolutionParser instance...");
        solutionParser = undefined; // Remove the current instance
    }

    logger.info("🔄 Reinitializing SolutionParser...");
    solutionParser = await SolutionParser.create(globalSolutionFile);

    if (documentManager) {
        logger.info("🔄 Disposing of existing DocumentManager instance...");
        documentManager = undefined; // Remove the current instance
    }

    logger.info("📝 Reinitializing DocumentManager...");
    documentManager = await DocumentManager.create(solutionParser);

    // ✅ Refresh Open Documents
    logger.info("🔄 Refreshing open documents...");
    await refreshOpenDocuments();

    // ✅ Re-register Language Features (Document Links & Hover)
    registerLanguageFeatures(context);  // 🔹 Call this function to re-register providers
}
function registerLanguageFeatures(context: ExtensionContext) {
    const logger = new Logger();

    if (!documentManager) {
        logger.warn("⚠️ Cannot register language features: documentManager is undefined!");
        return;
    }

    logger.info("🔗 Re-registering Document Link Provider...");
    context.subscriptions.push(
        languages.registerDocumentLinkProvider(
            { scheme: "file", language: "clarion" },
            new ClarionDocumentLinkProvider(documentManager)
        )
    );

    logger.info("📝 Re-registering Hover Provider...");
    context.subscriptions.push(
        languages.registerHoverProvider(
            { scheme: "file", language: "clarion" },
            new ClarionHoverProvider(documentManager)
        )
    );
}

async function refreshOpenDocuments() {


    const logger = new Logger(false);

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
        logger.info(`🔄 Refreshing document: ${documentUri.fsPath}`);

        // ✅ Ensure the document manager updates the links
        if (documentManager) {
            await documentManager.updateDocumentInfo(document);
        }
    }

    logger.info(`✅ Successfully refreshed ${openDocuments.length} open documents.`);
}






async function workspaceHasBeenTrusted(context: ExtensionContext, disposables: Disposable[]): Promise<void> {
    const logger = new Logger();
    logger.info("✅ Workspace has been trusted or refreshed. Initializing...");

    // Ensure default settings are applied
    await globalSettings.initialize();

    // Dispose of old subscriptions to avoid duplication
    disposables.forEach(disposable => disposable.dispose());
    disposables.length = 0;
    await globalSettings.initializeFromWorkspace();
    // Load stored workspace settings and update global variables

    // Ensure Solution Parser and Document Manager are initialized
    if (!solutionParser && globalSolutionFile) {
        solutionParser = await SolutionParser.create(globalSolutionFile);
    }

    if (!documentManager && solutionParser) {
        documentManager = await DocumentManager.create(solutionParser);
    }

    // Ensure document features are registered
    if (documentManager) {
        registerLanguageFeatures(context);
    } else {
        logger.warn("⚠️ DocumentManager is undefined! Skipping providers.");
    }

    // Ensure solution tree view is created or updated
    createSolutionTreeView();

    // Restart language client
    startClientServer(context, documentManager!);
}




function createSolutionTreeView() {
    if (!solutionParser) return;

    if (treeView && solutionTreeDataProvider) {
        solutionTreeDataProvider.refresh();
        return;
    }

    solutionTreeDataProvider = new SolutionTreeDataProvider(solutionParser);
    treeView = window.createTreeView("solutionView", {
        treeDataProvider: solutionTreeDataProvider,
        showCollapseAll: true
    });
}

export async function openClarionSolution() {
    const logger = new Logger(); 
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

        logger.info("✅ Extracted Clarion Version Information:", {
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
        logger.error("❌ Error opening solution:", error);
        window.showErrorMessage(`Error opening Clarion solution: ${errMessage}`);
    }
}




export async function showClarionQuickOpen(): Promise<void> {
    const logger = new Logger();
    const fileItems: QuickPickItem[] = [];
    const seenFiles = new Set<string>(); // ✅ Prevent duplicates

    // ✅ Get the allowed file extensions (normalized to lowercase)
    const allowedExtensions = globalSettings.fileSearchExtensions.map(ext => ext.toLowerCase());

    logger.info(`🔍 Searching for files with extensions: ${JSON.stringify(allowedExtensions)}`);
    let searchPaths: string[] = [];

    solutionParser?.solution.projects.forEach(project => {
        const redirectionParser = new RedirectionFileParser(globalSettings.configuration, project.path);
        allowedExtensions.forEach(ext => {
            const pathsForExt = redirectionParser.getSearchPaths(ext, globalSettings.redirectionPath);
            searchPaths.push(...pathsForExt);
        });
    }); // ✅ Closing parenthesis added here!

    // ✅ Remove duplicates more efficiently
    searchPaths = [...new Set(searchPaths)];
    logger.info(`📂 Using search paths: ${JSON.stringify(searchPaths)}`);

    // ✅ Fetch all workspace files (initial search)
    const workspaceFiles = await workspace.findFiles(`**/*.*`);

    // ✅ Process each search path
    for (const searchPath of searchPaths) {
        try {
            // 🔹 Convert to a relative glob pattern (for workspace paths)
            const relativeSearchPath = path.relative(workspace.rootPath || '', searchPath).replace(/\\/g, '/');

            if (workspace.rootPath && searchPath.startsWith(workspace.rootPath)) {
                // ✅ Inside workspace → Use `workspace.findFiles`
                const files = await workspace.findFiles(`${relativeSearchPath}/**/*.*`);
                workspaceFiles.push(...files);
            } else {
                // ✅ Outside workspace → Use `fs.readdirSync`
                logger.info(`📌 Searching manually outside workspace: ${searchPath}`);
                const externalFiles = listFilesRecursively(searchPath);
                workspaceFiles.push(...externalFiles.map(f => Uri.file(f)));
            }
        } catch (error) {
            if (error instanceof Error) {
                logger.warn(`⚠️ Error accessing search path: ${searchPath} - ${error.message}`);
            }
        }
    }
    // ✅ Function to list files manually (for external paths)
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

    // ✅ Process and filter files
    workspaceFiles.forEach(file => {
        const filePath = file.fsPath;
        const fileExt = path.extname(filePath).toLowerCase(); // ✅ Extract and normalize extension

        if (!seenFiles.has(filePath) && allowedExtensions.includes(fileExt)) {
            seenFiles.add(filePath);
            fileItems.push({
                label: path.basename(filePath),
                description: `Workspace (${path.dirname(filePath)})`,
                detail: filePath
            });
        }
    });

    // ✅ Handle case where no matching files are found
    if (fileItems.length === 0) {
        window.showErrorMessage("No matching Clarion files found in the workspace.");
        return;
    }

    // ✅ Show the Quick Pick menu
    const selection = await window.showQuickPick(fileItems, {
        placeHolder: "Select a Clarion file to open..."
    });

    // ✅ Open the selected file
    if (selection?.detail) {
        const doc = await workspace.openTextDocument(Uri.file(selection.detail));
        await window.showTextDocument(doc);
    }
}


async function setConfiguration() {
    const options = ["Debug", "Release"];

    const selectedConfig = await window.showQuickPick(options, {
        placeHolder: "Select Clarion Configuration"
    });

    if (!selectedConfig) return;

    globalSettings.configuration = selectedConfig;
    await workspace.getConfiguration().update("clarion.configuration", selectedConfig, ConfigurationTarget.Workspace);
    window.showInformationMessage(`Clarion configuration set to ${selectedConfig}`);
}

export function deactivate(): Thenable<void> | undefined {
    stopClientServer();
    return undefined;
}

function startClientServer(context: ExtensionContext, documentManager: DocumentManager) {
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
    client.start();
}

function stopClientServer() {
    if (client) {
        client.stop();
        client = undefined;
    }
}
