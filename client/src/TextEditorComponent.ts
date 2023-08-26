import * as vscode from 'vscode';
import { DocumentManager } from './documentManager'; // Adjust the import path based on your project structure

export class TextEditorComponent implements vscode.Disposable {
    private documentManager: DocumentManager;
    private refreshDisposable: vscode.Disposable;

    constructor(documentManager: DocumentManager) {
        this.documentManager = documentManager;
        this.refreshDisposable = this.documentManager.onRefreshNeeded(uri => {
            this.refreshTextEditor(uri);
        });
    }

    private refreshTextEditor(uri: vscode.Uri) {
        const textEditor = vscode.window.visibleTextEditors.find(editor => editor.document.uri === uri);
        if (textEditor) {
            const refreshedContent = this.documentManager.getDocumentContent(uri) || ''; // Default to empty string if content is undefined

            // Update the text editor's content
            const edit = new vscode.TextEdit(new vscode.Range(0, 0, textEditor.document.lineCount, 0), refreshedContent);
            const workspaceEdit = new vscode.WorkspaceEdit();
            workspaceEdit.set(uri, [edit]);
            console.log('refreshTextEditor:', uri.toString());
            vscode.workspace.applyEdit(workspaceEdit);
        }
    }

    dispose() {
        this.refreshDisposable.dispose();
    }
}
