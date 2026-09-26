import { commands, window, workspace, Disposable, ViewColumn, Uri, Range, Position, WebviewPanel, ProgressLocation } from 'vscode';
import { getLanguageClient } from '../LanguageClientManager';
import { renderUnresolvedReport, UnresolvedReportData } from '../views/UnresolvedReferencesReport';

/**
 * #687 (experimental) — Clarion: Unresolved File References. Asks the server to rescan the file
 * graph's files for references that do not resolve, and shows them in a webview; a row opens the
 * reference. One panel, reused and refreshed on each run.
 */
let panel: WebviewPanel | undefined;

function nonce(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let text = '';
    for (let i = 0; i < 32; i++) text += chars.charAt(Math.floor(Math.random() * chars.length));
    return text;
}

async function showUnresolvedReferences(): Promise<void> {
    const client = getLanguageClient();
    if (!client) {
        window.showWarningMessage('The Clarion language server is not running.');
        return;
    }
    const data = await window.withProgress(
        { location: ProgressLocation.Notification, title: 'Clarion: checking file references…' },
        () => client.sendRequest<UnresolvedReportData>('clarion/unresolvedReferences')
    );
    if (!panel) {
        panel = window.createWebviewPanel('clarionUnresolvedReferences', 'Unresolved File References', ViewColumn.Active, { enableScripts: true });
        panel.onDidDispose(() => { panel = undefined; });
        panel.webview.onDidReceiveMessage(async (message: { command: string; file: string; line: number }) => {
            if (message.command !== 'open' || typeof message.file !== 'string') return;
            const doc = await workspace.openTextDocument(Uri.file(message.file));
            const at = new Position(Math.max(0, message.line | 0), 0);
            await window.showTextDocument(doc, { viewColumn: ViewColumn.Beside, selection: new Range(at, at) });
        });
    }
    panel.webview.html = renderUnresolvedReport(data, nonce(), panel.webview.cspSource);
    panel.reveal();
}

export function registerReportCommands(): Disposable[] {
    return [commands.registerCommand('clarion.unresolvedReferencesReport', showUnresolvedReferences)];
}
