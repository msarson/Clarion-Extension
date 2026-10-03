import * as assert from 'assert';
import {
    beginInteractive, runAsBackground, yieldForInteractive, BACKGROUND_STARVATION_CAP_MS, resetInteractivePriorityForTests,
} from '../utils/interactivePriority';

/**
 * #715 item 1 — background validation took turns with a hover every 25 ms, so a hover with many
 * async steps that landed during a re-check took ten times as long as on its own (a cold MAP-include
 * walk: 212 ms alone, 2.1 s during a re-check; a cold global lookup right after opening a module:
 * 162 ms alone, 3.3 s). Background work now waits at its yield points while a hover, completion or
 * F12 is in flight and busy, but always gets a slice at least every ~250 ms, and goes on at once
 * when the request in flight leaves the loop idle (it is waiting - often for background work).
 */
suite('#715 interactive requests run ahead of background validation', () => {
    setup(() => resetInteractivePriorityForTests());
    const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
    /** A request that keeps the event loop busy (5 ms of work per turn) until `stop` is set. */
    const busyRequest = () => {
        const done = beginInteractive();
        const state = { stop: false };
        const finished = (async () => {
            while (!state.stop) {
                const t = Date.now();
                while (Date.now() - t < 5) { /* work */ }
                await new Promise<void>(r => setImmediate(r));
            }
            done();
        })();
        return { state, finished };
    };

    test('outside the background context a yield never waits, even with a request in flight', async () => {
        const req = busyRequest();
        const t0 = Date.now();
        await yieldForInteractive();
        assert.ok(Date.now() - t0 < 50, 'interactive code is never held back by another request');
        req.state.stop = true; await req.finished;
    });

    test('background work waits while a busy request is in flight and resumes when it finishes', async () => {
        await runAsBackground(async () => { await yieldForInteractive(); }); // a slice: the clock starts here
        const req = busyRequest();
        let resumed = 0;
        const bg = runAsBackground(async () => { await yieldForInteractive(); resumed = Date.now(); });
        await sleep(80);
        assert.strictEqual(resumed, 0, 'background resumed while the busy request was in flight');
        const finishedAt = Date.now();
        req.state.stop = true; await req.finished;
        await bg;
        assert.ok(resumed >= finishedAt && resumed - finishedAt < 60, `resumed ${resumed - finishedAt} ms after the request finished`);
    });

    test('a request in flight on an idle loop (waiting for something) does not hold background back', async () => {
        await runAsBackground(async () => { await yieldForInteractive(); });
        const done = beginInteractive(); // in flight, but doing nothing on the loop
        const t0 = Date.now();
        await runAsBackground(async () => { await yieldForInteractive(); });
        const waited = Date.now() - t0;
        done();
        assert.ok(waited < 80, `background waited ${waited} ms behind an idle request`);
    });

    test('the starvation cap: background still gets a slice every ~250 ms under a steady stream of busy requests', async () => {
        let stop = false;
        const stream = (async () => { while (!stop) { const req = busyRequest(); await sleep(20); req.state.stop = true; await req.finished; } })();
        await sleep(30);
        const slices: number[] = [];
        const t0 = Date.now();
        await runAsBackground(async () => { for (let k = 0; k < 4; k++) { await yieldForInteractive(); slices.push(Date.now() - t0); } });
        stop = true;
        await stream;
        const gaps = slices.map((t, k) => t - (k ? slices[k - 1] : 0));
        assert.ok(Math.max(...gaps) <= BACKGROUND_STARVATION_CAP_MS + 150, `gaps between background slices: ${gaps.join(', ')} ms`);
    });

    test('a finished request is counted out once, even if its done() is called twice', async () => {
        const done = beginInteractive();
        done(); done();
        const t0 = Date.now();
        await runAsBackground(async () => { await yieldForInteractive(); });
        assert.ok(Date.now() - t0 < 50, 'no request in flight, so background did not wait');
    });
});
