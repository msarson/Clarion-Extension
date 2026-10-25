import * as assert from 'assert';
import { addProjectToSln, projectGuidOf } from '../solution/SlnEdit';

/**
 * #795 — Solution Properties adds a project to the solution: a Project block after the others and,
 * for every configuration the solution declares, the entries that build it. Nothing else in the
 * file changes, so the Clarion IDE reads it as before.
 */
const SLN = [
    '﻿',
    'Microsoft Visual Studio Solution File, Format Version 12.00',
    '# Visual Studio 2012',
    'Project("{12B76EC0-1D7B-4FA7-A7D0-C524288B48A1}") = "Sales", "Sales.cwproj", "{11111111-1111-1111-1111-111111111111}"',
    'EndProject',
    'Global',
    '\tGlobalSection(SolutionConfigurationPlatforms) = preSolution',
    '\t\tDebug|Win32 = Debug|Win32',
    '\t\tRelease|Win32 = Release|Win32',
    '\tEndGlobalSection',
    '\tGlobalSection(ProjectConfigurationPlatforms) = postSolution',
    '\t\t{11111111-1111-1111-1111-111111111111}.Debug|Win32.Build.0 = Debug|Win32',
    '\t\t{11111111-1111-1111-1111-111111111111}.Debug|Win32.ActiveCfg = Debug|Win32',
    '\tEndGlobalSection',
    'EndGlobal',
    '',
].join('\r\n');

const COMMON = { name: 'Common', path: 'lib\\Common.cwproj', guid: '{22222222-2222-2222-2222-222222222222}' };

suite('Solution Properties: adding a project to the .sln (#795)', () => {
    test('the Project block follows the others, and every configuration builds it', () => {
        const text = addProjectToSln(SLN, COMMON);
        const expected = SLN
            .replace('EndProject\r\nGlobal',
                'EndProject\r\nProject("{12B76EC0-1D7B-4FA7-A7D0-C524288B48A1}") = "Common", "lib\\Common.cwproj", "{22222222-2222-2222-2222-222222222222}"\r\nEndProject\r\nGlobal')
            .replace('ActiveCfg = Debug|Win32\r\n\tEndGlobalSection',
                'ActiveCfg = Debug|Win32\r\n'
                + '\t\t{22222222-2222-2222-2222-222222222222}.Debug|Win32.Build.0 = Debug|Win32\r\n'
                + '\t\t{22222222-2222-2222-2222-222222222222}.Debug|Win32.ActiveCfg = Debug|Win32\r\n'
                + '\t\t{22222222-2222-2222-2222-222222222222}.Release|Win32.Build.0 = Release|Win32\r\n'
                + '\t\t{22222222-2222-2222-2222-222222222222}.Release|Win32.ActiveCfg = Release|Win32\r\n'
                + '\tEndGlobalSection');
        assert.strictEqual(text, expected);
    });

    test('a solution with no projects, or no ProjectConfigurationPlatforms section, gets them', () => {
        const empty = SLN.replace(/Project\("[^\r]*\r\nEndProject\r\n/, '')
            .replace(/\tGlobalSection\(ProjectConfigurationPlatforms\)[\s\S]*?\tEndGlobalSection\r\n/, '');
        const text = addProjectToSln(empty, COMMON);
        assert.ok(text.includes('# Visual Studio 2012\r\nProject("{12B76EC0-1D7B-4FA7-A7D0-C524288B48A1}") = "Common"'), text);
        assert.ok(text.includes('\tEndGlobalSection\r\n\tGlobalSection(ProjectConfigurationPlatforms) = postSolution\r\n\t\t{22222222-2222-2222-2222-222222222222}.Debug|Win32.Build.0'), text);
        assert.ok(text.endsWith('\tEndGlobalSection\r\nEndGlobal\r\n'), text);
    });

    test('a project the solution already lists is refused, by GUID or by path', () => {
        assert.throws(() => addProjectToSln(SLN, { ...COMMON, guid: '{11111111-1111-1111-1111-111111111111}' }), /already/);
        assert.throws(() => addProjectToSln(SLN, { ...COMMON, path: 'sales.CWPROJ' }), /already/);
    });

    test('a .sln with LF line endings keeps them', () => {
        const lf = SLN.replace(/\r\n/g, '\n');
        assert.ok(!addProjectToSln(lf, COMMON).includes('\r'));
    });

    test('an existing project is identified by its ProjectGuid', () => {
        assert.strictEqual(projectGuidOf('<Project>\r\n  <PropertyGroup>\r\n    <ProjectGuid>{8921C8ED-59EB-6367-061C-8BCA2E3455FC}</ProjectGuid>\r\n'), '{8921C8ED-59EB-6367-061C-8BCA2E3455FC}');
        assert.strictEqual(projectGuidOf('<Project><!-- <ProjectGuid>{X}</ProjectGuid> --></Project>'), undefined);
    });
});
