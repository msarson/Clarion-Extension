import { ExtensionContext, workspace } from 'vscode';
import * as path from 'path';
import { LanguageClient, LanguageClientOptions, ServerOptions, TransportKind } from 'vscode-languageclient/node';
import * as vscode from 'vscode';
import { ClarionExtensionCommands } from './ClarionExtensionCommands';
import { registerProviders } from './provider'; // Import the new registration function

let client: LanguageClient;

export async function activate(context: ExtensionContext) {
    const disposable = vscode.commands.registerCommand('clarion.configureClarionPropertiesFile', ClarionExtensionCommands.configureClarionPropertiesFile);
    context.subscriptions.push(disposable);

    if (workspace.workspaceFolders) {
        // Call the method to update workspace configurations
        await ClarionExtensionCommands.updateWorkspaceConfigurations();
    }

    // Register providers initially
    registerProviders(context);

    // Re-register providers when workspace trust is granted
    vscode.workspace.onDidGrantWorkspaceTrust(() => {
        registerProviders(context);
    });

    let serverModule = context.asAbsolutePath(
        path.join('server', 'out', 'server.js')
    );

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
        // js is used to trigger things
        documentSelector: [{ scheme: 'file', language: 'clarion' }],
        initializationOptions: {
            settings: workspace.getConfiguration('clarion')
        },
        synchronize: {
            // Notify the server about file changes to '.clientrc files contained in the workspace
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

export function deactivate(): Thenable<void> | undefined {
    if (!client) {
        return undefined;
    }
    return client.stop();
}


