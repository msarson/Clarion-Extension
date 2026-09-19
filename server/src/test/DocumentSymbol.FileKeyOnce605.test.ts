/**
 * Structure view / workspace symbols: each KEY or INDEX of a FILE is one entry, named
 * like a field entry - `label KEY(components)` - with its attributes as the detail (#605).
 *
 * Two code paths built key entries: the FILE look-ahead (`KEY(components)`, no label)
 * and handleKeyToken (`KEY(label),(components),NAME,(,'x')`), so every KEY was listed
 * twice and neither entry could be found by the key's own label. An INDEX got only the
 * first form.
 */
import * as assert from 'assert';
import { SymbolKind } from 'vscode-languageserver-types';
import { ClarionTokenizer } from '../ClarionTokenizer';
import { ClarionDocumentSymbolProvider, ClarionDocumentSymbol } from '../providers/ClarionDocumentSymbolProvider';
import { setServerInitialized } from '../serverState';

const SOURCE = [
    '  PROGRAM',                                                                       // 0
    '  MAP',                                                                           // 1
    '  END',                                                                           // 2
    "RSNTRNS  FILE,DRIVER('ODBC'),PRE(RSNP),CREATE",                                   // 3
    "PrimaryKey   KEY(RSNP:Record_ID),NAME('RSNTRNS.PrimaryKey'),NOCASE,PRIMARY",      // 4
    'Key          KEY(RSNP:Tx_No,RSNP:SeqNum),DUP,NOCASE  ! by transaction',           // 5
    'BySeq        INDEX(RSNP:SeqNum)',                                                 // 6
    'Record       RECORD,PRE()',                                                       // 7
    'Record_ID      LONG',                                                             // 8
    'Tx_No          STRING(20)',                                                       // 9
    'SeqNum         LONG',                                                             // 10
    '             END',                                                                // 11
    '           END',                                                                  // 12
    '  CODE',                                                                          // 13
].join('\r\n');

suite('Structure view: each FILE key is one entry, named by its label (#605)', () => {
    setup(() => setServerInitialized(true));

    test('keys and indexes: one entry each, label first, attributes as detail', () => {
        const tokens = new ClarionTokenizer(SOURCE).tokenize();
        const symbols = new ClarionDocumentSymbolProvider().provideDocumentSymbols(tokens, 'test://rsntrns.clw');
        const file = symbols.find(s => s.name.startsWith('FILE (RSNTRNS)'));
        assert.ok(file, `no FILE symbol; got ${JSON.stringify(symbols.map(s => s.name))}`);
        const keys = ((file!.children ?? []) as ClarionDocumentSymbol[])
            .filter(s => !s.name.startsWith('RECORD'))
            .map(s => ({ name: s.name, detail: s.detail, kind: s.kind, line: s.range.start.line }));
        assert.deepStrictEqual(keys, [
            { name: 'PrimaryKey KEY(RSNP:Record_ID)', detail: "NAME('RSNTRNS.PrimaryKey'),NOCASE,PRIMARY", kind: SymbolKind.Key, line: 4 },
            { name: 'Key KEY(RSNP:Tx_No,RSNP:SeqNum)', detail: 'DUP,NOCASE', kind: SymbolKind.Key, line: 5 },
            { name: 'BySeq INDEX(RSNP:SeqNum)', detail: '', kind: SymbolKind.Field, line: 6 },
        ]);
    });

    test('KEY as a prototype parameter type adds no entry', () => {
        const src = [
            '  MEMBER()',
            '  MAP',
            '    DoSeek(FILE f, KEY k)',
            '  END',
        ].join('\r\n');
        const tokens = new ClarionTokenizer(src).tokenize();
        const symbols = new ClarionDocumentSymbolProvider().provideDocumentSymbols(tokens, 'test://seek.clw');
        const flat: ClarionDocumentSymbol[] = [];
        (function walk(ss: ClarionDocumentSymbol[]) { for (const s of ss) { flat.push(s); walk((s.children ?? []) as ClarionDocumentSymbol[]); } })(symbols);
        assert.deepStrictEqual(flat.filter(s => s.kind === SymbolKind.Key).map(s => s.name), []);
    });
});
