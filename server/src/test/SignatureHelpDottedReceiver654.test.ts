/**
 * #654 (#609 phase 4: "hover, F12, then references and signature help consume it") — signature
 * help reads an `obj.Method(` receiver the way hover and Go to Definition read it, through
 * MemberLocatorService.resolveReceiverAt (#651).
 *
 * It asked resolveVariableType, which reads a local `ThisWindow CLASS(BaseAlpha)` as a variable of
 * type BaseAlpha (the #642 shape), so a method the local class declares itself had no signature;
 * and it had no PARENT branch at all, so `PARENT.Method(` looked for a variable named PARENT.
 */
import * as assert from 'assert';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { TokenCache } from '../TokenCache';
import { SignatureHelpProvider } from '../providers/SignatureHelpProvider';
import { setServerInitialized } from '../serverState';

const LINES = [
    '  MEMBER()',                                   // 0
    '  MAP',                                        // 1
    '  END',                                        // 2
    'BaseAlpha  CLASS,TYPE',                        // 3
    'AlphaOnly    PROCEDURE(LONG pAlpha)',          // 4
    'Init         PROCEDURE()',                     // 5
    '           END',                               // 6
    'Caller PROCEDURE()',                           // 7
    'ThisWindow   CLASS(BaseAlpha)',                // 8
    'LocalOnly      PROCEDURE(STRING pLocal)',      // 9
    'Init           PROCEDURE(),DERIVED',           // 10
    '             END',                             // 11
    'Plain      BaseAlpha',                         // 12
    '  CODE',                                       // 13
    '  Plain.AlphaOnly(',                           // 14  control
    '  ThisWindow.LocalOnly(',                      // 15
    'ThisWindow.Init PROCEDURE()',                  // 16
    '  CODE',                                       // 17
    '  PARENT.AlphaOnly(',                          // 18
];

suite('Signature help reads the receiver as hover and F12 do (#654)', () => {
    let doc: TextDocument;

    setup(() => {
        setServerInitialized(true);
        TokenCache.getInstance().clearAllTokens();
        doc = TextDocument.create('file:///c:/test654/sighelp.clw', 'clarion', 1, LINES.join('\r\n'));
        TokenCache.getInstance().getTokens(doc);
    });

    async function labelsAt(line: number): Promise<string[]> {
        const r = await new SignatureHelpProvider().provideSignatureHelp(doc, { line, character: LINES[line].length });
        return (r?.signatures ?? []).map(s => s.label);
    }

    test('CONTROL: a variable of the class type', async () => {
        const labels = await labelsAt(14);
        assert.ok(labels.some(l => /pAlpha/.test(l)), `got [${labels.join(' | ')}]`);
    });

    test('a method the local CLASS(Parent) declares itself', async () => {
        const labels = await labelsAt(15);
        assert.ok(labels.some(l => /pLocal/.test(l)), `got [${labels.join(' | ')}]`);
    });

    test('PARENT.Method( in a method of the local class', async () => {
        const labels = await labelsAt(18);
        assert.ok(labels.some(l => /pAlpha/.test(l)), `got [${labels.join(' | ')}]`);
    });
});
