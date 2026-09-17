import * as assert from 'assert';
import LoggerManager from '../utils/LoggerManager';
import { LoggingConfig } from '../../../common/LoggingConfig';

// #440 — log levels are pinned per module at import time (121 setLevel("error")
// calls), so the 229 logger.warn sites are unreachable and a user cannot raise
// the level to capture a diagnostic log. A global override in LoggingConfig now
// wins over the per-module level for standard-severity loggers, without touching
// the per-module pins and without disturbing the perf/test channels.

function capture(): { lines: string[]; restore: () => void } {
    const lines: string[] = [];
    const prev = (LoggerManager as unknown as { outputChannel?: { appendLine(v: string): void } }).outputChannel;
    LoggerManager.setOutputChannel({ appendLine: (v: string) => lines.push(v) });
    return { lines, restore: () => { (LoggerManager as unknown as { outputChannel?: unknown }).outputChannel = prev; } };
}

suite('#440 global log-level override', () => {

    teardown(() => { LoggingConfig.LEVEL_OVERRIDE = undefined; });

    test('a logger pinned to "error" stays silent for warn with no override (today\'s behaviour)', () => {
        const log = LoggerManager.getLogger('LogTest440.a');
        log.setLevel('error');
        LoggingConfig.LEVEL_OVERRIDE = undefined;
        const cap = capture();
        log.warn('a hidden warning');
        cap.restore();
        assert.strictEqual(cap.lines.length, 0, `expected no output, got: ${cap.lines.join(' | ')}`);
    });

    test('the override makes an error-pinned logger emit warn', () => {
        const log = LoggerManager.getLogger('LogTest440.b');
        log.setLevel('error');
        LoggingConfig.LEVEL_OVERRIDE = 'warn';
        const cap = capture();
        log.warn('a now-visible warning');
        log.info('still hidden at warn');
        cap.restore();
        assert.strictEqual(cap.lines.length, 1, `expected only the warn line, got: ${cap.lines.join(' | ')}`);
        assert.ok(cap.lines[0].includes('a now-visible warning'));
        assert.ok(cap.lines[0].includes('WARN'));
    });

    test('the override at "info" shows info and warn but not debug', () => {
        const log = LoggerManager.getLogger('LogTest440.c');
        log.setLevel('error');
        LoggingConfig.LEVEL_OVERRIDE = 'info';
        const cap = capture();
        log.debug('debug hidden');
        log.info('info shown');
        log.warn('warn shown');
        cap.restore();
        assert.strictEqual(cap.lines.length, 2, `got: ${cap.lines.join(' | ')}`);
    });

    test('errors always emit, override or not', () => {
        const log = LoggerManager.getLogger('LogTest440.d');
        log.setLevel('error');
        LoggingConfig.LEVEL_OVERRIDE = undefined;
        const cap = capture();
        log.error('an error');
        cap.restore();
        assert.strictEqual(cap.lines.length, 1);
    });

    test('a "test"-channel logger is NOT turned into a standard logger by the override', () => {
        const log = LoggerManager.getLogger('LogTest440.e', 'test');
        LoggingConfig.LEVEL_OVERRIDE = 'info';
        const cap = capture();
        log.info('should stay silent on a test-channel logger');
        log.warn('also silent');
        cap.restore();
        assert.strictEqual(cap.lines.length, 0, `test channel must ignore the standard override, got: ${cap.lines.join(' | ')}`);
    });
});
