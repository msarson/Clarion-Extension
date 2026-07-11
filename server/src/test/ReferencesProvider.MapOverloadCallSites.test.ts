import * as assert from 'assert';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { TokenCache } from '../TokenCache';
import { ReferencesProvider } from '../providers/ReferencesProvider';
import { setServerInitialized } from '../serverState';

/**
 * #268 (split from #248) — FAR's plain-symbol path applied the overload filter
 * ONLY to declaration/implementation lines (signaturesMatch); call-site tokens
 * passed completely unfiltered — not even the arity band the member-access
 * path applies. FAR on `Foo PROCEDURE(STRING)` returned `Foo(1,2)` call sites
 * too (wrong even by arity), and rename from a MAP-proc decl merged BOTH
 * overloads' call sites.
 *
 * Mirrors the member path's isCompatibleCallSite: arity band (default-aware),
 * then classifyArguments + findOverloadByArgClassifications against the
 * sibling MAP decl signatures. Conservative bias (Mark's pick (b)): ambiguous
 * call sites stay INCLUDED — false-positive over false-negative for rename.
 */

function createDocument(content: string, uri: string): TextDocument {
    return TextDocument.create(uri, 'clarion', 1, content);
}

suite('FAR — plain-symbol MAP overload call-site filtering (#268)', () => {

    setup(() => {
        setServerInitialized(true);
        TokenCache.getInstance().clearAllTokens();
    });

    test('different-arity overloads: call sites of the other overload are excluded', async () => {
        const FIXTURE = [
            '  PROGRAM',                        // 0
            '  MAP',                            // 1
            'Foo  PROCEDURE(STRING s)',         // 2  ← cursor (STRING overload)
            'Foo  PROCEDURE(LONG a, LONG b)',   // 3  sibling decl — OUT (sig mismatch, pre-existing)
            '  END',                            // 4
            '',                                 // 5
            '  CODE',                           // 6
            "  Foo('x')",                       // 7  ← must be IN (matching call)
            '  Foo(1,2)',                       // 8  ← must be OUT (wrong even by arity)
            '  RETURN',                         // 9
            '',                                 // 10
            'Foo  PROCEDURE(STRING s)',         // 11 impl STRING — IN
            '  CODE',                           // 12
            '  RETURN',                         // 13
            '',                                 // 14
            'Foo  PROCEDURE(LONG a, LONG b)',   // 15 impl LONG,LONG — OUT (pre-existing)
            '  CODE',                           // 16
            '  RETURN',                         // 17
        ].join('\n');

        const doc = createDocument(FIXTURE, 'file:///t268-arity.clw');
        TokenCache.getInstance().getTokens(doc);
        const provider = new ReferencesProvider();
        const refs = await provider.provideReferences(doc,
            { line: 2, character: 1 }, { includeDeclaration: true });

        assert.ok(refs, 'FAR should return references');
        const lines = [...new Set(refs!.map(r => r.range.start.line))].sort((a, b) => a - b);

        assert.ok(lines.includes(7), `line 7 (matching call) must be IN; got [${lines.join(',')}]`);
        assert.ok(!lines.includes(8),
            `line 8 (2-arg call of the OTHER overload) must be OUT; got [${lines.join(',')}] — ` +
            'call sites pass unfiltered (not even the arity band)');
        assert.ok(lines.includes(2), 'cursor decl must be IN');
        assert.ok(!lines.includes(3), 'sibling decl must stay OUT (pre-existing signaturesMatch)');
    });

    test('same-arity overloads: literal argument types pick the call sites', async () => {
        const FIXTURE = [
            '  PROGRAM',                    // 0
            '  MAP',                        // 1
            'Bar  PROCEDURE(STRING s)',     // 2  ← cursor
            'Bar  PROCEDURE(LONG n)',       // 3
            '  END',                        // 4
            '',                             // 5
            '  CODE',                       // 6
            "  Bar('x')",                   // 7  IN  (string literal → STRING overload)
            '  Bar(42)',                    // 8  OUT (numeric literal → LONG overload)
            '  RETURN',                     // 9
        ].join('\n');

        const doc = createDocument(FIXTURE, 'file:///t268-types.clw');
        TokenCache.getInstance().getTokens(doc);
        const provider = new ReferencesProvider();
        const refs = await provider.provideReferences(doc,
            { line: 2, character: 1 }, { includeDeclaration: true });

        assert.ok(refs, 'FAR should return references');
        const lines = [...new Set(refs!.map(r => r.range.start.line))].sort((a, b) => a - b);

        assert.ok(lines.includes(7), `line 7 (string-literal call) must be IN; got [${lines.join(',')}]`);
        assert.ok(!lines.includes(8),
            `line 8 (numeric-literal call → LONG overload) must be OUT; got [${lines.join(',')}]`);
    });

    test('conservative bias: an untypable argument keeps the call site INCLUDED', async () => {
        const FIXTURE = [
            '  PROGRAM',                    // 0
            '  MAP',                        // 1
            'Baz  PROCEDURE(STRING s)',     // 2  ← cursor
            'Baz  PROCEDURE(LONG n)',       // 3
            '  END',                        // 4
            '',                             // 5
            '  CODE',                       // 6
            '  Baz(SomethingUnknown)',      // 7  ambiguous — must stay IN (rename safety)
            '  RETURN',                     // 8
        ].join('\n');

        const doc = createDocument(FIXTURE, 'file:///t268-conservative.clw');
        TokenCache.getInstance().getTokens(doc);
        const provider = new ReferencesProvider();
        const refs = await provider.provideReferences(doc,
            { line: 2, character: 1 }, { includeDeclaration: true });

        assert.ok(refs, 'FAR should return references');
        const lines = [...new Set(refs!.map(r => r.range.start.line))];
        assert.ok(lines.includes(7),
            `an argument no resolver can type must keep the call site INCLUDED (got [${lines.join(',')}]) — ` +
            'false-positive over false-negative for rename safety');
    });
});
