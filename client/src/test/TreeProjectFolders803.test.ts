import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

/**
 * #803 — the Solution View's project folders, wired to the tree and the Project Properties page.
 * Both import vscode, so the wiring is pinned on the source; what the folders hold is tested in
 * ProjectFolders803.
 */
const root = (() => {
    let dir = __dirname;
    while (dir !== path.dirname(dir)) {
        if (fs.existsSync(path.join(dir, 'package.json')) && fs.existsSync(path.join(dir, 'client'))) return dir;
        dir = path.dirname(dir);
    }
    throw new Error('project root not found');
})();
const read = (file: string) => fs.readFileSync(path.join(root, 'client', 'src', ...file.split('/')), 'utf8');
const tree = read('SolutionTreeDataProvider.ts');
const editor = read('project/ProjectPropertiesEditor.ts');

suite('Solution View: the IDE folders are shown and open the Sources tab (#803)', () => {
    test('a project\'s children start with its folders, built from its .cwproj', () => {
        const getChildren = tree.slice(tree.indexOf('async getChildren(element?: TreeNode)'), tree.indexOf('private async getChildrenInner('));
        assert.match(getChildren, /this\.projectFolderNodes\(element\), \.\.\.children/);
        assert.match(tree, /projectFolders\(text\)/);
    });

    // The reviews of #803: the folders never appeared (a project's data has a `type`), and once
    // built they were carried across refreshes, so an Add or Remove never showed.
    test('a project is recognised by isProjectNodeData, and its folders are rebuilt on every query', () => {
        const getChildren = tree.slice(tree.indexOf('async getChildren(element?: TreeNode)'), tree.indexOf('private async getChildrenInner('));
        assert.match(getChildren, /isProjectNodeData\(element\.data\)/);
        assert.match(getChildren, /children\.filter\(c => c\.data\?\.type !== 'projectFolder'\)/);
        assert.doesNotMatch(tree, /private isProjectNode\(/);
    });

    test('Add and Remove redraw the view themselves, and ask before saving other unsaved changes', () => {
        const cmds = read('commands/ProjectFolderCommands.ts');
        assert.match(cmds, /solutionTreeDataProvider\?\.redraw\(\)/);
        assert.match(tree, /public redraw\(\): void \{\s*this\._onDidChangeTreeData\.fire\(\);/);
        assert.match(cmds, /document\.isDirty/);
        assert.match(cmds, /not in the project/);
    });

    test('the filter does not match a folder by its own label', () => {
        // In nodeMatches, so every filter path (find, mark, apply) leaves folders out.
        const matches = tree.slice(tree.indexOf('private nodeMatches('), tree.indexOf('private nodeMatches(') + 400);
        assert.match(matches, /if \(node\.data\?\.type === 'projectFolder'\) return false;/);
    });

    test('a folder opens the project\'s Sources tab; a referenced project opens its own page', () => {
        const folder = tree.slice(tree.indexOf("type === 'projectFolder')"), tree.indexOf("type === 'projectFolderItem')"));
        assert.match(folder, /command: 'clarion\.openProjectProperties', arguments: \[Uri\.file\(folder\.cwproj\), 'sources'\]/);
        assert.match(folder, /contextValue = 'clarionProjectFolder'/);
        const item = tree.slice(tree.indexOf("type === 'projectFolderItem')"));
        assert.match(item, /kind === 'ProjectReference'[\s\S]*?clarion\.openProjectProperties/);
        assert.match(item, /contextValue = 'clarionProjectFolderItem'/);
    });

    test('Add on a folder and Remove on an entry, as the IDE\'s popup menus, and nowhere else', () => {
        const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
        const declared = (id: string) => pkg.contributes.commands.find((c: { command: string }) => c.command === id);
        assert.ok(declared('clarion.projectFolder.add'), 'add declared');
        assert.ok(declared('clarion.projectFolder.remove'), 'remove declared');
        const context = pkg.contributes.menus['view/item/context'] as { command: string; when: string }[];
        assert.ok(context.some(m => m.command === 'clarion.projectFolder.add' && m.when === 'view == solutionView && viewItem == clarionProjectFolder'));
        assert.ok(context.some(m => m.command === 'clarion.projectFolder.remove' && m.when === 'view == solutionView && viewItem == clarionProjectFolderItem'));
        // They need a tree node, so they are not offered in the Command Palette.
        const palette = pkg.contributes.menus.commandPalette as { command: string; when: string }[];
        for (const id of ['clarion.projectFolder.add', 'clarion.projectFolder.remove']) {
            assert.ok(palette.some(m => m.command === id && m.when === 'false'), id);
        }
        assert.match(read('extension.ts'), /registerProjectFolderCommands\(solutionTreeDataProvider\)/);
    });

    test('the Sources tab lists the projects to include, adds them by file dialog and removes them', () => {
        const sources = editor.slice(editor.indexOf('function sources(s)'), editor.indexOf('function render()'));
        assert.match(sources, /'Projects to include'/);
        assert.match(sources, /s\.includes\.map\(i => itemRow\('Include', i\.include/);
        assert.match(sources, /postMessage\(\{ type: 'pickInclude' \}\)/);
        const host = editor.slice(editor.indexOf("case 'pickInclude'"), editor.indexOf("case 'xml'"));
        assert.match(host, /'TopSpeed project': \['prj', 'pr'\]/);
        assert.match(host, /addItem\(text, 'Include', includeFor\(folder, f\.fsPath\)\)/);
    });

    test('the Project Properties page shows the tab it is opened on, when opening or already open', () => {
        assert.match(editor, /registerCommand\('clarion\.openProjectProperties', async \([^)]*, tab\?: string\)/);
        assert.match(editor, /postMessage\(\{ type: 'tab', tab \}\)/);
        assert.match(editor, /if \(e\.data && e\.data\.tab\) \{ tab = e\.data\.tab;/);
    });
});
