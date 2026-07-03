import * as assert from 'assert';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Position } from 'vscode-languageserver-protocol';
import { HoverProvider } from '../providers/HoverProvider';
import { TokenCache } from '../TokenCache';

suite('HoverProvider — CLIP hover routing', () => {
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
        return typeof hover.contents === 'string'
            ? hover.contents
            : 'value' in hover.contents ? hover.contents.value : '';
    }

    test('resolves CLIP() as a builtin function in expressions', async () => {
        const code = `MyProc PROCEDURE()
CODE
  IF CLIP(LOC:EnrolCode) = ''
    RETURN
  END`;
        const doc = TextDocument.create('test://clip-builtin.clw', 'clarion', 1, code);
        tokenCache.getTokens(doc);

        const hover = await provider.provideHover(doc, Position.create(2, 5));

        assert.ok(hover, 'Should provide hover info');
        const content = hoverText(hover);
        assert.ok(content.includes('Built-in Function: CLIP'), 'Should show builtin CLIP hover');
        assert.ok(!content.includes('OLE control attribute'), 'Should not show attribute hover in expression context');
    });

    test('resolves CLIP as an attribute in a control declaration', async () => {
        const code = `MyWindow WINDOW
  OLECtrl OLE,AT(0,0,100,100),CLIP
END`;
        const doc = TextDocument.create('test://clip-attribute.clw', 'clarion', 1, code);
        tokenCache.getTokens(doc);

        const hover = await provider.provideHover(doc, Position.create(1, 30));

        assert.ok(hover, 'Should provide hover info');
        const content = hoverText(hover);
        assert.ok(content.includes('Attribute: CLIP'), 'Should show attribute hover in declaration context');
        assert.ok(content.includes('OLE control attribute'), 'Should show the attribute description');
    });
});
