import { ExtensionContext, workspace, Disposable, languages } from 'vscode';
import * as path from 'path';
import { LanguageClient, LanguageClientOptions, ServerOptions, TransportKind } from 'vscode-languageclient/node';
import * as vscode from 'vscode';
import { ClarionExtensionCommands } from './ClarionExtensionCommands';

import { TextEditorComponent } from './TextEditorComponent';
import { ClarionHoverProvider } from './providers/hoverProvider';
import { ClarionDocumentLinkProvider } from './providers/documentLinkProvier';
import { DocumentManager } from './documentManager';
import { RedirectionFileParser } from './UtilityClasses/RedirectionFileParser';
let client: LanguageClient | undefined;

export async function activate(context: ExtensionContext) {

    const disposables: Disposable[] = [];

    // Check if the workspace is trusted
    const isWorkspaceTrusted = workspace.isTrusted;
    const documentManager = new DocumentManager();
    const textEditorComponent = new TextEditorComponent(documentManager);
    const selectionHandler = vscode.window.onDidChangeTextEditorSelection(async (event) => {
        const editor = event.textEditor;
        if (editor) {
            const document = editor.document;
            if (document === vscode.window.activeTextEditor?.document) {
                // Update links for the focused document
                documentManager.updateDocumentInfo(document);
            }
        }
    });

    handleTrustedWorkspace(context, documentManager, textEditorComponent, selectionHandler, disposables);
    if (isWorkspaceTrusted) {
        startClientServer(context, documentManager);
        
    }

    // Re-register providers when workspace trust is granted
    vscode.workspace.onDidGrantWorkspaceTrust(() => {
        handleTrustedWorkspace(context, documentManager, textEditorComponent, selectionHandler, disposables);
        if (workspace.isTrusted) {
            startClientServer(context, documentManager);
            
        } else {
            stopClientServer();
        }
    });

    if (workspace.workspaceFolders) {
        // Call the method to update workspace configurations
        if (isWorkspaceTrusted) {
            await ClarionExtensionCommands.updateWorkspaceConfigurations();
        }
    }
}

export function deactivate(): Thenable<void> | undefined {
    stopClientServer();
    return undefined;
}

function handleTrustedWorkspace(context: ExtensionContext, documentManager: DocumentManager, textEditorComponent: TextEditorComponent, selectionHandler: vscode.Disposable, disposables: Disposable[]) {
    if (workspace.isTrusted) {
        const documentSelector = [
            { language: 'clarion', scheme: 'file' }
        ];

        const documentLinkProvider = new ClarionDocumentLinkProvider(documentManager);
        const hoverProvider = new ClarionHoverProvider(documentManager);
        disposables.push(
            textEditorComponent,
            selectionHandler,
            vscode.commands.registerCommand('clarion.followLink', () => ClarionExtensionCommands.followLink(documentManager)),
            vscode.commands.registerCommand('clarion.configureClarionPropertiesFile', ClarionExtensionCommands.configureClarionPropertiesFile),
            vscode.commands.registerCommand('clarion.selectSolutionFile', ClarionExtensionCommands.selectSolutionFile),
            languages.registerDocumentLinkProvider('clarion', documentLinkProvider),
            languages.registerHoverProvider(documentSelector, hoverProvider)
        );
    } else {
        disposables.forEach(disposable => disposable.dispose());
        disposables.length = 0;
    }
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
  //  const projectFiles = findAndStoreProjectFiles();
    for (const openDocument of vscode.workspace.textDocuments) {
        documentManager.updateDocumentInfo(openDocument);
    }
}

function stopClientServer() {
    if (client) {
        client.stop();
        client = undefined;
    }
}
interface ProjectFolderInfo {
    path: string;
    fileType: string;
    searchPaths: string[];
}
export async function findAndStoreProjectFiles(): Promise<ProjectFolderInfo[]> {
    const projectFolders: ProjectFolderInfo[] = [];
    const projectFilesByFolder: Map<string, vscode.Uri> = new Map(); // To store the first project file found in each folder

    // Search for all project files in the workspace
    const projectFileUris = await vscode.workspace.findFiles('**/*.cwproj', '**/node_modules/**', 1000);

    // Iterate through the found project files
    for (const uri of projectFileUris) {
        const folderPath = path.dirname(uri.fsPath);

        if (folderPath) {
            // If there's no project file stored for this folder, store the current one
            if (!projectFilesByFolder.has(folderPath)) {
                projectFilesByFolder.set(folderPath, uri);
            
                // Check if the URI is not already in the projectFiles array before pushing
                if (!projectFolders.some(existingFolder  => existingFolder.path === folderPath)) {
                    const redir = new RedirectionFileParser("Debug");
                    const fileTypes = ["clw", "inc", "equ"];
                    for (const fileType of fileTypes) {
                        const typeRedirPath = redir.getSearchPaths(`*.${fileType}`, folderPath);
                        projectFolders.push({
                            path: folderPath,
                            fileType,
                            searchPaths: [...typeRedirPath]
                        });
                    }
                    
                }
            }
        }
    }

    return projectFolders;
}





