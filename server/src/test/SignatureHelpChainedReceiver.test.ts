/**
 * Signature help for a call on a chained receiver: `Request.Payload.KeepOnly(` where `Payload` is a
 * `&TextClass` field of a local GROUP, and `Holder.Item.KeepOnly(` where `Item` is a property of a
 * local CLASS.
 *
 * parseMethodCall kept only the last segment before the method as the receiver (`Payload`), which
 * names no variable on its own, so a call through any chain showed no parameters at all. The prefix
 * is now the whole chain, walked to its last segment's class as hover and Go to Definition walk it.
 */
import * as assert from 'assert';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { TokenCache } from '../TokenCache';
import { SignatureHelpProvider } from '../providers/SignatureHelpProvider';
import { setServerInitialized } from '../serverState';
import { createDiskSolution, DiskSolution } from './support/diskSolutionFixture';

const INC = [
    "TextClass  CLASS,TYPE,MODULE('TextClass.clw')", // 0
    'KeepOnly     PROCEDURE(STRING pChars)',         // 1
    'KeepOnly     PROCEDURE(STRING pChars, LONG pFlags)', // 2
    '           END',                                // 3
];

const CLW = [
    '  MEMBER()',                           // 0
    "  INCLUDE('classes.inc')",            // 1
    '  MAP',                                // 2
    '  END',                                // 3
    'SomeProc PROCEDURE',                   // 4
    'Request      GROUP',                   // 5
    'Payload        &TextClass',            // 6
    '             END',                     // 7
    'Holder       CLASS',                   // 8
    'Item           &TextClass',            // 9
    '             END',                     // 10
    'Direct     &TextClass',                // 11
    '  CODE',                               // 12
    '  Direct.KeepOnly(',                   // 13
    '  Request.Payload.KeepOnly(',          // 14
    "  Holder.Item.KeepOnly('x', ",         // 15
    '  Request.Missing.KeepOnly(',          // 16
];

suite('Signature help on a chained receiver', () => {
    let fx: DiskSolution;
    let doc: TextDocument;

    suiteSetup(() => {
        setServerInitialized(true);
        fx = createDiskSolution({ 'classes.inc': INC, 'caller.clw': CLW });
        doc = fx.open('caller.clw');
        TokenCache.getInstance().getTokens(doc);
    });
    suiteTeardown(() => fx.dispose());

    async function at(line: number) {
        return new SignatureHelpProvider().provideSignatureHelp(doc, { line, character: CLW[line].length });
    }
    const labels = (r: Awaited<ReturnType<typeof at>>) => (r?.signatures ?? []).map(s => String(s.label));

    test('CONTROL: a plain reference variable lists both overloads', async function () {
        this.timeout(10000);
        assert.deepStrictEqual(labels(await at(13)), ['KeepOnly(STRING pChars)', 'KeepOnly(STRING pChars, LONG pFlags)']);
    });

    test('a field of a local GROUP lists the overloads of its class', async function () {
        this.timeout(10000);
        assert.deepStrictEqual(labels(await at(14)), ['KeepOnly(STRING pChars)', 'KeepOnly(STRING pChars, LONG pFlags)']);
    });

    test('a property of a local CLASS lists them too, the second argument picking the two-parameter one', async function () {
        this.timeout(10000);
        const r = await at(15);
        assert.deepStrictEqual(labels(r), ['KeepOnly(STRING pChars)', 'KeepOnly(STRING pChars, LONG pFlags)']);
        assert.strictEqual(r?.activeParameter, 1);
        assert.strictEqual(r?.activeSignature, 1);
    });

    test('a chain through a field that does not exist shows nothing', async function () {
        this.timeout(10000);
        assert.strictEqual(await at(16), null);
    });
});
