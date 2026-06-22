import * as assert from 'assert';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { TokenCache } from '../TokenCache';
import { ReferencesProvider } from '../providers/ReferencesProvider';
import { setServerInitialized } from '../serverState';

/**
 * RED pin for #192 (task e0988953, item 1) — SetValue overload over-count on a
 * DOTTED-base slice arg `SELF.field[a:b]`. Bidirectional reference-count pin,
 * mirroring the #181-item-3 bare-variable pin (ReferencesProvider.SliceArgOverloadCount).
 *
 * BUG: #181 item 3 fixed the BARE-variable slice (`svalue[a:b]`) but
 * looksLikeSliceAccess still hard-gates base.type===TokenType.Variable, so a
 * slice whose base is a class member accessed via SELF (`SELF.field[a:b]`) — a
 * single StructureField token at the token level (Phase A) — never reaches the
 * STRING-inference path. It falls to 'unknown' → the overload resolver's
 * conservative match-all counts the call toward BOTH SetValue overloads,
 * including the class-typed SetValue(StringTheory). Over-count.
 *
 * Phase A note: the var:var slice content `a:b` collapses to a single
 * StructurePrefix token (NO standalone Delimiter(':')), so the colon fallback
 * cannot rescue this — base-type resolution is the ONLY discriminator. The base
 * (`SELF.field`) resolves through the FAR resolver's Tier-4 class-member path
 * (lookupVarTypeAtLine, key 'self.field' → classFields['field'] = STRING(256)).
 *
 * Contract — BIDIRECTIONAL:
 *   (a) FAR on SetValue(StringTheory) decl must NOT include the slice call site.
 *   (b) FAR on SetValue(STRING)       decl MUST include the slice call site.
 * (b) is the silent-exclusion sentinel: without it, (a) could pass for the wrong
 * reason (call site dropped entirely / machinery not surfacing it).
 *
 * RED today: slice → 'unknown' → match-all → call counted toward BOTH overloads,
 * so (a) fails (line 9 leaks into the StringTheory FAR result).
 */

function createDocument(content: string, uri: string): TextDocument {
    return TextDocument.create(uri, 'clarion', 1, content);
}

function seedCache(document: TextDocument): void {
    TokenCache.getInstance().getTokens(document);
}

// StringTheory class with a STRING data member + two SetValue overloads + a
// method that calls SELF.SetValue with a SELF.field STRING-slice argument.
const SLICE_FIXTURE = [
    "StringTheory CLASS,TYPE",                                     // line 0
    "field      STRING(256)",                                      // line 1 — STRING class member
    "SetValue PROCEDURE(STRING newValue, LONG pClip=0),VIRTUAL",   // line 2 — STRING overload
    "SetValue PROCEDURE(StringTheory newValue),VIRTUAL",          // line 3 — StringTheory overload
    "DoWork   PROCEDURE()",                                        // line 4
    "        END",                                                 // line 5
    "",                                                            // line 6
    "StringTheory.DoWork PROCEDURE()",                            // line 7
    "  CODE",                                                      // line 8
    "  SELF.SetValue(SELF.field[a:b])",                           // line 9 — CALL SITE, dotted STRING-slice arg
    "  RETURN",                                                    // line 10
].join('\n');

const SLICE_URI = 'file:///192-dotted-slice.clw';

suite('ReferencesProvider.SliceArgDottedOverloadCount (#192 item 1 — e0988953)', () => {

    let provider: ReferencesProvider;

    setup(() => {
        setServerInitialized(true);
        TokenCache.getInstance().clearAllTokens();
        provider = new ReferencesProvider();
    });

    teardown(() => {
        TokenCache.getInstance().clearTokens(SLICE_URI);
    });

    test('BUG PIN — dotted slice arg must NOT count toward SetValue(StringTheory) overload', async () => {
        const doc = createDocument(SLICE_FIXTURE, SLICE_URI);
        seedCache(doc);

        // FAR cursor on the StringTheory overload decl (line 3, col 0).
        const refs = await provider.provideReferences(doc, { line: 3, character: 0 },
            { includeDeclaration: true });

        assert.ok(refs, 'FAR should return references for the StringTheory overload decl');
        const lines = refs!.map(r => r.range.start.line).sort((a, b) => a - b);

        // Pre-fix today: line 9 (the dotted STRING-slice call) leaks in via match-all → over-count.
        // Post-fix: SELF.field resolves STRING → matches SetValue(STRING) only → line 9 excluded here.
        assert.ok(
            !lines.includes(9),
            'expected line 9 (dotted STRING-slice call SELF.SetValue(SELF.field[a:b])) NOT in StringTheory-overload result; ' +
            'got lines=[' + lines.join(',') + '] — dotted slice arg is over-counting toward SetValue(StringTheory)'
        );
    });

    test('SILENT-EXCLUSION SENTINEL — dotted slice arg MUST count toward SetValue(STRING) overload', async () => {
        const doc = createDocument(SLICE_FIXTURE, SLICE_URI);
        seedCache(doc);

        // FAR cursor on the STRING overload decl (line 2, col 0).
        const refs = await provider.provideReferences(doc, { line: 2, character: 0 },
            { includeDeclaration: true });

        assert.ok(refs, 'FAR should return references for the STRING overload decl');
        const lines = refs!.map(r => r.range.start.line).sort((a, b) => a - b);

        // The dotted STRING-slice call belongs to the STRING overload — it MUST appear here.
        assert.ok(
            lines.includes(9),
            'expected line 9 (dotted STRING-slice call) IN the STRING-overload result; ' +
            'got lines=[' + lines.join(',') + '] — if absent, the call site is not being surfaced/counted at all ' +
            '(machinery gap, not the over-count bug) — fix the fixture before relying on the BUG PIN'
        );
    });
});
