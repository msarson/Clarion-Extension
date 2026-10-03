import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { LspProcess, toUri } from './support/lspProcess';

/**
 * #715 step 2 — the re-validation after an edit now yields to requests while it runs, so a hover
 * no longer waits for the whole pass. A client (Clarion Assistant) uses clarion/diagnosticsStatus
 * to tell whether the published diagnostics are those of the version it sent, so yielding must not
 * change what it sees:
 *   - a version is `complete` once, after its final publish, and nothing is published for it after;
 *   - nothing computed for an older version is published after any status for a newer version;
 *   - a version gets at most one final status (complete or superseded);
 *   - the re-validation still finishes while hovers keep arriving.
 * Runs the compiled server over stdio on a synthetic one-giant-procedure module.
 */
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { writeSyntheticSolution } = require(path.join(__dirname, '..', '..', '..', '..', 'scripts', 'perf', 'synthetic-module.js'));

interface Event { kind: 'publish' | 'status'; version: number; state?: string; at: number }

suite('#715 diagnostics status ordering while the re-validation yields to hovers', function () {
    this.timeout(180000);
    let server: LspProcess;
    let dir: string;
    let uri: string;
    let lines: string[];
    let version = 1;

    suiteSetup(async () => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'diagorder715-'));
        const sol = writeSyntheticSolution(dir, 30000, { shape: 'giant' });
        const text = fs.readFileSync(sol.module, 'utf8');
        lines = text.split(/\r?\n/);
        uri = toUri(sol.module);
        const clarion = process.env.CLARION_ROOT || path.join(dir, 'no-clarion');
        server = new LspProcess();
        await server.request('initialize', {
            processId: process.pid, rootUri: toUri(dir), workspaceFolders: [{ uri: toUri(dir), name: 'order' }],
            capabilities: { textDocument: { hover: { contentFormat: ['markdown'] } }, workspace: { configuration: true } },
        });
        server.notify('initialized', {});
        const ready = server.waitFor('clarion/solutionReady');
        server.notify('clarion/updatePaths', {
            solutionFilePath: sol.sln, redirectionFile: 'Clarion120.red', clarionVersion: 'Clarion 12', configuration: 'Debug',
            macros: { root: clarion, reddir: path.join(clarion, 'bin') }, redirectionPaths: [path.join(clarion, 'bin')],
            libsrcPaths: [], projectPaths: [dir], defaultLookupExtensions: ['.clw', '.inc', '.equ', '.int'],
        });
        await ready;
        server.notify('textDocument/didOpen', { textDocument: { uri, languageId: 'clarion', version: 1, text } });
        await server.waitFor('clarion/diagnosticsStatus', p => p.uri === uri && p.version === 1 && p.state === 'complete', 120000);
    });

    suiteTeardown(async () => {
        await server?.stop();
        fs.rmSync(dir, { recursive: true, force: true });
    });

    // A comment typed at the end of a code line in the giant procedure (a ranged change).
    const edit = (line: number) => {
        version++;
        const at = { line, character: lines[line].length };
        const add = ` !e${version}`;
        lines[line] += add;
        server.notify('textDocument/didChange', { textDocument: { uri, version }, contentChanges: [{ range: { start: at, end: at }, text: add }] });
        return version;
    };
    const codeLine = (k: number) => lines.findIndex((l, i) => i > 2000 + k * 900 && /^\s+Rpt:Name = /.test(l));
    const hoverLine = (k: number) => codeLine(k) + 1;
    const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
    /** Hovers back to back until `until` settles; returns how many were answered. */
    const hoverFlood = async (k: number, until: Promise<unknown>) => {
        let done = false, count = 0;
        until.then(() => { done = true; }, () => { done = true; });
        while (!done) {
            await server.request('textDocument/hover', { textDocument: { uri }, position: { line: hoverLine(k), character: 4 } });
            count++;
        }
        return count;
    };
    const events = (): Event[] => server.notifications
        .filter(n => n.params?.uri === uri && (n.method === 'textDocument/publishDiagnostics' || n.method === 'clarion/diagnosticsStatus'))
        .map(n => n.method === 'clarion/diagnosticsStatus'
            ? { kind: 'status' as const, version: n.params.version, state: n.params.state, at: n.at }
            : { kind: 'publish' as const, version: n.params.version, at: n.at });

    test('a version superseded mid-pass, then one validated under a stream of hovers', async () => {
        // v_a: let the re-validation start (500 ms after the last change), then change again mid-pass.
        const a = edit(codeLine(0));
        await sleep(560);
        const b = edit(codeLine(1));
        const bComplete = server.waitFor('clarion/diagnosticsStatus', p => p.uri === uri && p.version === b && p.state === 'complete', 60000);
        const hoversB = await hoverFlood(1, bComplete);
        await bComplete;
        // v_c: hovers from the moment of the change; its re-validation must still finish.
        const c = edit(codeLine(2));
        const cComplete = server.waitFor('clarion/diagnosticsStatus', p => p.uri === uri && p.version === c && p.state === 'complete', 60000);
        const hoversC = await hoverFlood(2, cComplete);
        await cComplete;
        assert.ok(hoversB > 0 && hoversC > 0, 'hovers were answered while the re-validation ran');

        const log = events().filter(e => e.version >= a);
        const describe = () => log.map(e => e.kind === 'status' ? `${e.state}(v${e.version})` : `publish(v${e.version})`).join(' ');
        // At most one final status per version, and `complete` after the version's last publish.
        for (const v of [a, b, c]) {
            const finals = log.filter(e => e.kind === 'status' && e.version === v && (e.state === 'complete' || e.state === 'superseded'));
            assert.ok(finals.length <= 1, `v${v} got ${finals.length} final statuses: ${describe()}`);
            const completeAt = log.findIndex(e => e.kind === 'status' && e.version === v && e.state === 'complete');
            if (completeAt >= 0) {
                assert.ok(log.slice(0, completeAt).some(e => e.kind === 'publish' && e.version === v), `v${v} complete with no publish before it: ${describe()}`);
                assert.ok(!log.slice(completeAt + 1).some(e => e.kind === 'publish' && e.version === v), `v${v} published after complete: ${describe()}`);
            }
        }
        // Nothing for an older version after any status for a newer one.
        for (let i = 0; i < log.length; i++) {
            if (log[i].kind !== 'status') continue;
            const stale = log.slice(i + 1).find(e => e.kind === 'publish' && e.version < log[i].version);
            assert.ok(!stale, `publish(v${stale?.version}) after ${log[i].state}(v${log[i].version}): ${describe()}`);
        }
        // v_a's pass was running when v_b arrived (it starts 500 ms after the change and takes
        // longer than 60 ms), so its diagnostics never became final: superseded, not complete.
        assert.ok(log.some(e => e.kind === 'status' && e.version === a && e.state === 'superseded'), `v${a} should be superseded: ${describe()}`);
        assert.ok(!log.some(e => e.kind === 'status' && e.version === a && e.state === 'complete'), `v${a} completed after a newer version arrived: ${describe()}`);
        assert.ok(log.some(e => e.kind === 'status' && e.version === b && e.state === 'complete'), describe());
        assert.ok(log.some(e => e.kind === 'status' && e.version === c && e.state === 'complete'), describe());
    });
});
