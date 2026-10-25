import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { newProjectFiles } from '../solution/SolutionFiles';
import { newProjectError, projectFolderError, projectFolder, subfolderRedNote } from '../solution/SolutionPage';

/**
 * #796 — a project added from Solution Properties can go in a sub-folder of the solution's
 * folder, as MSBuild and the .sln allow: the .sln names it as `Orders\Orders.cwproj`. Empty
 * keeps it beside the .sln (#795). The folder must stay below the solution's folder.
 */
suite('Solution Properties: a new project in a sub-folder (#796)', () => {
    test('the folder is a relative path below the solution, written with backslashes', () => {
        assert.strictEqual(projectFolder(''), '');
        assert.strictEqual(projectFolder('  '), '');
        assert.strictEqual(projectFolder('Orders'), 'Orders');
        assert.strictEqual(projectFolder(' Libs/Orders/ '), 'Libs\\Orders');
        assert.strictEqual(projectFolder('Libs\\\\Orders\\'), 'Libs\\Orders');
    });

    test('a folder outside the solution, or one Windows cannot name, is refused', () => {
        for (const ok of ['', 'Orders', 'Libs\\Orders', 'Libs/Orders', 'My Orders']) assert.strictEqual(projectFolderError(ok), undefined, ok);
        for (const bad of ['C:\\Orders', 'C:Orders', '\\Orders', '/Orders', '\\\\server\\share']) assert.match(projectFolderError(bad) ?? '', /below the solution/, bad);
        for (const bad of ['..', '..\\Orders', 'Libs\\..\\..\\Orders', '.', 'Libs\\.\\Orders']) assert.match(projectFolderError(bad) ?? '', /below the solution/, bad);
        for (const bad of ['Ord*ers', 'Ord?ers', 'Ord"ers', 'Ord<ers', 'Ord|ers', 'Orders.', 'Orders \\X', 'Orders\\New\tLib', 'Ord\u0001ers', 'Libs\\Orders.\\X']) assert.match(projectFolderError(bad) ?? '', /invalid/, bad);
        for (const bad of ['CON', 'Libs\\nul', 'com1', 'LPT9.txt']) assert.match(projectFolderError(bad) ?? '', /reserved/, bad);
    });

    test('newProjectError checks the folder too', () => {
        assert.strictEqual(newProjectError('Orders', 'Orders.clw', [], 'Orders'), undefined);
        assert.match(newProjectError('Orders', 'Orders.clw', [], '..\\Orders') ?? '', /below the solution/);
    });

    test('the files go in the folder; the project names its sources from its own folder', () => {
        const files = newProjectFiles({ name: 'Orders', kind: 'dll', mainFile: 'Orders.clw', guid: '{33333333-3333-3333-3333-333333333333}', folder: 'Libs\\Orders' });
        assert.deepStrictEqual(files.map(f => f.path), ['Libs\\Orders\\Orders.cwproj', 'Libs\\Orders\\Orders.clw', 'Libs\\Orders\\Orders.exp']);
        assert.ok(files[0].content.includes('<Compile Include="Orders.clw" />'), 'relative to the .cwproj, not the .sln');
    });

    test('a .red beside the .sln does not reach a project in a sub-folder: the add says so', () => {
        // Clarion 10 MSBuild: a project reads the .red in its own folder, then bin's; one beside the .sln is not read.
        const has = (f: string) => f.replace(/\//g, '\\').toLowerCase() === 'c:\\s\\clarion100.red';
        assert.match(subfolderRedNote('C:\\S', 'Orders', 'Clarion100.red', has) ?? '', /Clarion100\.red beside the solution does not apply to Orders/);
        assert.strictEqual(subfolderRedNote('C:\\S', '', 'Clarion100.red', has), undefined, 'beside the .sln it does apply');
        assert.strictEqual(subfolderRedNote('C:\\S', 'Orders', 'Clarion100.red', () => false), undefined, 'no .red there');
        assert.strictEqual(subfolderRedNote('C:\\S', 'Orders', 'C:\\Clarion\\bin\\Clarion100.red', has), undefined, 'a full-path .red is read from there for every project (#765)');
        assert.strictEqual(subfolderRedNote('C:\\S', 'Orders', '', has), undefined);
    });

    test('no folder: beside the .sln, as before', () => {
        const files = newProjectFiles({ name: 'Orders', kind: 'exe', mainFile: 'Orders.clw', guid: '{33333333-3333-3333-3333-333333333333}' });
        assert.deepStrictEqual(files.map(f => f.path), ['Orders.cwproj', 'Orders.clw']);
    });
});

// The page and the host import vscode, so their wiring is pinned on the source.
const root = (() => {
    let dir = __dirname;
    while (dir !== path.dirname(dir)) {
        if (fs.existsSync(path.join(dir, 'package.json')) && fs.existsSync(path.join(dir, 'client'))) return dir;
        dir = path.dirname(dir);
    }
    throw new Error('project root not found');
})();
const panel = fs.readFileSync(path.join(root, 'client', 'src', 'solution', 'SolutionPanel.ts'), 'utf8');

suite('Solution Properties: the folder field and its writes (#796)', () => {
    test('the form has a Folder field, sent with Add and kept across a redraw', () => {
        assert.match(panel, /id: 'np-folder'/);
        assert.match(panel, /folder: folder\.value/);
        assert.match(panel, /\['np-name', 'np-kind', 'np-main', 'np-folder'\]/);
    });

    test('the host creates the folder, and removes what it created when the add fails', () => {
        const add = panel.slice(panel.indexOf('private async addNewProject('), panel.indexOf('private async addExistingProject('));
        assert.match(add, /mkdirSync\([^)]*recursive: true/);
        assert.match(add, /rmdirSync/);
        assert.match(add, /subfolderRedNote\(/);
    });
});
