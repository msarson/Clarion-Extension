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
 * #298 — false "'X' is not declared in this file" for cross-file EQUATEs that
 * hover resolves (Mark's repro: SelectRecord from the template-action equates,
 * CtrlShiftP from KEYCODES.CLW in libsrc).
 *
 * The validator's cross-file augmentation goes through
 * `SymbolFinderService.findSymbol` (the variable-scope chain), which does not
 * cover INCLUDE-chain / libsrc EQUATEs — but the structure declaration index
 * (SDI) indexes exactly those (EQUATE + ITEMIZE_EQUATE across the redirection
 * search paths and libsrc), and hover answers from it. The diagnostic is
 * documented as conservative: if ANY of the extension's own resolution paths
 * knows the name, it must not fire.
 *
 * Contract (bidirectional per feedback_bidirectional_pin_assertion):
 *   1. A name declared as an EQUATE in an SDI-indexed file does NOT fire.
 *   2. A genuinely undeclared name in the same document STILL fires.
 */
suite('UndeclaredVariableDiagnostics — SDI-indexed EQUATEs (#298)', () => {

    let savedUndeclaredEnabled = false;
    let savedLibsrc: string[] = [];
    let tmpDir: string;

    suiteSetup(async () => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'issue298-'));
        // Column-0 labels, mirroring KEYCODES.CLW / template-equate shapes
        fs.writeFileSync(path.join(tmpDir, 'keyequ.inc'), [
            'CtrlShiftP          EQUATE(2150h)',
            'SelectRecord        EQUATE(4)',
            '',
        ].join('\n'), 'utf8');
        const indexer = StructureDeclarationIndexer.getInstance();
        savedLibsrc = serverSettings.libsrcPaths;
        serverSettings.libsrcPaths = [tmpDir]; // buildIndex scans libsrc paths (same seam as the #290 disk-cache suite)
        const built = await indexer.buildIndex(tmpDir);
        assert.ok(built.byName.has('ctrlshiftp'), 'fixture sanity: the SDI scan indexed CtrlShiftP');
        // buildIndex returns the index without registering it (only getOrBuildIndex registers,
        // and its solution-state guards are environment-dependent in a shared test process) —
        // register directly so find() sees it, exactly as a solution-load prebuild would leave it.
        (indexer as any).indexes.set((indexer as any).normalizeKey(tmpDir), built);
    });

    suiteTeardown(() => {
        serverSettings.libsrcPaths = savedLibsrc;
        StructureDeclarationIndexer.getInstance().clearProjectCache(tmpDir);
        try {
            fs.unlinkSync(path.join(tmpDir, 'keyequ.inc'));
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

    test('SDI-indexed EQUATEs do not fire; a genuinely undeclared name still does', async () => {
        const code = [
            "  PROGRAM",                                   // 0
            '  MAP',                                        // 1
            '  END',                                        // 2
            '  CODE',                                       // 3
            '  RETURN',                                     // 4
            '',                                             // 5
            'MyProc  PROCEDURE',                            // 6
            'k           LONG',                             // 7
            '  CODE',                                       // 8
            '  k = CtrlShiftP',                             // 9  — EQUATE known to the SDI: no fire
            '  k = SelectRecord',                           // 10 — EQUATE known to the SDI: no fire
            '  k = definitelyBogus298',                     // 11 — genuinely undeclared: fires
            '  RETURN',                                     // 12
        ].join('\n');
        const doc = TextDocument.create('file:///test-298.clw', 'clarion', 1, code);
        const tokens = new ClarionTokenizer(code).tokenize();

        const tokenCache = TokenCache.getInstance();
        const scopeAnalyzer = new ScopeAnalyzer(tokenCache, undefined as never);
        const symbolFinder = new SymbolFinderService(tokenCache, scopeAnalyzer);
        const diags = await validateUndeclaredVariablesAsync(tokens, doc, symbolFinder);

        const byLine = (line: number) => diags.find(d => d.range.start.line === line);

        assert.strictEqual(byLine(9), undefined,
            "expected NO diagnostic on CtrlShiftP (EQUATE indexed by the SDI — hover resolves it); got: " +
            JSON.stringify(diags.map(d => ({ line: d.range.start.line, msg: d.message }))));
        assert.strictEqual(byLine(10), undefined,
            "expected NO diagnostic on SelectRecord (EQUATE indexed by the SDI — hover resolves it); got: " +
            JSON.stringify(diags.map(d => ({ line: d.range.start.line, msg: d.message }))));

        const bogus = byLine(11);
        assert.ok(bogus,
            'sentinel: expected a diagnostic on definitelyBogus298 (genuinely undeclared) — ' +
            'the SDI fallback must not mask everything; got: ' +
            JSON.stringify(diags.map(d => ({ line: d.range.start.line, msg: d.message }))));
        assert.ok(/definitelyBogus298/i.test(bogus.message),
            'expected the sentinel diagnostic to reference definitelyBogus298; got: ' + bogus.message);
    });
});
