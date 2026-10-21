import * as assert from 'assert';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { SignatureInformation } from 'vscode-languageserver/node';
import { SignatureHelpProvider } from '../providers/SignatureHelpProvider';
import { TokenCache } from '../TokenCache';
import { AttributeService } from '../utils/AttributeService';

/**
 * #748 — inside the brackets of a KEY declaration in a FILE (`MyKey KEY(`), signature help showed
 * the window control attribute `KEY(keycode)`, described as "Sets param1". The brackets of a KEY,
 * INDEX or MEMO declaration hold that declaration's own parameters (#746 fileStructures): the
 * components of a KEY or INDEX, the size of a MEMO, which the compiler requires.
 */

const LINES = [
    '  PROGRAM', '',
    "MyFile FILE,DRIVER('TOPSPEED'),CREATE,PRE(MFI)",
    'MyKey KEY(MFI:Field1,',
    'MyNdx INDEX(',
    'Notes MEMO(',
    'RECORD  RECORD',
    'Field1  STRING(20)',
    '      END',
    '     END', '',
    "MyWin WINDOW('T'),AT(,,100,100)",
    "  BUTTON('x'),KEY(",
    "  BUTTON('y'),ALRT(",
    '  END',
    '  MAP', '  END', '  CODE', '  RETURN', ''];

let counter = 0;

/** The active signature with the cursor right after `needle` on the line holding it. */
async function signatureAfter(needle: string): Promise<SignatureInformation | undefined> {
    const doc = TextDocument.create(`file:///C:/temp/sig748-${++counter}.clw`, 'clarion', 1, LINES.join('\r\n'));
    TokenCache.getInstance().getTokens(doc);
    const line = LINES.findIndex(l => l.includes(needle));
    assert.ok(line >= 0, `no line holds ${needle}`);
    const help = await new SignatureHelpProvider().provideSignatureHelp(doc, { line, character: LINES[line].indexOf(needle) + needle.length });
    return help?.signatures?.[help.activeSignature ?? 0];
}

const text = (doc: SignatureInformation['documentation']) => typeof doc === 'string' ? doc : doc?.value ?? '';

suite('Signature help inside a FILE declaration\'s brackets (#748)', () => {
    test('KEY( in a FILE shows the KEY declaration, not the control attribute', async () => {
        const sig = await signatureAfter('KEY(MFI:Field1,');
        assert.ok(sig, 'no signature');
        assert.ok(/^KEY\(component/.test(sig!.label), sig!.label);
        assert.ok(!/keycode/i.test(sig!.label) && !/param1/.test(text(sig!.documentation)), JSON.stringify(sig));
    });

    test('INDEX( in a FILE shows the INDEX declaration, its components optional', async () => {
        const sig = await signatureAfter('INDEX(');
        assert.ok(sig, 'no signature');
        assert.ok(/^INDEX\(\[component/.test(sig!.label), sig!.label);
    });

    test('MEMO( in a FILE shows its size as required', async () => {
        const sig = await signatureAfter('MEMO(');
        assert.ok(sig, 'no signature');
        assert.strictEqual(sig!.label, 'MEMO(length)');
    });

    test('an attribute on the FILE line keeps its own signature', async () => {
        const sig = await signatureAfter("DRIVER(");
        assert.ok(sig && /^DRIVER\(/.test(sig.label), JSON.stringify(sig));
    });

    test('KEY( and ALRT( on a control keep the attribute, with a real description', async () => {
        for (const needle of ['),KEY(', '),ALRT(']) {
            const sig = await signatureAfter(needle);
            assert.ok(sig && /keycode/i.test(sig.label), `${needle}: ${JSON.stringify(sig)}`);
            assert.ok(!/param1/.test(text(sig!.documentation)) && !/param1/.test(JSON.stringify(sig!.parameters)), `${needle}: ${JSON.stringify(sig)}`);
        }
    });

    test('no attribute signature is described with a placeholder', () => {
        const placeholders = AttributeService.getInstance().getAllAttributes()
            .filter(a => (a.signatures ?? []).some(s => /^Sets param\d/.test(s.description ?? '')))
            .map(a => a.name);
        assert.deepStrictEqual(placeholders, []);
    });
});
