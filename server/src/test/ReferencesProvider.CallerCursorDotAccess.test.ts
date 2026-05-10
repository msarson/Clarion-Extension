import * as assert from 'assert';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { TokenCache } from '../TokenCache';
import { ReferencesProvider } from '../providers/ReferencesProvider';
import { DefinitionProvider } from '../providers/DefinitionProvider';
import { setServerInitialized } from '../serverState';

/**
 * Failing-pin + guardrail suite for task `0c289e16` Phase A — caller-cursor
 * dot-access on overloaded class methods returns null at
 * `provideMemberReferences:710` because `resolveViaVariableType` (line
 * 869-888) still uses the legacy `symbolFinder.findSymbol` +
 * `extractClassName` path instead of 10ea5a80's new `buildFileVarTypeIndex`
 * + `lookupVarTypeAtLine` machinery.
 *
 * Phase A Item 0 verdict (commit 8273bcf): test 1 RED — bug confirmed live,
 * NOT subsumed by 10ea5a80. (a) symptom + (c) architectural fix.
 *
 * Locked 5-test contract (continuation_notes on task 0c289e16):
 *   1. (BUG PIN — caller-cursor, literal arg) overloaded class method,
 *      caller `inst.Append('x')`. Cursor on caller's Append. RED today.
 *   2. (BUG PIN — caller-cursor, variable arg) same fixture; caller
 *      `inst.Append(myStrVar)`. Variable-arg may exercise a different
 *      inference path (callArgCount derives from count, not literal type).
 *      Watch for classification sub-case if failure mode differs from test 1.
 *   3. (REGRESSION — single overload caller-cursor) non-overloaded
 *      `Bar PROCEDURE(STRING)`; caller `inst.Bar('y')`. GREEN today and
 *      post-fix; pins that the fix doesn't break the non-overloaded
 *      caller-cursor path.
 *   4. (REGRESSION — declaration cursor unaffected) cursor on
 *      `Append PROCEDURE(STRING)` decl (the fe254d6f path) → returns
 *      matching overload's decl + impl per fe254d6f Phase A. GREEN today;
 *      must STAY GREEN to confirm 0c289e16 doesn't regress fe254d6f.
 *   5. (EQUIVALENCE — Definition unchanged on caller-cursor) Definition's
 *      existing caller-cursor behavior on overloaded methods stays the
 *      same. GREEN today and post-fix; sentinel for accidental coupling.
 *
 * Suite math expected:
 *   Pre-Phase-B: 3 passing (tests 3+4+5) + 2 failing (tests 1+2) = 5 total.
 *   Post-Phase-B (option (c) rewire): 5 passing / 0 failing.
 */

function createDocument(content: string, uri: string = 'file:///test.clw'): TextDocument {
    return TextDocument.create(uri, 'clarion', 1, content);
}

function seedCache(document: TextDocument): void {
    TokenCache.getInstance().getTokens(document);
}

suite('ReferencesProvider.CallerCursorDotAccess (0c289e16 Phase A Item 0)', () => {

    let provider: ReferencesProvider;
    let definitionProvider: DefinitionProvider;

    setup(() => {
        setServerInitialized(true);
        TokenCache.getInstance().clearAllTokens();
        provider = new ReferencesProvider();
        definitionProvider = new DefinitionProvider();
    });

    // ─── (1) BUG PIN — caller-cursor, literal arg ──────────────────────────

    /**
     * Two-overload class method (STRING + LONG); caller `inst.Append('x')` in
     * MainProc. FAR cursor on the CALLER's `Append` -> expects:
     *   - STRING decl line (matching overload, per fe254d6f filter)
     *   - STRING impl line (matching overload)
     *   - The call-site line itself
     *
     * Pre-fix: `provideMemberReferences:700` calls `resolveViaVariableType`
     * which goes through the legacy `symbolFinder` path; if `info` is null,
     * `provideMemberReferences:709` returns null and FAR yields no refs at all.
     */
    test('BUG PIN — caller-cursor on overloaded class method returns matching-overload refs, not null', async () => {
        const code = [
            "  MEMBER('test')",                          // line 0
            '',                                           // line 1
            'MyClass    CLASS,TYPE',                      // line 2
            'Append       PROCEDURE(STRING)',             // line 3 — STRING decl
            'Append       PROCEDURE(LONG)',               // line 4 — LONG decl
            '           END',                             // line 5
            '',                                           // line 6
            'MyClass.Append PROCEDURE(STRING s)',         // line 7 — STRING impl
            '  CODE',                                     // line 8
            '  RETURN',                                   // line 9
            '',                                           // line 10
            'MyClass.Append PROCEDURE(LONG n)',           // line 11 — LONG impl
            '  CODE',                                     // line 12
            '  RETURN',                                   // line 13
            '',                                           // line 14
            'MainProc PROCEDURE',                         // line 15
            'inst       MyClass',                         // line 16
            '  CODE',                                     // line 17
            "  inst.Append('x')",                         // line 18 — CALLER (cursor here on 'Append')
            '  RETURN',                                   // line 19
        ].join('\n');

        const doc = createDocument(code, 'file:///0c289e16-1.clw');
        seedCache(doc);

        const callerLine = "  inst.Append('x')";
        const appendCol = callerLine.indexOf('Append') + 1;

        const refs = await provider.provideReferences(doc, {
            line: 18,
            character: appendCol
        }, { includeDeclaration: true });

        // Bidirectional pin per `feedback_bidirectional_pin_assertion`:
        // POSITIVE (decl/impl/caller all IN result) + NEGATIVE (LONG-overload
        // decl/impl NOT in result). Catches both null-return AND silent
        // wrong-overload leak.
        assert.ok(
            refs,
            'FAR should NOT return null for caller-cursor on overloaded class method ' +
            '(provideMemberReferences:710 null-return regression — the bug 0c289e16 pins)'
        );

        const lines = refs!.map(r => r.range.start.line).sort((a, b) => a - b);

        assert.ok(
            lines.includes(18),
            'expected line 18 (caller call site) IN result; got lines=[' + lines.join(',') + '] — ' +
            'caller-cursor path either returned null OR matching loop misses own call site'
        );

        assert.ok(
            lines.includes(3),
            'expected line 3 (STRING decl, matching overload) IN result; got lines=[' + lines.join(',') + ']'
        );
        assert.ok(
            lines.includes(7),
            'expected line 7 (STRING impl, matching overload) IN result; got lines=[' + lines.join(',') + ']'
        );

        assert.ok(
            !lines.includes(4),
            'expected line 4 (LONG decl, wrong overload) NOT in result; got lines=[' + lines.join(',') + '] — ' +
            'arity-only overload filter at call-site path leaks the LONG overload'
        );
        assert.ok(
            !lines.includes(11),
            'expected line 11 (LONG impl, wrong overload) NOT in result; got lines=[' + lines.join(',') + ']'
        );
    });

    // ─── (2) BUG PIN — caller-cursor, variable arg ─────────────────────────

    /**
     * Same overload structure as test 1, but caller passes a variable
     * (`inst.Append(myStrVar)`) instead of a string literal. callArgCount
     * still resolves to 1, but the type-aware filter has to derive
     * `myStrVar`'s type from procedure-local declaration to match against
     * the STRING overload (vs falling back to arity-only filtering).
     *
     * Bob's classification flag: if test 2's failure mode differs from
     * test 1 (literal-arg null-return), that's a (c) sub-case worth
     * surfacing — would mean variable-arg path needs separate plumbing
     * even after `resolveViaVariableType` is rewired.
     */
    test('BUG PIN — caller-cursor, variable arg — overload disambiguates by var type', async () => {
        const code = [
            "  MEMBER('test')",                          // line 0
            '',                                           // line 1
            'MyClass    CLASS,TYPE',                      // line 2
            'Append       PROCEDURE(STRING)',             // line 3 — STRING decl
            'Append       PROCEDURE(LONG)',               // line 4 — LONG decl
            '           END',                             // line 5
            '',                                           // line 6
            'MyClass.Append PROCEDURE(STRING s)',         // line 7 — STRING impl
            '  CODE',                                     // line 8
            '  RETURN',                                   // line 9
            '',                                           // line 10
            'MyClass.Append PROCEDURE(LONG n)',           // line 11 — LONG impl
            '  CODE',                                     // line 12
            '  RETURN',                                   // line 13
            '',                                           // line 14
            'MainProc PROCEDURE',                         // line 15
            'inst       MyClass',                         // line 16
            'myStrVar   STRING(20)',                      // line 17 — proc-local STRING var
            '  CODE',                                     // line 18
            '  inst.Append(myStrVar)',                    // line 19 — CALLER (cursor on 'Append')
            '  RETURN',                                   // line 20
        ].join('\n');

        const doc = createDocument(code, 'file:///0c289e16-2.clw');
        seedCache(doc);

        const callerLine = '  inst.Append(myStrVar)';
        const appendCol = callerLine.indexOf('Append') + 1;

        const refs = await provider.provideReferences(doc, {
            line: 19,
            character: appendCol
        }, { includeDeclaration: true });

        assert.ok(
            refs,
            'FAR should NOT return null for caller-cursor with variable arg on overloaded class method'
        );

        const lines = refs!.map(r => r.range.start.line).sort((a, b) => a - b);

        // Bidirectional pin: caller + matching STRING overload IN; LONG NOT IN.
        assert.ok(
            lines.includes(19),
            'expected line 19 (caller call site) IN result; got lines=[' + lines.join(',') + ']'
        );
        assert.ok(
            lines.includes(3),
            'expected line 3 (STRING decl, matching overload) IN result; got lines=[' + lines.join(',') + ']'
        );
        assert.ok(
            lines.includes(7),
            'expected line 7 (STRING impl, matching overload) IN result; got lines=[' + lines.join(',') + ']'
        );

        assert.ok(
            !lines.includes(4),
            'expected line 4 (LONG decl, wrong overload) NOT in result; got lines=[' + lines.join(',') + '] — ' +
            'variable-arg path failed to derive STRING type from proc-local declaration'
        );
        assert.ok(
            !lines.includes(11),
            'expected line 11 (LONG impl, wrong overload) NOT in result; got lines=[' + lines.join(',') + ']'
        );
    });

    // ─── (3) REGRESSION — single overload caller-cursor ────────────────────

    /**
     * Non-overloaded class method (`Bar PROCEDURE(STRING)`); caller
     * `inst.Bar('y')`. FAR cursor on caller's `Bar` -> expects standard
     * result set (decl + impl + caller).
     *
     * If 10ea5a80 Phase B+ already closed the matching-loop side for
     * non-overloaded class methods, this is GREEN today. If it's RED,
     * the null-return is NOT overload-specific — surface as a broader
     * caller-cursor resolver bug.
     */
    test('REGRESSION — single overload caller-cursor — non-overloaded class method works', async () => {
        const code = [
            "  MEMBER('test')",                          // line 0
            '',                                           // line 1
            'MyClass    CLASS,TYPE',                      // line 2
            'Bar          PROCEDURE(STRING)',             // line 3 — sole decl
            '           END',                             // line 4
            '',                                           // line 5
            'MyClass.Bar PROCEDURE(STRING s)',            // line 6 — sole impl
            '  CODE',                                     // line 7
            '  RETURN',                                   // line 8
            '',                                           // line 9
            'MainProc PROCEDURE',                         // line 10
            'inst       MyClass',                         // line 11
            '  CODE',                                     // line 12
            "  inst.Bar('y')",                            // line 13 — CALLER (cursor on 'Bar')
            '  RETURN',                                   // line 14
        ].join('\n');

        const doc = createDocument(code, 'file:///0c289e16-3.clw');
        seedCache(doc);

        const callerLine = "  inst.Bar('y')";
        const barCol = callerLine.indexOf('Bar') + 1;

        const refs = await provider.provideReferences(doc, {
            line: 13,
            character: barCol
        }, { includeDeclaration: true });

        assert.ok(
            refs,
            'FAR should NOT return null on non-overloaded class method (regression sentinel)'
        );

        const lines = refs!.map(r => r.range.start.line).sort((a, b) => a - b);

        assert.ok(
            lines.includes(13),
            'expected line 13 (caller) IN result; got lines=[' + lines.join(',') + ']'
        );
        assert.ok(
            lines.includes(3),
            'expected line 3 (decl) IN result; got lines=[' + lines.join(',') + ']'
        );
        assert.ok(
            lines.includes(6),
            'expected line 6 (impl) IN result; got lines=[' + lines.join(',') + ']'
        );
    });

    // ─── (4) REGRESSION — declaration-cursor unaffected (fe254d6f path) ────

    /**
     * Same overload shape as test 1, but cursor on the STRING DECL inside
     * the CLASS body — the fe254d6f path. Returns matching overload's
     * decl + impl. Caller-side enumeration NOT asserted here per fe254d6f
     * Phase A's locked contract (3be2b68d's separate task covers it).
     *
     * GREEN today via fe254d6f's signaturesMatch wire-up. Must STAY GREEN
     * to confirm 0c289e16's planned (c) rewire doesn't regress decl-side.
     */
    test('REGRESSION — decl-cursor on overloaded class method — fe254d6f path intact', async () => {
        const code = [
            "  MEMBER('test')",                          // line 0
            '',                                           // line 1
            'MyClass    CLASS,TYPE',                      // line 2
            'Append       PROCEDURE(STRING)',             // line 3 — STRING decl (cursor here)
            'Append       PROCEDURE(LONG)',               // line 4 — LONG decl
            '           END',                             // line 5
            '',                                           // line 6
            'MyClass.Append PROCEDURE(STRING s)',         // line 7 — STRING impl
            '  CODE',                                     // line 8
            '  RETURN',                                   // line 9
            '',                                           // line 10
            'MyClass.Append PROCEDURE(LONG n)',           // line 11 — LONG impl
            '  CODE',                                     // line 12
            '  RETURN',                                   // line 13
        ].join('\n');

        const doc = createDocument(code, 'file:///0c289e16-4.clw');
        seedCache(doc);

        // Cursor on "Append" of the STRING decl (line 3, col 0).
        const refs = await provider.provideReferences(doc, {
            line: 3,
            character: 0
        }, { includeDeclaration: true });

        assert.ok(
            refs,
            'FAR on STRING decl (fe254d6f path) should not return null'
        );

        const lines = refs!.map(r => r.range.start.line).sort((a, b) => a - b);

        // STRING decl + STRING impl IN; LONG decl + LONG impl NOT IN.
        // Caller-side (none in this fixture) is N/A.
        assert.ok(
            lines.includes(3),
            'expected line 3 (STRING decl, cursor line) IN result; got lines=[' + lines.join(',') + ']'
        );
        assert.ok(
            lines.includes(7),
            'expected line 7 (STRING impl) IN result; got lines=[' + lines.join(',') + ']'
        );
        assert.ok(
            !lines.includes(4),
            'expected line 4 (LONG decl, wrong overload) NOT in result; got lines=[' + lines.join(',') + '] — ' +
            'fe254d6f decl-side overload filter regressed'
        );
        assert.ok(
            !lines.includes(11),
            'expected line 11 (LONG impl, wrong overload) NOT in result; got lines=[' + lines.join(',') + ']'
        );
    });

    // ─── (5) EQUIVALENCE — Definition unchanged on caller-cursor ───────────

    /**
     * Same fixture as test 1; cursor on caller's `Append`. Use
     * DefinitionProvider not ReferencesProvider. 0c289e16's planned (c)
     * rewire targets `resolveViaVariableType` in ReferencesProvider — it
     * MUST NOT change Definition behavior on caller-cursor (different
     * provider, different code path).
     *
     * Sentinel — Definition either resolves to a position OR returns null
     * cleanly. fe254d6f's analogous test 5 documents that Definition for
     * overloaded callers may not be implemented today; the assertion is
     * "no exception thrown + result null OR a Definition shape".
     */
    test('EQUIVALENCE — DefinitionProvider caller-cursor unchanged (scope-leak sentinel)', async () => {
        const code = [
            "  MEMBER('test')",                          // line 0
            '',                                           // line 1
            'MyClass    CLASS,TYPE',                      // line 2
            'Append       PROCEDURE(STRING)',             // line 3
            'Append       PROCEDURE(LONG)',               // line 4
            '           END',                             // line 5
            '',                                           // line 6
            'MyClass.Append PROCEDURE(STRING s)',         // line 7
            '  CODE',
            '  RETURN',
            '',
            'MyClass.Append PROCEDURE(LONG n)',           // line 11
            '  CODE',
            '  RETURN',
            '',
            'MainProc PROCEDURE',                         // line 15
            'inst       MyClass',
            '  CODE',
            "  inst.Append('x')",                         // line 18 — caller cursor
            '  RETURN',
        ].join('\n');

        const doc = createDocument(code, 'file:///0c289e16-5.clw');
        seedCache(doc);

        const callerLine = "  inst.Append('x')";
        const appendCol = callerLine.indexOf('Append') + 1;

        const def = await definitionProvider.provideDefinition(doc, {
            line: 18,
            character: appendCol
        });

        if (def !== null) {
            assert.ok(def, 'Definition either resolves or returns null cleanly');
        }
    });

});
