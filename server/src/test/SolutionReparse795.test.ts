import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { SolutionManager } from '../solution/solutionManager';
import { serverSettings } from '../serverSettings';

/**
 * #795 — a .sln changed after it was loaded is read again when the solution is loaded again. A
 * project added from Solution Properties (or by the Clarion IDE, or by hand) never reached the
 * Solution View: `create()` reused the instance for the same .sln, parsed when it was first loaded.
 */
suite('A changed .sln is read again on the next load (#795)', () => {
    let tmpRoot: string, sln: string, savedSm: unknown, savedSlnPath: string, savedConfig: string;

    const cwproj = (guid: string) => [
        '<Project DefaultTargets="Build" xmlns="http://schemas.microsoft.com/developer/msbuild/2003">',
        `  <PropertyGroup><ProjectGuid>${guid}</ProjectGuid><OutputType>Exe</OutputType></PropertyGroup>`,
        '  <ItemGroup><Compile Include="main.clw" /></ItemGroup>',
        '</Project>',
        '',
    ].join('\r\n');
    const project = (name: string, guid: string) =>
        `Project("{12B76EC0-1D7B-4FA7-A7D0-C524288B48A1}") = "${name}", "${name}.cwproj", "${guid}"\r\nEndProject\r\n`;

    setup(() => {
        tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sln795-'));
        fs.writeFileSync(path.join(tmpRoot, 'main.clw'), '  PROGRAM\r\n  MAP\r\n  END\r\n  CODE\r\n');
        fs.writeFileSync(path.join(tmpRoot, 'Sales.cwproj'), cwproj('{79500000-0000-0000-0000-000000000001}'));
        fs.writeFileSync(path.join(tmpRoot, 'Orders.cwproj'), cwproj('{79500000-0000-0000-0000-000000000002}'));
        sln = path.join(tmpRoot, 'Sales.sln');
        fs.writeFileSync(sln, 'Microsoft Visual Studio Solution File, Format Version 12.00\r\n'
            + project('Sales', '{79500000-0000-0000-0000-000000000001}') + 'Global\r\nEndGlobal\r\n');
        savedSlnPath = serverSettings.solutionFilePath;
        savedConfig = serverSettings.configuration;
        serverSettings.solutionFilePath = sln;
        serverSettings.configuration = 'Debug';
        savedSm = (SolutionManager as unknown as { instance: unknown }).instance;
        (SolutionManager as unknown as { instance: unknown }).instance = null;
    });

    teardown(async () => {
        const { FileRelationshipGraph } = await import('../FileRelationshipGraph');
        FileRelationshipGraph.getInstance().reset();
        (SolutionManager as unknown as { instance: unknown }).instance = savedSm;
        serverSettings.solutionFilePath = savedSlnPath;
        serverSettings.configuration = savedConfig;
        try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch { /* best-effort */ }
    });

    const projectNames = () => SolutionManager.getInstance()!.getSolutionTree().projects.map(p => p.name);

    test('bug-pin: a project added to the .sln is there after the next load', async () => {
        await SolutionManager.create(sln);
        assert.deepStrictEqual(projectNames(), ['Sales']);

        const text = fs.readFileSync(sln, 'utf8').replace('Global\r\n', project('Orders', '{79500000-0000-0000-0000-000000000002}') + 'Global\r\n');
        fs.writeFileSync(sln, text);
        const later = new Date(Date.now() + 5000);
        fs.utimesSync(sln, later, later);

        await SolutionManager.create(sln);
        assert.deepStrictEqual(projectNames(), ['Sales', 'Orders']);
    });

    test('an unchanged .sln keeps the instance it was parsed into', async () => {
        const first = await SolutionManager.create(sln);
        assert.strictEqual(await SolutionManager.create(sln), first);
    });

    // #801 — a project's own file changed (a source added in the Clarion IDE or by hand) while the
    // .sln did not: the next load reused the old parse, so Refresh Solution never showed it.
    test('bug-pin: a .cwproj changed after loading is read again on the next load (#801)', async () => {
        const sources = () => SolutionManager.getInstance()!.solution.projects[0].sourceFiles.map(f => f.name);
        await SolutionManager.create(sln);
        assert.deepStrictEqual(sources(), ['main.clw']);

        fs.writeFileSync(path.join(tmpRoot, 'extra.clw'), '  MEMBER()\r\n');
        const proj = path.join(tmpRoot, 'Sales.cwproj');
        fs.writeFileSync(proj, fs.readFileSync(proj, 'utf8').replace('<Compile Include="main.clw" />', '<Compile Include="main.clw" /><Compile Include="extra.clw" />'));
        const later = new Date(Date.now() + 5000);
        fs.utimesSync(proj, later, later);

        await SolutionManager.create(sln);
        assert.deepStrictEqual(sources(), ['main.clw', 'extra.clw']);
    });

    // #801 review: a file copied in keeps its own, older time (Explorer, robocopy, a restore), and
    // the in-memory parse cache only treated a LATER time as a change, so it handed back the old parse.
    test('bug-pin: a .cwproj replaced by one with an older time is read again (#801)', async () => {
        const sources = () => SolutionManager.getInstance()!.solution.projects[0].sourceFiles.map(f => f.name);
        await SolutionManager.create(sln);
        assert.deepStrictEqual(sources(), ['main.clw']);

        fs.writeFileSync(path.join(tmpRoot, 'extra.clw'), '  MEMBER()\r\n');
        const proj = path.join(tmpRoot, 'Sales.cwproj');
        fs.writeFileSync(proj, fs.readFileSync(proj, 'utf8').replace('<Compile Include="main.clw" />', '<Compile Include="main.clw" /><Compile Include="extra.clw" />'));
        const earlier = new Date(Date.now() - 24 * 3600 * 1000);
        fs.utimesSync(proj, earlier, earlier);

        await SolutionManager.create(sln);
        assert.deepStrictEqual(sources(), ['main.clw', 'extra.clw']);
    });

    // #758 — a legacy .prj the project includes is one of its files too.
    test('bug-pin: an included .prj changed after loading is read again on the next load (#758)', async () => {
        const sources = () => SolutionManager.getInstance()!.solution.projects[0].sourceFiles.map(f => f.name);
        const proj = path.join(tmpRoot, 'Sales.cwproj');
        fs.writeFileSync(proj, fs.readFileSync(proj, 'utf8').replace('<Compile Include="main.clw" />', '<Include Include="Sales.prj" />'));
        fs.writeFileSync(path.join(tmpRoot, 'Sales.prj'), '#compile main.clw\r\n');
        fs.writeFileSync(path.join(tmpRoot, 'extra.clw'), '  MEMBER()\r\n');
        await SolutionManager.create(sln);
        assert.deepStrictEqual(sources(), ['main.clw']);

        fs.writeFileSync(path.join(tmpRoot, 'Sales.prj'), '#compile main.clw\r\n#compile extra.clw\r\n');
        const later = new Date(Date.now() + 5000);
        fs.utimesSync(path.join(tmpRoot, 'Sales.prj'), later, later);

        await SolutionManager.create(sln);
        assert.deepStrictEqual(sources(), ['main.clw', 'extra.clw']);
    });

    test('a project file that disappears also counts as a change (#801)', async () => {
        const first = await SolutionManager.create(sln);
        fs.rmSync(path.join(tmpRoot, 'Sales.cwproj'));
        assert.notStrictEqual(await SolutionManager.create(sln), first);
    });
});
