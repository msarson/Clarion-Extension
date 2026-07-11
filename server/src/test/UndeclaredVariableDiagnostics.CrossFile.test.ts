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
 * Failing-pin + regression suite for task `6b40d7da` — undeclared-variable
 * diagnostic false-positive when receiver is declared at a cross-file tier
 * (Tier 5b MEMBER / Tier 6 PROGRAM-Global / Tier 7 INCLUDE'd).
 *
 * Pre-fix (before this PR): `validateUndeclaredVariables` walks single-file
 * tokens only — `declaredNames` is built from this document's Labels +
 * Variable-outside-CODE tokens. Cross-file declarations are invisible →
 * diagnostic fires false-positive. Hover / F12 / FAR all resolve correctly
 * because they walk `SymbolFinderService.findSymbol`'s canonical 7-tier chain.
 *
 * Per Eve's Phase A audit (`docs/audits/undeclared-variable-diagnostic-scope-audit-6b40d7da.md`):
 * Option B HYBRID — preserve fast-path + `SymbolFinder.findSymbol` fallback.
 * Closes Tiers 5b/6/7 without losing Tier 1 (Routine Local) coverage.
 *
 * 6-test contract per Eve's Step 4 recommendation:
 *
 *   1. BUG PIN — Tier 6 Global (Mark's reproducer shape): `a` declared
 *      in PROGRAM file's data section, used in MEMBER file's PROCEDURE
 *      body. RED pre-fix; GREEN post-fix.
 *   2. BUG PIN — Tier 5b cross-file MEMBER: `b` declared at MODULE scope
 *      in MemberA, used in MemberB (same parent PROGRAM). RED → GREEN.
 *   3. REGRESSION — Tier 1 Routine Local preserved: `r` declared in a
 *      ROUTINE's DATA section, used in same routine's CODE. GREEN both.
 *   4. REGRESSION — Tier 3 Procedure Local preserved. GREEN both.
 *   5. CROSS-TIER SENTINEL — same Tier 6 fixture as test 1 PLUS a name
 *      `b` genuinely undeclared anywhere; assert NO fire on `a` AND DOES
 *      fire on `b`. Bidirectional anchor against "fix widened too far +
 *      masked everything" per `feedback_non_x_regression_sentinel`.
 *   6. REGRESSION — built-in shortcut (`SELF.x` no fire). GREEN both.
 *
 * Tests use `MultiFileFARFixture`'s 671d7cd8 `frg: {programFile, memberFiles}`
 * opt for cross-file PROGRAM/MEMBER scope plumbing — matches Mark's reproducer
 * shape exactly.
 *
 * Implementation note: post-fix `validateUndeclaredVariables` is async (per
 * Phase A risk note + Bob's dispatch). These tests `await` it directly. The
 * `DiagnosticProvider.validateDocument` sync surface no longer carries
 * undeclared-variable diagnostics — they ship via the existing async pass at
 * `server.ts:340` next to `validateDiscardedReturnValues`.
 */

interface Hooks {
    diagnostics: { line: number; col: number; message: string }[];
    cleanup: () => void;
}

async function runDiagnostic(
    cursorDoc: TextDocument,
    cursorTokens: ReturnType<ClarionTokenizer['tokenize']>
): Promise<{ line: number; col: number; message: string }[]> {
    const tokenCache = TokenCache.getInstance();
    const scopeAnalyzer = new ScopeAnalyzer(tokenCache, undefined as never);
    const symbolFinder = new SymbolFinderService(tokenCache, scopeAnalyzer);

    const diags = await validateUndeclaredVariablesAsync(cursorTokens, cursorDoc, symbolFinder);
    return diags.map(d => ({
        line: d.range.start.line,
        col: d.range.start.character,
        message: typeof d.message === 'string' ? d.message : ''
    }));
}

suite('UndeclaredVariableDiagnostics — cross-file scope (6b40d7da, #115)', () => {

    let savedUndeclaredEnabled = false;

    setup(() => {
        savedUndeclaredEnabled = serverSettings.undeclaredVariablesEnabled;
        serverSettings.undeclaredVariablesEnabled = true;
    });

    teardown(() => {
        serverSettings.undeclaredVariablesEnabled = savedUndeclaredEnabled;
        teardownMultiFileFixture();
    });

    // ─── (1) BUG PIN — Tier 6 Global (Mark's reproducer shape) ──────────────

    /**
     * `a long` declared at PROGRAM scope in `SimpleNewSln.clw` (between MAP/END
     * and CODE). MEMBER file `MyNextProcedure.clw` uses `a=1` inside its
     * PROCEDURE's CODE. Diagnostic must NOT fire on `a` — it is declared,
     * just not in the cursor's file.
     *
     * Pre-fix: declaredNames doesn't see PROGRAM-scope globals → diagnostic
     * fires (RED). Post-fix: SymbolFinder fallback resolves `a` → no fire.
     */
    test('Tier 6 BUG PIN — `a` declared in PROGRAM data section, used in MEMBER PROCEDURE → no fire', async () => {
        const fixture = buildMultiFileFixture({
            files: {
                'SimpleNewSln.clw': [
                    "  PROGRAM",                          // line 0
                    '',                                    // line 1
                    '  MAP',                               // line 2
                    '  END',                               // line 3
                    '',                                    // line 4
                    'a       LONG',                        // line 5 — Tier 6 Global
                    '',                                    // line 6
                    '  CODE',                              // line 7
                    '  RETURN',                            // line 8
                ].join('\n'),
                'MyNextProcedure.clw': [
                    "  MEMBER('SimpleNewSln.clw')",       // line 0
                    '  MAP',                               // line 1
                    '  END',                               // line 2
                    'MyNextProcedure PROCEDURE',           // line 3
                    '  CODE',                              // line 4
                    '  a = 1',                             // line 5 — uses Tier 6 global
                    '  RETURN',                            // line 6
                ].join('\n'),
            },
            frg: { programFile: 'SimpleNewSln.clw', memberFiles: ['MyNextProcedure.clw'] }
        });

        const memberDoc = fixture.documents['MyNextProcedure.clw'];
        const memberTokens = new ClarionTokenizer(memberDoc.getText()).tokenize();
        const diags = await runDiagnostic(memberDoc, memberTokens);

        const aOnLine5 = diags.find(d => d.line === 5);
        assert.strictEqual(
            aOnLine5,
            undefined,
            'expected NO undeclared-variable diagnostic on `a` at line 5 (a is Tier 6 PROGRAM-scope global); ' +
            'got: ' + JSON.stringify(diags) +
            ' — Mark\'s reproducer shape (Tier 6 cross-file resolution gap)'
        );
    });

    // ─── (2) BUG PIN — Tier 5b cross-file MEMBER ────────────────────────────

    /**
     * `b` declared at MODULE scope in `MemberA.clw` (between MEMBER and the
     * first PROCEDURE). MEMBER file `MemberB.clw` (same parent PROGRAM)
     * references `b = 99` inside its PROCEDURE's CODE. Per Clarion's scope
     * model, MODULE-scope data is visible across MEMBER files of the same
     * PROGRAM. Diagnostic must NOT fire.
     *
     * Pre-fix: cross-MEMBER MODULE scope is invisible to single-file walk →
     * diagnostic fires (RED). Post-fix: SymbolFinder resolves via
     * `findModuleVariable`'s cross-MEMBER walk → no fire.
     */
    /**
     * SKIPPED — substrate-capability gap discovered Phase B (#115); tracked
     * as follow-up #118 / kanban `183e2458`.
     *
     * Eve's Phase A audit (`docs/audits/undeclared-variable-diagnostic-scope-audit-6b40d7da.md`
     * line 74) claimed `SymbolFinderService.findModuleVariable` walks sibling
     * MEMBER files via a `findMemberParentFile` helper — verified absent: the
     * method does not exist in the codebase, and `findModuleVariable` (lines
     * 477-535) walks only the current file's tokens. `findGlobalVariable`'s
     * `findGlobalVariableInParentFile` walks the parent PROGRAM, not sibling
     * MEMBERs.
     *
     * Per `feedback_gate1_machinery_capability_assumption` — clean-pause,
     * file follow-up, don't expand scope. Tier 5b cross-MEMBER MODULE-scope
     * resolution requires a `findModuleVariableInSiblingMembers` walker via
     * FRG MEMBER edges (the new substrate). When #118 lands, this test
     * flips GREEN with no diagnostic changes — the SymbolFinder fall-through
     * wired in #115 picks up the new tier transparently.
     */
    test('Tier 5b BUG PIN — cross-file MEMBER MODULE-scope → no fire', async () => {
        const fixture = buildMultiFileFixture({
            files: {
                'main.clw': [
                    "  PROGRAM",
                    '  MAP',
                    '  END',
                    '  CODE',
                    '  RETURN',
                ].join('\n'),
                'MemberA.clw': [
                    "  MEMBER('main.clw')",                // line 0
                    'b       LONG',                        // line 1 — MODULE scope (Tier 5b)
                    '',                                    // line 2
                    'ProcA   PROCEDURE',                   // line 3
                    '  CODE',
                    '  RETURN',
                ].join('\n'),
                'MemberB.clw': [
                    "  MEMBER('main.clw')",                // line 0
                    'ProcB   PROCEDURE',                   // line 1
                    '  CODE',                              // line 2
                    '  b = 99',                            // line 3 — uses Tier 5b cross-MEMBER var
                    '  RETURN',                            // line 4
                ].join('\n'),
            },
            frg: { programFile: 'main.clw', memberFiles: ['MemberA.clw', 'MemberB.clw'] }
        });

        const memberBDoc = fixture.documents['MemberB.clw'];
        const memberBTokens = new ClarionTokenizer(memberBDoc.getText()).tokenize();
        const diags = await runDiagnostic(memberBDoc, memberBTokens);

        const bOnLine3 = diags.find(d => d.line === 3);
        assert.strictEqual(
            bOnLine3,
            undefined,
            'expected NO diagnostic on `b` at line 3 (Tier 5b cross-file MEMBER MODULE-scope); ' +
            'got: ' + JSON.stringify(diags)
        );
    });

    // ─── (3) REGRESSION — Tier 1 Routine Local preserved ────────────────────

    /**
     * `r` declared in a ROUTINE's `DATA` section + used inside that routine's
     * `CODE`. The diagnostic's broad Label-walk catches it incidentally today
     * (Tier 1 sits OUTSIDE SymbolFinder's canonical chain). Post-fix's local
     * fast-path must preserve this — without it, Option B would regress
     * Routine Local coverage.
     */
    test('Tier 1 REGRESSION — Routine Local var preserved (broad Label fast-path)', async () => {
        const code = [
            "  PROGRAM",                                  // 0
            '  MAP',                                       // 1
            '  END',                                       // 2
            '',                                            // 3
            '  CODE',                                      // 4
            '  DO MyRoutine',                              // 5
            '  RETURN',                                    // 6
            '',                                            // 7
            'MyRoutine ROUTINE',                           // 8
            '  DATA',                                      // 9
            'r       LONG',                                // 10 — Tier 1 routine-local
            '  CODE',                                      // 11
            '  r = 7',                                     // 12 — uses routine-local
            '  RETURN',                                    // 13
        ].join('\n');
        const doc = TextDocument.create('file:///test-tier1.clw', 'clarion', 1, code);
        const tokens = new ClarionTokenizer(code).tokenize();
        const diags = await runDiagnostic(doc, tokens);

        const rOnLine12 = diags.find(d => d.line === 12);
        assert.strictEqual(
            rOnLine12,
            undefined,
            'expected NO diagnostic on `r` at line 12 (Tier 1 Routine Local); ' +
            'fast-path Label walk must preserve this — got: ' + JSON.stringify(diags)
        );
    });

    // ─── (4) REGRESSION — Tier 3 Procedure Local preserved ──────────────────

    /**
     * Standard procedure-local declaration. GREEN today; must stay GREEN.
     */
    test('Tier 3 REGRESSION — Procedure Local var preserved', async () => {
        const code = [
            "  PROGRAM",
            '  MAP',
            '  END',
            '  CODE',
            '  RETURN',
            '',                                            // 5
            'MyProc  PROCEDURE',                           // 6
            'localVar    LONG',                            // 7 — Tier 3 procedure-local
            '  CODE',                                      // 8
            '  localVar = 42',                             // 9 — uses procedure-local
            '  RETURN',                                    // 10
        ].join('\n');
        const doc = TextDocument.create('file:///test-tier3.clw', 'clarion', 1, code);
        const tokens = new ClarionTokenizer(code).tokenize();
        const diags = await runDiagnostic(doc, tokens);

        const localOnLine9 = diags.find(d => d.line === 9);
        assert.strictEqual(
            localOnLine9,
            undefined,
            'expected NO diagnostic on `localVar` at line 9 (Tier 3 Procedure Local); ' +
            'got: ' + JSON.stringify(diags)
        );
    });

    // ─── (5) CROSS-TIER SENTINEL — bidirectional ───────────────────────────

    /**
     * Bidirectional anchor against "fix widened too far + masked everything".
     * Same Tier 6 fixture as test 1, but adds `bogus` (genuinely undeclared
     * anywhere reachable) on a separate line. Assert NO fire on `a` (Tier 6
     * declared) AND DOES fire on `bogus` (genuinely undeclared) — both
     * simultaneously.
     *
     * Discriminates against:
     *   - "didn't widen" (RED on a, RED on bogus)
     *   - "widened too far" (GREEN on a, GREEN on bogus — masking real bugs)
     *
     * Only "widened correctly" passes (GREEN on a, RED on bogus).
     */
    test('CROSS-TIER SENTINEL — Tier 6 declared `a` no fire AND genuinely undeclared `bogus` DOES fire', async () => {
        const fixture = buildMultiFileFixture({
            files: {
                'SimpleNewSln.clw': [
                    "  PROGRAM",                          // 0
                    '  MAP',                               // 1
                    '  END',                               // 2
                    '',                                    // 3
                    'a       LONG',                        // 4 — Tier 6 Global
                    '',                                    // 5
                    '  CODE',                              // 6
                    '  RETURN',                            // 7
                ].join('\n'),
                'MyNextProcedure.clw': [
                    "  MEMBER('SimpleNewSln.clw')",       // 0
                    '  MAP',                               // 1
                    '  END',                               // 2
                    'MyNextProcedure PROCEDURE',           // 3
                    '  CODE',                              // 4
                    '  a = 1',                             // 5 — Tier 6 declared, NO fire
                    '  bogus = 2',                         // 6 — genuinely undeclared, DOES fire
                    '  RETURN',                            // 7
                ].join('\n'),
            },
            frg: { programFile: 'SimpleNewSln.clw', memberFiles: ['MyNextProcedure.clw'] }
        });

        const memberDoc = fixture.documents['MyNextProcedure.clw'];
        const memberTokens = new ClarionTokenizer(memberDoc.getText()).tokenize();
        const diags = await runDiagnostic(memberDoc, memberTokens);

        // Positive (Tier 6 declared): NO fire on `a` at line 5
        assert.strictEqual(
            diags.find(d => d.line === 5),
            undefined,
            'cross-tier sentinel positive: expected NO diagnostic on `a` at line 5 (Tier 6 Global); ' +
            'got: ' + JSON.stringify(diags)
        );
        // Negative (genuinely undeclared): DOES fire on `bogus` at line 6
        const bogusOnLine6 = diags.find(d => d.line === 6);
        assert.ok(
            bogusOnLine6,
            'cross-tier sentinel negative: expected diagnostic on `bogus` at line 6 (genuinely undeclared); ' +
            'got: ' + JSON.stringify(diags) +
            ' — fix widened too far if both are silent'
        );
        assert.ok(
            bogusOnLine6.message.toLowerCase().includes('bogus'),
            'expected diagnostic message to reference `bogus`; got: ' + JSON.stringify(bogusOnLine6)
        );
    });

    // ─── (6) REGRESSION — built-in shortcut ─────────────────────────────────

    /**
     * `SELF` is in `BUILT_IN_IDENTIFIERS` — `SELF.Method()` short-circuits the
     * dotted-leading-scope check at the LHS path. GREEN today; must stay
     * GREEN — SymbolFinder fallback shouldn't accidentally cause a fire on
     * SELF when invoked outside a class body.
     */
    test('REGRESSION — built-in identifier `SELF.x` does not fire', async () => {
        const code = [
            "  PROGRAM",
            '  MAP',
            '  END',
            '  CODE',
            '  RETURN',
            '',                                            // 5
            'MyProc PROCEDURE',                            // 6
            '  CODE',                                      // 7
            '  SELF.field = 1',                            // 8 — SELF is built-in
            '  RETURN',                                    // 9
        ].join('\n');
        const doc = TextDocument.create('file:///test-self.clw', 'clarion', 1, code);
        const tokens = new ClarionTokenizer(code).tokenize();
        const diags = await runDiagnostic(doc, tokens);

        const selfOnLine8 = diags.find(d => d.line === 8);
        assert.strictEqual(
            selfOnLine8,
            undefined,
            'expected NO diagnostic on `SELF` at line 8 (SELF is in BUILT_IN_IDENTIFIERS); ' +
            'got: ' + JSON.stringify(diags)
        );
    });
});

/**
 * #319 (reopen) — structural words must never become cross-file candidates.
 *
 * The tokenizer emits `DO` as a TokenType.Variable at every DO site, and `DO`
 * is absent from KeywordService's hover-keyword list — so the augment pass
 * treated it as an undeclared-candidate and cross-file-resolved it. On the
 * real app that ONE word cost 6.9s of a 7.7s validation: `do` sits in the
 * reference index's stoplist, so `mayContain` answers true conservatively and
 * the sibling walk loaded all 160 family modules for it.
 */
suite('UndeclaredVariableDiagnostics — structural words are never candidates (#319)', () => {

    let savedUndeclaredEnabled = false;

    setup(() => {
        savedUndeclaredEnabled = serverSettings.undeclaredVariablesEnabled;
        serverSettings.undeclaredVariablesEnabled = true;
    });

    teardown(() => {
        serverSettings.undeclaredVariablesEnabled = savedUndeclaredEnabled;
        teardownMultiFileFixture();
    });

    test('DO / structural words never reach symbolFinder.findSymbol', async () => {
        const fixture = buildMultiFileFixture({
            files: {
                'main.clw': [
                    '  PROGRAM',
                    '  MAP',
                    '  END',
                    '  CODE',
                    '  RETURN',
                ].join('\n'),
                'MemberA.clw': [
                    "  MEMBER('main.clw')",
                    'ProcA PROCEDURE',
                    '  CODE',
                    '  DO SomeRoutine',
                    '  UnknownName = 1',
                    '  RETURN',
                    'SomeRoutine ROUTINE',
                    '  CODE',
                    '  EXIT',
                ].join('\n'),
            },
            frg: { programFile: 'main.clw', memberFiles: ['MemberA.clw'] }
        });

        const memberDoc = fixture.documents['MemberA.clw'];
        const memberTokens = new ClarionTokenizer(memberDoc.getText()).tokenize();

        const queried: string[] = [];
        const stubFinder = {
            findSymbol: async (name: string) => { queried.push(name.toUpperCase()); return null; }
        } as unknown as SymbolFinderService;

        await validateUndeclaredVariablesAsync(memberTokens, memberDoc, stubFinder);

        assert.ok(!queried.includes('DO'),
            `'DO' must never be a cross-file candidate; queried: [${queried.join(', ')}]`);
        assert.ok(queried.includes('UNKNOWNNAME'),
            'genuine unknown names must still be resolved cross-file');
    });
});
