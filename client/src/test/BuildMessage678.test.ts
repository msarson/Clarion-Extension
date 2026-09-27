import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { cleanBuildMessage, parseBuildOutput } from '../utils/BuildErrorPatterns';

/**
 * #678 (from #659) — MSBuild writes a carriage return in a tool's output as the two characters `\r`,
 * so a failing pre-build step reached Problems as "…cannot find the file specified.\r". Trailing
 * escaped line breaks are now dropped from build messages.
 */
suite('Build messages lose MSBuild\'s escaped line breaks (#678)', () => {
    test('bug-pin: a trailing literal \\r is dropped', () => {
        assert.strictEqual(cleanBuildMessage('The system cannot find the file specified.\\r'), 'The system cannot find the file specified.');
    });

    test('trailing \\r\\n, \\n and spaces are dropped too', () => {
        assert.strictEqual(cleanBuildMessage('Failed.\\r\\n  '), 'Failed.');
        assert.strictEqual(cleanBuildMessage('Failed.\\n'), 'Failed.');
    });

    test('a backslash inside the message is kept', () => {
        assert.strictEqual(cleanBuildMessage('Cannot open C:\\new\\rates.inc'), 'Cannot open C:\\new\\rates.inc');
    });

    test('an ordinary message is unchanged', () => {
        assert.strictEqual(cleanBuildMessage('Unknown procedure label'), 'Unknown procedure label');
    });

    test('the build log parser cleans file-located and fallback messages', () => {
        const messages = parseBuildOutput([
            'C:\\app\\Main.clw(3,1): error : Bad thing.\\r [C:\\app\\App.cwproj]',
            'MSBUILD : error MSB1009: Project file does not exist.\\r',
        ].join('\r\n')).map(p => p.message);
        assert.deepStrictEqual(messages, ['Bad thing.', 'MSB1009: Project file does not exist.']);
    });
});
