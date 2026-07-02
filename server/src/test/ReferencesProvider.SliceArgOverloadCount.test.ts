import * as assert from 'assert';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { TokenCache } from '../TokenCache';
import { ReferencesProvider } from '../providers/ReferencesProvider';
import { setServerInitialized } from '../serverState';

/**
 * RED pin for #181 item 3 — SetValue overload over-count on slice-expr args
 * (task 32b59484). Bidirectional reference-count pin.
 *
 * BUG: a substring-slice argument `svalue[1:10]` is classified as 'unknown'
 * by CallSiteArgumentClassifier (no slice handling), so the overload resolver
 * falls to conservative match-all (ReferencesProvider isCompatibleCallSite,
 * ~line 1928) and the call is counted toward BOTH SetValue overloads —
 * including the class-typed SetValue(StringTheory). The STRING-typed slice
 * should count toward SetValue(STRING) ONLY.
 *
 * The over-count path is reached through the SELF-rooted call branch inside a
 * class method (isInTargetClass → isCompatibleCallSite), so the fixture calls
 * `SELF.SetValue(svalue[1:10])` from within StringTheory.DoWork. The slice
 * argument base (`svalue`) is a BARE local STRING variable — matching Mark's
 * reported repro shape (blobField[0:128], someStringField[a:b]) and Bob's
 * bare-variable scope lock.
 *
 * Contract (Bob-locked 2026-06-22) — BIDIRECTIONAL:
 *   (a) FAR on SetValue(StringTheory) decl must NOT include the slice call site.
 *   (b) FAR on SetValue(STRING)       decl MUST include the slice call site.
 * (b) is the silent-exclusion sentinel: without it, (a) could pass for the
 * wrong reason (call site dropped entirely / machinery not surfacing it).
 *
 * RED today: slice → match-all → call counted toward BOTH overloads, so (a)
 * fails (line 9 leaks into the StringTheory FAR result).
 */

function createDocument(content: string, uri: string): TextDocument {
    return TextDocument.create(uri, 'clarion', 1, content);
}

function seedCache(document: TextDocument): void {
    TokenCache.getInstance().getTokens(document);
}

// StringTheory class with two SetValue overloads + a method that calls
// SELF.SetValue with a STRING-slice argument.
const SLICE_FIXTURE = [
    "StringTheory CLASS,TYPE",                                     // line 0
    "SetValue PROCEDURE(STRING newValue, LONG pClip=0),VIRTUAL",   // line 1 — STRING overload
    "SetValue PROCEDURE(StringTheory newValue),VIRTUAL",          // line 2 — StringTheory overload
    "DoWork   PROCEDURE()",                                        // line 3
    "        END",                                                 // line 4
    "",                                                            // line 5
    "StringTheory.DoWork PROCEDURE()",                            // line 6
    "svalue     STRING(256)",                                      // line 7 — bare local STRING
    "  CODE",                                                      // line 8
    "  SELF.SetValue(svalue[1:10])",                              // line 9 — CALL SITE, STRING-slice arg
    "  RETURN",                                                    // line 10
].join('\n');

const SLICE_URI = 'file:///181-item3-slice.clw';

suite('ReferencesProvider.SliceArgOverloadCount (#181 item 3 — 32b59484)', () => {

    let provider: ReferencesProvider;

    setup(() => {
        setServerInitialized(true);
        TokenCache.getInstance().clearAllTokens();
        provider = new ReferencesProvider();
    });

    teardown(() => {
        TokenCache.getInstance().clearTokens(SLICE_URI);
    });

    test('BUG PIN — slice arg must NOT count toward SetValue(StringTheory) overload', async () => {
        const doc = createDocument(SLICE_FIXTURE, SLICE_URI);
        seedCache(doc);

        // FAR cursor on the StringTheory overload decl (line 2, col 0).
        const refs = await provider.provideReferences(doc, { line: 2, character: 0 },
            { includeDeclaration: true });

        assert.ok(refs, 'FAR should return references for the StringTheory overload decl');
        const lines = refs!.map(r => r.range.start.line).sort((a, b) => a - b);

        // Pre-fix today: line 9 (the STRING-slice call) leaks in via match-all → over-count.
        // Post-fix: the slice infers STRING → matches SetValue(STRING) only → line 9 excluded here.
        assert.ok(
            !lines.includes(9),
            'expected line 9 (STRING-slice call SELF.SetValue(svalue[1:10])) NOT in StringTheory-overload result; ' +
            'got lines=[' + lines.join(',') + '] — slice arg is over-counting toward SetValue(StringTheory)'
        );
    });

    test('SILENT-EXCLUSION SENTINEL — slice arg MUST count toward SetValue(STRING) overload', async () => {
        const doc = createDocument(SLICE_FIXTURE, SLICE_URI);
        seedCache(doc);

        // FAR cursor on the STRING overload decl (line 1, col 0).
        const refs = await provider.provideReferences(doc, { line: 1, character: 0 },
            { includeDeclaration: true });

        assert.ok(refs, 'FAR should return references for the STRING overload decl');
        const lines = refs!.map(r => r.range.start.line).sort((a, b) => a - b);

        // The STRING-slice call belongs to the STRING overload — it MUST appear here.
        assert.ok(
            lines.includes(9),
            'expected line 9 (STRING-slice call) IN the STRING-overload result; ' +
            'got lines=[' + lines.join(',') + '] — if absent, the call site is not being surfaced/counted at all ' +
            '(machinery gap, not the over-count bug) — fix the fixture before relying on the BUG PIN'
        );
    });
});
