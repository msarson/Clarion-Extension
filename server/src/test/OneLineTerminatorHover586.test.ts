import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { HoverProvider } from '../providers/HoverProvider';
import { ClarionTokenizer } from '../ClarionTokenizer';
import { TokenType } from '../tokenizer/TokenTypes';

/**
 * #586 — #582 (period) and #575 (END) show "closes …" only when the parser recorded an opener for
 * the terminator, which happens for a structure spanning several lines. A one-line structure is
 * never pushed on the stack, so its terminator had no opener and hover said nothing: every one of
 * the 43 periods in VitTransform.clw is that form, including line 1000,
 * `if dx > 4 and instring(dl, drives[1 : 4], 1, 1) then cycle .`
 */
let tmpRoot: string;

async function hoverAt(lines: string[], line: number, character: number): Promise<string> {
    const text = lines.join('\r\n');
    const file = path.join(tmpRoot, `oneline${Math.random().toString(36).slice(2)}.clw`);
    fs.writeFileSync(file, text);
    const uri = 'file:///' + file.replace(/\\/g, '/').replace(/^([a-zA-Z]):/, (_m, d) => d + '%3A');
    const doc = TextDocument.create(uri, 'clarion', 1, text);
    const h = await new HoverProvider().provideHover(doc, { line, character });
    const c = h?.contents as { value?: string } | string | undefined;
    return !c ? '' : typeof c === 'string' ? c : (c.value ?? '');
}
const col = (lines: string[], line: number, needle: string, nth = 0) => {
    let at = -1;
    for (let i = 0; i <= nth; i++) at = lines[line].indexOf(needle, at + 1);
    return at;
};

const SOURCE = [
    'P PROCEDURE',                                                            // 0
    '  CODE',                                                                 // 1
    '  loop dx = 1 to 8',                                                     // 2
    '    dl = drives[dx]',                                                    // 3
    '    if dx > 4 and instring(dl, drives[1 : 4], 1, 1) then cycle .   ! c',  // 4
    '    if dx = 1 then x = 1 END',                                           // 5
    '    LOOP kx = 1 TO 4 ; y = kx ; END ; IF kx THEN z = 1.',                // 6
    '  END',                                                                  // 7
    '  RETURN',                                                               // 8
];

suite('Hovering the terminator of a one-line structure (#586)', () => {
    setup(() => { tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'hover-oneline-')); });
    teardown(() => { try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch { /* best-effort */ } });

    test('the period of a one-line IF names the IF, shows its line and links to it', async () => {
        const text = await hoverAt(SOURCE, 4, col(SOURCE, 4, '.'));
        assert.match(text, /closes IF/i, text);
        assert.match(text, /then cycle/i, text);
        assert.match(text, /\]\(file:\/\/\/.*#L5\)/, text);
    });

    test('the END of a one-line IF names it too', async () => {
        assert.match(await hoverAt(SOURCE, 5, col(SOURCE, 5, 'END')), /\*\*END\*\* — closes IF/i);
    });

    test('several one-line structures on a line: each terminator names its own', async () => {
        assert.match(await hoverAt(SOURCE, 6, col(SOURCE, 6, 'END')), /closes LOOP/i);
        assert.match(await hoverAt(SOURCE, 6, col(SOURCE, 6, '.')), /closes IF/i);
    });

    test('the multi-line LOOP still closes at its own END (structure unchanged)', () => {
        const tokens = new ClarionTokenizer(SOURCE.join('\r\n')).tokenize();
        assert.strictEqual(tokens.find(t => t.line === 2 && /^loop$/i.test(t.value))?.finishesAt, 7);
        assert.strictEqual(tokens.find(t => t.line === 4 && /^if$/i.test(t.value))?.finishesAt, 4);
        const linkedEnds = tokens.filter(t => t.type === TokenType.EndStatement && t.parent);
        assert.deepStrictEqual(linkedEnds.map(t => t.line), [4, 5, 6, 6, 7], 'every terminator knows its structure');
    });
});
