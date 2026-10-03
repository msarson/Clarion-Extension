import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { showClarionWorkspaceItems } from '../statusbar/StatusBarVisibility';

/**
 * #675 (from #659) — with a Clarion solution open, the configuration, version and build items showed
 * only while a Clarion file had focus (#273's gate), so from a .cmd build script or with no editor
 * open the user had to click into a Clarion file to switch configuration or build. They now show
 * when a Clarion file has focus OR a solution is open. #273's case (no solution, no Clarion file)
 * still shows nothing.
 */
const root = (() => {
    let dir = __dirname;
    while (dir !== path.dirname(dir)) {
        if (fs.existsSync(path.join(dir, 'package.json')) && fs.existsSync(path.join(dir, 'client'))) return dir;
        dir = path.dirname(dir);
    }
    throw new Error('project root not found');
})();

suite('Clarion status bar items with a solution open (#675)', () => {
    test('bug-pin: a solution is open and a non-Clarion file (a .cmd) has focus: shown', () => {
        assert.strictEqual(showClarionWorkspaceItems({ clarionEditorActive: false, solutionOpen: true }), true);
    });

    test('a Clarion file has focus without a solution (a lone .clw): shown, as before', () => {
        assert.strictEqual(showClarionWorkspaceItems({ clarionEditorActive: true, solutionOpen: false }), true);
    });

    test('#273: no solution and no Clarion file (a non-Clarion workspace): hidden', () => {
        assert.strictEqual(showClarionWorkspaceItems({ clarionEditorActive: false, solutionOpen: false }), false);
    });

    test('every workspace item gates on the rule, not on the active editor alone', () => {
        const src = fs.readFileSync(path.join(root, 'client', 'src', 'statusbar', 'StatusBarManager.ts'), 'utf8');
        const gates = (src.match(/showWorkspaceItems\(\)/g) ?? []).length;
        assert.ok(gates >= 5, `configuration, version, initialisation, build and the refresh use it (found ${gates})`);
        assert.ok(!/if \(isClarionActiveEditor\(\)\)/.test(src), 'no item shows on isClarionActiveEditor() alone');
    });

    test('bug-pin: Build with no editor open builds the solution instead of refusing', () => {
        const src = fs.readFileSync(path.join(root, 'client', 'src', 'commands', 'BuildCommands.ts'), 'utf8');
        assert.ok(!src.includes('Please open a file to build its project'), 'no "open a file" refusal');
    });
});
