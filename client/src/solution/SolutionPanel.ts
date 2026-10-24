import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { globalSolutionFile, globalClarionPropertiesFile, globalClarionVersion, globalSettings } from '../globals';
import { ClarionInstallation, ClarionInstallationDetector } from '../utils/ClarionInstallationDetector';
import { extractConfigurationsFromSolution } from '../utils/ExtensionHelpers';
import { configurationName } from '../utils/ConfigurationPrecedence';
import { versionPathSettings } from '../utils/VersionPathSettings';
import { lastBuildLog } from '../utils/LastBuildLog';
import { getLanguageClient, isClientReady } from '../LanguageClientManager';
import { GraphStatus, graphStatusText } from '../views/GraphStatus';
import { pageHtml } from '../webview/PageKit';
import LoggerManager from '../utils/LoggerManager';
import {
    buildSolutionPageState, InstallationOption, projectsInSln, projectSummary, SolutionChoice, SolutionPageInput, SolutionPageProject,
} from './SolutionPage';

const logger = LoggerManager.getLogger('SolutionPanel');
logger.setLevel('error');

/** What Open Solution goes on with once the page is confirmed. */
export interface OpenSelection {
    installation: ClarionInstallation;
    compilerName: string;
    /** The .sln's own entry (`Debug|Win32`). */
    configuration: string;
}

interface PageMessage { type: string; field?: string; value?: string; cwproj?: string; checked?: boolean; }

/**
 * #792 — the Solution page in the editor area. `showProperties` shows the loaded solution and
 * changes it in place, through the same code as Set Version, Set Configuration and Set as Startup
 * Project. `chooseForOpen` shows a solution being opened, with what is left to choose marked, and
 * resolves with the selection once it is opened from the page, or null when it is cancelled.
 */
export class SolutionPanel {
    private static properties: SolutionPanel | undefined;
    private static graph: GraphStatus | undefined;

    private input: SolutionPageInput | undefined;
    private installations: ClarionInstallation[] = [];
    /** The export-file lookup already done, by the selection it was done for. */
    private expLookedUpFor = '';
    private settle?: (selection: OpenSelection | null) => void;

    private constructor(
        private readonly panel: vscode.WebviewPanel,
        private readonly mode: 'open' | 'properties',
        private readonly solutionFile: string,
        private choice: SolutionChoice,
        private readonly reason?: string,
    ) {
        panel.webview.options = { enableScripts: true };
        panel.webview.html = html(panel.webview);
        panel.webview.onDidReceiveMessage((msg: PageMessage) => this.receive(msg).catch(err => {
            logger.error(`❌ Solution page: ${err instanceof Error ? err.message : String(err)}`);
            vscode.window.showErrorMessage(`Solution page: ${err instanceof Error ? err.message : String(err)}`);
        }));
        panel.onDidDispose(() => {
            if (SolutionPanel.properties === this) SolutionPanel.properties = undefined;
            this.finish(null);
        });
    }

    public static register(): vscode.Disposable[] {
        return [
            vscode.commands.registerCommand('clarion.openSolutionProperties', () => SolutionPanel.showProperties()),
            // The page shows these settings, so it follows their changes.
            vscode.workspace.onDidChangeConfiguration(e => {
                if (e.affectsConfiguration('clarion.build.preserveLogFile') || e.affectsConfiguration('clarion.run.command')
                    || e.affectsConfiguration('clarion.startupProject')) {
                    SolutionPanel.refresh();
                }
            }),
        ];
    }

    /** The loaded solution's page; focused when it is already open. */
    static async showProperties(): Promise<void> {
        if (!globalSolutionFile) {
            vscode.window.showInformationMessage('Open a Clarion solution to see its properties.');
            return;
        }
        if (SolutionPanel.properties && SolutionPanel.properties.solutionFile === globalSolutionFile) {
            SolutionPanel.properties.panel.reveal();
            await SolutionPanel.properties.reload();
            return;
        }
        SolutionPanel.properties?.panel.dispose();
        const panel = vscode.window.createWebviewPanel('clarion.solutionProperties', `${path.basename(globalSolutionFile)} Properties`,
            vscode.ViewColumn.Active, { enableScripts: true, retainContextWhenHidden: true });
        SolutionPanel.properties = new SolutionPanel(panel, 'properties', globalSolutionFile, SolutionPanel.currentChoice());
        await SolutionPanel.properties.reload();
    }

    /**
     * Open Solution's question, asked once: what `solutionFile` builds with. `remembered` fills in
     * what is known; `reason` says why it is asked.
     */
    static async chooseForOpen(solutionFile: string, remembered: SolutionChoice, reason?: string): Promise<OpenSelection | null> {
        const panel = vscode.window.createWebviewPanel('clarion.openSolution', `Open ${path.basename(solutionFile)}`,
            vscode.ViewColumn.Active, { enableScripts: true, retainContextWhenHidden: true });
        const page = new SolutionPanel(panel, 'open', solutionFile, { ...remembered }, reason);
        const chosen = new Promise<OpenSelection | null>(resolve => { page.settle = resolve; });
        await page.reload();
        return chosen;
    }

    /** The loaded solution changed (version, configuration, startup project, settings, a reload). */
    static refresh(): void {
        const page = SolutionPanel.properties;
        if (!page) return;
        if (page.solutionFile !== globalSolutionFile) {
            page.panel.dispose();
            return;
        }
        page.choice = SolutionPanel.currentChoice();
        void page.reload();
    }

    static setGraphStatus(status: GraphStatus): void {
        SolutionPanel.graph = status;
        SolutionPanel.refresh();
    }

    private static currentChoice(): SolutionChoice {
        return { propertiesFile: globalClarionPropertiesFile, version: globalClarionVersion, configuration: globalSettings.configuration };
    }

    private finish(selection: OpenSelection | null): void {
        const settle = this.settle;
        this.settle = undefined;
        settle?.(selection);
    }

    /** Reads the installations, the .sln and its projects again, and redraws. */
    private async reload(): Promise<void> {
        const detected = await ClarionInstallationDetector.detectInstallations();
        // #479 — an installation outside the standard locations is never detected; keep the one in use.
        for (const file of [this.choice.propertiesFile, ...this.installations.map(i => i.propertiesPath)]) {
            if (file && !detected.some(i => samePath(i.propertiesPath, file)) && fs.existsSync(file)) {
                const extra = this.installations.find(i => samePath(i.propertiesPath, file))
                    ?? await ClarionInstallationDetector.parseInstallationFromPropertiesPath(file);
                if (extra) detected.push(extra);
            }
        }
        this.installations = detected;

        let slnText = '';
        try {
            slnText = fs.readFileSync(this.solutionFile, 'utf8');
        } catch (err) {
            logger.warn(`could not read ${this.solutionFile}: ${err instanceof Error ? err.message : String(err)}`);
        }
        const folder = path.dirname(this.solutionFile);
        const previous = this.input?.projects ?? [];
        const projects: SolutionPageProject[] = projectsInSln(slnText).map(p => {
            const cwproj = path.join(folder, p.path);
            let summary = projectSummary('');
            try {
                summary = projectSummary(fs.readFileSync(cwproj, 'utf8'));
            } catch {
                logger.warn(`could not read ${cwproj}`);
            }
            const known = previous.find(x => x.guid === p.guid);
            return { name: p.name, guid: p.guid, cwproj, kind: summary.kind, references: summary.references, exp: known?.exp, outputName: summary.outputName };
        });

        const settings = vscode.workspace.getConfiguration('clarion');
        this.input = {
            mode: this.mode,
            solutionFile: this.solutionFile,
            installations: this.installations.map(toOption),
            choice: this.choice,
            configurations: extractConfigurationsFromSolution(slnText),
            projects,
            reason: this.reason,
            appData: process.env.APPDATA,
            ...(this.mode === 'properties' ? {
                startupGuid: settings.get<string>('startupProject') || undefined,
                build: {
                    keepLog: vscode.workspace.getConfiguration('clarion.build').get<boolean>('preserveLogFile', false),
                    lastLog: lastBuildLog(),
                    runCommand: settings.get<string>('run.command', ''),
                },
                graph: SolutionPanel.graph ? graphStatusText(SolutionPanel.graph).text : undefined,
            } : {}),
        };
        this.post();
        void this.lookUpExportFiles();
    }

    private state() {
        return this.input ? buildSolutionPageState({ ...this.input, choice: this.choice }) : undefined;
    }

    private post(): void {
        const state = this.state();
        if (state) {
            void this.panel.webview.postMessage({ type: 'state', state, graphBuilt: !!SolutionPanel.graph && SolutionPanel.graph.status === 'built' });
        }
    }

    /**
     * Where the chosen installation's redirection finds each DLL's export file (#763): the server's
     * own resolver, given that installation's paths because the solution may not be loaded yet.
     */
    private async lookUpExportFiles(): Promise<void> {
        const state = this.state();
        const input = this.input;
        if (!state || !input || !state.version.value) return;
        const installation = this.installations.find(i => samePath(i.propertiesPath, state.installation.value));
        const version = installation?.compilerVersions.find(v => v.name === state.version.value);
        const key = `${state.installation.value}|${state.version.value}|${state.configuration.value}`;
        if (!version || key === this.expLookedUpFor) return;
        this.expLookedUpFor = key;

        const dlls = input.projects.filter(p => p.kind === 'DLL');
        if (dlls.length === 0) return;
        const expName = (p: SolutionPageProject) => `${p.outputName || p.name}.exp`;
        let found: Record<string, string> = {};
        const client = getLanguageClient();
        if (client && isClientReady()) {
            try {
                found = await client.sendRequest<Record<string, string>>('clarion/resolveSourceFiles', {
                    folder: path.dirname(this.solutionFile),
                    settings: { ...versionPathSettings(version), configuration: configurationName(state.configuration.value || 'Debug') },
                    names: dlls.map(expName),
                });
            } catch (err) {
                logger.warn(`export files not resolved: ${err instanceof Error ? err.message : String(err)}`);
            }
        }
        if (this.expLookedUpFor !== key) return; // a later selection is being looked up
        for (const p of dlls) {
            const name = expName(p);
            const beside = [path.dirname(this.solutionFile), path.dirname(p.cwproj)].map(d => path.join(d, name)).find(f => fs.existsSync(f));
            p.exp = found[name] ?? beside ?? null;
        }
        this.post();
    }

    private async receive(msg: PageMessage): Promise<void> {
        switch (msg.type) {
            case 'ready':
                this.post();
                break;
            case 'choose':
                await this.choose(msg.field ?? '', msg.value ?? '');
                break;
            case 'browse': {
                const picked = await vscode.window.showOpenDialog({
                    title: 'Select ClarionProperties.xml', filters: { ClarionProperties: ['xml'] }, canSelectMany: false, openLabel: 'Select',
                });
                if (!picked?.length) return;
                const installation = await ClarionInstallationDetector.parseInstallationFromPropertiesPath(picked[0].fsPath);
                if (!installation) {
                    vscode.window.showErrorMessage('No Clarion compiler versions found in the selected ClarionProperties.xml.');
                    return;
                }
                this.installations.push(installation);
                await this.choose('installation', installation.propertiesPath);
                break;
            }
            case 'open': {
                const state = this.state();
                const installation = state && this.installations.find(i => samePath(i.propertiesPath, state.installation.value));
                if (!state?.ready || !installation) return;
                this.finish({ installation, compilerName: state.version.value, configuration: state.configuration.value });
                this.panel.dispose();
                break;
            }
            case 'cancel':
                this.panel.dispose();
                break;
            case 'project':
                if (msg.cwproj) await vscode.commands.executeCommand('clarion.openProjectProperties', vscode.Uri.file(msg.cwproj));
                break;
            case 'sln':
                await vscode.commands.executeCommand('vscode.open', vscode.Uri.file(this.solutionFile));
                break;
            case 'ide':
                await vscode.commands.executeCommand('clarion.openInClarionIDE');
                break;
            case 'keepLog':
                await vscode.workspace.getConfiguration('clarion.build').update('preserveLogFile', !!msg.checked, vscode.ConfigurationTarget.Workspace);
                break;
            case 'openLog': {
                const log = lastBuildLog();
                if (log) await vscode.commands.executeCommand('vscode.open', vscode.Uri.file(log));
                break;
            }
            case 'runSetting':
                await vscode.commands.executeCommand('workbench.action.openSettings', 'clarion.run.command');
                break;
            case 'settings':
                await vscode.commands.executeCommand('workbench.action.openSettings', 'clarion.build');
                break;
            case 'unresolved':
                await vscode.commands.executeCommand('clarion.unresolvedReferencesReport');
                break;
        }
    }

    /** A field changed: kept on the page while opening; applied to the loaded solution otherwise. */
    private async choose(field: string, value: string): Promise<void> {
        const before = this.choice;
        if (field === 'installation') {
            this.choice = { ...this.choice, propertiesFile: value, version: undefined };
        } else if (field === 'version') {
            this.choice = { ...this.choice, version: value };
        } else if (field === 'configuration') {
            this.choice = { ...this.choice, configuration: value };
        } else if (field !== 'startup') {
            return;
        }
        if (this.mode === 'open') {
            this.post();
            void this.lookUpExportFiles();
            return;
        }

        if (field === 'startup') {
            const project = this.input?.projects.find(p => p.guid.replace(/[{}]/g, '').toLowerCase() === value);
            if (project) {
                await vscode.commands.executeCommand('clarion.setStartupProject', {
                    data: { guid: project.guid, name: project.name, path: path.dirname(project.cwproj), filename: path.basename(project.cwproj) },
                });
            }
            return;
        }
        if (field === 'configuration') {
            const { chooseConfiguration } = await import('../config/ConfigurationManager');
            await chooseConfiguration(value);
            return;
        }
        // The version is applied once it is complete; an installation with several compilers waits for one.
        const state = this.state();
        const installation = state && this.installations.find(i => samePath(i.propertiesPath, state.installation.value));
        if (!state || !installation || !state.version.value) {
            this.post();
            return;
        }
        if (samePath(installation.propertiesPath, before.propertiesFile ?? '') && state.version.value === before.version) return;
        const { ClarionExtensionCommands } = await import('../ClarionExtensionCommands');
        await ClarionExtensionCommands.applyPickedVersion(state.version.value, installation.propertiesPath, installation.ideVersion);
        SolutionPanel.refresh();
    }
}

const samePath = (a: string, b: string) => a.replace(/\//g, '\\').toLowerCase() === b.replace(/\//g, '\\').toLowerCase();

function toOption(i: ClarionInstallation): InstallationOption {
    return { propertiesFile: i.propertiesPath, ideVersion: i.ideVersion, compilers: i.compilerVersions.map(c => c.name) };
}

function html(webview: vscode.Webview): string {
    return pageHtml({
        cspSource: webview.cspSource,
        title: 'Solution',
        css: `
  .reason { margin: 0; padding: 12px 16px; display: flex; flex-direction: column; gap: 4px; }
  .reason strong { color: var(--vscode-editorWarning-foreground); }
  select.needs { border-color: var(--vscode-editorWarning-foreground); }
  .label .needs-text { color: var(--vscode-editorWarning-foreground); font-weight: 600; }
  .control .with-button { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
  .control select { max-width: 520px; }
  footer { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; padding: 0 24px 32px; }
  footer .muted { flex: 1 1 260px; }
`,
        body: `
<header>
  <div class="title"><h1 id="title">Solution</h1><div class="muted" id="sub"></div></div>
  <div class="bar" id="bar"></div>
</header>
<main id="page"></main>
<footer id="footer"></footer>`,
        script: `
  let state = null;
  let graphBuilt = false;
  const post = (type, extra) => vscode.postMessage(Object.assign({ type }, extra || {}));

  function choice(field, label, f, extra) {
    const where = f.configDir ? el('span', { class: 'muted' }, 'Its settings are in ' + f.configDir) : null;
    const s = el('select', { class: f.needs ? 'needs' : '', 'aria-label': label,
      onchange: e => post('choose', { field, value: e.target.value }) });
    if (!f.value) s.append(el('option', { value: '' }, f.options.length ? 'Choose…' : 'None found'));
    for (const o of f.options) s.append(el('option', { value: o.value }, o.label));
    s.value = f.value;
    return el('div', { class: 'row' },
      el('div', { class: 'label' }, el('span', { class: f.needs ? 'needs-text' : '' }, label), f.needs ? el('span', { class: 'muted' }, 'Choose one') : null),
      el('div', { class: 'control' }, extra ? el('div', { class: 'with-button' }, s, extra) : s, where));
  }

  function row(label, ...control) {
    return el('div', { class: 'row' }, el('div', { class: 'label' }, el('span', {}, label)), el('div', { class: 'control' }, ...control));
  }

  function render() {
    if (!state) return;
    const open = state.mode === 'open';
    document.getElementById('title').textContent = state.title;
    document.getElementById('sub').textContent = state.solutionFile + ' · ' + state.projects.length + (state.projects.length === 1 ? ' project' : ' projects');
    document.getElementById('bar').replaceChildren(...(open ? [] : [
      el('button', { type: 'button', class: 'secondary', onclick: () => post('ide') }, 'Open in Clarion IDE'),
      el('button', { type: 'button', class: 'secondary', onclick: () => post('sln') }, 'Open .sln as text'),
    ]));

    const sections = [];
    if (open && (state.reason || !state.ready)) {
      sections.push(el('section', { class: 'attention' }, el('div', { class: 'reason' },
        el('strong', {}, state.ready ? 'Check how this solution builds' : 'Choose how this solution builds'),
        state.reason ? el('span', {}, state.reason) : null)));
    }

    const buildWith = [
      choice('installation', 'Clarion installation', state.installation,
        el('button', { type: 'button', class: 'secondary', title: 'An installation outside the standard locations', onclick: () => post('browse') }, 'Browse…')),
      choice('version', 'Compiler version', state.version),
      choice('configuration', 'Configuration', state.configuration),
    ];
    if (!open && state.startup.options.length) {
      buildWith.push(choice('startup', 'Startup project', { value: state.startup.value, options: state.startup.options, needs: false }));
    }
    sections.push(el('section', {}, el('h2', {}, 'Build with'), ...buildWith));

    const tone = t => t === 'none' ? 'muted' : 'pill ' + t;
    sections.push(el('section', {}, el('h2', {}, 'Projects'),
      state.projects.length === 0 ? el('div', { class: 'empty' }, 'This solution lists no Clarion projects.') :
      el('div', { class: 'table-wrap' }, el('table', {},
        el('thead', {}, el('tr', {}, ...['Project', 'Type', 'References', 'Export file', ''].map(h => el('th', {}, h)))),
        el('tbody', {}, ...state.projects.map(p => el('tr', {},
          el('td', {}, p.name, p.startup ? el('span', { class: 'pill info', style: 'margin-left: 8px' }, 'startup') : null),
          el('td', {}, el('span', { class: 'pill' }, p.kind)),
          el('td', {}, p.references),
          el('td', {}, el('span', { class: tone(p.exp.tone) }, p.exp.text)),
          el('td', {}, el('button', { type: 'button', class: 'link', onclick: () => post('project', { cwproj: p.cwproj }) }, 'Properties')))))))));

    if (state.build) {
      const keep = el('input', { type: 'checkbox', onchange: e => post('keepLog', { checked: e.target.checked }) });
      keep.checked = state.build.keepLog;
      sections.push(el('section', {}, el('h2', {}, 'Build and run'),
        row('Build log', el('div', { class: 'with-button' }, el('label', { class: 'inline' }, keep, 'Keep the log after each build'),
          el('span', { class: 'muted' }, state.build.log),
          state.build.log.startsWith('Kept: ') ? el('button', { type: 'button', class: 'link', onclick: () => post('openLog') }, 'Open the last log') : null)),
        row('Run starts', el('div', { class: 'with-button' }, el('span', {}, state.build.run),
          el('button', { type: 'button', class: 'link', onclick: () => post('runSetting') }, 'Change…'))),
        row('Build settings', el('button', { type: 'button', class: 'link', onclick: () => post('settings') }, 'Open the Clarion build settings')),
        state.graph ? row('File graph', el('div', { class: 'with-button' }, el('span', {}, state.graph),
          graphBuilt ? el('button', { type: 'button', class: 'link', onclick: () => post('unresolved') }, 'Unresolved file references…') : null)) : null));
    }
    document.getElementById('page').replaceChildren(...sections);

    document.getElementById('footer').replaceChildren(...(open ? [
      el('button', { type: 'button', class: 'primary', disabled: !state.ready, onclick: () => post('open') }, 'Open solution'),
      el('button', { type: 'button', class: 'secondary', onclick: () => post('cancel') }, 'Cancel'),
      el('span', { class: 'muted' }, 'A solution whose remembered choice still works opens without this page. Change it later from Solution Properties.'),
    ] : []));
  }

  window.addEventListener('message', e => {
    if (e.data && e.data.type === 'state') { state = e.data.state; graphBuilt = !!e.data.graphBuilt; render(); }
  });
  post('ready');
`,
    });
}
