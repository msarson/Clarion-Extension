import * as assert from 'assert';
import { MethodOverloadResolver } from '../utils/MethodOverloadResolver';

/**
 * Unit suite for `MethodOverloadResolver.extractParameterType` — pins the
 * `LONG X` bug fix from GH #130 (single-letter all-uppercase param name)
 * plus the counter-examples that prove the simplification doesn't regress
 * the existing transformation behaviours.
 *
 * `extractParameterType` is private; tested via `as any` cast. The same
 * codepath is exercised end-to-end by `signaturesMatch` (public), which
 * gets one integration test below pinning the user-visible contract.
 *
 * **Bug shape (#130, surfaced 2026-05-11 during #122 PROCEDURE/FUNCTION work):**
 *
 * The heuristic at `MethodOverloadResolver.ts:679` previously read:
 *
 *     if (lastWord.match(/^[a-z]/i) && (lastWord !== lastWord.toUpperCase() || lastWord.length > 1)) {
 *
 * The `lastWord.length > 1` clause was intended to protect "single-letter
 * all-uppercase TYPE" from being stripped as a variable name. **The probe
 * (Alice 2026-05-14) found this defensive case is hypothetical:** Clarion
 * has no single-letter scalar types (the `isStringType` / `isNumericType`
 * enumerations at `MethodOverloadResolver.ts:1066-1076` enumerate the complete
 * scalar set, every member multi-letter), and user-defined single-letter
 * types in single-word param shapes hit the `words.length === 1` branch
 * (line 671) before reaching the length-1 heuristic. No real Clarion parameter
 * shape requires the length-1 check.
 *
 * Fix shape (Bob authorisation 2026-05-14): drop the length-1 clause. Condition
 * reduces to `lastWord.match(/^[a-z]/i)` — "if the last word starts with a
 * letter, treat it as the variable name".
 *
 * **Bidirectional-pin** per `feedback_bidirectional_pin_assertion`: the RED
 * test asserts BOTH "wrong NOT in result" AND "right IS in result" on the
 * single-letter-uppercase bug. The 6 counter-examples enforce that the
 * simplification doesn't regress the function's other shapes.
 */
suite('MethodOverloadResolver — extractParameterType (#130)', () => {

    let resolver: MethodOverloadResolver;

    setup(() => {
        resolver = new MethodOverloadResolver();
    });

    function extract(param: string, applyComplexRefNormalization: boolean = true): string {
        return (resolver as any).extractParameterType(param, applyComplexRefNormalization);
    }

    // ─── (1) RED: the #130 bug — `LONG X` returned the WHOLE thing as type ───
    suite('bug pin (#130) — single-letter all-uppercase variable name', () => {

        test('extractParameterType("LONG X") returns "LONG" (bidirectional)', () => {
            const result = extract('LONG X');
            // Bidirectional-pin per feedback_bidirectional_pin_assertion:
            // (positive) result IS "LONG"
            assert.strictEqual(result, 'LONG',
                "extractParameterType must strip single-letter all-uppercase variable name 'X' " +
                "from 'LONG X' and return type 'LONG' (#130 bug fix)");
            // (negative) result is NOT "LONG X" (the pre-fix wrong answer)
            assert.notStrictEqual(result, 'LONG X',
                "pre-fix heuristic returned 'LONG X' joined; bug pin asserts the wrong answer is gone");
        });

        test('signaturesMatch("PROCEDURE(LONG X)", "PROCEDURE(LONG)") → true (integration)', () => {
            // Public-API integration — exercises the same code path via signaturesMatch.
            // Pre-fix: extractParameterTypes("PROCEDURE(LONG X)") = ["LONG X"], doesn't match ["LONG"] → false.
            // Post-fix: ["LONG"] === ["LONG"] → true.
            assert.strictEqual(
                resolver.signaturesMatch('PROCEDURE(LONG X)', 'PROCEDURE(LONG)'),
                true,
                "(LONG X) and (LONG) are the same signature shape — X is a variable name; " +
                "without the #130 fix, signaturesMatch returned false on this Mark-legal Clarion form"
            );
        });

        test('symmetric bug shapes — single-letter all-uppercase variable names on common types', () => {
            // Sweep the bug across the scalar-type enumerations the probe cited
            // (MethodOverloadResolver.ts:1066-1076). Each of these would have
            // failed pre-fix because the type happens to be multi-letter while
            // the variable name happens to be single-letter all-upper.
            assert.strictEqual(extract('STRING N'), 'STRING', "(STRING N) — N is variable, not type");
            assert.strictEqual(extract('BYTE I'), 'BYTE',     "(BYTE I) — I is variable, not type");
            assert.strictEqual(extract('SHORT J'), 'SHORT',   "(SHORT J) — J is variable, not type");
            assert.strictEqual(extract('ULONG K'), 'ULONG',   "(ULONG K) — K is variable, not type");
        });
    });

    // ─── (2) Counter-examples: must stay GREEN through the simplification ─────
    suite('counter-examples — silent-regression guard on simplification', () => {

        test('"LONG" (no var name, words.length===1 branch) returns "LONG"', () => {
            assert.strictEqual(extract('LONG'), 'LONG',
                'declarations can omit param names; single-word param hits the words.length===1 branch');
        });

        test('"LONG var" (normal mixed case) returns "LONG"', () => {
            assert.strictEqual(extract('LONG var'), 'LONG',
                'mixed-case lastWord is the variable name; pre-fix and post-fix both correct');
        });

        test('"LONG MYVAR" (all-uppercase length>1) returns "LONG"', () => {
            assert.strictEqual(extract('LONG MYVAR'), 'LONG',
                'all-uppercase lastWord with length>1 is recognised as variable name — common in legacy Clarion');
        });

        test('"*STRING pStr" (reference indicator + name) returns "*STRING"', () => {
            assert.strictEqual(extract('*STRING pStr'), '*STRING',
                '`*` reference indicator preserved (rule 4 — `*STRING` ≠ `STRING`); name `pStr` stripped');
        });

        test('"<LONG lOpt>" (angle-bracket strip + lowercase name) returns "LONG"', () => {
            assert.strictEqual(extract('<LONG lOpt>'), 'LONG',
                'omittable angle brackets stripped before heuristic; lowercase variable name `lOpt`');
        });

        test('"LONG lVal=0" (default-value strip + lowercase name) returns "LONG"', () => {
            assert.strictEqual(extract('LONG lVal=0'), 'LONG',
                'default value `=0` stripped before heuristic; variable name `lVal` recognised');
        });
    });
});
