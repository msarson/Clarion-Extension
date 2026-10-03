#!/usr/bin/env node
/**
 * #711 — hover latency on large modules, the way Clarion Assistant drives the server: stdio,
 * initialize, `clarion/updatePaths`, didOpen, then hovers timed in three scenarios:
 *   unchanged — hovers at evenly spaced identifiers, no edits;
 *   edited    — a full-text didChange (one appended comment line), then a hover at once;
 *   burst     — five full-text didChanges back to back (typing), then one hover.
 * On synthetic generated-style modules (scripts/perf/synthetic-module.js), no third-party source.
 *
 *   node scripts/perf/hover-bench.js [--sizes=10000,30000,60000] [--n=40] [--edits=15] [--bursts=8]
 *                                    [--server=<path to server.js>] [--clarion=<install root>] [--json=out.json]
 *                                    [--detail] [--cpu-prof=<dir>] [--node-flags="--no-turbo-inlining"] [--ranged] [--log=<file>]
 *
 * --detail prints each unchanged hover in order and by word kind (a slow kind vs a slow first hover).
 * --ranged sends each edit as a one-character ranged didChange (a space typed at the end of a line
 * in the middle of the module), as a client using TextDocumentSyncKind.Incremental does (#715).
 * --cpu-prof writes a V8 profile of the server; summarise it with scripts/perf/cpuprofile-summary.js.
 *
 * `npm run compile` first when --server is the default (this repo's out/).
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { writeSyntheticSolution } = require('./synthetic-module');

const REPO = path.resolve(__dirname, '..', '..');
const arg = (name, dflt) => { const a = process.argv.find(x => x.startsWith(`--${name}=`)); return a ? a.slice(name.length + 3) : dflt; };
const SERVER = path.resolve(arg('server', path.join(REPO, 'out', 'server', 'src', 'server.js')));
const SIZES = arg('sizes', '10000,30000,60000').split(',').map(Number);
const N = Number(arg('n', 40));
const EDITS = Number(arg('edits', 15));
const BURSTS = Number(arg('bursts', 8));
const CLARION = arg('clarion', process.env.CLARION_ROOT || 'C:\\Clarion\\Clarion12-12.0.14204');
const CPU_PROF = arg('cpu-prof', '');
const LOG = arg('log', ''); // #715: append the server's log messages here, with the performance channel on

const toUri = p => 'file:///' + p.replace(/\\/g, '/').replace(/^([A-Za-z]):/, (_, d) => d.toLowerCase() + '%3A');

/** A minimal LSP client over stdio (Content-Length framing). */
function startServer() {
    const execArgv = [...(CPU_PROF ? ['--cpu-prof', `--cpu-prof-dir=${CPU_PROF}`] : []), ...arg('node-flags', '').split(' ').filter(Boolean)];
    const child = spawn(process.execPath, [...execArgv, SERVER, '--stdio'], { stdio: ['pipe', 'pipe', 'pipe'] });
    child.stderr.on('data', () => { });
    let buf = Buffer.alloc(0);
    let seq = 0;
    const pending = new Map();
    const waiters = [];
    const send = msg => {
        const body = Buffer.from(JSON.stringify({ jsonrpc: '2.0', ...msg }), 'utf8');
        child.stdin.write(`Content-Length: ${body.length}\r\n\r\n`);
        child.stdin.write(body);
    };
    child.stdout.on('data', chunk => {
        buf = Buffer.concat([buf, chunk]);
        for (;;) {
            const head = buf.indexOf('\r\n\r\n');
            if (head < 0) return;
            const len = Number(/Content-Length: (\d+)/i.exec(buf.slice(0, head).toString())?.[1]);
            if (buf.length < head + 4 + len) return;
            const msg = JSON.parse(buf.slice(head + 4, head + 4 + len).toString('utf8'));
            buf = buf.slice(head + 4 + len);
            if (msg.id !== undefined && msg.method === undefined) {
                const p = pending.get(msg.id); pending.delete(msg.id); p?.(msg);
            } else if (msg.id !== undefined) {
                // server -> client request: configuration gets defaults, everything else null
                send({ id: msg.id, result: msg.method === 'workspace/configuration' ? (msg.params.items || []).map(() => null) : null });
            } else {
                if (LOG && msg.method === 'window/logMessage') fs.appendFileSync(LOG, msg.params.message + '\n');
                for (let i = waiters.length - 1; i >= 0; i--) if (waiters[i].method === msg.method && waiters[i].test(msg.params)) waiters.splice(i, 1)[0].resolve(msg.params);
            }
        }
    });
    const request = (method, params) => new Promise(resolve => { const id = ++seq; pending.set(id, resolve); send({ id, method, params }); });
    const notify = (method, params) => send({ method, params });
    const waitFor = (method, test = () => true, timeoutMs = 600000) => new Promise((resolve, reject) => {
        const t = setTimeout(() => reject(new Error(`timeout waiting for ${method}`)), timeoutMs);
        waiters.push({ method, test, resolve: v => { clearTimeout(t); resolve(v); } });
    });
    return { child, request, notify, waitFor };
}

/** Evenly spaced identifier positions inside CODE sections. */
function positions(text, n) {
    const lines = text.split(/\r?\n/);
    const cands = [];
    let inCode = false;
    lines.forEach((l, i) => {
        if (/^\S+\s+PROCEDURE\b/.test(l)) inCode = false;
        if (/^\s+CODE\b/.test(l)) { inCode = true; return; }
        if (!inCode) return;
        const m = /\b(Loc:\w+|PQ\d+:\w+|PG\d+:\w+|Proc\d+)\b/.exec(l);
        if (m) cands.push({ line: i, character: m.index + Math.floor(m[0].length / 2), kind: m[1].replace(/\d+/g, '').replace(/:\w+$/, ':') });
    });
    const out = [];
    for (let k = 0; k < n; k++) out.push(cands[Math.floor((k + 0.5) * cands.length / n)]);
    return out;
}

const pct = (xs, p) => { const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
const stats = xs => xs.length === 0
    ? { n: 0, p50: '-', p95: '-', max: '-' } // a scenario turned off (--edits=0 / --bursts=0)
    : { n: xs.length, p50: Math.round(pct(xs, 0.5)), p95: Math.round(pct(xs, 0.95)), max: Math.round(Math.max(...xs)) };

async function benchSize(size) {
    const dir = path.join(os.tmpdir(), `clarion-synth-${size}`);
    fs.rmSync(dir, { recursive: true, force: true });
    const sol = writeSyntheticSolution(dir, size);
    const text = fs.readFileSync(sol.module, 'utf8');
    const uri = toUri(sol.module);
    const s = startServer();
    const t0 = Date.now();
    await s.request('initialize', {
        processId: process.pid, rootUri: toUri(dir), workspaceFolders: [{ uri: toUri(dir), name: 'synth' }],
        capabilities: { textDocument: { hover: { contentFormat: ['markdown', 'plaintext'] } }, workspace: { configuration: true } },
        ...(LOG ? { initializationOptions: { settings: { log: { performance: { enabled: true } } } } } : {}),
    });
    s.notify('initialized', {});
    const ready = s.waitFor('clarion/solutionReady');
    s.notify('clarion/updatePaths', {
        solutionFilePath: sol.sln, redirectionFile: 'Clarion120.red', clarionVersion: 'Clarion 12', configuration: 'Debug',
        macros: { root: CLARION, reddir: path.join(CLARION, 'bin') }, redirectionPaths: [path.join(CLARION, 'bin')],
        libsrcPaths: [path.join(CLARION, 'libsrc', 'win'), path.join(CLARION, 'accessory', 'libsrc', 'win')],
        projectPaths: [dir], defaultLookupExtensions: ['.clw', '.inc', '.equ', '.int'],
    });
    await ready;
    s.notify('textDocument/didOpen', { textDocument: { uri, languageId: 'clarion', version: 1, text } });
    // Let the startup background work settle, as a user would before hovering.
    await s.waitFor('clarion/graphStatus', p => p && p.status === 'built', 120000).catch(() => { });
    await new Promise(r => setTimeout(r, 3000));
    const settleMs = Date.now() - t0;

    const pos = positions(text, N);
    const hover = async p => { const a = performance.now(); await s.request('textDocument/hover', { textDocument: { uri }, position: { line: p.line, character: p.character } }); return performance.now() - a; };

    const unchanged = [];
    for (const p of pos) unchanged.push(await hover(p));
    if (process.argv.includes('--detail')) {
        // Each unchanged hover in order, by word kind — tells a slow kind from slow first hovers.
        const byKind = {};
        pos.forEach((p, k) => (byKind[p.kind] = byKind[p.kind] || []).push(unchanged[k]));
        console.log('  unchanged in order:', unchanged.map(x => Math.round(x)).join(' '));
        for (const [kind, xs] of Object.entries(byKind)) console.log(`  ${kind.padEnd(6)} n=${xs.length} ${JSON.stringify(stats(xs))}`);
    }

    let version = 1;
    const RANGED = process.argv.includes('--ranged');
    const lineText = text.split(/\r?\n/);
    const change = () => {
        version++;
        if (!RANGED) { s.notify('textDocument/didChange', { textDocument: { uri, version }, contentChanges: [{ text: `${text}! edit ${version}\r\n` }] }); return; }
        // #715 — one character typed at the end of a line, a different line each time.
        const line = pos[(version * 5 + 3) % pos.length].line;
        const at = { line, character: lineText[line].length };
        lineText[line] += ' ';
        s.notify('textDocument/didChange', { textDocument: { uri, version }, contentChanges: [{ range: { start: at, end: at }, text: ' ' }] });
    };

    const edited = [];
    for (let k = 0; k < EDITS; k++) { change(); edited.push(await hover(pos[(k * 7) % pos.length])); }
    if (process.argv.includes('--detail')) console.log('  edited in order:', edited.map(x => Math.round(x)).join(' '));

    const burst = [];
    for (let k = 0; k < BURSTS; k++) { for (let j = 0; j < 5; j++) change(); burst.push(await hover(pos[(k * 11) % pos.length])); }

    await Promise.race([s.request('shutdown', null), new Promise(r => setTimeout(r, 15000))]);
    s.notify('exit');
    await new Promise(r => setTimeout(r, 1500));
    s.child.kill();
    return { size: sol.lines, procedures: sol.procedures, settleMs, unchanged: stats(unchanged), edited: stats(edited), burst: stats(burst) };
}

(async () => {
    console.log(`server: ${SERVER}`);
    const results = [];
    for (const size of SIZES) {
        const r = await benchSize(size);
        results.push(r);
        console.log(`${String(r.size).padStart(6)} lines | unchanged p50 ${r.unchanged.p50} p95 ${r.unchanged.p95} max ${r.unchanged.max}` +
            ` | edited p50 ${r.edited.p50} p95 ${r.edited.p95} max ${r.edited.max}` +
            ` | burst p50 ${r.burst.p50} p95 ${r.burst.p95} max ${r.burst.max}  (ms)`);
    }
    const json = arg('json', '');
    if (json) fs.writeFileSync(json, JSON.stringify({ server: SERVER, when: new Date().toISOString(), results }, null, 2));
})().catch(e => { console.error(e); process.exit(1); });
