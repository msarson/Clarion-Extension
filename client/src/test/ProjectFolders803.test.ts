import * as assert from 'assert';
import { folderAddition, isProjectNodeData, projectFolders, referenceCandidates } from '../views/ProjectFolders';
import { listItems } from '../project/CwprojItems';

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

    // In VS Code the folders did not appear: a project node's data is the server's project info,
    // whose `type` is the .sln's project-type GUID, and a node with a `type` was taken for another kind.
    test('bug-pin: a project node is recognised by its data as the tree builds it', () => {
        const project = { name: 'App', type: '{12B76EC0-1D7B-4FA7-A7D0-C524288B48A1}', path: 'C:\\S', guid: '{02A68A67-DF57-4B65-80A6-4692962388F8}', filename: 'App.cwproj' };
        assert.ok(isProjectNodeData({ ...project, kind: 'project', projectId: project.guid, projectPath: project.path, projectName: project.name }), 'current form');
        assert.ok(isProjectNodeData(project), 'the older form: the project info alone');
        for (const other of [
            { type: 'projectFolder', section: 'fileDrivers', projectGuid: project.guid, cwproj: 'C:\\S\\App.cwproj' },
            { type: 'projectFolderItem', include: 'TOPSPEED', projectGuid: project.guid },
            { name: 'App.clw', relativePath: 'App.clw', uniqueId: 'x_App.clw' },
            { type: 'clarionApp', absolutePath: 'C:\\S\\App.app' },
            { type: 'retryProjectLoad' },
            undefined,
        ]) assert.ok(!isProjectNodeData(other), JSON.stringify(other));
    });

    test('an item listed twice is shown once, so two tree items never share an id', () => {
        const folders = projectFolders(cwproj(['<FileDriver Include="TOPSPEED" />', '<FileDriver Include="TopSpeed" />', '<Library Include="a.lib" />', '<Library Include="A.LIB" />']));
        assert.deepStrictEqual(folders[0].entries.map(e => e.include), ['TOPSPEED']);
        assert.deepStrictEqual(folders[1].entries.map(e => e.include), ['a.lib']);
    });

    test('Add on a folder: every pick goes in, a reference with its GUID and Name', () => {
        let text = folderAddition(cwproj([]), 'FileDriver', [{ include: 'TOPSPEED' }, { include: 'ODBC' }]);
        text = folderAddition(text, 'Include', [{ include: 'legacy\\classes.pr' }]);
        text = folderAddition(text, 'ProjectReference', [{ include: 'Libs\\Common\\Common.cwproj', guid: '{80300000-0000-0000-0000-000000000002}', name: 'Common' }]);
        const items = listItems(text);
        assert.deepStrictEqual(items.fileDrivers.map(i => i.include), ['TOPSPEED', 'ODBC']);
        assert.deepStrictEqual(items.includes.map(i => i.include), ['legacy\\classes.pr']);
        assert.deepStrictEqual(items.projectReferences.map(r => [r.include, r.name]), [['Libs\\Common\\Common.cwproj', 'Common']]);
        assert.match(text, /<Project>\{80300000-0000-0000-0000-000000000002\}<\/Project>/);
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
