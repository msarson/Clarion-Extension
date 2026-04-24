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

        webviewView.webview.onDidReceiveMessage(async message => {
            switch (message.command) {
                case 'openInClarionIDE':
                    vscode.commands.executeCommand('clarion.openInClarionIDE');
                    break;
                case 'build':
                    vscode.commands.executeCommand('clarion.buildAllProjects');
                    break;
                case 'buildAndRun':
                    await vscode.commands.executeCommand('clarion.buildAllProjects');
                    vscode.commands.executeCommand('clarion.runWithoutDebugging');
                    break;
                case 'buildAndDebug':
                    await vscode.commands.executeCommand('clarion.buildAllProjects');
                    vscode.commands.executeCommand('clarion.startDebugging');
                    break;
                case 'startDebugging':
                    vscode.commands.executeCommand('clarion.startDebugging');
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
    flex: 1;
    justify-content: center;
  }
  button.wide {
    flex: none;
    justify-content: flex-start;
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
  <div class="row">
    <button title="Build solution" onclick="send('build')">🔨&#xFE0E; <span>Build</span></button>
    <button title="Build then run without debugging" onclick="send('buildAndRun')">▶&#xFE0E; <span>Build &amp; Run</span></button>
  </div>
  <div class="row">
    <button title="Build then start debugger" onclick="send('buildAndDebug')">🐛&#xFE0E; <span>Build &amp; Debug</span></button>
    <button title="Start debugger without building" onclick="send('startDebugging')">🔍&#xFE0E; <span>Debug</span></button>
  </div>
  <script>
    const vscode = acquireVsCodeApi();
    function send(cmd) { vscode.postMessage({ command: cmd }); }
  </script>
</body>
</html>`;
    }
}
