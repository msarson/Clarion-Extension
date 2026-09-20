// Headless LSP perf driver — drives the Clarion language server over Node IPC
// against the locally configured real test solution, mirroring the VS Code client's
// startup sequence (initialize → initialized → clarion/updatePaths →
// solutionReady → didOpen → timed requests). Server perf channels are enabled,
// so every *.Perf line (HoverProvider.Perf, StartupPerf, EventLoop lag, …)
// lands in the stderr log for analysis.
//
// First used to close #361 (hover freeze) with cold/warm evidence; reuse it for
// any measure-the-logs perf issue instead of the build-VSIX→VM-retest loop.
//
// Test substrate: a real solution copied to this machine, plus the matching Clarion install.
// It is a client's PRIVATE source — its paths live in the gitignored scripts/local-corpus.js
// (or the CLARION_TEST_* environment variables), never in this file, a commit or an issue.
// See CLAUDE.local.md.
//
// Usage (run `npm run compile` first — drives out/server/src/server.js):
//   node scripts/perf/lsp-driver.js                 # warm run against the configured solution
//   node scripts/perf/lsp-driver.js --cold          # wipe %TEMP% clarion-extension-* caches first
//   node scripts/perf/lsp-driver.js --sln=...\Other.sln
//   node scripts/perf/lsp-driver.js --file=...\SomeOther.clw
//   node scripts/perf/lsp-driver.js --sln=... --file=... --links   # print document links for the file (#470 hypothesis)
//   node scripts/perf/lsp-driver.js --file=... --refs=LINE:COL       # time find-all-references at a 1-based position (#526)
//   node scripts/perf/lsp-driver.js --link-refresh                   # assert document links reach the editor on startup (#620); exit 0 = all pass
'use strict';
const { fork } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

// --- config -----------------------------------------------------------------
const REPO = path.resolve(__dirname, '..', '..');
const SERVER = path.join(REPO, 'out', 'server', 'src', 'server.js');
const corpus = require('../corpus-config');
const arg = (name) => { const a = process.argv.find(x => x.startsWith(`--${name}=`)); return a ? a.slice(name.length + 3) : undefined; };
const SLN = arg('sln') ?? corpus.required('solution');
const APPDEV = path.dirname(SLN);
const CLARION_ROOT = corpus.required('clarionRoot');
const CLARION_VERSION = corpus.required('clarionVersion');
const TARGET = arg('file') ?? corpus.required('bigFile');
const COLD = process.argv.includes('--cold');
// #460: assert the clarion/diagnosticsStatus ordering instead of timing hovers.
const DIAG_STATUS = process.argv.includes('--diag-status');
const STDERR_LOG = path.join(os.tmpdir(), 'clarion-lsp-driver-stderr.log');

// #460: an ordered timeline of publishDiagnostics + diagnosticsStatus events, so
// the ordering per document is assertable (publish→publish→complete for a normal
// file, publish→complete for a libsrc file, publish→deferred→…→complete when
// opened before the pipelines are ready).
const diagEvents = [];
const lastDiagnostics = {};
const UNRESOLVED_PROC = process.argv.includes('--unresolved-proc');
// #541 — start with the #517 check OFF, turn it on live after the settle window via
// clarion/updateDiagnosticSettings, and report the re-run. Proves the live-settings wiring.
const TOGGLE_UNRESOLVED = process.argv.includes('--toggle-unresolved');
// #544 — print window/workDoneProgress events ($/progress) as they arrive.
const PROGRESS = process.argv.includes('--progress');
// #545 — declare pull-diagnostics support; the server then answers textDocument/diagnostic
// and must NOT push. --pull runs the pull sequence after the settle window.
const PULL = process.argv.includes('--pull');
// #620 — assert the document-link refresh ordering. The client only re-asks for links
// when it receives clarion/refreshDocumentLinks, and DocumentLinkProvider can only answer
// once the file graph is built, so the refresh MUST come after the build.
const LINK_REFRESH = process.argv.includes('--link-refresh');
let refreshRequests = 0;
const progressEvents = [];
// #620 — ordered timeline of the two events whose relative order is the bug.
const linkEvents = [];

if (!fs.existsSync(SERVER)) { console.error(`Server build missing: ${SERVER} — run \`npm run compile\` first.`); process.exit(1); }
if (!fs.existsSync(TARGET)) { console.error(`Target file missing: ${TARGET}`); process.exit(1); }

// --cold: the server persists mtime-validated caches under %TEMP%; wiping them
// forces a true cold start (they rebuild automatically — safe to delete).
if (COLD) {
  const families = ['sdi', 'frg', 'chainindex', 'siblingindex', 'refindex', 'reachableset', 'iv'];
  for (const f of families) {
    fs.rmSync(path.join(os.tmpdir(), `clarion-extension-${f}`), { recursive: true, force: true });
  }
  console.log(`cold run: cleared ${families.length} cache families from ${os.tmpdir()}`);
}

// --- tiny JSON-RPC over Node IPC (the transport the real client uses) --------
let seq = 0;
const pending = new Map();
const notificationWaiters = [];
// Last payload per notification method, so a waiter registered after a --settle can
// see a 'built' graphStatus that already went by instead of timing out.
const lastNotification = new Map();
const child = fork(SERVER, ['--node-ipc'], { stdio: ['ignore', 'pipe', 'pipe', 'ipc'], execArgv: [] });
const errLog = fs.createWriteStream(STDERR_LOG);
child.stderr.on('data', d => {
  errLog.write(d);
  for (const line of d.toString().split('\n')) {
    if (/Hover slow|EventLoop|max_blocked|Perf/i.test(line)) console.log('  [server] ' + line.trim());
  }
});
child.stdout.on('data', d => errLog.write(d));

child.on('message', (msg) => {
  if (msg.id !== undefined && (msg.result !== undefined || msg.error !== undefined)) {
    const p = pending.get(msg.id);
    if (p) { pending.delete(msg.id); msg.error ? p.reject(new Error(JSON.stringify(msg.error))) : p.resolve(msg.result); }
  } else if (msg.method && msg.id !== undefined) {
    // server→client request — answer politely (configuration: all nulls)
    let result = null;
    if (msg.method === 'workspace/configuration') result = (msg.params.items || []).map(() => null);
    // #544 — window/workDoneProgress/create: accept the token (result is void).
    // #545 — workspace/diagnostic/refresh: the server asks the client to re-pull; count it.
    if (msg.method === 'workspace/diagnostic/refresh') refreshRequests++;
    child.send({ jsonrpc: '2.0', id: msg.id, result });
  } else if (msg.method) {
    if (msg.method === '$/progress') {
      // #544 — standard progress; printed in --progress mode.
      progressEvents.push({ t: Date.now(), token: msg.params.token, value: msg.params.value });
      if (PROGRESS) console.log(`  [progress ${String(msg.params.token).slice(0, 8)}] ${msg.params.value.kind}${msg.params.value.title ? ' ' + msg.params.value.title : ''}${msg.params.value.message ? ' — ' + msg.params.value.message : ''}${msg.params.value.percentage !== undefined ? ' ' + msg.params.value.percentage + '%' : ''}`);
    }
    if (msg.method === 'textDocument/publishDiagnostics') {
      // #619 — `version` is optional in LSP 3.15; record what arrived (undefined included)
      // so the --diag-status run can assert every publish carries the version it is for.
      diagEvents.push({ t: Date.now(), kind: 'publish', uri: msg.params.uri, count: (msg.params.diagnostics || []).length, version: msg.params.version });
      lastDiagnostics[msg.params.uri] = msg.params.diagnostics || [];
    } else if (msg.method === 'clarion/diagnosticsStatus') {
      diagEvents.push({ t: Date.now(), kind: 'status', uri: msg.params.uri, state: msg.params.state, version: msg.params.version });
    }
    // #620
    if (msg.method === 'clarion/refreshDocumentLinks') linkEvents.push({ t: Date.now(), kind: 'refresh' });
    if (msg.method === 'clarion/graphStatus' && msg.params && msg.params.status === 'built') linkEvents.push({ t: Date.now(), kind: 'graphBuilt' });
    lastNotification.set(msg.method, msg.params);
    for (let i = notificationWaiters.length - 1; i >= 0; i--) {
      const w = notificationWaiters[i];
      if (w.method === msg.method) { notificationWaiters.splice(i, 1); w.resolve(msg.params); }
    }
    if (!/logMessage|telemetry|progress|publishDiagnostics/.test(msg.method)) {
      console.log(`  [notify] ${msg.method}${msg.params && msg.params.status ? ' ' + msg.params.status : ''}${msg.method === 'clarion/diagnosticsStatus' ? ' ' + msg.params.state + ' v' + msg.params.version : ''}`);
    }
  }
});

function request(method, params, timeoutMs = 300000) {
  const id = ++seq;
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => { pending.delete(id); reject(new Error(`timeout ${method}`)); }, timeoutMs);
    pending.set(id, { resolve: v => { clearTimeout(t); resolve(v); }, reject: e => { clearTimeout(t); reject(e); } });
    child.send({ jsonrpc: '2.0', id, method, params });
  });
}
function notify(method, params) { child.send({ jsonrpc: '2.0', method, params }); }
function waitNotification(method, timeoutMs = 600000) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout waiting for ${method}`)), timeoutMs);
    notificationWaiters.push({ method, resolve: v => { clearTimeout(t); resolve(v); } });
  });
}
const toUri = p => 'file:///' + p.replace(/\\/g, '/').replace(/^\//, '').replace(':', '%3A');

// --- positions: the #361 repro words (edit/extend per investigation) ---------
function findPositions(text) {
  const lines = text.split(/\r?\n/);
  const want = [
    { word: 'NetDebugTrace', match: l => /^\s+NetDebugTrace\s*\(/.test(l) },
    { word: 'netnolog', match: l => l.includes("'/netnolog'") },
    { word: 'Nettalk', match: l => l.includes('[Nettalk Template]') },
    { word: 'dll_mode', match: l => /\bdll_mode\b/i.test(l) },
  ];
  const found = [];
  for (const w of want) {
    for (let i = 0; i < lines.length; i++) {
      if (w.match(lines[i])) {
        found.push({ word: w.word, line: i, character: lines[i].toLowerCase().indexOf(w.word.toLowerCase()) + 2 });
        break;
      }
    }
  }
  return found;
}

// #460 — assert the diagnosticsStatus ordering for the three exits the issue names.
// Runs against the real solution like the perf lane; `updatePaths` is sent AFTER a
// file is already open, exactly as the deferred exit requires.
function sendUpdatePaths() {
  notify('clarion/updatePaths', {
    redirectionPaths: [path.join(CLARION_ROOT, 'bin')],
    projectPaths: [path.dirname(SLN)],
    solutionFilePath: SLN,
    configuration: 'Debug',
    clarionVersion: CLARION_VERSION,
    redirectionFile: 'Clarion100.red',
    macros: { root: CLARION_ROOT, reddir: path.join(CLARION_ROOT, 'bin') },
    libsrcPaths: [
      path.join(CLARION_ROOT, 'libsrc', 'win'),
      path.join(CLARION_ROOT, 'Accessory', 'libsrc', 'win'),
    ],
    defaultLookupExtensions: ['.clw', '.inc', '.equ', '.int'],
  });
}

async function runDiagStatusCheck(t0) {
  const results = [];
  const record = (name, pass, detail) => { results.push({ name, pass, detail }); console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`); };
  const eventsFor = uri => diagEvents.filter(e => e.uri.toLowerCase() === uri.toLowerCase());
  const statesFor = uri => eventsFor(uri).filter(e => e.kind === 'status').map(e => e.state);
  const waitForState = (uri, state, ms) => new Promise(resolve => {
    const deadline = Date.now() + ms;
    const tick = () => {
      if (statesFor(uri).includes(state)) return resolve(true);
      if (Date.now() > deadline) return resolve(false);
      setTimeout(tick, 100);
    };
    tick();
  });

  const libFile = path.join(CLARION_ROOT, 'libsrc', 'win', 'ABASCII.INC');
  const fileC = path.join(REPO, 'test-programs', 'ViewJoinTest', 'viewjoin.clw');

  // Scenario 1 — a normal file opened BEFORE the pipelines are ready: deferred, then
  // complete once the solutionReady drain re-validates it.
  const uriA = toUri(TARGET);
  const textA = fs.readFileSync(TARGET, 'utf8');
  notify('textDocument/didOpen', { textDocument: { uri: uriA, languageId: 'clarion', version: 1, text: textA } });
  console.log(`[${Date.now() - t0}ms] opened ${path.basename(TARGET)} (pre-updatePaths)`);
  const gotDeferred = await waitForState(uriA, 'deferred', 8000);
  record('normal file opened before ready → deferred', gotDeferred, statesFor(uriA).join(',') || '(none)');

  sendUpdatePaths();
  console.log(`[${Date.now() - t0}ms] updatePaths sent — waiting for solutionReady…`);
  await waitNotification('clarion/solutionReady');
  console.log(`[${Date.now() - t0}ms] solutionReady`);
  const aComplete = await waitForState(uriA, 'complete', 120000);
  record('…then complete after the drain pass', aComplete, statesFor(uriA).join(','));

  // Scenario 2 — a libsrc file: one sync publish then complete, async pass skipped.
  if (fs.existsSync(libFile)) {
    const uriB = toUri(libFile);
    notify('textDocument/didOpen', { textDocument: { uri: uriB, languageId: 'clarion', version: 1, text: fs.readFileSync(libFile, 'utf8') } });
    console.log(`[${Date.now() - t0}ms] opened libsrc ${path.basename(libFile)}`);
    const bComplete = await waitForState(uriB, 'complete', 30000);
    const evB = eventsFor(uriB);
    const publishesBeforeComplete = evB.slice(0, evB.findIndex(e => e.kind === 'status' && e.state === 'complete')).filter(e => e.kind === 'publish').length;
    record('libsrc file → complete', bComplete, statesFor(uriB).join(','));
    record('libsrc file → exactly one publish before complete (async skipped)', bComplete && publishesBeforeComplete === 1, `publishes=${publishesBeforeComplete}`);
  } else {
    record('libsrc scenario', false, `libsrc file not found: ${libFile}`);
  }

  // Scenario 3 — a normal file opened AFTER ready: sync publish, then final publish, then complete.
  if (fs.existsSync(fileC)) {
    const uriC = toUri(fileC);
    notify('textDocument/didOpen', { textDocument: { uri: uriC, languageId: 'clarion', version: 1, text: fs.readFileSync(fileC, 'utf8') } });
    console.log(`[${Date.now() - t0}ms] opened ${path.basename(fileC)} (post-ready)`);
    const cComplete = await waitForState(uriC, 'complete', 60000);
    const evC = eventsFor(uriC);
    const publishesBeforeComplete = evC.slice(0, evC.findIndex(e => e.kind === 'status' && e.state === 'complete')).filter(e => e.kind === 'publish').length;
    record('normal file after ready → complete', cComplete, statesFor(uriC).join(','));
    record('normal file after ready → two publishes before complete (sync + async)', cComplete && publishesBeforeComplete >= 2, `publishes=${publishesBeforeComplete}`);
    record('normal file after ready → no deferred/superseded', !statesFor(uriC).includes('deferred') && !statesFor(uriC).includes('superseded'), statesFor(uriC).join(','));
  } else {
    record('post-ready scenario', false, `fixture not found: ${fileC}`);
  }

  // #619 — every publish must carry the document version it was computed for, so a plain
  // LSP client can drop a publish for a buffer it has already changed. The custom
  // clarion/diagnosticsStatus notification only helps a client that knows about it.
  const publishes = diagEvents.filter(e => e.kind === 'publish');
  const versionless = publishes.filter(e => e.version === undefined);
  record('every publishDiagnostics carries a version', publishes.length > 0 && versionless.length === 0,
    `${publishes.length - versionless.length}/${publishes.length} carry one`);
  // The version published must be the one the matching status reports, not a later buffer's.
  const mismatched = publishes.filter(e => {
    if (e.version === undefined) return false;
    const statuses = diagEvents.filter(s => s.kind === 'status' && s.uri === e.uri).map(s => s.version);
    return statuses.length > 0 && !statuses.includes(e.version);
  });
  record('the published version is one the status pass reports', mismatched.length === 0,
    `${mismatched.length} publish(es) with no matching status version`);

  const failed = results.filter(r => !r.pass);
  console.log(`\n== diagnosticsStatus assertions: ${results.length - failed.length}/${results.length} passed ==`);
  try { await request('shutdown', null, 10000); notify('exit'); } catch { }
  setTimeout(() => { child.kill(); process.exit(failed.length ? 1 : 0); }, 1000);
}

// #620 — assert that document links actually reach the editor on a normal startup.
// The editor restores an open .clw before the solution finishes loading, asks once for
// links, caches whatever it gets, and only asks again when told to. So the refresh has
// to arrive AFTER the file graph is built, not before.
async function runLinkRefreshCheck(t0) {
  const results = [];
  const record = (name, pass, detail) => { results.push({ name, pass, detail }); console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`); };

  // A file that is a graph node AND carries quoted filenames to link.
  const linkTarget = arg('file') ?? corpus.required('linkFile');
  if (!fs.existsSync(linkTarget)) {
    record('link fixture present', false, `not found: ${linkTarget}`);
    setTimeout(() => { child.kill(); process.exit(1); }, 100);
    return;
  }
  const text = fs.readFileSync(linkTarget, 'utf8');
  const uri = toUri(linkTarget);
  const directiveLines = text.split(/\r?\n/).filter(l => /\b(INCLUDE|MODULE|LINK)\s*\(\s*'/i.test(l)).length;
  record('fixture carries linkable filenames', directiveLines > 0, `${directiveLines} line(s)`);

  // Open before the solution is announced — what VS Code does with a restored editor.
  notify('textDocument/didOpen', { textDocument: { uri, languageId: 'clarion', version: 1, text } });
  console.log(`[${Date.now() - t0}ms] opened ${path.basename(linkTarget)} (pre-updatePaths)`);

  sendUpdatePaths();
  console.log(`[${Date.now() - t0}ms] updatePaths sent — waiting for solutionReady…`);
  await waitNotification('clarion/solutionReady');
  console.log(`[${Date.now() - t0}ms] solutionReady`);

  // The first ask, exactly as the editor makes it.
  const early = await request('textDocument/documentLink', { textDocument: { uri } }, 120000);
  console.log(`[${Date.now() - t0}ms] documentLink #1 → ${(early ?? []).length} link(s)`);

  let gs = lastNotification.get('clarion/graphStatus');
  while (!gs || gs.status !== 'built') gs = await waitNotification('clarion/graphStatus', 300000);
  const builtAt = Date.now();
  console.log(`[${builtAt - t0}ms] graph built`);

  // Generous window for a post-build refresh to arrive.
  await new Promise(r => setTimeout(r, 10000));

  const refreshesAfterBuild = linkEvents.filter(e => e.kind === 'refresh' && e.t >= builtAt).length;
  const allRefreshes = linkEvents.filter(e => e.kind === 'refresh');
  record('a link refresh is sent after the graph is built', refreshesAfterBuild > 0,
    `${allRefreshes.length} refresh(es) total, ${refreshesAfterBuild} after build`);

  // What the editor would now hold, had it been told to re-ask.
  const late = await request('textDocument/documentLink', { textDocument: { uri } }, 120000);
  console.log(`[${Date.now() - t0}ms] documentLink #2 → ${(late ?? []).length} link(s)`);
  record('the provider answers with links once the graph is built', (late ?? []).length > 0,
    `${(late ?? []).length} link(s)`);

  const failed = results.filter(r => !r.pass);
  console.log(`\n== document-link refresh assertions: ${results.length - failed.length}/${results.length} passed ==`);
  try { await request('shutdown', null, 10000); notify('exit'); } catch { }
  setTimeout(() => { child.kill(); process.exit(failed.length ? 1 : 0); }, 1000);
}

// --- main --------------------------------------------------------------------
(async () => {
  const t0 = Date.now();
  console.log(`== Clarion LSP headless perf driver ==`);
  console.log(`server:   ${SERVER}`);
  console.log(`solution: ${SLN}${COLD ? '  (COLD)' : ''}`);

  await request('initialize', {
    processId: process.pid,
    rootUri: toUri(APPDEV),
    workspaceFolders: [{ uri: toUri(APPDEV), name: path.basename(APPDEV) }],
    capabilities: {
      textDocument: { hover: { contentFormat: ['markdown', 'plaintext'] }, ...(PULL ? { diagnostic: { dynamicRegistration: false } } : {}) },
      workspace: { configuration: true, ...(PULL ? { diagnostics: { refreshSupport: true } } : {}) },
      window: { workDoneProgress: true },
    },
    // perf channels ON — the whole point of this driver
    initializationOptions: { settings: { log: { performance: { enabled: true } } } },
  });
  notify('initialized', {});
  console.log(`[${Date.now() - t0}ms] initialized`);

  if (DIAG_STATUS) { await runDiagStatusCheck(t0); return; }
  if (LINK_REFRESH) { await runLinkRefreshCheck(t0); return; }

  // Mirrors the real client's payload — SolutionInitializer.ts (clarion/updatePaths sender)
  notify('clarion/updatePaths', {
    redirectionPaths: [path.join(CLARION_ROOT, 'bin')],
    projectPaths: [path.dirname(SLN)],
    solutionFilePath: SLN,
    configuration: 'Debug',
    clarionVersion: CLARION_VERSION,
    redirectionFile: 'Clarion100.red',
    macros: { root: CLARION_ROOT, reddir: path.join(CLARION_ROOT, 'bin') },
    libsrcPaths: [
      path.join(CLARION_ROOT, 'libsrc', 'win'),
      path.join(CLARION_ROOT, 'Accessory', 'libsrc', 'win'),
    ],
    defaultLookupExtensions: ['.clw', '.inc', '.equ', '.int'],
    // --undeclared: the #62 opt-in validator (off by default). Needed when
    // measuring #358-class costs — without it `Validator undeclaredVar` is a no-op.
    undeclaredVariablesEnabled: process.argv.includes('--undeclared'),
    unresolvedProcedureCallsEnabled: UNRESOLVED_PROC,
  });
  console.log(`[${Date.now() - t0}ms] updatePaths sent — waiting for solutionReady…`);
  const ready = await waitNotification('clarion/solutionReady');
  console.log(`[${Date.now() - t0}ms] solutionReady: ${JSON.stringify(ready)}`);

  const text = fs.readFileSync(TARGET, 'utf8');
  const uri = toUri(TARGET);
  notify('textDocument/didOpen', { textDocument: { uri, languageId: 'clarion', version: 1, text } });
  console.log(`[${Date.now() - t0}ms] didOpen ${path.basename(TARGET)} (${(text.length / 1024).toFixed(0)}K)`);

  const positions = findPositions(text);
  console.log(`positions: ${positions.map(p => `${p.word}@${p.line + 1}:${p.character}`).join(', ') || '(none found — edit findPositions)'}`);

  // --settle=N (seconds): observation window before the timed requests. Default 3s;
  // raise it (e.g. 60) when measuring the async validator chain / idle-lane work.
  const settleSec = Number(arg('settle') ?? 3);
  await new Promise(r => setTimeout(r, settleSec * 1000));

  // --complete=LINE:COL[,LINE:COL...] (1-based; COL is the cursor column, e.g. just after a dot):
  // time textDocument/completion at each position, cold then warm twice, and print the item count.
  const completeArg = arg('complete');
  if (completeArg) {
    let gs = lastNotification.get('clarion/graphStatus');
    while (!gs || gs.status !== 'built') gs = await waitNotification('clarion/graphStatus', 120000);
    const lines = text.split(/\r?\n/);
    for (const spec of completeArg.split(',')) {
      const [l, c] = spec.split(':').map(Number);
      const position = { line: l - 1, character: (c || 1) - 1 };
      const before = (lines[l - 1] ?? '').slice(0, position.character);
      for (const pass of ['cold', 'warm', 'warm2']) {
        const r0 = Date.now();
        const result = await request('textDocument/completion', { textDocument: { uri }, position, context: { triggerKind: 1 } }, 600000);
        const ms = Date.now() - r0;
        const items = Array.isArray(result) ? result : (result?.items ?? []);
        console.log(`
== completion at ${spec} after "${before.trim()}" (${pass}): ${items.length} item(s), ${ms}ms ==`);
        if (pass === 'cold') console.log(`  first: ${items.slice(0, 8).map(i => i.label).join(', ')}`);
      }
    }
    try { await request('shutdown', null, 10000); notify('exit'); } catch { }
    setTimeout(() => { child.kill(); process.exit(0); }, 1000);
    return;
  }

  // --refs=LINE:COL (1-based): time textDocument/references at that position in TARGET,
  // cold then warm, print the hit count grouped by file, and stop. Waits for the graph
  // like --links so the search set is the real one (#526 acceptance).
  const refsArg = arg('refs');
  if (refsArg) {
    let gs = lastNotification.get('clarion/graphStatus');
    while (!gs || gs.status !== 'built') gs = await waitNotification('clarion/graphStatus', 120000);
    const [l, c] = refsArg.split(':').map(Number);
    const position = { line: l - 1, character: (c || 1) - 1 };
    for (const pass of ['cold', 'warm']) {
      const r0 = Date.now();
      const refs = await request('textDocument/references', { textDocument: { uri }, position, context: { includeDeclaration: true } }, 600000);
      const ms = Date.now() - r0;
      const byFile = new Map();
      for (const r of refs ?? []) { const f = decodeURIComponent(r.uri).split('/').pop(); byFile.set(f, (byFile.get(f) ?? 0) + 1); }
      console.log(`
== references at ${refsArg} (${pass}): ${(refs ?? []).length} hit(s) in ${byFile.size} file(s), ${ms}ms ==`);
      if (pass === 'warm') for (const [f, n] of [...byFile.entries()].sort()) console.log(`  ${f}: ${n}`);
    }
    try { await request('shutdown', null, 10000); notify('exit'); } catch { }
    setTimeout(() => { child.kill(); process.exit(0); }, 1000);
    return;
  }

  // --links: print the document links the server offers for TARGET and stop.
  // Used to test the #470 hypothesis (a class .clw compiled via LINK() and not listed
  // in the .cwproj gets no links because it is never a graph seed).
  if (process.argv.includes('--links')) {
    // Links come from the file graph, which builds on a delay after solutionReady — wait for 'built'.
    let gs = lastNotification.get('clarion/graphStatus');
    while (!gs || gs.status !== 'built') gs = await waitNotification('clarion/graphStatus', 120000);
    console.log(`graphStatus: ${JSON.stringify(gs)}`);
    const links = await request('textDocument/documentLink', { textDocument: { uri } }, 60000);
    console.log(`
== document links for ${path.basename(TARGET)}: ${(links ?? []).length} ==`);
    for (const l of links ?? []) {
      console.log(`  line ${l.range.start.line + 1} col ${l.range.start.character + 1}-${l.range.end.character + 1} -> ${l.target}`);
    }
    try { await request('shutdown', null, 10000); notify('exit'); } catch { }
    setTimeout(() => { child.kill(); process.exit(0); }, 1000);
    return;
  }

  if (PULL) {
    const pushes = diagEvents.filter(e => e.kind === 'publish').length;
    console.log(`
== #545 pull diagnostics on ${path.basename(TARGET)} ==`);
    console.log(`  pushes received while pull is declared: ${pushes} (expect 0)`);
    console.log(`  refresh requests so far: ${refreshRequests}`);
    const p1 = Date.now();
    const r1 = await request('textDocument/diagnostic', { textDocument: { uri } }, 120000);
    console.log(`  pull 1: kind=${r1.kind} items=${(r1.items || []).length} resultId=${r1.resultId} in ${Date.now() - p1}ms`);
    const p2 = Date.now();
    const r2 = await request('textDocument/diagnostic', { textDocument: { uri }, previousResultId: r1.resultId }, 120000);
    console.log(`  pull 2 (same resultId): kind=${r2.kind} in ${Date.now() - p2}ms (expect unchanged)`);
    const r3 = await request('textDocument/diagnostic', { textDocument: { uri }, previousResultId: 'stale' }, 120000);
    console.log(`  pull 3 (stale resultId): kind=${r3.kind} items=${(r3.items || []).length} (expect full)`);
  }

  if (TOGGLE_UNRESOLVED) {
    const count = () => (lastDiagnostics[uri] || []).filter(x => x.code === 'unresolved-procedure-call').length;
    const untilComplete = async () => {
      let st;
      do { st = await waitNotification('clarion/diagnosticsStatus', 120000); } while (st.uri !== uri || st.state !== 'complete');
    };
    console.log(`\n== #541 live toggle: #517 count before enabling: ${count()} ==`);
    for (const enabled of [true, false]) {
      const t1 = Date.now();
      const done = untilComplete();
      notify('clarion/updateDiagnosticSettings', { unresolvedProcedureCallsEnabled: enabled });
      await done;
      console.log(`   unresolvedProcedureCallsEnabled=${enabled}: re-validation complete in ${Date.now() - t1}ms, #517 count now ${count()}`);
    }
  }

  if (UNRESOLVED_PROC) {
    const d = (lastDiagnostics[uri] || []).filter(x => x.code === 'unresolved-procedure-call');
    console.log(`\n== #517 unresolved-procedure-call on ${path.basename(TARGET)}: ${d.length} ==`);
    for (const x of d.slice(0, 40)) console.log(`  L${x.range.start.line + 1}: ${x.message}`);
    if (d.length > 40) console.log(`  … and ${d.length - 40} more`);
  }

  // #509 — --callhier=LINE:COL (1-based): prepareCallHierarchy at that position, then
  // incoming and outgoing calls for the item, timed; prints the callers/callees.
  const chArg = arg('callhier');
  if (chArg) {
    const [l, c] = chArg.split(':').map(Number);
    const position = { line: l - 1, character: (c || 1) - 1 };
    const t1 = Date.now();
    const items = await request('textDocument/prepareCallHierarchy', { textDocument: { uri }, position }, 120000).catch(e => ({ error: e.message }));
    console.log(`\n== call hierarchy at ${chArg}: prepare ${Date.now() - t1}ms ==`);
    const item = Array.isArray(items) ? items[0] : null;
    if (!item) { console.log(`  (no item${items && items.error ? ': ' + items.error : ''})`); }
    else {
      console.log(`  item: ${item.name} [${item.detail}] ${path.basename(decodeURIComponent(item.uri))}:${item.range.start.line + 1}-${item.range.end.line + 1}`);
      for (const dir of ['incoming', 'outgoing']) {
        const t2 = Date.now();
        const calls = await request(`callHierarchy/${dir}Calls`, { item }, 600000).catch(e => ({ error: e.message }));
        const list = Array.isArray(calls) ? calls : [];
        console.log(`  ${dir}: ${list.length} in ${Date.now() - t2}ms${calls && calls.error ? ' error: ' + calls.error : ''}`);
        for (const call of list.slice(0, 15)) {
          const other = call.from || call.to;
          console.log(`    ${other.name} [${other.detail}] ${path.basename(decodeURIComponent(other.uri))}:${other.range.start.line + 1} (${call.fromRanges.length} site(s))`);
        }
        if (list.length > 15) console.log(`    … and ${list.length - 15} more`);
      }
    }
  }

  // #553 — --prepare-rename=LINE:COL (1-based): time textDocument/prepareRename, the
  // pre-flight before the rename box appears. Must not run Find All References.
  const prArg = arg('prepare-rename');
  if (prArg) {
    const [l, c] = prArg.split(':').map(Number);
    const position = { line: l - 1, character: (c || 1) - 1 };
    const t1 = Date.now();
    const res = await request('textDocument/prepareRename', { textDocument: { uri }, position }, 120000).catch(e => ({ error: e.message }));
    console.log(`\n== prepareRename at ${prArg}: ${Date.now() - t1}ms ==`);
    console.log(res && res.error ? `  refused: ${res.error}` : `  range: ${JSON.stringify(res)}`);
  }

  // --diags: after the settle window, print every diagnostic the server published for
  // TARGET, grouped by message (count, first line, source line) — the false-positive
  // triage view, with the real solution loaded.
  if (process.argv.includes('--diags')) {
    const all = lastDiagnostics[uri] || [];
    const groups = new Map();
    for (const d of all) {
      const key = `${d.code ?? ''}|${d.message.replace(/'[^']*'/g, "'…'")}`;
      const g = groups.get(key) ?? { n: 0, first: d, msg: d.message };
      g.n++; groups.set(key, g);
    }
    const srcLines = text.split(/\r?\n/);
    console.log(`\n== diagnostics for ${path.basename(TARGET)}: ${all.length} in ${groups.size} group(s) ==`);
    for (const g of [...groups.values()].sort((a, b) => b.n - a.n)) {
      const d = g.first;
      console.log(`  ${String(g.n).padStart(4)}× [${d.code ?? d.source ?? '?'}] ${g.msg.slice(0, 120)}`);
      console.log(`        first at L${d.range.start.line + 1}:${d.range.start.character + 1}  ${(srcLines[d.range.start.line] ?? '').trim().slice(0, 100)}`);
    }
  }

  const defArg = arg('define'); // LINE:COL, 0-indexed
  if (defArg) {
    const [dl, dc] = defArg.split(':').map(Number);
    const res = await request('textDocument/definition', { textDocument: { uri }, position: { line: dl, character: dc } }, 60000).catch(e => ({ error: e.message }));
    console.log(`\n== definition at ${dl + 1}:${dc} ==`);
    const arr = Array.isArray(res) ? res : (res ? [res] : []);
    if (!arr.length || res.error) console.log(`  (no definition${res && res.error ? ': ' + res.error : ''})`);
    for (const loc of arr) {
      const u = loc.uri || loc.targetUri;
      const rg = loc.range || loc.targetRange;
      console.log(`  -> ${u ? path.basename(decodeURIComponent(u)) : '?'}:${rg ? rg.start.line + 1 : '?'}`);
    }
  }

  console.log(`\n== hover timings (cold then warm per word) ==`);
  const results = [];
  for (const pos of positions) {
    for (const pass of ['cold', 'warm']) {
      const h0 = Date.now();
      let ok = true, size = 0;
      try {
        const res = await request('textDocument/hover', {
          textDocument: { uri }, position: { line: pos.line, character: pos.character },
        }, 240000);
        size = res && res.contents ? JSON.stringify(res.contents).length : 0;
      } catch { ok = false; }
      const ms = Date.now() - h0;
      results.push(ms);
      console.log(`  hover ${pos.word.padEnd(14)} ${pass.padEnd(4)} ${String(ms).padStart(7)}ms  ${ok ? (size ? 'content' : 'null') : 'ERROR'}`);
    }
  }

  console.log(`\n== summary ==`);
  console.log(`worst hover: ${Math.max(...results, 0)}ms`);
  console.log(`server perf log: ${STDERR_LOG}`);

  try { await request('shutdown', null, 10000); notify('exit'); } catch { }
  setTimeout(() => { child.kill(); process.exit(0); }, 1500);
})().catch(e => { console.error('DRIVER FAILED:', e.message); child.kill(); process.exit(1); });
