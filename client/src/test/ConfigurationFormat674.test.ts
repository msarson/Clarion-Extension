import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { configurationToStore } from '../utils/ConfigurationPrecedence';

/**
 * #674 (from #659) — Set Configuration stored the bare name it lists (`Release`), while opening or
 * reinitialising the solution stores the .sln's own entry (#530: `Debug|Win32`), so the same setting
 * changed format depending on which action last wrote it. The picker now stores the .sln's entry.
 */
const DECLARED = ['Debug|Win32', 'Release|Win32', 'TSI4_DBG|Win32', 'TSI4_REL|Win32'];

suite('One stored format for the build configuration (#674)', () => {
    test('bug-pin: a picked name is stored as the .sln declares it', () => {
        assert.strictEqual(configurationToStore('Release', DECLARED), 'Release|Win32');
        assert.strictEqual(configurationToStore('TSI4_DBG', DECLARED), 'TSI4_DBG|Win32');
    });

    test('matching is on the name, case-insensitively, as #530 reads it', () => {
        assert.strictEqual(configurationToStore('debug', DECLARED), 'Debug|Win32');
    });

    test('a .sln that declares bare names keeps bare names', () => {
        assert.strictEqual(configurationToStore('Release', ['Debug', 'Release']), 'Release');
    });

    test('a name the .sln does not declare is stored as picked', () => {
        assert.strictEqual(configurationToStore('Custom', DECLARED), 'Custom');
    });

    test('Set Configuration stores through configurationToStore', () => {
        let dir = __dirname;
        while (!fs.existsSync(path.join(dir, 'client', 'src', 'config', 'ConfigurationManager.ts'))) dir = path.dirname(dir);
        const src = fs.readFileSync(path.join(dir, 'client', 'src', 'config', 'ConfigurationManager.ts'), 'utf8');
        assert.ok(src.includes('configurationToStore('), 'setConfiguration maps the pick to the stored form');
    });
});
