import * as assert from 'assert';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { CompletionProvider } from '../providers/CompletionProvider';
import { TokenCache } from '../TokenCache';
import { setServerInitialized } from '../serverState';

// #505: dot completion on a FILE label (`Orders.`) offered nothing, while `ORD:` and
// a GROUP label's dot did. `File.Field` is compiler-verified dot notation
// (test-programs/ViewJoinTest, ViewDotted).

const FILE_LINES = [
    '  PROGRAM',
    'Orders  FILE,DRIVER(\'TOPSPEED\'),PRE(ORD),CREATE,THREAD',
    'OrdKey    KEY(ORD:ID),NOCASE,OPT',
    'Record    RECORD,PRE()',
    'ID          LONG',
    'CusID       LONG',
    'Total       DECIMAL(9,2)',
    '          END',
    '        END',
    '  CODE',
];

let n = 0;
async function complete(typed: string) {
    const lines = [...FILE_LINES, typed];
    const doc = TextDocument.create(`file:///C:/temp/filedot-${++n}.clw`, 'clarion', 1, lines.join('\n'));
    const cache = TokenCache.getInstance();
    cache.clearAllTokens();
    cache.getTokens(doc);
    const isDot = typed.endsWith('.');
    const params = {
        textDocument: { uri: doc.uri },
        position: { line: FILE_LINES.length, character: typed.length },
        context: isDot ? { triggerKind: 2, triggerCharacter: '.' } : { triggerKind: 1 }
    } as any;
    return new CompletionProvider().onCompletion(params, doc);
}

suite('#505 dot completion on a FILE label', () => {
    setup(() => setServerInitialized(true));

    test('Orders. offers the PRE-qualified field set, inserting the field name', async () => {
        const items = await complete('  Orders.');
        const labels = items.map(i => String(i.label)).sort();
        assert.deepStrictEqual(labels, ['ORD:CusID', 'ORD:ID', 'ORD:OrdKey', 'ORD:Record', 'ORD:Total']);
        assert.strictEqual(items.find(i => i.label === 'ORD:ID')?.insertText, 'ID');
    });

    test('Orders.C narrows the same list', async () => {
        const items = await complete('  Orders.C');
        const labels = items.map(i => String(i.label)).sort();
        assert.deepStrictEqual(labels, ['ORD:CusID']);
    });

    test('a label that is not a structure still offers nothing', async () => {
        const items = await complete('  Nothing.');
        assert.strictEqual(items.length, 0);
    });
});
