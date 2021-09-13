import { ExtensionContext, languages, commands, Disposable, workspace, window } from 'vscode';
import * as path from 'path';
import { LanguageClient, LanguageClientOptions, ServerOptions, TransportKind } from 'vscode-languageclient';
import { ClarionDocumentSymbolProvider } from './ClarionDocumentSymbolProvider';
// this method is called when your extension is activated
// your extension is activated the very first time the command is executed

//let disposables: Disposable[] = [];
let client: LanguageClient;

export function activate(context: ExtensionContext) {
   context.subscriptions.push(languages.registerDocumentSymbolProvider({ scheme: 'file', language: 'clarion' }, new ClarionDocumentSymbolProvider()));
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
        synchronize: {
            // Notify the server about file changes to '.clientrc files contained in the workspace
            fileEvents: workspace.createFileSystemWatcher('**/.clientrc')
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
