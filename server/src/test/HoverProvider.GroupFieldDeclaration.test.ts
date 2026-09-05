import * as assert from 'assert';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Position } from 'vscode-languageserver-protocol';
import { HoverProvider } from '../providers/HoverProvider';
import { TokenCache } from '../TokenCache';

// A field of a PRE()-less GROUP/QUEUE can only be REFERENCED via dot
// qualification (Structure.Field — issue #350), but that rule was also being
// applied to the DECLARATION token itself, which is never a "bare reference"
// — you're pointing straight at it. SymbolFinderService.findLocalVariable had
// no way to prefer "the exact token under the cursor" over either (a) a
// same-named symbol elsewhere winning the name-based symbol-tree search, or
// (b) the #350 exclusion rejecting the token outright.
//
// Real repro (found live, exact structure from the reporting session):
//   Order  LONG
//   Name    STRING(32)
//   Filter GROUP
//   Name      LONG      <- collides with the top-level Name above
//   Type      LONG
//   Flag      LONG
//   Integer   LONG
//          END
//
// Hovering Filter's own Name field showed the top-level Name's declaration
// instead; hovering Type/Flag/Integer (no name collision to mask the miss)
// showed nothing, which in the real project fell through to an unrelated
// same-named field in an unrelated INCLUDE file (WinApi.inc).
suite('HoverProvider — declaring a field inside a PRE()-less GROUP', () => {
    let provider: HoverProvider;
    let tokenCache: TokenCache;

    setup(() => {
        provider = new HoverProvider();
        tokenCache = TokenCache.getInstance();
        tokenCache.clearAllTokens();
    });

    teardown(() => {
        tokenCache.clearAllTokens();
    });

    function hoverText(hover: any): string {
        if (!hover) return '';
        return typeof hover.contents === 'string'
            ? hover.contents
            : 'value' in hover.contents ? hover.contents.value : '';
    }

    const code = [
        'MyProc PROCEDURE()',
        '',
        'Order  LONG',
        'Name    STRING(32)',
        'Filter GROUP',
        'Name      LONG',
        'Type      LONG',
        'Flag      LONG',
        'Integer   LONG',
        '       END',
        '',
        'CODE',
        '  RETURN',
    ].join('\n');

    test('hovering the GROUP field "Name" shows itself (LONG), not the colliding top-level Name (STRING)', async () => {
        const doc = TextDocument.create('test://group-name-collision.clw', 'clarion', 1, code);
        tokenCache.getTokens(doc);

        const hover = await provider.provideHover(doc, Position.create(5, 2)); // "Name      LONG" inside Filter
        const content = hoverText(hover);
        assert.ok(content.includes('LONG'),
            `Should show the GROUP field's own LONG type; got: ${content}`);
        assert.ok(!content.includes('STRING'),
            `Should not show the colliding top-level STRING Name; got: ${content}`);
        assert.ok(content.includes(':6') || content.includes('line 6') || /clw:6\b/.test(content),
            `Should cite its own declaration line (6, 1-based), not the top-level Name's line; got: ${content}`);
    });

    test('hovering GROUP field "Type" (no name collision) resolves to itself, not (none) or an unrelated builtin/attribute', async () => {
        const doc = TextDocument.create('test://group-type-field.clw', 'clarion', 1, code);
        tokenCache.getTokens(doc);

        const hover = await provider.provideHover(doc, Position.create(6, 2)); // "Type      LONG"
        const content = hoverText(hover);
        assert.ok(content.length > 0, 'Expected a hover, got none');
        assert.ok(content.includes('LONG') && !content.includes('(Attribute)') && !content.includes('(Procedure)'),
            `Should resolve as the field itself, not an attribute/builtin card; got: ${content}`);
    });

    test('hovering a GROUP field declaration notes which GROUP it belongs to, as ONE accurate line', async () => {
        // The declaration-line fast path returns a plain local-variable SymbolInfo
        // with no structural context, so its hover looked identical to a genuinely
        // standalone variable — unlike the dotted USE(Filter.Flag) reference, which
        // already says "Filter Field: Flag". Reported live by the developer after
        // the declaration-hover fix landed.
        //
        // First attempt showed BOTH "Local procedure variable" and "Field of GROUP
        // Filter" as two adjacent lines — the developer asked whether that was even
        // correct. It wasn't: `Flag` isn't itself a variable at all (it has no
        // independent existence — it's an offset into `Filter`'s storage), so
        // calling it "a local procedure variable" is a category error; the
        // procedure-local-ness belongs to `Filter`. Fixed to state one accurate
        // combined line instead of two adjacent, partially-wrong claims.
        const doc = TextDocument.create('test://group-field-parent-note.clw', 'clarion', 1, code);
        tokenCache.getTokens(doc);

        const hover = hoverText(await provider.provideHover(doc, Position.create(7, 2))); // "Flag      LONG"
        assert.ok(hover.includes('Field of local procedure GROUP') && hover.includes('Filter'),
            `Should note Flag is a field of the local procedure GROUP Filter; got: ${hover}`);
        assert.ok(!hover.includes('Local procedure variable'),
            `Should not ALSO claim Flag is itself "a local procedure variable" — that's Filter, not Flag; got: ${hover}`);
    });

    test('negative sentinel — a plain top-level variable declaration gets no "Field of" note', async () => {
        const doc = TextDocument.create('test://plain-variable-no-note.clw', 'clarion', 1, code);
        tokenCache.getTokens(doc);

        const hover = hoverText(await provider.provideHover(doc, Position.create(2, 2))); // top-level "Order"
        assert.ok(!hover.includes('Field of'),
            `A plain top-level variable must not show a "Field of" note; got: ${hover}`);
    });

    test('hovering GROUP field "Flag" (no name collision) resolves to itself', async () => {
        const doc = TextDocument.create('test://group-flag-field.clw', 'clarion', 1, code);
        tokenCache.getTokens(doc);

        const hover = await provider.provideHover(doc, Position.create(7, 2)); // "Flag      LONG"
        const content = hoverText(hover);
        assert.ok(content.includes('LONG'), `Should resolve the Flag field itself; got: ${content}`);
    });

    test('hovering GROUP field "Integer" (no name collision) resolves to itself', async () => {
        const doc = TextDocument.create('test://group-integer-field.clw', 'clarion', 1, code);
        tokenCache.getTokens(doc);

        const hover = await provider.provideHover(doc, Position.create(8, 2)); // "Integer   LONG"
        const content = hoverText(hover);
        assert.ok(content.includes('LONG'), `Should resolve the Integer field itself; got: ${content}`);
    });

    test('negative sentinel — the top-level Name/Order declarations still resolve to themselves', async () => {
        const doc = TextDocument.create('test://toplevel-sentinels.clw', 'clarion', 1, code);
        tokenCache.getTokens(doc);

        const nameHover = hoverText(await provider.provideHover(doc, Position.create(3, 2))); // top-level Name
        assert.ok(nameHover.includes('STRING'), `Top-level Name must still resolve as STRING; got: ${nameHover}`);

        const orderHover = hoverText(await provider.provideHover(doc, Position.create(2, 2))); // Order
        assert.ok(orderHover.includes('LONG'), `Order must still resolve as LONG; got: ${orderHover}`);
    });

    test('negative sentinel — a bare (dotted) reference to Filter.Name via USE(...) still resolves to the GROUP field', async () => {
        const codeWithUse = [
            code.slice(0, code.indexOf('CODE')),
            "Window WINDOW('Caption'),AT(,,119,93)",
            "  CHECK('c1'),AT(10,14),USE(Filter.Name)",
            'END',
            '',
            'CODE',
            '  RETURN',
        ].join('\n');
        const doc = TextDocument.create('test://dotted-reference-sentinel.clw', 'clarion', 1, codeWithUse);
        tokenCache.getTokens(doc);

        const lines = codeWithUse.split('\n');
        const useLine = lines.findIndex(l => l.includes('USE(Filter.Name)'));
        const nameCol = lines[useLine].indexOf('Filter.Name') + 'Filter.'.length;

        const hover = hoverText(await provider.provideHover(doc, Position.create(useLine, nameCol + 1)));
        assert.ok(hover.includes('Filter Field') && hover.includes('LONG'),
            `Dotted Filter.Name reference must still resolve to the GROUP field; got: ${hover}`);
    });
});
