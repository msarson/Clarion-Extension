import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { EventLoopLagTracker } from '../utils/EventLoopLagTracker';

/**
 * #661 — the startup event-loop sampler reported once per 5s window and dropped the partial
 * window at exit, so a session shorter than one window (a default perf-driver run, ~4s) never
 * logged a max_blocked_ms and a freeze in it read as "no freeze". The tracker now also keeps the
 * worst lag of the sampler's life, and shutdown reports the partial window and that lifetime
 * worst, whatever their size.
 */
suite('Event-loop lag is reported for a session shorter than one window (#661)', () => {
    test('a window reports its worst lag above the threshold, then restarts', () => {
        const t = new EventLoopLagTracker();
        t.record(40); t.record(250); t.record(90);
        assert.strictEqual(t.takeWindow(100), 250);
        assert.strictEqual(t.takeWindow(100), null, 'the next window starts empty');
    });

    test('a window whose worst lag is under the threshold reports nothing', () => {
        const t = new EventLoopLagTracker();
        t.record(80);
        assert.strictEqual(t.takeWindow(100), null);
    });

    test('bug-pin: the partial window at shutdown is reported, not dropped', () => {
        const t = new EventLoopLagTracker();
        t.record(1800); // blocked for 1.8s, and the session ends before the window closes
        assert.deepStrictEqual(t.final(), { windowMaxMs: 1800, lifetimeMaxMs: 1800 });
    });

    test('bug-pin: the lifetime worst survives earlier windows', () => {
        const t = new EventLoopLagTracker();
        t.record(3100);
        assert.strictEqual(t.takeWindow(100), 3100);
        t.record(20);
        assert.deepStrictEqual(t.final(), { windowMaxMs: 20, lifetimeMaxMs: 3100 });
    });

    test('negative drift (a heartbeat that fired early) counts as no lag', () => {
        const t = new EventLoopLagTracker();
        t.record(-7);
        assert.deepStrictEqual(t.final(), { windowMaxMs: 0, lifetimeMaxMs: 0 });
    });

    test('shutdown logs the final EventLoop line from the tracker', () => {
        const src = fs.readFileSync(path.join(__dirname, '..', '..', '..', '..', 'server', 'src', 'server.ts'), 'utf8');
        const shutdown = src.slice(src.indexOf('connection.onShutdown('), src.indexOf('connection.onExit('));
        assert.ok(/eventLoopLag\.final\(\)/.test(shutdown), 'onShutdown reads the tracker');
        assert.ok(/"EventLoop lag"/.test(shutdown), 'onShutdown logs an EventLoop lag line');
    });
});
