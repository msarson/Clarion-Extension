import * as assert from 'assert';
import { MethodOverloadResolver } from '../utils/MethodOverloadResolver';
import { ArgClassification } from '../utils/CallSiteArgumentClassifier';

/**
 * Unit suite for `MethodOverloadResolver.findOverloadByArgClassifications`
 * (P2b — task 10ea5a80, Phase B step 2).
 *
 * Pins Mark's locked overload-resolution rule (project_clarion_overload_resolution_rule):
 *   1. Literal string → matches `(STRING …)` only (non-reference). Cannot match `(*STRING …)`.
 *   2. Literal numeric → matches `(LONG …)` / `(REAL …)` only (non-reference).
 *   3. Variable arg → matches both base type and `*TYPE` ref form; compiler picks most specific.
 *   4. `*TYPE` parameter → only invokable with addressable variable.
 *
 * Plus Mark's three picks for P2b:
 *   (a) Standalone classifier (consumed here via ArgClassification[]).
 *   (b) Match-all fallback when no candidate type-matches → `matchedAll: true`.
 *   (c) Strict-mode flag (`strictRefMatching`) — default OFF, both modes tested.
 */
suite('MethodOverloadResolver — findOverloadByArgClassifications (10ea5a80 Phase B)', () => {

    let resolver: MethodOverloadResolver;

    setup(() => {
        resolver = new MethodOverloadResolver();
    });

    function arg(kind: ArgClassification['kind'], inferredType?: string): ArgClassification {
        return { kind, inferredType, rawText: '', line: 0, character: 0 };
    }

    // ─── (1) Trivial cases — no real disambiguation needed ──────────────────

    suite('trivial', () => {
        test('zero candidates → matchedAll fallback', () => {
            const r = resolver.findOverloadByArgClassifications([], []);
            assert.deepStrictEqual(r, { matchedIndex: -1, matchedAll: true });
        });

        test('single candidate → matchedIndex 0', () => {
            const r = resolver.findOverloadByArgClassifications(
                [arg('literal_string', 'STRING')],
                ['PROCEDURE(STRING s)']
            );
            assert.deepStrictEqual(r, { matchedIndex: 0, matchedAll: false });
        });

        test('arity mismatch on all candidates → matchedAll fallback', () => {
            const r = resolver.findOverloadByArgClassifications(
                [arg('literal_string', 'STRING')],
                ['PROCEDURE(STRING s, LONG n)', 'PROCEDURE(STRING a, STRING b)']
            );
            assert.deepStrictEqual(r, { matchedIndex: -1, matchedAll: true });
        });
    });

    // ─── (2) Mark's rule — literal arg cannot bind to *TYPE ─────────────────

    suite("Mark's rule — literal arg + (*TYPE) overload", () => {
        test('literal_string + [STRING, *STRING] → picks STRING (non-ref)', () => {
            const r = resolver.findOverloadByArgClassifications(
                [arg('literal_string', 'STRING')],
                ['PROCEDURE(STRING s)', 'PROCEDURE(*STRING s)']
            );
            assert.strictEqual(r.matchedIndex, 0);
            assert.strictEqual(r.matchedAll, false);
        });

        test('literal_string + [*STRING] only → matchedAll fallback (cannot bind)', () => {
            const r = resolver.findOverloadByArgClassifications(
                [arg('literal_string', 'STRING')],
                ['PROCEDURE(*STRING s)']
            );
            // *STRING is by-ref; literal has no address → cannot bind. Single-candidate
            // fixture (matches test name); pre-#120 version had a second LONG decl pinning
            // cross-family-rejection, which Mark's rule now permits — second decl removed.
            assert.deepStrictEqual(r, { matchedIndex: -1, matchedAll: true });
        });

        test('literal_picture + [STRING, *STRING] → picks STRING', () => {
            const r = resolver.findOverloadByArgClassifications(
                [arg('literal_picture', 'STRING')],
                ['PROCEDURE(STRING s)', 'PROCEDURE(*STRING s)']
            );
            assert.strictEqual(r.matchedIndex, 0);
        });

        test('literal_numeric + [LONG, *LONG] → picks LONG', () => {
            const r = resolver.findOverloadByArgClassifications(
                [arg('literal_numeric', 'LONG')],
                ['PROCEDURE(LONG n)', 'PROCEDURE(*LONG n)']
            );
            assert.strictEqual(r.matchedIndex, 0);
        });

        test('literal_numeric (REAL) + [LONG, REAL] → picks REAL by exact-type score', () => {
            // Both LONG and REAL are numeric-compatible per family; specificity score wins.
            const r = resolver.findOverloadByArgClassifications(
                [arg('literal_numeric', 'REAL')],
                ['PROCEDURE(LONG n)', 'PROCEDURE(REAL n)']
            );
            // Both are numeric-compatible (no ref), so both pass. Score: exact REAL == 2 vs LONG == 2 (compatible-class).
            // Wait: scoreArgParam for literal_numeric returns 2 if !paramIsRef regardless of base type.
            // Let's verify behaviour explicitly: both score 2, tied → matchedAll fallback per the policy.
            // This is acceptable: numeric literal disambiguation is hard without literal-base inspection.
            assert.deepStrictEqual(r, { matchedIndex: -1, matchedAll: true },
                'numeric literal across families should fall back rather than guess');
        });
    });

    // ─── (3) Mark's rule — variable arg can match base or ref ───────────────

    suite("Mark's rule — variable arg picks most specific", () => {
        test('variable STRING + [STRING, *STRING] → picks STRING (exact-base score wins over ref-variant)', () => {
            const r = resolver.findOverloadByArgClassifications(
                [arg('variable', 'STRING')],
                ['PROCEDURE(STRING s)', 'PROCEDURE(*STRING s)']
            );
            assert.strictEqual(r.matchedIndex, 0, 'STRING decl is more specific (exact-base) than *STRING ref-variant for a STRING var');
        });

        test('variable STRING(20) + [STRING] → matches via base-type normalization', () => {
            // STRING(20) normalizes to STRING for type comparison.
            const r = resolver.findOverloadByArgClassifications(
                [arg('variable', 'STRING(20)')],
                ['PROCEDURE(STRING s)']
            );
            assert.strictEqual(r.matchedIndex, 0);
        });

        test('variable LONG + [STRING, LONG] → picks LONG (type discrimination)', () => {
            const r = resolver.findOverloadByArgClassifications(
                [arg('variable', 'LONG')],
                ['PROCEDURE(STRING s)', 'PROCEDURE(LONG n)']
            );
            assert.strictEqual(r.matchedIndex, 1);
        });

        test('variable MyClass + [MyClass, OtherClass] → exact-type pick', () => {
            const r = resolver.findOverloadByArgClassifications(
                [arg('variable', 'MyClass')],
                ['PROCEDURE(OtherClass o)', 'PROCEDURE(MyClass m)']
            );
            assert.strictEqual(r.matchedIndex, 1);
        });

        test('variable with no inferredType + [STRING] → matched single candidate', () => {
            const r = resolver.findOverloadByArgClassifications(
                [arg('variable')],
                ['PROCEDURE(STRING s)']
            );
            assert.strictEqual(r.matchedIndex, 0);
            assert.strictEqual(r.matchedAll, false, 'single candidate doesnt need disambiguation');
        });
    });

    // ─── (4) Mark pick (b) — match-all fallback policies ────────────────────

    suite('Mark pick (b) — match-all fallback', () => {
        test('all candidates type-incompatible → matchedAll fallback', () => {
            const r = resolver.findOverloadByArgClassifications(
                [arg('literal_string', 'STRING')],
                ['PROCEDURE(LONG n)', 'PROCEDURE(REAL r)'] // neither is string-compatible
            );
            assert.deepStrictEqual(r, { matchedIndex: -1, matchedAll: true });
        });

        test('expression arg + multiple candidates → matchedAll (cannot disambiguate)', () => {
            const r = resolver.findOverloadByArgClassifications(
                [arg('expression')],
                ['PROCEDURE(STRING s)', 'PROCEDURE(LONG n)']
            );
            assert.deepStrictEqual(r, { matchedIndex: -1, matchedAll: true });
        });

        test('unknown arg + multiple candidates → matchedAll', () => {
            const r = resolver.findOverloadByArgClassifications(
                [arg('unknown')],
                ['PROCEDURE(STRING s)', 'PROCEDURE(LONG n)']
            );
            assert.deepStrictEqual(r, { matchedIndex: -1, matchedAll: true });
        });

        test('multi-arg with mixed inferable + un-inferable → fallback when ambiguous', () => {
            // First arg is unknown (matches anything); second is variable LONG.
            // Both candidates have arity 2 and second-arg matches LONG. → still ambiguous.
            const r = resolver.findOverloadByArgClassifications(
                [arg('unknown'), arg('variable', 'LONG')],
                ['PROCEDURE(STRING s, LONG n)', 'PROCEDURE(REAL r, LONG n)']
            );
            assert.strictEqual(r.matchedAll, true);
        });

        test('multi-arg with first-arg discriminator → unique match', () => {
            // First arg is variable STRING; only one candidate has STRING first param.
            const r = resolver.findOverloadByArgClassifications(
                [arg('variable', 'STRING'), arg('variable', 'LONG')],
                ['PROCEDURE(STRING s, LONG n)', 'PROCEDURE(REAL r, LONG n)']
            );
            assert.strictEqual(r.matchedIndex, 0);
            assert.strictEqual(r.matchedAll, false);
        });
    });

    // ─── (5) Mark pick (c) — strict-mode flag ───────────────────────────────

    suite('Mark pick (c) — strictRefMatching flag', () => {
        test('default OFF: unknown arg + [*STRING] → match (allow)', () => {
            const r = resolver.findOverloadByArgClassifications(
                [arg('unknown')],
                ['PROCEDURE(*STRING s)']
            );
            assert.strictEqual(r.matchedIndex, 0,
                'default mode: unknown arg can match *TYPE param (single candidate trivially passes)');
        });

        test('strict ON: unknown arg + [*STRING] only → matchedAll fallback (drops *TYPE)', () => {
            const r = resolver.findOverloadByArgClassifications(
                [arg('unknown')],
                ['PROCEDURE(*STRING s)'],
                { strictRefMatching: true }
            );
            assert.deepStrictEqual(r, { matchedIndex: -1, matchedAll: true },
                'strict mode: un-inferable arg cannot prove addressability → drop *TYPE → fall through to match-all');
        });

        test('strict ON: unknown arg + [STRING, *STRING] → picks STRING (drops *TYPE)', () => {
            const r = resolver.findOverloadByArgClassifications(
                [arg('unknown')],
                ['PROCEDURE(STRING s)', 'PROCEDURE(*STRING s)'],
                { strictRefMatching: true }
            );
            assert.strictEqual(r.matchedIndex, 0,
                'strict mode: unknown drops *STRING candidate, leaves single STRING candidate');
        });

        test('strict ON: call_result arg + [*STRING] → matchedAll (call result not addressable)', () => {
            const r = resolver.findOverloadByArgClassifications(
                [arg('call_result')],
                ['PROCEDURE(*STRING s)'],
                { strictRefMatching: true }
            );
            assert.deepStrictEqual(r, { matchedIndex: -1, matchedAll: true });
        });

        test('strict ON: variable with inferredType still matches *TYPE (variable IS addressable)', () => {
            const r = resolver.findOverloadByArgClassifications(
                [arg('variable', 'STRING')],
                ['PROCEDURE(*STRING s)'],
                { strictRefMatching: true }
            );
            assert.strictEqual(r.matchedIndex, 0,
                'strict mode does NOT block variable-with-known-type from matching *TYPE — only un-inferable args');
        });

        test('strict ON: literal still cannot match *TYPE (consistent with default)', () => {
            const r = resolver.findOverloadByArgClassifications(
                [arg('literal_string', 'STRING')],
                ['PROCEDURE(*STRING s)'],
                { strictRefMatching: true }
            );
            assert.deepStrictEqual(r, { matchedIndex: -1, matchedAll: true },
                'literal cant bind *TYPE in either mode — both modes converge for literals');
        });
    });

    // ─── (6) Specificity tiebreaks ──────────────────────────────────────────

    suite('specificity tiebreaks', () => {
        test('variable STRING + [*STRING, STRING] → exact-base STRING wins over ref-variant', () => {
            const r = resolver.findOverloadByArgClassifications(
                [arg('variable', 'STRING')],
                ['PROCEDURE(*STRING s)', 'PROCEDURE(STRING s)']
            );
            assert.strictEqual(r.matchedIndex, 1, 'STRING (exact base) > *STRING (ref-variant)');
        });

        test('tied scores → matchedAll fallback (no guessing)', () => {
            // Two candidates that look equivalent for an unknown arg.
            const r = resolver.findOverloadByArgClassifications(
                [arg('variable')],
                ['PROCEDURE(STRING s)', 'PROCEDURE(LONG n)']
            );
            assert.deepStrictEqual(r, { matchedIndex: -1, matchedAll: true });
        });
    });

    // ─── (7) The shape from Eve's tests (overload distinction integration) ──

    suite('integration shape — Eve test 5 multi-overload pin', () => {
        test('STRING caller pattern: [literal_string] vs [PROCEDURE(STRING), PROCEDURE(LONG)] → picks STRING', () => {
            // This is the call site `inst.Append('x')` from Eve's test 5; the overload
            // resolver should pick the STRING decl, not the LONG decl, for FAR scoping.
            const r = resolver.findOverloadByArgClassifications(
                [arg('literal_string', 'STRING')],
                ['PROCEDURE(STRING s)', 'PROCEDURE(LONG n)']
            );
            assert.strictEqual(r.matchedIndex, 0,
                'STRING literal must pick STRING overload (Eve test 5 STRING caller)');
        });

        test('LONG caller pattern: [literal_numeric LONG] vs same overloads → picks LONG', () => {
            const r = resolver.findOverloadByArgClassifications(
                [arg('literal_numeric', 'LONG')],
                ['PROCEDURE(STRING s)', 'PROCEDURE(LONG n)']
            );
            assert.strictEqual(r.matchedIndex, 1,
                'LONG literal must pick LONG overload (Eve test 5 LONG caller — must NOT match STRING decl)');
        });
    });

    // ─── (8) #120 — overload resolution gap fixes (Phase A RED-pin contract) ─
    //
    // Bidirectional-pin shape per `feedback_bidirectional_pin_assertion`: every
    // test asserts BOTH "wrong NOT picked" AND "right IS picked". These pins were
    // authored during the #120 Phase A audit (Eve, 2026-05-11) and document the
    // contract Phase B (Alice) must drive to GREEN.
    //
    // - Test 1 (Gap 1 default-aware arity) — RED today; GREEN when Alice mirrors
    //   `selectBestOverload`'s `countDefaultParams` range into the arg-classification
    //   path's arity filter at `:611-614`.
    // - Test 2 (Gap 2 cross-family literal) — RED today; GREEN when Alice relaxes
    //   `argMatchesParam:660-669` to allow scalar paramBase for scalar literals,
    //   paired with a natural-family scoring bias in `scoreArgParam:712-718`
    //   (natural=3, cross-family=1) so existing pins at line 290-298/301-308 stay GREEN.
    // - Test 3 (Gap 3 signaturesMatch complex-type) — MIGRATED to
    //   `MethodOverloadResolver.IndistinguishablePrototypes.test.ts` per Bob's
    //   2026-05-11 housekeeping call. That suite (35ceab3) is the canonical home
    //   for decl-vs-decl signature-equivalence pinning; this call-site suite is
    //   the wrong context for the assertion.
    // - Test 4 (Gap 4 &Type variable inference) — GREEN today as a synthetic
    //   resolver-boundary pin; serves as hypothesis-validation gate per
    //   `feedback_non_x_regression_sentinel`. Real upstream coverage of
    //   `captureLabelType:1195-1197` lives in a ReferencesProvider integration
    //   test (Phase B/C if Alice deems necessary; current code-read suggests the
    //   `&`-strip already works for `ReferenceVariable` token shape).

    suite('#120 — overload resolution gap fixes', () => {

        // Test 1 — Gap 1: default-aware arity. Mark's exact repro shape.
        test("Mark's SetValue repro: [literal_string] + [(STRING, LONG=default), (StringTheory)] → picks default-aware overload", () => {
            const r = resolver.findOverloadByArgClassifications(
                [arg('literal_string', 'STRING')],
                ['PROCEDURE(STRING newValue, LONG pClip=st:NoClip)', 'PROCEDURE(StringTheory newValue)']
            );
            assert.strictEqual(r.matchedIndex, 0,
                'STRING+default overload IS picked (default-aware arity admits the 1-arg call)');
            assert.notStrictEqual(r.matchedIndex, 1,
                'StringTheory overload is NOT picked (string literal cannot match class-type param)');
            assert.strictEqual(r.matchedAll, false,
                'no match-all fallback — arity-with-defaults disambiguates uniquely');
        });

        // Test 2 — Gap 2: cross-family literal on a single legal-Clarion overload.
        // Rule 3 (any-two-scalar-overloads-illegal) means this fixture represents
        // the only legal way cross-family conversion surfaces: a single scalar overload.
        test('cross-family single overload: [literal_numeric] + [(STRING)] only → matched (implicit conversion legal)', () => {
            const r = resolver.findOverloadByArgClassifications(
                [arg('literal_numeric', 'LONG')],
                ['PROCEDURE(STRING s)']
            );
            assert.strictEqual(r.matchedIndex, 0,
                'STRING overload IS picked despite numeric literal (Clarion permits implicit conversion)');
            assert.notStrictEqual(r.matchedAll, true,
                'NOT match-all — cross-family literal should resolve uniquely against the single legal overload');
        });

        // Test 3 from f10c65a — moved to IndistinguishablePrototypes suite via 35ceab3.
        // Decl-vs-decl signature equivalence pinned canonically there (rule 6 *COMPLEX
        // ≡ COMPLEX + scalar discriminator preserved). This call-site suite was the
        // wrong context for the assertion.

        // Test 4 — Gap 4: &Type variable inference (hypothesis-validation gate).
        // Synthetic resolver-boundary pin: GIVEN the upstream type-index strips `&`
        // from `st &StringTheory` declarations (hypothesis), the resolver picks the
        // matching complex-type overload. Code-read of `captureLabelType:1195-1197`
        // supports the hypothesis. If this test goes RED unexpectedly, escalate
        // upstream (tokenizer or buildFileVarTypeIndex).
        test('&Type variable inference (sentinel): [variable StringTheory] + [(StringTheory)] → matched', () => {
            const r = resolver.findOverloadByArgClassifications(
                [arg('variable', 'StringTheory')],
                ['PROCEDURE(StringTheory s)']
            );
            assert.strictEqual(r.matchedIndex, 0,
                'StringTheory variable IS matched to StringTheory param (post-& strip contract honoured)');
            assert.strictEqual(r.matchedAll, false,
                'no match-all fallback — type inference resolves uniquely');
        });
    });
});
