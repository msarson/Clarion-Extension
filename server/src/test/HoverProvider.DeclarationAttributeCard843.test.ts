import * as assert from 'assert';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Position } from 'vscode-languageserver-protocol';
import { HoverProvider } from '../providers/HoverProvider';
import { TokenCache } from '../TokenCache';

/**
 * #843 — the attribute card on a declaration line was built only for a declaration with an
 * attribute list of its own (WINDOW, REPORT, APPLICATION, the FILE family, the window controls).
 * On a CLASS, a QUEUE or a variable of a data type most attributes had no card, and THREAD
 * showed the THREAD() built-in function. Such a declaration now takes the card from the
 * attribute catalogue for a word in its attribute list.
 */
const CODE = [
    '  PROGRAM',                                                                                  // 0
    '  MAP',                                                                                      // 1
    '  END',                                                                                      // 2
    "Base           CLASS,TYPE,MODULE('b.clw'),LINK('b.clw'),DLL(1),EXTERNAL,THREAD,BINDABLE,EXPORT", // 3
    '               END',                                                                         // 4
    'Gv             LONG,STATIC,DLL,EXTERNAL,THREAD,EXPORT',                                     // 5
    'Q              QUEUE,PRE(Q),STATIC',                                                         // 6
    'Thread           LONG',                                                                      // 7
    '               END',                                                                         // 8
    '  CODE',                                                                                     // 9
    '  Gv = THREAD()',                                                                            // 10
    '  Q.Thread = 1',                                                                             // 11
];

async function hoverAt(line: number, word: string, nth = 0): Promise<string> {
    const tokenCache = TokenCache.getInstance();
    tokenCache.clearAllTokens();
    const doc = TextDocument.create('test://decl843.clw', 'clarion', 1, CODE.join('\n'));
    tokenCache.getTokens(doc);
    let at = -1;
    for (let i = 0; i <= nth; i++) at = CODE[line].indexOf(word, at + 1);
    const hover = await new HoverProvider().provideHover(doc, Position.create(line, at + 1));
    tokenCache.clearAllTokens();
    if (!hover) return '';
    const c = hover.contents as { value?: string } | string;
    return typeof c === 'string' ? c : c.value ?? '';
}

suite('Attribute cards on a CLASS, a variable and a QUEUE (#843)', () => {
    const cases: [number, string][] = [
        [3, 'LINK'], [3, 'DLL'], [3, 'EXTERNAL'], [3, 'THREAD'], [3, 'BINDABLE'], [3, 'EXPORT'],
        [5, 'STATIC'], [5, 'DLL'], [5, 'EXTERNAL'], [5, 'THREAD'], [5, 'EXPORT'],
        [6, 'PRE'], [6, 'STATIC'],
    ];
    for (const [line, word] of cases) {
        test(`${word} on line ${line} has its attribute card`, async () => {
            const text = await hoverAt(line, word);
            assert.ok(new RegExp(`Attribute: ${word}\\b|\\*\\*${word}\\*\\* \\(Attribute\\)`).test(text), `${word}@${line}:\n${text}`);
            assert.ok(!/Built-in Function/.test(text), `${word}@${line} shows the built-in:\n${text}`);
        });
    }

    test('a card without a property equate has no empty Property Equate line', async () => {
        const text = await hoverAt(3, 'EXPORT');
        assert.ok(/export list/i.test(text), text);
        assert.ok(!/Property Equate:\*\*\s*$/m.test(text), text);
    });

    test('CONTROL: THREAD() in code is still the built-in function', async () => {
        assert.ok(/Built-in Function: THREAD/.test(await hoverAt(10, 'THREAD')));
    });

    test('CONTROL: a field named Thread is not the attribute', async () => {
        const declared = await hoverAt(7, 'Thread');
        assert.ok(!/Attribute/.test(declared), declared);
        const used = await hoverAt(11, 'Thread');
        assert.ok(!/Attribute/.test(used), used);
    });
});
