import * as vscode from 'vscode';
import LoggerManager from '../utils/LoggerManager';
import { pageHtml as kitPage } from '../webview/PageKit';
import { buildReviewState, defaultChoices, ReviewChoices, ReviewInput, ReviewResult, reviewResult } from './NewSolutionReview';

const logger = LoggerManager.getLogger('NewSolutionReviewPanel');
logger.setLevel('error');

type ReviewMessage =
    | { type: 'ready' | 'create' | 'cancel' }
    | { type: 'include' | 'keep'; key: string; value: boolean }
    | { type: 'kind'; key: string; value: 'exe' | 'dll' }
    | { type: 'place'; key: string; value: string }
    | { type: 'name' | 'configuration'; value: string };

/**
 * #792 — New Solution's review page: the whole proposal for a folder of programs, confirmed once.
 * The page sends each change, the state comes back from NewSolutionReview, and the result is the
 * projects to write; undefined when the user cancels or closes the page. A configuration change
 * redoes the inference through `reconfigure`, as its redirection can find other library sources.
 */
export function showNewSolutionReview(
    first: ReviewInput,
    solutionName: string,
    reconfigure: (configuration: string) => Promise<ReviewInput>,
): Promise<ReviewResult | undefined> {
    return new Promise(resolve => {
        let input = first;
        let choices: ReviewChoices = defaultChoices(input.inference, solutionName);
        let busy = false, settled = false, generation = 0;
        const panel = vscode.window.createWebviewPanel('clarion.newSolutionReview', 'New Solution', vscode.ViewColumn.Active, { enableScripts: true });
        panel.webview.html = pageHtml(panel.webview);

        const finish = (result: ReviewResult | undefined) => {
            if (settled) return;
            settled = true;
            resolve(result);
            panel.dispose();
        };
        const post = () => panel.webview.postMessage({ type: 'state', state: buildReviewState(input, choices), busy });
        panel.onDidDispose(() => finish(undefined));

        panel.webview.onDidReceiveMessage(async (msg: ReviewMessage) => {
            try {
                switch (msg.type) {
                    case 'ready': break;
                    case 'include': choices = { ...choices, included: { ...choices.included, [msg.key]: msg.value } }; break;
                    case 'kind': choices = { ...choices, kinds: { ...choices.kinds, [msg.key]: msg.value } }; break;
                    case 'place': choices = { ...choices, placement: { ...choices.placement, [msg.key]: msg.value } }; break;
                    case 'keep': choices = { ...choices, kept: { ...choices.kept, [msg.key]: msg.value } }; break;
                    case 'name': choices = { ...choices, name: msg.value }; break;
                    case 'configuration': {
                        choices = { ...choices, configuration: msg.value };
                        const mine = ++generation;
                        busy = true;
                        post();
                        const next = await reconfigure(msg.value);
                        // A later change of configuration wins over this one.
                        if (mine !== generation || settled) return;
                        input = next;
                        busy = false;
                        break;
                    }
                    case 'create': {
                        const result = busy ? undefined : reviewResult(input, choices);
                        if (result) return finish(result);
                        break;
                    }
                    case 'cancel': return finish(undefined);
                }
                if (!settled) post();
            } catch (err) {
                busy = false;
                logger.error(`❌ New Solution review: ${err instanceof Error ? err.message : String(err)}`);
                vscode.window.showErrorMessage(`New Solution: ${err instanceof Error ? err.message : String(err)}`);
                if (!settled) post();
            }
        });
    });
}

/** The page: VS Code's theme colours; the proposal arrives by message and every change goes back. */
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
`,
        body: `
<header>
  <div class="title"><h1 id="title">New solution</h1><div class="muted" id="summary"></div></div>
</header>
<main>
  <section>
    <h2>Projects, one per program</h2>
    <div class="table-wrap"><table>
      <thead><tr><th>Include</th><th>Program</th><th>EXE or DLL</th><th>Sources</th><th>References</th><th>Export file</th></tr></thead>
      <tbody id="projects"></tbody>
    </table></div>
  </section>
  <div class="pair">
    <section class="attention" id="place-section" hidden><h2 id="place-title">Modules to place</h2><div id="place"></div></section>
    <section id="leftover-section" hidden>
      <h2>Possible leftovers · nothing calls them</h2>
      <div class="row muted">A generator can leave old modules behind. Untick the ones the project no longer uses.</div>
      <div id="leftovers"></div>
    </section>
  </div>
  <div class="info muted" id="note" hidden></div>
  <div class="fields">
    <label class="field"><span>Solution name</span><input type="text" id="name" data-key="name"></label>
    <label class="field"><span>Configuration</span><select id="configuration"></select></label>
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
  $('configuration').addEventListener('change', e => post({ type: 'configuration', value: e.target.value }));
  $('create').addEventListener('click', () => post({ type: 'create' }));
  $('cancel').addEventListener('click', () => post({ type: 'cancel' }));

  /** A redraw replaces the controls: the one that had focus gets it back. */
  function keepingFocus(draw) {
    const key = document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.key : undefined;
    draw();
    if (key) for (const e of document.querySelectorAll('[data-key]')) if (e.dataset.key === key) { e.focus(); break; }
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
    $('title').textContent = state.title;
    $('summary').textContent = state.summary + (busy ? ' · finding the library sources…' : '');
    keepingFocus(() => {
      $('projects').replaceChildren(...state.projects.map(projectRow));
      $('place-section').hidden = state.toPlace.length === 0;
      $('place-title').textContent = 'Modules to place · ' + state.toPlace.length;
      $('place').replaceChildren(...state.toPlace.map(placeRow));
      $('leftover-section').hidden = state.leftovers.length === 0;
      $('leftovers').replaceChildren(...state.leftovers.map(l => el('label', { class: 'leftover' },
        checkbox(l.file, l.kept, 'Keep ' + l.file, 'keep'), el('code', {}, l.file), el('span', { class: 'muted' }, l.project))));
    });
    $('note').hidden = !state.note;
    $('note').textContent = state.note;
    if (document.activeElement !== $('name')) $('name').value = state.name;
    const cfg = $('configuration');
    cfg.replaceChildren(...state.configurations.map(c => el('option', { value: c }, c)));
    cfg.value = state.configuration;
    cfg.disabled = busy;
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
