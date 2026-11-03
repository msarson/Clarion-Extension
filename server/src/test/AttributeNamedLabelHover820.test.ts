import * as assert from 'assert';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Position } from 'vscode-languageserver-protocol';
import { HoverProvider } from '../providers/HoverProvider';
import { TokenCache } from '../TokenCache';

/**
 * #820 — a parameter or variable whose label is also an attribute's name (Password,
 * Required, Hide, ...) or a declaration keyword (Key) showed that attribute's or keyword's
 * card. A label is a label: the attribute card belongs only in attribute position
 * (`ENTRY(@s20),USE(Pwd),PASSWORD`).
 */

let counter = 0;

function hoverText(hover: any): string {
    if (!hover) return '';
    return typeof hover.contents === 'string'
        ? hover.contents
        : 'value' in hover.contents ? hover.contents.value : '';
}

async function hoverAt(lines: string[], line: number, needle: string, occurrence = 0): Promise<string> {
    const doc = TextDocument.create(`file:///C:/temp/label820-${++counter}.clw`, 'clarion', 1, lines.join('\r\n'));
    TokenCache.getInstance().getTokens(doc);
    let col = -1;
    for (let k = 0; k <= occurrence; k++) col = lines[line].indexOf(needle, col + 1);
    assert.ok(col >= 0, `fixture: '${needle}' not on line ${line}`);
    return hoverText(await new HoverProvider().provideHover(doc, Position.create(line, col + 1)));
}

/** The card of a label: names it, and is neither an attribute's nor a keyword's card. */
function assertLabelCard(text: string, name: string) {
    assert.ok(text.includes(name), `expected a card for ${name}, got: ${text.split('\n')[0]}`);
    assert.ok(!/Attribute/i.test(text.split('\n')[0]), `attribute card for a label ${name}: ${text.split('\n')[0]}`);
    assert.ok(!text.startsWith(`**${name.toUpperCase()}**`), `keyword card for a label ${name}: ${text.split('\n')[0]}`);
}

const NAMES = ['Password', 'Required', 'Req', 'Hide', 'Disable', 'Key', 'Upr', 'Imm', 'Default', 'Check', 'Radio'];

suite('A label named like an attribute or keyword keeps its own card (#820)', () => {
    for (const name of NAMES) {
        const classProto = [
            '  PROGRAM',
            '  MAP',
            `MapProc PROCEDURE(STRING pUser, STRING ${name})`,
            '  END',
            'MyClass CLASS,TYPE',
            `Login     PROCEDURE(STRING pUser, STRING ${name}),BYTE,VIRTUAL`,
            `Check     PROCEDURE(STRING pUser, |`,
            `                    <*STRING ${name}>),BYTE`,
            '        END',
            '  CODE',
            `MapProc PROCEDURE(STRING pUser, STRING ${name})`,
            '  CODE',
            `  IF ${name} = '' THEN RETURN.`,
            `MyClass.Login PROCEDURE(STRING pUser, STRING ${name})`,
            '  CODE',
            `  RETURN CHOOSE(${name} = '')`,
        ];

        test(`${name}: parameter of a CLASS method prototype`, async () => {
            assertLabelCard(await hoverAt(classProto, 5, name), name);
        });

        test(`${name}: parameter on a |-continued CLASS method prototype`, async () => {
            // #825 — a parameter on a continuation line gets its parameter card too.
            assertLabelCard(await hoverAt(classProto, 7, name), name);
        });

        test(`${name}: parameter of a MAP prototype`, async () => {
            assertLabelCard(await hoverAt(classProto, 2, name), name);
        });

        test(`${name}: parameter of a procedure and of a method implementation`, async () => {
            assertLabelCard(await hoverAt(classProto, 10, name), name);
            assertLabelCard(await hoverAt(classProto, 13, name), name);
        });

        test(`${name}: parameter used in code`, async () => {
            assertLabelCard(await hoverAt(classProto, 12, name), name);
            assertLabelCard(await hoverAt(classProto, 15, name), name);
        });

        const data = [
            '  PROGRAM',
            '  MAP',
            '  END',
            'MyClass CLASS,TYPE',
            `${name}     STRING(20)`,
            '        END',
            '  CODE',
            'Proc PROCEDURE()',
            `${name}  STRING(20)`,
            '  CODE',
            `  ${name} = 'x'`,
        ];

        test(`${name}: a CLASS field and a local variable, declared and used`, async () => {
            assertLabelCard(await hoverAt(data, 4, name), name);
            assertLabelCard(await hoverAt(data, 8, name), name);
            assertLabelCard(await hoverAt(data, 10, name), name);
        });
    }

    suite('attribute position keeps the attribute card', () => {
        const win = [
            '  PROGRAM',
            '  MAP',
            '  END',
            'Pwd STRING(20)',
            'MyClass CLASS,TYPE',
            'Login     PROCEDURE(STRING pUser, STRING Password),BYTE,VIRTUAL',
            '        END',
            "Win WINDOW('x'),AT(0,0,100,100)",
            '      ENTRY(@s20),AT(1,1,50,10),USE(Pwd),PASSWORD,REQ,HIDE,UPR',
            '    END',
            '  CODE',
        ];
        for (const attr of ['PASSWORD', 'REQ', 'HIDE', 'UPR']) {
            test(`${attr} on an ENTRY`, async () => {
                const text = await hoverAt(win, 8, `,${attr}`);
                assert.ok(/Attribute/i.test(text.split('\n')[0]) && text.toUpperCase().includes(attr),
                    `expected the ${attr} attribute card, got: ${text.split('\n')[0]}`);
            });
        }
        test('VIRTUAL after a CLASS method prototype', async () => {
            const text = await hoverAt(win, 5, 'VIRTUAL');
            assert.ok(/VIRTUAL/.test(text) && /Attribute/i.test(text.split('\n')[0]), `got: ${text.split('\n')[0]}`);
        });
    });
});

suite('An array parameter named like an attribute keeps its own card (#820 review)', () => {
    const lines = [
        '  PROGRAM',
        '  MAP',
        '  END',
        'MyClass CLASS,TYPE',
        'Login     PROCEDURE(STRING pUser, *STRING[] Password),BYTE',
        '        END',
        '  CODE',
    ];

    test('*STRING[] Password in a CLASS method prototype', async () => {
        assertLabelCard(await hoverAt(lines, 4, 'Password'), 'Password');
    });
});
