import * as assert from 'assert';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { TokenCache } from '../TokenCache';
import { ReferencesProvider } from '../providers/ReferencesProvider';
import { setServerInitialized } from '../serverState';

/**
 * RED pin for #193 Phase-A addendum (task 47df530a) — literal colon-label resolution
 * + the PRE-alias-vs-literal COLLISION bug (Mark/Bob, 2026-06-22).
 *
 * EMPIRICAL FINDINGS (Phase A addendum — LibSrc + tokenizer, clarion-docs MCP offline):
 *   - A label can LITERALLY contain a colon with NO PRE anywhere — the pervasive
 *     Clarion "LOC:" local-var idiom. LibSrc has 266 such col-0 declarations
 *     (`LOC:Index SHORT`, `Scroll:Alpha STRING(...)`, …).
 *   - DECL site `LOC:Name STRING(256)` → a SINGLE Label token (label="LOC:Name"), so
 *     `captureLabelType` ALREADY keys "loc:name" in the bare walk. (#193's PRE-keying
 *     is for the OTHER namespace: a bare field label `Name` referenced as `LOC:Name`.)
 *   - REFERENCE site `LOC:Name` → StructurePrefix("LOC:Name") — token-identical to a
 *     collapsed PRE-prefixed reference. So the two namespaces OVERLAP at the alias key.
 *
 * THE BUG (in Eve's first GREEN): `applyStructurePrefixKeying` does an UNCONDITIONAL
 * `.set(`${prefix}:${field}`, declType)`. When a literal `LOC:Name` STRING var AND a
 * `GROUP,PRE(LOC)` field `Name` LONG both exist, the PRE pass OVERWRITES the literal's
 * "loc:name"→STRING with the field's LONG → silent wrong-type resolution.
 *
 * CORRECTED CONTRACT (Q3 precedence — explicit/literal declaration WINS): the keying
 * must be SET-IF-ABSENT (only set an alias key the scope does not already hold). A
 * directly-declared `LOC:Name` is authoritative for that reference string; a derived
 * PRE alias must never clobber it. (No evidence Clarion prefers a derived prefix-name
 * over an explicit declaration; 266 LibSrc literal labels are the must-not-break case.)
 *
 * Pins (var:var [a:b], same reason as the sibling prefixed suite):
 *   - T1  literal colon-label STRING slice (no collision) resolves STRING — regression.
 *   - T2  COLLISION: literal `LOC:Name` STRING must WIN over PRE(LOC).Name LONG →
 *         LOC:Name[a:b] counts toward SetValue(STRING), NOT StringTheory. FAILS against
 *         the current unconditional-set GREEN (exposes the bug); greens under set-if-absent.
 */

function createDocument(content: string, uri: string): TextDocument {
    return TextDocument.create(uri, 'clarion', 1, content);
}

function seedCache(document: TextDocument): void {
    TokenCache.getInstance().getTokens(document);
}

const FIXTURE = [
    "StringTheory CLASS,TYPE",                                     // line 0
    "SetValue PROCEDURE(STRING newValue, LONG pClip=0),VIRTUAL",   // line 1 — STRING overload
    "SetValue PROCEDURE(StringTheory newValue),VIRTUAL",          // line 2 — StringTheory overload
    "DoWork   PROCEDURE()",                                        // line 3
    "        END",                                                 // line 4
    "",                                                            // line 5
    "LOC:Text   STRING(256)",                                      // line 6 — literal colon-label STRING (no PRE collision)
    "LOC:Name   STRING(256)",                                      // line 7 — literal colon-label STRING (COLLIDES w/ PRE(LOC).Name)
    "LocGrp GROUP,PRE(LOC)",                                       // line 8 — PRE(LOC) group
    "Name       LONG",                                             // line 9 — PRE(LOC).Name → alias "loc:name" (LONG)
    "        END",                                                 // line 10
    "",                                                            // line 11
    "StringTheory.DoWork PROCEDURE()",                            // line 12
    "  CODE",                                                      // line 13
    "  SELF.SetValue(LOC:Text[a:b])",                            // line 14 — T1: literal STRING, no collision
    "  SELF.SetValue(LOC:Name[a:b])",                            // line 15 — T2: collision, literal STRING must win
    "  RETURN",                                                    // line 16
].join('\n');

const URI = 'file:///193-colon-label-collision.clw';

suite('ReferencesProvider.SliceArgColonLabelCollision (#193 Phase-A addendum — 47df530a)', () => {

    let provider: ReferencesProvider;

    setup(() => {
        setServerInitialized(true);
        TokenCache.getInstance().clearAllTokens();
        provider = new ReferencesProvider();
    });

    teardown(() => {
        TokenCache.getInstance().clearTokens(URI);
    });

    // ── T1: literal colon-label STRING slice (no collision) resolves STRING ──
    test('REGRESSION — literal colon-label LOC:Text[a:b] (STRING, no PRE) must NOT count toward SetValue(StringTheory)', async () => {
        const doc = createDocument(FIXTURE, URI);
        seedCache(doc);

        const refs = await provider.provideReferences(doc, { line: 2, character: 0 },
            { includeDeclaration: true });
        const lines = refs!.map(r => r.range.start.line).sort((a, b) => a - b);

        // "loc:text" is keyed STRING by the bare walk (literal label); no PRE field
        // aliases it → resolves STRING → SetValue(STRING) only.
        assert.ok(
            !lines.includes(14),
            'expected line 14 (literal colon-label STRING slice LOC:Text[a:b]) NOT in StringTheory-overload result; ' +
            'got lines=[' + lines.join(',') + '] — literal colon-label STRING must resolve STRING'
        );
    });

    test('REGRESSION SENTINEL — literal colon-label LOC:Text[a:b] MUST count toward SetValue(STRING)', async () => {
        const doc = createDocument(FIXTURE, URI);
        seedCache(doc);

        const refs = await provider.provideReferences(doc, { line: 1, character: 0 },
            { includeDeclaration: true });
        const lines = refs!.map(r => r.range.start.line).sort((a, b) => a - b);

        assert.ok(
            lines.includes(14),
            'expected line 14 (literal colon-label STRING slice) IN the STRING-overload result; ' +
            'got lines=[' + lines.join(',') + ']'
        );
    });

    // ── T2: PRE-alias-vs-literal COLLISION — literal STRING must win ─────────
    test('COLLISION BUG PIN — literal LOC:Name (STRING) must WIN over PRE(LOC).Name (LONG): LOC:Name[a:b] NOT in StringTheory', async () => {
        const doc = createDocument(FIXTURE, URI);
        seedCache(doc);

        const refs = await provider.provideReferences(doc, { line: 2, character: 0 },
            { includeDeclaration: true });
        const lines = refs!.map(r => r.range.start.line).sort((a, b) => a - b);

        // Current GREEN (unconditional .set) overwrites "loc:name"→STRING with the
        // PRE(LOC).Name LONG → LOC:Name slice no longer infers STRING → match-all →
        // line 15 leaks into StringTheory. Set-if-absent keeps the literal STRING →
        // SetValue(STRING) only → line 15 excluded here.
        assert.ok(
            !lines.includes(15),
            'expected line 15 (LOC:Name[a:b]) NOT in StringTheory-overload result; ' +
            'got lines=[' + lines.join(',') + '] — the literal LOC:Name STRING var must WIN over the PRE(LOC).Name LONG alias ' +
            '(unconditional prefix-keying is overwriting the literal colon-label type — needs set-if-absent)'
        );
    });

    test('COLLISION SENTINEL — LOC:Name[a:b] MUST count toward SetValue(STRING)', async () => {
        const doc = createDocument(FIXTURE, URI);
        seedCache(doc);

        const refs = await provider.provideReferences(doc, { line: 1, character: 0 },
            { includeDeclaration: true });
        const lines = refs!.map(r => r.range.start.line).sort((a, b) => a - b);

        assert.ok(
            lines.includes(15),
            'expected line 15 (LOC:Name[a:b]) IN the STRING-overload result; ' +
            'got lines=[' + lines.join(',') + ']'
        );
    });
});
