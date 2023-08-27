import { ExtensionContext, workspace } from 'vscode';
import * as path from 'path';
import { LanguageClient, LanguageClientOptions, ServerOptions, TransportKind } from 'vscode-languageclient/node';
import * as vscode from 'vscode';
import { ClarionExtensionCommands } from './ClarionExtensionCommands';
import { registerProviders } from './provider'; // Import the new registration function
import { DocumentManager } from './documentManager';
import { TextEditorComponent } from './TextEditorComponent';
let client: LanguageClient;

export async function activate(context: ExtensionContext) {



    // Check if the workspace is trusted
    

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
    //Register the commands

    // const disposable = vscode.commands.registerCommand('clarion.configureClarionPropertiesFile', () => {
    //     vscode.window.showInformationMessage('Hello, World!');
    // });
    // context.subscriptions.push(disposable);

    const disposable = vscode.commands.registerCommand('clarion.configureClarionPropertiesFile', ClarionExtensionCommands.configureClarionPropertiesFile);
    context.subscriptions.push(disposable);


    
    const soultutionFileSelector = vscode.commands.registerCommand('clarion.selectSolutionFile', ClarionExtensionCommands.selectSolutionFile);
    context.subscriptions.push(soultutionFileSelector);

    
   const documentManager = new DocumentManager();
    context.subscriptions.push(
        vscode.commands.registerCommand('clarion.followLink', async () => {
            const editor = vscode.window.activeTextEditor;

            if (editor) {
                const position = editor.selection.active;
                const linkUri = documentManager.getLinkUri(editor.document.uri, position);
                if (linkUri) {
                    vscode.commands.executeCommand('vscode.open', linkUri);
                } else {
                    vscode.window.showInformationMessage('No link found at the cursor position.');
                }
                //vscode.commands.executeCommand('vscode.open', linkUri);
            }
        })
    );

    vscode.window.onDidChangeTextEditorSelection(async (event) => {
        const editor = event.textEditor;
        if (editor) {
            const document = editor.document;
            if (document === vscode.window.activeTextEditor?.document) {
                // Update links for the focused document
                documentManager.updateDocumentInfo(document);
            }
        }
    });
    const textEditorComponent = new TextEditorComponent(documentManager);
    context.subscriptions.push(documentManager);
    context.subscriptions.push(textEditorComponent);

    // Register providers after Language Client is started and configurations are updated
    await ClarionExtensionCommands.updateWorkspaceConfigurations();
    registerProviders(context, documentManager);

    for (const openDocument of vscode.workspace.textDocuments) {
        documentManager.updateDocumentInfo(openDocument);
    }
    

    // Re-register providers when workspace trust is granted
    vscode.workspace.onDidGrantWorkspaceTrust(() => {
        registerProviders(context, documentManager);
        for (const openDocument of vscode.workspace.textDocuments) {
            documentManager.updateDocumentInfo(openDocument);
        }
    });
    if (workspace.workspaceFolders) {
        // Call the method to update workspace configurations
        await ClarionExtensionCommands.updateWorkspaceConfigurations();
    }
}


export function deactivate(): Thenable<void> | undefined {
    if (!client) {
        return undefined;
    }
    return client.stop();
}


