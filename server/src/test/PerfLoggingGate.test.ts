/**
 * #297 (revised) — perf channels are opt-in via clarion.log.performance.enabled.
 * Pins: with the flag OFF (release default) a "perf"-level logger emits nothing;
 * with it ON the line emits. The instrumentation itself always runs — only
 * output is gated.
 */

import * as assert from 'assert';
import LoggerManager from '../logger';
import { LoggingConfig } from '../../../common/LoggingConfig';

suite('Perf logging gate (#297)', () => {

    let origEnabled: boolean;
    let origConsoleError: typeof console.error;
    let emitted: string[];

    setup(() => {
        origEnabled = LoggingConfig.PERF_CHANNELS_ENABLED;
        origConsoleError = console.error;
        emitted = [];
        console.error = (...args: unknown[]) => { emitted.push(args.map(String).join(' ')); };
    });

    teardown(() => {
        LoggingConfig.PERF_CHANNELS_ENABLED = origEnabled;
        console.error = origConsoleError;
    });

    test('flag off (release default): perf-level logger is silent', () => {
        LoggingConfig.PERF_CHANNELS_ENABLED = false;
        const perfLogger = LoggerManager.getLogger('GateTest.Off', 'perf');
        perfLogger.perf('should not appear', { ms: 1 });
        assert.strictEqual(emitted.length, 0, `expected silence, got: ${emitted.join(' | ')}`);
    });

    test('flag on: perf-level logger emits', () => {
        LoggingConfig.PERF_CHANNELS_ENABLED = true;
        const perfLogger = LoggerManager.getLogger('GateTest.On', 'perf');
        perfLogger.perf('should appear', { ms: 1 });
        assert.strictEqual(emitted.length, 1);
        assert.ok(emitted[0].includes('should appear') && emitted[0].includes('ms=1'));
    });
});
