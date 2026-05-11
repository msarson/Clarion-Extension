import * as assert from 'assert';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Diagnostic } from 'vscode-languageserver/node';
import { ClarionTokenizer } from '../ClarionTokenizer';
import { validateUndeclaredVariables } from '../providers/diagnostics/UndeclaredVariableDiagnostics';

/**
 * Issue #124 — undeclared-variable diagnostic flags Clarion language keywords
 * (Mark reported 2026-05-11 post-session). Phase A RED-pin contract.
 *
 * ─── Root cause (confirmed via tokenizer probe) ─────────────────────────────
 *
 * Operator keywords `OR`, `AND`, `XOR`, `BAND`, `BOR`, `BXOR`, `BNOT`, `BSHIFT`,
 * `TO`, `BY`, `NOT` (etc.) tokenize as `TokenType.Variable` (no specific pattern
 * in `TokenPatterns.ts`; fall through to Variable default). The undeclared-variable
 * diagnostic walker at `UndeclaredVariableDiagnostics.ts:181/338/352` filters
 * only `BUILT_IN_IDENTIFIERS` (SELF/PARENT/RECORDS/etc.) — never calls
 * `KeywordService.isKeyword`. Result: keyword-shaped tokens fire false positives.
 *
 * Notably, `NOT` is ALREADY registered in `clarion-keywords.json` but STILL
 * fires today — confirming the bug is the missing filter call, not the registry
 * contents. (Registry expansion for OR/AND/XOR/BAND/BOR/BXOR/BNOT/BSHIFT is
 * the OTHER half of the 2-part fix.)
 *
 * ─── Phase B fix (Alice) ────────────────────────────────────────────────────
 *
 * Part 1: Expand `server/src/data/clarion-keywords.json` with:
 *   OR, AND, XOR, BAND, BOR, BXOR, BNOT, BSHIFT (category: "Operator")
 *   Plus normalise existing operator entries (NOT) to the same category.
 *
 * Part 2: Add `KeywordService.isKeyword(t.value)` filter to 3 call sites in
 * `UndeclaredVariableDiagnostics.ts`:
 *   - `detectCheckableName:338` (bare-identifier branch — return null if keyword)
 *   - `detectCheckableName:352` (dotted branch — return null if leading scope is keyword)
 *   - `augmentDeclaredViaSymbolFinder:181` (early-skip same shape)
 *
 * ─── Test shape ─────────────────────────────────────────────────────────────
 *
 * Uses sync `validateUndeclaredVariables(tokens, document)` entry point. The
 * async path's `KeywordService` filter must trigger BEFORE the SymbolFinder
 * fallback (else `augmentDeclaredViaSymbolFinder` does cross-file work for a
 * keyword that should be rejected outright).
 *
 * Bidirectional-pin shape per `feedback_bidirectional_pin_assertion`: each RED
 * pin asserts the keyword is NOT flagged AND that surrounding real variable
 * names (declared in the procedure DATA section) are equally not flagged.
 *
 * GREEN sentinels preserve the v1+v2 diagnostic's positive coverage — real
 * undeclared identifiers must still fire across LHS / RHS / condition contexts.
 */

function runDiagnostic(code: string): Diagnostic[] {
    const doc = TextDocument.create('file:///test.clw', 'clarion', 1, code);
    const tokens = new ClarionTokenizer(code).tokenize();
    return validateUndeclaredVariables(tokens, doc);
}

/** Assert no diagnostic fires for the named identifier. */
function expectNoFire(diags: Diagnostic[], name: string, msg?: string): void {
    const offending = diags.filter(d =>
        typeof d.message === 'string' && d.message.includes(`'${name}'`));
    assert.strictEqual(offending.length, 0,
        msg ?? `'${name}' must NOT be flagged as undeclared (got: ${offending.map(d => d.message).join(', ')})`);
}

/** Assert at least one diagnostic fires for the named identifier (GREEN sentinel preservation). */
function expectFires(diags: Diagnostic[], name: string, msg?: string): void {
    const offending = diags.filter(d =>
        typeof d.message === 'string' && d.message.includes(`'${name}'`));
    assert.ok(offending.length >= 1,
        msg ?? `'${name}' MUST still be flagged as undeclared (preservation sentinel); got 0 matching diagnostics`);
}

suite('UndeclaredVariableDiagnostics — keyword filter (#124 Phase A)', () => {

    // ─── RED pins: operator keywords must NOT fire ──────────────────────────

    suite('Operator keywords in IF conditions', () => {

        test("'AND' in IF condition is NOT flagged (Marks repro)", () => {
            const diags = runDiagnostic([
                "TestProc PROCEDURE()",
                "a LONG",
                "b LONG",
                "  CODE",
                "  IF a > 0 AND b < 10",
                "  END",
            ].join('\n'));
            expectNoFire(diags, 'AND');
            expectNoFire(diags, 'a', 'surrounding declared var must not spuriously fire');
            expectNoFire(diags, 'b', 'surrounding declared var must not spuriously fire');
        });

        test("'OR' in IF condition is NOT flagged (Marks repro)", () => {
            const diags = runDiagnostic([
                "TestProc PROCEDURE()",
                "a LONG",
                "b LONG",
                "  CODE",
                "  IF a > 0 OR b < 10",
                "  END",
            ].join('\n'));
            expectNoFire(diags, 'OR');
            expectNoFire(diags, 'a');
            expectNoFire(diags, 'b');
        });

        test("'XOR' in IF condition is NOT flagged", () => {
            const diags = runDiagnostic([
                "TestProc PROCEDURE()",
                "a LONG",
                "b LONG",
                "  CODE",
                "  IF a XOR b",
                "  END",
            ].join('\n'));
            expectNoFire(diags, 'XOR');
        });

        test("'NOT' in IF condition is NOT flagged (already in keywords.json but filter missing)", () => {
            const diags = runDiagnostic([
                "TestProc PROCEDURE()",
                "a LONG",
                "  CODE",
                "  IF NOT a",
                "  END",
            ].join('\n'));
            expectNoFire(diags, 'NOT',
                "NOT is in clarion-keywords.json today — fires anyway proves the bug is the missing KeywordService.isKeyword call, not the registry contents");
        });

        test("'BAND' in IF condition is NOT flagged (bitwise-AND operator-keyword)", () => {
            const diags = runDiagnostic([
                "TestProc PROCEDURE()",
                "a LONG",
                "b LONG",
                "  CODE",
                "  IF a BAND b",
                "  END",
            ].join('\n'));
            expectNoFire(diags, 'BAND');
        });
    });

    suite('Operator keywords in assignment RHS', () => {

        test("'TO' in assignment RHS is NOT flagged (Marks repro, RHS walker path)", () => {
            const diags = runDiagnostic([
                "TestProc PROCEDURE()",
                "a LONG",
                "b LONG",
                "  CODE",
                "  a = b TO 10",
                "  END",
            ].join('\n'));
            expectNoFire(diags, 'TO');
            expectNoFire(diags, 'a');
            expectNoFire(diags, 'b');
        });
    });

    // ─── GREEN sentinels: real undeclared identifiers MUST still fire ───────

    suite('GREEN sentinels — keyword filter must not over-mask real undeclared', () => {

        test("Bare-LHS undeclared name STILL fires (v1 preservation)", () => {
            const diags = runDiagnostic([
                "TestProc PROCEDURE()",
                "  CODE",
                "  realUndeclared = 5",
                "  RETURN",
            ].join('\n'));
            expectFires(diags, 'realUndeclared',
                "v1 LHS-of-assignment check must still fire on genuinely-undeclared names");
        });

        test("RHS undeclared name STILL fires (v2 sub-feature 1 preservation)", () => {
            const diags = runDiagnostic([
                "TestProc PROCEDURE()",
                "x LONG",
                "  CODE",
                "  x = undeclaredRhs + 1",
                "  RETURN",
            ].join('\n'));
            expectFires(diags, 'undeclaredRhs',
                "v2 RHS expression check must still fire on genuinely-undeclared names");
        });

        test("Condition undeclared name STILL fires (v2 sub-feature 2 preservation)", () => {
            const diags = runDiagnostic([
                "TestProc PROCEDURE()",
                "  CODE",
                "  IF undeclaredCond > 0",
                "  END",
                "  RETURN",
            ].join('\n'));
            expectFires(diags, 'undeclaredCond',
                "v2 condition expression check must still fire on genuinely-undeclared names");
        });
    });

    // ─── Cross-sentinel: LOOP iterator path (no current fire — regression-anchor) ───

    suite('Regression anchor — LOOP iterator (no current fire)', () => {

        test("'TO' in LOOP iterator clause does NOT fire (line never enters walker today)", () => {
            // Pinned as regression sentinel: LOOP-prefixed lines don't trigger
            // the assignment-LHS or condition walker paths, so `TO` in the
            // iterator clause is silent today. The Phase B fix must not
            // accidentally make this path light up after the keyword filter
            // lands (no behavioural change in this direction).
            const diags = runDiagnostic([
                "TestProc PROCEDURE()",
                "x LONG",
                "  CODE",
                "  LOOP x = 1 TO 10",
                "  END",
            ].join('\n'));
            expectNoFire(diags, 'TO');
            expectNoFire(diags, 'x');
        });
    });
});
