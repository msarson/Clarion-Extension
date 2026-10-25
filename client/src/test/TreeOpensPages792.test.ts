import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

/**
 * #792 — a click on a project in the Solution View opens its Project Properties page, and a click
 * on the solution opens Solution Properties, instead of the .cwproj's XML (or nothing). Each page
 * keeps its XML one click away. SolutionTreeDataProvider imports vscode, so the wiring is pinned
 * on the source.
 */
const root = (() => {
    let dir = __dirname;
    while (dir !== path.dirname(dir)) {
        if (fs.existsSync(path.join(dir, 'package.json')) && fs.existsSync(path.join(dir, 'client'))) return dir;
        dir = path.dirname(dir);
    }
    throw new Error('project root not found');
})();
const tree = fs.readFileSync(path.join(root, 'client', 'src', 'SolutionTreeDataProvider.ts'), 'utf8');
const after = (marker: string) => tree.slice(tree.indexOf(marker), tree.indexOf(marker) + 1200);

suite('The Solution View opens the property pages (#792)', () => {
    test('a project node opens its Project Properties page', () => {
        const node = after("treeItem.contextValue = 'clarionProject';");
        assert.match(node, /command: 'clarion\.openProjectProperties'/);
        assert.match(node, /arguments: \[Uri\.file\(projectFile\)\]/);
    });

    test('the solution node opens Solution Properties, and nothing later replaces it', () => {
        const start = tree.indexOf("treeItem.contextValue = 'clarionSolution';");
        const node = tree.slice(start, tree.indexOf('return treeItem;', start));
        const commands = node.match(/command: '[^']+'/g) ?? [];
        assert.deepStrictEqual(commands, ["command: 'clarion.openSolutionProperties'"]);
    });

    test('each page keeps its text one click away', () => {
        const project = fs.readFileSync(path.join(root, 'client', 'src', 'project', 'ProjectPropertiesEditor.ts'), 'utf8');
        const solution = fs.readFileSync(path.join(root, 'client', 'src', 'solution', 'SolutionPanel.ts'), 'utf8');
        assert.ok(project.includes('Open as XML'));
        assert.ok(solution.includes('Open .sln as text'));
    });
});
