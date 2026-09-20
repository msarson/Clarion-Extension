/**
 * A language-server session against a real solution, for the health sweeps.
 *
 * Forks the built server over Node IPC (the real client's transport) and replays the client's
 * startup: initialize -> didOpen -> clarion/updatePaths -> solutionReady -> settle. The ordering
 * is load-bearing: updatePaths must arrive with a file already open (the perf driver's
 * deferred-exit contract), and solutionReady is not yet the point at which cross-file answers
 * are complete - the relationship graph builds afterwards, so start() waits for
 * clarion/graphStatus 'built' and then a floor (>= 15s, the settle rule from the perf lane).
 *
 * Paths default to the locally configured corpus (see CLAUDE.local.md). Run `npm run compile` first.
 */

const { fork } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const REPO = path.resolve(__dirname, '..', '..');
const SERVER = path.join(REPO, 'out', 'server', 'src', 'server.js');
const corpus = require('../corpus-config');
const CLARION_ROOT = corpus.required('clarionRoot');

const toUri = p => 'file:///' + p.replace(/\\/g, '/').replace(/^\//, '').replace(':', '%3A');

/**
 * @param {{ sln?: string, seedFile: string, settleMs?: number, stderrLog?: string, log?: (s: string) => void }} opts
 */
async function startSession(opts) {
    if (!fs.existsSync(SERVER)) throw new Error(`Server build missing: ${SERVER} - run \`npm run compile\` first.`);
    const sln = opts.sln ?? corpus.required('solution');
    const log = opts.log ?? (() => {});
    const t0 = Date.now();

    let seq = 0;
    const pending = new Map();
    const waiters = [];
    const child = fork(SERVER, ['--node-ipc'], { stdio: ['ignore', 'pipe', 'pipe', 'ipc'], execArgv: [] });
    const errLog = fs.createWriteStream(opts.stderrLog ?? path.join(os.tmpdir(), 'clarion-health-stderr.log'));
    child.stderr.on('data', d => errLog.write(d));
    child.stdout.on('data', d => errLog.write(d));

    child.on('message', msg => {
        if (msg.id !== undefined && (msg.result !== undefined || msg.error !== undefined)) {
            const p = pending.get(msg.id);
            if (p) { pending.delete(msg.id); msg.error ? p.reject(new Error(JSON.stringify(msg.error))) : p.resolve(msg.result); }
        } else if (msg.method && msg.id !== undefined) {
            // server -> client requests: answer configuration with defaults, everything else with null
            child.send({ jsonrpc: '2.0', id: msg.id, result: msg.method === 'workspace/configuration' ? (msg.params.items || []).map(() => null) : null });
        } else if (msg.method) {
            for (let i = waiters.length - 1; i >= 0; i--) {
                if (waiters[i].method === msg.method) { const w = waiters.splice(i, 1)[0]; w.resolve(msg.params); }
            }
        }
    });

    const request = (method, params, timeoutMs = 120000) => {
        const id = ++seq;
        return new Promise((resolve, reject) => {
            const t = setTimeout(() => { pending.delete(id); reject(new Error(`timeout ${method}`)); }, timeoutMs);
            pending.set(id, { resolve: v => { clearTimeout(t); resolve(v); }, reject: e => { clearTimeout(t); reject(e); } });
            child.send({ jsonrpc: '2.0', id, method, params });
        });
    };
    const notify = (method, params) => child.send({ jsonrpc: '2.0', method, params });
    const waitNotification = (method, timeoutMs) => new Promise((resolve, reject) => {
        const t = setTimeout(() => reject(new Error(`timeout waiting for ${method}`)), timeoutMs);
        waiters.push({ method, resolve: v => { clearTimeout(t); resolve(v); } });
    });

    const opened = new Set();
    const open = file => {
        const uri = toUri(file);
        if (!opened.has(uri)) {
            notify('textDocument/didOpen', { textDocument: { uri, languageId: 'clarion', version: 1, text: fs.readFileSync(file, 'utf8') } });
            opened.add(uri);
        }
        return uri;
    };

    await request('initialize', {
        processId: process.pid,
        rootUri: toUri(path.dirname(sln)),
        workspaceFolders: [{ uri: toUri(path.dirname(sln)), name: path.basename(path.dirname(sln)) }],
        capabilities: { textDocument: {}, workspace: { configuration: true }, window: { workDoneProgress: true } },
        initializationOptions: { settings: { log: { performance: { enabled: false } } } },
    });
    notify('initialized', {});
    open(opts.seedFile);
    notify('clarion/updatePaths', {
        redirectionPaths: [path.join(CLARION_ROOT, 'bin')],
        projectPaths: [path.dirname(sln)],
        solutionFilePath: sln,
        configuration: 'Debug',
        clarionVersion: corpus.required('clarionVersion'),
        redirectionFile: 'Clarion100.red',
        macros: { root: CLARION_ROOT, reddir: path.join(CLARION_ROOT, 'bin') },
        libsrcPaths: [path.join(CLARION_ROOT, 'libsrc', 'win'), path.join(CLARION_ROOT, 'Accessory', 'libsrc', 'win')],
        defaultLookupExtensions: ['.clw', '.inc', '.equ', '.int'],
    });
    await waitNotification('clarion/solutionReady', 600000);
    log(`[${Date.now() - t0}ms] solutionReady`);

    const settleMs = opts.settleMs ?? 20000;
    const g0 = Date.now();
    let built = false;
    try {
        while (Date.now() - g0 < settleMs) {
            const s = await waitNotification('clarion/graphStatus', settleMs - (Date.now() - g0));
            if (s && s.status === 'built') { built = true; break; }
        }
    } catch { /* no further graphStatus inside the window */ }
    const rest = settleMs - (Date.now() - g0);
    if (rest > 0) await new Promise(r => setTimeout(r, rest));
    log(`[${Date.now() - t0}ms] settled (graph ${built ? 'reported built' : 'did not report built'}, ${settleMs}ms floor)`);

    const close = async () => {
        try { await request('shutdown', null, 10000); notify('exit'); } catch { /* already gone */ }
        setTimeout(() => child.kill(), 1000);
    };

    return { request, notify, open, close, toUri, sln };
}

module.exports = { startSession, toUri, REPO, APPDEV, CLARION_ROOT };
