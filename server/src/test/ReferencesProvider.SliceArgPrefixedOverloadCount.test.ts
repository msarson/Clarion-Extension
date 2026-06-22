import * as assert from 'assert';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { TokenCache } from '../TokenCache';
import { ReferencesProvider } from '../providers/ReferencesProvider';
import { setServerInitialized } from '../serverState';

/**
 * RED pin for #193 (task 47df530a, items 1-2) — re-enables the prefixed-base slice
 * FAR pin DEFERRED from #192. Bidirectional reference-count pins (GROUP + QUEUE
 * prefixes, 3-char AND >3-char) + blast-radius regression sentinels for the additive
 * PRE-group keying.
 *
 * BUG (the #192 deferral): #192 widened the CLASSIFIER to recognise a prefixed-base
 * slice `PRE:Field[a:b]` and extract base name "PRE:Field", but the var-type index
 * (`buildFileVarTypeIndex`) keys PRE-bearing structure fields by BARE label ("field",
 * not "pre:field"), so `ctx.resolveSymbolType("PRE:Field", …)` returns nothing. The
 * slice can't infer STRING via base-type resolution → 'unknown' → the overload
 * resolver's conservative match-all counts the call toward BOTH SetValue overloads,
 * including the class-typed SetValue(StringTheory). Over-count.
 *
 * Phase A token-shape surprise (empirically confirmed) — the prefixed base tokenizes
 * TWO different ways at the call site depending on keyword collision:
 *   - `PRE:Field[a:b]`  → Attribute("PRE") ':' Variable("Field") '[' …   (3-token head;
 *                          PRE collides with a keyword so it stays split)
 *   - `QUE:QText[a:b]`  → StructurePrefix("QUE:QText") '[' …            (SINGLE token;
 *                          QUE is not a keyword so `ident:ident` collapses)
 * The collapse is PREFIX-LENGTH-INDEPENDENT (empirically: CUST:CName, ORDHDR:Total
 * collapse identically) — pinned below by the CUST (4-char) bidirectional pin so a
 * future length assumption can't regress it.
 *
 * #193 fix: (Eve item 3) generalize PRE() capture to GROUP/RECORD/FILE/QUEUE; key those
 * fields ADDITIVELY as both "field" AND "prefix:field"; prefix-aware lookup; + fold
 * StructurePrefix into the slice-head union so collapsed prefixes reach the resolver.
 *
 * ┌─ DO NOT "helpfully" add a numeric prefixed slice (`PRE:Field[0:128]`) here. ──────┐
 * │ var:var `[a:b]` collapses its slice CONTENT to a single StructurePrefix token with │
 * │ NO standalone Delimiter(':'), so the #192 standalone-colon fallback CANNOT fire — │
 * │ base-type resolution (the new #193 prefix-keying) is the ONLY discriminator. A     │
 * │ NUMERIC prefixed slice would false-green via that colon fallback even with #193    │
 * │ reverted, masking whether the keying actually resolves the base. Pins locked to    │
 * │ var:var on purpose.                                                                │
 * └──────────────────────────────────────────────────────────────────────────────────┘
 *
 * Contract — BIDIRECTIONAL (item 1, per prefix-structure):
 *   (a) FAR on SetValue(StringTheory) decl must NOT include the prefixed-slice call site.
 *   (b) FAR on SetValue(STRING)       decl MUST include the prefixed-slice call site.
 *
 * Blast-radius sentinels (item 2 — rename DROPPED per Phase A consumer matrix:
 * RenameProvider delegates to provideReferences, consumes no separate keying surface):
 *   (S1) non-string PRE-group base PRE:LongField[a:b] (3-token head) must STAY counted
 *        toward SetValue(StringTheory) — must NOT be over-retyped to STRING.
 *   (S2) non-PRE GROUP field strField[a:b] (bare label) must STAY STRING-resolvable
 *        (excluded from StringTheory) — additive keying must not perturb bare-label walk.
 *   (S3) non-string QUEUE base QUE:QLong[a:b] (single StructurePrefix head) must STAY
 *        counted toward SetValue(StringTheory) — pins the StructurePrefix slice-head
 *        branch keys on base-TYPE, not "is a StructurePrefix slice".
 *   (S4) non-string LONG-prefix base CUST:CNum[a:b] (4-char, single StructurePrefix)
 *        must STAY counted toward StringTheory — length-independent non-X guard.
 *
 * RED-history: the two 3-char BUG PINs (GROUP line 24, QUEUE line 27) were the original
 * RED (committed d461472/d4e41eb before Eve's GREEN). With Eve's GREEN active they pass;
 * the CUST (4-char) pin proves length-independence (green = proven; red = length bug).
 */

function createDocument(content: string, uri: string): TextDocument {
    return TextDocument.create(uri, 'clarion', 1, content);
}

function seedCache(document: TextDocument): void {
    TokenCache.getInstance().getTokens(document);
}

const SLICE_FIXTURE = [
    "StringTheory CLASS,TYPE",                                     // line 0
    "SetValue PROCEDURE(STRING newValue, LONG pClip=0),VIRTUAL",   // line 1 — STRING overload
    "SetValue PROCEDURE(StringTheory newValue),VIRTUAL",          // line 2 — StringTheory overload
    "DoWork   PROCEDURE()",                                        // line 3
    "        END",                                                 // line 4
    "",                                                            // line 5
    "MyGroup GROUP,PRE(PRE)",                                      // line 6 — PRE group (3-char)
    "Field      STRING(256)",                                      // line 7 — PRE:Field (STRING)
    "LongField  LONG",                                             // line 8 — PRE:LongField (non-string)
    "        END",                                                 // line 9
    "PlainGrp GROUP",                                              // line 10 — NON-PRE group
    "strField   STRING(256)",                                      // line 11 — bare-label STRING field
    "        END",                                                 // line 12
    "MyQueue QUEUE,PRE(QUE)",                                      // line 13 — PRE queue (3-char)
    "QText      STRING(256)",                                      // line 14 — QUE:QText (STRING)
    "QLong      LONG",                                             // line 15 — QUE:QLong (non-string)
    "        END",                                                 // line 16
    "CustGrp GROUP,PRE(CUST)",                                     // line 17 — PRE group (4-char prefix)
    "CName      STRING(256)",                                      // line 18 — CUST:CName (STRING)
    "CNum       LONG",                                             // line 19 — CUST:CNum (non-string)
    "        END",                                                 // line 20
    "",                                                            // line 21
    "StringTheory.DoWork PROCEDURE()",                            // line 22
    "  CODE",                                                      // line 23
    "  SELF.SetValue(PRE:Field[a:b])",                            // line 24 — BUG PIN: GROUP STRING prefixed (3-char)
    "  SELF.SetValue(PRE:LongField[a:b])",                        // line 25 — S1: non-string GROUP prefixed
    "  SELF.SetValue(strField[a:b])",                            // line 26 — S2: non-PRE bare field
    "  SELF.SetValue(QUE:QText[a:b])",                           // line 27 — BUG PIN: QUEUE STRING prefixed (3-char)
    "  SELF.SetValue(QUE:QLong[a:b])",                           // line 28 — S3: non-string QUEUE prefixed
    "  SELF.SetValue(CUST:CName[a:b])",                          // line 29 — BUG PIN: 4-char prefix STRING (length-independence)
    "  SELF.SetValue(CUST:CNum[a:b])",                           // line 30 — S4: non-string 4-char prefix
    "  RETURN",                                                    // line 31
].join('\n');

const SLICE_URI = 'file:///193-prefixed-slice.clw';

suite('ReferencesProvider.SliceArgPrefixedOverloadCount (#193 items 1-2 — 47df530a)', () => {

    let provider: ReferencesProvider;

    setup(() => {
        setServerInitialized(true);
        TokenCache.getInstance().clearAllTokens();
        provider = new ReferencesProvider();
    });

    teardown(() => {
        TokenCache.getInstance().clearTokens(SLICE_URI);
    });

    // ── item 1: prefixed FAR pin — GROUP base, 3-char (bidirectional) ──────
    test('BUG PIN (item 1, GROUP) — PRE:Field[a:b] must NOT count toward SetValue(StringTheory) overload', async () => {
        const doc = createDocument(SLICE_FIXTURE, SLICE_URI);
        seedCache(doc);

        const refs = await provider.provideReferences(doc, { line: 2, character: 0 },
            { includeDeclaration: true });
        assert.ok(refs, 'FAR should return references for the StringTheory overload decl');
        const lines = refs!.map(r => r.range.start.line).sort((a, b) => a - b);

        assert.ok(
            !lines.includes(24),
            'expected line 24 (GROUP prefixed STRING-slice SELF.SetValue(PRE:Field[a:b])) NOT in StringTheory-overload result; ' +
            'got lines=[' + lines.join(',') + '] — over-counting until #193 keys PRE-group fields as prefix:field'
        );
    });

    test('SILENT-EXCLUSION SENTINEL (item 1, GROUP) — PRE:Field[a:b] MUST count toward SetValue(STRING) overload', async () => {
        const doc = createDocument(SLICE_FIXTURE, SLICE_URI);
        seedCache(doc);

        const refs = await provider.provideReferences(doc, { line: 1, character: 0 },
            { includeDeclaration: true });
        assert.ok(refs, 'FAR should return references for the STRING overload decl');
        const lines = refs!.map(r => r.range.start.line).sort((a, b) => a - b);

        assert.ok(
            lines.includes(24),
            'expected line 24 (GROUP prefixed STRING-slice) IN the STRING-overload result; ' +
            'got lines=[' + lines.join(',') + '] — if absent, the call site is not being surfaced (machinery gap)'
        );
    });

    // ── item 1: prefixed FAR pin — QUEUE base, 3-char (single StructurePrefix head) ──
    test('BUG PIN (item 1, QUEUE) — QUE:QText[a:b] must NOT count toward SetValue(StringTheory) overload', async () => {
        const doc = createDocument(SLICE_FIXTURE, SLICE_URI);
        seedCache(doc);

        const refs = await provider.provideReferences(doc, { line: 2, character: 0 },
            { includeDeclaration: true });
        const lines = refs!.map(r => r.range.start.line).sort((a, b) => a - b);

        assert.ok(
            !lines.includes(27),
            'expected line 27 (QUEUE prefixed STRING-slice SELF.SetValue(QUE:QText[a:b])) NOT in StringTheory-overload result; ' +
            'got lines=[' + lines.join(',') + '] — QUEUE base collapses to a single StructurePrefix token; needs the classifier ' +
            'slice-head extension + prefix-keying to resolve (Bob: QUEUE in scope, no half-capability)'
        );
    });

    test('SILENT-EXCLUSION SENTINEL (item 1, QUEUE) — QUE:QText[a:b] MUST count toward SetValue(STRING) overload', async () => {
        const doc = createDocument(SLICE_FIXTURE, SLICE_URI);
        seedCache(doc);

        const refs = await provider.provideReferences(doc, { line: 1, character: 0 },
            { includeDeclaration: true });
        const lines = refs!.map(r => r.range.start.line).sort((a, b) => a - b);

        assert.ok(
            lines.includes(27),
            'expected line 27 (QUEUE prefixed STRING-slice) IN the STRING-overload result; ' +
            'got lines=[' + lines.join(',') + '] — QUEUE prefixed slice call site must be surfaced'
        );
    });

    // ── item 1: LENGTH-INDEPENDENCE pin — 4-char prefix, single StructurePrefix head ──
    test('BUG PIN (item 1, 4-char prefix) — CUST:CName[a:b] must NOT count toward SetValue(StringTheory) overload', async () => {
        const doc = createDocument(SLICE_FIXTURE, SLICE_URI);
        seedCache(doc);

        const refs = await provider.provideReferences(doc, { line: 2, character: 0 },
            { includeDeclaration: true });
        const lines = refs!.map(r => r.range.start.line).sort((a, b) => a - b);

        // CUST (4 chars, non-keyword) collapses to a single StructurePrefix token just
        // like QUE (3 chars). The fix is length-independent (extractStructurePrefix
        // returns the full identifier; keying is `${prefix}:${field}`; '3-token' is
        // TOKEN count not char count) — this pin proves it. RED here = a length bug.
        assert.ok(
            !lines.includes(29),
            'expected line 29 (4-char-prefix STRING-slice SELF.SetValue(CUST:CName[a:b])) NOT in StringTheory-overload result; ' +
            'got lines=[' + lines.join(',') + '] — if present, prefix-keying/collapse handling has a prefix-length assumption'
        );
    });

    test('SILENT-EXCLUSION SENTINEL (item 1, 4-char prefix) — CUST:CName[a:b] MUST count toward SetValue(STRING) overload', async () => {
        const doc = createDocument(SLICE_FIXTURE, SLICE_URI);
        seedCache(doc);

        const refs = await provider.provideReferences(doc, { line: 1, character: 0 },
            { includeDeclaration: true });
        const lines = refs!.map(r => r.range.start.line).sort((a, b) => a - b);

        assert.ok(
            lines.includes(29),
            'expected line 29 (4-char-prefix STRING-slice) IN the STRING-overload result; ' +
            'got lines=[' + lines.join(',') + '] — 4-char-prefix collapsed slice call site must be surfaced'
        );
    });

    // ── item 2: blast-radius regression sentinels (green now, must stay green) ──
    test('REGRESSION S1 (item 2) — non-string GROUP base PRE:LongField[a:b] must STAY counted toward StringTheory (not over-retyped to STRING)', async () => {
        const doc = createDocument(SLICE_FIXTURE, SLICE_URI);
        seedCache(doc);

        const refs = await provider.provideReferences(doc, { line: 2, character: 0 },
            { includeDeclaration: true });
        const lines = refs!.map(r => r.range.start.line).sort((a, b) => a - b);

        assert.ok(
            lines.includes(25),
            'expected line 25 (non-string GROUP prefixed slice PRE:LongField[a:b]) STILL counted toward StringTheory; ' +
            'got lines=[' + lines.join(',') + '] — a non-string prefixed base must NOT be over-retyped to STRING by the prefix-keying'
        );
    });

    test('REGRESSION S2 (item 2) — non-PRE GROUP field strField[a:b] (bare label) must STAY STRING-resolvable (excluded from StringTheory)', async () => {
        const doc = createDocument(SLICE_FIXTURE, SLICE_URI);
        seedCache(doc);

        const refs = await provider.provideReferences(doc, { line: 2, character: 0 },
            { includeDeclaration: true });
        const lines = refs!.map(r => r.range.start.line).sort((a, b) => a - b);

        assert.ok(
            !lines.includes(26),
            'expected line 26 (non-PRE bare field slice strField[a:b]) NOT in StringTheory-overload result; ' +
            'got lines=[' + lines.join(',') + '] — additive prefix-keying must not break bare-label field resolution'
        );
    });

    test('REGRESSION S3 (item 2) — non-string QUEUE base QUE:QLong[a:b] (single StructurePrefix head) must STAY counted toward StringTheory (branch keys on base-TYPE)', async () => {
        const doc = createDocument(SLICE_FIXTURE, SLICE_URI);
        seedCache(doc);

        const refs = await provider.provideReferences(doc, { line: 2, character: 0 },
            { includeDeclaration: true });
        const lines = refs!.map(r => r.range.start.line).sort((a, b) => a - b);

        assert.ok(
            lines.includes(28),
            'expected line 28 (non-string QUEUE prefixed slice QUE:QLong[a:b]) STILL counted toward StringTheory; ' +
            'got lines=[' + lines.join(',') + '] — the StructurePrefix slice-head branch must key on base TYPE, not slice shape'
        );
    });

    test('REGRESSION S4 (item 2) — non-string 4-char-prefix base CUST:CNum[a:b] must STAY counted toward StringTheory (length-independent non-X guard)', async () => {
        const doc = createDocument(SLICE_FIXTURE, SLICE_URI);
        seedCache(doc);

        const refs = await provider.provideReferences(doc, { line: 2, character: 0 },
            { includeDeclaration: true });
        const lines = refs!.map(r => r.range.start.line).sort((a, b) => a - b);

        assert.ok(
            lines.includes(30),
            'expected line 30 (non-string 4-char-prefix slice CUST:CNum[a:b]) STILL counted toward StringTheory; ' +
            'got lines=[' + lines.join(',') + '] — a non-string base must NOT be over-retyped to STRING regardless of prefix length'
        );
    });
});
