import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { buildSolutionPageState, SolutionPageInput } from '../solution/SolutionPage';

/**
 * #800 — since #796 a project can sit in a sub-folder, so the pages say where each one is:
 * Solution Properties shows each project's path from the solution's folder, and Project
 * Properties shows the .cwproj's full path as Solution Properties shows the .sln's.
 */
const input = (projects: SolutionPageInput['projects']): SolutionPageInput => ({
    mode: 'properties',
    solutionFile: 'C:\\Apps\\Sales\\Sales.sln',
    installations: [],
    choice: {},
    configurations: ['Debug|Win32'],
    projects,
});

suite('Property pages show where each project is (#800)', () => {
    test('each project on Solution Properties shows its path from the solution\'s folder', () => {
        const state = buildSolutionPageState(input([
            { name: 'Sales', guid: '{11111111-1111-1111-1111-111111111111}', cwproj: 'C:\\Apps\\Sales\\Sales.cwproj', kind: 'EXE', references: [] },
            { name: 'Orders', guid: '{22222222-2222-2222-2222-222222222222}', cwproj: 'C:\\Apps\\Sales\\apps\\orders\\Orders.cwproj', kind: 'EXE', references: [] },
            // Outside the solution's folder, or on another drive: the full path, not a ..\ chain.
            { name: 'Shared', guid: '{33333333-3333-3333-3333-333333333333}', cwproj: 'C:\\Apps\\Shared\\Shared.cwproj', kind: 'DLL', references: [] },
            { name: 'Far', guid: '{44444444-4444-4444-4444-444444444444}', cwproj: 'D:\\Libs\\Far.cwproj', kind: 'DLL', references: [] },
        ]));
        assert.deepStrictEqual(state.projects.map(p => p.location), [
            'Sales.cwproj', 'apps\\orders\\Orders.cwproj', 'C:\\Apps\\Shared\\Shared.cwproj', 'D:\\Libs\\Far.cwproj',
        ]);
    });
});

// The pages import vscode, so their wiring is pinned on the source.
const root = (() => {
    let dir = __dirname;
    while (dir !== path.dirname(dir)) {
        if (fs.existsSync(path.join(dir, 'package.json')) && fs.existsSync(path.join(dir, 'client'))) return dir;
        dir = path.dirname(dir);
    }
    throw new Error('project root not found');
})();
const read = (file: string) => fs.readFileSync(path.join(root, 'client', 'src', ...file.split('/')), 'utf8');

suite('Property pages show where each project is: the pages (#800)', () => {
    test('the Projects table shows each location', () => {
        assert.match(read('solution/SolutionPanel.ts'), /p\.location/);
    });

    test('Project Properties is sent the .cwproj\'s full path and shows it first, as Solution Properties shows the .sln', () => {
        const editor = read('project/ProjectPropertiesEditor.ts');
        assert.match(editor, /file: document\.uri\.fsPath/);
        assert.match(editor, /getElementById\('sub'\)\.textContent = state\.file \+ ' · ' \+ state\.kind \+ ' project'/);
    });
});
