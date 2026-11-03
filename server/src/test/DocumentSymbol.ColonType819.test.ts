/**
 * #819 — a declaration whose type is a colon name showed only the part before the colon:
 * `session  &HTTP:Session,AUTO` was `session &HTTP` in the Outline. The tokenizer splits
 * the type into `&HTTP` `:` `Session`, and the type collector kept the first piece only.
 * A plain colon type, `g  Q:Type`, arrives as one StructurePrefix token, which never
 * started a declaration at all, so the variable was missing from the Outline.
 * The same declaration is checked in global data, a CLASS and a procedure's local data.
 */
import * as assert from 'assert';
import { ClarionTokenizer } from '../ClarionTokenizer';
import { ClarionDocumentSymbolProvider, ClarionDocumentSymbol } from '../providers/ClarionDocumentSymbolProvider';
import { setServerInitialized } from '../serverState';

const DECLARATIONS = [
    'session   &HTTP:Session,AUTO',
    'query     &HTTP:Query',
    'deep      &HTTP:Session:Long',
    'group1    Q:Type',
    'group2    Q:Type,DIM(2)',
    'LOC:Ans   &HTTP:Answer',
    'plain     &HTTPSession',
    'counter   LONG',
];

const EXPECTED = [
    'session &HTTP:Session',
    'query &HTTP:Query',
    'deep &HTTP:Session:Long',
    'group1 Q:Type',
    'group2 Q:Type',
    'LOC:Ans &HTTP:Answer',
    'plain &HTTPSession',
    'counter LONG',
];

const SOURCE = [
    '  PROGRAM',                     // 0
    ...DECLARATIONS,                 // 1-8
    'Holder    CLASS,TYPE',          // 9
    ...DECLARATIONS,                 // 10-17
    '          END',                 // 18
    '  CODE',                        // 19
    'Proc      PROCEDURE',           // 20
    ...DECLARATIONS,                 // 21-28
    '  CODE',                        // 29
    '  RETURN',                      // 30
].join('\r\n');

function outline(): ClarionDocumentSymbol[] {
    const tokens = new ClarionTokenizer(SOURCE).tokenize();
    return new ClarionDocumentSymbolProvider().provideDocumentSymbols(tokens, 'test://colon.clw');
}

function namesOnLines(list: ClarionDocumentSymbol[], from: number, to: number): string[] {
    return list
        .filter(s => s.range.start.line >= from && s.range.start.line <= to)
        .sort((a, b) => a.range.start.line - b.range.start.line)
        .map(s => s.name);
}

suite('#819 — Outline: a colon type is shown whole', () => {
    setup(() => setServerInitialized(true));

    test('global data', () => {
        assert.deepStrictEqual(namesOnLines(outline(), 1, 8), EXPECTED);
    });

    test('a CLASS', () => {
        const cls = outline().find(s => s.name.includes('Holder'));
        assert.ok(cls, 'no CLASS symbol');
        assert.deepStrictEqual(namesOnLines((cls!.children ?? []) as ClarionDocumentSymbol[], 10, 17), EXPECTED);
    });

    test('a colon name that is not a declaration\'s type makes no entry', () => {
        // Statements in column 1 and colon names after an operator: what the type rule must not take.
        // An INCLUDEd code fragment has no CODE statement, so nothing says these lines are code.
        const source = [
            '  CASE G:Flag',
            'OF STATE:Ohio',
            '  END',
            '  IF G:Flag and LOC:Version = 1 THEN.',
        ].join('\r\n');
        const tokens = new ClarionTokenizer(source).tokenize();
        const symbols = new ClarionDocumentSymbolProvider().provideDocumentSymbols(tokens, 'test://code.clw');
        const flat: string[] = [];
        const walk = (l: ClarionDocumentSymbol[]) => l.forEach(s => { flat.push(s.name); walk((s.children ?? []) as ClarionDocumentSymbol[]); });
        walk(symbols);
        assert.deepStrictEqual(flat.filter(n => /STATE|LOC:/i.test(n)), []);
    });

    test('a colon inside a type argument is not joined to the type', () => {
        // `A:Que` is skipped by the type collector, so the `:` after it is not the type's own.
        const tokens = new ClarionTokenizer(['  PROGRAM', 'sized     STRING(SIZE(A:Que:Data.Desc))', '  CODE'].join('\r\n')).tokenize();
        const symbols = new ClarionDocumentSymbolProvider().provideDocumentSymbols(tokens, 'test://sized.clw');
        const sized = symbols.find(s => s.name.startsWith('sized '));
        assert.ok(sized, `no entry for sized: ${JSON.stringify(symbols.map(s => s.name))}`);
        assert.ok(!sized!.name.includes(':'), sized!.name);
    });

    test("a procedure's local data", () => {
        const proc = outline().find(s => s.name.startsWith('Proc'));
        assert.ok(proc, 'no procedure symbol');
        assert.deepStrictEqual(namesOnLines((proc!.children ?? []) as ClarionDocumentSymbol[], 21, 28), EXPECTED);
    });
});
