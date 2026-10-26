/**
 * Signature help for a class method showed `<Type Name>` as `Type Name` and dropped `= default`,
 * so an omittable parameter read as a required one. Class members reach createSignatureInformation
 * as a raw signature line, which went through a regex that stripped both; they now go through
 * ProcedureParameterParser like tokenized procedures do.
 */
import * as assert from 'assert';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { TokenCache } from '../TokenCache';
import { SignatureHelpProvider } from '../providers/SignatureHelpProvider';
import { setServerInitialized } from '../serverState';

const LINES = [
    '  MEMBER()',                                                                                         // 0
    '  MAP',                                                                                              // 1
    '  END',                                                                                              // 2
    'InfoGroup  GROUP,TYPE',                                                                              // 3
    'Count        LONG',                                                                                  // 4
    '           END',                                                                                     // 5
    'Loader     CLASS,TYPE',                                                                              // 6
    'Load         PROCEDURE(*STRING pData, STRING pPassword, <*InfoGroup pInfo>, LONG pMode=1),LONG',     // 7
    'Load         PROCEDURE(*STRING pData, <*InfoGroup pInfo>, LONG pMode=1),LONG',                       // 8
    '           END',                                                                                     // 9
    'Caller PROCEDURE()',                                                                                 // 10
    'L          Loader',                                                                                  // 11
    'S          STRING(20)',                                                                              // 12
    '  CODE',                                                                                             // 13
    '  L.Load(',                                                                                          // 14
];

suite('Signature help keeps optional markers and defaults of class methods', () => {
    let doc: TextDocument;

    setup(() => {
        setServerInitialized(true);
        TokenCache.getInstance().clearAllTokens();
        doc = TextDocument.create('file:///c:/testoptional/sighelp.clw', 'clarion', 1, LINES.join('\r\n'));
        TokenCache.getInstance().getTokens(doc);
    });

    async function labelsAt(line: number): Promise<string[]> {
        const r = await new SignatureHelpProvider().provideSignatureHelp(doc, { line, character: LINES[line].length });
        return (r?.signatures ?? []).map(s => s.label);
    }

    test('both overloads show <...> around an omittable parameter and its default', async () => {
        const labels = await labelsAt(14);
        assert.ok(labels.includes('Load(*STRING pData, STRING pPassword, <*InfoGroup pInfo>, LONG pMode=1)'),
            `got [${labels.join(' | ')}]`);
        assert.ok(labels.includes('Load(*STRING pData, <*InfoGroup pInfo>, LONG pMode=1)'),
            `got [${labels.join(' | ')}]`);
    });

    test('each parameter label is a substring of the signature label (active-parameter highlight)', async () => {
        const r = await new SignatureHelpProvider().provideSignatureHelp(doc, { line: 14, character: LINES[14].length });
        for (const s of r?.signatures ?? []) {
            for (const p of s.parameters ?? []) {
                assert.ok(typeof p.label === 'string' && s.label.includes(p.label), `${p.label} not in ${s.label}`);
            }
        }
    });
});
