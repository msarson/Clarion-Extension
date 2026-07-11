/**
 * #317 — TrailingCoalescer contract tests.
 *
 * The projectConstantsChanged notification arrives once per project (40x on
 * Mark's solution) and each one re-validated every open document and reset
 * the file-relationship graph. The coalescer collapses a burst into ONE run
 * after a quiet period; triggers arriving WHILE the run executes schedule
 * exactly one follow-up run (the run may have read state the late trigger
 * invalidated), and triggers separated by more than the delay run separately.
 */

import * as assert from 'assert';
import { TrailingCoalescer } from '../utils/TrailingCoalescer';

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

suite('TrailingCoalescer (#317)', () => {

    test('a burst of triggers produces exactly one run', async () => {
        let runs = 0;
        const c = new TrailingCoalescer(20, () => { runs++; });

        for (let i = 0; i < 40; i++) c.trigger();
        await sleep(60);

        assert.strictEqual(runs, 1, `40-trigger burst must coalesce to one run, got ${runs}`);
    });

    test('each trigger restarts the quiet period (trailing edge)', async () => {
        let runs = 0;
        const c = new TrailingCoalescer(30, () => { runs++; });

        c.trigger();
        await sleep(15);
        c.trigger();            // inside the quiet period — restarts it
        await sleep(15);
        assert.strictEqual(runs, 0, 'must not run until a full quiet period elapses');
        await sleep(40);
        assert.strictEqual(runs, 1, 'runs once after the last trigger goes quiet');
    });

    test('a trigger during an in-flight run schedules exactly one follow-up run', async () => {
        let runs = 0;
        let releaseRun: (() => void) | null = null;
        const c = new TrailingCoalescer(10, async () => {
            runs++;
            if (runs === 1) {
                await new Promise<void>(r => { releaseRun = r; });
            }
        });

        c.trigger();
        await sleep(20);        // first run is now in flight, blocked
        assert.strictEqual(runs, 1);

        c.trigger();            // arrives mid-run — must not be lost, must not run concurrently
        c.trigger();
        await sleep(20);
        assert.strictEqual(runs, 1, 'no concurrent run while one is in flight');

        releaseRun!();
        await sleep(40);
        assert.strictEqual(runs, 2, 'mid-run triggers coalesce into exactly one follow-up');
    });

    test('triggers separated by more than the delay run separately', async () => {
        let runs = 0;
        const c = new TrailingCoalescer(10, () => { runs++; });

        c.trigger();
        await sleep(40);
        c.trigger();
        await sleep(40);

        assert.strictEqual(runs, 2);
    });

    test('a rejecting run does not wedge the coalescer', async () => {
        let runs = 0;
        const c = new TrailingCoalescer(10, async () => {
            runs++;
            if (runs === 1) throw new Error('boom');
        });

        c.trigger();
        await sleep(30);
        c.trigger();
        await sleep(30);

        assert.strictEqual(runs, 2, 'run after a rejected run must still fire');
    });
});
