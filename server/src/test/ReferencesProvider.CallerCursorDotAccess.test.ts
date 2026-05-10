import * as assert from 'assert';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { TokenCache } from '../TokenCache';
import { ReferencesProvider } from '../providers/ReferencesProvider';
import { setServerInitialized } from '../serverState';

/**
 * Failing-pin suite for task `0c289e16` Phase A — caller-cursor dot-access
 * on overloaded class methods returns null at `provideMemberReferences:710`
 * because `resolveViaVariableType` (line 869-888) still uses the legacy
 * `symbolFinder.findSymbol` + `extractClassName` path instead of 10ea5a80's
 * new `buildFileVarTypeIndex` + `lookupVarTypeAtLine` machinery.
 *
 * Phase A Item 0 re-confirmation gate: this single bug-pin determines
 * whether 10ea5a80's machinery transitively closed the symptom.
 *   - GREEN -> subsumed by 10ea5a80 (close as such, structured report).
 *   - RED   -> proceed to Item 1 (full 5-test contract + (a)/(b)/(c) classification).
 */

function createDocument(content: string, uri: string = 'file:///test.clw'): TextDocument {
    return TextDocument.create(uri, 'clarion', 1, content);
}

function seedCache(document: TextDocument): void {
    TokenCache.getInstance().getTokens(document);
}

suite('ReferencesProvider.CallerCursorDotAccess (0c289e16 Phase A Item 0)', () => {

    let provider: ReferencesProvider;

    setup(() => {
        setServerInitialized(true);
        TokenCache.getInstance().clearAllTokens();
        provider = new ReferencesProvider();
    });

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

        // Cursor on "Append" of the caller (line 18). Land inside the word
        // (1 char in, past the 'A').
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

        // Caller line is the most concrete pin: if FAR ran but didn't find
        // the call site itself, classification points at matching-loop bug.
        assert.ok(
            lines.includes(18),
            'expected line 18 (caller call site) IN result; got lines=[' + lines.join(',') + '] — ' +
            'caller-cursor path either returned null OR matching loop misses own call site'
        );

        // Matching overload should be IN result (STRING decl line 3, STRING impl line 7).
        assert.ok(
            lines.includes(3),
            'expected line 3 (STRING decl, matching overload) IN result; got lines=[' + lines.join(',') + ']'
        );
        assert.ok(
            lines.includes(7),
            'expected line 7 (STRING impl, matching overload) IN result; got lines=[' + lines.join(',') + ']'
        );

        // Wrong overload should NOT be in result (LONG decl line 4, LONG impl line 11).
        // If the caller-cursor path returns refs but doesn't filter by overload,
        // classification points at "10ea5a80 filtered decl-side only — call-site
        // path needs the same filter wired up".
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

});
