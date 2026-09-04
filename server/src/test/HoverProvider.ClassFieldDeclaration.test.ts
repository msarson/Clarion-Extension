import * as assert from 'assert';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Position } from 'vscode-languageserver-protocol';
import { HoverProvider } from '../providers/HoverProvider';
import { TokenCache } from '../TokenCache';

// TokenHelper.getEnclosingDataStructure (added for GROUP/QUEUE fields — see
// HoverProvider.GroupFieldDeclaration.test.ts) only recognized
// QUEUE/GROUP/FILE/RECORD/VIEW/REPORT as a "field of X" container. A CLASS
// property's own declaration line fell through the same generic fallback a
// bare top-level variable gets, mislabeling it "Local procedure variable"
// instead of noting it belongs to the class. Method declarations were
// already unaffected — they route through a separate "Method Declaration:"
// formatter, not this one.
//
// Real repro (found live):
//   MyOwn:CLASS   CLASS
//   my:Value        ULONG
//   My:My:Method    PROCEDURE(),LONG
//                 END
//
// Hovering my:Value's own declaration showed "🔧 Local procedure variable"
// instead of noting it's a field of MyOwn:CLASS.
suite('HoverProvider — declaring a property inside a local CLASS', () => {
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
        'MyClass   CLASS',
        'my:Value        ULONG',
        'DoWork          PROCEDURE(),LONG',
        '              END',
        '',
        'CODE',
        '  RETURN',
    ].join('\n');

    test('hovering a CLASS property declaration notes which CLASS it belongs to, not "Local procedure variable"', async () => {
        const doc = TextDocument.create('test://class-property-parent-note.clw', 'clarion', 1, code);
        tokenCache.getTokens(doc);

        const hover = hoverText(await provider.provideHover(doc, Position.create(3, 2))); // "my:Value        ULONG"
        assert.ok(hover.includes('Field of local procedure CLASS') && hover.includes('MyClass'),
            `Should note my:Value is a field of the local procedure CLASS MyClass; got: ${hover}`);
        assert.ok(!hover.includes('Local procedure variable'),
            `Should not claim my:Value is itself "a local procedure variable"; got: ${hover}`);
        assert.ok(hover.includes('ULONG'), `Should still show the field's own type; got: ${hover}`);
    });

    test('negative sentinel — hovering the CLASS METHOD declaration is unaffected (routes through Method Declaration formatter)', async () => {
        const doc = TextDocument.create('test://class-method-declaration-sentinel.clw', 'clarion', 1, code);
        tokenCache.getTokens(doc);

        const hover = hoverText(await provider.provideHover(doc, Position.create(4, 2))); // "DoWork          PROCEDURE(),LONG"
        assert.ok(hover.includes('Method Declaration') && hover.includes('MyClass.DoWork'),
            `Method declaration hover should be unaffected by this fix; got: ${hover}`);
        assert.ok(!hover.includes('Field of'),
            `Method declaration should not get a "Field of" note; got: ${hover}`);
    });
});
