import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Diagnostic } from 'vscode-languageserver/node';
import { Position } from 'vscode-languageserver-protocol';
import { ClarionTokenizer } from '../ClarionTokenizer';
import { CompilerFlagService } from '../utils/CompilerFlagService';
import { HoverProvider } from '../providers/HoverProvider';
import { DefinitionProvider } from '../providers/DefinitionProvider';
import { validateUndeclaredVariables } from '../providers/diagnostics/UndeclaredVariableDiagnostics';

/**
 * #420 — Clarion's PREDEFINED COMPILER FLAGS (DLL_MODE, LIB_MODE, _DEBUG_,
 * _WIDTH32_, the _Cxx_ / _VER_Cxx families) are set by the compiler / project
 * system and declared in NO source file. Every cross-file tier used to cold-load
 * the whole include universe to prove that miss (10.5s hover on `DLL(dll_mode)`
 * in an 11K-line generated PROGRAM module) and then show nothing.
 *
 * Now: hover renders a documentation card, F12 bails before the cross-file
 * tiers, and the undeclared-variable diagnostic never flags them. A user
 * declaration of the same name in the current file still wins (shadowing).
 */

function toUri(fsPath: string): string {
    return 'file:///' + fsPath.replace(/\\/g, '/').replace(/^([a-zA-Z]):/, (_m, d) => d + '%3A');
}
function cursorOn(source: string, needle: string, offset = 0): Position {
    const lines = source.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
        const idx = lines[i].indexOf(needle);
        if (idx !== -1) return { line: i, character: idx + offset };
    }
    throw new Error(`cursorOn: '${needle}' not found`);
}
function hoverText(hover: unknown): string {
    if (!hover) return '';
    const contents = (hover as { contents: { value?: string } | string }).contents;
    return typeof contents === 'string' ? contents : (contents.value ?? '');
}

// The exact shape from IBSCommon.clw:227 — a MODULE prototype in the global MAP
// (no enclosing scope), DLL(dll_mode) attribute, nothing named dll_mode anywhere.
const PROGRAM_WITH_DLL_MODE =
    "  PROGRAM\n" +
    "  MAP\n" +
    "     MODULE('FileExplorerDLL.Lib')\n" +
    "fe_ClassVersion        PROCEDURE(byte Flag=0),string,name('fe_ClassVersion'),DLL(dll_mode)\n" +
    "     END\n" +
    "  END\n" +
    "  CODE\n" +
    "  RETURN\n";

suite('Predefined compiler flags (#420)', () => {

    suite('CompilerFlagService', () => {
        const svc = CompilerFlagService.getInstance();

        test('recognises the documented named flags, case-insensitively', () => {
            for (const name of ['DLL_MODE', 'dll_mode', 'Dll_Mode', 'LIB_MODE', '_DEBUG_', '_debug_', '_WIDTH32_']) {
                assert.ok(svc.isCompilerFlag(name), `${name} must be a compiler flag`);
            }
        });

        test('recognises the _Cxx_ "version and later" family and the _VER_Cxx exact-version family', () => {
            assert.ok(svc.isCompilerFlag('_C55_'));
            assert.ok(svc.isCompilerFlag('_C70_'));
            assert.ok(svc.isCompilerFlag('_C80_'));
            assert.ok(svc.isCompilerFlag('_C100_'), 'three-digit version (Clarion 10.0)');
            assert.ok(svc.isCompilerFlag('_VER_C10'));
            assert.ok(svc.isCompilerFlag('_ver_c12'));
            assert.strictEqual(svc.getFlag('_C70_')!.description, 'On for Clarion, version 7.0 and later.');
            assert.strictEqual(svc.getFlag('_C63_')!.description, 'On for Clarion, version 6.3 and later.');
            assert.ok(svc.getFlag('_VER_C11')!.description.includes('11'));
        });

        test('does not match ordinary identifiers or near-misses', () => {
            for (const name of ['DLLMODE', 'dll_modes', 'MyVar', '_C7_', '_CXX_', 'VER_C10', 'DEBUG', 'GlobalRequest']) {
                assert.strictEqual(svc.isCompilerFlag(name), false, `${name} must NOT be a compiler flag`);
            }
        });

        test('getFlag returns the canonical upper-case name and help text', () => {
            const flag = svc.getFlag('dll_mode')!;
            assert.strictEqual(flag.name, 'DLL_MODE');
            assert.ok(flag.description.includes('runtime DLLs'));
        });
    });

    suite('hover / F12 / diagnostic surfaces', () => {
        let tmpRoot: string;
        setup(() => { tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'compiler-flag-420-')); });
        teardown(() => { try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch { /* best-effort */ } });

        test('hover on DLL(dll_mode) in a global MAP shows the compiler-flag card (no include walk)', async () => {
            const file = path.join(tmpRoot, 'prog.clw');
            fs.writeFileSync(file, PROGRAM_WITH_DLL_MODE);
            const doc = TextDocument.create(toUri(file), 'clarion', 1, PROGRAM_WITH_DLL_MODE);
            const hover = await new HoverProvider().provideHover(doc, cursorOn(PROGRAM_WITH_DLL_MODE, 'dll_mode', 2));
            const text = hoverText(hover);
            assert.ok(text.includes('DLL_MODE'), `card must name the flag; got:\n${text}`);
            assert.ok(text.includes('Predefined compiler flag'), `card must be the compiler-flag card; got:\n${text}`);
            assert.ok(text.includes('runtime DLLs'), `card must carry the help text; got:\n${text}`);
        });

        test('a user declaration of the same name in the current file still wins over the flag card', async () => {
            const src =
                "  PROGRAM\n" +
                "dll_mode   EQUATE(1)\n" +
                "  MAP\n" +
                "     MODULE('FileExplorerDLL.Lib')\n" +
                "fe_ClassVersion        PROCEDURE(byte Flag=0),string,DLL(dll_mode)\n" +
                "     END\n" +
                "  END\n" +
                "  CODE\n" +
                "  RETURN\n";
            const file = path.join(tmpRoot, 'shadow.clw');
            fs.writeFileSync(file, src);
            const doc = TextDocument.create(toUri(file), 'clarion', 1, src);
            const hover = await new HoverProvider().provideHover(doc, cursorOn(src, 'DLL(dll_mode)', 4));
            const text = hoverText(hover);
            assert.ok(text.length > 0, 'hover must resolve the user EQUATE');
            assert.ok(!text.includes('Predefined compiler flag'),
                `the user's own dll_mode EQUATE must shadow the compiler-flag card; got:\n${text}`);
            assert.ok(text.includes('EQUATE'), `hover must describe the EQUATE declaration; got:\n${text}`);
        });

        test('F12 on dll_mode returns nothing (no declaration to jump to) instead of walking the include universe', async () => {
            const file = path.join(tmpRoot, 'prog.clw');
            fs.writeFileSync(file, PROGRAM_WITH_DLL_MODE);
            const doc = TextDocument.create(toUri(file), 'clarion', 1, PROGRAM_WITH_DLL_MODE);
            const result = await new DefinitionProvider().provideDefinition(doc, cursorOn(PROGRAM_WITH_DLL_MODE, 'dll_mode', 2));
            const empty = result === null || result === undefined || (Array.isArray(result) && result.length === 0);
            assert.ok(empty, `F12 on a compiler flag must be a clean miss; got ${JSON.stringify(result)}`);
        });

        test('the undeclared-variable diagnostic does not flag compiler flags used in CODE', () => {
            const code = [
                'TestProc PROCEDURE()',
                '  CODE',
                '  IF DLL_MODE',
                '  END',
                '  IF _DEBUG_ THEN RETURN.',
                '  IF _C80_ AND NOT LIB_MODE',
                '  END',
                '  ReallyUndeclared += 1',
            ].join('\n');
            const doc = TextDocument.create('file:///test.clw', 'clarion', 1, code);
            const tokens = new ClarionTokenizer(code).tokenize();
            const diags: Diagnostic[] = validateUndeclaredVariables(tokens, doc);
            const flagged = (name: string) => diags.filter(d => typeof d.message === 'string' && d.message.includes(`'${name}'`));
            for (const flag of ['DLL_MODE', '_DEBUG_', '_C80_', 'LIB_MODE']) {
                assert.strictEqual(flagged(flag).length, 0, `${flag} must NOT be flagged as undeclared`);
            }
            assert.ok(flagged('ReallyUndeclared').length >= 1,
                'sentinel: a genuinely undeclared name must still be flagged (the diagnostic still runs)');
        });
    });
});
