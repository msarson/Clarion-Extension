/**
 * Structure view / workspace symbols: a label or a field reference spelled like the
 * KEY, INDEX, PROJECT or JOIN keyword must not be read as that keyword (#604).
 *
 * Reported by Bill Atchison on a dictionary-generated FILE whose KEY is labelled `Key`:
 * the FILE's look-ahead matched the label, started the paren scan one token early, and
 * the unbalanced scan ran to the end of the file - 158 symbol names over 100,000
 * characters in one workspace/symbol reply. A RECORD field labelled `Key` or `Index`,
 * and a VIEW's `PROJECT(Project)`, took the same path.
 */
import * as assert from 'assert';
import { ClarionTokenizer } from '../ClarionTokenizer';
import { ClarionDocumentSymbolProvider, ClarionDocumentSymbol } from '../providers/ClarionDocumentSymbolProvider';
import { setServerInitialized } from '../serverState';

const LINES = [
    '  PROGRAM',                                                                       // 0
    '  MAP',                                                                           // 1
    '  END',                                                                           // 2
    "RSNTRNS  FILE,DRIVER('ODBC'),PRE(RSNP),BINDABLE,CREATE,THREAD",                   // 3
    "PrimaryKey   KEY(RSNP:Record_ID),NAME('RSNTRNS.PrimaryKey'),NOCASE,PRIMARY",      // 4
    "Key          KEY(RSNP:Tx_No,RSNP:SeqNum),DUP,NAME('RSNP_Key'),NOCASE",            // 5 — KEY labelled Key
    'Index        INDEX(RSNP:SeqNum)',                                                 // 6 — INDEX labelled Index
    'Record       RECORD,PRE()',                                                       // 7
    'Record_ID      LONG',                                                             // 8
    'Tx_No          STRING(20)',                                                       // 9
    'Key            STRING(10)',                                                       // 10 — field labelled Key
    'Index          LONG',                                                             // 11 — field labelled Index
    'Project        CSTRING(31)',                                                      // 12
    'Join           BYTE',                                                             // 13
    'SeqNum         LONG',                                                             // 14
    '             END',                                                                // 15
    '           END',                                                                  // 16
    'BRW  VIEW(RSNTRNS)',                                                              // 17
    '       PROJECT(RSNP:Tx_No)',                                                      // 18
    '       PROJECT(Project)',                                                         // 19 — reference spelled PROJECT
    '     END',                                                                        // 20
    'Tail  LONG',                                                                      // 21
    '  CODE',                                                                          // 22
];
const SOURCE = LINES.join('\r\n');
const LONGEST_LINE = Math.max(...LINES.map(l => l.length));

function flatten(symbols: ClarionDocumentSymbol[], out: ClarionDocumentSymbol[] = []): ClarionDocumentSymbol[] {
    for (const s of symbols) { out.push(s); if (s.children) flatten(s.children as ClarionDocumentSymbol[], out); }
    return out;
}

function childrenOf(all: ClarionDocumentSymbol[], namePrefix: string): ClarionDocumentSymbol[] {
    const parent = all.find(s => s.name.startsWith(namePrefix));
    assert.ok(parent, `no symbol starting with ${namePrefix}; got ${JSON.stringify(all.map(s => s.name))}`);
    return (parent!.children ?? []) as ClarionDocumentSymbol[];
}

suite('Structure view: labels and references spelled like KEY/INDEX/PROJECT/JOIN (#604)', () => {
    setup(() => setServerInitialized(true));

    function symbols(): ClarionDocumentSymbol[] {
        const tokens = new ClarionTokenizer(SOURCE).tokenize();
        return flatten(new ClarionDocumentSymbolProvider().provideDocumentSymbols(tokens, 'test://rsntrns.clw'));
    }

    test('no symbol name runs past its own declaration line', () => {
        // Display names re-punctuate a line (the KEY entry spells `NAME,(,'x')`), so allow
        // headroom; the runaway names were the rest of the file, orders of magnitude longer.
        const giants = symbols().filter(s => s.name.length > 2 * LONGEST_LINE);
        assert.deepStrictEqual(giants.map(s => `${s.name.slice(0, 60)}…(${s.name.length})@${s.range.start.line}`), [],
            'a declaration name is built from one line; anything longer ran past its closing paren');
    });

    test('a KEY labelled Key and an INDEX labelled Index keep their own components', () => {
        const fileKids = childrenOf(symbols(), 'FILE (RSNTRNS)');
        const onLine = (line: number) => fileKids.filter(s => s.range.start.line === line).map(s => s.name);
        assert.ok(onLine(5).includes('KEY(RSNP:Tx_No,RSNP:SeqNum)'), `line 5: ${JSON.stringify(onLine(5))}`);
        assert.ok(onLine(6).includes('INDEX(RSNP:SeqNum)'), `line 6: ${JSON.stringify(onLine(6))}`);
        // The label must not add a second entry of its own that swallows the rest of the file.
        for (const line of [5, 6]) {
            const overlong = onLine(line).filter(n => n.length > LINES[line].length);
            assert.deepStrictEqual(overlong.map(n => `${n.slice(0, 60)}…(${n.length})`), [], `line ${line}`);
        }
    });

    test('RECORD fields labelled Key and Index are not KEY/INDEX entries of the FILE', () => {
        const fileKids = childrenOf(symbols(), 'FILE (RSNTRNS)');
        const bogus = fileKids.filter(s => s.range.start.line >= 8 && s.range.start.line <= 14);
        assert.deepStrictEqual(bogus.map(s => `${s.name.slice(0, 60)}@${s.range.start.line}`), []);
    });

    test('PROJECT(Project) in a VIEW is one PROJECT entry, not two', () => {
        const viewKids = childrenOf(symbols(), 'VIEW(RSNTRNS)');
        assert.deepStrictEqual(viewKids.map(s => s.name), ['PROJECT(RSNP:Tx_No)', 'PROJECT(Project)']);
    });
});
