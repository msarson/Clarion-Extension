import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { addItem, includeFor, ItemKind, listItems, removeItem } from '../project/CwprojItems';

/**
 * #792 stage 2 — the Sources tab reads and edits a .cwproj's items: the compiled sources, the
 * project references, the file drivers and the libraries. Items are not per configuration. An
 * edit changes only the lines it must (a removed item takes its line, and its group when that
 * empties), commented-out XML is not project data, and an Include round-trips its XML and
 * MSBuild escaping.
 */
const PROJECT = [
    '<Project DefaultTargets="Build" xmlns="http://schemas.microsoft.com/developer/msbuild/2003">',
    '  <PropertyGroup>',
    '    <OutputType>Exe</OutputType>',
    '    <OutputName>Sales</OutputName>',
    '  </PropertyGroup>',
    '  <ItemGroup>',
    '    <FileDriver Include="TOPSPEED" />',
    '    <FileDriver Include="ASCII" />',
    '    <Library Include="win32.lib" />',
    '  </ItemGroup>',
    '  <ItemGroup>',
    '    <Compile Include="Sales.clw" />',
    '    <Compile Include="Sales001.clw">',
    '      <Generated>true</Generated>',
    '    </Compile>',
    '    <!-- <Compile Include="Old.clw" /> -->',
    '  </ItemGroup>',
    '  <ItemGroup>',
    '    <ProjectReference Include="..\\Common\\Common.cwproj">',
    '      <Project>{11111111-2222-3333-4444-555555555555}</Project>',
    '      <Name>Common</Name>',
    '    </ProjectReference>',
    '  </ItemGroup>',
    '  <Import Project="$(ClarionBinPath)\\SoftVelocity.Build.Clarion.targets" />',
    '</Project>',
].join('\r\n');

const NO_ITEMS = [
    '<Project DefaultTargets="Build" xmlns="http://schemas.microsoft.com/developer/msbuild/2003">',
    '  <PropertyGroup>',
    '    <OutputName>Tools</OutputName>',
    '  </PropertyGroup>',
    '</Project>',
].join('\r\n');

const lines = (text: string) => text.split('\r\n');

suite('Project Properties: a .cwproj\'s items, the Sources tab (#792)', () => {
    test('the four lists, with the Generated marker and a reference\'s name', () => {
        const items = listItems(PROJECT);
        assert.deepStrictEqual(items.compile.map(i => [i.include, i.generated]), [['Sales.clw', false], ['Sales001.clw', true]]);
        assert.deepStrictEqual(items.projectReferences.map(i => [i.include, i.name]), [['..\\Common\\Common.cwproj', 'Common']]);
        assert.deepStrictEqual(items.fileDrivers.map(i => i.include), ['TOPSPEED', 'ASCII']);
        assert.deepStrictEqual(items.libraries.map(i => i.include), ['win32.lib']);
    });

    test('commented-out items are not project data', () => {
        assert.ok(!listItems(PROJECT).compile.some(i => i.include === 'Old.clw'));
        const commented = PROJECT.replace('<FileDriver Include="ASCII" />', '<!-- <FileDriver Include="ASCII" /> -->');
        assert.deepStrictEqual(listItems(commented).fileDrivers.map(i => i.include), ['TOPSPEED']);
        // Removing a commented-out item changes nothing.
        assert.strictEqual(removeItem(PROJECT, 'Compile', 'Old.clw'), PROJECT);
    });

    test('an added item goes after the last of its kind in the first group holding that kind', () => {
        const next = addItem(PROJECT, 'FileDriver', 'MSSQL');
        const at = lines(next).indexOf('    <FileDriver Include="MSSQL" />');
        assert.strictEqual(lines(next)[at - 1], '    <FileDriver Include="ASCII" />');
        assert.strictEqual(lines(next).length, lines(PROJECT).length + 1);
        assert.deepStrictEqual(listItems(next).fileDrivers.map(i => i.include), ['TOPSPEED', 'ASCII', 'MSSQL']);
        // A source goes after the generated one, past its children.
        const src = lines(addItem(PROJECT, 'Compile', 'Sales002.clw'));
        assert.strictEqual(src[src.indexOf('    <Compile Include="Sales002.clw" />') - 1], '    </Compile>');
    });

    test('a kind the project has no group for gets a new group after the last item group', () => {
        const withGroup = addItem(PROJECT.replace('    <Library Include="win32.lib" />\r\n', ''), 'Library', 'Tools.lib');
        const l = lines(withGroup);
        const at = l.indexOf('    <Library Include="Tools.lib" />');
        assert.deepStrictEqual(l.slice(at - 1, at + 2), ['  <ItemGroup>', '    <Library Include="Tools.lib" />', '  </ItemGroup>']);
        assert.strictEqual(l[at - 2], '  </ItemGroup>');
        assert.strictEqual(l[at + 2], '  <Import Project="$(ClarionBinPath)\\SoftVelocity.Build.Clarion.targets" />');
        // A project without item groups gets one before </Project>.
        const fresh = lines(addItem(NO_ITEMS, 'Compile', 'Tools.clw'));
        assert.deepStrictEqual(fresh.slice(-4), ['  <ItemGroup>', '    <Compile Include="Tools.clw" />', '  </ItemGroup>', '</Project>']);
    });

    test('adding an item already there, in any case, changes nothing', () => {
        assert.strictEqual(addItem(PROJECT, 'FileDriver', 'topspeed'), PROJECT);
    });

    test('a removed item takes its line', () => {
        const next = removeItem(PROJECT, 'FileDriver', 'ASCII');
        assert.strictEqual(next, PROJECT.replace('    <FileDriver Include="ASCII" />\r\n', ''));
    });

    test('a removed item with children takes them with it', () => {
        const next = removeItem(PROJECT, 'Compile', 'Sales001.clw');
        assert.strictEqual(next, PROJECT.replace('    <Compile Include="Sales001.clw">\r\n      <Generated>true</Generated>\r\n    </Compile>\r\n', ''));
    });

    test('an item sharing its line with another removes only its element', () => {
        const shared = PROJECT.replace('    <FileDriver Include="TOPSPEED" />\r\n    <FileDriver Include="ASCII" />',
            '    <FileDriver Include="TOPSPEED" /><FileDriver Include="ASCII" />');
        assert.strictEqual(removeItem(shared, 'FileDriver', 'ASCII'), shared.replace('<FileDriver Include="ASCII" />', ''));
        assert.strictEqual(removeItem(shared, 'FileDriver', 'TOPSPEED'), shared.replace('<FileDriver Include="TOPSPEED" />', ''));
    });

    test('a group the removal empties goes too', () => {
        const next = removeItem(PROJECT, 'ProjectReference', '..\\Common\\Common.cwproj');
        assert.ok(!next.includes('ProjectReference'));
        assert.strictEqual(next, PROJECT.replace(/  <ItemGroup>\r\n    <ProjectReference[^]*?<\/ItemGroup>\r\n/, ''));
    });

    test('a group left with only a comment keeps it', () => {
        const once = removeItem(removeItem(PROJECT, 'Compile', 'Sales.clw'), 'Compile', 'Sales001.clw');
        assert.ok(once.includes('<!-- <Compile Include="Old.clw" /> -->'));
    });

    test('remove matches the Include case-insensitively', () => {
        assert.strictEqual(removeItem(PROJECT, 'Library', 'WIN32.LIB'), PROJECT.replace('    <Library Include="win32.lib" />\r\n', ''));
    });

    test('removing an item that is not there leaves the text byte-identical', () => {
        assert.strictEqual(removeItem(PROJECT, 'FileDriver', 'MSSQL'), PROJECT);
        assert.strictEqual(removeItem(PROJECT, 'Library', 'TOPSPEED'), PROJECT);
    });

    test('an Include round-trips its XML and MSBuild escaping', () => {
        // `;` and a `%` before two hex digits are MSBuild escapes; `&`, `<`, `>` and the quote are XML's.
        const odd = 'R&D;50%41"Q".clw';
        const next = addItem(PROJECT, 'Compile', odd);
        assert.ok(next.includes('<Compile Include="R&amp;D%3b50%2541&quot;Q&quot;.clw" />'), next);
        assert.ok(listItems(next).compile.some(i => i.include === odd));
        assert.strictEqual(removeItem(next, 'Compile', odd), PROJECT);
        const escaped = PROJECT.replace('win32.lib', 'a%3bb &amp; c.lib');
        assert.deepStrictEqual(listItems(escaped).libraries.map(i => i.include), ['a;b & c.lib']);
    });

    test('a new source\'s Include is relative to the project folder', () => {
        assert.strictEqual(includeFor('C:\\Apps\\Sales', 'C:\\Apps\\Sales\\Sales002.clw'), 'Sales002.clw');
        assert.strictEqual(includeFor('C:\\Apps\\Sales', 'C:\\Apps\\Sales\\src\\Extra.clw'), 'src\\Extra.clw');
        assert.strictEqual(includeFor('C:\\Apps\\Sales', 'C:\\Apps\\Common\\Shared.clw'), '..\\Common\\Shared.clw');
    });

    test('every .cwproj under test-programs lists, and add then remove gives it back byte for byte', () => {
        const root = path.resolve(__dirname, '../../../../test-programs');
        const found: string[] = [];
        const walk = (dir: string) => {
            for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
                const p = path.join(dir, e.name);
                if (e.isDirectory()) walk(p); else if (/\.cwproj$/i.test(e.name)) found.push(p);
            }
        };
        walk(root);
        assert.ok(found.length > 0, 'test-programs holds .cwproj files');
        const kinds: ItemKind[] = ['Compile', 'ProjectReference', 'FileDriver', 'Library'];
        for (const file of found) {
            const text = fs.readFileSync(file, 'utf8');
            const items = listItems(text);
            assert.ok(items.compile.length > 0, `${file} lists its sources`);
            for (const kind of kinds) {
                const added = addItem(text, kind, 'RoundTrip.x');
                assert.notStrictEqual(added, text);
                assert.strictEqual(removeItem(added, kind, 'RoundTrip.x'), text, `${file} ${kind}`);
            }
            for (const c of items.compile) {
                const without = removeItem(text, 'Compile', c.include);
                assert.ok(!listItems(without).compile.some(i => i.include === c.include), `${file} removes ${c.include}`);
            }
        }
        console.log(`      round-tripped ${found.length} .cwproj files`);
    });
});
