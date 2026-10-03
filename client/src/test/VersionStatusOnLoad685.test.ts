import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

/**
 * #685 (from #659) — the "Compile: <version> (from <dir>)" status bar item did not show after a
 * normal start. It was updated only by setActiveClarionVersion, which runs at activation before the
 * solution loads (so it hid the item: no solution); the solution load goes through
 * setGlobalClarionSelection, which never touched it. Only Clarion: Set Version brought it back.
 */
const root = (() => {
    let dir = __dirname;
    while (dir !== path.dirname(dir)) {
        if (fs.existsSync(path.join(dir, 'package.json')) && fs.existsSync(path.join(dir, 'client'))) return dir;
        dir = path.dirname(dir);
    }
    throw new Error('project root not found');
})();
const globals = fs.readFileSync(path.join(root, 'client', 'src', 'globals.ts'), 'utf8');

suite('The version status bar item follows the solution load (#685)', () => {
    test('bug-pin: setGlobalClarionSelection updates the version item before any early return', () => {
        const start = globals.indexOf('export async function setGlobalClarionSelection(');
        assert.ok(start >= 0);
        const body = globals.slice(start, globals.indexOf('\nexport ', start + 10));
        const update = body.indexOf('updateVersionStatusBar(clarionVersion, clarionPropertiesFile, !!solutionFile)');
        assert.ok(update >= 0, 'the solution load refreshes the item with its version and properties file');
        const skip = body.indexOf('if (skipSave)');
        assert.ok(skip < 0 || update < skip, 'also when the load skips saving (the startup path passes skipSave)');
    });
});
