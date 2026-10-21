import * as assert from 'assert';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Hover } from 'vscode-languageserver/node';
import { HoverProvider } from '../providers/HoverProvider';
import { TokenCache } from '../TokenCache';
import { setServerInitialized } from '../serverState';

/**
 * #753 — hovering a parameter's data type in a prototype (`PROCEDURE(LONG pX)`) showed nothing, or
 * the card of a variable with the same name. The data-type lookup declines a word followed by
 * another identifier, which keeps `Toolbar ToolbarClass` (a label with its type) from reading as a
 * keyword, and `LONG pX` has that shape. A data type that opens a parameter is its type. #752 is
 * the reverse: a type-spelled word in code is a name.
 */

function program(withNamesakes: boolean): string[] {
    return [
        '  PROGRAM',
        '  MAP',
        'Proc      PROCEDURE(LONG pX, *STRING pS, <BYTE pB>, &LONG pRef),LONG',
        '  END',
        ...(withNamesakes ? ['Long    LONG', 'String  STRING(10)', 'Byte    BYTE'] : []),
        'MyClass CLASS',
        'Run       PROCEDURE(USHORT Number, BYTE Request),BYTE',
        '        END',
        'Toolbar ToolbarClass',
        '  CODE',
        '  Long = 1',
        '',
        'Proc    PROCEDURE(LONG pX, *STRING pS, <BYTE pB>, &LONG pRef)',
        '  CODE',
        '  RETURN pX',
        '',
        'MyClass.Run PROCEDURE(USHORT Number, BYTE Request)',
        '  CODE',
        '  RETURN Request',
    ];
}

let counter = 0;

/** The card with the cursor on `needle` (its first character after any leading punctuation) on the line starting `lineStart`. */
async function hoverOn(lines: string[], lineStart: string, needle: string): Promise<string> {
    const line = lines.findIndex(l => l.startsWith(lineStart));
    assert.ok(line >= 0, `no line starts ${lineStart}`);
    const at = lines[line].indexOf(needle);
    assert.ok(at >= 0, `${needle} not on ${lines[line]}`);
    const offset = needle.search(/\w/);
    const doc = TextDocument.create(`file:///C:/temp/param753-${++counter}.clw`, 'clarion', 1, lines.join('\r\n'));
    TokenCache.getInstance().clearAllTokens();
    const h: Hover | null = await new HoverProvider().provideHover(doc, { line, character: at + offset + 1 });
    return (h?.contents as { value?: string } | undefined)?.value ?? '';
}

const typeCard = (card: string, type: string) => card.startsWith(`**${type}** - `);

const PROTOTYPES: [string, string, string[]][] = [
    ['MAP prototype', 'Proc      PROCEDURE', ['LONG pX', '*STRING pS', '<BYTE pB', '&LONG pRef']],
    ['procedure implementation', 'Proc    PROCEDURE', ['LONG pX', '*STRING pS', '<BYTE pB', '&LONG pRef']],
    ['CLASS method prototype', 'Run       PROCEDURE', ['USHORT Number', 'BYTE Request']],
    ['method implementation', 'MyClass.Run PROCEDURE', ['USHORT Number', 'BYTE Request']],
];

suite('Hover on a parameter\'s data type in a prototype (#753)', () => {
    suiteSetup(() => setServerInitialized(true));

    for (const withNamesakes of [false, true]) {
        for (const [what, lineStart, needles] of PROTOTYPES) {
            test(`${what}: each parameter's type shows its card${withNamesakes ? ', with variables of the same name declared' : ''}`, async () => {
                const lines = program(withNamesakes);
                for (const needle of needles) {
                    const type = /\w+/.exec(needle)![0];
                    const card = await hoverOn(lines, lineStart, needle);
                    assert.ok(typeCard(card, type), `${needle}: ${card || '(nothing)'}`);
                }
            });
        }
    }

    test('a parameter on a | continuation line of the prototype', async () => {
        const lines = ['  PROGRAM', '  MAP', 'Wide      PROCEDURE(LONG pA, |', '                    STRING pB)', '  END', '  CODE'];
        assert.ok(typeCard(await hoverOn(lines, '                    STRING', 'STRING pB'), 'STRING'));
    });

    test('the return type keeps its card, a label with a class type is not a data type, and code keeps the variable', async () => {
        const lines = program(true);
        assert.ok(typeCard(await hoverOn(lines, 'Proc      PROCEDURE', '),LONG'), 'LONG'));
        assert.ok(!typeCard(await hoverOn(lines, 'Toolbar ToolbarClass', 'Toolbar'), 'TOOLBAR'));
        const inCode = await hoverOn(lines, '  Long = 1', 'Long');
        assert.ok(inCode.startsWith('**Long** — `LONG`'), inCode);
    });
});
