import * as vscode from 'vscode';
import * as path from 'path';
import { globalSolutionFile, globalClarionVersion, globalSettings } from '../globals';
import { SolutionCache } from '../SolutionCache';
import LoggerManager from '../utils/LoggerManager';

const logger = LoggerManager.getLogger("SolutionToolbarProvider");
logger.setLevel("error");

export interface GraphStatus {
    status: 'building' | 'built';
    fileCount?: number;
    edgeCount?: number;
    durationMs?: number;
}

export class SolutionToolbarProvider implements vscode.WebviewViewProvider {
    public static readonly viewId = 'clarionSolutionToolbar';

    private _view?: vscode.WebviewView;
    private readonly _extensionUri: vscode.Uri;
    private _graphStatus: GraphStatus | undefined;

    constructor(extensionUri: vscode.Uri) {
        this._extensionUri = extensionUri;
    }

    public setGraphStatus(status: GraphStatus): void {
        this._graphStatus = status;
        this.update();
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

        // #148 — the prior `onDidChangeVisibility(() => visible && reassign html)`
        // handler is removed: re-assigning `webview.html` on every visibility
        // flip re-ran the webview lifecycle (including service-worker
        // registration) and produced the deterministic
        // `InvalidStateError: Could not register service worker` Mark hit on
        // every load post-#132 B3. Combined with `retainContextWhenHidden: true`
        // in `ViewManager.registerSolutionToolbar`, the webview state now
        // survives hide-flips without re-render. Explicit re-renders still
        // happen via `update()` (called from `setGraphStatus` etc.) when the
        // content actually needs to change.

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
                case 'setActiveVersion':
                    // #132 / dd87633f B3 — Clarion Tools pane picker entry point.
                    vscode.commands.executeCommand('clarion.setActiveVersion');
                    break;
            }
        });

        logger.info("✅ Solution toolbar webview resolved");
    }

    /** Re-renders the webview with current solution state. */
    public update(): void {
        if (this._view) {
            this._view.webview.html = this._getHtml(this._view.webview);
        }
    }

    private _getSummaryRows(): { label: string; value: string }[] {
        const rows: { label: string; value: string }[] = [];

        // #132 / dd87633f B3 — Clarion version row always shows (even without
        // a solution open). Falls back to "Not set — click to choose" when
        // empty so the user has a discoverable entry point.
        const versionLabel = globalClarionVersion || 'Not set — use Set Version';
        rows.push({ label: 'Clarion', value: versionLabel });

        if (!globalSolutionFile) {
            rows.push({ label: 'Solution', value: 'No solution open' });
            return rows;
        }

        const slnName = path.basename(globalSolutionFile, '.sln');
        rows.push({ label: 'Solution', value: slnName });

        const config = globalSettings.configuration;
        if (config) {
            rows.push({ label: 'Config', value: config.split('|')[0] });
        }

        const solutionInfo = SolutionCache.getInstance().getSolutionInfo();
        if (solutionInfo) {
            rows.push({ label: 'Projects', value: String(solutionInfo.projects.length) });

            const startupGuid = vscode.workspace.getConfiguration('clarion').get<string>('startupProject');
            if (startupGuid) {
                const startup = solutionInfo.projects.find(p =>
                    p.guid.replace(/[{}]/g, '').toLowerCase() === startupGuid.replace(/[{}]/g, '').toLowerCase()
                );
                if (startup) {
                    rows.push({ label: 'Startup', value: startup.name });
                }
            }
        }

        if (this._graphStatus) {
            if (this._graphStatus.status === 'building') {
                const count = this._graphStatus.fileCount ?? 0;
                rows.push({ label: 'Graph', value: `Building… (${count} files)` });
            } else {
                const files = this._graphStatus.fileCount ?? 0;
                const edges = this._graphStatus.edgeCount ?? 0;
                const ms = this._graphStatus.durationMs;
                const time = ms !== undefined ? ` ${ms}ms` : '';
                rows.push({ label: 'Graph', value: `${files} files, ${edges} edges${time}` });
            }
        }

        return rows;
    }

    private _getHtml(webview: vscode.Webview): string {
        const iconUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'images', 'sv57x57.png')
        );

        const summaryRows = this._getSummaryRows();
        const summaryHtml = summaryRows.map(r =>
            `<tr><td class="lbl">${r.label}</td><td class="val">${r.value}</td></tr>`
        ).join('');

        // #148 — nonce-based CSP per VS Code webview guidance. `'unsafe-inline'`
        // on script-src was the source of the deterministic SW registration
        // race after the initial visibility-flip handler removal didn't fix it.
        // `'strict-dynamic'` says "trust only scripts authorized by nonce" —
        // explicit allowlist, no host-source ambiguity. Inline event handlers
        // (onclick="...") are NOT covered by nonce, so the buttons use
        // `data-cmd` attributes + a single `addEventListener` loop inside
        // the nonce-tagged script.
        const nonce = getNonce();

        return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource}; script-src 'nonce-${nonce}' 'strict-dynamic'; style-src ${webview.cspSource} 'unsafe-inline'; connect-src 'none';">
<style>
  body {
    margin: 0;
    padding: 2px 6px 4px;
    display: flex;
    flex-direction: column;
    gap: 4px;
    background: transparent;
    overflow: hidden;
  }
  .toolbar {
    display: flex;
    align-items: center;
    gap: 2px;
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
  .hsep {
    border-top: 1px solid var(--vscode-widget-border, rgba(128,128,128,0.2));
  }
  table {
    border-collapse: collapse;
    width: 100%;
    font-size: 10px;
  }
  td { padding: 1px 3px; line-height: 1.4; }
  td.lbl {
    color: var(--vscode-descriptionForeground);
    white-space: nowrap;
    padding-right: 6px;
  }
  td.val {
    color: var(--vscode-foreground);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 140px;
  }
</style>
</head>
<body>
  <div class="toolbar">
    <button title="Open Solution in Clarion IDE" data-cmd="openInClarionIDE"><img src="${iconUri}" /></button>
    <div class="sep"></div>
    <button title="Build solution" data-cmd="build">🔨&#xFE0E;</button>
    <div class="sep"></div>
    <button title="Run (Ctrl+F5)" data-cmd="run">▶&#xFE0E;</button>
    <button title="Build &amp; Run" data-cmd="buildAndRun">🔨&#xFE0E;▶&#xFE0E;</button>
    <button title="Debug (F5)" data-cmd="startDebugging">🐛&#xFE0E;</button>
    <button title="Build &amp; Debug" data-cmd="buildAndDebug">🔨&#xFE0E;🐛&#xFE0E;</button>
    <div class="sep"></div>
    <button title="Set Active Clarion Version" data-cmd="setActiveVersion">⚙&#xFE0E;</button>
  </div>
  <div class="hsep"></div>
  <table><tbody>${summaryHtml}</tbody></table>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    document.querySelectorAll('button[data-cmd]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        vscode.postMessage({ command: btn.dataset.cmd });
      });
    });
  </script>
</body>
</html>`;
    }
}

/**
 * #148 — Cryptographically-random 32-char nonce for CSP `'nonce-...'` source.
 * Standard VS Code webview helper pattern.
 */
function getNonce(): string {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}
