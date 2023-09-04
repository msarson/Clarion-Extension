import { commands, Uri, window,  workspace, Disposable, TextEdit, Range, WorkspaceEdit } from 'vscode';
import { DocumentManager } from './documentManager'; // Adjust the import path based on your project structure

export class TextEditorComponent implements Disposable {
    private documentManager: DocumentManager;

    constructor(documentManager: DocumentManager) {
        this.documentManager = documentManager;
        // this.refreshDisposable = this.documentManager.onRefreshNeeded(uri => {
        //     this.refreshTextEditor(uri);
        // });
    }

    private refreshTextEditor(uri: Uri) {
        const textEditor = window.visibleTextEditors.find(editor => editor.document.uri === uri);
        if (textEditor) {
            const refreshedContent = this.documentManager.getDocumentContent(uri) || ''; // Default to empty string if content is undefined

            // Update the text editor's content
            const edit = new TextEdit(new Range(0, 0, textEditor.document.lineCount, 0), refreshedContent);
            const workspaceEdit = new WorkspaceEdit();
            workspaceEdit.set(uri, [edit]);
            console.log('refreshTextEditor:', uri.toString());
            workspace.applyEdit(workspaceEdit);
        }
    }

    dispose() {
        //  this.refreshDisposable.dispose();
    }
}
