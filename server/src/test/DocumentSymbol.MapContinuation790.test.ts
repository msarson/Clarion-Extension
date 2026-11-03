/**
 * #790 — a MAP prototype continued onto the next line with `|` became two Structure view
 * entries: the continuation `EXPORT,NAME('__XL_Cell')` starts its line, and a name that
 * starts its line in a MAP is read as a keyword-less prototype. A line continued from the
 * one above does not start a statement, so nothing on it is declared.
 */
import * as assert from 'assert';
import { ClarionTokenizer } from '../ClarionTokenizer';
import { ClarionDocumentSymbolProvider, ClarionDocumentSymbol } from '../providers/ClarionDocumentSymbolProvider';
import { TokenType } from '../tokenizer/TokenTypes';
import { setServerInitialized } from '../serverState';

const SOURCE = [
    '  PROGRAM',                                                                   // 0
    '  MAP',                                                                       // 1
    "XL:Column:S      (SIGNED col),STRING,EXPORT,NAME('__XL_ColumnS')",            // 2
    "XL:XlatCell      (STRING cell, *SIGNED row, *SIGNED col), |",                 // 3
    "                   EXPORT,NAME('__XL_Cell')",                                 // 4
    "Tidy             (LONG n), |  ! the attributes follow",                       // 5
    "                   PROC",                                                     // 6
    'Last             PROCEDURE',                                                  // 7
    '  END',                                                                       // 8
    '  CODE',                                                                      // 9
].join('\r\n');

function mapChildren(): ClarionDocumentSymbol[] {
    const tokens = new ClarionTokenizer(SOURCE).tokenize();
    const symbols = new ClarionDocumentSymbolProvider().provideDocumentSymbols(tokens, 'test://xl.clw');
    const map = symbols.find(s => s.name.startsWith('MAP'));
    assert.ok(map, `no MAP symbol; got ${JSON.stringify(symbols.map(s => s.name))}`);
    return (map!.children ?? []) as ClarionDocumentSymbol[];
}

suite('MAP prototype continued with | is one declaration (#790)', () => {
    setup(() => setServerInitialized(true));

    test('the continuation adds no entry of its own', () => {
        assert.deepStrictEqual(mapChildren().map(s => [s.name, s.range.start.line]), [
            ['XL:Column:S', 2], ['XL:XlatCell', 3], ['Tidy', 5], ['Last', 7],
        ]);
    });

    test('no token on a continued line is marked as a MAP procedure', () => {
        const tokens = new ClarionTokenizer(SOURCE).tokenize();
        new ClarionDocumentSymbolProvider().provideDocumentSymbols(tokens, 'test://xl.clw');
        const marked = tokens.filter(t => (t.line === 4 || t.line === 6) && t.subType === TokenType.MapProcedure);
        assert.deepStrictEqual(marked.map(t => `${t.value}@${t.line}`), []);
    });
});
