import * as assert from 'assert';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { TokenCache } from '../TokenCache';
import { ClarionTokenizer } from '../ClarionTokenizer';
import { validateMissingMapDeclarations } from '../providers/diagnostics/MapDeclarationDiagnostics';
import { setServerInitialized } from '../serverState';
import { SolutionManager } from '../solution/solutionManager';

/**
 * Issue #338 — a BARE prototype in a member module's own MODULE-LEVEL MAP,
 * implemented in the same file, was flagged `missing-map-declaration`: only
 * MODULE('thisfile.clw')-wrapped entries counted as self-declarations.
 *
 * The Language Reference's own MAP example is exactly the flagged shape
 * (map__declare_procedure_prototypes_.htm):
 *
 *     MEMBER('Sample')
 *     MAP
 *     ComputeIt PROCEDURE
 *     END
 *     ComputeIt PROCEDURE          ! implemented in the same file
 *
 * Generated code always MODULE-wraps its own procedures, which is why this
 * only surfaced from a hand-written fixture (Mark's SmokeTest101 smoke).
 *
 * Fix under test: Case 2c — bare module-level MAP entries with a same-file
 * implementation are self-declarations (signature still compared); bare
 * entries WITHOUT a same-file implementation keep their forward-declaration
 * role and still resolve via the MEMBER parent / warn.
 */

let savedSm: unknown;

function buildDoc(lines: string[]): { doc: TextDocument; tokens: ReturnType<ClarionTokenizer['tokenize']> } {
    const doc = TextDocument.create('file:///c:/test338/mymember.clw', 'clarion', 1, lines.join('\n'));
    return { doc, tokens: new ClarionTokenizer(doc.getText()).tokenize() };
}

suite('Issue #338 — bare MAP self-declarations in member modules', () => {

    setup(() => {
        setServerInitialized(true);
        TokenCache.getInstance().clearAllTokens();
        savedSm = (SolutionManager as unknown as { instance: unknown }).instance;
        // No solution → the cross-file resolver misses → pre-fix, the bare
        // shape falls through to the "no matching declaration" warning.
        (SolutionManager as unknown as { instance: unknown }).instance = null;
    });

    teardown(() => {
        (SolutionManager as unknown as { instance: unknown }).instance = savedSm;
        TokenCache.getInstance().clearAllTokens();
    });

    test('doc-example shape: bare MAP entry + same-file impl — no diagnostic; undeclared impl still flagged', async () => {
        const { doc, tokens } = buildDoc([
            "  MEMBER('Sample.clw')",     // 0
            '  MAP',                       // 1
            'ComputeIt PROCEDURE',         // 2 — bare self-declaration (the docs example)
            '  END',                       // 3
            'ComputeIt PROCEDURE',         // 4 — same-file implementation
            '  CODE',                      // 5
            '  RETURN',                    // 6
            'Ghost PROCEDURE',             // 7 — sentinel: declared nowhere
            '  CODE',                      // 8
            '  RETURN',                    // 9
        ]);

        const diags = await validateMissingMapDeclarations(tokens, doc);
        const onComputeIt = diags.find(d => d.message.includes("'ComputeIt'"));
        assert.strictEqual(
            onComputeIt, undefined,
            `bare MAP entry + same-file impl is the Language Reference's own example and must not warn; got: ${JSON.stringify(diags.map(d => d.message))}`);

        const onGhost = diags.find(d => d.message.includes("'Ghost'"));
        assert.ok(onGhost, `Ghost has no declaration anywhere and must still warn; got: ${JSON.stringify(diags.map(d => d.message))}`);
    });

    test('signature comparison still enforced for bare self-declarations', async () => {
        const { doc, tokens } = buildDoc([
            "  MEMBER('Sample.clw')",
            '  MAP',
            'Frob PROCEDURE(LONG)',        // decl takes LONG
            '  END',
            'Frob PROCEDURE(STRING,LONG)', // impl disagrees
            '  CODE',
            '  RETURN',
        ]);

        const diags = await validateMissingMapDeclarations(tokens, doc);
        const mismatch = diags.find(d => d.code === 'map-signature-mismatch');
        assert.ok(
            mismatch,
            `bare self-declaration with different parameters must raise map-signature-mismatch; got: ${JSON.stringify(diags.map(d => ({ code: d.code, m: d.message })))}`);
    });
});
