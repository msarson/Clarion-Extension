import * as assert from 'assert';
import { classifySource, inferProjects, SourceFile } from '../solution/FolderProjectInference';

/**
 * #763 — New Solution in a folder that already holds Clarion sources builds one project per
 * PROGRAM. A generated multi-DLL app keeps every program's sources side by side, so each .clw is
 * assigned by its first statement: MEMBER('x') names its program; a bare MEMBER() module named
 * after a program (<Prog>_FC0, <Prog>_BC1) goes to that program; anything else is left for the
 * user. EXE or DLL is read from the program: a DLL's main CODE is empty.
 */
const exe = [
    '  PROGRAM',
    '  MAP',
    "    MODULE('App001.clw')",
    'Main  PROCEDURE',
    '    END',
    '  END',
    '  CODE',
    '  Main()',
].join('\r\n');
const dll = [
    '   PROGRAM',
    "   INCLUDE('Lib001.inc'),ONCE",
    '  CODE',
    '',
    '! the main CODE is empty',
    'DLLInitializer.Construct PROCEDURE',
    '  CODE',
].join('\r\n');
const member = (prog: string, body = '') => `   MEMBER('${prog}')   ! This is a MEMBER module\r\n${body}`;
const f = (relPath: string, text: string): SourceFile => ({ relPath, text });

suite('New solution from a folder of sources (#763)', () => {
    test('the first statement classifies a source, comments and blank lines skipped', () => {
        assert.deepStrictEqual(classifySource('! header\r\n\r\n  PROGRAM\r\n'), { kind: 'program' });
        assert.deepStrictEqual(classifySource("  member('App.clw')"), { kind: 'member', program: 'app' });
        assert.deepStrictEqual(classifySource("  MEMBER('App')"), { kind: 'member', program: 'app' });
        assert.deepStrictEqual(classifySource('  MEMBER()'), { kind: 'bareMember' });
        assert.deepStrictEqual(classifySource('  MEMBER'), { kind: 'bareMember' });
        assert.deepStrictEqual(classifySource("  INCLUDE('x.inc')"), { kind: 'other' });
        assert.deepStrictEqual(classifySource(''), { kind: 'other' });
    });

    test('each PROGRAM gets its own members, the program first', () => {
        const r = inferProjects([
            f('App.clw', exe), f('App001.clw', member('App.clw')),
            f('Lib.clw', dll), f('Lib001.clw', member('Lib')), f('Lib002.clw', member('LIB.CLW')),
        ]);
        assert.deepStrictEqual(r.projects.map(p => [p.name, p.compile]), [
            ['App', ['App.clw', 'App001.clw']],
            ['Lib', ['Lib.clw', 'Lib001.clw', 'Lib002.clw']],
        ]);
    });

    test('EXE or DLL: an empty main CODE is a DLL', () => {
        const r = inferProjects([f('App.clw', exe), f('Lib.clw', dll)]);
        assert.deepStrictEqual(r.projects.map(p => [p.name, p.kind]), [['App', 'exe'], ['Lib', 'dll']]);
    });

    test('a bare MEMBER() named after a program joins it; the longest program name wins', () => {
        const r = inferProjects([
            f('IBS.clw', exe), f('IBS_Tools.clw', exe),
            f('IBS_FC0.clw', '  MEMBER()'), f('IBS_Tools_BC0.clw', '  MEMBER()'),
        ]);
        assert.deepStrictEqual(r.projects.map(p => [p.name, p.compile]), [
            ['IBS', ['IBS.clw', 'IBS_FC0.clw']],
            ['IBS_Tools', ['IBS_Tools.clw', 'IBS_Tools_BC0.clw']],
        ]);
        assert.deepStrictEqual(r.unassigned, []);
    });

    test('a bare MEMBER() that matches no program name is left for the user', () => {
        const r = inferProjects([f('App.clw', exe), f('APPGLO.clw', '  MEMBER()'), f('Applet.clw', '  MEMBER()')]);
        assert.deepStrictEqual(r.projects[0].compile, ['App.clw']);
        assert.deepStrictEqual(r.unassigned, ['APPGLO.clw', 'Applet.clw']);
    });

    test('a member of a program that is not in the folder is reported, not compiled', () => {
        const r = inferProjects([f('App.clw', exe), f('Other001.clw', member('Other.clw'))]);
        assert.deepStrictEqual(r.projects[0].compile, ['App.clw']);
        assert.deepStrictEqual(r.missingProgram, ['Other001.clw']);
    });

    test('INCLUDE fragments and non-.clw files are never Compile items', () => {
        const r = inferProjects([f('App.clw', exe), f('Frag.clw', "  INCLUDE('x.inc')"), f('App.inc', member('App'))]);
        assert.deepStrictEqual(r.projects[0].compile, ['App.clw']);
        assert.deepStrictEqual(r.unassigned, []);
    });

    test('members in sub-folders keep their relative paths', () => {
        const r = inferProjects([f('App.clw', exe), f('src\\App001.clw', member('App.clw'))]);
        assert.deepStrictEqual(r.projects[0].compile, ['App.clw', 'src\\App001.clw']);
    });

    test('two programs with the same name in different sub-folders get distinct project names', () => {
        const r = inferProjects([f('App.clw', exe), f('old\\APP.clw', exe), f('v2\\app.clw', exe)]);
        assert.deepStrictEqual(r.projects.map(p => p.name), ['App', 'old_APP', 'v2_app']);
    });

    test('project names stay unique when a folder-qualified name is taken too', () => {
        const r = inferProjects([f('App.clw', exe), f('old_App.clw', exe), f('old\\App.clw', exe), f('OLD\\app.clw', exe)]);
        const names = r.projects.map(p => p.name.toLowerCase());
        assert.strictEqual(new Set(names).size, names.length, names.join(', '));
    });

    test('a name MSBuild would expand never reaches the project files', () => {
        const r = inferProjects([f("$(Root.Substring(0,3))x@y%z;w'q.clw", exe)]);
        assert.ok(!/[$@%;'"]/.test(r.projects[0].name), r.projects[0].name);
        assert.deepStrictEqual(r.projects[0].compile, ["$(Root.Substring(0,3))x@y%z;w'q.clw"]);
    });

    test('a member whose program name is shared goes to the program in its own folder', () => {
        const r = inferProjects([
            f('a\\App.clw', exe), f('b\\App.clw', exe), f('b\\Worker.clw', member('App')),
        ]);
        assert.deepStrictEqual(r.projects.map(p => p.compile), [['a\\App.clw'], ['b\\App.clw', 'b\\Worker.clw']]);
    });

    test('a member whose program name is shared and not in its folder is asked about', () => {
        const r = inferProjects([f('a\\App.clw', exe), f('b\\App.clw', exe), f('c\\Worker.clw', member('App'))]);
        assert.deepStrictEqual(r.projects.map(p => p.compile), [['a\\App.clw'], ['b\\App.clw']]);
        assert.deepStrictEqual(r.ambiguous, [{ file: 'c\\Worker.clw', candidates: [r.projects[0].name, r.projects[1].name] }]);
    });

    test('a MEMBER path picks the program it names among programs of the same name', () => {
        const r = inferProjects([f('a\\App.clw', exe), f('b\\App.clw', exe), f('Worker.clw', member('b\\App.clw'))]);
        assert.deepStrictEqual(r.projects.map(p => p.compile), [['a\\App.clw'], ['b\\App.clw', 'Worker.clw']]);
    });

    test('MODULE and INCLUDE without an extension mean .clw (#449)', () => {
        const r = inferProjects([
            f('App.clw', exe.replace("MODULE('App001.clw')", "MODULE('App001')") + "\r\n  INCLUDE('Hdr')"),
            f('App001.clw', member('App')),
            f('Hdr.clw', "  MAP\r\n    MODULE('App002')\r\n    END\r\n  END"),
            f('App002.clw', member('App')),
        ]);
        assert.deepStrictEqual(r.projects[0].unreferenced, []);
    });

    test('a member nothing reaches through MODULE is flagged as a possible leftover', () => {
        const r = inferProjects([
            f('App.clw', exe),
            f('App001.clw', member('App.clw', "  MAP\r\n    MODULE('App003.clw')\r\n    END\r\n  END")),
            f('App002.clw', member('App.clw')),       // left over: nothing names it
            f('App003.clw', member('App.clw')),       // reached through App001's MAP
            f('Lib.clw', dll),
            f('Lib001.clw', member('Lib.clw')),       // reached through Lib001.inc
            f('Lib001.inc', "  MODULE('LIB001.CLW')\r\n  END"),
        ]);
        assert.deepStrictEqual(r.projects.map(p => [p.name, p.unreferenced]), [['App', ['App002.clw']], ['Lib', []]]);
        assert.deepStrictEqual(r.projects[0].compile, ['App.clw', 'App001.clw', 'App002.clw', 'App003.clw']);
    });

    test('a leftover that only its own include names is still a leftover', () => {
        const r = inferProjects([
            f('App.clw', exe), f('App001.clw', member('App.clw')),
            f('App009.clw', member('App.clw', "  INCLUDE('App009.inc')")),
            f('App009.inc', "  MODULE('App009.clw')\r\n  END"),
        ]);
        assert.deepStrictEqual(r.projects[0].unreferenced, ['App009.clw']);
    });

    test('a MODULE name inside a comment does not count', () => {
        const r = inferProjects([
            f('App.clw', exe.replace("    MODULE('App001.clw')", "    ! MODULE('App001.clw')\r\n    MODULE('x') ! MODULE('App002.clw')")),
            f('App001.clw', member('App.clw')), f('App002.clw', member('App.clw')),
        ]);
        assert.deepStrictEqual(r.projects[0].unreferenced, ['App001.clw', 'App002.clw']);
    });
});
