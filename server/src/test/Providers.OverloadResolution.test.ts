import * as assert from 'assert';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Position, Location, CompletionItem } from 'vscode-languageserver-protocol';
import { TokenCache } from '../TokenCache';
import { DefinitionProvider } from '../providers/DefinitionProvider';
import { ImplementationProvider } from '../providers/ImplementationProvider';

/**
 * Issue #125 — Goto Definition / Hover / Implementation / Completion
 * mis-resolve overloads (Mark reported 2026-05-11 post-#120-shipping).
 *
 * Phase A.2 RED-pin contract per Bob's locked scope (`076776ce`):
 *   1. DefinitionProvider:366  — `findMethodDeclaration` → `selectBestOverload` (paramCount-only)
 *   2. MethodHoverResolver:114 — same call shape
 *   3. ImplementationProvider:323 call→impl path-1 (typed-var dot access)
 *   4. WordCompletionProvider — augment detail field with all overload signatures
 *
 * SignatureHelpProvider deferred per Mark's 2026-05-11 verdict → filed as #126.
 *
 * Pattern A audit (`feedback_substrate_symmetry_check`): `ClassMemberResolver`
 * is a 15-consumer substrate hub — UNCHANGED. Phase B layers
 * `CallSiteArgumentClassifier` → `findOverloadByArgClassifications` on top of
 * each affected provider; the substrate keeps paramCount-only matching for
 * consumers that don't need arg-aware disambiguation.
 *
 * ─── File-layout note ───────────────────────────────────────────────────────
 *
 * Bob's earlier sign-off approved per-provider test files. This single-file
 * shape consolidates 4 small per-provider suites under one Mark-repro fixture
 * shared between them (Def/Hover/Impl all need the same `st.SetValue` source
 * file; duplicating it 4× would add ~120 LOC of churn). Each suite is
 * independently auditable — split per-file if review surface grows. Flagged
 * in handover [cm] for Bob's call.
 *
 * ─── Fix shape per provider (Alice's Phase B) ───────────────────────────────
 *
 * Def / Hover / Impl — "pick one":
 *   1. Build args via CallSiteArgumentClassifier.classifyArguments
 *   2. Pass to MethodOverloadResolver.findOverloadByArgClassifications(args, candidates)
 *   3. Translate matchedIndex back to provider return shape (Location / Hover / Location)
 *   4. matchedAll=true → fall back to existing paramCount path (preserves UX)
 *
 * Completion — "present all":
 *   1. Keep existing first-found-wins enumeration
 *   2. Augment CompletionItem.detail with all overload signatures
 *      (Mark's primary ask — no args typed at completion time, so no
 *      arg-classification needed)
 *
 * ─── Substrate options (a/b/c) per ImplementationProvider verification ──────
 *
 * (a) Add argClassifications param to MemberLocatorService.resolveDotAccess
 *     and ClassMemberResolver.findClassMemberInfo — backward-compat tax
 * (b) New parallel methods *ByArgClassifications — clean separation
 * (c) Providers do arg classification + filtering themselves above the
 *     substrate — matches Pattern A "diagnostic + resolvers parallel-consumer"
 *     framing; my recommendation
 *
 * Alice's call in Phase B.
 *
 * ─── Test diagnostic shape ──────────────────────────────────────────────────
 *
 * Bidirectional pin per `feedback_bidirectional_pin_assertion`:
 *   - Mark's SetValue repro: assert RIGHT overload's line selected AND
 *     WRONG overload's line NOT selected
 *   - Counter-example: legal single-overload calls still resolve
 */

/**
 * Mark's reproducer fixture: StringTheory class with two SetValue overloads
 * + a TestProc with `st &StringTheory` and `st.SetValue('Hello World')`.
 *
 * Expected behaviour (POST-FIX):
 *   - Call site `st.SetValue('Hello World')` → STRING literal arg
 *   - Should resolve to SetValue(STRING newValue, LONG pClip=0)  [line 1]
 *   - NOT to SetValue(StringTheory newValue)                     [line 2]
 *
 * Pre-fix: paramCount-only disambiguation; both decls match 1-arg call
 * (the STRING+default decl has range [1,2] via countDefaultParams; the
 * StringTheory decl has range [1,1]). Without arg-classification, the
 * resolver picks whichever sorts first — currently the StringTheory variant
 * per Mark's empirical report.
 */
const MARK_REPRO_FIXTURE = [
    "StringTheory CLASS,TYPE",                              // line 0
    "SetValue PROCEDURE(STRING newValue, LONG pClip=0),VIRTUAL",  // line 1 — STRING overload (Mark's expected target)
    "SetValue PROCEDURE(StringTheory newValue),VIRTUAL",          // line 2 — StringTheory overload (wrongly picked today)
    "        END",                                          // line 3
    "",                                                     // line 4
    "TestProc PROCEDURE()",                                 // line 5
    "st &StringTheory",                                     // line 6
    "  CODE",                                               // line 7
    "  st &= NEW(StringTheory)",                            // line 8
    "  st.SetValue('Hello World')",                         // line 9 — CALL SITE (cursor goes here)
    "  RETURN",                                             // line 10
].join('\n');

const TEST_URI = 'file:///MarkRepro.clw';

function createDoc(code: string, uri = TEST_URI): TextDocument {
    return TextDocument.create(uri, 'clarion', 1, code);
}

function getLocationLine(result: Location | Location[] | null | undefined): number {
    if (!result) return -1;
    if (Array.isArray(result)) return result.length > 0 ? result[0].range.start.line : -1;
    return result.range.start.line;
}

/** Cursor position on the `SetValue` method-name token at the call site (line 9). */
const SETVALUE_CALL_POS: Position = { line: 9, character: 6 };

// ─── (1) DefinitionProvider — Goto Definition ───────────────────────────────

suite('DefinitionProvider — overload resolution wire-up (#125 Phase A)', () => {

    const tokenCache = TokenCache.getInstance();

    teardown(() => {
        tokenCache.clearTokens(TEST_URI);
    });

    test("Mark's repro: st.SetValue('Hello World') resolves to STRING overload at line 1, NOT StringTheory at line 2", async () => {
        const provider = new DefinitionProvider();
        const doc = createDoc(MARK_REPRO_FIXTURE);
        const result = await provider.provideDefinition(doc, SETVALUE_CALL_POS);

        assert.ok(result, "definition must resolve to a Location (provider must not fail-silent)");
        const line = getLocationLine(result);
        assert.strictEqual(line, 1,
            `Goto Definition must target STRING overload at line 1; got line ${line}. ` +
            `Pre-fix: paramCount-only disambiguation routes through selectBestOverload + picks the wrong decl. ` +
            `Post-fix: CallSiteArgumentClassifier sees literal_string arg → findOverloadByArgClassifications picks the STRING overload.`);
        assert.notStrictEqual(line, 2,
            'StringTheory overload at line 2 must NOT be selected for a STRING-literal call');
    });
});

// ─── (2) MethodHoverResolver — Hover ─────────────────────────────────────────

suite('MethodHoverResolver — overload resolution wire-up (#125 Phase A)', () => {

    const tokenCache = TokenCache.getInstance();

    teardown(() => {
        tokenCache.clearTokens(TEST_URI);
    });

    test("Mark's repro: hover on st.SetValue('Hello World') call shows STRING overload signature", async () => {
        // HoverProvider is the LSP entry point; MethodHoverResolver is the internal
        // overload-resolution call at MethodHoverResolver.ts:114. We exercise the
        // public provideHover surface and assert the rendered content references
        // the STRING overload (not StringTheory).
        const { HoverProvider } = await import('../providers/HoverProvider');
        const provider = new HoverProvider();
        const doc = createDoc(MARK_REPRO_FIXTURE);
        const result = await provider.provideHover(doc, SETVALUE_CALL_POS);

        assert.ok(result, 'hover must resolve to a Hover result');
        const contents = typeof result.contents === 'string' ? result.contents :
            Array.isArray(result.contents) ? result.contents.map(c => typeof c === 'string' ? c : c.value).join('\n') :
            (result.contents as { value?: string }).value ?? '';
        assert.ok(/STRING\b/.test(contents),
            `hover content must mention STRING overload; got: ${contents.slice(0, 200)}...`);
        assert.ok(/LONG\s+pClip/.test(contents) || /pClip\s*=\s*0/.test(contents),
            `hover content must include the default-param ('pClip=0'); confirms STRING+default overload is the resolved target`);
        assert.ok(!/StringTheory\s+newValue/.test(contents),
            `hover content must NOT mention 'StringTheory newValue' (the wrong overload's signature)`);
    });
});

// ─── (3) ImplementationProvider — Goto Implementation (call→impl path-1) ────

suite('ImplementationProvider — overload resolution wire-up (#125 Phase A)', () => {

    const tokenCache = TokenCache.getInstance();

    teardown(() => {
        tokenCache.clearTokens(TEST_URI);
    });

    test("Mark's repro: F12 from st.SetValue('Hello World') call should target STRING overload's impl (line 1 decl)", async () => {
        // ImplementationProvider call→impl path-1 (typed-var dot access) at
        // findMethodImplementation:323. With no separate impl file in the
        // fixture, the result should target the decl line; the substantive
        // assertion is that paramCount-only resolution doesn't pick line 2.
        const provider = new ImplementationProvider();
        const doc = createDoc(MARK_REPRO_FIXTURE);
        const result = await provider.provideImplementation(doc, SETVALUE_CALL_POS);

        assert.ok(result, 'implementation must resolve to a Location');
        const line = getLocationLine(result);
        // Single-file fixture has no separate impl; provider returns the decl line.
        // The bug shape: paramCount-only picks line 2 (StringTheory); post-fix picks line 1 (STRING).
        assert.strictEqual(line, 1,
            `Goto Implementation must target STRING overload at line 1; got line ${line}. ` +
            `Same fix-shape as DefinitionProvider — wire CallSiteArgumentClassifier through findMethodImplementation:323 path-1 (typed-var dot access).`);
        assert.notStrictEqual(line, 2,
            'StringTheory overload at line 2 must NOT be the impl target');
    });
});

// ─── (4) WordCompletionProvider — present-all overload detail ───────────────

suite('WordCompletionProvider — overload detail-field augmentation (#125 Phase A)', () => {

    const tokenCache = TokenCache.getInstance();

    teardown(() => {
        tokenCache.clearTokens(TEST_URI);
    });

    test("completion item for SetValue includes ALL overload signatures in detail (Mark's 'present all' framing)", async () => {
        // Different problem shape from Def/Hover/Impl: at completion time the
        // user hasn't typed args yet, so no arg-classification possible.
        // Mark's ask: completion item's `detail` field should list ALL overload
        // signatures so the user sees them inline (not just first-found-wins).
        const { WordCompletionProvider } = await import('../providers/WordCompletionProvider');
        const { ScopeAnalyzer } = await import('../utils/ScopeAnalyzer');
        const scopeAnalyzer = new ScopeAnalyzer(tokenCache, undefined as never);
        const provider = new WordCompletionProvider(tokenCache, scopeAnalyzer);
        // Cursor at the start of a fresh line just after the call site, typing
        // 'SetVa' — wants to complete to SetValue.
        const completionDoc = createDoc(
            MARK_REPRO_FIXTURE + "\n  SetVa",
            TEST_URI
        );
        const items: CompletionItem[] = await provider.provide(
            completionDoc,
            { line: 11, character: 7 },
            'SetVa'
        );

        const setValueItem = items.find(i => typeof i.label === 'string' && i.label.toUpperCase() === 'SETVALUE');
        assert.ok(setValueItem,
            "completion list must include a 'SetValue' item (current behaviour: first-found-wins enumeration)");

        // Pre-fix: detail shows ONE signature (first-found-wins).
        // Post-fix: detail lists BOTH overload signatures (Mark's "present all" ask).
        const detail = (setValueItem.detail ?? '') as string;
        assert.ok(/STRING\b/i.test(detail),
            `detail must mention the STRING overload signature; got: ${detail}`);
        assert.ok(/StringTheory/.test(detail),
            `detail must ALSO mention the StringTheory overload signature (Mark's 'present all overloads' framing); got: ${detail}`);
    });
});
