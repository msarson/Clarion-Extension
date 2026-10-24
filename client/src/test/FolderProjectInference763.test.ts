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

    test('a main CODE that ends the file is a DLL whose procedures live in its members', () => {
        // Ambiguous on purpose: a do-nothing EXE looks the same. A real app had one of each, and
        // the DLL is the shape real code is built from; the DLL picker lets the user correct it.
        const r = inferProjects([f('Lib.clw', '  PROGRAM\r\n  MAP\r\n  END\r\n  CODE\r\n\r\n'), f('Lib001.clw', member('Lib'))]);
        assert.strictEqual(r.projects[0].kind, 'dll');
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

    test('a MEMBER path matches whole folder names, not the end of one', () => {
        const r = inferProjects([f('ba\\App.clw', exe), f('a\\App.clw', exe), f('Worker.clw', member('a\\App.clw'))]);
        assert.deepStrictEqual(r.projects.map(p => p.compile), [['ba\\App.clw'], ['a\\App.clw', 'Worker.clw']]);
    });

    test('a MODULE or INCLUDE with a folder follows that file, not another of the same name', () => {
        const r = inferProjects([
            f('App.clw', exe.replace("MODULE('App001.clw')", "MODULE('src\\Worker.clw')")),
            f('other\\Worker.clw', member('App')),
            f('src\\Worker.clw', member('App', "  MAP\r\n    MODULE('Required.clw')\r\n    END\r\n  END")),
            f('src\\Required.clw', member('App')),
        ]);
        assert.deepStrictEqual(r.projects[0].unreferenced, ['other\\Worker.clw']);
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

    test('programs of one name in a sub-folder and the root each keep their own members and leftovers', () => {
        const prog = (mod: string) => exe.replace('App001.clw', mod);
        const r = inferProjects([
            f('a\\main.clw', prog('a1.clw')), f('a\\a1.clw', member('main')),
            f('main.clw', prog('m1.clw')), f('m1.clw', member('main')),
        ]);
        assert.deepStrictEqual(r.projects.map(p => [p.compile, p.unreferenced]), [
            [['a\\main.clw', 'a\\a1.clw'], []],
            [['main.clw', 'm1.clw'], []],
        ]);
        assert.notStrictEqual(r.projects[0].name.toLowerCase(), r.projects[1].name.toLowerCase());
    });

    test('a source saved with a UTF-8 byte-order mark is still read (latin1 shows it as three characters)', () => {
        const bom = 'ï»¿';
        assert.deepStrictEqual(classifySource(bom + '  PROGRAM\r\n'), { kind: 'program' });
        assert.deepStrictEqual(classifySource('﻿' + "  MEMBER('App')"), { kind: 'member', program: 'app' });
        const r = inferProjects([f('App.clw', bom + exe), f('App001.clw', bom + member('App'))]);
        assert.deepStrictEqual(r.projects.map(p => [p.compile, p.unreferenced]), [[['App.clw', 'App001.clw'], []]]);
    });

    test('a class implementation is neither asked about nor compiled: LINK builds it', () => {
        const r = inferProjects([
            f('App.clw', exe + "\r\n  INCLUDE('Classes.inc'),ONCE"),
            f('Classes.inc', [
                "Small  CLASS,TYPE,MODULE('Small.clw'),LINK('Small.clw',1)",
                "Init     PROCEDURE",
                "       END",
                "Big    CLASS(Small),TYPE, |  ! continued",
                "         MODULE('Big'),LINK('Big',_LinkMode_)",
                "       END",
            ].join('\r\n')),
            f('classes\\Small.clw', '  MEMBER()'),
            f('classes\\Big.clw', '  MEMBER()'),
            f('Unused.clw', '  MEMBER()'),
        ]);
        assert.deepStrictEqual(r.projects[0].compile, ['App.clw']);
        assert.deepStrictEqual(r.unassigned, ['Unused.clw']);
        assert.deepStrictEqual(r.classImplementations, ['classes\\Small.clw', 'classes\\Big.clw']);
    });

    test('a MAP MODULE naming a bare MEMBER() is not a class implementation', () => {
        const r = inferProjects([f('App.clw', exe.replace("MODULE('App001.clw')", "MODULE('Util.clw')")), f('Util.clw', '  MEMBER()')]);
        assert.deepStrictEqual(r.unassigned, ['Util.clw']);
        assert.deepStrictEqual(r.classImplementations, []);
    });

    // Library sources: files outside the folder that redirection finds (Clarion's libsrc, accessories).
    const LIB = 'C:\\Clarion\\libsrc\\win\\';
    const cwutilInc = f(LIB + 'CWUTIL.INC', "  MODULE('cwutil.clw')\r\nOpenUrlLink(STRING url),ULONG,PROC\r\n  END");
    const cwutilClw = f(LIB + 'CWUtil.CLW', '  MEMBER()');
    const efocusInc = f(LIB + 'EFOCUS.INC', "EnhancedFocusClassType CLASS,TYPE,MODULE('EFOCUS.CLW'),LINK('EFOCUS.CLW',1),DLL(0)\r\nInit  PROCEDURE\r\n  END");
    const efocusClw = f(LIB + 'EFOCUS.CLW', '  MEMBER()');
    const usesLibs = '  PROGRAM\r\n  INCLUDE(\'EFOCUS.INC\'),ONCE\r\n  MAP\r\n  INCLUDE(\'CWUTIL.INC\'),ONCE\r\n  END\r\n  CODE\r\n  OpenUrlLink(\'x\')';

    test('a MAP MODULE whose source is a library outside the folder is listed by its bare name', () => {
        const r = inferProjects([f('App.clw', usesLibs)], [cwutilInc, cwutilClw, efocusInc, efocusClw]);
        assert.deepStrictEqual(r.projects[0].compile, ['App.clw', 'CWUtil.CLW']);
        assert.deepStrictEqual(r.projects[0].unreferenced, []);
    });

    test("a library CLASS is left to its LINK, and a MODULE naming no source adds nothing", () => {
        const win32 = f(LIB + 'WIN32.INC', "  MODULE('Win32')\r\nGetTickCount(),ULONG,PASCAL\r\n  END");
        const r = inferProjects([f('App.clw', usesLibs.replace("INCLUDE('CWUTIL.INC')", "INCLUDE('WIN32.INC')"))], [win32, efocusInc, efocusClw]);
        assert.deepStrictEqual(r.projects[0].compile, ['App.clw']);
    });

    test('libraries are found through includes of includes, and only for the programs that reach them', () => {
        const r = inferProjects([
            f('App.clw', "  PROGRAM\r\n  MAP\r\n  INCLUDE('AppMap.inc')\r\n  END\r\n  CODE"),
            f('AppMap.inc', "  INCLUDE('CWUTIL.INC'),ONCE"),
            f('Other.clw', '  PROGRAM\r\n  CODE\r\n  X()'),
        ], [cwutilInc, cwutilClw]);
        assert.deepStrictEqual(r.projects.map(p => p.compile), [['App.clw', 'CWUtil.CLW'], ['Other.clw']]);
    });

    test('a file in the folder wins over a library file of the same name', () => {
        const r = inferProjects([f('App.clw', usesLibs), f('CWUTIL.INC', '! a local copy that declares nothing')], [cwutilInc, cwutilClw]);
        assert.deepStrictEqual(r.projects[0].compile, ['App.clw']);
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
