import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import LoggerManager from '../utils/LoggerManager';
import { globalSettings } from '../globals';
import { setProperty, setPropertyScope } from './CwprojProperties';
import { PROJECT_PROPERTY_FIELDS, PROJECT_PROPERTY_TABS, targetsProperties } from './ProjectPropertyFields';
import { addItem, includeFor } from './CwprojItems';
import { buildPageState, editItems } from './ProjectPropertiesPage';
import { minimalEdit, pageHtml as kitPage, scriptJson } from '../webview/PageKit';

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
    /**
     * #803: the open pages of each .cwproj (a page can be open in two groups), and a tab for the
     * page about to open, taken when it is ready and only for a few seconds, so a later page
     * never inherits it. Keyed without case: Windows paths may arrive spelled either way.
     */
    private static readonly panels = new Map<string, Set<vscode.WebviewPanel>>();
    private static readonly pendingTab = new Map<string, { tab: string; at: number }>();
    private static keyOf(uri: vscode.Uri): string { return uri.toString().toLowerCase(); }

    public static register(): vscode.Disposable[] {
        return [
            vscode.window.registerCustomEditorProvider(ProjectPropertiesEditorProvider.viewType, new ProjectPropertiesEditorProvider()),
            vscode.commands.registerCommand('clarion.openProjectProperties', async (target?: vscode.Uri | { data?: { path?: string; filename?: string } }, tab?: string) => {
                const uri = projectUri(target);
                if (!uri) {
                    vscode.window.showErrorMessage('Choose a Clarion project (.cwproj) to show its properties.');
                    return;
                }
                // #803: a tab to show (a Solution View folder opens Sources). A page opening takes
                // it with its first state; one already open is told.
                const key = ProjectPropertiesEditorProvider.keyOf(uri);
                if (tab) ProjectPropertiesEditorProvider.pendingTab.set(key, { tab, at: Date.now() });
                await vscode.commands.executeCommand('vscode.openWith', uri, ProjectPropertiesEditorProvider.viewType);
                // A page already open is told; a new one takes the tab when it is ready.
                if (tab) for (const open of ProjectPropertiesEditorProvider.panels.get(key) ?? []) void open.webview.postMessage({ type: 'tab', tab });
            }),
        ];
    }

    public async resolveCustomTextEditor(document: vscode.TextDocument, panel: vscode.WebviewPanel): Promise<void> {
        // The solution's configuration (Debug|Win32 → Debug) until the page picks another.
        let configuration = (globalSettings.configuration || 'Debug').split('|')[0] || 'Debug';
        const targets = readTargetsProperties();

        panel.webview.options = { enableScripts: true };
        panel.webview.html = pageHtml(panel.webview);

        const key = ProjectPropertiesEditorProvider.keyOf(document.uri);
        const open = ProjectPropertiesEditorProvider.panels.get(key) ?? new Set<vscode.WebviewPanel>();
        open.add(panel);
        ProjectPropertiesEditorProvider.panels.set(key, open);
        const post = (ready = false) => {
            // The tab asked for, taken by the page that has just opened, while it is fresh.
            const pending = ready ? ProjectPropertiesEditorProvider.pendingTab.get(key) : undefined;
            if (ready) ProjectPropertiesEditorProvider.pendingTab.delete(key);
            const tab = pending && Date.now() - pending.at < 10_000 ? pending.tab : undefined;
            return panel.webview.postMessage({
                type: 'state',
                state: buildPageState(document.getText(), configuration, targets),
                // #800: the full path, shown as Solution Properties shows the .sln's.
                file: document.uri.fsPath,
                ...(tab ? { tab } : {}),
            });
        };

        const changes = vscode.workspace.onDidChangeTextDocument(e => {
            if (e.document.uri.toString() === document.uri.toString() && e.contentChanges.length > 0) post();
        });
        panel.onDidDispose(() => {
            changes.dispose();
            open.delete(panel);
            if (open.size === 0 && ProjectPropertiesEditorProvider.panels.get(key) === open) ProjectPropertiesEditorProvider.panels.delete(key);
        });

        panel.webview.onDidReceiveMessage(async (msg: { type: string; property?: string; value?: string; kind?: string; scope?: 'all' | 'configuration' }) => {
            try {
                switch (msg.type) {
                    case 'ready':
                        post(true);
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
                    case 'addItem':
                    case 'removeItem':
                        await applyText(document, editItems(document.getText(), msg));
                        break;
                    case 'pickSource': {
                        // The chosen files, relative to the project's folder, as the IDE's Add › Existing Item does.
                        const folder = path.dirname(document.uri.fsPath);
                        const files = await vscode.window.showOpenDialog({
                            canSelectMany: true,
                            defaultUri: vscode.Uri.file(folder),
                            filters: { 'Clarion source': ['clw'] },
                            openLabel: 'Add to project',
                        });
                        let text = document.getText();
                        for (const f of files ?? []) text = addItem(text, 'Compile', includeFor(folder, f.fsPath));
                        await applyText(document, text);
                        break;
                    }
                    case 'pickInclude': {
                        // #803: TopSpeed projects to include, relative to the project's folder.
                        const folder = path.dirname(document.uri.fsPath);
                        const files = await vscode.window.showOpenDialog({
                            canSelectMany: true,
                            defaultUri: vscode.Uri.file(folder),
                            filters: { 'TopSpeed project': ['prj', 'pr'] },
                            openLabel: 'Add to project',
                        });
                        let text = document.getText();
                        for (const f of files ?? []) text = addItem(text, 'Include', includeFor(folder, f.fsPath));
                        await applyText(document, text);
                        break;
                    }
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
export async function applyText(document: vscode.TextDocument, next: string): Promise<void> {
    const span = minimalEdit(document.getText(), next);
    if (!span) return;
    const edit = new vscode.WorkspaceEdit();
    edit.replace(document.uri, new vscode.Range(document.positionAt(span.start), document.positionAt(span.end)), span.text);
    await vscode.workspace.applyEdit(edit);
}

/** The page: VS Code's theme colours; the fields' labels and kinds travel with it, the values by message. */
function pageHtml(webview: vscode.Webview): string {
    const meta = {
        tabs: PROJECT_PROPERTY_TABS,
        fields: Object.fromEntries(PROJECT_PROPERTY_FIELDS.map(f => [f.property, f])),
    };
    return kitPage({
        cspSource: webview.cspSource,
        title: 'Project Properties',
        css: `
  .layout { display: flex; flex-wrap: wrap; }
  nav { flex: 1 1 180px; max-width: 220px; padding: 10px 0; border-right: 1px solid var(--vscode-panel-border); display: flex; flex-direction: column; }
  nav button { display: block; width: 100%; min-height: 34px; padding: 0 16px; text-align: left; border: none; border-left: 2px solid transparent; background: none; color: inherit; font: inherit; cursor: pointer; }
  nav button[aria-selected=true] { background: var(--vscode-list-activeSelectionBackground); color: var(--vscode-list-activeSelectionForeground); border-left-color: var(--vscode-focusBorder); }
  .scope { display: inline-flex; align-items: center; gap: 6px; min-height: 26px; padding: 2px 10px; border-radius: 13px; border: 1px solid var(--vscode-panel-border); background: none; color: var(--vscode-descriptionForeground); font: inherit; font-size: 0.9em; cursor: pointer; }
  .scope .dot { width: 8px; height: 8px; border-radius: 4px; background: var(--vscode-descriptionForeground); }
  .scope.per { border-color: var(--vscode-focusBorder); color: var(--vscode-foreground); background: var(--vscode-list-inactiveSelectionBackground); }
  .scope.per .dot { background: var(--vscode-focusBorder); }
  .scope:disabled { opacity: 0.5; cursor: default; }
  .unavailable .label > span:first-child { color: var(--vscode-disabledForeground); }
  .columns { display: flex; flex-wrap: wrap; gap: 20px; }
  .columns > section { flex: 1 1 300px; min-width: 0; }
  .item { justify-content: space-between; }
  .item > span { min-width: 0; overflow-wrap: anywhere; }
  td.file { font-family: var(--vscode-editor-font-family); overflow-wrap: anywhere; }
  td.remove { text-align: right; width: 1%; }
  .add { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; padding: 10px 16px; border-top: 1px solid var(--vscode-panel-border); }
  .add input[type=text] { flex: 1 1 160px; min-width: 0; }
`,
        body: `
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
`,
        script: `
  const META = ${scriptJson(meta)};
  let tab = (vscode.getState() || {}).tab || 'application';
  let state = null;


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

  // The Sources tab: the project's items, for every configuration.
  const remove = (kind, include) => el('button', { type: 'button', class: 'secondary', 'aria-label': 'Remove ' + include,
    onclick: () => vscode.postMessage({ type: 'removeItem', kind, value: include }) }, 'Remove');
  const itemRow = (kind, include, ...rest) => el('div', { class: 'row item' }, el('span', {}, ...rest), remove(kind, include));
  const none = text => el('div', { class: 'empty' }, text);

  function sources(s) {
    const compiled = el('section', {},
      el('h2', {}, 'Compiled sources · ' + s.compile.length),
      s.compile.length === 0 ? none('No source files.') : el('div', { class: 'table-wrap' }, el('table', {},
        el('thead', {}, el('tr', {}, el('th', {}, 'File'), el('th', {}, ''), el('th', {}, ''))),
        el('tbody', {}, ...s.compile.map(i => el('tr', {},
          el('td', { class: 'file' }, i.include),
          el('td', {}, i.generated ? el('span', { class: 'pill info', title: 'The Clarion IDE generates this module' }, 'Generated') : ''),
          el('td', { class: 'remove' }, remove('Compile', i.include))))))),
      el('div', { class: 'add' }, el('button', { type: 'button', class: 'primary', onclick: () => vscode.postMessage({ type: 'pickSource' }) }, 'Add source file…')));

    const references = el('section', {},
      el('h2', {}, 'Project references'),
      ...(s.projectReferences.length === 0 ? [none('No project references.')]
        : s.projectReferences.map(i => itemRow('ProjectReference', i.include, i.name || i.include, i.name ? el('span', { class: 'muted' }, ' · ' + i.include) : null))));

    const choice = el('select', { 'aria-label': 'File driver to add', disabled: s.driverChoices.length === 0 },
      ...s.driverChoices.map(d => el('option', { value: d }, d)));
    const drivers = el('section', {},
      el('h2', {}, 'File drivers'),
      ...(s.fileDrivers.length === 0 ? [none('No file drivers.')] : s.fileDrivers.map(i => itemRow('FileDriver', i.include, i.include))),
      el('div', { class: 'add' }, choice, el('button', { type: 'button', class: 'secondary', disabled: s.driverChoices.length === 0,
        onclick: () => vscode.postMessage({ type: 'addItem', kind: 'FileDriver', value: choice.value }) }, 'Add driver')));

    const library = el('input', { type: 'text', placeholder: 'win32.lib', 'aria-label': 'Library or object to add' });
    const addLibrary = () => { if (library.value.trim()) vscode.postMessage({ type: 'addItem', kind: 'Library', value: library.value }); };
    library.addEventListener('keydown', e => { if (e.key === 'Enter') addLibrary(); });
    const libraries = el('section', {},
      el('h2', {}, 'Libraries and objects'),
      ...(s.libraries.length === 0 ? [none('No libraries or objects.')] : s.libraries.map(i => itemRow('Library', i.include, i.include))),
      el('div', { class: 'add' }, library, el('button', { type: 'button', class: 'secondary', onclick: addLibrary }, 'Add')));

    // #803: the IDE's "Projects to include": legacy TopSpeed projects pulled into the build.
    const includes = el('section', {},
      el('h2', {}, 'Projects to include'),
      ...(s.includes.length === 0 ? [none('No TopSpeed projects included.')] : s.includes.map(i => itemRow('Include', i.include, i.include))),
      el('div', { class: 'add' }, el('button', { type: 'button', class: 'secondary', onclick: () => vscode.postMessage({ type: 'pickInclude' }) }, 'Add project file…')));

    return [el('div', { class: 'muted' }, 'Items apply to every configuration.'), compiled,
      el('div', { class: 'columns' }, references, drivers, libraries, includes)];
  }

  function render() {
    if (!state) return;
    document.getElementById('name').textContent = state.outputName || state.file.split(/[\\\\/]/).pop();
    document.getElementById('sub').textContent = state.file + ' · ' + state.kind + ' project';
    const cfg = document.getElementById('configuration');
    cfg.replaceChildren(...state.configurations.map(c => el('option', { value: c }, c)));
    cfg.value = state.configuration;

    const tabs = document.getElementById('tabs');
    tabs.replaceChildren(...state.tabs.map(t => el('button', { type: 'button', role: 'tab', 'aria-selected': t.id === tab ? 'true' : 'false',
      onclick: () => { tab = t.id; vscode.setState({ tab }); render(); } }, t.label)));

    const page = state.tabs.find(t => t.id === tab) || state.tabs[0];
    if (page.id === 'sources') { document.getElementById('page').replaceChildren(...sources(state.sources)); return; }
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
    // #803: a tab asked for (a Solution View folder opens Sources), with the state or on its own.
    if (e.data && e.data.tab) { tab = e.data.tab; vscode.setState({ tab }); }
    if (e.data && e.data.type === 'state') { state = Object.assign({}, e.data.state, { file: e.data.file }); render(); }
    if (e.data && e.data.type === 'tab') render();
  });
  vscode.postMessage({ type: 'ready' });
`,
    });
}
