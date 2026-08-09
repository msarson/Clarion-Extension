import * as assert from 'assert';
import { DefinitionTrace } from '../providers/utils/DefinitionTrace';

/**
 * #360 — the trace's load-bearing measurement is max_sync_slice_ms: the longest
 * stretch the event loop went without a tick. It's what distinguishes a phase
 * that BLOCKS continuously (needs yields/bounding) from one that merely awaits
 * queued work (needs prioritization). These tests pin that distinction.
 */
suite('DefinitionTrace (#360)', () => {

    function busyBlock(ms: number): void {
        const end = Date.now() + ms;
        // Intentionally spin — no await — so the heartbeat cannot tick.
        while (Date.now() < end) { /* block */ }
    }

    test('a continuous synchronous block registers as a large max_sync_slice', async () => {
        const trace = new DefinitionTrace(Date.now());
        await trace.time('blockingPhase', async () => {
            busyBlock(150);
        });
        // Let the heartbeat tick again so the gap around the block is measured.
        await new Promise<void>(resolve => setImmediate(resolve));
        const snap = trace.snapshot();
        assert.ok((snap.max_sync_slice_ms as number) >= 100,
            `continuous 150ms block should show a max sync slice >=100ms; got ${snap.max_sync_slice_ms}`);
        assert.ok((snap.phases as string).includes('blockingPhase'), 'phase recorded');
    });

    test('the same wall-clock spent awaiting keeps max_sync_slice small', async () => {
        const trace = new DefinitionTrace(Date.now());
        await trace.time('awaitingPhase', async () => {
            // Same ~150ms total, but yielded in small awaited slices — the loop
            // stays free, so no long synchronous slice accrues.
            for (let i = 0; i < 15; i++) {
                await new Promise<void>(resolve => setTimeout(resolve, 10));
            }
        });
        await new Promise<void>(resolve => setImmediate(resolve));
        const snap = trace.snapshot();
        assert.ok((snap.max_sync_slice_ms as number) < 80,
            `awaited work should keep the max sync slice small; got ${snap.max_sync_slice_ms}`);
        assert.ok((snap.elapsed_ms as number) >= 120,
            'the awaiting phase still took real wall-clock time');
    });

    test('phase ms accumulate and fields carry the requested schema', async () => {
        const trace = new DefinitionTrace(Date.now());
        trace.symbol = 'MyProc';
        trace.route = 'symbolDefinition';
        trace.candidateCount = 3;
        trace.filesExamined = 42;
        trace.cacheHits = 5;
        trace.cacheMisses = 2;
        trace.fallbackEntered = true;
        await trace.time('symbolDefinition', async () => { busyBlock(10); });
        await trace.time('symbolDefinition', async () => { busyBlock(10); });
        const snap = trace.snapshot();
        assert.strictEqual(snap.symbol, 'MyProc');
        assert.strictEqual(snap.route, 'symbolDefinition');
        assert.strictEqual(snap.candidate_count, 3);
        assert.strictEqual(snap.files_examined, 42);
        assert.strictEqual(snap.cache_hits, 5);
        assert.strictEqual(snap.cache_misses, 2);
        assert.strictEqual(snap.fallback_entered, 'true');
        assert.strictEqual(snap.cancelled, 'false');
        // Two 10ms phases under the same name accumulate.
        assert.ok((snap.phases as string).includes('symbolDefinition='), 'phase present');
    });
});
