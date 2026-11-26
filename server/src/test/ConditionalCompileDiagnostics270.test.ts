import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { DiagnosticProvider } from '../providers/DiagnosticProvider';
import { TokenCache } from '../TokenCache';
import { setServerInitialized } from '../serverState';
import { ClarionProjectServer } from '../solution/clarionProjectServer';
import { SolutionManager } from '../solution/solutionManager';
import { serverSettings } from '../serverSettings';
import { inactiveCodeTest } from '../utils/ConditionalIncludes';

/**
 * #270 — diagnostics fired inside a conditional COMPILE/OMIT block decided not to compile:
 * `COMPILE('***',SW)` with SW off, by an EQUATE or by the project's defines. The facade filter
 * (#255) only dropped unconditional OMIT bodies. It now drops every line #807's reading decides
 * does not compile; a block whose switch is not known stays live.
 */
suite('Diagnostics in conditional COMPILE/OMIT blocks that do not compile (#270)', () => {
    let root: string, savedRed: string, savedConfig: string, savedSm: unknown;

    setup(() => {
        setServerInitialized(true);
        TokenCache.getInstance().clearAllTokens();
        root = fs.mkdtempSync(path.join(os.tmpdir(), 'diag270-'));
        fs.writeFileSync(path.join(root, 'test.red'), '[Common]\r\n*.* = .\r\n');
        savedRed = serverSettings.redirectionFile;
        savedConfig = serverSettings.configuration;
        serverSettings.redirectionFile = 'test.red';
        serverSettings.configuration = 'Debug';
        savedSm = (SolutionManager as unknown as { instance: unknown }).instance;
        (SolutionManager as unknown as { instance: unknown }).instance = null;
    });
    teardown(() => {
        TokenCache.getInstance().clearAllTokens();
        serverSettings.redirectionFile = savedRed;
        serverSettings.configuration = savedConfig;
        (SolutionManager as unknown as { instance: unknown }).instance = savedSm;
        try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* best-effort */ }
    });

    // Line 6 is the live control, line 8 the same defect inside the block.
    const CONTROL = 6, IN_BLOCK = 8;
    const program = (switchLine: string, directive: string) => [
        '  PROGRAM',                  // 0
        switchLine,                   // 1
        '  MAP',                      // 2
        'Foo  PROCEDURE(*LONG x)',    // 3
        '  END',                      // 4
        '  CODE',                     // 5
        '  Foo(3)',                   // 6 — literal to *LONG: a diagnostic (control)
        `  ${directive}`,             // 7
        '  Foo(3)',                   // 8 — the same defect in the block
        '  ***',                      // 9
        '  RETURN',                   // 10
        '',
    ].join('\r\n');

    const write = (name: string, text: string) => { const p = path.join(root, name); fs.writeFileSync(p, text); return p; };
    const linesWithDiagnostics = (file: string) => {
        const text = fs.readFileSync(file, 'utf8');
        const uri = 'file:///' + file.replace(/\\/g, '/');
        const doc = TextDocument.create(uri, 'clarion', 1, text);
        return new Set(DiagnosticProvider.validateDocument(doc, undefined, 'test-270').map(d => d.range.start.line));
    };
    const expect = (file: string, inBlock: boolean, why: string) => {
        const lines = linesWithDiagnostics(file);
        assert.ok(lines.has(CONTROL), 'control: the live call must produce a diagnostic (fixture sanity)');
        assert.strictEqual(lines.has(IN_BLOCK), inBlock, why);
    };

    test('bug-pin: COMPILE on a switch an EQUATE sets to 0 does not compile: no diagnostic in it', () => {
        expect(write('Off.clw', program('SW  EQUATE(0)', "COMPILE('***',SW)")), false,
            'SW is 0, so the block is not compiled and its defect is not in the build');
    });

    test('OMIT on a switch an EQUATE sets to 1 does not compile either', () => {
        expect(write('OmitOn.clw', program('SW  EQUATE(1)', "OMIT('***',SW)")), false,
            'OMIT with a true condition drops its block');
    });

    test('the block that compiles keeps its diagnostic', () => {
        expect(write('On.clw', program('SW  EQUATE(1)', "COMPILE('***',SW)")), true, 'SW is 1: the block compiles');
        expect(write('OmitOff.clw', program('SW  EQUATE(0)', "OMIT('***',SW)")), true, 'OMIT with a false condition keeps its block');
    });

    test('a switch nobody defines leaves the block live', () => {
        expect(write('Unknown.clw', program('', "COMPILE('***',SW)")), true,
            'an undecided block is read as compiled: only noise is removed, never a real report');
    });

    test('a switch from an EQUATE in an earlier INCLUDE decides the block', () => {
        write('Ver.inc', 'SW  EQUATE(0)\r\n');
        expect(write('Included.clw', program("  INCLUDE('Ver.inc')", "COMPILE('***',SW)")), false,
            'the INCLUDEd EQUATE turns the switch off');
    });

    test('a switch the project defines decides the block (DefineConstants SW=>off)', async () => {
        const main = write('Main.clw', program('', "COMPILE('***',SW)"));
        fs.writeFileSync(path.join(root, 'App.cwproj'), [
            '<Project DefaultTargets="Build" xmlns="http://schemas.microsoft.com/developer/msbuild/2003">',
            '  <PropertyGroup><ProjectGuid>{27000000-0000-0000-0000-000000000003}</ProjectGuid></PropertyGroup>',
            '  <PropertyGroup><DefineConstants>SW=&gt;off%3b</DefineConstants></PropertyGroup>',
            '  <ItemGroup>', '    <Compile Include="Main.clw" />', '  </ItemGroup>',
            '</Project>', ''].join('\r\n'));
        const project = new ClarionProjectServer('App', '{12B76EC0-1D7B-4FA7-A7D0-C524288B48A1}', root, '{27000000-0000-0000-0000-000000000003}');
        await project.loadSourceFilesFromProjectFile();
        const sm = Object.create(SolutionManager.prototype) as SolutionManager;
        (sm as unknown as { solution: { projects: ClarionProjectServer[] } }).solution = { projects: [project] };
        (SolutionManager as unknown as { instance: unknown }).instance = sm;

        expect(main, false, 'the project switches SW off, so the compiler never sees the block');
    });

    test('a diagnostic on the directive line itself survives', () => {
        // Never terminated, and decided off: the rest of the file does not compile, but a report
        // about the directive must still show.
        const text = ['  PROGRAM', 'SW  EQUATE(0)', '  CODE', "  COMPILE('***',SW)", '  RETURN', ''].join('\r\n');
        const file = write('Open.clw', text);
        assert.ok(inactiveCodeTest(file, text)(3), 'fixture sanity: the directive line is read as not compiled');
        assert.ok(linesWithDiagnostics(file).has(3), 'the unterminated-block report on the directive line must survive');
    });

    test('inactiveCodeTest answers per line, runs included', () => {
        const text = ['  PROGRAM', 'SW  EQUATE(0)', "  COMPILE('***',SW)", 'a', 'b', '  ***', 'c',
            "  OMIT('!!')", 'd', '  !!', 'e', ''].join('\r\n');
        const test = inactiveCodeTest(path.join(root, 'Runs.clw'), text);
        assert.deepStrictEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].filter(test), [2, 3, 4, 5, 7, 8, 9]);
        assert.strictEqual(inactiveCodeTest(null, '  PROGRAM\r\n  CODE\r\n')(1), false, 'no directive: nothing inactive');
    });
});
