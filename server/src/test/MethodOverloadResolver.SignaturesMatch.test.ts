import * as assert from 'assert';
import { MethodOverloadResolver } from '../utils/MethodOverloadResolver';

/**
 * Unit suite for `MethodOverloadResolver.signaturesMatch(sigA, sigB)` —
 * the new public wrapper added by task 5f7478dc as the foundation for
 * ReferencesProvider P2a wire-up (fe254d6f Phase A).
 *
 * The wrapper composes the existing private methods:
 *   - `extractParameterTypes(signature: string): string[]` — extracts a
 *     normalized type array from a `PROCEDURE(...)` signature string. Strips
 *     CONST / REF / default values / omittable angle brackets; uppercases
 *     types; preserves reference indicators like `*` (so `*STRING` and
 *     `STRING` remain distinct).
 *   - `parametersMatch(typesA, typesB): boolean` — array equality with
 *     whitespace normalization.
 *
 * Tests pin all the transformation behaviors so future refactors of either
 * private method don't silently regress the wrapper.
 *
 * Critical pin: case 4 (`*STRING` vs `STRING` → false) — Mark-reported
 * user-visible discriminator that the wrapper must preserve. Without it,
 * `Append(*STRING, LONG)` vs `Append(STRING)` overloads collapse and FAR
 * over-matches catastrophically (the bug 35019583 / fe254d6f are aimed at).
 */
suite('MethodOverloadResolver — signaturesMatch (5f7478dc)', () => {

    let resolver: MethodOverloadResolver;

    setup(() => {
        resolver = new MethodOverloadResolver();
    });

    // ─── (1) same arity, same single type ───────────────────────────────────
    test('same arity + same single type → true', () => {
        assert.strictEqual(
            resolver.signaturesMatch('PROCEDURE(STRING)', 'PROCEDURE(STRING)'),
            true
        );
    });

    // ─── (2) different arity ────────────────────────────────────────────────
    test('different arity → false', () => {
        assert.strictEqual(
            resolver.signaturesMatch('PROCEDURE(STRING)', 'PROCEDURE(STRING, LONG)'),
            false
        );
    });

    // ─── (3) same arity, different type ─────────────────────────────────────
    test('same arity + different type → false', () => {
        assert.strictEqual(
            resolver.signaturesMatch('PROCEDURE(STRING)', 'PROCEDURE(LONG)'),
            false
        );
    });

    // ─── (4) CRITICAL: *STRING vs STRING — Mark's user-visible discriminator ──
    test("*STRING vs STRING → false (Mark's critical user-visible discriminator)", () => {
        assert.strictEqual(
            resolver.signaturesMatch('PROCEDURE(*STRING)', 'PROCEDURE(STRING)'),
            false,
            "*STRING and STRING are distinct types; without this discrimination " +
            "Append(*STRING, LONG) vs Append(STRING) overloads collapse and FAR " +
            "over-matches (the failure mode 35019583 / fe254d6f target)"
        );
    });

    // ─── (5) CONST stripping equivalence ────────────────────────────────────
    test('CONST stripping — CONST STRING vs STRING → true', () => {
        assert.strictEqual(
            resolver.signaturesMatch(
                'PROCEDURE(CONST STRING name)',
                'PROCEDURE(STRING name)'
            ),
            true,
            'CONST is a prototype-only modifier per extractParameterType:458; ' +
            'wrapper must treat the two signatures as equivalent'
        );
    });

    // ─── (6) REF stripping equivalence ──────────────────────────────────────
    test('REF stripping — REF LONG vs LONG → true', () => {
        assert.strictEqual(
            resolver.signaturesMatch(
                'PROCEDURE(REF LONG n)',
                'PROCEDURE(LONG n)'
            ),
            true,
            'REF is a prototype-only modifier per extractParameterType:458; ' +
            'wrapper must treat the two signatures as equivalent'
        );
    });

    // ─── (7) Default-value stripping equivalence ────────────────────────────
    test("default-value stripping — STRING n = 'x' vs STRING n → true", () => {
        assert.strictEqual(
            resolver.signaturesMatch(
                "PROCEDURE(STRING n = 'x')",
                'PROCEDURE(STRING n)'
            ),
            true,
            'Default values are stripped per extractParameterType:455; ' +
            'wrapper must treat the two signatures as equivalent'
        );
    });

    // ─── (8) Omittable angle bracket stripping ──────────────────────────────
    test('omittable angle brackets — <STRING n> vs STRING n → true', () => {
        assert.strictEqual(
            resolver.signaturesMatch(
                'PROCEDURE(<STRING n>)',
                'PROCEDURE(STRING n)'
            ),
            true,
            'Angle brackets are stripped per extractParameterType:452; ' +
            'wrapper must treat the omittable signature as equivalent'
        );
    });

    // ─── (9) Type-only signature equivalence ────────────────────────────────
    test('type-only signature — PROCEDURE(STRING) vs PROCEDURE(STRING name) → true', () => {
        assert.strictEqual(
            resolver.signaturesMatch(
                'PROCEDURE(STRING)',
                'PROCEDURE(STRING name)'
            ),
            true,
            'A signature without a parameter name should match an equivalent ' +
            'signature with a name; the comparison is type-shape-only per ' +
            'extractParameterType:467-475 + parametersMatch'
        );
    });
});
