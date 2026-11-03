import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

/**
 * #795 — a page left open when the extension host restarts (installing a VSIX does that) kept
 * showing, but nothing answered it: Add on Solution Properties did nothing. VS Code does not hand
 * such a page to the restarted extension (a serializer is called on a window reload only, checked
 * in VS Code), so the extension closes the Clarion pages it finds at start that are not its own,
 * and opens Solution Properties again once the solution has loaded. vscode is imported, so the
 * wiring is pinned on the source.
 */
const root = (() => {
    let dir = __dirname;
    while (dir !== path.dirname(dir)) {
        if (fs.existsSync(path.join(dir, 'package.json')) && fs.existsSync(path.join(dir, 'client'))) return dir;
        dir = path.dirname(dir);
    }
    throw new Error('project root not found');
})();
const panel = fs.readFileSync(path.join(root, 'client', 'src', 'solution', 'SolutionPanel.ts'), 'utf8');

suite('A page left open across an extension host restart is not left unanswered (#795)', () => {
    test('at start, the Clarion page tabs nothing answers are closed', () => {
        const register = panel.slice(panel.indexOf('public static register()'), panel.indexOf('public static register()') + 1500);
        assert.match(register, /SolutionPanel\.closeOrphanedPages\(\)/);
        const sweep = panel.slice(panel.indexOf('closeOrphanedPages(): Promise<void>'));
        assert.match(sweep, /TabInputWebview/);
        for (const viewType of ['solutionProperties', 'openSolution', 'newSolutionReview']) assert.ok(sweep.includes(viewType), viewType);
        assert.match(sweep, /tabGroups\.close\(/);
    });

    test('Solution Properties opens again once the solution has loaded', () => {
        const refresh = panel.slice(panel.indexOf('static refresh(): void {'), panel.indexOf('static refresh(): void {') + 600);
        assert.match(refresh, /reopenAfterRestart && globalSolutionFile/);
        assert.match(refresh, /showProperties\(\)/);
    });
});
