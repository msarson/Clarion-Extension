import * as assert from 'assert';
import { ProcedureSignatureUtils } from '../utils/ProcedureSignatureUtils';

/**
 * Unit suite for `ProcedureSignatureUtils.extractParameterType` — the parallel
 * implementation Eve's peer-GREEN gate-4 substrate-symmetry flex caught at
 * `#130` cycle 1 (2026-05-14). Same `LONG X → "LONG X"` mis-classification
 * as `MethodOverloadResolver.extractParameterType`; same one-line fix
 * (drop the `lastWord.length > 1` defensive clause).
 *
 * This file mirrors the shape of `MethodOverloadResolver.ExtractParameterType.test.ts`
 * — 3 bug pin tests + 6 counter-examples — so the parallel implementations are
 * pinned by parallel test suites. If either implementation regresses, the suite
 * delta will surface that side specifically.
 *
 * **Probe symmetry note:** `ProcedureSignatureUtils` does NOT have its own
 * `isStringType` / `isNumericType` enumerations (simpler utility, no complex-ref
 * normalization tail). The probe argument rests on the same Clarion grammar fact
 * (no single-letter scalar types) PLUS the cross-utility cite to
 * `MethodOverloadResolver.ts:1066-1076` which provides the empirical type-set
 * enumeration. Same conclusion (hypothetical defensive case) — symmetric reasoning.
 *
 * Bidirectional-pin per `feedback_bidirectional_pin_assertion` on the RED test.
 *
 * Consumer surface (20 callsites surfaced by Eve grep, pinned indirectly by
 * existing suites of `CrossFileResolver` / `MapDeclarationDiagnostics` /
 * `ReturnValueDiagnostics` / `MapProcedureResolver`): no signature change,
 * so transitive integration trace is no-net-delta.
 */
suite('ProcedureSignatureUtils — extractParameterType (#130 substrate-symmetric)', () => {

    function extract(param: string): string {
        return (ProcedureSignatureUtils as any).extractParameterType(param);
    }

    // ─── (1) RED: the #130 bug — sibling implementation mis-classifies `LONG X` ───
    suite('bug pin (#130) — single-letter all-uppercase variable name', () => {

        test('extractParameterType("LONG X") returns "LONG" (bidirectional)', () => {
            const result = extract('LONG X');
            // (positive) result IS "LONG"
            assert.strictEqual(result, 'LONG',
                "extractParameterType must strip single-letter all-uppercase variable name 'X' " +
                "from 'LONG X' and return type 'LONG' (#130 bug fix — substrate-symmetric to " +
                "MethodOverloadResolver fix)");
            // (negative) result is NOT "LONG X" (the pre-fix wrong answer)
            assert.notStrictEqual(result, 'LONG X',
                "pre-fix heuristic returned 'LONG X' joined; bug pin asserts the wrong answer is gone");
        });

        test('extractParameterTypes("PROCEDURE(LONG X)") returns ["LONG"] (integration)', () => {
            // Public-API integration through the plural variant — exercises the same code path.
            const result = ProcedureSignatureUtils.extractParameterTypes('PROCEDURE(LONG X)');
            assert.deepStrictEqual(result, ['LONG'],
                "extractParameterTypes must yield ['LONG'] for 'PROCEDURE(LONG X)' — pre-fix " +
                "returned ['LONG X'] which broke equality with extractParameterTypes('PROCEDURE(LONG')]");
        });

        test('symmetric bug shapes — single-letter all-uppercase variable names on common types', () => {
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
                '`*` reference indicator preserved; name `pStr` stripped');
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
