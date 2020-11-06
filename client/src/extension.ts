import { ExtensionContext, languages, commands, Disposable, workspace, window } from 'vscode';
import { CodelensProvider } from './CodelensProvider';
import {ClarionFoldingRangeProvider} from './ClarionFoldingRangeProvider'
// this method is called when your extension is activated
// your extension is activated the very first time the command is executed

let disposables: Disposable[] = [];
// import {
// 	LanguageClient,
// 	LanguageClientOptions,
// 	ServerOptions,
// 	TransportKind
// } from 'vscode-languageclient';
export function activate(context: ExtensionContext) {
    
    context.subscriptions.push(languages.registerFoldingRangeProvider({ scheme: 'file', language: 'clarion' }, new ClarionFoldingRangeProvider()));
    // const codelensProvider = new CodelensProvider();



    // languages.registerCodeLensProvider("*", codelensProvider);

    // commands.registerCommand("clarion.enableCodeLens", () => {
    //     workspace.getConfiguration("clarion").update("enableCodeLens", true, true);
    // });

    // commands.registerCommand("clarion.disableCodeLens", () => {
    //     workspace.getConfiguration("clarion").update("enableCodeLens", false, true);
    // });

    // commands.registerCommand("clarion.codelensAction", (args: any) => {
    //     window.showInformationMessage(`CodeLens action clicked with args=${args}`);
    // });
  
}

export function deactivate() {
    if (disposables) {
        disposables.forEach(item => item.dispose());
    }
    disposables = [];
}