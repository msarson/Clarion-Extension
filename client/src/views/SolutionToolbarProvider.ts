import * as vscode from 'vscode';
import LoggerManager from '../utils/LoggerManager';

const logger = LoggerManager.getLogger("SolutionToolbarProvider");
logger.setLevel("error");

export class SolutionToolbarProvider implements vscode.WebviewViewProvider {
    public static readonly viewId = 'clarionSolutionToolbar';

    private _view?: vscode.WebviewView;
    private readonly _extensionUri: vscode.Uri;
    private _solutionOpen = false;
    private _startupName: string | undefined;

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
                case 'ready':
                    // Webview JS is loaded — send current state now
                    this._postState();
                    break;
                case 'openInClarionIDE':
                    vscode.commands.executeCommand('clarion.openInClarionIDE');
                    break;
                case 'startDebugging':
                    vscode.commands.executeCommand('clarion.startDebugging');
                    break;
                case 'runWithoutDebugging':
                    vscode.commands.executeCommand('clarion.runWithoutDebugging');
                    break;
            }
        });

        // Do NOT call _postState() here — wait for the 'ready' message from JS
        logger.info("✅ Solution toolbar webview resolved");
    }

    /** Call this whenever solution open state or startup project name changes. */
    public update(solutionOpen: boolean, startupName?: string): void {
        this._solutionOpen = solutionOpen;
        this._startupName = startupName;
        this._postState();
    }

    private _postState(): void {
        if (this._view) {
            this._view.webview.postMessage({
                type: 'state',
                solutionOpen: this._solutionOpen,
                startupName: this._startupName ?? ''
            });
        }
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
    gap: 6px;
  }
  button {
    background: none;
    border: none;
    cursor: pointer;
    padding: 3px 5px;
    border-radius: 4px;
    display: flex;
    align-items: center;
    gap: 5px;
    font-size: 11px;
    color: var(--vscode-foreground);
    white-space: nowrap;
  }
  button:hover:not(:disabled) {
    background: var(--vscode-toolbar-hoverBackground, rgba(128,128,128,0.2));
  }
  button:disabled {
    opacity: 0.4;
    cursor: default;
  }
  button img { width: 16px; height: 16px; }
  .codicon {
    font-size: 14px;
    line-height: 1;
  }
  .run-label { font-size: 11px; color: var(--vscode-descriptionForeground); }
</style>
</head>
<body>
  <div class="row">
    <button id="btnOpen" title="Open Solution in Clarion IDE" onclick="send('openInClarionIDE')">
      <img src="${iconUri}" />
      <span>Open Solution in Clarion IDE</span>
    </button>
  </div>
  <div class="row">
    <button id="btnDebug" title="Start Debugging (F5)" onclick="send('startDebugging')">
      ▶&#xFE0E; <span id="lblDebug">Run in Debugger</span>
    </button>
    <button id="btnRun" title="Run Without Debugging (Ctrl+F5)" onclick="send('runWithoutDebugging')">
      ⏵&#xFE0E; <span id="lblRun">Run</span>
    </button>
  </div>
  <script>
    const vscode = acquireVsCodeApi();
    function send(cmd) { vscode.postMessage({ command: cmd }); }

    window.addEventListener('message', e => {
      const { type, solutionOpen, startupName } = e.data;
      if (type !== 'state') return;
      const disabled = !solutionOpen;
      ['btnOpen','btnDebug','btnRun'].forEach(id => {
        document.getElementById(id).disabled = disabled;
      });
      const name = startupName || '';
      document.getElementById('lblDebug').textContent = name ? 'Run in Debugger (' + name + ')' : 'Run in Debugger';
      document.getElementById('lblRun').textContent   = name ? 'Run (' + name + ')'            : 'Run';
    });

    // Notify extension that JS is ready to receive state
    vscode.postMessage({ command: 'ready' });
  </script>
</body>
</html>`;
    }
}
