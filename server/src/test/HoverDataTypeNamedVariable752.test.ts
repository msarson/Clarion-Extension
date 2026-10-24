import * as assert from 'assert';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Hover } from 'vscode-languageserver/node';
import { HoverProvider } from '../providers/HoverProvider';
import { TokenCache } from '../TokenCache';
import { setServerInitialized } from '../serverState';

/**
 * #752 — in executable code, a variable named like a data type (`Key`, `Memo`, `Long`) hovered as
 * the data type: the data-type lookup ran before variable resolution and matched the name alone.
 * Inside a CODE section a data type names a type only as the operand of NEW: `Ref &= NEW(LONG)`
 * (the help's NEW page) and `Ref &= NEW LONG` both build on Clarion 10 and 12, while
 * `SIZE(LONG)` is `Invalid SIZE parameter`. Anywhere else there the word is a name. #722 is the
 * same fix for controls.
 */

let counter = 0;

/** The hover card at the `n`th occurrence (from 1) of `needle` in `lines`, cursor on its second character. */
async function hoverAt(lines: string[], needle: string, n = 1): Promise<string> {
    const text = lines.join('\r\n');
    const doc = TextDocument.create(`file:///C:/temp/dtvar752-${++counter}.clw`, 'clarion', 1, text);
    TokenCache.getInstance().clearAllTokens();
    let seen = 0;
    for (let line = 0; line < lines.length; line++) {
        let from = 0;
        for (let at = lines[line].indexOf(needle, from); at >= 0; at = lines[line].indexOf(needle, from)) {
            if (++seen === n) {
                const h: Hover | null = await new HoverProvider().provideHover(doc, { line, character: at + 1 });
                return (h?.contents as { value?: string } | undefined)?.value ?? '';
            }
            from = at + 1;
        }
    }
    throw new Error(`occurrence ${n} of ${needle} not found`);
}

const isDataTypeCard = (card: string, type: string) => card.startsWith(`**${type}** - `);

const PROGRAM = [
    '  PROGRAM',
    '  MAP',
    'Proc      PROCEDURE(LONG pX)',
    '  END',
    'Key     LONG',
    'Memo    LONG',
    'Long    LONG',
    'Ref     &LONG',
    '  CODE',
    '  Key = Memo + Long',
    '  Ref &= NEW(LONG)',
    '  Ref &= NEW LONG',
    '  DO Tidy',
    '',
    'Tidy    ROUTINE',
    '  Memo = Key',
    '',
    'Proc    PROCEDURE(LONG pX)',
    'Local   LONG',
    '  CODE',
    '  Key = Memo',
];

suite('Hover on a variable named like a data type, in code (#752)', () => {
    suiteSetup(() => setServerInitialized(true));

    test('in the PROGRAM\'s CODE, Key, Memo and Long hover as the variables', async () => {
        for (const name of ['Key', 'Memo', 'Long']) {
            const card = await hoverAt(PROGRAM, name, 2);
            assert.ok(!isDataTypeCard(card, name.toUpperCase()) && card.includes('`LONG`'), `${name}: ${card}`);
        }
    });

    test('in a procedure\'s CODE and in a ROUTINE without DATA, too', async () => {
        const inProc = await hoverAt(PROGRAM, 'Key = Memo', 2);
        assert.ok(!isDataTypeCard(inProc, 'KEY') && inProc.includes('`LONG`'), inProc);
        const inRoutine = await hoverAt(PROGRAM, 'Memo = Key', 1);
        assert.ok(!isDataTypeCard(inRoutine, 'MEMO') && inRoutine.includes('`LONG`'), inRoutine);
    });

    test('a data type in a declaration, a reference or NEW( keeps its card', async () => {
        assert.ok(isDataTypeCard(await hoverAt(PROGRAM, 'LONG', 2), 'LONG'), 'Key LONG');
        assert.ok(isDataTypeCard(await hoverAt(PROGRAM, 'LONG', 5), 'LONG'), 'Ref &LONG');
        assert.ok(isDataTypeCard(await hoverAt(PROGRAM, 'LONG)', 1), 'LONG'), 'NEW(LONG)');
        assert.ok(isDataTypeCard(await hoverAt(PROGRAM, 'LONG', 7), 'LONG'), 'NEW LONG');
        assert.ok(isDataTypeCard(await hoverAt(PROGRAM, 'LONG', 9), 'LONG'), 'Local LONG in the procedure');
    });
});
