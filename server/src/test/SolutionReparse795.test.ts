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
});
