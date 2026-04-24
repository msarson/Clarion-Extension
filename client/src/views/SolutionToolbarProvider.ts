import * as vscode from 'vscode';
import * as path from 'path';
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
            if (message.command === 'openInClarionIDE') {
                vscode.commands.executeCommand('clarion.openInClarionIDE');
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
    align-items: center;
    gap: 6px;
    background: transparent;
    overflow: hidden;
  }
  button {
    background: none;
    border: none;
    cursor: pointer;
    padding: 3px;
    border-radius: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0.8;
  }
  button:hover {
    opacity: 1;
    background: var(--vscode-toolbar-hoverBackground, rgba(128,128,128,0.2));
  }
  button img {
    width: 20px;
    height: 20px;
  }
  span {
    font-size: 11px;
    color: var(--vscode-descriptionForeground);
    white-space: nowrap;
  }
</style>
</head>
<body>
  <button title="Open Solution in Clarion IDE" onclick="vscode.postMessage({command:'openInClarionIDE'})">
    <img src="${iconUri}" alt="Open Solution in Clarion IDE" />
  </button>
  <span>Open Solution in Clarion IDE</span>
  <script>
    const vscode = acquireVsCodeApi();
  </script>
</body>
</html>`;
    }
}
