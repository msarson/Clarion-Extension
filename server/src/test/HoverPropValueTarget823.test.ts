import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Hover } from 'vscode-languageserver-protocol';
import { HoverProvider } from '../providers/HoverProvider';

/**
 * #823: PROP:Value means two different things. On a RADIO it is the value the OPTION's USE
 * variable gets when the radio is chosen, on a CHECK the values its USE variable gets when
 * checked/unchecked (the VALUE attribute; it also reads the pending value of an ENTRY, SPIN
 * or COMBO). On a FILE it is an array property reading or writing a MEMO/BLOB by negative
 * index. The card used to show only the FILE meaning, whatever the target.
 */

let tmpRoot: string;

function docFor(text: string): TextDocument {
    const file = path.join(tmpRoot, 'pv' + Math.random().toString(36).slice(2) + '.clw');
    fs.writeFileSync(file, text);
    const uri = 'file:///' + file.replace(/\\/g, '/').replace(/^([a-zA-Z]):/, (_m, d) => d + '%3A');
    return TextDocument.create(uri, 'clarion', 1, text);
}

async function hoverOn(text: string, lineNeedle: string): Promise<string> {
    const doc = docFor(text);
    const lines = text.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
        if (!lines[i].includes(lineNeedle)) continue;
        const idx = lines[i].indexOf('PROP:Value');
        assert.ok(idx >= 0, `PROP:Value on line '${lines[i]}'`);
        const h: Hover | null = await new HoverProvider().provideHover(doc, { line: i, character: idx + 6 });
        if (!h || !h.contents) return '';
        const c = h.contents as { value?: string } | string;
        return typeof c === 'string' ? c : (c.value ?? '');
    }
    throw new Error(`line '${lineNeedle}' not found`);
}

const source = [
    "  PROGRAM",
    "",
    "Customer FILE,DRIVER('TopSpeed'),PRE(CUS)",
    "Notes     MEMO(2000)",
    "Record    RECORD",
    "Number     LONG",
    "          END",
    "         END",
    "",
    "OptVar   STRING(2)",
    "CheckVar STRING(1)",
    "Feq      LONG",
    "Text     STRING(2000)",
    "",
    "MyWindow WINDOW('Test'),AT(,,300,200)",
    "           OPTION('Pick'),USE(OptVar)",
    "             RADIO('One'),AT(10,10),USE(?Radio1),VALUE('10')",
    "           END",
    "           CHECK('Check'),AT(10,30),USE(CheckVar),VALUE('T','F')",
    "         END",
    "",
    "  MAP",
    "  END",
    "  CODE",
    "  ?Radio1{PROP:Value} = '20' ! radio line",
    "  ?CheckVar{PROP:Value,1} = 'Y' ! check line",
    "  MyWindow $ ?Radio1{PROP:Value} = '30' ! window-qualified line",
    "  Text = Customer{PROP:Value,-1} ! file line",
    "  Feq{PROP:Value} = 'x' ! unknown line",
    "  RETURN",
    ""
].join('\n');

const CONTROL_MEANING = /OPTION/;
const FILE_MEANING = /MEMO or BLOB/;

suite('PROP:Value card follows its target (#823)', () => {
    suiteSetup(() => { tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'propvalue823-')); });
    suiteTeardown(() => { fs.rmSync(tmpRoot, { recursive: true, force: true }); });

    test('on a RADIO field equate the card gives the control meaning only', async () => {
        const card = await hoverOn(source, '! radio line');
        assert.match(card, CONTROL_MEANING, card);
        assert.doesNotMatch(card, FILE_MEANING, card);
    });

    test('on a CHECK field equate the card gives the control meaning only', async () => {
        const card = await hoverOn(source, '! check line');
        assert.match(card, /CHECK/, card);
        assert.doesNotMatch(card, FILE_MEANING, card);
    });

    test('window $ ?control is a control target', async () => {
        const card = await hoverOn(source, '! window-qualified line');
        assert.match(card, CONTROL_MEANING, card);
        assert.doesNotMatch(card, FILE_MEANING, card);
    });

    test('on a FILE label the card gives the FILE meaning only', async () => {
        const card = await hoverOn(source, '! file line');
        assert.match(card, FILE_MEANING, card);
        assert.doesNotMatch(card, CONTROL_MEANING, card);
    });

    test('on a target that is neither known control nor FILE the card gives both', async () => {
        const card = await hoverOn(source, '! unknown line');
        assert.match(card, CONTROL_MEANING, card);
        assert.match(card, FILE_MEANING, card);
    });
});
