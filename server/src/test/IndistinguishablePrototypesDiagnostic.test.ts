import * as assert from 'assert';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Diagnostic, DiagnosticSeverity } from 'vscode-languageserver/node';
import { DiagnosticProvider } from '../providers/DiagnosticProvider';
import { serverSettings } from '../serverSettings';

/**
 * Integration suite for the indistinguishable-prototype diagnostic walker
 * (#121 Phase A.2b RED-pin contract). Drives Phase B' (Alice) implementation
 * of `validateIndistinguishablePrototypes(tokens, document): Diagnostic[]` in
 * `server/src/providers/diagnostics/IndistinguishablePrototypeDiagnostics.ts`
 * registered in `DiagnosticProvider.validateDocument`'s sync accumulation.
 *
 * ─── Tier-1 LOCKED rules (canonical Clarion docs `rules_for_procedure_overloading.htm`) ───
 *
 * Rule 1 — default-overlap zero-arity collision
 *   Doc citation: example shows `Func PROCEDURE(SHORT=10)` (#9) +
 *   `Func PROCEDURE()` flagged as "Illegal, indistinguishable from 9".
 *   Helper: `MethodOverloadResolver.areZeroArityCompatible(sigA, sigB)`
 *
 * Rule 2 — prototype structural identity
 *   Doc citation: example shows `Func PROCEDURE(Func1)` (#12) +
 *   `Func PROCEDURE(Func1a)` flagged as "Illegal, same as 12" (Func1 and
 *   Func1a both `PROCEDURE(*SHORT)` → identical prototypes).
 *   Helper: `MethodOverloadResolver.arePrototypesIdentical(sigA, sigB)`
 *
 * Rule 3 — `*COMPLEX` ≡ `COMPLEX` duplicate (project rule 6)
 *   Doc citation: `prototype_parameter_lists.htm` value-parameters valid types
 *   excludes CLASS/INTERFACE/GROUP/QUEUE — complex types pass by reference
 *   implicitly. `Func(MyClass)` and `Func(*MyClass)` declare the same prototype.
 *   Helper: extended `MethodOverloadResolver.signaturesMatch` (post `30dedfc`).
 *
 * ─── Tier-2 DEFERRED ───
 *
 * Same-family scalar pair detection (e.g. `Func(LONG)` + `Func(REAL)`) and
 * cross-family scalar pair detection (e.g. `Func(LONG)` + `Func(STRING)`) are
 * NOT pinned here. Canonical docs explicitly show these as legal coexisting
 * overloads (Func9 SHORT=10 + Func10 LONG in the same `rules_for_procedure_overloading.htm`
 * example; rule 6 "All Value-parameters are considered to have the same type"
 * is a call-site disambiguation tie-breaker, NOT a decl-time illegality rule).
 * Mark's rule-3 framing (`project_clarion_overload_resolution_rule.md` 2026-05-11
 * clarification) contradicts the canonical docs — escalation in flight; will
 * land as a separate task IF Mark confirms empirical compiler-error observation.
 * Do NOT add same-family/cross-family scalar pair pins here without Mark's verdict.
 *
 * ─── OPEN SUBSTRATE QUESTION (Phase B' will verify) ───
 *
 * The procedure-local MAP fixtures below assume the walker's traversal surfaces
 * MAPs nested inside a procedure's local-data section (per #91 / #95 scope
 * isolation work). `DocumentStructure.getMapBlocks()` returns ALL MAP tokens
 * from `structuresByType.get('MAP')` — empirically may or may not include
 * nested MAPs depending on tokenizer behaviour. If Phase B' wires the walker
 * and the procedure-local MAP pins stay RED:
 *   (a) Traversal extension is small → Alice adds it inline in Phase B'
 *   (b) Needs new DocumentStructure API surface → escalate to Bob; either
 *       extend Alice's scope or trim procedure-local MAP from Tier-1.
 * Per `feedback_plan_field_freedom`: pin the contract; if it's wrong, the
 * empirical probe surfaces it.
 *
 * ─── Diagnostic shape (asserted on every positive pin) ───
 *
 *   severity = DiagnosticSeverity.Warning
 *   source   = 'clarion'
 *   message  = exact text per rule:
 *     - Rule 1: 'Indistinguishable prototype: both declarations are callable with zero arguments.'
 *     - Rule 2: 'Duplicate prototype: identical parameter shape as a previous declaration.'
 *     - Rule 3: 'Duplicate prototype: `*` is implicit for complex types.'
 *   range.start.line = the SECOND decl's line (the one to remove)
 *
 * ─── Counter-examples (each asserts ZERO diagnostics from this walker) ───
 *
 * Legal overload patterns that must NOT fire:
 *   - Arity discriminator: `Func(STRING)` + `Func(STRING, LONG=default)`
 *   - Reference discriminator (scalars): `Func(LONG)` + `Func(*LONG)`
 *   - Class-vs-scalar: `Func(STRING)` + `Func(MyClass)`
 *   - Different class names: `Func(ClassA)` + `Func(ClassB)`
 *   - Same name in different scopes (CLASS method vs MAP procedure with same name)
 */

const MESSAGES = {
    rule1: 'Indistinguishable prototype: both declarations are callable with zero arguments.',
    rule2: 'Duplicate prototype: identical parameter shape as a previous declaration.',
    rule3: 'Duplicate prototype: `*` is implicit for complex types.',
};

function createDocument(code: string): TextDocument {
    return TextDocument.create('file:///test.clw', 'clarion', 1, code);
}

/** Filter diagnostics to only those produced by THIS walker (by message-shape). */
function walkerDiagnostics(all: Diagnostic[]): Diagnostic[] {
    const ours = new Set(Object.values(MESSAGES));
    return all.filter(d => typeof d.message === 'string' && ours.has(d.message));
}

function assertDiagnosticShape(d: Diagnostic, expected: { message: string; line: number }): void {
    assert.strictEqual(d.severity, DiagnosticSeverity.Warning, 'severity is Warning');
    assert.strictEqual(d.source, 'clarion', 'source is "clarion"');
    assert.strictEqual(d.message, expected.message, 'exact message text match');
    assert.strictEqual(d.range.start.line, expected.line,
        `diagnostic range positioned at the SECOND decl line (${expected.line}) — the one to remove`);
}

suite('Indistinguishable Prototype Diagnostic Walker — Integration (#121 Phase A.2b)', () => {

    let savedSettingsEnabled: unknown;

    setup(() => {
        // Save existing setting (may be undefined if pre-implementation).
        savedSettingsEnabled = (serverSettings as Record<string, unknown>).indistinguishablePrototypesEnabled;
        (serverSettings as Record<string, unknown>).indistinguishablePrototypesEnabled = true;
    });

    teardown(() => {
        (serverSettings as Record<string, unknown>).indistinguishablePrototypesEnabled = savedSettingsEnabled;
    });

    // ─── CLASS body method overloads ────────────────────────────────────────

    suite('Scope: CLASS body', () => {

        test('Rule 1 — CLASS Foo() + Foo(LONG=10) fires on second decl', () => {
            const code = [
                "MyClass CLASS,TYPE",
                "Foo PROCEDURE",
                "Foo PROCEDURE(LONG=10)",
                "        END",
            ].join('\n');
            const diags = walkerDiagnostics(DiagnosticProvider.validateDocument(createDocument(code)));
            assert.strictEqual(diags.length, 1, 'exactly one walker diagnostic');
            assertDiagnosticShape(diags[0], { message: MESSAGES.rule1, line: 2 });
        });

        test('Rule 2 — CLASS Foo(*LONG) + Foo(*LONG) fires on second decl', () => {
            const code = [
                "MyClass CLASS,TYPE",
                "Foo PROCEDURE(*LONG a)",
                "Foo PROCEDURE(*LONG b)",
                "        END",
            ].join('\n');
            const diags = walkerDiagnostics(DiagnosticProvider.validateDocument(createDocument(code)));
            assert.strictEqual(diags.length, 1);
            assertDiagnosticShape(diags[0], { message: MESSAGES.rule2, line: 2 });
        });

        test('Rule 3 — CLASS Foo(MyType) + Foo(*MyType) fires on second decl (complex-type * implicit)', () => {
            const code = [
                "MyType CLASS,TYPE",
                "        END",
                "MyClass CLASS,TYPE",
                "Foo PROCEDURE(MyType pT)",
                "Foo PROCEDURE(*MyType pT)",
                "        END",
            ].join('\n');
            const diags = walkerDiagnostics(DiagnosticProvider.validateDocument(createDocument(code)));
            assert.strictEqual(diags.length, 1);
            assertDiagnosticShape(diags[0], { message: MESSAGES.rule3, line: 4 });
        });

        test('Counter-example — CLASS Foo(STRING) + Foo(STRING, LONG=default) does NOT fire (arity discriminator)', () => {
            const code = [
                "MyClass CLASS,TYPE",
                "Foo PROCEDURE(STRING s)",
                "Foo PROCEDURE(STRING s, LONG n=0)",
                "        END",
            ].join('\n');
            const diags = walkerDiagnostics(DiagnosticProvider.validateDocument(createDocument(code)));
            assert.strictEqual(diags.length, 0,
                'legal overload: arity-with-defaults distinguishes the two prototypes');
        });
    });

    // ─── INTERFACE method overloads ─────────────────────────────────────────

    suite('Scope: INTERFACE body', () => {

        test('Rule 1 — INTERFACE Foo() + Foo(LONG=10) fires on second decl', () => {
            const code = [
                "MyIface INTERFACE",
                "Foo PROCEDURE",
                "Foo PROCEDURE(LONG=10)",
                "        END",
            ].join('\n');
            const diags = walkerDiagnostics(DiagnosticProvider.validateDocument(createDocument(code)));
            assert.strictEqual(diags.length, 1);
            assertDiagnosticShape(diags[0], { message: MESSAGES.rule1, line: 2 });
        });

        test('Rule 2 — INTERFACE Foo(*LONG) + Foo(*LONG) fires on second decl', () => {
            const code = [
                "MyIface INTERFACE",
                "Foo PROCEDURE(*LONG a)",
                "Foo PROCEDURE(*LONG b)",
                "        END",
            ].join('\n');
            const diags = walkerDiagnostics(DiagnosticProvider.validateDocument(createDocument(code)));
            assert.strictEqual(diags.length, 1);
            assertDiagnosticShape(diags[0], { message: MESSAGES.rule2, line: 2 });
        });

        test('Rule 3 — INTERFACE Foo(MyType) + Foo(*MyType) fires on second decl', () => {
            const code = [
                "MyType CLASS,TYPE",
                "        END",
                "MyIface INTERFACE",
                "Foo PROCEDURE(MyType pT)",
                "Foo PROCEDURE(*MyType pT)",
                "        END",
            ].join('\n');
            const diags = walkerDiagnostics(DiagnosticProvider.validateDocument(createDocument(code)));
            assert.strictEqual(diags.length, 1);
            assertDiagnosticShape(diags[0], { message: MESSAGES.rule3, line: 4 });
        });
    });

    // ─── Module-level MAP procedure overloads ───────────────────────────────

    suite('Scope: Module-level MAP', () => {

        test('Rule 1 — MAP Foo() + Foo(LONG=10) fires on second decl', () => {
            const code = [
                "  MAP",
                "Foo PROCEDURE",
                "Foo PROCEDURE(LONG=10)",
                "  END",
            ].join('\n');
            const diags = walkerDiagnostics(DiagnosticProvider.validateDocument(createDocument(code)));
            assert.strictEqual(diags.length, 1);
            assertDiagnosticShape(diags[0], { message: MESSAGES.rule1, line: 2 });
        });

        test('Rule 2 — MAP Foo(*LONG) + Foo(*LONG) fires on second decl', () => {
            const code = [
                "  MAP",
                "Foo PROCEDURE(*LONG a)",
                "Foo PROCEDURE(*LONG b)",
                "  END",
            ].join('\n');
            const diags = walkerDiagnostics(DiagnosticProvider.validateDocument(createDocument(code)));
            assert.strictEqual(diags.length, 1);
            assertDiagnosticShape(diags[0], { message: MESSAGES.rule2, line: 2 });
        });

        test('Rule 3 — MAP Foo(MyType) + Foo(*MyType) fires on second decl', () => {
            const code = [
                "MyType CLASS,TYPE",
                "        END",
                "  MAP",
                "Foo PROCEDURE(MyType pT)",
                "Foo PROCEDURE(*MyType pT)",
                "  END",
            ].join('\n');
            const diags = walkerDiagnostics(DiagnosticProvider.validateDocument(createDocument(code)));
            assert.strictEqual(diags.length, 1);
            assertDiagnosticShape(diags[0], { message: MESSAGES.rule3, line: 4 });
        });
    });

    // ─── Procedure-local MAP overloads (OPEN substrate question — see top of file) ───

    suite('Scope: Procedure-local MAP (substrate-question fixtures)', () => {

        test('Rule 1 — procedure-local MAP Foo() + Foo(LONG=10) fires on second decl', () => {
            // SUBSTRATE NOTE: this fixture pins that the walker traverses
            // MAPs nested inside a procedure's local-data section (per #91/#95).
            // If `DocumentStructure.getMapBlocks()` does NOT surface nested MAPs,
            // this test stays RED until Phase B' extends the traversal — that
            // is the intended substrate-symmetry probe, not a test-author error.
            const code = [
                "TestProc PROCEDURE()",
                "LocalMap MAP",
                "Foo PROCEDURE",
                "Foo PROCEDURE(LONG=10)",
                "     END",
                "  CODE",
                "  RETURN",
            ].join('\n');
            const diags = walkerDiagnostics(DiagnosticProvider.validateDocument(createDocument(code)));
            assert.strictEqual(diags.length, 1,
                'walker must traverse procedure-local MAPs (substrate question if RED post-fix)');
            assertDiagnosticShape(diags[0], { message: MESSAGES.rule1, line: 3 });
        });

        test('Rule 2 — procedure-local MAP Foo(*LONG) + Foo(*LONG) fires on second decl', () => {
            const code = [
                "TestProc PROCEDURE()",
                "LocalMap MAP",
                "Foo PROCEDURE(*LONG a)",
                "Foo PROCEDURE(*LONG b)",
                "     END",
                "  CODE",
                "  RETURN",
            ].join('\n');
            const diags = walkerDiagnostics(DiagnosticProvider.validateDocument(createDocument(code)));
            assert.strictEqual(diags.length, 1);
            assertDiagnosticShape(diags[0], { message: MESSAGES.rule2, line: 3 });
        });
    });

    // ─── Cross-scope counter-examples ───────────────────────────────────────

    suite('Counter-examples — legal overloads must NOT fire', () => {

        test('Reference discriminator (scalars): MAP Foo(LONG) + Foo(*LONG) does NOT fire', () => {
            const code = [
                "  MAP",
                "Foo PROCEDURE(LONG n)",
                "Foo PROCEDURE(*LONG n)",
                "  END",
            ].join('\n');
            const diags = walkerDiagnostics(DiagnosticProvider.validateDocument(createDocument(code)));
            assert.strictEqual(diags.length, 0,
                'legal overload: by-ref discriminator for SCALAR types preserved (Mark-discriminator from 35019583/fe254d6f)');
        });

        test('Class-vs-scalar: MAP Foo(STRING) + Foo(MyClass) does NOT fire', () => {
            const code = [
                "MyClass CLASS,TYPE",
                "        END",
                "  MAP",
                "Foo PROCEDURE(STRING s)",
                "Foo PROCEDURE(MyClass m)",
                "  END",
            ].join('\n');
            const diags = walkerDiagnostics(DiagnosticProvider.validateDocument(createDocument(code)));
            assert.strictEqual(diags.length, 0,
                'legal overload: class-vs-scalar is the canonical Mark/SetValue distinguisher');
        });

        test('Different class names: MAP Foo(ClassA) + Foo(ClassB) does NOT fire', () => {
            const code = [
                "ClassA CLASS,TYPE",
                "        END",
                "ClassB CLASS,TYPE",
                "        END",
                "  MAP",
                "Foo PROCEDURE(ClassA a)",
                "Foo PROCEDURE(ClassB b)",
                "  END",
            ].join('\n');
            const diags = walkerDiagnostics(DiagnosticProvider.validateDocument(createDocument(code)));
            assert.strictEqual(diags.length, 0,
                'legal overload: rule 2 says CLASSes match by name — different names distinguishable');
        });

        test('Different scopes: same name in CLASS body + MAP does NOT fire (scopes do not cross)', () => {
            const code = [
                "MyClass CLASS,TYPE",
                "Foo PROCEDURE",
                "        END",
                "  MAP",
                "Foo PROCEDURE",
                "  END",
            ].join('\n');
            const diags = walkerDiagnostics(DiagnosticProvider.validateDocument(createDocument(code)));
            assert.strictEqual(diags.length, 0,
                'walker groups decls per scope container; same name in different scopes is not a collision');
        });
    });

    // ─── Settings gate sentinel ─────────────────────────────────────────────

    suite('Settings gate', () => {

        test('Setting disabled → walker emits zero diagnostics even on positive fixture', () => {
            (serverSettings as Record<string, unknown>).indistinguishablePrototypesEnabled = false;
            const code = [
                "MyClass CLASS,TYPE",
                "Foo PROCEDURE",
                "Foo PROCEDURE(LONG=10)",
                "        END",
            ].join('\n');
            const diags = walkerDiagnostics(DiagnosticProvider.validateDocument(createDocument(code)));
            assert.strictEqual(diags.length, 0,
                'gate off → walker silent; matches `feedback_silent_regression_pushback` opt-out path for users with noisy legacy codebases');
        });
    });
});
