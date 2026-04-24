import * as vscode from 'vscode';
import LoggerManager from '../utils/LoggerManager';

const logger = LoggerManager.getLogger("SolutionToolbarProvider");
logger.setLevel("error");

export class SolutionToolbarProvider implements vscode.WebviewViewProvider {
    public static readonly viewId = 'clarionSolutionToolbar';

    private _view?: vscode.WebviewView;
    private readonly _extensionUri: vscode.Uri;

    constructor(extensionUri: vscode.Uri) {
        this._extensionUri = extensionUri;
    }

    resolveWebviewView(
        webviewView: vscode.WebviewView,
        _context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ): void {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };

        webviewView.webview.html = this._getHtml(webviewView.webview);

        webviewView.webview.onDidReceiveMessage(message => {
            switch (message.command) {
                case 'openInClarionIDE':
                    vscode.commands.executeCommand('clarion.openInClarionIDE');
                    break;
                case 'build':
                    vscode.commands.executeCommand('clarion.buildAllProjects');
                    break;
                case 'run':
                    vscode.commands.executeCommand('clarion.runWithoutDebugging', false);
                    break;
                case 'buildAndRun':
                    vscode.commands.executeCommand('clarion.runWithoutDebugging', true);
                    break;
                case 'startDebugging':
                    vscode.commands.executeCommand('clarion.startDebugging', false);
                    break;
                case 'buildAndDebug':
                    vscode.commands.executeCommand('clarion.startDebugging', true);
                    break;
            }
        });

        logger.info("✅ Solution toolbar webview resolved");
    }

    private _getHtml(webview: vscode.Webview): string {
        const iconUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'images', 'sv57x57.png')
        );

        return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource}; script-src 'unsafe-inline'; style-src 'unsafe-inline';">
<style>
  body {
    margin: 0;
    padding: 2px 6px;
    display: flex;
    align-items: center;
    gap: 2px;
    background: transparent;
    overflow: hidden;
  }
  button {
    background: none;
    border: none;
    cursor: pointer;
    padding: 3px 5px;
    border-radius: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 14px;
    color: var(--vscode-foreground);
  }
  button:hover {
    background: var(--vscode-toolbar-hoverBackground, rgba(128,128,128,0.2));
  }
  button img { width: 16px; height: 16px; }
  .sep {
    width: 1px;
    height: 16px;
    background: var(--vscode-widget-border, rgba(128,128,128,0.3));
    margin: 0 2px;
  }
</style>
</head>
<body>
  <button title="Open Solution in Clarion IDE" onclick="send('openInClarionIDE')"><img src="${iconUri}" /></button>
  <div class="sep"></div>
  <button title="Build solution" onclick="send('build')">🔨&#xFE0E;</button>
  <div class="sep"></div>
  <button title="Run (Ctrl+F5)" onclick="send('run')">▶&#xFE0E;</button>
  <button title="Build &amp; Run" onclick="send('buildAndRun')">🔨&#xFE0E;▶&#xFE0E;</button>
  <button title="Debug (F5)" onclick="send('startDebugging')">🐛&#xFE0E;</button>
  <button title="Build &amp; Debug" onclick="send('buildAndDebug')">🔨&#xFE0E;🐛&#xFE0E;</button>
  <script>
    const vscode = acquireVsCodeApi();
    function send(cmd) { vscode.postMessage({ command: cmd }); }
  </script>
</body>
</html>`;
    }
}
