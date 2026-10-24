import * as assert from 'assert';
import { buildPageState } from '../project/ProjectPropertiesPage';
import { targetsProperties } from '../project/ProjectPropertyFields';

/**
 * #792 — what the Project Properties page shows for a configuration: each IDE page's groups and
 * fields, every field's value and whether it applies to all configurations or that one, and the
 * configurations to choose from (the project's own, then Debug and Release).
 */
const PROJECT = [
    '<Project DefaultTargets="Build" xmlns="http://schemas.microsoft.com/developer/msbuild/2003">',
    '  <PropertyGroup>',
    '    <OutputType>Library</OutputType>',
    '    <OutputName>Common</OutputName>',
    '    <Model>Dll</Model>',
    '  </PropertyGroup>',
    "  <PropertyGroup Condition=\" '$(Configuration)' == 'Debug' \">",
    '    <vid>full</vid>',
    '    <check_index>True</check_index>',
    '  </PropertyGroup>',
    "  <PropertyGroup Condition=\" '$(Configuration)' == 'Release' \">",
    '    <vid>off</vid>',
    '  </PropertyGroup>',
    '</Project>',
].join('\r\n');

const field = (state: ReturnType<typeof buildPageState>, property: string) =>
    state.tabs.flatMap(t => t.groups.flatMap(g => g.fields)).find(f => f.property === property)!;

suite('Project Properties: the page for a configuration (#792)', () => {
    test('values and where they apply, for the configuration chosen', () => {
        const debug = buildPageState(PROJECT, 'Debug', undefined);
        assert.deepStrictEqual([field(debug, 'OutputType').value, field(debug, 'OutputType').scope], ['Library', 'all']);
        assert.deepStrictEqual([field(debug, 'vid').value, field(debug, 'vid').scope], ['full', 'configuration']);
        assert.deepStrictEqual([field(debug, 'check_index').value, field(debug, 'check_index').checked], ['True', true]);
        assert.deepStrictEqual([field(debug, 'stack_size').value, field(debug, 'stack_size').scope], ['', 'unset']);
        const release = buildPageState(PROJECT, 'Release', undefined);
        assert.strictEqual(field(release, 'vid').value, 'off');
        assert.strictEqual(field(release, 'check_index').checked, false);
    });

    test('the configurations to choose from, and the header', () => {
        const state = buildPageState(PROJECT, 'Debug', undefined);
        assert.deepStrictEqual(state.configurations, ['Debug', 'Release']);
        assert.strictEqual(state.configuration, 'Debug');
        assert.deepStrictEqual([state.outputName, state.kind], ['Common', 'DLL']);
    });

    test('fields grouped as on the IDE\'s pages, a held-back field marked with why', () => {
        const state = buildPageState(PROJECT, 'Debug', targetsProperties('$(OutputType) $(vid)'));
        assert.deepStrictEqual(state.tabs.map(t => t.label), ['Application', 'Compiling', 'Debug', 'Build Events']);
        assert.deepStrictEqual(state.tabs[1].groups.map(g => g.title), ['General', 'Output', 'Runtime checks']);
        const dep = field(state, 'dep');
        assert.strictEqual(dep.available, false);
        assert.ok(dep.reason);
        assert.strictEqual(field(state, 'vid').available, true);
    });
});
