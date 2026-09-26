import * as vscode from 'vscode';
import * as path from 'path';
import { globalSolutionFile, globalClarionVersion, globalSettings, globalClarionPropertiesFile } from '../globals';
import { versionRowLabel, readRegisteredVersionNames } from '../utils/SolutionFallbackPolicy';
import { describeNonDefaultConfigDir } from '../utils/ClarionConfigDir';
import { SolutionCache } from '../SolutionCache';
import LoggerManager from '../utils/LoggerManager';
import { buildLogRow, buildLogMenu, runCommandRow, startupRow, settingsRow } from './ToolsPaneRows'; // #681
import { lastBuildLog } from '../utils/LastBuildLog'; // #681
import { toolbarIcons } from './ToolbarIcons'; // #682

const logger = LoggerManager.getLogger("SolutionToolbarProvider");
logger.setLevel("error");

export interface GraphStatus {
    status: 'building' | 'built';
    /** Source files that resolved to a path on disk and entered the graph. */
    fileCount?: number;
    edgeCount?: number;
    durationMs?: number;
    /** #434 — every source file the solution declares, resolved or not. */
    sourceFileCount?: number;
    /**
     * #434 — declared source files that could not be resolved to a path and are
     * therefore absent from the graph. Non-zero means the graph is incomplete
     * and the features built on it will silently return nothing for those files.
     */
    unresolvedCount?: number;
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
                case 'setConfiguration':
                    // #530 — the Config row in the summary table.
                    vscode.commands.executeCommand('clarion.setConfiguration');
                    break;
                // #681 — the settings rows.
                case 'buildLogMenu':
                    void this.showBuildLogMenu();
                    break;
                case 'chooseStartupProject':
                    vscode.commands.executeCommand('clarion.chooseStartupProject');
                    break;
                case 'openRunCommandSetting':
                    vscode.commands.executeCommand('workbench.action.openSettings', 'clarion.run.command');
                    break;
                case 'openBuildSettings':
                    vscode.commands.executeCommand('workbench.action.openSettings', 'clarion.build');
                    break;
            }
        });

        logger.info("✅ Solution toolbar webview resolved");
    }

    /** #681 — the Build log row: open the last kept log, or turn keeping on or off. */
    private async showBuildLogMenu(): Promise<void> {
        const settings = vscode.workspace.getConfiguration('clarion.build');
        const keep = settings.get<boolean>('preserveLogFile', false);
        const log = lastBuildLog();
        const picked = await vscode.window.showQuickPick(buildLogMenu(keep, !!log), { placeHolder: 'Build log' });
        if (!picked) return;
        if (picked.action === 'open' && log) {
            await vscode.window.showTextDocument(vscode.Uri.file(log), { preview: true });
            return;
        }
        const target = vscode.workspace.workspaceFolders?.length ? vscode.ConfigurationTarget.Workspace : vscode.ConfigurationTarget.Global;
        await settings.update('preserveLogFile', picked.action === 'keep', target);
        this.update();
    }

    /**
     * #148 Option 8 — propagate state changes to the webview via postMessage
     * instead of re-assigning `webview.html`. Re-assigning html re-ran VS
     * Code's webview lifecycle (iframe teardown + recreate + service-worker
     * re-registration) which caused the deterministic `InvalidStateError`
     * Mark reported. The initial html is set ONCE in `resolveWebviewView`;
     * all subsequent updates flow through the inline `message` listener,
     * which patches the DOM in place — no lifecycle churn.
     *
     * Trace confirmed: every `[#148-trace] update()` log line correlated
     * 1:1 with an `InvalidStateError` from `HostMessaging.channel.port1.
     * onmessage`. Hypothesis was load-bearing.
     *
     * #141 Q9 directive #2 — `solutionLoaded` field gates toolbar Build/Run/
     * Debug button visibility in the webview. "Open in IDE" + "Set Active
     * Version" buttons remain visible regardless (meaningful in both modes).
     */
    public update(): void {
        if (this._view) {
            this._view.webview.postMessage({
                command: 'updateContent',
                summaryRows: this._getSummaryRows(),
                solutionLoaded: !!globalSolutionFile,
            });
        }
    }

    private _getSummaryRows(): SummaryRow[] {
        const rows: SummaryRow[] = [];

        // #132 / dd87633f B3 — Clarion version row always shows (even without
        // a solution open). Falls back to "Not set — click to choose" when
        // empty so the user has a discoverable entry point.
        //
        // #141 Q9 directive #3 + Q4 three-layer storage — when the L1 default
        // (settings.json `clarion.activeVersion`) differs from the L2 effective
        // active (in-memory `globalClarionVersion` for this instance), surface
        // BOTH so the user can see "I'm using C6 in this instance, but C11 is
        // my default for first-time-seen solutions and no-solution-mode."
        // When they match (or the default isn't set yet), show just the
        // effective active.
        const effectiveVersion = globalClarionVersion;
        const defaultVersion = vscode.workspace.getConfiguration('clarion').get<string>('activeVersion', '');
        // #535 — a name the selected ClarionProperties.xml no longer registers says so.
        const versionLabel = versionRowLabel(effectiveVersion, defaultVersion, readRegisteredVersionNames(globalClarionPropertiesFile));
        rows.push({ label: 'Clarion', value: versionLabel });

        // #479 — the compile-target name stopped being a unique identifier once a
        // ClarionProperties.xml could live outside %APPDATA% (see #471): two
        // installations can present the same target name from different files, and
        // since the build now follows the selected file, not showing which one is
        // active means not being able to tell what you are building against.
        // Shown only for a non-default location, so the ordinary case stays quiet.
        const configDir = describeNonDefaultConfigDir(globalClarionPropertiesFile, process.env.APPDATA);
        if (configDir) {
            rows.push({ label: 'Config dir', value: configDir });
        }

        if (!globalSolutionFile) {
            rows.push({ label: 'Solution', value: 'No solution open' });
            return rows;
        }

        const slnName = path.basename(globalSolutionFile, '.sln');
        rows.push({ label: 'Solution', value: slnName });

        const config = globalSettings.configuration;
        if (config) {
            // #530 — clickable: the same picker as the status bar item and
            // "Clarion: Set Configuration". Nobody found either.
            rows.push({ label: 'Config', value: config.split('|')[0], command: 'setConfiguration', title: 'Change the build configuration' });
        }

        const solutionInfo = SolutionCache.getInstance().getSolutionInfo();
        if (solutionInfo) {
            rows.push({ label: 'Projects', value: String(solutionInfo.projects.length) });

            // #681 — always shown with projects, and clickable: Run and Debug start it (#666).
            if (solutionInfo.projects.length > 0) {
                const startupGuid = vscode.workspace.getConfiguration('clarion').get<string>('startupProject');
                const startup = startupGuid ? solutionInfo.projects.find(p =>
                    p.guid.replace(/[{}]/g, '').toLowerCase() === startupGuid.replace(/[{}]/g, '').toLowerCase()
                ) : undefined;
                rows.push(startupRow(startup?.name));
            }
        }

        // #681 — the settings that change what Build and Run do.
        const runRow = runCommandRow(vscode.workspace.getConfiguration('clarion').get<string>('run.command', ''));
        if (runRow) rows.push(runRow);
        rows.push(buildLogRow(vscode.workspace.getConfiguration('clarion.build').get<boolean>('preserveLogFile', false), lastBuildLog()));
        rows.push(settingsRow());

        if (this._graphStatus) {
            if (this._graphStatus.status === 'building') {
                const count = this._graphStatus.fileCount ?? 0;
                rows.push({ label: 'Graph', value: `Building… (${count} files)` });
            } else {
                const files = this._graphStatus.fileCount ?? 0;
                const edges = this._graphStatus.edgeCount ?? 0;
                const ms = this._graphStatus.durationMs;
                const time = ms !== undefined ? ` ${ms}ms` : '';
                // #434 — "built" said nothing about completeness, so a graph
                // missing most of the solution looked identical to a healthy one.
                // Only mention it when something is actually missing.
                const unresolved = this._graphStatus.unresolvedCount ?? 0;
                const total = this._graphStatus.sourceFileCount;
                const missing = unresolved > 0
                    ? `, ⚠️ ${unresolved}${total ? ` of ${total}` : ''} unresolved`
                    : '';
                rows.push({ label: 'Graph', value: `${files} files, ${edges} edges${time}${missing}` });
            }
        }

        return rows;
    }

    private _getHtml(webview: vscode.Webview): string {
        const iconUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'images', 'sv57x57.png')
        );

        const summaryRows = this._getSummaryRows();
        const summaryHtml = summaryRows.map(r => renderSummaryRow(r, escapeHtml)).join('');

        // #141 Q9 directive #2 — initial render must honour solution-loaded
        // state. Without this, the data-solution-only toolbar buttons would
        // briefly render visible in no-solution mode until the first
        // postMessage update() fires + the listener toggles them off.
        const initialSolutionLoaded = !!globalSolutionFile;
        const initialHiddenAttr = initialSolutionLoaded ? '' : ' style="display:none"';

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
  tr.clickable { cursor: pointer; }
  tr.clickable:hover td { text-decoration: underline; }
  /* #682 — a narrow side bar wraps the toolbar; buttons keep their size and are never cut off. */
  .toolbar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 2px;
  }
  button {
    flex: none;
    white-space: nowrap;
    width: 24px;
    height: 22px;
    background: none;
    border: none;
    cursor: pointer;
    padding: 0;
    border-radius: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--vscode-icon-foreground, var(--vscode-foreground));
  }
  button svg { display: block; }
  button:hover {
    background: var(--vscode-toolbar-hoverBackground, rgba(128,128,128,0.2));
  }
  button img { width: 16px; height: 16px; }
  .sep {
    flex: none;
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
    <div class="sep" data-solution-only${initialHiddenAttr}></div>
    <button title="Build solution" data-cmd="build" data-solution-only${initialHiddenAttr}>${toolbarIcons.build}</button>
    <div class="sep" data-solution-only${initialHiddenAttr}></div>
    <button title="Run (Ctrl+F5)" data-cmd="run" data-solution-only${initialHiddenAttr}>${toolbarIcons.run}</button>
    <button title="Build &amp; Run" data-cmd="buildAndRun" data-solution-only${initialHiddenAttr}>${toolbarIcons.buildAndRun}</button>
    <button title="Debug (F5)" data-cmd="startDebugging" data-solution-only${initialHiddenAttr}>${toolbarIcons.debug}</button>
    <button title="Build &amp; Debug" data-cmd="buildAndDebug" data-solution-only${initialHiddenAttr}>${toolbarIcons.buildAndDebug}</button>
    <div class="sep"></div>
    <button title="Set the Clarion version for this solution" data-cmd="setActiveVersion">${toolbarIcons.settings}</button>
  </div>
  <div class="hsep"></div>
  <table><tbody>${summaryHtml}</tbody></table>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();

    // Button click → postMessage to extension host (existing).
    document.querySelectorAll('button[data-cmd]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        vscode.postMessage({ command: btn.dataset.cmd });
      });
    });

    // #148 Option 8 — extension-host → webview message listener. Replaces the
    // prior html-reassign update pattern that triggered VS Code's webview
    // lifecycle teardown + SW re-registration race. The DOM is patched in
    // place; no iframe churn.
    function escapeHtml(s) {
      const div = document.createElement('div');
      div.textContent = String(s);
      return div.innerHTML;
    }

    // #141 Q9 directive #2 — toolbar gating helper. Solution-only elements
    // (marked with data-solution-only) hide when no solution is open.
    // "Open in IDE" and "Set Version" buttons are NOT marked because
    // they're meaningful in both modes.
    function applySolutionLoaded(loaded) {
      document.querySelectorAll('[data-solution-only]').forEach(function(el) {
        el.style.display = loaded ? '' : 'none';
      });
    }

    // #530 — a summary row carrying data-cmd (the Config row) posts its command,
    // like the toolbar buttons. Delegated on tbody so re-rendered rows keep it.
    var tbodyEl = document.querySelector('table tbody');
    if (tbodyEl) {
      tbodyEl.addEventListener('click', function(ev) {
        var row = ev.target && ev.target.closest ? ev.target.closest('tr[data-cmd]') : null;
        if (row) vscode.postMessage({ command: row.dataset.cmd });
      });
    }
    function renderRow(r) {
      var attrs = r.command ? ' data-cmd="' + escapeHtml(r.command) + '" class="clickable" title="' + escapeHtml(r.title || '') + '"' : '';
      return '<tr' + attrs + '><td class="lbl">' + escapeHtml(r.label) +
             '</td><td class="val">' + escapeHtml(r.value) + '</td></tr>';
    }
    window.addEventListener('message', function(e) {
      if (e.data && e.data.command === 'updateContent') {
        const tbody = document.querySelector('table tbody');
        if (tbody && Array.isArray(e.data.summaryRows)) {
          tbody.innerHTML = e.data.summaryRows.map(renderRow).join('');
        }
        if (typeof e.data.solutionLoaded === 'boolean') {
          applySolutionLoaded(e.data.solutionLoaded);
        }
      }
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
/** #530 — a summary-table row; `command` makes it clickable (posted like a toolbar button). */
export interface SummaryRow { label: string; value: string; command?: string; title?: string; }

/** #530 — one `<tr>` of the summary table; exported so the markup can be tested without a webview. */
export function renderSummaryRow(r: SummaryRow, esc: (s: string) => string): string {
    const attrs = r.command ? ` data-cmd="${esc(r.command)}" class="clickable" title="${esc(r.title ?? '')}"` : '';
    return `<tr${attrs}><td class="lbl">${esc(r.label)}</td><td class="val">${esc(r.value)}</td></tr>`;
}

function getNonce(): string {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}

/**
 * #148 Option 8 — XSS hardening for summary-row cell content. `summaryRows`
 * includes user-supplied strings (solution names, project names, version
 * labels) — prior `${r.label}` / `${r.value}` template interpolation was
 * vulnerable. Used in initial server-side render only; client-side message
 * handler has its own `escapeHtml` (DOM-based `textContent` round-trip).
 */
function escapeHtml(s: string): string {
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
