import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import LoggerManager from '../utils/LoggerManager';
import { globalSettings } from '../globals';
import { setProperty, setPropertyScope } from './CwprojProperties';
import { PROJECT_PROPERTY_FIELDS, PROJECT_PROPERTY_TABS, targetsProperties } from './ProjectPropertyFields';
import { buildPageState } from './ProjectPropertiesPage';

const logger = LoggerManager.getLogger('ProjectPropertiesEditor');
logger.setLevel('error');

/**
 * #792 — the Project Properties page: a custom editor for .cwproj files (Open With… › Clarion
 * Project Properties, or Properties on a project in the Solution View). It shows the Clarion
 * IDE's project-option pages for one configuration and writes each change as the smallest text
 * edit to the document, so undo, dirty state and save work as for any file, and the XML is one
 * click away.
 */
export class ProjectPropertiesEditorProvider implements vscode.CustomTextEditorProvider {
    public static readonly viewType = 'clarion.projectProperties';

    public static register(): vscode.Disposable[] {
        return [
            vscode.window.registerCustomEditorProvider(ProjectPropertiesEditorProvider.viewType, new ProjectPropertiesEditorProvider()),
            vscode.commands.registerCommand('clarion.openProjectProperties', async (target?: vscode.Uri | { data?: { path?: string; filename?: string } }) => {
                const uri = projectUri(target);
                if (!uri) {
                    vscode.window.showErrorMessage('Choose a Clarion project (.cwproj) to show its properties.');
                    return;
                }
                await vscode.commands.executeCommand('vscode.openWith', uri, ProjectPropertiesEditorProvider.viewType);
            }),
        ];
    }

    public async resolveCustomTextEditor(document: vscode.TextDocument, panel: vscode.WebviewPanel): Promise<void> {
        // The solution's configuration (Debug|Win32 → Debug) until the page picks another.
        let configuration = (globalSettings.configuration || 'Debug').split('|')[0] || 'Debug';
        const targets = readTargetsProperties();

        panel.webview.options = { enableScripts: true };
        panel.webview.html = pageHtml(panel.webview);

        const post = () => panel.webview.postMessage({
            type: 'state',
            state: buildPageState(document.getText(), configuration, targets),
            file: path.basename(document.uri.fsPath),
        });

        const changes = vscode.workspace.onDidChangeTextDocument(e => {
            if (e.document.uri.toString() === document.uri.toString() && e.contentChanges.length > 0) post();
        });
        panel.onDidDispose(() => changes.dispose());

        panel.webview.onDidReceiveMessage(async (msg: { type: string; property?: string; value?: string; scope?: 'all' | 'configuration' }) => {
            try {
                switch (msg.type) {
                    case 'ready':
                        post();
                        break;
                    case 'configuration':
                        configuration = msg.value || configuration;
                        post();
                        break;
                    case 'set': {
                        if (!msg.property) return;
                        // A value is written where it applies now; one not set yet applies to all.
                        const field = buildPageState(document.getText(), configuration, targets).tabs
                            .flatMap(t => t.groups.flatMap(g => g.fields)).find(f => f.property === msg.property);
                        const where = field?.scope === 'configuration' ? configuration : null;
                        const value = msg.value === undefined || msg.value === '' ? null : msg.value;
                        await applyText(document, setProperty(document.getText(), msg.property, value, where));
                        break;
                    }
                    case 'scope':
                        if (!msg.property || !msg.scope) return;
                        await applyText(document, setPropertyScope(document.getText(), msg.property, msg.scope, configuration));
                        break;
                    case 'xml':
                        await vscode.commands.executeCommand('vscode.openWith', document.uri, 'default');
                        break;
                }
            } catch (err) {
                logger.error(`❌ Project Properties: ${err instanceof Error ? err.message : String(err)}`);
                vscode.window.showErrorMessage(`Could not change the project: ${err instanceof Error ? err.message : String(err)}`);
            }
        });
    }
}

/** The .cwproj a command was given: a file URI, or a project node of the Solution View. */
function projectUri(target?: vscode.Uri | { data?: { path?: string; filename?: string } }): vscode.Uri | undefined {
    if (target instanceof vscode.Uri) return target;
    const data = target?.data;
    if (data?.path && data.filename) return vscode.Uri.file(path.join(data.path, data.filename));
    const active = vscode.window.activeTextEditor?.document.uri;
    return active && /\.cwproj$/i.test(active.fsPath) ? active : undefined;
}

/**
 * The properties the solution's installation's build reads, from its
 * SoftVelocity.Build.Clarion.targets (the bin folder the build task uses); undefined when it
 * cannot be read, so the page then holds nothing back.
 */
function readTargetsProperties(): Set<string> | undefined {
    const redirection = globalSettings.redirectionPath;
    if (!redirection) return undefined;
    const bin = redirection.replace(/redirection.*/i, 'bin');
    try {
        return targetsProperties(fs.readFileSync(path.join(bin, 'SoftVelocity.Build.Clarion.targets'), 'utf8'));
    } catch {
        return undefined;
    }
}

/** Replaces only the span that changed, so undo steps and the document's other text are untouched. */
async function applyText(document: vscode.TextDocument, next: string): Promise<void> {
    const current = document.getText();
    if (next === current) return;
    let start = 0;
    while (start < current.length && start < next.length && current[start] === next[start]) start++;
    let endCurrent = current.length, endNext = next.length;
    while (endCurrent > start && endNext > start && current[endCurrent - 1] === next[endNext - 1]) { endCurrent--; endNext--; }
    const edit = new vscode.WorkspaceEdit();
    edit.replace(document.uri, new vscode.Range(document.positionAt(start), document.positionAt(endCurrent)), next.slice(start, endNext));
    await vscode.workspace.applyEdit(edit);
}

function getNonce(): string {
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let text = '';
    for (let i = 0; i < 32; i++) text += possible.charAt(Math.floor(Math.random() * possible.length));
    return text;
}

/** The page: VS Code's theme colours; the fields' labels and kinds travel with it, the values by message. */
function pageHtml(webview: vscode.Webview): string {
    const nonce = getNonce();
    const meta = JSON.stringify({
        tabs: PROJECT_PROPERTY_TABS,
        fields: Object.fromEntries(PROJECT_PROPERTY_FIELDS.map(f => [f.property, f])),
    }).replace(/</g, '\\u003c');
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource}; script-src 'nonce-${nonce}'; style-src ${webview.cspSource} 'unsafe-inline';">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Project Properties</title>
<style>
  body { margin: 0; padding: 0; color: var(--vscode-foreground); background: var(--vscode-editor-background); font-family: var(--vscode-font-family); font-size: var(--vscode-font-size); }
  header { display: flex; flex-wrap: wrap; align-items: center; gap: 16px; padding: 18px 24px 14px; border-bottom: 1px solid var(--vscode-panel-border); }
  header .title { flex: 1 1 240px; display: flex; flex-direction: column; gap: 4px; }
  h1 { margin: 0; font-size: 1.5em; font-weight: 600; }
  .muted { color: var(--vscode-descriptionForeground); }
  .bar { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; }
  label.inline { display: flex; align-items: center; gap: 8px; }
  select, input[type=text] { background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border, var(--vscode-panel-border)); border-radius: 2px; padding: 4px 8px; font: inherit; }
  select:focus, input:focus, button:focus-visible { outline: 1px solid var(--vscode-focusBorder); outline-offset: -1px; }
  button.secondary { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); border: none; border-radius: 2px; padding: 5px 10px; font: inherit; cursor: pointer; }
  .layout { display: flex; flex-wrap: wrap; }
  nav { flex: 1 1 180px; max-width: 220px; padding: 10px 0; border-right: 1px solid var(--vscode-panel-border); display: flex; flex-direction: column; }
  nav button { display: block; width: 100%; min-height: 34px; padding: 0 16px; text-align: left; border: none; border-left: 2px solid transparent; background: none; color: inherit; font: inherit; cursor: pointer; }
  nav button[aria-selected=true] { background: var(--vscode-list-activeSelectionBackground); color: var(--vscode-list-activeSelectionForeground); border-left-color: var(--vscode-focusBorder); }
  main { flex: 999 1 520px; min-width: 0; padding: 18px 24px 40px; display: flex; flex-direction: column; gap: 20px; }
  section { border: 1px solid var(--vscode-panel-border); border-radius: 4px; }
  h2 { margin: 0; padding: 9px 16px; font-size: 0.85em; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; color: var(--vscode-descriptionForeground); border-bottom: 1px solid var(--vscode-panel-border); }
  .row { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 16px; padding: 9px 16px; border-top: 1px solid var(--vscode-panel-border); }
  h2 + .row { border-top: none; }
  .label { flex: 1 1 220px; max-width: 280px; display: flex; flex-direction: column; gap: 2px; }
  code { font-family: var(--vscode-editor-font-family); font-size: 0.85em; color: var(--vscode-descriptionForeground); background: none; padding: 0; }
  .control { flex: 999 1 240px; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
  .control input[type=text] { max-width: 520px; }
  .note { font-size: 0.9em; color: var(--vscode-editorWarning-foreground); }
  .scope { display: inline-flex; align-items: center; gap: 6px; min-height: 26px; padding: 2px 10px; border-radius: 13px; border: 1px solid var(--vscode-panel-border); background: none; color: var(--vscode-descriptionForeground); font: inherit; font-size: 0.9em; cursor: pointer; }
  .scope .dot { width: 8px; height: 8px; border-radius: 4px; background: var(--vscode-descriptionForeground); }
  .scope.per { border-color: var(--vscode-focusBorder); color: var(--vscode-foreground); background: var(--vscode-list-inactiveSelectionBackground); }
  .scope.per .dot { background: var(--vscode-focusBorder); }
  .scope:disabled { opacity: 0.5; cursor: default; }
  .unavailable .label > span:first-child { color: var(--vscode-disabledForeground); }
</style>
</head>
<body>
<header>
  <div class="title"><h1 id="name">Project</h1><div class="muted" id="sub"></div></div>
  <div class="bar">
    <label class="inline muted">Configuration <select id="configuration"></select></label>
    <button class="secondary" id="xml" type="button">Open as XML</button>
  </div>
</header>
<div class="layout">
  <nav id="tabs" aria-label="Property pages" role="tablist"></nav>
  <main id="page"></main>
</div>
<script nonce="${nonce}">
(function () {
  const vscode = acquireVsCodeApi();
  const META = ${meta};
  let tab = (vscode.getState() || {}).tab || 'application';
  let state = null;

  const el = (tag, attrs, ...children) => {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === undefined || v === null || v === false) continue;
      if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else e.setAttribute(k, v === true ? '' : String(v));
    }
    for (const c of children) if (c !== null && c !== undefined) e.append(c);
    return e;
  };

  document.getElementById('xml').addEventListener('click', () => vscode.postMessage({ type: 'xml' }));
  document.getElementById('configuration').addEventListener('change', e => vscode.postMessage({ type: 'configuration', value: e.target.value }));

  function control(meta, f) {
    const disabled = !f.available;
    if (meta.kind === 'check') {
      const box = el('input', { type: 'checkbox', disabled, 'aria-label': meta.label,
        onchange: e => vscode.postMessage({ type: 'set', property: f.property, value: e.target.checked ? meta.on : meta.off }) });
      box.checked = f.checked;
      return el('label', { class: 'inline' }, box, meta.checkLabel || '');
    }
    if (meta.kind === 'select') {
      const s = el('select', { disabled, 'aria-label': meta.label,
        onchange: e => vscode.postMessage({ type: 'set', property: f.property, value: e.target.value }) });
      if (!meta.options.some(o => o.value.toLowerCase() === f.value.toLowerCase())) s.append(el('option', { value: f.value }, f.value || 'Not set'));
      for (const o of meta.options) s.append(el('option', { value: o.value }, o.label));
      s.value = meta.options.find(o => o.value.toLowerCase() === f.value.toLowerCase())?.value ?? f.value;
      return s;
    }
    const input = el('input', { type: 'text', disabled, placeholder: meta.placeholder || '', 'aria-label': meta.label,
      onchange: e => vscode.postMessage({ type: 'set', property: f.property, value: e.target.value }) });
    input.value = f.value;
    return input;
  }

  function render() {
    if (!state) return;
    document.getElementById('name').textContent = state.outputName || state.file;
    document.getElementById('sub').textContent = state.kind + ' project · ' + state.file;
    const cfg = document.getElementById('configuration');
    cfg.replaceChildren(...state.configurations.map(c => el('option', { value: c }, c)));
    cfg.value = state.configuration;

    const tabs = document.getElementById('tabs');
    tabs.replaceChildren(...state.tabs.map(t => el('button', { type: 'button', role: 'tab', 'aria-selected': t.id === tab ? 'true' : 'false',
      onclick: () => { tab = t.id; vscode.setState({ tab }); render(); } }, t.label)));

    const page = state.tabs.find(t => t.id === tab) || state.tabs[0];
    document.getElementById('page').replaceChildren(...page.groups.map(g => el('section', {},
      el('h2', {}, g.title),
      ...g.fields.map(f => {
        const meta = META.fields[f.property];
        const per = f.scope === 'configuration';
        const scopeText = f.scope === 'unset' ? 'Not set' : per ? state.configuration + ' only' : 'All configurations';
        return el('div', { class: 'row' + (f.available ? '' : ' unavailable') },
          el('div', { class: 'label' }, el('span', {}, meta.label), el('code', {}, meta.property)),
          el('div', { class: 'control' }, control(meta, f),
            meta.note ? el('span', { class: 'muted' }, meta.note) : null,
            f.available ? null : el('span', { class: 'note' }, f.reason)),
          el('button', { type: 'button', class: 'scope' + (per ? ' per' : ''), disabled: f.scope === 'unset' || !f.available,
            title: per ? 'Make this value apply to all configurations' : 'Give ' + state.configuration + ' its own value',
            'aria-label': meta.label + ' applies to: ' + scopeText,
            onclick: () => vscode.postMessage({ type: 'scope', property: f.property, scope: per ? 'all' : 'configuration' }) },
            el('span', { class: 'dot', 'aria-hidden': 'true' }), scopeText));
      }))));
  }

  window.addEventListener('message', e => {
    if (e.data && e.data.type === 'state') { state = Object.assign({}, e.data.state, { file: e.data.file }); render(); }
  });
  vscode.postMessage({ type: 'ready' });
})();
</script>
</body>
</html>`;
}
