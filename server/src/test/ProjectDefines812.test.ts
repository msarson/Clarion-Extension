import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ClarionProjectServer } from '../solution/clarionProjectServer';
import { SolutionManager } from '../solution/solutionManager';
import { serverSettings } from '../serverSettings';
import { dependenciesUnchanged, inactiveIncludeLines, recordedDependencies } from '../utils/ConditionalIncludes';
import { parseDefineConstants } from '../solution/ProjectDefines';

/**
 * #812 — a COMPILE/OMIT switch can be a project define (Conditional Switch): the .cwproj's
 * DefineConstants, a .prj's #pragma define, or a source's own /define on its #compile line. They
 * were never read, so a block on `_ABCDllMode_` was always followed as if it compiled. A file a
 * project compiles now has its project's switches; a file no project compiles does not, because a
 * shared header is decided per includer by the compiler.
 */
suite('COMPILE/OMIT decided from the project\'s defines (#812)', () => {
    let root: string, savedRed: string, savedConfig: string, savedSm: unknown;
    // Line 2 is the DLL-mode INCLUDE, line 5 the LIB-mode one.
    const source = [
        '  PROGRAM',
        "  COMPILE('***',_ABCDllMode_)",
        "  INCLUDE('dll.inc')",
        '  ***',
        "  OMIT('***',_ABCDllMode_)",
        "  INCLUDE('lib.inc')",
        '  ***',
        '  CODE',
        '',
    ].join('\r\n');
    const DLL = 2, LIB = 5;

    setup(() => {
        root = fs.mkdtempSync(path.join(os.tmpdir(), 'defines812-'));
        fs.writeFileSync(path.join(root, 'test.red'), '[Common]\r\n*.* = .\r\n');
        savedRed = serverSettings.redirectionFile;
        savedConfig = serverSettings.configuration;
        serverSettings.redirectionFile = 'test.red';
        serverSettings.configuration = 'Debug';
        savedSm = (SolutionManager as unknown as { instance: unknown }).instance;
        (SolutionManager as unknown as { instance: unknown }).instance = null;
    });
    teardown(() => {
        serverSettings.redirectionFile = savedRed;
        serverSettings.configuration = savedConfig;
        (SolutionManager as unknown as { instance: unknown }).instance = savedSm;
        try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* best-effort */ }
    });

    const cwproj = (name: string, groups: string[], items: string[]) => fs.writeFileSync(path.join(root, `${name}.cwproj`), [
        '<Project DefaultTargets="Build" xmlns="http://schemas.microsoft.com/developer/msbuild/2003">',
        `  <PropertyGroup><ProjectGuid>{81200000-0000-0000-0000-00000000000${name.length}}</ProjectGuid></PropertyGroup>`,
        ...groups,
        '  <ItemGroup>', ...items.map(i => '    ' + i), '  </ItemGroup>',
        '</Project>', ''].join('\r\n'));
    const defines = (text: string, condition = '') => `  <PropertyGroup${condition ? ` Condition="${condition}"` : ''}><DefineConstants>${text}</DefineConstants></PropertyGroup>`;
    const load = async (...names: string[]) => {
        const projects: ClarionProjectServer[] = [];
        for (const name of names) {
            const p = new ClarionProjectServer(name, '{12B76EC0-1D7B-4FA7-A7D0-C524288B48A1}', root, `{81200000-0000-0000-0000-00000000000${name.length}}`);
            await p.loadSourceFilesFromProjectFile();
            projects.push(p);
        }
        const sm = Object.create(SolutionManager.prototype) as SolutionManager;
        (sm as unknown as { solution: { projects: ClarionProjectServer[] } }).solution = { projects };
        (SolutionManager as unknown as { instance: unknown }).instance = sm;
    };
    const write = (name: string, text = source) => { const p = path.join(root, name); fs.writeFileSync(p, text); return p; };
    const decide = (file: string) => [...inactiveIncludeLines(file, fs.readFileSync(file, 'utf8'))].sort();

    test('DefineConstants as the .cwproj writes them: &gt; and %3b, on/off and numbers', () => {
        const text = '<Project><PropertyGroup><DefineConstants>_ABCDllMode_=&gt;1%3b_ABCLinkMode_=&gt;0%3bTRACE=&gt;on%3b</DefineConstants></PropertyGroup></Project>';
        assert.deepStrictEqual(parseDefineConstants(text, 'Debug'), { _abcdllmode_: '1', _abclinkmode_: '0', trace: 'on' });
    });

    test('only the groups of the active configuration count', () => {
        const text = '<Project>'
            + "<PropertyGroup><DefineConstants>A=&gt;1%3bB=&gt;1</DefineConstants></PropertyGroup>"
            + "<PropertyGroup Condition=\" '$(Configuration)|$(Platform)' == 'Release|Win32' \"><DefineConstants>A=&gt;0</DefineConstants></PropertyGroup>"
            + "<PropertyGroup Condition=\" '$(Configuration)' == 'Debug' \"><DefineConstants>B=&gt;2</DefineConstants></PropertyGroup>"
            + '</Project>';
        // As MSBuild sets a property, the configuration's group replaces the list (none names $(DefineConstants)).
        assert.deepStrictEqual(parseDefineConstants(text, 'Debug'), { b: '2' });
        assert.deepStrictEqual(parseDefineConstants(text, 'release'), { a: '0' });
    });

    test('bug-pin: a project source is decided by the .cwproj\'s DefineConstants', async () => {
        const main = write('Main.clw');
        cwproj('App', [defines('_ABCDllMode_=&gt;1%3b')], ['<Compile Include="Main.clw" />']);
        await load('App');
        assert.deepStrictEqual(decide(main), [LIB]);
    });

    test('the other value decides the other way, and the active configuration is the one read', async () => {
        const main = write('Main.clw');
        cwproj('App', [defines('_ABCDllMode_=&gt;0', " '$(Configuration)' == 'Debug' "), defines('_ABCDllMode_=&gt;1', " '$(Configuration)' == 'Release' ")],
            ['<Compile Include="Main.clw" />']);
        await load('App');
        assert.deepStrictEqual(decide(main), [DLL]);
        const deps = recordedDependencies(main);
        serverSettings.configuration = 'Release';
        assert.strictEqual(dependenciesUnchanged(deps), false, 'another configuration is another answer');
        assert.deepStrictEqual(decide(main), [LIB]);
    });

    test('a .prj\'s #pragma define, and a source\'s own /define, come after DefineConstants', async () => {
        const main = write('Main.clw');
        const other = write('Other.clw', source.replace('PROGRAM', "MEMBER('Main')"));
        fs.writeFileSync(path.join(root, 'App.prj'), '#pragma define(_ABCDllMode_=>off)\r\n#compile Main.clw\r\n#compile Other.clw /define(_ABCDllMode_=>on)\r\n');
        cwproj('App', [defines('_ABCDllMode_=&gt;1')], ['<Include Include="App.prj" />']);
        await load('App');
        assert.deepStrictEqual(decide(main), [DLL], 'the .prj says off');
        assert.deepStrictEqual(decide(other), [LIB], 'its own /define says on');
    });

    test('a header no project compiles is not decided by any project', async () => {
        write('Main.clw');
        const header = write('Shared.inc');
        cwproj('App', [defines('_ABCDllMode_=&gt;1')], ['<Compile Include="Main.clw" />']);
        await load('App');
        assert.deepStrictEqual(decide(header), []);
    });

    test('a source two projects compile is decided only when they agree', async () => {
        const main = write('Main.clw');
        cwproj('App', [defines('_ABCDllMode_=&gt;1')], ['<Compile Include="Main.clw" />']);
        cwproj('Other', [defines('_ABCDllMode_=&gt;0')], ['<Compile Include="Main.clw" />']);
        await load('App', 'Other');
        assert.deepStrictEqual(decide(main), [], 'they disagree');
        cwproj('Other', [defines('_ABCDllMode_=&gt;1')], ['<Compile Include="Main.clw" />']);
        await load('App', 'Other');
        assert.deepStrictEqual(decide(main), [LIB], 'they agree');
    });

    test('editing the define in the .cwproj decides the file again', async () => {
        const main = write('Main.clw');
        cwproj('App', [defines('_ABCDllMode_=&gt;1')], ['<Compile Include="Main.clw" />']);
        await load('App');
        assert.deepStrictEqual(decide(main), [LIB]);
        const deps = recordedDependencies(main);
        cwproj('App', [defines('_ABCDllMode_=&gt;0')], ['<Compile Include="Main.clw" />']);
        const later = new Date(Date.now() + 5000);
        fs.utimesSync(path.join(root, 'App.cwproj'), later, later);
        assert.strictEqual(dependenciesUnchanged(deps), false);
        assert.deepStrictEqual(decide(main), [DLL]);
    });

    // Review of #812.
    test('bug-pin: the configuration as it is stored, Debug|Win32, picks its groups (and its platform)', async () => {
        const text = '<Project>'
            + "<PropertyGroup Condition=\" '$(Configuration)|$(Platform)' == 'Debug|Win32' \"><DefineConstants>A=&gt;1</DefineConstants></PropertyGroup>"
            + "<PropertyGroup Condition=\" '$(Configuration)|$(Platform)' == 'Debug|x64' \"><DefineConstants>A=&gt;9</DefineConstants></PropertyGroup>"
            + "<PropertyGroup Condition=\" '$(Configuration)' != 'Release' \"><DefineConstants>$(DefineConstants)%3bB=&gt;1</DefineConstants></PropertyGroup>"
            + '</Project>';
        assert.deepStrictEqual(parseDefineConstants(text, 'Debug|Win32'), { a: '1', b: '1' });
        assert.deepStrictEqual(parseDefineConstants(text, 'Release|Win32'), {});
        const main = write('Main.clw');
        cwproj('App', [defines('_ABCDllMode_=&gt;1', " '$(Configuration)|$(Platform)' == 'Debug|Win32' ")], ['<Compile Include="Main.clw" />']);
        serverSettings.configuration = 'Debug|Win32';
        await load('App');
        assert.deepStrictEqual(decide(main), [LIB]);
    });

    test('a later group replaces DefineConstants unless it names $(DefineConstants); a commented one is not read', () => {
        const text = '<Project>'
            + '<PropertyGroup><DefineConstants>A=&gt;1%3bB=&gt;1</DefineConstants></PropertyGroup>'
            + '<PropertyGroup><DefineConstants>C=&gt;1</DefineConstants></PropertyGroup>'
            + '<!-- <PropertyGroup><DefineConstants>D=&gt;1</DefineConstants></PropertyGroup> -->'
            + '</Project>';
        assert.deepStrictEqual(parseDefineConstants(text, 'Debug'), { c: '1' });
    });

    test('bug-pin: a source that joins a project, or a second project that defines it otherwise, is decided again', async () => {
        const main = write('Main.clw');
        const x = write('X.clw', source.replace('PROGRAM', "MEMBER('Main')"));
        cwproj('App', [defines('_ABCDllMode_=&gt;1')], ['<Compile Include="Main.clw" />']);
        cwproj('Other', [defines('_ABCDllMode_=&gt;0')], ['<Compile Include="Y.clw" />']);
        await load('App', 'Other');
        assert.deepStrictEqual(decide(x), [], 'in no project');
        assert.deepStrictEqual(decide(main), [LIB]);
        const xDeps = recordedDependencies(x), mainDeps = recordedDependencies(main);

        const sm = SolutionManager.getInstance()!;
        const [app, other] = sm.solution.projects;
        cwproj('App', [defines('_ABCDllMode_=&gt;1')], ['<Compile Include="Main.clw" />', '<Compile Include="X.clw" />']);
        await app.reloadSourceFiles();
        assert.strictEqual(dependenciesUnchanged(xDeps), false, 'X joined App');
        assert.deepStrictEqual(decide(x), [LIB]);

        cwproj('Other', [defines('_ABCDllMode_=&gt;0')], ['<Compile Include="Main.clw" />']);
        await other.reloadSourceFiles();
        assert.strictEqual(dependenciesUnchanged(mainDeps), false, 'Other compiles Main too, and disagrees');
        assert.deepStrictEqual(decide(main), []);
    });

    test('a source added to a project in place is owned at once', async () => {
        write('Main.clw');
        const x = write('X.clw', source.replace('PROGRAM', "MEMBER('Main')"));
        cwproj('App', [defines('_ABCDllMode_=&gt;1')], ['<Compile Include="Main.clw" />']);
        await load('App');
        assert.deepStrictEqual(decide(x), []);
        const app = SolutionManager.getInstance()!.solution.projects[0];
        app.sourceFiles.push(new (app.sourceFiles[0].constructor as any)('X.clw', 'X.clw', app));
        fs.writeFileSync(x, fs.readFileSync(x, 'utf8') + '\r\n'); // a new text, so the answer is not the cached one
        assert.deepStrictEqual(decide(x), [LIB]);
    });

    test('with two .prj files, the source\'s own /define still wins', async () => {
        const main = write('Main.clw');
        fs.writeFileSync(path.join(root, 'A.prj'), '#compile Main.clw /define(_ABCDllMode_=>on)\r\n');
        fs.writeFileSync(path.join(root, 'B.prj'), '#pragma define(_ABCDllMode_=>off)\r\n');
        cwproj('App', [], ['<Include Include="A.prj" />', '<Include Include="B.prj" />']);
        await load('App');
        assert.deepStrictEqual(decide(main), [LIB]);
    });

    test('a file decided before the solution loaded is decided again once it has', async () => {
        const main = write('Main.clw');
        cwproj('App', [defines('_ABCDllMode_=&gt;1')], ['<Compile Include="Main.clw" />']);
        assert.deepStrictEqual(decide(main), [], 'no solution yet: not decided');
        const deps = recordedDependencies(main);
        await load('App');
        assert.strictEqual(dependenciesUnchanged(deps), false, 'the solution loading changes the answer');
        assert.deepStrictEqual(decide(main), [LIB]);
    });
});
