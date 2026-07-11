import * as assert from 'assert';
import { DocumentHighlight, DocumentHighlightKind } from 'vscode-languageserver-protocol';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { TokenCache } from '../TokenCache';
import { DocumentHighlightProvider } from '../providers/DocumentHighlightProvider';
import { setServerInitialized } from '../serverState';

/**
 * #254 — DocumentHighlightProvider defects, all probed 2026-07-07:
 *
 *   1. Procedure CALL SITES never highlighted: call tokens are TokenType.Function
 *      with an empty label, and the name extraction read `label` for
 *      procedure-shaped tokens → skipped.
 *   2. Declaration lines emitted a DOUBLE highlight: the col-0 Label token (right)
 *      plus the Procedure keyword token (whose range starts at the PROCEDURE
 *      keyword — a phantom highlight over the wrong columns).
 *   3. Zero scoping: two unrelated procedure-locals both named `Counter`
 *      highlighted together (whole-file bare-name scan).
 *
 * Post-fix: value-based matching for call/use tokens, label-carrier tokens
 * suppressed when the same-line Label already emits, and variable names are
 * scope-filtered through the shared ScopeTypeIndexService tier index.
 */

function createDocument(content: string, uri: string): TextDocument {
    return TextDocument.create(uri, 'clarion', 1, content);
}

function fmt(hl: { range: { start: { line: number; character: number } }; kind?: number }[]): string {
    return hl.map(h => `L${h.range.start.line}@${h.range.start.character}:${h.kind === DocumentHighlightKind.Write ? 'W' : 'R'}`).join(' ');
}

suite('DocumentHighlightProvider — kinds + scoping (#254)', () => {

    setup(() => {
        setServerInitialized(true);
        TokenCache.getInstance().clearAllTokens();
    });

    const PROC_FIXTURE = [
        '  PROGRAM',                    // 0
        '  MAP',                        // 1
        'DoStuff  PROCEDURE(LONG x)',   // 2  decl — one Write at col 0
        '  END',                        // 3
        '  CODE',                       // 4
        '  DoStuff(1)',                 // 5  call — Read
        '  RETURN',                     // 6
        '',                             // 7
        'DoStuff  PROCEDURE(LONG x)',   // 8  impl — one Write at col 0
        '  CODE',                       // 9
        '  RETURN',                     // 10
    ].join('\n');

    test('procedure name: call sites highlight as Read, decl/impl once as Write at the label', () => {
        const doc = createDocument(PROC_FIXTURE, 'file:///t254-proc.clw');
        TokenCache.getInstance().getTokens(doc);
        const provider = new DocumentHighlightProvider();
        const hl = provider.provideDocumentHighlights(doc, { line: 5, character: 4 });

        assert.ok(hl, 'highlights expected');
        const callSite = hl!.filter(h => h.range.start.line === 5);
        assert.strictEqual(callSite.length, 1,
            `call site must highlight exactly once, got ${fmt(hl!)}`);
        assert.strictEqual(callSite[0].kind, DocumentHighlightKind.Read,
            'a call site is a Read, not a declaration');

        for (const declLine of [2, 8]) {
            const onLine: DocumentHighlight[] = hl!.filter(h => h.range.start.line === declLine);
            assert.strictEqual(onLine.length, 1,
                `line ${declLine} must emit exactly ONE highlight (no phantom over the PROCEDURE keyword), got ${fmt(hl!)}`);
            assert.strictEqual(onLine[0].range.start.character, 0, 'the highlight covers the label at col 0');
            assert.strictEqual(onLine[0].kind, DocumentHighlightKind.Write);
        }
    });

    const VAR_FIXTURE = [
        "  MEMBER('test')",             // 0
        '',                             // 1
        'MainProc PROCEDURE',           // 2
        'Counter    LONG',              // 3  MainProc's Counter (decl)
        '  CODE',                       // 4
        '  Counter = 1',                // 5  use
        '  RETURN',                     // 6
        '',                             // 7
        'OtherProc PROCEDURE',          // 8
        'Counter    LONG',              // 9  UNRELATED Counter
        '  CODE',                       // 10
        '  Counter = 2',                // 11 UNRELATED use
        '  RETURN',                     // 12
    ].join('\n');

    test("proc-local variable: another procedure's same-named local does NOT co-highlight", () => {
        const doc = createDocument(VAR_FIXTURE, 'file:///t254-var.clw');
        TokenCache.getInstance().getTokens(doc);
        const provider = new DocumentHighlightProvider();
        const hl = provider.provideDocumentHighlights(doc, { line: 5, character: 4 });

        assert.ok(hl, 'highlights expected');
        const lines = hl!.map(h => h.range.start.line).sort((a, b) => a - b);
        assert.deepStrictEqual(lines, [3, 5],
            `expected only MainProc's Counter (decl line 3 + use line 5), got ${fmt(hl!)} — ` +
            "OtherProc's unrelated Counter is co-highlighting (zero scoping)");
        assert.strictEqual(hl!.find(h => h.range.start.line === 3)!.kind, DocumentHighlightKind.Write);
        assert.strictEqual(hl!.find(h => h.range.start.line === 5)!.kind, DocumentHighlightKind.Read);
    });

    test('same fixture, cursor in the OTHER procedure: highlights flip to that scope', () => {
        const doc = createDocument(VAR_FIXTURE, 'file:///t254-var2.clw');
        TokenCache.getInstance().getTokens(doc);
        const provider = new DocumentHighlightProvider();
        const hl = provider.provideDocumentHighlights(doc, { line: 11, character: 4 });

        assert.ok(hl, 'highlights expected');
        const lines = hl!.map(h => h.range.start.line).sort((a, b) => a - b);
        assert.deepStrictEqual(lines, [9, 11],
            `expected only OtherProc's Counter, got ${fmt(hl!)}`);
    });

    const SHADOW_FIXTURE = [
        "  MEMBER('test')",             // 0
        '',                             // 1
        'x          LONG',              // 2  module-scope x
        '',                             // 3
        'UsesModule PROCEDURE',         // 4
        '  CODE',                       // 5
        '  x = 1',                      // 6  module x (no local shadow)
        '  RETURN',                     // 7
        '',                             // 8
        'ShadowProc PROCEDURE',         // 9
        'x          REAL',              // 10 shadows module x
        '  CODE',                       // 11
        '  x = 2',                      // 12 the LOCAL x
        '  RETURN',                     // 13
    ].join('\n');

    test('module variable: highlights skip procedures that shadow the name', () => {
        const doc = createDocument(SHADOW_FIXTURE, 'file:///t254-shadow.clw');
        TokenCache.getInstance().getTokens(doc);
        const provider = new DocumentHighlightProvider();
        // Cursor on the module declaration (line 2).
        const hl = provider.provideDocumentHighlights(doc, { line: 2, character: 0 });

        assert.ok(hl, 'highlights expected');
        const lines = hl!.map(h => h.range.start.line).sort((a, b) => a - b);
        assert.deepStrictEqual(lines, [2, 6],
            `expected module decl (2) + non-shadowed use (6) only, got ${fmt(hl!)} — ` +
            "ShadowProc's own x must not co-highlight with the module x");
    });

    test('cursor on the shadowing local: only that procedure highlights', () => {
        const doc = createDocument(SHADOW_FIXTURE, 'file:///t254-shadow2.clw');
        TokenCache.getInstance().getTokens(doc);
        const provider = new DocumentHighlightProvider();
        const hl = provider.provideDocumentHighlights(doc, { line: 12, character: 2 });

        assert.ok(hl, 'highlights expected');
        const lines = hl!.map(h => h.range.start.line).sort((a, b) => a - b);
        assert.deepStrictEqual(lines, [10, 12],
            `expected the local decl (10) + local use (12) only, got ${fmt(hl!)}`);
    });
});
