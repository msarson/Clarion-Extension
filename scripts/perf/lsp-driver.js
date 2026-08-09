// Headless LSP perf driver — drives the Clarion language server over Node IPC
// against the real DirectSystems test solution, mirroring the VS Code client's
// startup sequence (initialize → initialized → clarion/updatePaths →
// solutionReady → didOpen → timed requests). Server perf channels are enabled,
// so every *.Perf line (HoverProvider.Perf, StartupPerf, EventLoop lag, …)
// lands in the stderr log for analysis.
//
// First used to close #361 (hover freeze) with cold/warm evidence; reuse it for
// any measure-the-logs perf issue instead of the build-VSIX→VM-retest loop.
//
// Test substrate (copied real solution + matching Clarion install):
//   F:\DirectSystems\AppDev\ap1.sln   — 40 projects / 3,016 sources (the VM perf solution)
//   F:\DirectSystems\Clarion10        — Clarion 10.0.12567; registered as the
//                                       "DirectSystems" version in ClarionProperties.xml
//
// Usage (run `npm run compile` first — drives out/server/src/server.js):
//   node scripts/perf/lsp-driver.js                 # warm run against ap1.sln
//   node scripts/perf/lsp-driver.js --cold          # wipe %TEMP% clarion-extension-* caches first
//   node scripts/perf/lsp-driver.js --sln=F:\DirectSystems\AppDev\IBS.sln
//   node scripts/perf/lsp-driver.js --file=F:\...\SomeOther.clw
'use strict';
const { fork } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

// --- config -----------------------------------------------------------------
const REPO = path.resolve(__dirname, '..', '..');
const SERVER = path.join(REPO, 'out', 'server', 'src', 'server.js');
const APPDEV = 'F:\\DirectSystems\\AppDev';
const CLARION_ROOT = 'F:\\DirectSystems\\Clarion10';
const arg = (name) => { const a = process.argv.find(x => x.startsWith(`--${name}=`)); return a ? a.slice(name.length + 3) : undefined; };
const SLN = arg('sln') ?? path.join(APPDEV, 'ap1.sln');
const TARGET = arg('file') ?? path.join(APPDEV, 'genfiles', 'src', 'IBSCommon.clw');
const COLD = process.argv.includes('--cold');
const STDERR_LOG = path.join(os.tmpdir(), 'clarion-lsp-driver-stderr.log');

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
    child.send({ jsonrpc: '2.0', id: msg.id, result });
  } else if (msg.method) {
    for (let i = notificationWaiters.length - 1; i >= 0; i--) {
      const w = notificationWaiters[i];
      if (w.method === msg.method) { notificationWaiters.splice(i, 1); w.resolve(msg.params); }
    }
    if (!/logMessage|telemetry|progress/.test(msg.method)) {
      console.log(`  [notify] ${msg.method}${msg.params && msg.params.status ? ' ' + msg.params.status : ''}`);
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

// --- main --------------------------------------------------------------------
(async () => {
  const t0 = Date.now();
  console.log(`== Clarion LSP headless perf driver ==`);
  console.log(`server:   ${SERVER}`);
  console.log(`solution: ${SLN}${COLD ? '  (COLD)' : ''}`);

  await request('initialize', {
    processId: process.pid,
    rootUri: toUri(APPDEV),
    workspaceFolders: [{ uri: toUri(APPDEV), name: 'AppDev' }],
    capabilities: { textDocument: { hover: { contentFormat: ['markdown', 'plaintext'] } }, workspace: { configuration: true } },
    // perf channels ON — the whole point of this driver
    initializationOptions: { settings: { log: { performance: { enabled: true } } } },
  });
  notify('initialized', {});
  console.log(`[${Date.now() - t0}ms] initialized`);

  // Mirrors the real client's payload — SolutionInitializer.ts (clarion/updatePaths sender)
  notify('clarion/updatePaths', {
    redirectionPaths: [path.join(CLARION_ROOT, 'bin')],
    projectPaths: [path.dirname(SLN)],
    solutionFilePath: SLN,
    configuration: 'Debug',
    clarionVersion: 'DirectSystems',
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
