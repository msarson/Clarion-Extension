import * as assert from 'assert';
import { addItem, listItems, removeItem } from '../project/CwprojItems';

/**
 * #803 — the Solution View shows each project's folders as the Clarion IDE does. "Projects to
 * include" is the IDE's name for `<Include Include="x.pr" />`: a legacy TopSpeed project pulled
 * into the build (the help's conversion FAQ suggests it instead of converting). A project
 * reference added from the Solution View carries the referenced project's GUID and Name, as the
 * IDE writes it.
 */
const PROJECT = [
    '<Project DefaultTargets="Build" xmlns="http://schemas.microsoft.com/developer/msbuild/2003">',
    '  <PropertyGroup>',
    '    <ProjectGuid>{80300000-0000-0000-0000-000000000001}</ProjectGuid>',
    '  </PropertyGroup>',
    '  <ItemGroup>',
    '    <Compile Include="Sales.clw" />',
    '    <Include Include="classes.pr" />',
    '  </ItemGroup>',
    '</Project>',
    '',
].join('\r\n');

suite('Projects to include and references with their GUID (#803)', () => {
    test('Include items are listed as projects to include', () => {
        assert.deepStrictEqual(listItems(PROJECT).includes.map(i => i.include), ['classes.pr']);
    });

    test('an Include item is added after the last one and removed again', () => {
        const added = addItem(PROJECT, 'Include', 'legacy\\old.prj');
        assert.deepStrictEqual(listItems(added).includes.map(i => i.include), ['classes.pr', 'legacy\\old.prj']);
        assert.match(added, /    <Include Include="classes.pr" \/>\r\n    <Include Include="legacy\\old.prj" \/>\r\n/);
        assert.strictEqual(removeItem(added, 'Include', 'legacy\\old.prj'), PROJECT);
    });

    test('a reference is added with its project GUID and name, as the IDE writes it', () => {
        const added = addItem(PROJECT, 'ProjectReference', 'Lib.cwproj', [['Project', '{80300000-0000-0000-0000-000000000002}'], ['Name', 'Lib']]);
        const refs = listItems(added).projectReferences;
        assert.deepStrictEqual(refs.map(r => [r.include, r.name]), [['Lib.cwproj', 'Lib']]);
        assert.match(added, /  <ItemGroup>\r\n    <ProjectReference Include="Lib.cwproj">\r\n      <Project>\{80300000-0000-0000-0000-000000000002\}<\/Project>\r\n      <Name>Lib<\/Name>\r\n    <\/ProjectReference>\r\n  <\/ItemGroup>\r\n/);
        assert.strictEqual(removeItem(added, 'ProjectReference', 'Lib.cwproj'), PROJECT);
    });

    test('a second reference goes after the first, children and all', () => {
        let text = addItem(PROJECT, 'ProjectReference', 'Lib.cwproj', [['Project', '{80300000-0000-0000-0000-000000000002}'], ['Name', 'Lib']]);
        text = addItem(text, 'ProjectReference', 'Util.cwproj', [['Project', '{80300000-0000-0000-0000-000000000003}'], ['Name', 'Util']]);
        assert.deepStrictEqual(listItems(text).projectReferences.map(r => r.name), ['Lib', 'Util']);
        assert.match(text, /<\/ProjectReference>\r\n    <ProjectReference Include="Util.cwproj">\r\n      <Project>/);
    });

    test('a child value is escaped like a property', () => {
        const added = addItem(PROJECT, 'ProjectReference', 'A&B.cwproj', [['Project', '{80300000-0000-0000-0000-000000000004}'], ['Name', 'A&B']]);
        assert.match(added, /<Name>A&amp;B<\/Name>/);
        assert.deepStrictEqual(listItems(added).projectReferences.map(r => r.name), ['A&B']);
    });
});
