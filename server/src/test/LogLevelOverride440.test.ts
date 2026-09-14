import * as assert from 'assert';
import LoggerManager from '../logger';
import { LoggingConfig } from '../../../common/LoggingConfig';

// #440 — the server logger is a separate implementation from the client's; the
// same global override must let a raised level reach the server process, whose
// modules also pin "error" at import time. The server logger emits via
// console.error, so capture that.

function capture(): { lines: string[]; restore: () => void } {
    const lines: string[] = [];
    const orig = console.error;
    console.error = (...args: unknown[]) => { lines.push(args.map(String).join(' ')); };
    return { lines, restore: () => { console.error = orig; } };
}

suite('#440 server global log-level override', () => {

    teardown(() => { LoggingConfig.LEVEL_OVERRIDE = undefined; });

    test('an error-pinned server logger stays silent for warn with no override', () => {
        const log = LoggerManager.getLogger('SrvLogTest440.a');
        log.setLevel('error');
        LoggingConfig.LEVEL_OVERRIDE = undefined;
        const cap = capture();
        log.warn('hidden');
        cap.restore();
        assert.strictEqual(cap.lines.length, 0, `got: ${cap.lines.join(' | ')}`);
    });

    test('the override makes an error-pinned server logger emit warn', () => {
        const log = LoggerManager.getLogger('SrvLogTest440.b');
        log.setLevel('error');
        LoggingConfig.LEVEL_OVERRIDE = 'warn';
        const cap = capture();
        log.warn('now visible');
        log.info('still hidden');
        cap.restore();
        assert.strictEqual(cap.lines.length, 1, `got: ${cap.lines.join(' | ')}`);
        assert.ok(cap.lines[0].includes('now visible'));
    });

    test('normalizeOverride: only warn/info/debug become an override; error and junk clear it', () => {
        assert.strictEqual(LoggingConfig.normalizeOverride('warn'), 'warn');
        assert.strictEqual(LoggingConfig.normalizeOverride('info'), 'info');
        assert.strictEqual(LoggingConfig.normalizeOverride('debug'), 'debug');
        assert.strictEqual(LoggingConfig.normalizeOverride('error'), undefined);
        assert.strictEqual(LoggingConfig.normalizeOverride(undefined), undefined);
        assert.strictEqual(LoggingConfig.normalizeOverride('nonsense'), undefined);
    });

    test('a perf-channel server logger ignores the standard override', () => {
        const log = LoggerManager.getLogger('SrvLogTest440.perf', 'perf');
        LoggingConfig.LEVEL_OVERRIDE = 'debug';
        const cap = capture();
        log.info('should stay silent');
        log.warn('also silent');
        cap.restore();
        assert.strictEqual(cap.lines.length, 0, `got: ${cap.lines.join(' | ')}`);
    });
});
