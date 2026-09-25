import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Hover } from 'vscode-languageserver-protocol';
import { HoverProvider } from '../providers/HoverProvider';

/**
 * #540 — outside any PROCEDURE, hovering the STRUCTURE half of `Struct.Field` answered with
 * the field after the dot, but only when that field was declared inline in the structure's
 * own block; a field coming from the type argument fell through and the structure hovered
 * correctly. The tokenizer emits the whole dotted reference as one StructureField token, and
 * the #474 dotted lookup matched any cursor position inside it, so a cursor on `ItemQ` asked
 * "what is field CategoryName of ItemQ?".
 *
 * Ruling: the structure half describes the structure, the field half describes the field —
 * the same split the scoped (in-procedure) path already makes. #474's test put its cursor on
 * the structure half only through cursorOn's default offset; the capability it asserts (the
 * field is looked up at all from a no-scope context) is kept, with the cursor on the field.
 */

interface Fixture { uri: string; text: string; }

let tmpRoot: string;

function writeFixture(name: string, text: string): Fixture {
    const file = path.join(tmpRoot, name);
    fs.writeFileSync(file, text);
    return { uri: 'file:///' + file.replace(/\\/g, '/').replace(/^([a-zA-Z]):/, (_m, d) => d + '%3A'), text };
}

function cursorOn(text: string, needle: string, offset: number) {
    const lines = text.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
        const idx = lines[i].indexOf(needle);
        if (idx !== -1) return { line: i, character: idx + offset };
    }
    throw new Error(`cursorOn: '${needle}' not found`);
}

async function hoverText(fix: Fixture, needle: string, offset: number): Promise<string> {
    const doc = TextDocument.create(fix.uri, 'clarion', 1, fix.text);
    const hover = await new HoverProvider().provideHover(doc, cursorOn(fix.text, needle, offset)) as Hover | null;
    if (!hover || !hover.contents) return '';
    const c = hover.contents as { value?: string } | string;
    return typeof c === 'string' ? c : (c.value ?? '');
}

// The reported shape: a typed QUEUE that also declares fields of its own, referenced from
// the PROGRAM's main CODE (no enclosing PROCEDURE). The type lives in the same file so the
// fixture is self-contained; where it is declared does not matter to the half-selection.
const PROGRAM = [
    "  PROGRAM",
    "",
    "ItemQueueType   QUEUE,TYPE",
    "Code              LONG",
    "RefDate           DATE",
    "                END",
    "",
    "ItemQ           QUEUE(ItemQueueType)",
    "CategoryName      STRING(16)",
    "SourceSystem      STRING(32)",
    "                END",
    "",
    "  MAP",
    "  END",
    "  CODE",
    "  ItemQ.Code         = 1",
    "  ItemQ.CategoryName = 'inline'",
    "  RETURN",
    ""
].join('\n');

const STRUCT_HALF = 1;                       // the `t` of ItemQ
const DOT = 'ItemQ'.length;                  // on the dot itself
const FIELD_HALF = 'ItemQ.'.length + 1;      // inside the field name

// A field's card: the older "**ItemQ Field:**" form, or (#657/#668) the declaration's card titled
// with the dotted name, "**ItemQ.CategoryName** — ...". The structure half's card is titled "**ItemQ**".
const isFieldCard = (text: string) => /Field:/.test(text) || /^\*\*[\w:]+\.[\w:]+\*\* — /.test(text);

suite('Issue #540 — the structure half of a dotted reference hovers as the structure', () => {

    setup(() => { tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'hover-540-')); });
    teardown(() => { try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch { /* best-effort */ } });

    test('bug-pin: the structure half before an INLINE field describes the QUEUE, not the field', async () => {
        const text = await hoverText(writeFixture('inline.clw', PROGRAM), 'ItemQ.CategoryName', STRUCT_HALF);
        assert.notStrictEqual(text, '', 'ItemQ must hover');
        assert.ok(!isFieldCard(text), `must not answer with the CategoryName field card; got: ${text}`);
        assert.ok(/QUEUE/i.test(text), `must describe the QUEUE; got: ${text}`);
    });

    test('the structure half before a TYPE-owned field describes the QUEUE (already did — kept)', async () => {
        const text = await hoverText(writeFixture('typed.clw', PROGRAM), 'ItemQ.Code', STRUCT_HALF);
        assert.ok(!isFieldCard(text), `must not answer with the Code field card; got: ${text}`);
        assert.ok(/QUEUE/i.test(text), `must describe the QUEUE; got: ${text}`);
    });

    test('both lines agree: the structure half hovers identically whichever field follows the dot', async () => {
        const fix = writeFixture('agree.clw', PROGRAM);
        const onInline = await hoverText(fix, 'ItemQ.CategoryName', STRUCT_HALF);
        const onTyped = await hoverText(fix, 'ItemQ.Code', STRUCT_HALF);
        assert.strictEqual(onInline, onTyped);
    });

    test('the field half of the same reference still describes the inline field', async () => {
        const text = await hoverText(writeFixture('field.clw', PROGRAM), 'ItemQ.CategoryName', FIELD_HALF);
        assert.ok(isFieldCard(text), `must answer with the field card; got: ${text}`);
        assert.ok(/CategoryName/.test(text) && /STRING/i.test(text), `must name the field and its type; got: ${text}`);
    });

    test('a cursor on the dot itself counts as the field half', async () => {
        const text = await hoverText(writeFixture('dot.clw', PROGRAM), 'ItemQ.CategoryName', DOT);
        assert.ok(isFieldCard(text), `must answer with the field card; got: ${text}`);
    });

    test('#474 shape kept: the field half of PROJECT(Customer.ID) in a VIEW describes the field', async () => {
        const view = [
            "  PROGRAM",
            "",
            "Customer             FILE,DRIVER('TOPSPEED'),PRE(CUS)",
            "Record                   RECORD,PRE()",
            "ID                          LONG",
            "                         END",
            "                     END",
            "",
            "MyView               VIEW(Customer)",
            "                       PROJECT(Customer.ID)",
            "                     END",
            "",
            "  MAP",
            "  END",
            "  CODE",
            "  RETURN",
            ""
        ].join('\n');
        const fix = writeFixture('view.clw', view);
        const field = await hoverText(fix, 'Customer.ID', 'Customer.'.length + 1);
        assert.ok(/LONG/i.test(field) && /ID/.test(field), `field half must describe ID; got: ${field}`);
        const structure = await hoverText(fix, 'Customer.ID', STRUCT_HALF);
        assert.ok(/FILE/i.test(structure), `structure half must describe the Customer FILE; got: ${structure}`);
        assert.ok(!isFieldCard(structure), `structure half must not answer with the field card; got: ${structure}`);
    });
});
