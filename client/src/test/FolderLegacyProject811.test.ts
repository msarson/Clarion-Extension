import * as assert from 'assert';
import { inferProjects, SourceFile } from '../solution/FolderProjectInference';
import { buildCwprojContent } from '../solution/SolutionFiles';
import { chosenSpecs, defaultChoices, buildReviewState, ReviewInput } from '../solution/NewSolutionReview';

/**
 * #811 — New Solution from a folder guessed a hand-written project's files: members of no program
 * (a bare MEMBER()) were left to the user, library sources were listed where a MAP MODULE reached
 * them, and a shared source outside the folder was missed. A legacy .prj beside the sources says
 * exactly what the project compiles, so where one compiles a program its list is the project's.
 *
 * Compiler-verified on Clarion 10 MSBuild: a .cwproj that includes the .prj runs its #compile
 * lines with their own /define, but links only its own Compile items (an EXE needs its program as
 * one), so the project lists the .prj and every source.
 */
const f = (relPath: string, text: string): SourceFile => ({ relPath, text });
const dllProgram = '  PROGRAM\r\n  MAP\r\n  END\r\n  CODE\r\n';
const bare = '  MEMBER()\r\n';
const prj = [
    '-- Generator',
    '#noedit',
    '#system win32',
    '#model clarion dll',
    '#include common.pi',
    '#pragma define(maincode=>off)',
    '#compile "Proj.clw"',
    '#compile "ProjMath.clw"',
    '#compile "ProjFuncValues.clw"',
    '#compile "Shared.clw" /define(_STD_DLL_INIT_=>on)',
    '#compile "Proj.exp"',
    '#link "%pfx%016.DLL"',
].join('\r\n');
const folder = () => [
    f('SRC\\Proj.clw', dllProgram),
    f('SRC\\ProjMath.clw', bare),
    f('SRC\\ProjFuncValues.clw', bare),
    f('SRC\\T\\ProjFuncValues.clw', bare),
    f('SRC\\Unused.clw', bare),
];

suite('New Solution from a folder with a legacy .prj (#811)', () => {
    test('bug-pin: the .prj\'s #compile list is the project\'s, and says where it came from', () => {
        const inference = inferProjects(folder(), [], { legacyProjects: [f('Proj.prj', prj)] });
        assert.strictEqual(inference.projects.length, 1);
        const p = inference.projects[0];
        assert.strictEqual(p.legacyProject, 'Proj.prj');
        assert.deepStrictEqual(p.compile, ['SRC\\Proj.clw', 'SRC\\ProjMath.clw', 'SRC\\ProjFuncValues.clw', 'Shared.clw'],
            'the copy in SRC\\T is not the one beside the program; Shared.clw is found by redirection');
        assert.deepStrictEqual(p.unreferenced, [], 'the .prj lists them: none is a leftover');
        assert.deepStrictEqual(inference.unassigned, ['SRC\\T\\ProjFuncValues.clw', 'SRC\\Unused.clw'],
            'what the .prj compiles is placed; the rest is still the user\'s to place');
    });

    test('no library source is added to a project its .prj describes', () => {
        const program = '  PROGRAM\r\n  MAP\r\n    MODULE(\'Lib.clw\')\r\n      LibProc()\r\n    END\r\n  END\r\n  CODE\r\n  LibProc()\r\n';
        const library = f('C:\\Clarion\\libsrc\\Lib.clw', '  MEMBER()\r\n  MAP\r\n    MODULE(\'Lib.clw\')\r\n      LibProc()\r\n    END\r\n  END\r\nLibProc PROCEDURE\r\n  CODE\r\n');
        const without = inferProjects([f('App.clw', program)], [library]);
        assert.ok(without.projects[0].compile.includes('Lib.clw'), 'without a .prj the library is listed (#763)');
        const withPrj = inferProjects([f('App.clw', program)], [library], { legacyProjects: [f('App.prj', '#compile App.clw\r\n')] });
        assert.deepStrictEqual(withPrj.projects[0].compile, ['App.clw']);
    });

    test('a .prj that compiles no program in the folder changes nothing', () => {
        const plain = inferProjects(folder());
        const other = inferProjects(folder(), [], { legacyProjects: [f('Other.prj', '#compile Other.clw\r\n')] });
        assert.deepStrictEqual(other, plain);
    });

    test('the nearest .prj wins when several compile the program', () => {
        const inference = inferProjects(folder(), [], {
            legacyProjects: [f('Proj.prj', '#compile Proj.clw\r\n#compile ProjMath.clw\r\n'), f('SRC\\Proj.pr', '#compile Proj.clw\r\n')],
        });
        assert.strictEqual(inference.projects[0].legacyProject, 'SRC\\Proj.pr');
        assert.deepStrictEqual(inference.projects[0].compile, ['SRC\\Proj.clw']);
    });

    test('the .cwproj includes the .prj and lists every source to link', () => {
        const text = buildCwprojContent({ name: 'Proj', guid: '{A}', compile: ['SRC\\Proj.clw', 'Shared.clw'], kind: 'dll', legacyProject: 'Proj.prj' });
        assert.ok(text.includes('    <Include Include="Proj.prj" />'), text);
        assert.ok(text.includes('    <Compile Include="SRC\\Proj.clw" />\r\n    <Compile Include="Shared.clw" />'), text);
        assert.ok(!buildCwprojContent({ name: 'Proj', guid: '{A}', compile: ['Proj.clw'], kind: 'dll' }).includes('<Include '));
    });

    test('the review page says where the sources came from, and the spec carries the .prj', () => {
        const inference = inferProjects(folder(), [], { legacyProjects: [f('Proj.prj', prj)] });
        const specs = chosenSpecs(inference, defaultChoices(inference, 'Proj'), () => '{G}');
        assert.strictEqual(specs[0].legacyProject, 'Proj.prj');
        const input: ReviewInput = { folder: 'C:\\work', files: folder(), libraries: [], inference, exportFiles: {}, compiler: 'Clarion 10', sourceCount: 5, legacyProjects: [f('Proj.prj', prj)] };
        const state = buildReviewState(input, defaultChoices(inference, 'Proj'));
        assert.match(state.projects[0].why, /Proj\.prj/);
    });
});
