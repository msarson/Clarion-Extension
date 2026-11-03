import * as vscode from 'vscode';
import * as path from 'path';
import LoggerManager from '../utils/LoggerManager';
import { ClarionInstallation, ClarionInstallationDetector } from '../utils/ClarionInstallationDetector';
import { pageHtml as kitPage } from '../webview/PageKit';
import { ReviewInput } from './NewSolutionReview';
import { buildFormState, defaultFormChoices, FormChoices, FormInput, formResult, FormResult, StartFrom } from './NewSolutionForm';
import { SolutionChoice } from './SolutionPage';

const logger = LoggerManager.getLogger('NewSolutionReviewPanel');
logger.setLevel('error');

type FormMessage =
    | { type: 'ready' | 'create' | 'cancel' | 'browse' | 'folder' }
    | { type: 'include' | 'keep'; key: string; value: boolean }
    | { type: 'kind'; key: string; value: 'exe' | 'dll' }
    | { type: 'place'; key: string; value: string }
    | { type: 'name' | 'configuration' | 'installation' | 'version' | 'mainFile'; value: string }
    | { type: 'start'; value: StartFrom };

/** What New Solution goes on with: the page's result, with the installation it names. */
export type NewSolutionChoice = FormResult & { installation: ClarionInstallation };

/** What New Solution reads from a folder: its programs, and its proposal for a selection. */
export interface NewSolutionFolder {
    programs: number;
    tooLarge: boolean;
    /** The folder's proposal for an installation, compiler version and configuration. */
    review: (installation: ClarionInstallation, compiler: string, configuration: string) => Promise<ReviewInput>;
}

/**
 * #792 — New Solution's page: what the solution builds with, whether it starts from the programs
 * in the folder (whose whole proposal is reviewed here) or a new empty program, and its name, all
 * confirmed once. The page sends each change and the state comes back from NewSolutionForm; the
 * proposal is worked out again whenever the installation, compiler or configuration changes, as
 * their redirection finds the library sources and export files. Undefined when the user cancels
 * or closes the page.
 */
export function showNewSolutionForm(
    startFolder: string,
    readFolder: (folder: string) => Promise<NewSolutionFolder>,
    detected: ClarionInstallation[],
    remembered: SolutionChoice,
): Promise<NewSolutionChoice | undefined> {
    return new Promise(resolve => {
        const installations = [...detected];
        const toOption = (i: ClarionInstallation) => ({ propertiesFile: i.propertiesPath, ideVersion: i.ideVersion, compilers: i.compilerVersions.map(c => c.name) });
        const input: FormInput = { folder: '', installations: installations.map(toOption), programs: 0, tooLarge: false };
        let choices: FormChoices = defaultFormChoices(input, '', remembered);
        let folder: NewSolutionFolder | undefined;
        let busy = false, settled = false, generation = 0, reviewedFor = '';
        const panel = vscode.window.createWebviewPanel('clarion.newSolutionReview', 'New Solution', vscode.ViewColumn.Active, { enableScripts: true, retainContextWhenHidden: true });
        panel.webview.html = pageHtml(panel.webview);

        const finish = (result: NewSolutionChoice | undefined) => {
            if (settled) return;
            settled = true;
            resolve(result);
            panel.dispose();
        };
        const post = () => {
            if (!settled) void panel.webview.postMessage({ type: 'state', state: buildFormState(input, choices), busy });
        };
        panel.onDidDispose(() => finish(undefined));

        /** The proposal for the selection on the page, worked out when it changes; a later change wins. */
        const review = async () => {
            const state = buildFormState(input, choices);
            const installation = installations.find(i => i.propertiesPath === state.installation.value);
            const key = `${state.installation.value}|${state.version.value}|${choices.configuration}`;
            if (!folder || state.start.value !== 'programs' || !installation || !state.version.value || key === reviewedFor) return;
            reviewedFor = key;
            const mine = ++generation;
            busy = true;
            input.review = undefined;
            post();
            try {
                const next = await folder.review(installation, state.version.value, choices.configuration);
                if (mine === generation) input.review = next;
            } catch (err) {
                if (mine === generation) reviewedFor = '';
                throw err;
            } finally {
                if (mine === generation) busy = false;
            }
        };

        /**
         * Reads `chosen` and shows it: its programs, and its proposal. The name follows the folder's
         * until the user types another, and the choices about the old folder's programs are dropped.
         */
        const useFolder = async (chosen: string) => {
            const mine = ++generation;
            busy = true;
            post();
            try {
                const read = await readFolder(chosen);
                if (mine !== generation) return;
                const followsFolder = !choices.name.trim() || choices.name === path.basename(input.folder);
                folder = read;
                Object.assign(input, { folder: chosen, programs: read.programs, tooLarge: read.tooLarge, review: undefined });
                reviewedFor = '';
                choices = {
                    ...choices, included: {}, kinds: {}, placement: {}, kept: {},
                    name: followsFolder ? path.basename(chosen) : choices.name,
                    start: read.programs > 0 ? 'programs' : 'empty',
                };
            } finally {
                if (mine === generation) busy = false;
            }
            await review();
        };

        panel.webview.onDidReceiveMessage(async (msg: FormMessage) => {
            try {
                switch (msg.type) {
                    case 'ready': break;
                    case 'include': choices = { ...choices, included: { ...choices.included, [msg.key]: msg.value } }; break;
                    case 'kind': choices = { ...choices, kinds: { ...choices.kinds, [msg.key]: msg.value } }; break;
                    case 'place': choices = { ...choices, placement: { ...choices.placement, [msg.key]: msg.value } }; break;
                    case 'keep': choices = { ...choices, kept: { ...choices.kept, [msg.key]: msg.value } }; break;
                    case 'name': choices = { ...choices, name: msg.value }; break;
                    case 'mainFile': choices = { ...choices, mainFile: msg.value }; break;
                    case 'start': choices = { ...choices, start: msg.value }; await review(); break;
                    case 'installation': choices = { ...choices, propertiesFile: msg.value, version: undefined }; await review(); break;
                    case 'version': choices = { ...choices, version: msg.value }; await review(); break;
                    case 'configuration': choices = { ...choices, configuration: msg.value }; await review(); break;
                    case 'folder': {
                        const picked = await vscode.window.showOpenDialog({
                            title: 'The folder for the new solution', canSelectFolders: true, canSelectFiles: false, canSelectMany: false,
                            openLabel: 'Use this folder', defaultUri: input.folder ? vscode.Uri.file(input.folder) : undefined,
                        });
                        if (picked?.length) await useFolder(picked[0].fsPath);
                        break;
                    }
                    case 'browse': {
                        const picked = await vscode.window.showOpenDialog({
                            title: 'Select ClarionProperties.xml', filters: { ClarionProperties: ['xml'] }, canSelectMany: false, openLabel: 'Select',
                        });
                        if (!picked?.length) break;
                        const installation = await ClarionInstallationDetector.parseInstallationFromPropertiesPath(picked[0].fsPath);
                        if (!installation) {
                            vscode.window.showErrorMessage('No Clarion compiler versions found in the selected ClarionProperties.xml.');
                            break;
                        }
                        installations.push(installation);
                        input.installations = installations.map(toOption);
                        choices = { ...choices, propertiesFile: installation.propertiesPath, version: undefined };
                        await review();
                        break;
                    }
                    case 'create': {
                        const result = busy ? undefined : formResult(input, choices);
                        const installation = result && installations.find(i => i.propertiesPath === result.propertiesFile);
                        if (result && installation) return finish({ ...result, installation });
                        break;
                    }
                    case 'cancel': return finish(undefined);
                }
                post();
            } catch (err) {
                logger.error(`❌ New Solution: ${err instanceof Error ? err.message : String(err)}`);
                vscode.window.showErrorMessage(`New Solution: ${err instanceof Error ? err.message : String(err)}`);
                post();
            }
        });
        void (startFolder ? useFolder(startFolder) : Promise.resolve()).then(post, err => {
            logger.error(`❌ New Solution: ${err instanceof Error ? err.message : String(err)}`);
            post();
        });
    });
}

/** The page: VS Code's theme colours; the state arrives by message and every change goes back. */
function pageHtml(webview: vscode.Webview): string {
    return kitPage({
        cspSource: webview.cspSource,
        title: 'New Solution',
        css: `
  [hidden] { display: none !important; }
  main { max-width: 1180px; }
  .pair { display: flex; flex-wrap: wrap; gap: 20px; }
  .pair > section { flex: 1 1 360px; min-width: 0; }
  .seg { display: inline-flex; border: 1px solid var(--vscode-input-border, var(--vscode-panel-border)); border-radius: 2px; overflow: hidden; }
  .seg button { border: none; min-height: 26px; padding: 0 12px; background: var(--vscode-input-background); color: var(--vscode-input-foreground); font: inherit; cursor: pointer; }
  .seg button[aria-pressed=true] { background: var(--vscode-button-background); color: var(--vscode-button-foreground); }
  tr.excluded td:not(:first-child) { opacity: 0.5; }
  .program { display: flex; flex-direction: column; gap: 2px; }
  .leftover { display: flex; align-items: center; gap: 10px; padding: 4px 16px; }
  .info { display: flex; gap: 8px; padding: 10px 16px; border: 1px solid var(--vscode-panel-border); border-radius: 4px; }
  .fields { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 12px; }
  .field { display: flex; flex-direction: column; gap: 6px; }
  .field input[type=text] { width: 220px; }
  select.needs { border-color: var(--vscode-editorWarning-foreground); }
  .label .needs-text { color: var(--vscode-editorWarning-foreground); font-weight: 600; }
  .with-button { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
  .control select { max-width: 520px; }
  label.option { display: flex; align-items: center; gap: 8px; }
`,
        body: `
<header>
  <div class="title"><h1 id="title">New solution</h1><div class="muted" id="summary"></div></div>
</header>
<main>
  <section>
    <h2>Folder</h2>
    <div class="row"><div class="label" id="folder-label"></div><div class="control"><div class="with-button">
      <span id="folder-path"></span>
      <button class="secondary" id="folder" type="button" title="Choose or create the folder the solution is made in">Choose folder…</button>
    </div></div></div>
  </section>
  <section>
    <h2>Build with</h2>
    <div class="row"><div class="label" id="installation-label"></div><div class="control"><div class="with-button">
      <select id="installation" aria-label="Clarion installation"></select>
      <button class="secondary" id="browse" type="button" title="An installation outside the standard locations">Browse…</button>
    </div></div></div>
    <div class="row"><div class="label" id="version-label"></div><div class="control"><select id="version" aria-label="Compiler version"></select></div></div>
    <div class="row"><div class="label"><span>Configuration</span></div><div class="control"><select id="configuration" aria-label="Configuration"></select></div></div>
  </section>
  <section>
    <h2>Start from</h2>
    <div class="row" id="start-programs-row"><label class="option"><input type="radio" name="start" id="start-programs" value="programs"><span id="start-programs-text"></span></label></div>
    <div class="row"><label class="option"><input type="radio" name="start" id="start-empty" value="empty"><span>A new empty program</span></label></div>
    <div class="row muted" id="start-why" hidden></div>
    <div class="row" id="main-file-row"><div class="label"><span>Main source file</span></div>
      <div class="control"><input type="text" id="main-file" data-key="mainFile" aria-label="Main source file"><span class="note" id="main-file-error" hidden></span></div></div>
  </section>
  <div class="info muted" id="waiting" hidden></div>
  <div id="review" hidden>
    <section>
      <h2>Projects, one per program</h2>
      <div class="table-wrap"><table>
        <thead><tr><th>Include</th><th>Program</th><th>EXE or DLL</th><th>Sources</th><th>References</th><th>Export file</th></tr></thead>
        <tbody id="projects"></tbody>
      </table></div>
    </section>
    <div class="pair" style="margin-top: 20px">
      <section class="attention" id="place-section" hidden><h2 id="place-title">Modules to place</h2><div id="place"></div></section>
      <section id="leftover-section" hidden>
        <h2>Possible leftovers · nothing calls them</h2>
        <div class="row muted">A generator can leave old modules behind. Untick the ones the project no longer uses.</div>
        <div id="leftovers"></div>
      </section>
    </div>
    <div class="info muted" id="note" hidden style="margin-top: 20px"></div>
  </div>
  <div class="fields">
    <label class="field"><span>Solution name</span><input type="text" id="name" data-key="name"></label>
    <button class="primary" id="create" type="button">Create</button>
    <button class="secondary" id="cancel" type="button">Cancel</button>
  </div>
  <div class="note" id="name-error" hidden></div>
</main>
`,
        script: `
  let state = null, busy = false;
  const $ = id => document.getElementById(id);
  const post = m => vscode.postMessage(m);
  $('name').addEventListener('input', e => post({ type: 'name', value: e.target.value }));
  $('main-file').addEventListener('input', e => post({ type: 'mainFile', value: e.target.value }));
  for (const id of ['installation', 'version', 'configuration']) $(id).addEventListener('change', e => post({ type: id, value: e.target.value }));
  for (const id of ['start-programs', 'start-empty']) $(id).addEventListener('change', e => { if (e.target.checked) post({ type: 'start', value: e.target.value }); });
  $('browse').addEventListener('click', () => post({ type: 'browse' }));
  $('folder').addEventListener('click', () => post({ type: 'folder' }));
  $('create').addEventListener('click', () => post({ type: 'create' }));
  $('cancel').addEventListener('click', () => post({ type: 'cancel' }));

  /** A redraw replaces the controls: the one that had focus gets it back. */
  function keepingFocus(draw) {
    const key = document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.key : undefined;
    draw();
    if (key) for (const e of document.querySelectorAll('[data-key]')) if (e.dataset.key === key) { e.focus(); break; }
  }

  function fillChoice(id, label, f) {
    const s = $(id);
    s.className = f.needs ? 'needs' : '';
    s.replaceChildren(...(f.value ? [] : [el('option', { value: '' }, f.options.length ? 'Choose…' : 'None found')]),
      ...f.options.map(o => el('option', { value: o.value }, o.label)));
    s.value = f.value;
    $(id + '-label').replaceChildren(el('span', { class: f.needs ? 'needs-text' : '' }, label), f.needs ? el('span', { class: 'muted' }, 'Choose one') : '');
  }

  function checkbox(key, checked, label, type) {
    const box = el('input', { type: 'checkbox', 'aria-label': label, 'data-key': type + ':' + key,
      onchange: e => post({ type, key, value: e.target.checked }) });
    box.checked = checked;
    return box;
  }

  function projectRow(p) {
    const seg = el('div', { class: 'seg', role: 'group', 'aria-label': p.name + ' builds' },
      ...['exe', 'dll'].map(k => el('button', { type: 'button', 'aria-pressed': p.kind === k ? 'true' : 'false', 'data-key': 'kind:' + p.programFile + ':' + k,
        onclick: () => post({ type: 'kind', key: p.programFile, value: k }) }, k.toUpperCase())));
    const exp = el('div', { class: 'program' },
      p.exportFile.tone === 'muted' ? el('span', { class: 'muted' }, p.exportFile.text) : el('span', {}, el('span', { class: 'pill ' + p.exportFile.tone }, p.exportFile.text)),
      p.exportFile.detail ? el('span', { class: 'muted' }, p.exportFile.detail) : null);
    return el('tr', { class: p.included ? '' : 'excluded' },
      el('td', {}, checkbox(p.programFile, p.included, 'Include ' + p.name, 'include')),
      el('td', {}, el('div', { class: 'program' }, el('span', {}, p.name), el('span', { class: 'muted' }, p.programFile + ' · ' + p.why))),
      el('td', {}, seg),
      el('td', {}, p.sources),
      el('td', {}, p.included ? (p.references.join(', ') || '—') : '—'),
      el('td', {}, exp));
  }

  function placeRow(m) {
    const s = el('select', { 'aria-label': 'Project for ' + m.file, 'data-key': 'place:' + m.file,
      onchange: e => post({ type: 'place', key: m.file, value: e.target.value }) },
      ...m.options.map(o => el('option', { value: o.value }, o.label)));
    s.value = m.value;
    return el('div', { class: 'row' },
      el('div', { class: 'label' }, el('code', {}, m.file), el('span', { class: 'muted' }, m.why)), s);
  }

  function render() {
    if (!state) return;
    const r = state.review;
    $('title').textContent = state.title;
    $('summary').textContent = (r ? r.summary : '') + (busy ? (r ? ' · ' : '') + 'finding the library sources…' : '');
    $('folder-label').replaceChildren(el('span', { class: state.folder.needs ? 'needs-text' : '' }, 'Make it in'), state.folder.needs ? el('span', { class: 'muted' }, 'Choose a folder') : '');
    $('folder-path').textContent = state.folder.value || 'No folder chosen';
    $('folder').disabled = busy;
    fillChoice('installation', 'Clarion installation', state.installation);
    fillChoice('version', 'Compiler version', state.version);
    const cfg = $('configuration');
    cfg.replaceChildren(...state.configurations.map(c => el('option', { value: c }, c)));
    cfg.value = state.configuration;
    for (const id of ['installation', 'version', 'configuration']) $(id).disabled = busy;

    const fromPrograms = state.start.value === 'programs';
    $('start-programs-row').hidden = !state.start.offered;
    $('start-programs-text').textContent = 'The ' + state.start.programs + (state.start.programs === 1 ? ' program' : ' programs') + ' in this folder';
    $('start-programs').checked = fromPrograms;
    $('start-empty').checked = !fromPrograms;
    $('start-why').hidden = !state.start.why;
    $('start-why').textContent = state.start.why || '';
    $('main-file-row').hidden = fromPrograms;
    if (document.activeElement !== $('main-file')) $('main-file').value = state.mainFile;
    $('main-file-error').hidden = !state.mainFileError;
    $('main-file-error').textContent = state.mainFileError || '';

    $('waiting').hidden = !state.waiting;
    $('waiting').textContent = state.waiting || '';
    $('review').hidden = !r;
    if (r) {
      keepingFocus(() => {
        $('projects').replaceChildren(...r.projects.map(projectRow));
        $('place-section').hidden = r.toPlace.length === 0;
        $('place-title').textContent = 'Modules to place · ' + r.toPlace.length;
        $('place').replaceChildren(...r.toPlace.map(placeRow));
        $('leftover-section').hidden = r.leftovers.length === 0;
        $('leftovers').replaceChildren(...r.leftovers.map(l => el('label', { class: 'leftover' },
          checkbox(l.file, l.kept, 'Keep ' + l.file, 'keep'), el('code', {}, l.file), el('span', { class: 'muted' }, l.project))));
      });
      $('note').hidden = !r.note;
      $('note').textContent = r.note;
    }

    if (document.activeElement !== $('name')) $('name').value = state.name;
    $('create').textContent = state.createLabel;
    $('create').disabled = busy || !state.canCreate;
    $('name-error').hidden = !state.nameError;
    $('name-error').textContent = state.nameError || '';
  }

  window.addEventListener('message', e => {
    if (e.data && e.data.type === 'state') { state = e.data.state; busy = !!e.data.busy; render(); }
  });
  post({ type: 'ready' });
`,
    });
}
