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

    test('a folder opens the project\'s Sources tab; a referenced project opens its own page', () => {
        const folder = tree.slice(tree.indexOf("type === 'projectFolder')"), tree.indexOf("type === 'projectFolderItem')"));
        assert.match(folder, /command: 'clarion\.openProjectProperties', arguments: \[Uri\.file\(folder\.cwproj\), 'sources'\]/);
        assert.match(folder, /contextValue = 'clarionProjectFolder'/);
        const item = tree.slice(tree.indexOf("type === 'projectFolderItem')"));
        assert.match(item, /kind === 'ProjectReference'[\s\S]*?clarion\.openProjectProperties/);
        assert.match(item, /contextValue = 'clarionProjectFolderItem'/);
    });

    test('the Project Properties page shows the tab it is opened on, when opening or already open', () => {
        assert.match(editor, /registerCommand\('clarion\.openProjectProperties', async \([^)]*, tab\?: string\)/);
        assert.match(editor, /postMessage\(\{ type: 'tab', tab \}\)/);
        assert.match(editor, /if \(e\.data && e\.data\.tab\) \{ tab = e\.data\.tab;/);
    });
});
