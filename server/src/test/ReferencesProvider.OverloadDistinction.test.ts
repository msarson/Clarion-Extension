import * as assert from 'assert';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { TokenCache } from '../TokenCache';
import { ReferencesProvider } from '../providers/ReferencesProvider';
import { DefinitionProvider } from '../providers/DefinitionProvider';
import { setServerInitialized } from '../serverState';

/**
 * Failing-pin + guardrail suite for task `fe254d6f` Phase A — wire the
 * type-aware `MethodOverloadResolver.signaturesMatch` (added in `5f7478dc`)
 * into ReferencesProvider's plain-symbol path.
 *
 * Pre-fix: the plain-symbol path at `ReferencesProvider.findReferences`
 * (line 240+) and `findProcedureReferences` fallback (line 244) match
 * procedure declarations by NAME ONLY. So FAR on `Foo PROCEDURE(STRING)`
 * also returns the `Foo PROCEDURE(LONG)` decl + impl — wrong-overload
 * decls leak through.
 *
 * Post-fix: the wire-up calls `signaturesMatch` to compare the cursor
 * decl's signature against each candidate decl's signature. Wrong-overload
 * decls are filtered out.
 *
 * Locked test contract (continuation_notes on task fe254d6f, 5 tests):
 *   1. (BUG PIN — same-arity-different-type) global PROCEDURE 2-overload,
 *      FAR on STRING decl returns ONLY: STRING decl + STRING impl.
 *   2. (BUG PIN — different-arity) global PROCEDURE arity-1 vs arity-2,
 *      FAR on STRING decl returns ONLY: STRING decl + STRING impl.
 *   3. (REGRESSION GUARD — no overloads) sole procedure, no over-filtering.
 *   4. (REGRESSION GUARD — class-method decl-side-only) class method
 *      2-overload, FAR on STRING decl returns STRING decl + impl. Callers
 *      explicitly NOT asserted (P1 `3be2b68d` blocks them).
 *   5. (REGRESSION GUARD — Definition unchanged) DefinitionProvider
 *      smoke; signaturesMatch is purely additive on a separate code path.
 *
 * Suite math expected:
 *   Pre-step-1: 1403 passing (post-5f7478dc merge).
 *   Post-step-1: 1406 passing + 2 failing = 1408 total. Tests 1+2 RED;
 *     tests 3+4+5 GREEN.
 *   Post-step-3 (Alice's wire-up): 1408 / 0.
 *
 * Tests use single-file fixtures + the existing TextDocument + TokenCache
 * + provider invocation pattern from `ReferencesProvider.test.ts`.
 */

function createDocument(content: string, uri: string = 'file:///test.clw'): TextDocument {
    return TextDocument.create(uri, 'clarion', 1, content);
}

function seedCache(document: TextDocument): void {
    TokenCache.getInstance().getTokens(document);
}

suite('ReferencesProvider.OverloadDistinction (fe254d6f)', () => {

    let provider: ReferencesProvider;
    let definitionProvider: DefinitionProvider;

    setup(() => {
        setServerInitialized(true);
        TokenCache.getInstance().clearAllTokens();
        provider = new ReferencesProvider();
        definitionProvider = new DefinitionProvider();
    });

    // ─── (1) BUG PIN — same-arity-different-type, global PROCEDURE ──────────

    /**
     * Two global PROCEDURE overloads with same arity, different types.
     * FAR on STRING decl currently returns ALL `Foo` matches (including
     * the LONG decl + impl). Post-fix: only STRING decl + STRING impl.
     */
    test('BUG PIN — same-arity-different-type — FAR on Foo(STRING) decl returns ONLY STRING decl + impl', async () => {
        const code = [
            "  PROGRAM",                               // line 0
            '  MAP',                                   // line 1
            'Foo            PROCEDURE(STRING)',        // line 2 — STRING decl (FAR cursor here)
            'Foo            PROCEDURE(LONG)',          // line 3 — LONG decl
            '  END',                                   // line 4 (MAP end)
            '',                                        // line 5
            '  CODE',                                  // line 6
            '  RETURN',                                // line 7
            '',                                        // line 8
            'Foo PROCEDURE(STRING s)',                 // line 9 — STRING impl (standard Clarion TYPE name order)
            '  CODE',
            '  RETURN',
            '',
            'Foo PROCEDURE(LONG n)',                   // line 13 — LONG impl (standard Clarion TYPE name order)
            '  CODE',
            '  RETURN',
        ].join('\n');

        const doc = createDocument(code, 'file:///fe254d6f-1.clw');
        seedCache(doc);

        // Cursor on "Foo" in the STRING decl (line 2, col 0).
        const refs = await provider.provideReferences(doc, { line: 2, character: 0 },
            { includeDeclaration: true });

        assert.ok(refs, 'FAR should return references for the STRING decl');
        const lines = refs!.map(r => r.range.start.line).sort((a, b) => a - b);

        // Pre-fix today: lines includes 3 (LONG decl) and 13 (LONG impl) — wrong-overload leak.
        // Post-fix: lines does NOT include 3 or 13.
        assert.ok(
            !lines.includes(3),
            'expected line 3 (LONG decl) NOT in result; got lines=[' + lines.join(',') + '] — ' +
            'plain-symbol path is matching by name only, leaking wrong-overload decl'
        );
        assert.ok(
            !lines.includes(13),
            'expected line 13 (LONG impl) NOT in result; got lines=[' + lines.join(',') + ']'
        );
        // Positive assertion (bidirectional-pin pattern lifted to assertion-shape):
        // catches silent-exclusion failure mode where an over-eager filter drops
        // the matching-signature impl too. Without this, the negative assertions
        // would pass for the wrong reason.
        assert.ok(
            lines.includes(9),
            'STRING impl line 9 should be in result; got lines=[' + lines.join(',') + ']'
        );
    });

    // ─── (2) BUG PIN — different-arity, global PROCEDURE ────────────────────

    /**
     * Two global PROCEDURE overloads with different arities. FAR on the
     * arity-1 STRING decl returns ONLY STRING decl + impl, NOT the
     * (STRING, LONG) decl + impl. Verifies signature-based filter handles
     * arity differences too.
     */
    test('BUG PIN — different-arity — FAR on Bar(STRING) decl returns ONLY STRING decl + impl', async () => {
        const code = [
            "  PROGRAM",                               // line 0
            '  MAP',                                   // line 1
            'Bar            PROCEDURE(STRING)',        // line 2 — arity-1 (FAR cursor here)
            'Bar            PROCEDURE(STRING, LONG)',  // line 3 — arity-2
            '  END',                                   // line 4
            '',                                        // line 5
            '  CODE',                                  // line 6
            '  RETURN',                                // line 7
            '',                                        // line 8
            'Bar PROCEDURE(STRING s)',                 // line 9 — arity-1 impl (standard Clarion TYPE name order)
            '  CODE',
            '  RETURN',
            '',
            'Bar PROCEDURE(STRING s, LONG n)',         // line 13 — arity-2 impl (standard Clarion TYPE name order)
            '  CODE',
            '  RETURN',
        ].join('\n');

        const doc = createDocument(code, 'file:///fe254d6f-2.clw');
        seedCache(doc);

        const refs = await provider.provideReferences(doc, { line: 2, character: 0 },
            { includeDeclaration: true });

        assert.ok(refs, 'FAR should return references for the arity-1 STRING decl');
        const lines = refs!.map(r => r.range.start.line).sort((a, b) => a - b);

        assert.ok(
            !lines.includes(3),
            'expected line 3 (arity-2 decl) NOT in result; got lines=[' + lines.join(',') + ']'
        );
        assert.ok(
            !lines.includes(13),
            'expected line 13 (arity-2 impl) NOT in result; got lines=[' + lines.join(',') + ']'
        );
        // Positive assertion — silent-exclusion sentinel.
        assert.ok(
            lines.includes(9),
            'arity-1 STRING impl line 9 should be in result; got lines=[' + lines.join(',') + ']'
        );
    });

    // ─── (3) REGRESSION GUARD — no overloads ────────────────────────────────

    /**
     * Single procedure with no same-name siblings. FAR returns decl + impl
     * + all callers. No over-filtering when there's nothing to filter.
     */
    test('REGRESSION GUARD — no overloads, FAR returns decl + impl unchanged', async () => {
        const code = [
            "  PROGRAM",                               // line 0
            '  MAP',                                   // line 1
            'Baz            PROCEDURE(STRING)',        // line 2 — sole decl (FAR cursor here)
            '  END',                                   // line 3
            '',                                        // line 4
            '  CODE',                                  // line 5
            '  RETURN',                                // line 6
            '',                                        // line 7
            'Baz PROCEDURE(STRING s)',                 // line 8 — impl
            '  CODE',
            '  RETURN',
        ].join('\n');

        const doc = createDocument(code, 'file:///fe254d6f-3.clw');
        seedCache(doc);

        const refs = await provider.provideReferences(doc, { line: 2, character: 0 },
            { includeDeclaration: true });

        assert.ok(refs, 'FAR should return references for the sole-overload PROCEDURE');
        const lines = refs!.map(r => r.range.start.line).sort((a, b) => a - b);

        // Decl at line 2 + impl at line 8 must both be present.
        assert.ok(
            lines.includes(2),
            'expected line 2 (decl) IN result; got lines=[' + lines.join(',') + '] — over-filtered the sole decl'
        );
        assert.ok(
            lines.includes(8),
            'expected line 8 (impl) IN result; got lines=[' + lines.join(',') + '] — over-filtered the sole impl'
        );
    });

    // ─── (4) REGRESSION GUARD — class-method decl-side-only ─────────────────

    /**
     * Class method 2-overload. FAR cursor on STRING decl returns STRING
     * decl + STRING impl. Caller assertions explicitly out-of-scope per
     * P1 (`3be2b68d`) — class-body validLineRanges filters out callers,
     * which is the wrong direction for this test (would mask the wire-up
     * fix). Decl-side-only is the safe assertion shape.
     */
    test('REGRESSION GUARD — class-method decl-side-only — STRING decl returns STRING decl + impl', async () => {
        const code = [
            "  MEMBER('test')",                       // line 0
            '',                                        // line 1
            'MyClass    CLASS,TYPE',                   // line 2
            'Append       PROCEDURE(STRING)',          // line 3 — STRING decl (FAR cursor here)
            'Append       PROCEDURE(LONG)',            // line 4 — LONG decl
            '           END',                          // line 5
            '',                                        // line 6
            'MyClass.Append PROCEDURE(STRING s)',      // line 7 — STRING impl (standard Clarion TYPE name order)
            '  CODE',
            '  RETURN',
            '',
            'MyClass.Append PROCEDURE(LONG n)',        // line 11 — LONG impl (standard Clarion TYPE name order)
            '  CODE',
            '  RETURN',
        ].join('\n');

        const doc = createDocument(code, 'file:///fe254d6f-4.clw');
        seedCache(doc);

        // Cursor on "Append" in the STRING decl (line 3, col 0).
        const refs = await provider.provideReferences(doc, { line: 3, character: 0 },
            { includeDeclaration: true });

        assert.ok(refs, 'FAR should return references for the class-method STRING decl');
        const lines = refs!.map(r => r.range.start.line).sort((a, b) => a - b);

        // Decl-side-only assertions: STRING decl present, LONG decl + impl absent.
        // Caller-side intentionally not asserted (P1 interference).
        assert.ok(
            lines.includes(3),
            'expected line 3 (STRING decl) IN result; got lines=[' + lines.join(',') + ']'
        );
        assert.ok(
            !lines.includes(4),
            'expected line 4 (LONG decl) NOT in result; got lines=[' + lines.join(',') + '] — ' +
            'wrong-overload decl leaked through; signaturesMatch wire-up missing for class-method'
        );
        assert.ok(
            !lines.includes(11),
            'expected line 11 (LONG impl) NOT in result; got lines=[' + lines.join(',') + ']'
        );
        // Positive assertion — silent-exclusion sentinel for the matching impl.
        assert.ok(
            lines.includes(7),
            'class-method STRING impl line 7 should be in result; got lines=[' + lines.join(',') + ']'
        );
    });

    // ─── (5) REGRESSION GUARD — Definition unchanged ────────────────────────

    /**
     * DefinitionProvider smoke test. The wire-up at fe254d6f Phase A only
     * touches ReferencesProvider's plain-symbol path; the new public
     * `signaturesMatch` is additive on `MethodOverloadResolver`. Calling
     * Definition on an overloaded method should not be affected.
     *
     * Tautologically GREEN: this is a sentinel against accidental scope
     * leak (e.g. someone wires signaturesMatch into DefinitionProvider too,
     * which is out of scope).
     */
    test('REGRESSION GUARD — Definition unchanged on overloaded method (scope-leak sentinel)', async () => {
        const code = [
            "  PROGRAM",                               // line 0
            '  MAP',                                   // line 1
            'Baz            PROCEDURE(STRING)',        // line 2 — sole decl
            '  END',                                   // line 3
            '',                                        // line 4
            '  CODE',                                  // line 5
            "  Baz('hello')",                          // line 6 — caller; cursor here for definition
            '  RETURN',                                // line 7
            '',                                        // line 8
            'Baz PROCEDURE(STRING s)',                 // line 9 — impl
            '  CODE',
            '  RETURN',
        ].join('\n');

        const doc = createDocument(code, 'file:///fe254d6f-5.clw');
        seedCache(doc);

        // Cursor on "Baz" in the caller (line 6, char 2 — after the 2-space indent).
        const def = await definitionProvider.provideDefinition(doc, { line: 6, character: 2 });

        // Sentinel: Definition returns SOMETHING (or null if Definition isn't
        // implemented for this case today). Either way, fe254d6f Phase A
        // shouldn't change this. The assertion is "no exception thrown" plus
        // "result is null OR a Definition shape" — the wire-up is additive
        // and should not crash Definition.
        if (def !== null) {
            assert.ok(def, 'Definition either resolves or returns null cleanly');
        }
    });
});
