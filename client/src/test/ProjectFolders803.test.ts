import * as assert from 'assert';
import { projectFolders, referenceCandidates } from '../views/ProjectFolders';

/**
 * #803 — the Solution View shows a project as the Clarion IDE's Solution Explorer does: File
 * Drivers, Libraries, Objects and Resource Files, Projects to include and Referenced Projects,
 * always, empty or not, then its sources. Each folder lists its .cwproj items.
 */
const cwproj = (items: string[]) => [
    '<Project DefaultTargets="Build" xmlns="http://schemas.microsoft.com/developer/msbuild/2003">',
    '  <PropertyGroup><ProjectGuid>{80300000-0000-0000-0000-000000000001}</ProjectGuid></PropertyGroup>',
    '  <ItemGroup>',
    '    <Compile Include="Sales.clw" />',
    ...items.map(i => '    ' + i),
    '  </ItemGroup>',
    '</Project>', ''].join('\r\n');

suite('Solution View: a project\'s IDE folders (#803)', () => {
    test('the four folders, in the IDE\'s order and words, even when empty', () => {
        const folders = projectFolders(cwproj([]));
        assert.deepStrictEqual(folders.map(f => [f.label, f.kind, f.entries.length]), [
            ['File Drivers', 'FileDriver', 0],
            ['Libraries, Objects and Resource Files', 'Library', 0],
            ['Projects to include', 'Include', 0],
            ['Referenced Projects', 'ProjectReference', 0],
        ]);
    });

    test('each folder lists its items: a file by name with its path beside it, a reference by its Name', () => {
        const folders = projectFolders(cwproj([
            '<FileDriver Include="TOPSPEED" />',
            '<Library Include="lib\\win32.lib" />',
            '<Library Include="Sales.manifest" />',
            '<Include Include="legacy\\classes.pr" />',
            '<ProjectReference Include="..\\Common\\Common.cwproj"><Project>{80300000-0000-0000-0000-000000000002}</Project><Name>Common</Name></ProjectReference>',
            '<ProjectReference Include="Util.cwproj"><Project>{80300000-0000-0000-0000-000000000003}</Project></ProjectReference>',
        ]));
        const entries = (i: number) => folders[i].entries.map(e => [e.label, e.description ?? '', e.include]);
        assert.deepStrictEqual(entries(0), [['TOPSPEED', '', 'TOPSPEED']]);
        assert.deepStrictEqual(entries(1), [['win32.lib', 'lib\\win32.lib', 'lib\\win32.lib'], ['Sales.manifest', '', 'Sales.manifest']]);
        assert.deepStrictEqual(entries(2), [['classes.pr', 'legacy\\classes.pr', 'legacy\\classes.pr']]);
        // With no <Name>, named from its path as the .sln names it (#802).
        assert.deepStrictEqual(entries(3), [['Common', '..\\Common\\Common.cwproj', '..\\Common\\Common.cwproj'], ['Util', 'Util.cwproj', 'Util.cwproj']]);
    });

    test('the projects a project can still reference: the others in the solution, by a path from its own folder', () => {
        const solution = [
            { name: 'Sales', guid: '{80300000-0000-0000-0000-000000000001}', cwproj: 'C:\\S\\Sales.cwproj' },
            { name: 'Common', guid: '{80300000-0000-0000-0000-000000000002}', cwproj: 'C:\\S\\Libs\\Common\\Common.cwproj' },
            { name: 'Util', guid: '{80300000-0000-0000-0000-000000000003}', cwproj: 'C:\\S\\Util.cwproj' },
        ];
        const text = cwproj(['<ProjectReference Include="Util.cwproj"><Project>{80300000-0000-0000-0000-000000000003}</Project><Name>Util</Name></ProjectReference>']);
        // Itself and the ones already referenced (by GUID, in any case or brace form) are not offered.
        assert.deepStrictEqual(referenceCandidates(text, 'C:\\S\\Sales.cwproj', solution), [
            { name: 'Common', guid: '{80300000-0000-0000-0000-000000000002}', include: 'Libs\\Common\\Common.cwproj' },
        ]);
    });
});
