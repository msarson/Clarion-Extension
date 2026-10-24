import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { noSolutionRows, renderSummaryRow, resolveRecentClick } from '../views/ToolsPaneRows';

/**
 * #783 — with no solution loaded, the Actions pane offered only the version row and "No solution
 * open"; opening or starting a solution meant finding the Solution View's title bar. It now offers
 * every way in: Open a solution, New solution (with a folder open: the wizard writes into it), and
 * the recent solutions, each through the command the Solution View uses. A recent row carries its
 * index, never its path: the extension looks the solution up in the list it rendered.
 */
const root = (() => {
    let dir = __dirname;
    while (dir !== path.dirname(dir)) {
        if (fs.existsSync(path.join(dir, 'package.json')) && fs.existsSync(path.join(dir, 'client'))) return dir;
        dir = path.dirname(dir);
    }
    throw new Error('project root not found');
})();
const providerSource = fs.readFileSync(path.join(root, 'client', 'src', 'views', 'SolutionToolbarProvider.ts'), 'utf8');

const recent = (n: number) => Array.from({ length: n }, (_, i) => ({ solutionFile: `C:\\Apps\\App${i}\\App${i}.sln` }));
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

suite('Actions pane with no solution loaded (#783)', () => {
    test('a folder open: Open, New, then the recent solutions, newest first', () => {
        const rows = noSolutionRows(true, recent(2));
        assert.deepStrictEqual(rows.map(r => [r.label, r.value, r.command, r.arg]), [
            ['Open', 'Open a solution…', 'openSolution', undefined],
            ['New', 'New solution…', 'newSolution', undefined],
            ['Recent', 'App0', 'openRecent', '0'],
            ['', 'App1', 'openRecent', '1'],
        ]);
        assert.strictEqual(rows[2].title, 'C:\\Apps\\App0\\App0.sln', 'the full path is the tooltip');
    });

    test('no folder open: no New solution, which needs a folder to write into', () => {
        assert.ok(!noSolutionRows(false, recent(1)).some(r => r.command === 'newSolution'));
        assert.ok(noSolutionRows(false, recent(1)).some(r => r.command === 'openSolution'));
    });

    test('at most five recent solutions, and none at all when there are none', () => {
        assert.strictEqual(noSolutionRows(true, recent(9)).filter(r => r.command === 'openRecent').length, 5);
        assert.strictEqual(noSolutionRows(true, []).filter(r => r.command === 'openRecent').length, 0);
    });

    test('a tagged list numbers its rows with the generation they were rendered in', () => {
        const rows = noSolutionRows(true, recent(2), 5, 7).filter(r => r.command === 'openRecent');
        assert.deepStrictEqual(rows.map(r => r.arg), ['7:0', '7:1']);
    });

    test('a click opens the entry it was rendered for, or nothing once the list has moved on', () => {
        const a = { solutionFile: 'A.sln' }, b = { solutionFile: 'B.sln' };
        // Rendered as generation 3: [A, B]. Clicked A (index 0).
        assert.strictEqual(resolveRecentClick('3:0', 3, [a, b]), a);
        // History reordered to [B, A] and re-rendered as generation 4 before the click arrived.
        assert.strictEqual(resolveRecentClick('3:0', 4, [b, a]), 'stale');
        // Shrunk: an index past the end of the current generation is nothing to open.
        assert.strictEqual(resolveRecentClick('4:5', 4, [b]), undefined);
        // Malformed or hostile arguments open nothing.
        for (const bad of [undefined, '', '0', 'x:y', '4:-1', '4:1.5', '4:__proto__']) {
            assert.strictEqual(resolveRecentClick(bad, 4, [b, a]), undefined, String(bad));
        }
    });

    test('a row with an argument renders it for the click to send', () => {
        const html = renderSummaryRow({ label: 'Recent', value: 'App0', command: 'openRecent', arg: '0', title: 'C:\\x.sln' }, esc);
        assert.match(html, /data-cmd="openRecent"/);
        assert.match(html, /data-arg="0"/);
        assert.doesNotMatch(renderSummaryRow({ label: 'Open', value: 'v', command: 'openSolution' }, esc), /data-arg/);
    });

    test('the webview posts the row\'s argument, and re-rendered rows keep it', () => {
        assert.match(providerSource, /postMessage\(\{\s*command:\s*row\.dataset\.cmd,\s*arg:\s*row\.dataset\.arg\s*\}\)/);
        assert.match(providerSource, /data-arg="'\s*\+\s*escapeHtml\(r\.arg\)/, 'the in-page renderRow emits data-arg');
    });

    test('a recent row opens through resolveRecentClick against the rendered generation, never a path from the page', () => {
        assert.match(providerSource, /case 'openRecent':[\s\S]{0,500}resolveRecentClick\(message\.arg, this\._recentGen, this\._recent\)/);
        assert.match(providerSource, /clarion\.openRecentSolution/);
    });

    test('the page escapes quotes in what it puts inside attributes', () => {
        assert.match(providerSource, /function escapeHtml\(s\) \{[\s\S]{0,300}&quot;/);
    });
});
