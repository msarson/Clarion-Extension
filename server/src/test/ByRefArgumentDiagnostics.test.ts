import * as assert from 'assert';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { TokenCache } from '../TokenCache';
import { validateByRefArguments } from '../providers/diagnostics/ByRefArgumentDiagnostics';

/**
 * Issue #244 — flag passing a non-addressable literal to a by-reference parameter.
 * A literal has no address, so it cannot bind a `*TYPE` (by-ref) parameter — a Clarion
 * compile error the extension can catch. Conservative: only for calls resolving to a single
 * unambiguous same-file MAP signature.
 */
function build(src: string) {
    const cache = TokenCache.getInstance();
    cache.clearAllTokens();
    const doc = TextDocument.create('file:///byref-244.clw', 'clarion', 1, src);
    const tokens = cache.getTokens(doc);
    const structure = cache.getStructure(doc);
    return { doc, tokens, structure };
}

const SRC = [
    '  PROGRAM',                          // 0
    '  MAP',                              // 1
    'Update  PROCEDURE(*STRING pName)',   // 2 — by-ref STRING
    'Compute PROCEDURE(LONG pVal)',       // 3 — by-value LONG
    '  END',                              // 4
    '',                                   // 5
    'Name  STRING(20)',                   // 6
    '  CODE',                             // 7
    "  Update('literal')",                // 8 — WRONG: literal to *STRING
    '  Update(Name)',                     // 9 — OK: variable
    '  Compute(5)',                       // 10 — OK: literal to value LONG
].join('\n');

suite('ByRefArgumentDiagnostics (#244)', () => {
    test('flags a literal passed to a *STRING (by-ref) parameter', () => {
        const { doc, tokens } = build(SRC);
        const diags = validateByRefArguments(tokens, doc);
        assert.strictEqual(diags.length, 1, `expected exactly 1 diagnostic, got ${diags.length}: ${diags.map(d => d.message).join(' | ')}`);
        assert.strictEqual(diags[0].range.start.line, 8, 'diagnostic should be on the Update(\'literal\') call line');
    });

    test('does NOT flag a variable passed by-ref, or a literal to a by-value param', () => {
        const { doc, tokens } = build(SRC);
        const diags = validateByRefArguments(tokens, doc);
        const lines = diags.map(d => d.range.start.line);
        assert.ok(!lines.includes(9), 'Update(Name) — a variable to *STRING is valid, must not flag');
        assert.ok(!lines.includes(10), 'Compute(5) — a literal to a by-value LONG is valid, must not flag');
    });

    test('does not flag overloaded procedures (ambiguous which signature)', () => {
        const { doc, tokens } = build([
            '  PROGRAM',
            '  MAP',
            'Set  PROCEDURE(*STRING s)',
            'Set  PROCEDURE(LONG n)',
            '  END',
            '  CODE',
            "  Set('x')",
        ].join('\n'));
        const diags = validateByRefArguments(tokens, doc);
        assert.strictEqual(diags.length, 0, 'overloaded call must be skipped (could match the LONG overload)');
    });
});
