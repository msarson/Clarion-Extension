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
    padding: 4px 8px;
    display: flex;
    flex-direction: column;
    gap: 4px;
    background: transparent;
    overflow: hidden;
  }
  .row {
    display: flex;
    align-items: center;
    gap: 4px;
  }
  button {
    background: none;
    border: none;
    cursor: pointer;
    padding: 3px 6px;
    border-radius: 4px;
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 11px;
    color: var(--vscode-foreground);
    white-space: nowrap;
  }
  .run-row {
    display: flex;
    align-items: center;
    gap: 2px;
  }
  .run-row button {
    flex: 1;
    justify-content: center;
    font-size: 14px;
    padding: 4px 2px;
  }
  button:hover {
    background: var(--vscode-toolbar-hoverBackground, rgba(128,128,128,0.2));
  }
  button img { width: 16px; height: 16px; }
  .sep {
    border-top: 1px solid var(--vscode-widget-border, rgba(128,128,128,0.3));
    margin: 2px 0;
  }
</style>
</head>
<body>
  <div class="row">
    <button class="wide" title="Open Solution in Clarion IDE" onclick="send('openInClarionIDE')">
      <img src="${iconUri}" />
      <span>Open Solution in Clarion IDE</span>
    </button>
  </div>
  <div class="sep"></div>
  <div class="run-row">
    <button title="Run (Ctrl+F5)" onclick="send('run')">▶&#xFE0E;</button>
    <button title="Build &amp; Run" onclick="send('buildAndRun')">🔨&#xFE0E;▶&#xFE0E;</button>
    <button title="Debug (F5)" onclick="send('startDebugging')">🐛&#xFE0E;</button>
    <button title="Build &amp; Debug" onclick="send('buildAndDebug')">🔨&#xFE0E;🐛&#xFE0E;</button>
  </div>
  <script>
    const vscode = acquireVsCodeApi();
    function send(cmd) { vscode.postMessage({ command: cmd }); }
  </script>
</body>
</html>`;
    }
}
