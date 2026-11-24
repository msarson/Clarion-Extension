import * as assert from 'assert';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Position } from 'vscode-languageserver-protocol';
import { HoverProvider } from '../providers/HoverProvider';
import { TokenCache } from '../TokenCache';
import { BuiltinFunctionService } from '../utils/BuiltinFunctionService';

/**
 * ERRORCODE and FILEERRORCODE had their return types swapped in clarion-builtins.json.
 * Language Reference: ERRORCODE() returns a LONG, zero when no error was posted;
 * FILEERRORCODE() returns a STRING holding the file driver's native error code, valid
 * only when ERRORCODE() = 90 or 47. The hover card on `IF ERRORCODE() = 0` said the
 * code came back "as a string" and was "empty string if no error".
 */
suite('ERRORCODE / FILEERRORCODE return types', () => {
    function docText(doc: unknown): string {
        if (typeof doc === 'string') return doc;
        return (doc as { value?: string } | undefined)?.value ?? '';
    }

    test('ERRORCODE() returns a LONG, zero when no error was posted', () => {
        const sigs = BuiltinFunctionService.getInstance().getSignatures('ERRORCODE');
        assert.strictEqual(sigs.length, 1);
        assert.strictEqual(sigs[0].label, 'ERRORCODE() → LONG');
        const doc = docText(sigs[0].documentation);
        assert.ok(/zero/i.test(doc), `expected "zero" in: ${doc}`);
        assert.ok(!/string/i.test(doc), `ERRORCODE's description must not call it a string: ${doc}`);
    });

    test('FILEERRORCODE() returns a STRING, valid after ERRORCODE() 90 or 47', () => {
        const sigs = BuiltinFunctionService.getInstance().getSignatures('FILEERRORCODE');
        assert.strictEqual(sigs.length, 1);
        assert.strictEqual(sigs[0].label, 'FILEERRORCODE() → STRING');
        const doc = docText(sigs[0].documentation);
        assert.ok(doc.includes('90') && doc.includes('47'), `expected the 90 / 47 condition in: ${doc}`);
    });

    test('hover on IF ERRORCODE() = 0 describes a code number, not a string', async () => {
        const provider = new HoverProvider();
        const tokenCache = TokenCache.getInstance();
        tokenCache.clearAllTokens();

        const code = `MyProc PROCEDURE()
CODE
  GET(SomeQ, SomeQ.Key)
  IF ERRORCODE() = 0
    RETURN
  END`;
        const doc = TextDocument.create('test://errorcode-return-type.clw', 'clarion', 1, code);
        tokenCache.getTokens(doc);

        const hover = await provider.provideHover(doc, Position.create(3, 8));
        assert.ok(hover, 'ERRORCODE should produce a hover');
        const contents = hover!.contents as { value?: string } | string;
        const content = typeof contents === 'string' ? contents : contents.value ?? '';
        assert.ok(content.includes('Built-in Function'), `expected the built-in card, got: ${content}`);
        assert.ok(/zero/i.test(content), `expected "zero" in the card: ${content}`);
        assert.ok(!/as a string|empty string/i.test(content), `the card still describes a string: ${content}`);

        tokenCache.clearAllTokens();
    });
});
