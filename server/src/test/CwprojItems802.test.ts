import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ClarionProjectServer } from '../solution/clarionProjectServer';

/**
 * #802 — the project read parses the .cwproj with tag names folded to lower case, but attribute
 * names stay as written: `Include`. The FileDriver, Library and None branches read `include` only,
 * so those lists were always empty; a ProjectReference with no <Name> could not fall back to its
 * path either. Compile items read both spellings and were never affected.
 */
suite('A .cwproj is read in full: drivers, libraries, None items and references (#802)', () => {
    let root: string;

    setup(() => {
        root = fs.mkdtempSync(path.join(os.tmpdir(), 'cwproj802-'));
        fs.writeFileSync(path.join(root, 'main.clw'), '  PROGRAM\r\n  CODE\r\n');
    });
    teardown(() => { try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* best-effort */ } });

    const load = async (items: string[]) => {
        fs.writeFileSync(path.join(root, 'Sales.cwproj'), [
            '<Project DefaultTargets="Build" xmlns="http://schemas.microsoft.com/developer/msbuild/2003">',
            '  <PropertyGroup><ProjectGuid>{80200000-0000-0000-0000-000000000001}</ProjectGuid></PropertyGroup>',
            '  <ItemGroup>',
            '    <Compile Include="main.clw" />',
            ...items.map(i => '    ' + i),
            '  </ItemGroup>',
            '</Project>', ''].join('\r\n'));
        const project = new ClarionProjectServer('Sales', '{12B76EC0-1D7B-4FA7-A7D0-C524288B48A1}', root, '{80200000-0000-0000-0000-000000000001}');
        await project.loadSourceFilesFromProjectFile();
        return project;
    };

    test('bug-pin: FileDriver, Library and None items are read', async () => {
        const project = await load([
            '<FileDriver Include="TOPSPEED" />',
            '<FileDriver Include="ODBC" />',
            '<Library Include="ClaRUN.lib" />',
            '<None Include="notes.txt" />',
        ]);
        assert.deepStrictEqual(project.sourceFiles.map(f => f.name), ['main.clw']);
        assert.deepStrictEqual(project.fileDrivers, ['TOPSPEED', 'ODBC']);
        assert.deepStrictEqual(project.libraries, ['ClaRUN.lib']);
        assert.deepStrictEqual(project.noneFiles, ['notes.txt']);
    });

    test('a single item of a kind is read too (xml2js gives an object, not an array)', async () => {
        const project = await load(['<Library Include="Only.lib" />']);
        assert.deepStrictEqual(project.libraries, ['Only.lib']);
    });

    test('bug-pin: a ProjectReference without <Name> is named from its path', async () => {
        const project = await load([
            '<ProjectReference Include="lib\\Common.cwproj"><Project>{80200000-0000-0000-0000-000000000002}</Project></ProjectReference>',
            '<ProjectReference Include="Util.cwproj"><Project>{80200000-0000-0000-0000-000000000003}</Project><Name>Util</Name></ProjectReference>',
        ]);
        assert.deepStrictEqual(project.projectReferences.map(r => r.name), ['Common', 'Util']);
    });
});
