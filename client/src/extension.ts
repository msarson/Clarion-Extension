import { ExtensionContext, languages, commands, Disposable, workspace, window } from 'vscode';
import {ClarionFoldingRangeProvider} from './ClarionFoldingRangeProvider'
// this method is called when your extension is activated
// your extension is activated the very first time the command is executed

let disposables: Disposable[] = [];


export function activate(context: ExtensionContext) {
    context.subscriptions.push(languages.registerFoldingRangeProvider({ scheme: 'file', language: 'clarion' }, new ClarionFoldingRangeProvider()));
}

export function deactivate() {
    if (disposables) {
        disposables.forEach(item => item.dispose());
    }
    disposables = [];
}