/**
 * #826 — a declaration typed with LIKE, `QTDAmount  LIKE(Amount)`, never appeared in the Outline:
 * not in global data, a CLASS or a procedure's local data, with or without a colon in the label.
 * LIKE is its own token type (TypeReference), which the variable handler never took up. It shows
 * like any other variable, its label and its type: `QTDAmount LIKE(Amount)`, attributes left off.
 */
import * as assert from 'assert';
import { ClarionTokenizer } from '../ClarionTokenizer';
import { ClarionDocumentSymbolProvider, ClarionDocumentSymbol } from '../providers/ClarionDocumentSymbolProvider';
import { setServerInitialized } from '../serverState';

const SOURCE = [
    '  PROGRAM',                                                    // 0
    '  MAP',                                                        // 1
    'Proto (LIKE(Amount) p)',                                       // 2
    'Work  PROCEDURE',                                              // 3
    '  END',                                                        // 4
    'Amount       REAL',                                            // 5
    'QTDAmount    LIKE(Amount)',                                    // 6
    'Glo:Amount   LIKE(Amount)',                                    // 7
    'MonthlyAmts  LIKE(Amount),DIM(12)',                            // 8
    'Construct    GROUP,PRE(Con)',                                  // 9
    'Field1         LIKE(Amount)',                                  // 10
    'Field2         STRING(10)',                                    // 11
    '             END',                                             // 12
    'NewGroup     LIKE(Construct),PRE(New)',                        // 13
    'Dotted       LIKE(Construct.Field2)',                          // 14
    'Colon        LIKE(Con:Field2)',                                // 15
    'MyClass      CLASS',                                           // 16
    'Total          LIKE(Amount)',                                  // 17
    'Cls:Total      LIKE(Amount),PRIVATE',                          // 18
    'Count          LONG',                                          // 19
    '             END',                                             // 20
    '  CODE',                                                       // 21
    '  Amount = 1',                                                 // 22
    'Work  PROCEDURE',                                              // 23
    'LocAmount    LIKE(Amount)',                                    // 24
    'Loc:Amount   LIKE(Glo:Amount)',                                // 25
    'LocCount     LONG',                                            // 26
    '  CODE',                                                       // 27
    '  LocAmount = LIKE(Amount)',                                   // 28
    '  Work(LIKE(Amount))',                                         // 29
].join('\r\n');

function flat(list: ClarionDocumentSymbol[], out: ClarionDocumentSymbol[] = []): ClarionDocumentSymbol[] {
    for (const s of list) { out.push(s); flat((s.children ?? []) as ClarionDocumentSymbol[], out); }
    return out;
}

suite('#826 — Outline: a LIKE declaration is an entry', () => {
    setup(() => setServerInitialized(true));

    const entries = () => flat(new ClarionDocumentSymbolProvider()
        .provideDocumentSymbols(new ClarionTokenizer(SOURCE).tokenize(), 'test://like.clw'));
    const at = (line: number) => entries().filter(s => s.range.start.line === line).map(s => s.name);

    test('global data: plain label, colon label, attributes after', () => {
        assert.deepStrictEqual(at(6), ['QTDAmount LIKE(Amount)']);
        assert.deepStrictEqual(at(7), ['Glo:Amount LIKE(Amount)']);
        assert.deepStrictEqual(at(8), ['MonthlyAmts LIKE(Amount)']);
    });

    test('LIKE of a GROUP, of a qualified field and of a prefixed field', () => {
        assert.deepStrictEqual(at(13), ['NewGroup LIKE(Construct)']);
        assert.deepStrictEqual(at(14), ['Dotted LIKE(Construct.Field2)']);
        assert.deepStrictEqual(at(15), ['Colon LIKE(Con:Field2)']);
    });

    test('inside a GROUP and a CLASS', () => {
        assert.deepStrictEqual(at(10), ['Field1 LIKE(Amount)']);
        assert.deepStrictEqual(at(17), ['Total LIKE(Amount)']);
        assert.deepStrictEqual(at(18), ['Cls:Total LIKE(Amount)']);
    });

    test('a procedure\'s local data', () => {
        assert.deepStrictEqual(at(24), ['LocAmount LIKE(Amount)']);
        assert.deepStrictEqual(at(25), ['Loc:Amount LIKE(Glo:Amount)']);
    });

    test('CONTROL: ordinary variables are unchanged', () => {
        assert.deepStrictEqual(at(5), ['Amount REAL']);
        assert.deepStrictEqual(at(11), ['Field2 STRING(10)']);
        assert.deepStrictEqual(at(19), ['Count LONG']);
        assert.deepStrictEqual(at(26), ['LocCount LONG']);
    });

    test('CONTROL: LIKE inside a parameter list or in code adds nothing', () => {
        assert.deepStrictEqual(at(2), ['Proto']);
        assert.deepStrictEqual(at(22), []);
        assert.deepStrictEqual(at(28), []);
        assert.deepStrictEqual(at(29), []);
    });
});
