import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Hover } from 'vscode-languageserver-protocol';
import { HoverProvider } from '../providers/HoverProvider';
import { prefersAttributeMeaning } from '../utils/AttributeContextGuards';

/**
 * Issue #472 — `PROJECT`, a VIEW's `JOIN`, and a FILE's `KEY` had no hover at all,
 * while `VIEW`, `FILE` and `RECORD` beside them did, so the gap looked arbitrary.
 *
 * None of the three had a data entry describing it as a language element. A name search
 * said otherwise and was misleading: `clarion-attributes.json` contains entries named
 * `JOIN` and `KEY`, but they are DIFFERENT language elements sharing a spelling —
 *
 *   JOIN  the SHEET attribute (`PROP:Join`), "TABs display all on one row"
 *   KEY   the CONTROL attribute (`PROP:Key`), "sets the execution keycode"
 *
 * — so the structural meanings were genuinely absent.
 *
 * Adding them is not enough on its own, and this is the part worth guarding: data-type
 * resolution runs BEFORE attribute resolution in the hover ladder and is a pure name
 * lookup with no positional awareness. Adding a structural `JOIN` therefore shadowed the
 * SHEET attribute — verified: a SHEET's `,JOIN` started reporting "Relates a second file
 * to a VIEW through one of its keys", where it had correctly said `**Attribute: JOIN**`
 * before. `prefersAttributeMeaning` restores that, and the two `attribute position` tests
 * below are what stop it regressing.
 */

let tmpRoot: string;

function hoverOn(text: string, needle: string, offset = 1): Promise<string> {
    const file = path.join(tmpRoot, 'kw' + Math.random().toString(36).slice(2) + '.clw');
    fs.writeFileSync(file, text);
    const uri = 'file:///' + file.replace(/\\/g, '/').replace(/^([a-zA-Z]):/, (_m, d) => d + '%3A');
    const doc = TextDocument.create(uri, 'clarion', 1, text);
    const lines = text.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
        const idx = lines[i].indexOf(needle);
        if (idx === -1) continue;
        const character = idx + (needle.startsWith(',') ? 1 : 0) + offset;
        return new HoverProvider().provideHover(doc, { line: i, character }).then((h: Hover | null) => {
            if (!h || !h.contents) return '';
            const c = h.contents as { value?: string } | string;
            return typeof c === 'string' ? c : (c.value ?? '');
        });
    }
    throw new Error(`needle '${needle}' not found`);
}

const VIEW_SOURCE = [
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
    "                       JOIN(CUS:CusKey, CUS:ID)",
    "                       END",
    "                     END",
    "",
    "  MAP",
    "  END",
    "  CODE",
    "  RETURN",
    ""
].join('\n');

const WINDOW_SOURCE = [
    "  PROGRAM",
    "",
    "MyWindow WINDOW(1),AT(,,300,200)",
    "           SHEET,AT(10,10,280,180),JOIN",
    "             TAB('One')",
    "             END",
    "           END",
    "           BUTTON('Go'),AT(10,10),USE(?Go),KEY(EnterKey)",
    "         END",
    "",
    "  MAP",
    "  END",
    "  CODE",
    "  RETURN",
    ""
].join('\n');

suite('Issue #472 — structural keywords PROJECT / JOIN / KEY hover', () => {

    setup(() => { tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'hover-472-')); });
    teardown(() => { try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch { /* best-effort */ } });

    // ── the gap #472 reported ─────────────────────────────────────────────────
    test('PROJECT in a VIEW hovers', async () => {
        const text = await hoverOn(VIEW_SOURCE, 'PROJECT(');
        assert.notStrictEqual(text, '', 'PROJECT must produce a hover');
        assert.ok(/VIEW/i.test(text), `hover must place it in a VIEW; got: ${text}`);
    });

    test('JOIN in a VIEW hovers as the relational clause', async () => {
        const text = await hoverOn(VIEW_SOURCE, 'JOIN(');
        assert.notStrictEqual(text, '', 'JOIN must produce a hover');
        assert.ok(/VIEW/i.test(text), `hover must place it in a VIEW; got: ${text}`);
        assert.ok(!/TAB/i.test(text), `must not be the SHEET attribute meaning; got: ${text}`);
    });

    test('KEY in a FILE hovers as the access path', async () => {
        const text = await hoverOn(VIEW_SOURCE, 'KEY(CUS:ID');
        assert.notStrictEqual(text, '', 'KEY must produce a hover');
        assert.ok(/FILE/i.test(text), `hover must place it in a FILE; got: ${text}`);
        assert.ok(!/keycode/i.test(text), `must not be the CONTROL attribute meaning; got: ${text}`);
    });

    // ── the shadowing these entries would otherwise cause ─────────────────────
    // NOTE: do not assert merely /Attribute/i here. The data-type card renders an
    // "Attributes:" section of its own, so that matches BOTH meanings and the test
    // passes even with the guard removed. Assert on wording unique to each meaning.
    test('attribute position: a SHEET\'s ,JOIN keeps the ATTRIBUTE meaning', async () => {
        const text = await hoverOn(WINDOW_SOURCE, ',JOIN');
        assert.ok(/TAB/i.test(text),
            `a SHEET's ,JOIN must describe TAB display; got: ${text}`);
        assert.ok(!/Relates a second file/i.test(text),
            `must NOT be the VIEW clause meaning; got: ${text}`);
    });

    test('attribute position: a CONTROL\'s ,KEY keeps the ATTRIBUTE meaning', async () => {
        const text = await hoverOn(WINDOW_SOURCE, 'KEY(EnterKey');
        assert.ok(/keycode/i.test(text),
            `a control's ,KEY must describe the execution keycode; got: ${text}`);
        assert.ok(!/access path/i.test(text),
            `must NOT be the FILE structure meaning; got: ${text}`);
    });

    // ── the guard itself ──────────────────────────────────────────────────────
    test('prefersAttributeMeaning fires only in attribute position', () => {
        assert.strictEqual(
            prefersAttributeMeaning('JOIN', { isInWindowContext: true, hasLabelBefore: false }), true,
            'window context with no label is attribute position');
        assert.strictEqual(
            prefersAttributeMeaning('JOIN', { isInWindowContext: false, hasLabelBefore: false }), false,
            'outside a window a JOIN is the VIEW clause');
        assert.strictEqual(
            prefersAttributeMeaning('KEY', { isInWindowContext: true, hasLabelBefore: true }), false,
            'a label before the word makes it a declaration, not an attribute');
        assert.strictEqual(
            prefersAttributeMeaning('PROJECT', { isInWindowContext: true, hasLabelBefore: false }), false,
            'PROJECT has no attribute meaning to defer to');
    });
});
