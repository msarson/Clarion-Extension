import { ExtensionContext, workspace, Disposable, languages } from 'vscode';
import * as path from 'path';
import { LanguageClient, LanguageClientOptions, ServerOptions, TransportKind } from 'vscode-languageclient/node';
import * as vscode from 'vscode';
import { ClarionExtensionCommands } from './ClarionExtensionCommands';

import { TextEditorComponent } from './TextEditorComponent';
import { ClarionHoverProvider } from './providers/hoverProvider';
import { ClarionDocumentLinkProvider } from './providers/documentLinkProvier';
import { DocumentManager } from './documentManager';
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
        startClientServer(context);
        for (const openDocument of vscode.workspace.textDocuments) {
            documentManager.updateDocumentInfo(openDocument);
        }
    }

    // Re-register providers when workspace trust is granted
    vscode.workspace.onDidGrantWorkspaceTrust(() => {
        handleTrustedWorkspace(context, documentManager, textEditorComponent, selectionHandler, disposables);
        if (workspace.isTrusted) {
            startClientServer(context);
            for (const openDocument of vscode.workspace.textDocuments) {
                documentManager.updateDocumentInfo(openDocument);
            }
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
            languages.registerDocumentLinkProvider('clarion', documentLinkProvider),
            languages.registerHoverProvider(documentSelector, hoverProvider)
        );
    } else {
        disposables.forEach(disposable => disposable.dispose());
        disposables.length = 0;
    }
}

function startClientServer(context: ExtensionContext) {
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
