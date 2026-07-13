import * as assert from 'assert';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { ClarionTokenizer } from '../ClarionTokenizer';
import { TokenCache } from '../TokenCache';
import { ScopeAnalyzer } from '../utils/ScopeAnalyzer';
import { SymbolFinderService } from '../services/SymbolFinderService';
import { validateUndeclaredVariablesAsync } from '../providers/diagnostics/UndeclaredVariableDiagnostics';
import { serverSettings } from '../serverSettings';
import {
    buildMultiFileFixture,
    teardownMultiFileFixture
} from './helpers/MultiFileFARFixture';

/**
 * Issue #334 — globals declared in files pulled in via `INCLUDE(...),ONCE`
 * from the main module were invisible to `SymbolFinder.findSymbol`'s
 * variable-scope chain: `findGlobalVariableInParentFile` scanned only the
 * parent PROGRAM's own column-0 labels, never its INCLUDE directives. The
 * undeclared-variable diagnostic flagged such globals while hover resolved
 * them via its INCLUDE-aware paths ("recognized and not recognized at the
 * same time").
 *
 * Field-reported by Edin (@Chahton) on #82/#334/#336. Fixture shapes are his
 * verbatim declarations:
 *   - `globalRequest  LONG(0),THREAD,EXTERNAL,DLL(dll_mode)` (plain global)
 *   - `RobObj  LIKE(EntClassType),THREAD,EXTERNAL,DLL(dll_mode)` (LIKE instance)
 *   - `RobQ  QUEUE(SetupQueueType),THREAD,EXTERNAL,DLL(dll_mode).` (QUEUE instance)
 */

async function runDiagnostic(
    cursorDoc: TextDocument
): Promise<{ line: number; col: number; message: string }[]> {
    const tokenCache = TokenCache.getInstance();
    const scopeAnalyzer = new ScopeAnalyzer(tokenCache, undefined as never);
    const symbolFinder = new SymbolFinderService(tokenCache, scopeAnalyzer);
    const tokens = new ClarionTokenizer(cursorDoc.getText()).tokenize();

    const diags = await validateUndeclaredVariablesAsync(tokens, cursorDoc, symbolFinder);
    return diags.map(d => ({
        line: d.range.start.line,
        col: d.range.start.character,
        message: typeof d.message === 'string' ? d.message : ''
    }));
}

suite('UndeclaredVariableDiagnostics — INCLUDE-chain globals (#334)', () => {

    let savedUndeclaredEnabled = false;

    setup(() => {
        savedUndeclaredEnabled = serverSettings.undeclaredVariablesEnabled;
        serverSettings.undeclaredVariablesEnabled = true;
    });

    teardown(() => {
        serverSettings.undeclaredVariablesEnabled = savedUndeclaredEnabled;
        teardownMultiFileFixture();
    });

    function buildEdinFixture() {
        return buildMultiFileFixture({
            files: {
                'SimpleNewSln.clw': [
                    '  PROGRAM',
                    '  MAP',
                    '  END',
                    "  INCLUDE('Globals.inc'),ONCE",
                    "  INCLUDE('WandKlase.inc'),ONCE",
                    '  CODE',
                    '  RETURN',
                ].join('\n'),
                'Globals.inc': [
                    'globalRequest                   LONG(0),THREAD,EXTERNAL,DLL(dll_mode)',
                    "  INCLUDE('Deep.inc'),ONCE",
                ].join('\n'),
                'Deep.inc': [
                    'DeepVar                         LONG',
                ].join('\n'),
                'WandKlase.inc': [
                    'RobQ                            QUEUE(SetupQueueType),THREAD,EXTERNAL,DLL(dll_mode).',
                    'RobObj                          LIKE(EntClassType),THREAD,EXTERNAL,DLL(dll_mode)',
                ].join('\n'),
                'MyNextProcedure.clw': [
                    "  MEMBER('SimpleNewSln.clw')",   // line 0
                    '  MAP',                           // line 1
                    '  END',                           // line 2
                    'MyNextProcedure PROCEDURE',       // line 3
                    '  CODE',                          // line 4
                    '  globalRequest = 1',             // line 5 — plain global via INCLUDE
                    '  RobObj.IgnoreLocSetup = true',  // line 6 — LIKE-instance via INCLUDE
                    '  RobQ.Broj = 1',                 // line 7 — QUEUE-instance via INCLUDE
                    '  DeepVar = 1',                   // line 8 — nested INCLUDE chain
                    '  NotDeclaredAnywhere = 1',       // line 9 — sentinel: must still fire
                    '  RETURN',                        // line 10
                ].join('\n'),
            },
            frg: { programFile: 'SimpleNewSln.clw', memberFiles: ['MyNextProcedure.clw'] }
        });
    }

    test('plain global via INCLUDE from PROGRAM — no fire (globalRequest)', async () => {
        const fixture = buildEdinFixture();
        const diags = await runDiagnostic(fixture.documents['MyNextProcedure.clw']);
        assert.strictEqual(
            diags.find(d => d.line === 5), undefined,
            `expected NO diagnostic on globalRequest (declared in Globals.inc via PROGRAM INCLUDE); got: ${JSON.stringify(diags)}`);
    });

    test('LIKE(class) instance via INCLUDE from PROGRAM — no fire (RobObj)', async () => {
        const fixture = buildEdinFixture();
        const diags = await runDiagnostic(fixture.documents['MyNextProcedure.clw']);
        assert.strictEqual(
            diags.find(d => d.line === 6), undefined,
            `expected NO diagnostic on RobObj (declared in WandKlase.inc via PROGRAM INCLUDE); got: ${JSON.stringify(diags)}`);
    });

    test('QUEUE(type) instance via INCLUDE from PROGRAM — no fire (RobQ)', async () => {
        const fixture = buildEdinFixture();
        const diags = await runDiagnostic(fixture.documents['MyNextProcedure.clw']);
        assert.strictEqual(
            diags.find(d => d.line === 7), undefined,
            `expected NO diagnostic on RobQ (declared in WandKlase.inc via PROGRAM INCLUDE); got: ${JSON.stringify(diags)}`);
    });

    test('nested INCLUDE chain (PROGRAM -> Globals.inc -> Deep.inc) — no fire (DeepVar)', async () => {
        const fixture = buildEdinFixture();
        const diags = await runDiagnostic(fixture.documents['MyNextProcedure.clw']);
        assert.strictEqual(
            diags.find(d => d.line === 8), undefined,
            `expected NO diagnostic on DeepVar (declared in Deep.inc, two INCLUDEs deep); got: ${JSON.stringify(diags)}`);
    });

    test('sentinel: genuinely undeclared name in the same fixture still fires', async () => {
        const fixture = buildEdinFixture();
        const diags = await runDiagnostic(fixture.documents['MyNextProcedure.clw']);
        const sentinel = diags.find(d => d.line === 9);
        assert.ok(
            sentinel,
            `expected diagnostic on NotDeclaredAnywhere at line 9; got: ${JSON.stringify(diags)}`);
        assert.ok(sentinel!.message.includes("'NotDeclaredAnywhere'"));
    });

    test('convergence: findSymbol resolves RobObj to its declaration in WandKlase.inc', async () => {
        const fixture = buildEdinFixture();
        const tokenCache = TokenCache.getInstance();
        const scopeAnalyzer = new ScopeAnalyzer(tokenCache, undefined as never);
        const symbolFinder = new SymbolFinderService(tokenCache, scopeAnalyzer);

        const memberDoc = fixture.documents['MyNextProcedure.clw'];
        const result = await symbolFinder.findSymbol('RobObj', memberDoc, { line: 6, character: 2 });

        assert.ok(result, 'findSymbol must resolve RobObj through the PROGRAM INCLUDE chain');
        assert.ok(
            result!.location.uri.toLowerCase().endsWith('wandklase.inc'),
            `expected declaration location in WandKlase.inc; got: ${result!.location.uri}`);
        assert.strictEqual(result!.location.line, 1, 'RobObj is declared on line 1 of WandKlase.inc');
    });
});
