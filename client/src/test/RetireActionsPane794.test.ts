import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

/**
 * #794 — the Actions pane is gone. Everything it offered has a new home: Build, Run and Debug on
 * the Solution View's title bar, the rest of its buttons in that bar's `…` menu, its rows on the
 * Solution page (#792), and its no-solution rows in the Solution View's welcome content.
 */
const root = (() => {
    let dir = __dirname;
    while (dir !== path.dirname(dir)) {
        if (fs.existsSync(path.join(dir, 'package.json')) && fs.existsSync(path.join(dir, 'client'))) return dir;
        dir = path.dirname(dir);
    }
    throw new Error('project root not found');
})();
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
type MenuItem = { command: string; when?: string; group?: string };
const titleMenu: MenuItem[] = pkg.contributes.menus['view/title'].filter((m: MenuItem) => /view == solutionView/.test(m.when ?? ''));
const inTitle = (command: string) => titleMenu.find(m => m.command === command);
const command = (id: string) => pkg.contributes.commands.find((c: { command: string }) => c.command === id);

suite('The Actions pane is retired (#794)', () => {
    test('the view and its provider are gone', () => {
        const views = pkg.contributes.views.clarionViews.map((v: { id: string }) => v.id);
        assert.ok(!views.includes('clarionSolutionToolbar'), 'no Actions view');
        assert.deepStrictEqual(views, ['solutionView', 'clarionStructureView']);
        assert.ok(!fs.existsSync(path.join(root, 'client', 'src', 'views', 'SolutionToolbarProvider.ts')));
    });

    test('Build, Run, Debug and Solution Properties are buttons on the Solution View with a solution open', () => {
        for (const id of ['clarion.buildAllProjects', 'clarion.runWithoutDebugging', 'clarion.startDebugging', 'clarion.openSolutionProperties']) {
            const item = inTitle(id);
            assert.ok(item, `${id} is on the title bar`);
            assert.match(item!.group ?? '', /^navigation/, `${id} is a button`);
            assert.match(item!.when ?? '', /clarion\.solutionOpen/, `${id} only with a solution open`);
            assert.ok(command(id)?.icon, `${id} has an icon`);
        }
    });

    test('the pane\'s other buttons, and the view\'s own, are in the `…` menu', () => {
        for (const id of ['clarion.buildAndRun', 'clarion.buildAndDebug', 'clarion.openInClarionIDE', 'clarion.forceRefreshSolutionCache',
            'clarion.solutionView.filter', 'clarion.solutionView.clearFilter', 'clarion.toggleApplicationSortOrder', 'clarion.closeSolution']) {
            const item = inTitle(id);
            assert.ok(item, `${id} is in the Solution View's title menu`);
            assert.doesNotMatch(item!.group ?? '', /^navigation/, `${id} is in the … menu`);
            assert.ok(command(id), `${id} is contributed`);
        }
        assert.ok(titleMenu.filter(m => /^navigation/.test(m.group ?? '') && /(^|&& )clarion\.solutionOpen/.test(m.when ?? '')).length <= 4,
            'the bar keeps a short row of buttons');
    });

    test('Build and Run, and Build and Debug, build first', () => {
        const run = fs.readFileSync(path.join(root, 'client', 'src', 'commands', 'RunCommands.ts'), 'utf8');
        assert.match(run, /registerCommand\('clarion\.buildAndRun',[^\n]*executeCommand\('clarion\.runWithoutDebugging', true\)/);
        assert.match(run, /registerCommand\('clarion\.buildAndDebug',[^\n]*executeCommand\('clarion\.startDebugging', true\)/);
    });

    test('with no solution open, the welcome content offers every way in', () => {
        const welcome = pkg.contributes.viewsWelcome.filter((w: { view: string }) => w.view === 'solutionView');
        const text = welcome.map((w: { contents: string }) => w.contents).join('\n');
        for (const id of ['clarion.openSolution', 'clarion.newSolution', 'clarion.openSolutionFromList']) {
            assert.ok(text.includes(`(command:${id})`), `${id} is offered`);
        }
        const fresh = welcome.find((w: { contents: string }) => w.contents.includes('command:clarion.newSolution'));
        assert.match(fresh.when, /workspaceFolderCount > 0/, 'New Solution needs a folder to write into');
    });

    test('the Solution page shows the rows the pane showed', () => {
        const page = fs.readFileSync(path.join(root, 'client', 'src', 'solution', 'SolutionPanel.ts'), 'utf8');
        for (const shown of ['Clarion installation', 'Compiler version', 'Configuration', 'Startup project', 'Build log', 'Run starts',
            'Build settings', 'File graph', 'Unresolved file references']) {
            assert.ok(page.includes(`'${shown}`), `the page shows ${shown}`);
        }
        assert.match(page, /case 'unresolved':\s*await vscode\.commands\.executeCommand\('clarion\.unresolvedReferencesReport'\)/);
        assert.match(page, /configDir/, 'a ClarionProperties.xml outside %APPDATA% is named (#479)');
    });
});
