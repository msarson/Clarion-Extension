import * as assert from 'assert';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { TokenCache } from '../TokenCache';
import { SignatureHelpProvider } from '../providers/SignatureHelpProvider';

/**
 * Issue #242 — signature help highlights the type-matching overload as you type, using the
 * same argument inference as hover / go-to-definition (literals, EQUATE #240, implicit vars
 * #241, and typed variables). Two overloads that differ only by parameter TYPE, so the pick
 * is driven purely by the argument's inferred type.
 */
let n = 0;

// MAP with two same-arity Set overloads: index 0 = (LONG), index 1 = (STRING).
function activeSigFor(callExpr: string): Promise<{ activeSignature: number; count: number } | null> {
    const src = [
        '  PROGRAM',
        '  MAP',
        'MySet PROCEDURE(LONG value)',
        'MySet PROCEDURE(STRING value)',
        '  END',
        '',
        'MaxRows  EQUATE(100)',
        'myStr    STRING(20)',
        '',
        '  CODE',
        '  ' + callExpr,        // line 10 — call site; cursor at end of line
        '  RETURN',
    ].join('\n');
    const doc = TextDocument.create(`file:///sighelp-typed-${++n}.clw`, 'clarion', 1, src);
    TokenCache.getInstance().getTokens(doc); // prime cache (provider uses cached tokens)
    const provider = new SignatureHelpProvider();
    const cursor = { line: 10, character: ('  ' + callExpr).length };
    return provider.provideSignatureHelp(doc, cursor).then(r =>
        r ? { activeSignature: r.activeSignature as number, count: r.signatures.length } : null);
}

suite('SignatureHelpProvider — type-matching active overload (#242)', () => {
    teardown(() => TokenCache.getInstance().clearAllTokens());

    test('enumerates both overloads', async () => {
        const r = await activeSigFor('MySet(MaxRows');
        assert.ok(r && r.count >= 2, `expected >=2 overloads, got ${r?.count}`);
    });

    test('EQUATE arg (MaxRows=100) highlights the LONG overload (index 0)', async () => {
        const r = await activeSigFor('MySet(MaxRows');
        assert.strictEqual(r!.activeSignature, 0);
    });

    test('implicit LONG (Counter#) highlights the LONG overload (index 0)', async () => {
        const r = await activeSigFor('MySet(Counter#');
        assert.strictEqual(r!.activeSignature, 0);
    });

    test('implicit STRING (Address") highlights the STRING overload (index 1)', async () => {
        const r = await activeSigFor('MySet(Address"');
        assert.strictEqual(r!.activeSignature, 1);
    });

    test('string literal highlights the STRING overload (index 1)', async () => {
        const r = await activeSigFor("MySet('hello'");
        assert.strictEqual(r!.activeSignature, 1);
    });

    test('typed STRING variable (myStr) highlights the STRING overload (index 1)', async () => {
        const r = await activeSigFor('MySet(myStr');
        assert.strictEqual(r!.activeSignature, 1);
    });
});
