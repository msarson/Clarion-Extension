import * as assert from 'assert';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { TokenCache } from '../TokenCache';
import { ReferencesProvider } from '../providers/ReferencesProvider';
import { setServerInitialized } from '../serverState';

/**
 * RED pin for #193 (task 47df530a, items 1-2) — re-enables the prefixed-base slice
 * FAR pin DEFERRED from #192. Bidirectional reference-count pins (GROUP + QUEUE
 * prefixes) + blast-radius regression sentinels for the additive PRE-group keying.
 *
 * BUG (the #192 deferral): #192 widened the CLASSIFIER to recognise a prefixed-base
 * slice `PRE:Field[a:b]` and extract base name "PRE:Field", but the var-type index
 * (`buildFileVarTypeIndex`) keys PRE-bearing structure fields by BARE label ("field",
 * not "pre:field"), so `ctx.resolveSymbolType("PRE:Field", …)` returns nothing. The
 * slice can't infer STRING via base-type resolution → 'unknown' → the overload
 * resolver's conservative match-all counts the call toward BOTH SetValue overloads,
 * including the class-typed SetValue(StringTheory). Over-count.
 *
 * #193 fix (Eve, item 3): generalize PRE() capture to GROUP/RECORD/FILE/QUEUE and key
 * those fields ADDITIVELY as both "field" AND "prefix:field"; make the lookup
 * prefix-aware. NO change to the #192 classifier.
 *
 * ┌─ DO NOT "helpfully" add a numeric prefixed slice (`PRE:Field[0:128]`) here. ──────┐
 * │ Phase A (Alice): var:var `[a:b]` collapses its slice content to a single          │
 * │ StructurePrefix token with NO standalone Delimiter(':'), so the #192              │
 * │ standalone-colon fallback CANNOT fire — base-type resolution (the new #193        │
 * │ prefix-keying) is the ONLY discriminator. A NUMERIC prefixed slice would          │
 * │ false-green via that colon fallback even with #193 reverted, masking whether      │
 * │ the keying actually resolves the base. The whole point of #193 is base-type       │
 * │ resolution → these pins are deliberately locked to var:var.                       │
 * └──────────────────────────────────────────────────────────────────────────────────┘
 *
 * Contract — BIDIRECTIONAL (item 1, per prefix-structure):
 *   (a) FAR on SetValue(StringTheory) decl must NOT include the prefixed-slice call site.
 *   (b) FAR on SetValue(STRING)       decl MUST include the prefixed-slice call site.
 *
 * Blast-radius sentinels (item 2 — rename DROPPED per Phase A consumer matrix:
 * RenameProvider delegates to provideReferences, consumes no separate keying surface):
 *   (S1) non-string prefixed base PRE:LongField[a:b] must STAY counted toward
 *        SetValue(StringTheory) — must NOT be over-retyped to STRING by the keying.
 *   (S2) non-PRE GROUP field strField[a:b] (bare label) must STAY STRING-resolvable
 *        (excluded from StringTheory) — additive keying must not perturb bare-label walk.
 *
 * RED today: the two BUG PINs (GROUP line 19, QUEUE line 22) fail (over-count). The
 * STRING-side sentinels + S1/S2 pass now and must stay green through Eve's GREEN.
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
    "MyGroup GROUP,PRE(PRE)",                                      // line 6 — PRE group
    "Field      STRING(256)",                                      // line 7 — PRE:Field (STRING)
    "LongField  LONG",                                             // line 8 — PRE:LongField (non-string)
    "        END",                                                 // line 9
    "PlainGrp GROUP",                                              // line 10 — NON-PRE group
    "strField   STRING(256)",                                      // line 11 — bare-label STRING field
    "        END",                                                 // line 12
    "MyQueue QUEUE,PRE(QUE)",                                      // line 13 — PRE queue
    "QText      STRING(256)",                                      // line 14 — QUE:QText (STRING)
    "        END",                                                 // line 15
    "",                                                            // line 16
    "StringTheory.DoWork PROCEDURE()",                            // line 17
    "  CODE",                                                      // line 18
    "  SELF.SetValue(PRE:Field[a:b])",                            // line 19 — item1 BUG PIN: GROUP STRING prefixed
    "  SELF.SetValue(PRE:LongField[a:b])",                        // line 20 — S1: non-string prefixed
    "  SELF.SetValue(strField[a:b])",                            // line 21 — S2: non-PRE bare field
    "  SELF.SetValue(QUE:QText[a:b])",                           // line 22 — QUEUE BUG PIN: QUEUE STRING prefixed
    "  RETURN",                                                    // line 23
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

    // ── item 1: prefixed FAR pin — GROUP base (bidirectional) ──────────────
    test('BUG PIN (item 1, GROUP) — PRE:Field[a:b] must NOT count toward SetValue(StringTheory) overload', async () => {
        const doc = createDocument(SLICE_FIXTURE, SLICE_URI);
        seedCache(doc);

        const refs = await provider.provideReferences(doc, { line: 2, character: 0 },
            { includeDeclaration: true });
        assert.ok(refs, 'FAR should return references for the StringTheory overload decl');
        const lines = refs!.map(r => r.range.start.line).sort((a, b) => a - b);

        assert.ok(
            !lines.includes(19),
            'expected line 19 (GROUP prefixed STRING-slice SELF.SetValue(PRE:Field[a:b])) NOT in StringTheory-overload result; ' +
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
            lines.includes(19),
            'expected line 19 (GROUP prefixed STRING-slice) IN the STRING-overload result; ' +
            'got lines=[' + lines.join(',') + '] — if absent, the call site is not being surfaced (machinery gap)'
        );
    });

    // ── item 1: prefixed FAR pin — QUEUE base (Bob ruling: QUEUE in scope) ──
    test('BUG PIN (item 1, QUEUE) — QUE:QText[a:b] must NOT count toward SetValue(StringTheory) overload', async () => {
        const doc = createDocument(SLICE_FIXTURE, SLICE_URI);
        seedCache(doc);

        const refs = await provider.provideReferences(doc, { line: 2, character: 0 },
            { includeDeclaration: true });
        const lines = refs!.map(r => r.range.start.line).sort((a, b) => a - b);

        assert.ok(
            !lines.includes(22),
            'expected line 22 (QUEUE prefixed STRING-slice SELF.SetValue(QUE:QText[a:b])) NOT in StringTheory-overload result; ' +
            'got lines=[' + lines.join(',') + '] — QUEUE,PRE fields must key prefix:field too (Bob: QUEUE in scope, no half-capability)'
        );
    });

    test('SILENT-EXCLUSION SENTINEL (item 1, QUEUE) — QUE:QText[a:b] MUST count toward SetValue(STRING) overload', async () => {
        const doc = createDocument(SLICE_FIXTURE, SLICE_URI);
        seedCache(doc);

        const refs = await provider.provideReferences(doc, { line: 1, character: 0 },
            { includeDeclaration: true });
        const lines = refs!.map(r => r.range.start.line).sort((a, b) => a - b);

        assert.ok(
            lines.includes(22),
            'expected line 22 (QUEUE prefixed STRING-slice) IN the STRING-overload result; ' +
            'got lines=[' + lines.join(',') + '] — QUEUE prefixed slice call site must be surfaced'
        );
    });

    // ── item 2: blast-radius regression sentinels (green now, must stay green) ──
    test('REGRESSION S1 (item 2) — non-string prefixed base PRE:LongField[a:b] must STAY counted toward StringTheory (not over-retyped to STRING)', async () => {
        const doc = createDocument(SLICE_FIXTURE, SLICE_URI);
        seedCache(doc);

        const refs = await provider.provideReferences(doc, { line: 2, character: 0 },
            { includeDeclaration: true });
        const lines = refs!.map(r => r.range.start.line).sort((a, b) => a - b);

        assert.ok(
            lines.includes(20),
            'expected line 20 (non-string prefixed slice PRE:LongField[a:b]) STILL counted toward StringTheory; ' +
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
            !lines.includes(21),
            'expected line 21 (non-PRE bare field slice strField[a:b]) NOT in StringTheory-overload result; ' +
            'got lines=[' + lines.join(',') + '] — additive prefix-keying must not break bare-label field resolution'
        );
    });
});
