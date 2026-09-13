import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Hover } from 'vscode-languageserver-protocol';
import { HoverProvider } from '../providers/HoverProvider';

/**
 * Issue #474 — a qualified field reference with NO enclosing PROCEDURE scope produced
 * either nothing or the wrong thing. Both symptoms, one cause.
 *
 * `HoverProvider.provideHover` has an early `if (!currentScope)` branch. Everything that
 * resolves a field lives after it, so a reference in the data section — a VIEW's
 * `PROJECT(CUS:Name)`, a `KEY(CUS:ID)`, a module-level assignment — never reached any of
 * it. What each form did instead:
 *
 *   CUS:Name    nothing at all. The branch ran out of options and returned null.
 *   Orders.ID   `**Orders** — FILE`. `HoverContextBuilder` truncates the word at the dot,
 *               so the branch saw the bare word `Orders`, which IS a real global label —
 *               `findGlobalVariableHover` answered with the FILE and the field was never
 *               looked up. The more confusing half: it looks like a working hover.
 *
 * The dotted fix therefore reads the TOKEN, not the word, and must run BEFORE the global
 * check. Widening word extraction was not an option — the dot is also the chained-access
 * separator (`SELF.records.alpha`) and the chained resolver depends on the current split.
 *
 * Scope is the real variable, not the file. An identical reference INSIDE a procedure
 * always worked, in the same file or across a MEMBER boundary, which is why the existing
 * cross-file coverage (#327) stayed green throughout.
 */

interface Fixture { uri: string; text: string; }

let tmpRoot: string;

function writeFixture(name: string, text: string): Fixture {
    const file = path.join(tmpRoot, name);
    fs.writeFileSync(file, text);
    return { uri: 'file:///' + file.replace(/\\/g, '/').replace(/^([a-zA-Z]):/, (_m, d) => d + '%3A'), text };
}

function cursorOn(text: string, needle: string, offset = 1) {
    const lines = text.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
        const idx = lines[i].indexOf(needle);
        if (idx !== -1) return { line: i, character: idx + offset };
    }
    throw new Error(`cursorOn: '${needle}' not found`);
}

async function hoverText(fix: Fixture, needle: string): Promise<string> {
    const doc = TextDocument.create(fix.uri, 'clarion', 1, fix.text);
    const hover = await new HoverProvider().provideHover(doc, cursorOn(fix.text, needle)) as Hover | null;
    if (!hover || !hover.contents) return '';
    const c = hover.contents as { value?: string } | string;
    return typeof c === 'string' ? c : (c.value ?? '');
}

/** A FILE with a PRE() prefix and a VIEW over it — every reference at module level. */
const DATA_SECTION = [
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
    "MyView               VIEW(Customer)",
    "                       PROJECT(CUS:Name)",
    "                       PROJECT(Customer.ID)",
    "                     END",
    "",
    "  MAP",
    "  END",
    "  CODE",
    "  RETURN",
    ""
].join('\n');

suite('Issue #474 — qualified field hover with no enclosing procedure scope', () => {

    setup(() => { tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'hover-474-')); });
    teardown(() => { try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch { /* best-effort */ } });

    test('a PRE:Field inside a VIEW PROJECT resolves to the field', async () => {
        const text = await hoverText(writeFixture('view.clw', DATA_SECTION), 'CUS:Name');
        assert.notStrictEqual(text, '', 'PROJECT(CUS:Name) must produce a hover');
        assert.ok(/Name/.test(text), `hover must describe the Name field; got: ${text}`);
        assert.ok(/STRING/i.test(text), `hover must carry the field's type; got: ${text}`);
    });

    test('a PRE:Field inside a KEY declaration resolves to the field', async () => {
        // `CUS:ID` occurs only inside KEY(...) in this fixture, so the bare needle
        // puts the cursor on the field itself rather than on the KEY keyword.
        const text = await hoverText(writeFixture('key.clw', DATA_SECTION), 'CUS:ID');
        assert.notStrictEqual(text, '', 'KEY(CUS:ID) must produce a hover');
        assert.ok(/LONG/i.test(text), `hover must carry the field's type; got: ${text}`);
    });

    test('a dotted field describes the FIELD, not the FILE that qualifies it', async () => {
        const text = await hoverText(writeFixture('dotted.clw', DATA_SECTION), 'Customer.ID');
        assert.notStrictEqual(text, '', 'PROJECT(Customer.ID) must produce a hover');
        assert.ok(/LONG/i.test(text),
            `must describe the ID field and its type, not the Customer FILE; got: ${text}`);
        assert.ok(!/—\s*`?FILE`?\s*$/m.test(text.trim()),
            `must not answer with the FILE declaration; got: ${text}`);
    });

    test('a bare structure name still hovers as the structure', async () => {
        // Regression guard for the reordering: the dotted check runs before the global
        // lookup, so an unqualified label must still reach it and answer as before.
        const text = await hoverText(writeFixture('bare.clw', DATA_SECTION), 'VIEW(Customer');
        assert.ok(/Customer/.test(text), `a bare structure name must still hover; got: ${text}`);
    });

    test('scope, not file location, was the variable — inside a procedure still works', async () => {
        const withProc = [
            "  PROGRAM",
            "GloQ     QUEUE,PRE(GLO)",
            "Amount     LONG",
            "         END",
            "  MAP",
            "Child      PROCEDURE",
            "  END",
            "  CODE",
            "  RETURN",
            "Child  PROCEDURE",
            "  CODE",
            "  GLO:Amount += 1",
            "  RETURN",
            ""
        ].join('\n');
        const text = await hoverText(writeFixture('proc.clw', withProc), 'GLO:Amount +');
        assert.notStrictEqual(text, '', 'the in-procedure case must keep working');
        assert.ok(/LONG/i.test(text), `hover must carry the field's type; got: ${text}`);
    });
});
