import * as assert from 'assert';
import { StartupProgress, ProgressReporterLike, adaptLibraryReporter } from '../utils/StartupProgress';

/**
 * #544 — the index build, graph build and re-validation pass report through the
 * protocol's window/workDoneProgress so any client shows them (VS Code: status bar).
 *
 * The wrapper here is what the server calls. It must be a no-op when the client did
 * not declare `window.workDoneProgress`, must never send `report` before `begin` or
 * after `done`, and must survive a reporter factory that fails (progress is
 * decoration — it can never break startup).
 */
suite('StartupProgress (#544)', () => {

    interface Call { kind: 'begin' | 'report' | 'done'; args: unknown[] }
    const fake = () => {
        const calls: Call[] = [];
        const reporter: ProgressReporterLike = {
            begin: (...args: unknown[]) => { calls.push({ kind: 'begin', args }); },
            report: (...args: unknown[]) => { calls.push({ kind: 'report', args }); },
            done: () => { calls.push({ kind: 'done', args: [] }); },
        };
        return { calls, reporter };
    };

    teardown(() => StartupProgress.configure(false, async () => { throw new Error('unconfigured'); }));

    test('unsupported client: every call is a silent no-op and the factory is never asked', async () => {
        let created = 0;
        StartupProgress.configure(false, async () => { created++; return fake().reporter; });
        const phase = await StartupProgress.begin('Indexing');
        phase.report('half', 50);
        phase.done();
        assert.strictEqual(created, 0);
    });

    test('supported client: begin → report → done reach the reporter in order with the title', async () => {
        const f = fake();
        StartupProgress.configure(true, async () => f.reporter);
        const phase = await StartupProgress.begin('Building declaration index', 'starting');
        phase.report('12 of 40 projects', 30);
        phase.done();
        assert.deepStrictEqual(f.calls.map(c => c.kind), ['begin', 'report', 'done']);
        assert.strictEqual(f.calls[0].args[0], 'Building declaration index');
        assert.strictEqual(f.calls[0].args[2], 'starting');
        assert.deepStrictEqual(f.calls[1].args, ['12 of 40 projects', 30]);
    });

    test('report after done is dropped, and done is idempotent', async () => {
        const f = fake();
        StartupProgress.configure(true, async () => f.reporter);
        const phase = await StartupProgress.begin('Graph');
        phase.done();
        phase.report('late', 99);
        phase.done();
        assert.deepStrictEqual(f.calls.map(c => c.kind), ['begin', 'done']);
    });

    test('a percentage is clamped to 0–100 and rounded', async () => {
        const f = fake();
        StartupProgress.configure(true, async () => f.reporter);
        const phase = await StartupProgress.begin('Graph');
        phase.report('a', 150.4);
        phase.report('b', -3);
        phase.report('c', 33.6);
        assert.deepStrictEqual(f.calls.slice(1).map(c => c.args[1]), [100, 0, 34]);
    });

    test('a failing reporter factory degrades to a no-op phase instead of throwing', async () => {
        StartupProgress.configure(true, async () => { throw new Error('client went away'); });
        const phase = await StartupProgress.begin('Graph');
        assert.doesNotThrow(() => { phase.report('x', 1); phase.done(); });
    });

    test('the library adapter puts the percentage first, as vscode-languageserver expects', () => {
        const calls: unknown[][] = [];
        const lib = {
            begin: (...a: unknown[]) => { calls.push(['begin', ...a]); },
            report: (...a: unknown[]) => { calls.push(['report', ...a]); },
            done: () => { calls.push(['done']); },
        };
        const r = adaptLibraryReporter(lib as never);
        r.begin('T', 0, 'm');
        r.report('half', 50);
        r.report('no pct');
        r.done();
        assert.deepStrictEqual(calls, [['begin', 'T', 0, 'm', undefined], ['report', 50, 'half'], ['report', 'no pct'], ['done']]);
    });

    test('a step helper reports "n of total" with the matching percentage', async () => {
        const f = fake();
        StartupProgress.configure(true, async () => f.reporter);
        const phase = await StartupProgress.begin('Re-validating open files');
        phase.step(1, 4, 'a.clw');
        phase.step(4, 4, 'd.clw');
        assert.deepStrictEqual(f.calls.slice(1).map(c => c.args), [['1 of 4: a.clw', 25], ['4 of 4: d.clw', 100]]);
    });
});
