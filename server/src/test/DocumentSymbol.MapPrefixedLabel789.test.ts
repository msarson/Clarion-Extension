/**
 * #789 — an indented MAP prototype whose label holds two colons, `XL:Column:S`, showed in the
 * Structure view as `S`. Indented, the label arrives as `XL:Column` `:` `S` (the tokenizer's
 * PREFIX:Field pattern takes one colon), and the Structure view's own MAP look-ahead named the
 * entry after the last token. DocumentStructure already joins the chain (#597); the look-ahead
 * now does too, and only for a name that starts its line.
 */
import * as assert from 'assert';
import { ClarionTokenizer } from '../ClarionTokenizer';
import { ClarionDocumentSymbolProvider, ClarionDocumentSymbol } from '../providers/ClarionDocumentSymbolProvider';
import { setServerInitialized } from '../serverState';

function mapChildren(lines: string[]): string[] {
    const tokens = new ClarionTokenizer(lines.join('\r\n')).tokenize();
    const symbols = new ClarionDocumentSymbolProvider().provideDocumentSymbols(tokens, 'test://xl.clw');
    const map = symbols.find(s => s.name.startsWith('MAP'));
    assert.ok(map, `no MAP symbol; got ${JSON.stringify(symbols.map(s => s.name))}`);
    return ((map!.children ?? []) as ClarionDocumentSymbol[]).map(s => s.name);
}

const PROTOTYPES = [
    "CreateXL         (<*XLFeedback feedback>),SIGNED",
    "XL:Column:S      (SIGNED col),STRING,EXPORT,NAME('__XL_ColumnS')",
    "XL:Column:N      (STRING col),SIGNED,EXPORT,NAME('__XL_ColumnN')",
    "XL:XlatCell      (STRING cell, *SIGNED row, *SIGNED col),EXPORT,NAME('__XL_Cell')",
    "a:b:c:d          (LONG n)",
];
const EXPECTED = ['CreateXL', 'XL:Column:S', 'XL:Column:N', 'XL:XlatCell', 'a:b:c:d'];

suite('MAP prototype labels with more than one colon (#789)', () => {
    setup(() => setServerInitialized(true));

    test('indented prototypes keep their whole label', () => {
        assert.deepStrictEqual(mapChildren(['  PROGRAM', '  MAP', ...PROTOTYPES.map(p => '    ' + p), '  END', '  CODE']), EXPECTED);
    });

    test('prototypes in column 0 keep their whole label', () => {
        assert.deepStrictEqual(mapChildren(['  PROGRAM', '  MAP', ...PROTOTYPES, '  END', '  CODE']), EXPECTED);
    });
});
