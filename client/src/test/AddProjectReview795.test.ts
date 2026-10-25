import * as assert from 'assert';
import { addProjectToSln } from '../solution/SlnEdit';
import { mainFileError, newProjectError } from '../solution/SolutionPage';

/**
 * #795 — the review's findings on adding a project, pinned. A name or file name that is a path
 * would write outside the solution's folder; an apostrophe ends the quoted name in a DLL's .exp;
 * the same project, or another of the same name, must not be listed twice; and a .sln read with
 * characters the decoder could not map is refused rather than written back corrupted.
 */
const SLN = [
    'Microsoft Visual Studio Solution File, Format Version 12.00',
    'Project("{12B76EC0-1D7B-4FA7-A7D0-C524288B48A1}") = "Lib", "Lib\\Lib.cwproj", "{11111111-1111-1111-1111-111111111111}"',
    'EndProject',
    'Global',
    '\tGlobalSection(SolutionConfigurationPlatforms) = preSolution',
    '\t\tDebug|Win32 = Debug|Win32',
    '\tEndGlobalSection',
    'EndGlobal',
    '',
].join('\r\n');
const OTHER = { name: 'Other', path: 'Other.cwproj', guid: '{22222222-2222-2222-2222-222222222222}' };

suite('Adding a project: the review\'s findings (#795)', () => {
    test('bug-pin: a backslash in a name or a main file is refused, as a path would write elsewhere', () => {
        assert.match(newProjectError('Sub\\Foo', 'Foo.clw', []) ?? '', /invalid/);
        assert.match(newProjectError('..\\Foo', 'Foo.clw', []) ?? '', /invalid/);
        assert.match(mainFileError('src\\Prog.clw') ?? '', /invalid/);
    });

    test('an apostrophe in a project name is refused: it would end the name in the DLL\'s export file', () => {
        assert.match(newProjectError("O'Brien", 'Main.clw', []) ?? '', /invalid/);
    });

    test('a project of the same name, or the same file by another spelling, is refused', () => {
        assert.throws(() => addProjectToSln(SLN, { ...OTHER, name: 'lib' }, 'C:\\Apps\\Sales'), /already/);
        assert.throws(() => addProjectToSln(SLN, { ...OTHER, path: '.\\Lib\\Lib.cwproj' }, 'C:\\Apps\\Sales'), /already/);
        assert.throws(() => addProjectToSln(SLN, { ...OTHER, path: 'C:\\Apps\\Sales\\lib\\LIB.cwproj' }, 'C:\\Apps\\Sales'), /already/);
        assert.doesNotThrow(() => addProjectToSln(SLN, OTHER, 'C:\\Apps\\Sales'));
    });

    test('a .sln that did not decode cleanly is refused', () => {
        assert.throws(() => addProjectToSln(SLN.replace('Lib"', 'L\uFFFDb"'), OTHER, 'C:\\Apps\\Sales'), /encoding|UTF-8/);
    });
});
