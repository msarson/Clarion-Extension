import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Location } from 'vscode-languageserver-protocol';
import { DefinitionProvider } from '../providers/DefinitionProvider';

/**
 * Issue #475 — F12 on the FIELD half of a dotted reference (`Customer.Name`) resolved
 * nothing at all, while the same field reached as `CUS:Name` resolved correctly.
 *
 * Two independent faults had to line up, and fixing either alone leaves it broken:
 *
 * 1. `getWordRangeAtPosition` returns the WHOLE fused reference on the member half —
 *    "Customer.Name", not "Name" — because the tokenizer emits it as one
 *    StructureField token. It therefore matched neither `structureName` nor
 *    `fieldName` in the dot-notation branch, both comparisons failed, and the branch
 *    fell through to null. The cursor position, not the word's spelling, says which
 *    half is under the caret.
 *
 * 2. `findFieldInStructure`'s range tier required `token.start > 0` — "fields are
 *    indented". They are not: a field label sits at column 0 by language rule, which
 *    the note above the deleted PREFIX:Field branch in DefinitionProvider already
 *    records. That test excluded every FILE field, so the tier could never return one.
 *
 * A dotted KEY appeared to work throughout, which made this look like "F12 works on a
 * key but not a field". It resolves through a different path downstream — the key case
 * is the regression guard below, not evidence the dotted path was ever healthy.
 *
 * Hovering the same references was fixed separately in #474; this is the F12 twin.
 */

let tmpRoot: string;

const SOURCE = [
    "  PROGRAM",
    "",
    "Customer             FILE,DRIVER('TOPSPEED'),PRE(CUS)",
    "CusKey                   KEY(CUS:ID)",
    "Record                   RECORD,PRE()",
    "ID                          LONG",
    "Name                        STRING(30)",
    "                         END",
    "                     END",
    "",
    "Orders               FILE,DRIVER('TOPSPEED'),PRE(ORD)",
    "OrdKey                   KEY(ORD:ID)",
    "Record                   RECORD,PRE()",
    "ID                          LONG",
    "Total                       DECIMAL(9,2)",
    "                         END",
    "                     END",
    "",
    "MyView               VIEW(Orders)",
    "                       PROJECT(Orders.ID)",
    "                       JOIN(Customer.CusKey, ORD:ID)",
    "                         PROJECT(Customer.Name)",
    "                       END",
    "                     END",
    "",
    "  MAP",
    "  END",
    "  CODE",
    "  RETURN",
    ""
].join('\n');

/** 0-based lines of the declarations F12 must land on. */
const LINE_CUSTOMER_FILE = 2;
const LINE_CUSKEY = 3;
const LINE_CUSTOMER_NAME = 6;
const LINE_ORDERS_ID = 13;

async function f12(needle: string, offsetIntoNeedle: number): Promise<Location | null> {
    const file = path.join(tmpRoot, 'v' + Math.random().toString(36).slice(2) + '.clw');
    fs.writeFileSync(file, SOURCE);
    const uri = 'file:///' + file.replace(/\\/g, '/').replace(/^([a-zA-Z]):/, (_m, d) => d + '%3A');
    const doc = TextDocument.create(uri, 'clarion', 1, SOURCE);
    const lines = SOURCE.split('\n');
    for (let i = 0; i < lines.length; i++) {
        const idx = lines[i].indexOf(needle);
        if (idx === -1) continue;
        const result = await new DefinitionProvider().provideDefinition(
            doc, { line: i, character: idx + offsetIntoNeedle });
        return (Array.isArray(result) ? result[0] : result) as Location | null;
    }
    throw new Error(`needle '${needle}' not found`);
}

/** Character offset of the member half of a dotted reference. */
const member = (ref: string) => ref.indexOf('.') + 2;

suite('Issue #475 — F12 on a dotted field reference', () => {

    setup(() => { tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'f12-475-')); });
    teardown(() => { try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch { /* best-effort */ } });

    test('the FIELD half resolves to the field declaration', async () => {
        const loc = await f12('Customer.Name', member('Customer.Name'));
        assert.ok(loc, 'F12 on Customer.Name must resolve');
        assert.strictEqual(loc!.range.start.line, LINE_CUSTOMER_NAME,
            `must land on the Name field (line ${LINE_CUSTOMER_NAME}); got ${loc!.range.start.line}`);
    });

    test('the field is scoped to its own structure, not a same-named field elsewhere', async () => {
        // Both Customer and Orders declare an `ID`. Orders' is the later one, so a
        // lookup that ignored the structure range would land on Customer's.
        const loc = await f12('Orders.ID', member('Orders.ID'));
        assert.ok(loc, 'F12 on Orders.ID must resolve');
        assert.strictEqual(loc!.range.start.line, LINE_ORDERS_ID,
            `must land on the Orders ID (line ${LINE_ORDERS_ID}), not Customer's; got ${loc!.range.start.line}`);
    });

    test('the QUALIFIER half still resolves to the structure', async () => {
        const loc = await f12('Customer.Name', 1);
        assert.ok(loc, 'F12 on the Customer half must resolve');
        assert.strictEqual(loc!.range.start.line, LINE_CUSTOMER_FILE,
            `cursor on the file name must jump to the FILE (line ${LINE_CUSTOMER_FILE}); got ${loc!.range.start.line}`);
    });

    test('a dotted KEY still resolves (regression guard — this always worked)', async () => {
        const loc = await f12('Customer.CusKey', member('Customer.CusKey'));
        assert.ok(loc, 'F12 on Customer.CusKey must resolve');
        assert.strictEqual(loc!.range.start.line, LINE_CUSKEY,
            `must land on the CusKey declaration (line ${LINE_CUSKEY}); got ${loc!.range.start.line}`);
    });

    test('the prefixed form still resolves (regression guard)', async () => {
        const loc = await f12('ORD:ID', 1);
        assert.ok(loc, 'F12 on ORD:ID must resolve');
        assert.strictEqual(loc!.range.start.line, LINE_ORDERS_ID,
            `must land on the Orders ID (line ${LINE_ORDERS_ID}); got ${loc!.range.start.line}`);
    });
});
