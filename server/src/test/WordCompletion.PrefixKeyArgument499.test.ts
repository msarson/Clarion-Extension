import * as assert from 'assert';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { WordCompletionProvider } from '../providers/WordCompletionProvider';
import { TokenCache } from '../TokenCache';
import { ScopeAnalyzer } from '../utils/ScopeAnalyzer';
import { SolutionManager } from '../solution/solutionManager';

// #499: prefix completion after `ORD:` on a FILE whose KEY is declared KEY(ORD:ID)
// offered ORD:ORD (the PRE(ORD) argument on the header line) and ORD:ORD:ID (the
// KEY's argument read as a field label), and the double form then suppressed the
// genuine ORD:ID. A structure line contributes a prefixed field only through its
// column-0 label.

let n = 0;
function makeDoc(content: string): TextDocument {
    return TextDocument.create(`file:///test-499-${++n}.clw`, 'clarion', 1, content);
}
function makeProvider(document: TextDocument): WordCompletionProvider {
    const cache = TokenCache.getInstance();
    cache.getTokens(document);
    return new WordCompletionProvider(cache, new ScopeAnalyzer(cache, SolutionManager.getInstance()));
}

suite('#499 prefix completion on a FILE with KEY(PRE:Field)', () => {

    const FILE_LINES = [
        '  PROGRAM',
        'Orders  FILE,DRIVER(\'TOPSPEED\'),PRE(ORD),CREATE,THREAD',
        'OrdKey    KEY(ORD:ID),NOCASE,OPT',
        'CusKey    KEY(ORD:CusID,ORD:ID),DUP,NOCASE',
        'Record    RECORD,PRE()',
        'ID          LONG',
        'CusID       LONG',
        'Total       DECIMAL(9,2)',
        '          END',
        '        END',
        '  CODE',
        '  ORD:',
    ];

    test('offers the fields and keys by label, nothing from the header or the KEY arguments', async () => {
        const doc = makeDoc(FILE_LINES.join('\n'));
        const items = await makeProvider(doc).provide(doc, { line: 11, character: 6 }, 'ORD:');
        const labels = items.map(i => String(i.label)).sort();

        for (const want of ['ORD:ID', 'ORD:CusID', 'ORD:Total', 'ORD:OrdKey', 'ORD:CusKey', 'ORD:Record']) {
            assert.ok(labels.includes(want), `expected ${want} in: ${labels.join(', ')}`);
        }
        for (const bad of ['ORD:ORD', 'ORD:ORD:ID', 'ORD:ORD:CusID', 'ORD:OPT', 'ORD:NOCASE', 'ORD:DUP']) {
            assert.ok(!labels.includes(bad), `did not expect ${bad} in: ${labels.join(', ')}`);
        }
        const id = items.find(i => i.label === 'ORD:ID');
        assert.strictEqual(id?.insertText, 'ID');
    });

    test('a typed partial after the prefix narrows the same list', async () => {
        const lines = [...FILE_LINES];
        lines[11] = '  ORD:C';
        const doc = makeDoc(lines.join('\n'));
        const items = await makeProvider(doc).provide(doc, { line: 11, character: 7 }, 'ORD:C');
        const labels = items.map(i => String(i.label)).sort();
        assert.deepStrictEqual(labels, ['ORD:CusID', 'ORD:CusKey']);
    });

    test('a column-0 label that itself carries a colon still completes in its nested form', async () => {
        const doc = makeDoc([
            'MyProc PROCEDURE()',
            'TestGloGroup GROUP,PRE(TGLO)',
            'GLO:SessionId   STRING(20)',
            'Plain           LONG',
            'END',
            'CODE',
            '  TGLO:',
            'END',
        ].join('\n'));
        const items = await makeProvider(doc).provide(doc, { line: 6, character: 7 }, 'TGLO:');
        const labels = items.map(i => String(i.label)).sort();
        assert.deepStrictEqual(labels, ['TGLO:GLO:SessionId', 'TGLO:Plain']);
    });
});
