import * as assert from 'assert';
import { MethodOverloadResolver } from '../utils/MethodOverloadResolver';

/**
 * Unit suite for indistinguishable-prototype detection (#121 Phase A.2a).
 *
 * RED-pin contract for Phase B (Alice). Drives implementation of:
 *   - `areZeroArityCompatible(sigA, sigB)`     — rule 1 (default-overlap zero-arity collision)
 *   - `arePrototypesIdentical(sigA, sigB)`     — rule 2 (procedure-parameter structural identity)
 *   - `signaturesMatch` extension              — `*COMPLEX` ≡ `COMPLEX` per project rule 6
 *
 * Locked scope per Bob 2026-05-11 = the unconditionally-canonical subset of #121
 * (validated against `rules_for_procedure_overloading.htm` in clarion-docs).
 * Tier-2 (same-family / cross-family scalar pairs) deferred until Mark resolves
 * the rule-3 docs-vs-observation question.
 *
 * Bidirectional-pin shape per `feedback_bidirectional_pin_assertion`: each rule
 * has a "fires when it should" + "does NOT fire when it shouldnt" test pair.
 *
 * RED state contract:
 *   - Tests for rules 1 & 2 use `(resolver as any).<method>` because the
 *     helpers don't yet exist; runtime "is not a function" failure is the
 *     intended RED signal until Alice's Phase B implements them.
 *   - `signaturesMatch` exists but currently treats `*StringTheory` as distinct
 *     from `StringTheory` — clean assertion failure until Phase B extends it.
 */
suite('MethodOverloadResolver — Indistinguishable Prototype Detection (#121 Phase A.2a)', () => {

    let resolver: MethodOverloadResolver;

    setup(() => {
        resolver = new MethodOverloadResolver();
    });

    // ─── Rule 1 — default-overlap zero-arity collision ──────────────────────
    //
    // Per canonical Clarion docs (`rules_for_procedure_overloading.htm`):
    //   Func PROCEDURE(SHORT = 10)    ! 9
    //   Func PROCEDURE()              ! Illegal, indistinguishable from 9
    //
    // Func(SHORT=10) is callable with zero args (default fills in); declaring
    // Func() alongside it creates two prototypes both invokable as `Func` with
    // no args. The compiler cannot disambiguate.

    suite('Rule 1 — default-overlap zero-arity collision', () => {

        test('Func() + Func(LONG=10) → IS indistinguishable (both 0-arity callable)', () => {
            assert.strictEqual(
                (resolver as any).areZeroArityCompatible('PROCEDURE()', 'PROCEDURE(LONG=10)'),
                true,
                'rule 1 fires: Func() collides with Func(LONG=10) at the 0-arity call shape'
            );
        });

        test('Func() + Func(LONG) → IS NOT indistinguishable (mandatory param breaks 0-arity overlap)', () => {
            assert.strictEqual(
                (resolver as any).areZeroArityCompatible('PROCEDURE()', 'PROCEDURE(LONG)'),
                false,
                'rule 1 does NOT fire: Func(LONG) is 1-arity-only — no 0-arity collision'
            );
        });

        test('Func(LONG=1) + Func(LONG=2, STRING=\'x\') → IS indistinguishable (both 0-arity-AND-1-arity callable)', () => {
            // Both decls are 0-arity-callable AND 1-arity-callable with a LONG.
            // The double-overlap counts; the diagnostic should still fire on the 0-arity collision.
            assert.strictEqual(
                (resolver as any).areZeroArityCompatible('PROCEDURE(LONG=1)', 'PROCEDURE(LONG=2, STRING=\'x\')'),
                true,
                'rule 1 fires: both decls have all-default params → both 0-arity callable'
            );
        });
    });

    // ─── Rule 2 — procedure-parameter structural identity ────────────────────
    //
    // Per canonical Clarion docs:
    //   Func1  PROCEDURE(*SHORT)
    //   Func1a PROCEDURE(*SHORT)
    //   Func2  PROCEDURE(*LONG)
    //   Func PROCEDURE(Func1)   ! 12
    //   Func PROCEDURE(Func1a)  ! Illegal, same as 12   ← Func1 and Func1a are structurally identical
    //   Func PROCEDURE(Func2)   ! 13                    ← *LONG distinguishable from *SHORT
    //
    // Two prototypes that are structurally identical (same param types in same
    // positions, ignoring documentary labels + default values) are duplicate
    // decls, not overloads.

    suite('Rule 2 — procedure-parameter structural identity', () => {

        test('Func(*SHORT) + Func(*SHORT) → IS structurally identical', () => {
            assert.strictEqual(
                (resolver as any).arePrototypesIdentical('PROCEDURE(*SHORT)', 'PROCEDURE(*SHORT)'),
                true,
                'rule 2 fires: identical param shapes → duplicate prototype, not overload pair'
            );
        });

        test('Func(*SHORT) + Func(*LONG) → IS NOT structurally identical (per docs Func1 ≠ Func2)', () => {
            assert.strictEqual(
                (resolver as any).arePrototypesIdentical('PROCEDURE(*SHORT)', 'PROCEDURE(*LONG)'),
                false,
                'rule 2 does NOT fire: different scalar variable-types in same position → distinguishable'
            );
        });

        test('Func(LONG a) + Func(LONG b) → IS structurally identical (documentary labels ignored)', () => {
            // Documentary labels in prototypes are documentation-only per `prototype_syntax.htm`.
            // Two same-shape decls with different labels should still be flagged.
            assert.strictEqual(
                (resolver as any).arePrototypesIdentical('PROCEDURE(LONG a)', 'PROCEDURE(LONG b)'),
                true,
                'rule 2 fires: documentary param labels do not differentiate prototypes'
            );
        });
    });

    // ─── signaturesMatch extension — *COMPLEX ≡ COMPLEX (project rule 6) ─────
    //
    // Per project memory rule 6: complex types (class, group, queue, file,
    // interface) are always by-reference; the `*` is implicit. Two decls
    // (StringTheory) and (*StringTheory) declare the SAME prototype, not two
    // overloads. (Moved from #120 Phase A test.skip as substrate for #121.)

    suite('signaturesMatch extension — *COMPLEX ≡ COMPLEX (project rule 6)', () => {

        test('signaturesMatch treats (StringTheory) ≡ (*StringTheory) per rule 6', () => {
            assert.strictEqual(
                resolver.signaturesMatch('PROCEDURE(StringTheory)', 'PROCEDURE(*StringTheory)'),
                true,
                '(StringTheory) IS recognised as same prototype as (*StringTheory) — * implicit for complex types'
            );
        });

        test('signaturesMatch does NOT treat (STRING) ≡ (*STRING) — scalar * discriminator preserved', () => {
            assert.notStrictEqual(
                resolver.signaturesMatch('PROCEDURE(STRING)', 'PROCEDURE(*STRING)'),
                true,
                '(STRING) and (*STRING) ARE distinct prototypes — by-ref discriminator preserved for scalar types'
            );
        });

        test('signaturesMatch treats (MyGroup) ≡ (*MyGroup) per rule 6 (group is complex)', () => {
            assert.strictEqual(
                resolver.signaturesMatch('PROCEDURE(MyGroup)', 'PROCEDURE(*MyGroup)'),
                true,
                '(MyGroup) IS recognised as same prototype as (*MyGroup) — applies to all complex types not just classes'
            );
        });
    });
});
