import * as assert from 'assert';
import { listItems } from '../../../common/CwprojItems';
import { editItems } from '../project/ProjectPropertiesPage';

/**
 * #880 — a source's Generated mark, from the project page. The Clarion IDE writes
 * `<Generated>true</Generated>` on each Compile item the app generator produces (IDE-verified on
 * Clarion 12: on generate, not on opening or building), and until #885 the Solution view's Add
 * Source File wrote it on every file it added. A mark on a hand-written module stays until the
 * XML is edited by hand, and Rename refuses generated code (#548/#549); the page now clears it,
 * or sets it, changing only that item.
 */
const PROJECT = '﻿' + [
    '<Project DefaultTargets="Build" xmlns="http://schemas.microsoft.com/developer/msbuild/2003">',
    '  <PropertyGroup>',
    '    <OutputType>Exe</OutputType>',
    '  </PropertyGroup>',
    '  <ItemGroup>',
    '    <Compile Include="Main.clw">',
    '      <Generated>true</Generated>',
    '    </Compile>',
    '    <Compile Include="Hand.clw" />',
    '    <Compile Include="Both.clw">',
    '      <check_index>off</check_index>',
    '      <Generated>true</Generated>',
    '    </Compile>',
    '    <None Include="Readme.txt" />',
    '  </ItemGroup>',
    '</Project>',
].join('\r\n');

const set = (text: string, value: string, generated: boolean, kind = 'Compile') =>
    editItems(text, { type: 'setGenerated', kind, value, generated });
const generatedOf = (text: string) => Object.fromEntries(listItems(text).compile.map(i => [i.include, i.generated]));

suite('Project Properties: a source\'s Generated mark (#880)', () => {
    test('clearing the mark leaves the item on one line, closed like the others, and nothing else changes', () => {
        assert.strictEqual(set(PROJECT, 'Main.clw', false), PROJECT.replace(
            '    <Compile Include="Main.clw">\r\n      <Generated>true</Generated>\r\n    </Compile>',
            '    <Compile Include="Main.clw" />'));
    });

    test('clearing the mark keeps the item\'s other metadata', () => {
        assert.strictEqual(set(PROJECT, 'Both.clw', false), PROJECT.replace('      <Generated>true</Generated>\r\n    </Compile>\r\n    <None',
            '    </Compile>\r\n    <None'));
        assert.strictEqual(generatedOf(set(PROJECT, 'Both.clw', false))['Both.clw'], false);
    });

    test('setting the mark writes the child the IDE writes, and nothing else changes', () => {
        assert.strictEqual(set(PROJECT, 'Hand.clw', true), PROJECT.replace(
            '    <Compile Include="Hand.clw" />',
            '    <Compile Include="Hand.clw">\r\n      <Generated>true</Generated>\r\n    </Compile>'));
    });

    test('the name matches in any case', () => {
        assert.strictEqual(generatedOf(set(PROJECT, 'MAIN.CLW', false))['Main.clw'], false);
    });

    test('a mark already as asked is left alone', () => {
        assert.strictEqual(set(PROJECT, 'Main.clw', true), PROJECT);
        assert.strictEqual(set(PROJECT, 'Hand.clw', false), PROJECT);
    });

    test('only a Compile item takes the mark, and only a file the project lists', () => {
        assert.strictEqual(set(PROJECT, 'Readme.txt', true, 'None'), PROJECT);
        assert.strictEqual(set(PROJECT, 'Missing.clw', false), PROJECT);
    });
});
