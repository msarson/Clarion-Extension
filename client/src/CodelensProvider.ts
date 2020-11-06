import { Console } from 'console';
import { FILE } from 'dns';
import * as vscode from 'vscode';
import { LanguageClient } from 'vscode-languageclient';

/**
 * CodelensProvider
 */
export class CodelensProvider implements vscode.CodeLensProvider {

    private codeLenses: vscode.CodeLens[] = [];
    private regex: RegExp;
    private _onDidChangeCodeLenses: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
    public readonly onDidChangeCodeLenses: vscode.Event<void> = this._onDidChangeCodeLenses.event;

    constructor() {
        this.regex = /(.+)/g;

        vscode.workspace.onDidChangeConfiguration((_) => {
            this._onDidChangeCodeLenses.fire();
        });
    }

    public provideCodeLenses(document: vscode.TextDocument, token: vscode.CancellationToken): vscode.CodeLens[] | Thenable<vscode.CodeLens[]> {
        if (document.fileName.includes('.clw')) {
            if (vscode.workspace.getConfiguration("clarion").get("enableCodeLens", true)) {
                this.codeLenses = [];
                const regex = new RegExp(this.regex);
                const text = document.getText();
                let matches;
                while ((matches = regex.exec(text)) !== null) {
                    const line = document.lineAt(document.positionAt(matches.index).line);
                    const indexOf = line.text.indexOf(matches[0]);
                    const position = new vscode.Position(line.lineNumber, indexOf);
                    const range = document.getWordRangeAtPosition(position, new RegExp(this.regex));
                    if (range) {
                        this.codeLenses.push(new vscode.CodeLens(range));
                    }
                }
                return this.codeLenses;
            }
        }
        return [];
    }

    public resolveCodeLens(codeLens: vscode.CodeLens, token: vscode.CancellationToken) {
        if (vscode.workspace.getConfiguration("clarion").get("enableCodeLens", true)) {
            codeLens.command = {
                title: "Codelens provided by clarion extension MJS",
                tooltip: "Tooltip provided by clarion extension",
                command: "clarion.codelensAction",
                arguments: ["Argument arb", false]
            };
            return codeLens;
        }
        return null;
    }
}

