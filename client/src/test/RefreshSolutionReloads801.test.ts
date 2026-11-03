import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

/**
 * #801 — Refresh Solution only fetched the language server's solution tree again, which is the
 * parse made when the solution loaded, so a .sln or .cwproj changed outside the extension (in the
 * Clarion IDE, or by hand) never showed. It now reloads the solution as adding a project does
 * (#795), and the server parses again when the .sln or a project file changed. vscode is imported,
 * so the wiring is pinned on the source.
 */
const root = (() => {
    let dir = __dirname;
    while (dir !== path.dirname(dir)) {
        if (fs.existsSync(path.join(dir, 'package.json')) && fs.existsSync(path.join(dir, 'client'))) return dir;
        dir = path.dirname(dir);
    }
    throw new Error('project root not found');
})();
const source = fs.readFileSync(path.join(root, 'client', 'src', 'commands', 'BuildCommands.ts'), 'utf8');

suite('Refresh Solution reads a changed .sln or .cwproj again (#801)', () => {
    test('the command reloads the solution', () => {
        const start = source.indexOf("registerCommand('clarion.forceRefreshSolutionCache'");
        assert.ok(start >= 0, 'command registered');
        const body = source.slice(start, source.indexOf('registerCommand(', start + 10));
        assert.match(body, /executeCommand\('clarion\.reinitializeSolution'\)/);
    });

    test('it leaves the tree to solutionReady, not an early fetch of the old parse', () => {
        // The reload's updatePaths is a notification: a fetch right after it got the tree from before.
        const start = source.indexOf("registerCommand('clarion.forceRefreshSolutionCache'");
        const body = source.slice(start, source.indexOf('registerCommand(', start + 10));
        assert.doesNotMatch(body, /solutionCache\.refresh\(|SolutionCache\.getInstance\(\)/);
    });
});
