import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { isSolutionProjectFile, projectSourceFiles, ProjectSourceStamps } from '../views/ProjectFolders';

/**
 * #810 — a source removed (or added) on the Project Properties page and saved stayed in the
 * Solution View until the solution was reloaded. The tree keeps a project's source nodes across
 * redraws and refreshes (#296, #297), so nothing that redrew it read the .cwproj again, and the
 * page's edits are saved by the user, so nothing redrew it at all. The pure parts are tested here;
 * the wiring (the tree and the save hook import vscode) is pinned on the source.
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

suite('Solution View follows a .cwproj saved from Project Properties (#810)', () => {
    test('a project\'s sources are its Compile items, by name and path', () => {
        assert.deepStrictEqual(projectSourceFiles(cwproj(['<Compile Include="Sales.clw" />', '<Compile Include="sub\\Report.clw" />'])), [
            { name: 'Sales.clw', relativePath: 'Sales.clw' },
            { name: 'Report.clw', relativePath: 'sub\\Report.clw' },
        ]);
    });

    test('a project whose last source was removed has none, not the list from before', () => {
        // An empty list fell back to the server, whose parse is the one made when the solution loaded.
        assert.deepStrictEqual(projectSourceFiles(cwproj(['<FileDriver Include="TOPSPEED" />'])), []);
    });

    test('the sources shown are stale once the .cwproj holds other text', () => {
        const stamps = new ProjectSourceStamps();
        const file = 'C:\\Sol\\Sales\\Sales.cwproj';
        const before = cwproj(['<Compile Include="Sales.clw" />', '<Compile Include="Old.clw" />']);
        stamps.record(file, before);
        assert.strictEqual(stamps.stale(file, before), false, 'the same text');
        assert.strictEqual(stamps.stale(file.toLowerCase(), before), false, 'a path spelled in another case');
        assert.strictEqual(stamps.stale(file, cwproj(['<Compile Include="Sales.clw" />'])), true, 'a source removed');
        assert.strictEqual(stamps.stale(file, null), false, 'an unreadable file keeps what is shown');
        assert.strictEqual(stamps.stale('C:\\Sol\\Other\\Other.cwproj', before), true, 'sources never read from the file');
    });

    test('a saved .cwproj redraws the tree only when it is one of the solution\'s projects', () => {
        const projects = [{ path: 'C:\\Sol\\Sales', filename: 'Sales.cwproj' }, { path: 'C:\\Sol\\Lib', filename: 'Lib.cwproj' }];
        assert.strictEqual(isSolutionProjectFile('C:\\Sol\\Sales\\Sales.cwproj', projects), true);
        assert.strictEqual(isSolutionProjectFile('c:\\sol\\lib\\LIB.CWPROJ', projects), true);
        assert.strictEqual(isSolutionProjectFile('C:\\Elsewhere\\Sales.cwproj', projects), false);
        assert.strictEqual(isSolutionProjectFile('C:\\Sol\\Sales\\Sales.clw', projects), false);
        assert.strictEqual(isSolutionProjectFile('C:\\Sol\\Sales\\Sales.cwproj', []), false);
    });

    test('the tree reads a project\'s sources again when its .cwproj changed', () => {
        const tree = read('SolutionTreeDataProvider.ts');
        const inner = tree.slice(tree.indexOf('private async getChildrenInner('), tree.indexOf("else if (element.data && (element.data as any).guid)"));
        assert.match(inner, /element\.children\.length > 0 && !this\.sourcesStale\(projectData\)/);
        const local = tree.slice(tree.indexOf('private parseProjectFilesLocally('), tree.indexOf('private fetchProjectFiles('));
        // #758: the content and the stamp now come with the included .prj files' sources and text.
        assert.match(local, /projectSourceFiles\(project\.content, project\.legacySources\)/);
        assert.match(local, /this\._sourceStamps\.record\(cwprojPath, project\.stamp\)/);
        assert.doesNotMatch(local, /files\.length > 0 \? \{ files \} : null/);
    });

    test('saving one of the solution\'s .cwproj files redraws the tree, once, for every way it was edited', () => {
        const cmds = read('commands/ProjectFolderCommands.ts');
        assert.match(cmds, /workspace\.onDidSaveTextDocument\(/);
        assert.match(cmds, /isSolutionProjectFile\(document\.uri\.fsPath, /);
        // The IDE folder commands save, so the hook redraws for them as well: they no longer do it twice.
        const edit = cmds.slice(cmds.indexOf('const edit = async'), cmds.indexOf('const picksFor'));
        assert.doesNotMatch(edit, /redraw\(\)/);
    });
});
