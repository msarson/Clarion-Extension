import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ClarionProjectServer } from '../solution/clarionProjectServer';
import { SolutionManager } from '../solution/solutionManager';
import { serverSettings } from '../serverSettings';

/**
 * #758 — the help's way to build a legacy project from Clarion 7+ is a .cwproj that lists the
 * .prj under "Projects to include" (`<Include Include="x.prj" />`), with the sources as None items
 * or not at all. The extension never read the .prj, so no project owned those sources: the file's
 * own folder stood in for the project folder, and relative redirection resolved from the wrong
 * place. The .prj's #compile lines are now the project's sources.
 */
suite('A .cwproj\'s Projects to include: the .prj\'s sources are the project\'s (#758)', () => {
    let root: string;
    let savedRed: string;

    setup(() => {
        root = fs.mkdtempSync(path.join(os.tmpdir(), 'prj758-'));
        fs.mkdirSync(path.join(root, 'SRC'));
        fs.mkdirSync(path.join(root, 'Shared'));
        fs.writeFileSync(path.join(root, 'test.red'), '[Common]\r\n*.clw = SRC; Shared\r\n');
        fs.writeFileSync(path.join(root, 'SRC', 'Main.clw'), '  PROGRAM\r\n  MAP\r\n  END\r\n  CODE\r\n');
        fs.writeFileSync(path.join(root, 'SRC', 'Mod.clw'), '  MEMBER()\r\n');
        fs.writeFileSync(path.join(root, 'Shared', 'Init.clw'), '  MEMBER()\r\n');
        savedRed = serverSettings.redirectionFile;
        serverSettings.redirectionFile = 'test.red';
    });
    teardown(() => {
        serverSettings.redirectionFile = savedRed;
        try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* best-effort */ }
    });

    const prj = (text: string, name = 'Proj.prj') => fs.writeFileSync(path.join(root, name), text);
    const load = async (items: string[]) => {
        fs.writeFileSync(path.join(root, 'Proj.cwproj'), [
            '<Project DefaultTargets="Build" xmlns="http://schemas.microsoft.com/developer/msbuild/2003">',
            '  <PropertyGroup><ProjectGuid>{75800000-0000-0000-0000-000000000001}</ProjectGuid></PropertyGroup>',
            '  <ItemGroup>',
            ...items.map(i => '    ' + i),
            '  </ItemGroup>',
            '</Project>', ''].join('\r\n'));
        const project = new ClarionProjectServer('Proj', '{12B76EC0-1D7B-4FA7-A7D0-C524288B48A1}', root, '{75800000-0000-0000-0000-000000000001}');
        await project.loadSourceFilesFromProjectFile();
        return project;
    };
    const names = (p: ClarionProjectServer) => p.sourceFiles.map(f => f.name);

    test('bug-pin: the .prj\'s #compile sources are the project\'s, found through its redirection', async () => {
        prj([
            '#noedit',
            '#system win32',
            '#model clarion dll',
            '#include missing.pi',
            '#pragma define(maincode=>off)',
            '#compile "Main.clw"',
            '#compile "Mod.clw"',
            '#compile "Init.clw" /define(_STD_DLL_INIT_=>on)',
            '#compile "Proj.exp"',
            '#link "Proj.dll"',
        ].join('\r\n'));
        const project = await load([
            '<Include Include="Proj.prj" />',
            '<None Include="SRC\\Main.clw" />',
        ]);
        assert.deepStrictEqual(names(project), ['Main.clw', 'Mod.clw', 'Init.clw'], 'Clarion sources only: not the .exp');
        assert.deepStrictEqual(project.sourceFiles.map(f => f.relativePath),
            [path.join('SRC', 'Main.clw'), path.join('SRC', 'Mod.clw'), path.join('Shared', 'Init.clw')]);
        assert.deepStrictEqual(project.legacyProjects.map(l => ({ file: l.file, found: l.found })), [{ file: 'Proj.prj', found: true }]);
        assert.deepStrictEqual(project.legacyProjects[0].defines, { maincode: 'off' });
    });

    test('a source both a Compile item and the .prj name is listed once', async () => {
        prj('#compile Main.clw\r\n#compile Mod.clw\r\n');
        const project = await load(['<Compile Include="Main.clw" />', '<Include Include="Proj.prj" />']);
        assert.deepStrictEqual(names(project), ['Main.clw', 'Mod.clw']);
    });

    test('a .pr in a sub-folder, and its #include of a .pi beside it', async () => {
        fs.mkdirSync(path.join(root, 'prj'));
        prj("#set pfx = 'Mo'\r\n", path.join('prj', 'common.pi'));
        prj('#include common.pi\r\n#compile %pfx%d.clw\r\n', path.join('prj', 'Legacy.pr'));
        const project = await load(['<Include Include="prj\\Legacy.pr" />']);
        assert.deepStrictEqual(names(project), ['Mod.clw']);
        assert.deepStrictEqual(project.legacyProjects[0].includes, [{ file: 'common.pi', found: true }]);
    });

    test('a .prj that is not there leaves the project as it was', async () => {
        const project = await load(['<Compile Include="Main.clw" />', '<Include Include="Gone.prj" />']);
        assert.deepStrictEqual(names(project), ['Main.clw']);
        assert.deepStrictEqual(project.legacyProjects.map(l => ({ file: l.file, found: l.found })), [{ file: 'Gone.prj', found: false }]);
    });

    test('bug-pin: a source the .prj compiles belongs to the project, so its folder is the project\'s', async () => {
        prj('#compile Main.clw\r\n#compile Mod.clw\r\n');
        const project = await load(['<Include Include="Proj.prj" />']);
        const sm = Object.create(SolutionManager.prototype) as SolutionManager;
        (sm as unknown as { solution: { projects: ClarionProjectServer[] } }).solution = { projects: [project] };
        const modPath = path.join(root, 'SRC', 'Mod.clw');
        assert.strictEqual(sm.findProjectForFile(modPath), project);
        assert.strictEqual(sm.getProjectPathForFile(modPath), root, 'not SRC: relative redirection resolves from here');
    });

    // Review of #758: the same Include items as the Solution View, and every file read is watched.
    test('only a .prj or .pr under Projects to include is read as a legacy project', async () => {
        prj('#compile Mod.clw\r\n', 'Other.pi');
        prj('#compile Mod.clw\r\n', 'Notaprj');
        const project = await load(['<Compile Include="Main.clw" />', '<Include Include="Other.pi" />', '<Include Include="Notaprj" />']);
        assert.deepStrictEqual(names(project), ['Main.clw']);
        assert.deepStrictEqual(project.legacyProjects, []);
    });

    test('the files to watch: the .prj, what it #includes, and a .prj not there yet', async () => {
        prj("#set x = 'Mo'\r\n", 'common.pi');
        prj('#include common.pi\r\n#compile %x%d.clw\r\n');
        const project = await load(['<Include Include="Proj.prj" />', '<Include Include="Later.prj" />']);
        assert.deepStrictEqual(project.legacyProjects.flatMap(l => l.watch).map(p => path.basename(p)), ['Proj.prj', 'common.pi', 'Later.prj']);
    });

    test('a reload reads the .prj again', async () => {
        prj('#compile Main.clw\r\n');
        const project = await load(['<Include Include="Proj.prj" />']);
        assert.deepStrictEqual(names(project), ['Main.clw']);
        prj('#compile Main.clw\r\n#compile Mod.clw\r\n');
        await project.reloadSourceFiles();
        assert.deepStrictEqual(names(project), ['Main.clw', 'Mod.clw']);
        assert.strictEqual(project.legacyProjects.length, 1);
    });
});
