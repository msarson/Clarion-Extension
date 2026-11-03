import * as assert from 'assert';
import { listItems, setItemMetadata } from '../project/CwprojItems';
import { buildPageState, editItems } from '../project/ProjectPropertiesPage';
import { SOURCE_PRAGMAS } from '../project/ProjectPropertyFields';

/**
 * #816 — a source's own pragmas. The Clarion IDE stores them as metadata on the source's Compile
 * item (its File Options: defines, vid, warnings, line_num, check_stack, check_index), and the
 * build task turns each into a #pragma for that file alone: `defines` is `name=>value;...` (a bare
 * name meaning on), written with &gt; and %3b; the others take the IDE's values, and Default is
 * no metadata at all.
 */
const PROJECT = [
    '<Project DefaultTargets="Build" xmlns="http://schemas.microsoft.com/developer/msbuild/2003">',
    '  <PropertyGroup>',
    '    <OutputType>Exe</OutputType>',
    '  </PropertyGroup>',
    '  <ItemGroup>',
    '    <Compile Include="Main.clw" />',
    '    <Compile Include="Main001.clw">',
    '      <defines>GENERATED=&gt;on%3bTRACE=&gt;1</defines>',
    '      <check_index>off</check_index>',
    '      <Generated>true</Generated>',
    '    </Compile>',
    '  </ItemGroup>',
    '</Project>',
].join('\r\n');

suite('Project Properties: a source\'s own pragmas (#816)', () => {
    test('the pragmas the build task reads from a Compile item, with the IDE\'s values', () => {
        assert.deepStrictEqual(SOURCE_PRAGMAS.map(p => p.name), ['defines', 'vid', 'warnings', 'line_num', 'check_stack', 'check_index']);
        const values = (name: string) => SOURCE_PRAGMAS.find(p => p.name === name)!.options;
        assert.deepStrictEqual(values('vid'), ['off', 'full', 'min']);
        assert.deepStrictEqual(values('warnings'), ['off', 'on', 'err']);
        assert.deepStrictEqual(values('check_index'), ['on', 'off']);
        assert.strictEqual(values('defines'), undefined);
    });

    test('a source\'s pragmas are read with it; one with none has none', () => {
        const compile = listItems(PROJECT).compile;
        assert.deepStrictEqual(compile.map(i => [i.include, i.generated, i.pragmas]), [
            ['Main.clw', false, {}],
            ['Main001.clw', true, { defines: 'GENERATED=>on;TRACE=>1', check_index: 'off' }],
        ]);
        assert.deepStrictEqual(buildPageState(PROJECT, 'Debug', undefined).sources.compile[1].pragmas, { defines: 'GENERATED=>on;TRACE=>1', check_index: 'off' });
    });

    test('setting a pragma on a source with none opens its element, written as the IDE writes it', () => {
        const next = setItemMetadata(PROJECT, 'Compile', 'main.clw', 'defines', 'X=>1;Y');
        assert.strictEqual(next, PROJECT.replace('    <Compile Include="Main.clw" />',
            '    <Compile Include="Main.clw">\r\n      <defines>X=&gt;1%3bY</defines>\r\n    </Compile>'));
        assert.deepStrictEqual(listItems(next).compile[0].pragmas, { defines: 'X=>1;Y' });
    });

    test('changing one replaces only its value; a new one goes after the others', () => {
        const changed = setItemMetadata(PROJECT, 'Compile', 'Main001.clw', 'check_index', 'on');
        assert.strictEqual(changed, PROJECT.replace('<check_index>off</check_index>', '<check_index>on</check_index>'));
        const added = setItemMetadata(PROJECT, 'Compile', 'Main001.clw', 'vid', 'full');
        assert.strictEqual(added, PROJECT.replace('      <Generated>true</Generated>\r\n', '      <Generated>true</Generated>\r\n      <vid>full</vid>\r\n'));
    });

    test('Default removes it; a source left with nothing goes back to one line', () => {
        const withDefines = setItemMetadata(PROJECT, 'Compile', 'Main.clw', 'defines', 'X=>1');
        assert.strictEqual(setItemMetadata(withDefines, 'Compile', 'Main.clw', 'defines', null), PROJECT);
        const noCheck = setItemMetadata(PROJECT, 'Compile', 'Main001.clw', 'check_index', null);
        assert.strictEqual(noCheck, PROJECT.replace('      <check_index>off</check_index>\r\n', ''));
        // A source not in the project, and one that has no such pragma to remove, are left alone.
        assert.strictEqual(setItemMetadata(PROJECT, 'Compile', 'Nope.clw', 'vid', 'full'), PROJECT);
        assert.strictEqual(setItemMetadata(PROJECT, 'Compile', 'Main.clw', 'vid', null), PROJECT);
    });

    test('the Sources tab\'s pragma message, and the ones it refuses', () => {
        const set = (name: string, pragma: string) => editItems(PROJECT, { type: 'setPragma', kind: 'Compile', value: 'Main.clw', name, pragma });
        assert.deepStrictEqual(listItems(set('check_stack', 'on')).compile[0].pragmas, { check_stack: 'on' });
        assert.deepStrictEqual(listItems(set('defines', '  A=>1 ')).compile[0].pragmas, { defines: 'A=>1' });
        assert.strictEqual(editItems(set('check_stack', 'on'), { type: 'setPragma', kind: 'Compile', value: 'Main.clw', name: 'check_stack', pragma: '' }), PROJECT);
        // A pragma the build does not read, a value it does not take, and an item that is no source change nothing.
        assert.strictEqual(set('Generated', 'true'), PROJECT);
        assert.strictEqual(set('vid', 'on'), PROJECT);
        assert.strictEqual(editItems(PROJECT, { type: 'setPragma', kind: 'Library', value: 'Main.clw', name: 'vid', pragma: 'full' }), PROJECT);
    });
});
