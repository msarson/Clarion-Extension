import * as assert from 'assert';
import {
    beginInteractive, runAsBackground, yieldForInteractive, BACKGROUND_STARVATION_CAP_MS, resetInteractivePriorityForTests,
} from '../utils/interactivePriority';

/**
 * #715 item 1 — background validation took turns with a hover every 25 ms, so a hover with many
 * async steps that landed during a re-check took ten times as long as on its own (a cold MAP-include
 * walk: 212 ms alone, 2.1 s during a re-check; a cold global lookup right after opening a module:
 * 162 ms alone, 3.3 s). Background work now waits at its yield points while a hover, completion or
 * F12 is in flight, but always gets a slice at least every ~250 ms.
 */
suite('#715 interactive requests run ahead of background validation', () => {
    setup(() => resetInteractivePriorityForTests());
    const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

    test('outside the background context a yield never waits, even with a request in flight', async () => {
        const done = beginInteractive();
        const t0 = Date.now();
        await yieldForInteractive();
        assert.ok(Date.now() - t0 < 50, 'interactive code is never held back by another request');
        done();
    });

    test('background work waits while a request is in flight and resumes when it finishes', async () => {
        await runAsBackground(async () => { await yieldForInteractive(); }); // a slice: the clock starts here
        const done = beginInteractive();
        let resumed = 0;
        const bg = runAsBackground(async () => { await yieldForInteractive(); resumed = Date.now(); });
        await sleep(60);
        assert.strictEqual(resumed, 0, 'background resumed while the request was in flight');
        const finishedAt = Date.now();
        done();
        await bg;
        assert.ok(resumed >= finishedAt && resumed - finishedAt < 50, `resumed ${resumed - finishedAt} ms after the request finished`);
    });

    test('the starvation cap: background still gets a slice every ~250 ms under a steady stream of requests', async () => {
        let inFlight = beginInteractive();
        let stop = false;
        // A completion-style stream: one request ends, the next begins at once.
        const stream = (async () => { while (!stop) { await sleep(10); const next = beginInteractive(); inFlight(); inFlight = next; } inFlight(); })();
        const slices: number[] = [];
        const t0 = Date.now();
        await runAsBackground(async () => { for (let k = 0; k < 4; k++) { await yieldForInteractive(); slices.push(Date.now() - t0); } });
        stop = true;
        await stream;
        const gaps = slices.map((t, k) => t - (k ? slices[k - 1] : 0));
        assert.ok(Math.max(...gaps) <= BACKGROUND_STARVATION_CAP_MS + 100, `gaps between background slices: ${gaps.join(', ')} ms`);
        assert.ok(gaps.slice(1).some(g => g >= BACKGROUND_STARVATION_CAP_MS - 60), `background was not held back at all: ${gaps.join(', ')} ms`);
    });

    test('a finished request is counted out once, even if its done() is called twice', async () => {
        const done = beginInteractive();
        done(); done();
        const t0 = Date.now();
        await runAsBackground(async () => { await yieldForInteractive(); });
        assert.ok(Date.now() - t0 < 50, 'no request in flight, so background did not wait');
    });
});
