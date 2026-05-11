import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Position } from 'vscode-languageserver-protocol';
import { TokenCache } from '../TokenCache';
import { SignatureHelpProvider } from '../providers/SignatureHelpProvider';
import { FileRelationshipGraph, FileEdge } from '../FileRelationshipGraph';

/**
 * Issue #126 — SignatureHelpProvider must use partial-arg classification to
 * highlight the correct active overload as the user types.
 *
 * Deferred from #125 Phase A scope; #126 is the dedicated task. Companion to
 * #125-#128 (full-args "pick one" — those resolved Goto-Def / Hover / Goto-Impl).
 *
 * ─── Bug shape ──────────────────────────────────────────────────────────────
 *
 * `SignatureHelpProvider.selectActiveSignature:851` is paramCount-only per its
 * explicit docstring ("Selects the active signature based on parameter count").
 * For overload sets that share parameter count up to the cursor position, the
 * resolver picks by ordering rather than by arg-type classification.
 *
 * Mark's exemplar: `st.SetValue(STRING newValue, LONG pClip=0)` +
 * `st.SetValue(StringTheory newValue)` — both arity-1 at the 1st-arg cursor;
 * paramCount-only logic picks whichever sorts first (currently StringTheory),
 * but a typed `'Hello'` literal should highlight the STRING overload.
 *
 * ─── Phase B fix (Alice) ────────────────────────────────────────────────────
 *
 * 1. New `MethodOverloadResolver.findActiveOverloadByPartialArgs(partialArgs,
 *    candidates): { activeIndex, ambiguous }` — substrate composition over
 *    existing `argMatchesParam` + `scoreArgParam`. Accepts partial-arg
 *    classifications (length 0..N).
 * 2. `SignatureHelpProvider.parseMethodCall` enhancement — extract arg TEXT
 *    segments (split-on-comma-at-depth-0) in addition to the existing
 *    parameterIndex count.
 * 3. Replace `selectActiveSignature` call: classify each arg segment via
 *    `CallSiteArgumentClassifier.classifySlice` → pass to new predicate →
 *    wire `activeSignature` field.
 *
 * Cross-file substrate fold (if needed): if SignatureHelp's candidate-builder
 * uses legacy `findMethodDeclarationInIncludes` (single-level INCLUDE), fold
 * into Alice's #128 MEMBER-aware `findAllMethodDeclarationsIncludingIncludes`.
 *
 * ─── Test approach ──────────────────────────────────────────────────────────
 *
 * Disk-based fixture per `feedback_red_fixture_matches_user_repro.md` (same
 * shape as #128). FRG seeded for MEMBER + INCLUDE edges. Cursor-position
 * progression tests Mark's `st.SetValue(...)` repro at various typing states.
 *
 * Predicted RED-vs-GREEN distribution per Phase A audit:
 *   - Empty args (pin 1): GREEN-today-by-accident (parameterIndex=0 + first
 *     signature wins → 0, which is correct for the empty-args case)
 *   - Mid-first-arg STRING literal (pin 2): RED-by-design (paramCount-only
 *     picks by ordering; STRING-literal should classify-pick STRING overload)
 *   - Cross-family numeric literal (pin 3): RED-by-design
 *   - Mid-second-arg (pin 4): GREEN-today-by-accident (paramCount=2 correctly
 *     rejects the 1-param StringTheory overload via the existing arity check)
 *   - Single-overload counter (pin 5): GREEN regardless
 *
 * If reality matches prediction: 2 RED + 3 GREEN — partial-RED contract for
 * Alice's Phase B; the 3 GREEN serve as regression sentinels.
 * If all-GREEN: discipline fallback per `feedback_plan_field_freedom` —
 * commit as verification sentinels with `test:` subject + close-as-verified.
 */

const STRING_THEORY_STUB = [
    "StringTheory CLASS,TYPE",                                          // line 0
    "SetValue PROCEDURE(STRING newValue, LONG pClip=0),VIRTUAL",        // line 1 — STRING overload
    "SetValue PROCEDURE(StringTheory newValue),VIRTUAL",                // line 2 — StringTheory overload
    "        END",                                                      // line 3
].join('\n');

const SIMPLE_NEW_SLN_CLW = [
    "  PROGRAM",                                                        // line 0
    "  INCLUDE('StringTheoryStub.inc')",                                // line 1
    "  MAP",                                                            // line 2
    "  END",                                                            // line 3
    "  CODE",                                                           // line 4
    "  RETURN",                                                         // line 5
].join('\n');

/**
 * Caller fixture template — single line containing the call. Cursor position
 * within the call drives the test pin. Line 6 is the call line.
 */
function makeCaller(callExpression: string): string {
    return [
        "  MEMBER('SimpleNewSln.clw')",          // line 0
        "",                                      // line 1
        "TestProc PROCEDURE()",                  // line 2
        "st &StringTheory",                      // line 3
        "  CODE",                                // line 4
        "  st &= NEW(StringTheory)",             // line 5
        `  ${callExpression}`,                   // line 6 — CALL SITE (cursor here)
        "  RETURN",                              // line 7
    ].join('\n');
}

interface ScopeFixture {
    tmpDir: string;
    files: Record<string, string>;
    callerUri: string;
    callerDoc: TextDocument;
}

function setupFixture(callerContent: string, edges: FileEdge[]): ScopeFixture {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'eve-126-'));
    const files: Record<string, string> = {};
    const stubPath = path.join(tmpDir, 'StringTheoryStub.inc');
    const programPath = path.join(tmpDir, 'SimpleNewSln.clw');
    const callerPath = path.join(tmpDir, 'Caller.clw');
    fs.writeFileSync(stubPath, STRING_THEORY_STUB, 'utf8');
    fs.writeFileSync(programPath, SIMPLE_NEW_SLN_CLW, 'utf8');
    fs.writeFileSync(callerPath, callerContent, 'utf8');
    files['StringTheoryStub.inc'] = stubPath;
    files['SimpleNewSln.clw'] = programPath;
    files['Caller.clw'] = callerPath;
    const callerUri = 'file:///' + callerPath.replace(/\\/g, '/');
    const callerDoc = TextDocument.create(callerUri, 'clarion', 1, callerContent);
    TokenCache.getInstance().getTokens(callerDoc);

    const resolvedEdges: FileEdge[] = edges.map(e => ({
        ...e,
        fromFile: path.join(tmpDir, e.fromFile),
        toFile: path.join(tmpDir, e.toFile),
    }));
    FileRelationshipGraph.getInstance().seedEdgesForTest(resolvedEdges);

    return { tmpDir, files, callerUri, callerDoc };
}

function teardownFixture(fx: ScopeFixture): void {
    TokenCache.getInstance().clearTokens(fx.callerUri);
    FileRelationshipGraph.getInstance().reset();
    for (const p of Object.values(fx.files)) {
        try { fs.unlinkSync(p); } catch { /* ignore */ }
    }
    try { fs.rmdirSync(fx.tmpDir); } catch { /* ignore */ }
}

const FIXTURE_EDGES: FileEdge[] = [
    { type: 'MEMBER',  fromFile: 'Caller.clw',          toFile: 'SimpleNewSln.clw',    fromLine: 0 },
    { type: 'INCLUDE', fromFile: 'SimpleNewSln.clw',    toFile: 'StringTheoryStub.inc', fromLine: 1 },
];

suite("SignatureHelpProvider — partial-arg classification (#126 Phase A)", () => {

    let fx: ScopeFixture;

    teardown(() => {
        if (fx) teardownFixture(fx);
    });

    // ─── Pin 1: Empty args (cursor right after `(`) — likely GREEN today ────

    test("Empty args — cursor right after `(` — activeSignature is well-defined (=0)", async () => {
        // st.SetValue(  — cursor at char 16 (right after `(`)
        const callerContent = makeCaller("st.SetValue(");
        fx = setupFixture(callerContent, FIXTURE_EDGES);
        const provider = new SignatureHelpProvider();
        const result = await provider.provideSignatureHelp(fx.callerDoc, { line: 6, character: 14 });

        assert.ok(result, 'signature help must return a result for valid call shape');
        assert.ok(result.signatures.length >= 2, `must enumerate both overloads; got ${result.signatures.length}`);
        // With empty args, ambiguous — fallback to 0. Either overload could be highlighted;
        // the substantive assertion is that the activeSignature value is in valid range.
        assert.ok(result.activeSignature !== null && result.activeSignature !== undefined,
            'activeSignature must be set (non-null) for empty-args case');
        assert.ok((result.activeSignature as number) >= 0 && (result.activeSignature as number) < result.signatures.length,
            `activeSignature ${result.activeSignature} out of valid range [0..${result.signatures.length - 1}]`);
    });

    // ─── Pin 2: Mid-first-arg STRING literal — RED by design ────────────────

    test("Mid-first-arg STRING literal — `st.SetValue('Hello'|` — activeSignature = STRING overload (index 0)", async () => {
        // st.SetValue('Hello'  — cursor right after the closing quote of 'Hello'
        const callerContent = makeCaller("st.SetValue('Hello'");
        fx = setupFixture(callerContent, FIXTURE_EDGES);
        const provider = new SignatureHelpProvider();
        // Position right after 'Hello' — char 21 (after the second quote)
        const result = await provider.provideSignatureHelp(fx.callerDoc, { line: 6, character: 21 });

        assert.ok(result, 'signature help must return a result');
        assert.ok(result.signatures.length >= 2, `must enumerate both overloads; got ${result.signatures.length}`);
        // Find which signature index corresponds to the STRING+LONG overload
        const stringSigIdx = result.signatures.findIndex(s =>
            typeof s.label === 'string' && /STRING\b/.test(s.label) && /LONG\s+pClip|pClip\s*=/.test(s.label));
        assert.ok(stringSigIdx >= 0,
            `STRING+default overload must appear in signatures list; got: ${result.signatures.map(s => s.label).join(' | ')}`);
        assert.strictEqual(result.activeSignature, stringSigIdx,
            `activeSignature must = STRING+default overload index (${stringSigIdx}); got ${result.activeSignature}. ` +
            `Pre-fix: paramCount-only selectActiveSignature picks first arity-compatible signature. ` +
            `Post-fix: findActiveOverloadByPartialArgs classifies the 'Hello' literal as literal_string → picks STRING overload.`);
    });

    // ─── Pin 3: Cross-family numeric literal — RED by design ────────────────

    test("Cross-family numeric literal — `st.SetValue(42|` — activeSignature still picks STRING overload via implicit conversion", async () => {
        // st.SetValue(42  — numeric literal; cross-family conversion to STRING param is legal Clarion
        const callerContent = makeCaller("st.SetValue(42");
        fx = setupFixture(callerContent, FIXTURE_EDGES);
        const provider = new SignatureHelpProvider();
        const result = await provider.provideSignatureHelp(fx.callerDoc, { line: 6, character: 16 });

        assert.ok(result, 'signature help must return a result');
        const stringSigIdx = result.signatures.findIndex(s =>
            typeof s.label === 'string' && /STRING\b/.test(s.label) && /LONG\s+pClip|pClip\s*=/.test(s.label));
        assert.ok(stringSigIdx >= 0, 'STRING+default overload must be enumerated');
        assert.strictEqual(result.activeSignature, stringSigIdx,
            `cross-family literal: numeric '42' against STRING param via implicit conversion → STRING overload (${stringSigIdx}). ` +
            `StringTheory overload at the other index is class-typed; literal_numeric arg cannot match it.`);
    });

    // ─── Pin 4: Mid-second-arg — likely GREEN today via arity check ─────────

    test("Mid-second-arg — `st.SetValue('Hello',|` — activeSignature = STRING+default (only 2-param overload)", async () => {
        // st.SetValue('Hello',  — entering 2nd arg; only STRING+default has 2 slots
        const callerContent = makeCaller("st.SetValue('Hello',");
        fx = setupFixture(callerContent, FIXTURE_EDGES);
        const provider = new SignatureHelpProvider();
        const result = await provider.provideSignatureHelp(fx.callerDoc, { line: 6, character: 22 });

        assert.ok(result, 'signature help must return a result');
        const stringSigIdx = result.signatures.findIndex(s =>
            typeof s.label === 'string' && /STRING\b/.test(s.label) && /LONG\s+pClip|pClip\s*=/.test(s.label));
        assert.ok(stringSigIdx >= 0);
        assert.strictEqual(result.activeSignature, stringSigIdx,
            `mid-second-arg: parameterIndex=1; only STRING+default overload has 2 slots; arity filter picks it`);
        // Active parameter should be 1 (the LONG pClip param)
        assert.strictEqual(result.activeParameter, 1,
            `cursor is at 2nd arg position; activeParameter should be 1 (zero-indexed)`);
    });

    // ─── Pin 5: Single-overload counter-example — GREEN regardless ─────────

    test("Counter-example — single-overload candidate set — activeSignature = 0 always", async () => {
        const SINGLE_OVERLOAD_STUB = [
            "StringTheory CLASS,TYPE",
            "SetValue PROCEDURE(STRING newValue),VIRTUAL",   // line 1 — only ONE overload
            "        END",
        ].join('\n');

        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'eve-126-single-'));
        const stubPath = path.join(tmpDir, 'StringTheoryStub.inc');
        const programPath = path.join(tmpDir, 'SimpleNewSln.clw');
        const callerPath = path.join(tmpDir, 'Caller.clw');
        fs.writeFileSync(stubPath, SINGLE_OVERLOAD_STUB, 'utf8');
        fs.writeFileSync(programPath, SIMPLE_NEW_SLN_CLW, 'utf8');
        const callerContent = makeCaller("st.SetValue('Hello'");
        fs.writeFileSync(callerPath, callerContent, 'utf8');
        const callerUri = 'file:///' + callerPath.replace(/\\/g, '/');
        const callerDoc = TextDocument.create(callerUri, 'clarion', 1, callerContent);
        TokenCache.getInstance().getTokens(callerDoc);
        FileRelationshipGraph.getInstance().seedEdgesForTest([
            { type: 'MEMBER',  fromFile: callerPath,   toFile: programPath, fromLine: 0 },
            { type: 'INCLUDE', fromFile: programPath,  toFile: stubPath,    fromLine: 1 },
        ]);
        fx = { tmpDir, files: { stub: stubPath, prog: programPath, caller: callerPath }, callerUri, callerDoc };

        const provider = new SignatureHelpProvider();
        const result = await provider.provideSignatureHelp(fx.callerDoc, { line: 6, character: 21 });

        assert.ok(result, 'signature help must return a result');
        assert.strictEqual(result.signatures.length, 1, 'single overload — exactly one signature enumerated');
        assert.strictEqual(result.activeSignature, 0, 'activeSignature must = 0 for single-overload case');
    });

    // ─── Pin 6: Ordering-agnostic activeSignature (#126 B2 RED pin) ─────────
    //
    // Bob's PM directive 2026-05-11 — Fold A's GREEN on the 5 original tests
    // passes via candidate-ordering luck (STRING overload at file index 0 +
    // selectActiveSignature defaulting to 0). Flip the stub so StringTheory
    // is declared FIRST and STRING+pClip SECOND; pin activeSignature === 1
    // (the STRING decl's new file index), bidirectional-pinned with !== 0.
    //
    // RED today (Fold A only): selectActiveSignature defaults to 0 (=
    // StringTheory in this ordering), so activeSignature === 0 ≠ 1.
    // GREEN after Fold B: findActiveOverloadByPartialArgs classifies the
    // 'Hello' literal as literal_string → picks the STRING decl regardless
    // of file ordering.

    test("Ordering-agnostic: stub with StringTheory FIRST + STRING SECOND — activeSignature must still pick STRING via partial-arg classification (#126 B2)", async () => {
        const STUB_ORDERING_FLIPPED = [
            "StringTheory CLASS,TYPE",                                          // line 0
            "SetValue PROCEDURE(StringTheory newValue),VIRTUAL",                // line 1 — StringTheory overload (FIRST now)
            "SetValue PROCEDURE(STRING newValue, LONG pClip=0),VIRTUAL",        // line 2 — STRING overload (SECOND now)
            "        END",                                                      // line 3
        ].join('\n');

        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'eve-126-b2-'));
        const stubPath = path.join(tmpDir, 'StringTheoryStub.inc');
        const programPath = path.join(tmpDir, 'SimpleNewSln.clw');
        const callerPath = path.join(tmpDir, 'Caller.clw');
        fs.writeFileSync(stubPath, STUB_ORDERING_FLIPPED, 'utf8');
        fs.writeFileSync(programPath, SIMPLE_NEW_SLN_CLW, 'utf8');
        const callerContent = makeCaller("st.SetValue('Hello'");
        fs.writeFileSync(callerPath, callerContent, 'utf8');
        const callerUri = 'file:///' + callerPath.replace(/\\/g, '/');
        const callerDoc = TextDocument.create(callerUri, 'clarion', 1, callerContent);
        TokenCache.getInstance().getTokens(callerDoc);
        FileRelationshipGraph.getInstance().seedEdgesForTest([
            { type: 'MEMBER',  fromFile: callerPath,   toFile: programPath, fromLine: 0 },
            { type: 'INCLUDE', fromFile: programPath,  toFile: stubPath,    fromLine: 1 },
        ]);
        fx = { tmpDir, files: { stub: stubPath, prog: programPath, caller: callerPath }, callerUri, callerDoc };

        const provider = new SignatureHelpProvider();
        // Cursor at char 21 (right after 'Hello' closing quote) mid-first-arg
        const result = await provider.provideSignatureHelp(fx.callerDoc, { line: 6, character: 21 });

        assert.ok(result, 'signature help must return a result');
        assert.ok(result.signatures.length >= 2, `must enumerate both overloads; got ${result.signatures.length}`);

        const stringSigIdx = result.signatures.findIndex(s =>
            typeof s.label === 'string' && /STRING\b/.test(s.label) && /LONG\s+pClip|pClip\s*=/.test(s.label));
        assert.ok(stringSigIdx >= 0,
            `STRING+default overload must appear in signatures list; got: ${result.signatures.map(s => s.label).join(' | ')}`);
        // With the flipped stub, stringSigIdx should be 1 (StringTheory at 0).
        assert.notStrictEqual(result.activeSignature, 0,
            `activeSignature must NOT default to 0 (StringTheory overload) just because it's first — partial-arg classification must override ordering`);
        assert.strictEqual(result.activeSignature, stringSigIdx,
            `activeSignature must = STRING+default overload index (${stringSigIdx}) regardless of file ordering; got ${result.activeSignature}. ` +
            `Fold A only path defaults to file-index 0 (StringTheory); Fold B's findActiveOverloadByPartialArgs classifies 'Hello' → literal_string → picks STRING overload independent of ordering.`);
    });
});
