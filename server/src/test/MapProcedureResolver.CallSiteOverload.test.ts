import * as assert from 'assert';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Location } from 'vscode-languageserver-protocol';
import { TokenCache } from '../TokenCache';
import { DefinitionProvider } from '../providers/DefinitionProvider';
import { ImplementationProvider } from '../providers/ImplementationProvider';
import { ProcedureSignatureUtils } from '../utils/ProcedureSignatureUtils';
import { setServerInitialized } from '../serverState';

/**
 * #248 — MAP-procedure overload resolution was fed the RAW CALL-SITE LINE where a
 * signature was expected. `ProcedureSignatureUtils.extractParameterTypes` requires
 * the text to start with `name(` or contain PROCEDURE(...), so for a mid-line call
 * (`x = Rep(4)`) it returned [] — which then "exactly matched" a ZERO-PARAMETER
 * overload. F12/Ctrl+F12 jumped to the wrong overload with high confidence.
 *
 * Empirical pre-fix probe (this exact fixture): F12 on `x = Rep(4)` → line 2
 * (0-arg decl); Ctrl+F12 → line 9 (0-arg impl). Both wrong.
 *
 * Fix: when the provided "signature" is actually a call line, classify the call's
 * arguments (same classifier the other overload consumers use) and pick the
 * overload via findOverloadByArgClassifications.
 */

const FIXTURE = [
    '  PROGRAM',                            // 0
    '  MAP',                                // 1
    'Rep            PROCEDURE(),LONG',      // 2 — 0-arg decl
    'Rep            PROCEDURE(LONG),LONG',  // 3 — 1-arg decl
    '  END',                                // 4
    'x    LONG',                            // 5
    '  CODE',                               // 6
    '  x = Rep(4)',                         // 7 — 1-arg call (mid-line)
    '  x = Rep()',                          // 8 — 0-arg call (mid-line)
    'Rep PROCEDURE()',                      // 9 — 0-arg impl
    '  CODE',                               // 10
    '  RETURN 0',                           // 11
    '',                                     // 12
    'Rep PROCEDURE(LONG n)',                // 13 — 1-arg impl
    '  CODE',                               // 14
    '  RETURN n',                           // 15
].join('\n');

function freshDoc(uri: string): TextDocument {
    TokenCache.getInstance().clearAllTokens();
    const doc = TextDocument.create(uri, 'clarion', 1, FIXTURE);
    TokenCache.getInstance().getTokens(doc);
    return doc;
}

function locLine(result: Location | Location[] | null | undefined): number | null {
    if (!result) return null;
    const loc = Array.isArray(result) ? result[0] : result;
    return loc ? loc.range.start.line : null;
}

suite('MAP-procedure overload pick from call-site args (#248)', () => {

    setup(() => {
        setServerInitialized(true);
    });

    test('F12 on x = Rep(4) goes to the 1-arg decl (line 3), not the 0-arg decl', async () => {
        const doc = freshDoc('file:///t248-f12.clw');
        const col = '  x = Rep(4)'.indexOf('Rep') + 1;
        const def = await new DefinitionProvider().provideDefinition(doc, { line: 7, character: col });
        assert.strictEqual(locLine(def), 3,
            `F12 must land on the PROCEDURE(LONG) decl (line 3); got line ${locLine(def)} — ` +
            'the raw call line "type-matched" the zero-parameter overload');
    });

    test('Ctrl+F12 on x = Rep(4) goes to the 1-arg impl (line 13), not the 0-arg impl', async () => {
        const doc = freshDoc('file:///t248-impl.clw');
        const col = '  x = Rep(4)'.indexOf('Rep') + 1;
        const impl = await new ImplementationProvider().provideImplementation(doc, { line: 7, character: col });
        assert.strictEqual(locLine(impl), 13,
            `Ctrl+F12 must land on the PROCEDURE(LONG n) impl (line 13); got line ${locLine(impl)}`);
    });

    test('F12 on x = Rep() goes to the 0-arg decl (line 2) — zero-arg direction still right', async () => {
        const doc = freshDoc('file:///t248-zero.clw');
        const col = '  x = Rep()'.indexOf('Rep') + 1;
        const def = await new DefinitionProvider().provideDefinition(doc, { line: 8, character: col });
        assert.strictEqual(locLine(def), 2,
            `F12 must land on the PROCEDURE() decl (line 2); got line ${locLine(def)}`);
    });
});

suite('ProcedureSignatureUtils Rule 6 — *COMPLEX ≡ COMPLEX (#248)', () => {

    test('*GroupType decl matches GroupType impl (complex by-ref is implicit)', () => {
        assert.strictEqual(
            ProcedureSignatureUtils.parametersMatch(['*GROUPTYPE'], ['GROUPTYPE']),
            true,
            'complex types are by-reference even without the * — the two spellings are ONE overload'
        );
    });

    test('*STRING decl does NOT match STRING impl (scalar by-ref is a real discriminator)', () => {
        assert.strictEqual(
            ProcedureSignatureUtils.parametersMatch(['*STRING'], ['STRING']),
            false
        );
        assert.strictEqual(
            ProcedureSignatureUtils.parametersMatch(['*LONG'], ['LONG']),
            false
        );
    });
});
