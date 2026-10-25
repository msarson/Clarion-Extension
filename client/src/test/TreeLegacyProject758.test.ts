import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { legacyProjectIncludes, legacyProjectSources, projectSourceFiles } from '../views/ProjectFolders';

/**
 * #758 — a project that includes a legacy .prj (Projects to include) compiles what its #compile
 * lines name. The Solution View lists a project's sources from its .cwproj, so it showed none of
 * them. The pure parts are tested here; the tree's wiring (it imports vscode) is pinned on the source.
 */
const cwproj = (items: string[]) => [
    '<Project DefaultTargets="Build" xmlns="http://schemas.microsoft.com/developer/msbuild/2003">',
    '  <ItemGroup>',
    ...items.map(i => '    ' + i),
    '  </ItemGroup>',
    '</Project>', ''].join('\r\n');

const root = (() => {
    let dir = __dirname;
    while (dir !== path.dirname(dir)) {
        if (fs.existsSync(path.join(dir, 'package.json')) && fs.existsSync(path.join(dir, 'client'))) return dir;
        dir = path.dirname(dir);
    }
    throw new Error('project root not found');
})();
const read = (file: string) => fs.readFileSync(path.join(root, 'client', 'src', ...file.split('/')), 'utf8');

suite('Solution View lists the sources of an included .prj (#758)', () => {
    test('the legacy project files a .cwproj includes, decoded, not other Include items', () => {
        assert.deepStrictEqual(legacyProjectIncludes(cwproj([
            '<Compile Include="Main.clw" />',
            '<Include Include="Sales.prj" />',
            '<Include Include="legacy\\My%20Old.PR" />',
            '<Include Include="notes.txt" />',
            '<Include Include="Notaprj" />',
        ])), ['Sales.prj', 'legacy\\My Old.PR']);
        assert.deepStrictEqual(legacyProjectIncludes(cwproj(['<Compile Include="Main.clw" />'])), []);
    });

    test('a .prj\'s Clarion sources, following its #include', () => {
        const files: Record<string, string> = { 'common.pi': "#set pfx = 'Mo'\r\n" };
        assert.deepStrictEqual(legacyProjectSources(
            '#include common.pi\r\n#compile Main.clw\r\n#compile %pfx%d.clw /define(x=>on)\r\n#compile Main.exp\r\n#compile Notaclw\r\n',
            file => files[file.toLowerCase()]),
            ['Main.clw', 'Mod.clw']);
    });

    test('the project\'s sources: its Compile items, then the .prj\'s, each once', () => {
        assert.deepStrictEqual(projectSourceFiles(cwproj(['<Compile Include="Main.clw" />']), ['MAIN.CLW', 'Mod.clw']), [
            { name: 'Main.clw', relativePath: 'Main.clw' },
            { name: 'Mod.clw', relativePath: 'Mod.clw' },
        ]);
    });

    test('wiring: the tree lists and stamps the included .prj\'s sources', () => {
        const tree = read('SolutionTreeDataProvider.ts');
        assert.match(tree, /legacyProjectIncludes\(/, 'the tree reads the Include items');
        assert.match(tree, /projectSourceFiles\(\s*[\w.]+\s*,\s*[\w.]+\s*\)/, 'the .prj sources reach the list');
        assert.match(tree, /_sourceStamps\.record\(\s*cwprojPath\s*,\s*\w+\.stamp\s*\)/, 'the stamp covers the .prj too');
        const cmds = read('commands/ProjectFolderCommands.ts');
        assert.match(cmds, /\\\.\(prj\|pr\|pi\)\$\/i\.test\(document\.uri\.fsPath\)\) solutionTreeDataProvider\?\.redraw\(\)/, 'saving a .prj redraws the tree');
    });
});
