import * as assert from 'assert';
import { configurationsOf, readProperty, setProperty, setPropertyScope } from '../project/CwprojProperties';

/**
 * #792 stage 1 — the Project Properties page reads and writes a .cwproj's properties the way the
 * Clarion IDE does: a value applies to all configurations (the unconditional PropertyGroup) or to
 * one (the `'$(Configuration)' == 'Debug'` group). Edits change only the lines they must, so the
 * file keeps its layout, and values round-trip their XML and MSBuild escaping (the IDE writes
 * DefineConstants as `_ABCDllMode_=&gt;0%3b...`).
 */
const PROJECT = [
    '<Project DefaultTargets="Build" xmlns="http://schemas.microsoft.com/developer/msbuild/2003">',
    '  <PropertyGroup>',
    '    <ProjectGuid>{8921C8ED-59EB-6367-061C-8BCA2E3455FC}</ProjectGuid>',
    "    <Configuration Condition=\" '$(Configuration)' == '' \">Debug</Configuration>",
    '    <OutputType>Exe</OutputType>',
    '    <OutputName>Sales</OutputName>',
    '    <DefineConstants>_ABCDllMode_=&gt;0%3b_ABCLinkMode_=&gt;1</DefineConstants>',
    '  </PropertyGroup>',
    "  <PropertyGroup Condition=\" '$(Configuration)' == 'Debug' \">",
    '    <DebugSymbols>True</DebugSymbols>',
    '    <vid>full</vid>',
    '  </PropertyGroup>',
    "  <PropertyGroup Condition=\" '$(Configuration)' == 'Release' \">",
    '    <DebugSymbols>False</DebugSymbols>',
    '    <vid>off</vid>',
    '  </PropertyGroup>',
    '  <ItemGroup>',
    '    <Compile Include="Sales.clw" />',
    '  </ItemGroup>',
    '</Project>',
].join('\r\n');

suite('Project Properties: reading and writing .cwproj properties (#792)', () => {
    test('the configurations a project defines', () => {
        assert.deepStrictEqual(configurationsOf(PROJECT), ['Debug', 'Release']);
    });

    test('a value applies to all configurations, to one, or is not set', () => {
        assert.deepStrictEqual(readProperty(PROJECT, 'OutputType', 'Debug'), { value: 'Exe', scope: 'all' });
        assert.deepStrictEqual(readProperty(PROJECT, 'vid', 'Release'), { value: 'off', scope: 'configuration' });
        assert.deepStrictEqual(readProperty(PROJECT, 'stack_size', 'Debug'), { value: undefined, scope: 'unset' });
        // A property carrying its own Condition (the default Configuration) is not an editable value.
        assert.deepStrictEqual(readProperty(PROJECT, 'Configuration', 'Debug'), { value: undefined, scope: 'unset' });
    });

    test('values are shown unescaped and written back the way the IDE writes them', () => {
        assert.strictEqual(readProperty(PROJECT, 'DefineConstants', 'Debug').value, '_ABCDllMode_=>0;_ABCLinkMode_=>1');
        const text = setProperty(PROJECT, 'DefineConstants', '_ABCDllMode_=>1;_ABCLinkMode_=>0;A&B', null);
        assert.ok(text.includes('<DefineConstants>_ABCDllMode_=&gt;1%3b_ABCLinkMode_=&gt;0%3bA&amp;B</DefineConstants>'), text);
        assert.strictEqual(setProperty(PROJECT, 'DefineConstants', '_ABCDllMode_=>0;_ABCLinkMode_=>1', null), PROJECT, 'an unchanged value rewrites nothing');
    });

    test('changing a value touches only its line', () => {
        const text = setProperty(PROJECT, 'OutputType', 'Library', null);
        assert.strictEqual(text, PROJECT.replace('<OutputType>Exe</OutputType>', '<OutputType>Library</OutputType>'));
        const debugOnly = setProperty(PROJECT, 'vid', 'min', 'Debug');
        assert.strictEqual(debugOnly, PROJECT.replace('<vid>full</vid>', '<vid>min</vid>'));
    });

    test('a new property goes at the end of its group, indented like its neighbours', () => {
        const text = setProperty(PROJECT, 'stack_size', '16384', null);
        assert.ok(text.includes('    <DefineConstants>_ABCDllMode_=&gt;0%3b_ABCLinkMode_=&gt;1</DefineConstants>\r\n    <stack_size>16384</stack_size>\r\n  </PropertyGroup>'), text);
        const release = setProperty(PROJECT, 'GenerateMap', 'True', 'Release');
        assert.ok(release.includes('    <vid>off</vid>\r\n    <GenerateMap>True</GenerateMap>\r\n  </PropertyGroup>\r\n  <ItemGroup>'), release);
    });

    test('clearing a value removes its line', () => {
        const text = setProperty(PROJECT, 'OutputName', null, null);
        assert.strictEqual(text, PROJECT.replace('    <OutputName>Sales</OutputName>\r\n', ''));
    });

    test('a configuration without a group of its own gets one', () => {
        const text = setProperty(PROJECT, 'vid', 'full', 'Testing');
        assert.ok(text.includes("  <PropertyGroup Condition=\" '$(Configuration)' == 'Testing' \">\r\n    <vid>full</vid>\r\n  </PropertyGroup>\r\n  <ItemGroup>"), text);
    });

    test('switching a value to one configuration copies it into each configuration group', () => {
        const text = setPropertyScope(PROJECT, 'OutputType', 'configuration', 'Debug');
        assert.deepStrictEqual(readProperty(text, 'OutputType', 'Debug'), { value: 'Exe', scope: 'configuration' });
        assert.deepStrictEqual(readProperty(text, 'OutputType', 'Release'), { value: 'Exe', scope: 'configuration' });
        const unconditional = text.split("Condition=\" '$(Configuration)' == 'Debug'")[0];
        assert.ok(!unconditional.includes('<OutputType>'), 'gone from the unconditional group');
    });

    test('switching a value to all configurations keeps the current configuration\'s value', () => {
        const text = setPropertyScope(PROJECT, 'vid', 'all', 'Debug');
        assert.deepStrictEqual(readProperty(text, 'vid', 'Release'), { value: 'full', scope: 'all' });
        assert.ok(!text.includes('<vid>off</vid>'), 'the Release value is gone');
        assert.strictEqual((text.match(/<vid>/g) ?? []).length, 1);
    });

    test('a group condition naming the platform too is read as its configuration', () => {
        const withPlatform = PROJECT.replace("Condition=\" '$(Configuration)' == 'Debug' \"", "Condition=\" '$(Configuration)|$(Platform)' == 'Debug|Win32' \"");
        assert.deepStrictEqual(configurationsOf(withPlatform), ['Debug', 'Release']);
        assert.deepStrictEqual(readProperty(withPlatform, 'vid', 'Debug'), { value: 'full', scope: 'configuration' });
    });
});
