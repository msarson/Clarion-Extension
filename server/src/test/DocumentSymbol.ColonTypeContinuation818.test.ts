/**
 * #818 — a prototype continued with `|` whose parameters are typed with a colon name
 * (`*HTTP:Query  request, |`) put dummy entries in the Outline: `Query request` and
 * `Answer )`. The colon splits the type into `*HTTP` `:` `Query`, and `Query` followed by
 * `request` reads like a label followed by its type, so the continuation line was taken
 * for a variable declaration. #790 kept a continuation from declaring a MAP prototype;
 * nothing kept it from declaring a variable. A line continued from the one above does not
 * start a statement, so nothing on it is declared.
 *
 * Also: `MODULE('')` (an empty name) showed as `MODULE('''')`.
 */
import * as assert from 'assert';
import { ClarionTokenizer } from '../ClarionTokenizer';
import { ClarionDocumentSymbolProvider, ClarionDocumentSymbol } from '../providers/ClarionDocumentSymbolProvider';
import { setServerInitialized } from '../serverState';

const SOURCE = [
    '  PROGRAM',                                                        // 0
    '  MAP',                                                            // 1
    "    MODULE('')",                                                   // 2
    'Query        PROCEDURE (STRING url, |',                            // 3
    '                        *HTTP:Query  request, |',                  // 4
    '                        *HTTP:Answer answer),SIGNED,PROC',         // 5
    'Other        PROCEDURE (LONG n)',                                  // 6
    '    END',                                                          // 7
    "    MODULE('lib.clw')",                                            // 8
    'Third        PROCEDURE',                                           // 9
    '    END',                                                          // 10
    '  END',                                                            // 11
    'Client       CLASS,TYPE',                                          // 12
    'Query          PROCEDURE (STRING url, |',                          // 13
    '                          *HTTP:Query  request, |',                // 14
    '                          *HTTP:Answer answer),SIGNED,PROC',       // 15
    'Count          LONG',                                              // 16
    'Buffer         STRING(20), |',                                     // 17
    '                 DIM(3)',                                          // 18
    '               END',                                               // 19
    '  CODE',                                                           // 20
].join('\r\n');

function outline(): ClarionDocumentSymbol[] {
    const tokens = new ClarionTokenizer(SOURCE).tokenize();
    return new ClarionDocumentSymbolProvider().provideDocumentSymbols(tokens, 'test://http.clw');
}

function flat(list: ClarionDocumentSymbol[], out: ClarionDocumentSymbol[] = []): ClarionDocumentSymbol[] {
    for (const s of list) { out.push(s); flat((s.children ?? []) as ClarionDocumentSymbol[], out); }
    return out;
}

suite('#818 — Outline: a continued prototype with colon-typed parameters is one entry', () => {
    setup(() => setServerInitialized(true));

    test('no entry is made from a continuation line', () => {
        const continued = flat(outline()).filter(s => [4, 5, 14, 15, 18].includes(s.range.start.line));
        assert.deepStrictEqual(continued.map(s => `${s.name}@${s.range.start.line}`), []);
    });

    test('the MAP module holds just its two prototypes', () => {
        const map = outline().find(s => s.name.startsWith('MAP'));
        assert.ok(map, 'no MAP symbol');
        const module = (map!.children ?? []).find(s => s.range.start.line === 2) as ClarionDocumentSymbol;
        assert.ok(module, `no MODULE at line 2: ${JSON.stringify((map!.children ?? []).map(s => s.name))}`);
        assert.deepStrictEqual((module.children ?? []).map(s => s.name).sort(), ['Other', 'Query']);
    });

    test('the CLASS holds the method and its two data members, nothing else', () => {
        const cls = outline().find(s => s.name.includes('Client'));
        assert.ok(cls, 'no CLASS symbol');
        assert.deepStrictEqual((cls!.children ?? []).map(s => s.name).sort(),
            ['Buffer STRING(20)', 'Count LONG', 'Query']);
    });

    test("MODULE('') is shown as written", () => {
        const names = flat(outline()).filter(s => s.name.startsWith('MODULE')).map(s => s.name);
        assert.deepStrictEqual(names, ["MODULE('')", "MODULE('lib.clw')"]);
    });
});
