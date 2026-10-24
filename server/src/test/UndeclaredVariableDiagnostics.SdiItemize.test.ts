import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { ClarionTokenizer } from '../ClarionTokenizer';
import { TokenCache } from '../TokenCache';
import { ScopeAnalyzer } from '../utils/ScopeAnalyzer';
import { SymbolFinderService } from '../services/SymbolFinderService';
import { StructureDeclarationIndexer } from '../utils/StructureDeclarationIndexer';
import { validateUndeclaredVariablesAsync } from '../providers/diagnostics/UndeclaredVariableDiagnostics';
import { serverSettings } from '../serverSettings';

/**
 * ITEMIZE equates in an SDI-indexed include, written the way the shipped equate files
 * write them: blank-label `ITEMIZE` with an indented END, and a prefix that may itself
 * contain a colon (`ITEMIZE,PRE(AB:CD)`).
 *
 * Two scanner defects made the index disagree with the compiler:
 *   - the indented END never closed the block, so an EQUATE after it was indexed under
 *     the last PRE (`Evt:Refresh` as `Btn:Evt:Refresh`) and its real name fired;
 *   - `PRE(AB:CD)` yielded no prefix, so the members were indexed bare — `AB:CD:Shade`
 *     fired while an undeclared bare `Shade` was silently accepted.
 *
 * Contract (both directions):
 *   1. Names the include really declares (`Evt:Refresh`, `AB:CD:Shade`, `Btn:Ok`) do NOT fire.
 *   2. A bare member name (`Shade`) that the include does not declare DOES fire.
 */
suite('UndeclaredVariableDiagnostics — SDI ITEMIZE close and colon PRE', () => {

    let savedUndeclaredEnabled = false;
    let savedLibsrc: string[] = [];
    let tmpDir: string;

    suiteSetup(async () => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sdi-itemize-'));
        fs.writeFileSync(path.join(tmpDir, 'itemequ.equ'), [
            '                     ITEMIZE,PRE(AB:CD)',
            'Shade                  EQUATE(-1)',
            '                     END',
            '',
            '                     ITEMIZE(200),PRE(Btn)',
            'Ok                     EQUATE',
            '                     END',
            '',
            'Evt:Refresh          EQUATE(282H)',
            '',
            'Tint                 ITEMIZE(0),PRE',
            'Glossy                 EQUATE',
            '                     END',
            '',
            'KeyState             ITEMIZE,PRE()',
            'KeyState:Down          EQUATE(1)',
            'Held                   EQUATE',
            '                     END',
            '',
        ].join('\n'), 'utf8');
        const indexer = StructureDeclarationIndexer.getInstance();
        savedLibsrc = serverSettings.libsrcPaths;
        serverSettings.libsrcPaths = [tmpDir];
        const built = await indexer.buildIndex(tmpDir);
        assert.ok(built.byName.has('btn:ok'), 'fixture sanity: the SDI scan indexed Btn:Ok');
        // Register directly, as the #298 suite does — buildIndex does not register.
        (indexer as any).indexes.set((indexer as any).normalizeKey(tmpDir), built);
    });

    suiteTeardown(() => {
        serverSettings.libsrcPaths = savedLibsrc;
        StructureDeclarationIndexer.getInstance().clearProjectCache(tmpDir);
        try {
            fs.unlinkSync(path.join(tmpDir, 'itemequ.equ'));
            fs.rmdirSync(tmpDir);
        } catch { /* best-effort cleanup */ }
    });

    setup(() => {
        savedUndeclaredEnabled = serverSettings.undeclaredVariablesEnabled;
        serverSettings.undeclaredVariablesEnabled = true;
    });

    teardown(() => {
        serverSettings.undeclaredVariablesEnabled = savedUndeclaredEnabled;
    });

    test('declared ITEMIZE/after-ITEMIZE equates do not fire; a bare member name does', async () => {
        const code = [
            '  PROGRAM',                                    // 0
            '  MAP',                                        // 1
            '  END',                                        // 2
            '  CODE',                                       // 3
            '  RETURN',                                     // 4
            '',                                             // 5
            'MyProc  PROCEDURE',                            // 6
            'k           LONG',                             // 7
            '  CODE',                                       // 8
            '  k = Evt:Refresh',                            // 9  — declared after an indented END: no fire
            '  k = AB:CD:Shade',                            // 10 — colon-PRE member: no fire
            '  k = Btn:Ok',                                 // 11 — plain-PRE member: no fire
            '  k = Shade',                                  // 12 — bare member name, not declared: fires
            '  RETURN',                                     // 13
        ].join('\n');
        const doc = TextDocument.create('file:///test-sdi-itemize.clw', 'clarion', 1, code);
        const tokens = new ClarionTokenizer(code).tokenize();

        const tokenCache = TokenCache.getInstance();
        const scopeAnalyzer = new ScopeAnalyzer(tokenCache, undefined as never);
        const symbolFinder = new SymbolFinderService(tokenCache, scopeAnalyzer);
        const diags = await validateUndeclaredVariablesAsync(tokens, doc, symbolFinder);

        const all = () => JSON.stringify(diags.map(d => ({ line: d.range.start.line, msg: d.message })));
        const byLine = (line: number) => diags.find(d => d.range.start.line === line);

        assert.strictEqual(byLine(9), undefined, 'expected NO diagnostic on Evt:Refresh; got: ' + all());
        assert.strictEqual(byLine(10), undefined, 'expected NO diagnostic on AB:CD:Shade; got: ' + all());
        assert.strictEqual(byLine(11), undefined, 'expected NO diagnostic on Btn:Ok; got: ' + all());

        const bare = byLine(12);
        assert.ok(bare, 'expected a diagnostic on bare Shade (only AB:CD:Shade is declared); got: ' + all());
        assert.ok(/Shade/i.test(String(bare.message)), 'expected the diagnostic to name Shade; got: ' + bare.message);
    });

    test('empty-prefix ITEMIZE members use the label; a pre-qualified member is not doubled', async () => {
        const code = [
            '  PROGRAM',                                    // 0
            '  MAP',                                        // 1
            '  END',                                        // 2
            '  CODE',                                       // 3
            '  RETURN',                                     // 4
            '',                                             // 5
            'MyProc  PROCEDURE',                            // 6
            'k           LONG',                             // 7
            '  CODE',                                       // 8
            '  k = Tint:Glossy',                            // 9  — `Tint ITEMIZE,PRE` member: no fire
            '  k = KeyState:Down',                          // 10 — pre-qualified member of `KeyState ITEMIZE,PRE()`: no fire
            '  k = KeyState:Held',                          // 11 — `KeyState ITEMIZE,PRE()` member: no fire
            '  k = Glossy',                                 // 12 — bare member name, not declared: fires
            '  RETURN',                                     // 13
        ].join('\n');
        const doc = TextDocument.create('file:///test-sdi-itemize-empty-pre.clw', 'clarion', 1, code);
        const tokens = new ClarionTokenizer(code).tokenize();

        const tokenCache = TokenCache.getInstance();
        const scopeAnalyzer = new ScopeAnalyzer(tokenCache, undefined as never);
        const symbolFinder = new SymbolFinderService(tokenCache, scopeAnalyzer);
        const diags = await validateUndeclaredVariablesAsync(tokens, doc, symbolFinder);

        const all = () => JSON.stringify(diags.map(d => ({ line: d.range.start.line, msg: d.message })));
        const byLine = (line: number) => diags.find(d => d.range.start.line === line);

        assert.strictEqual(byLine(9), undefined, 'expected NO diagnostic on Tint:Glossy; got: ' + all());
        assert.strictEqual(byLine(10), undefined, 'expected NO diagnostic on KeyState:Down; got: ' + all());
        assert.strictEqual(byLine(11), undefined, 'expected NO diagnostic on KeyState:Held; got: ' + all());

        const bare = byLine(12);
        assert.ok(bare, 'expected a diagnostic on bare Glossy (only Tint:Glossy is declared); got: ' + all());
        assert.ok(/Glossy/i.test(String(bare.message)), 'expected the diagnostic to name Glossy; got: ' + bare.message);
    });
});
