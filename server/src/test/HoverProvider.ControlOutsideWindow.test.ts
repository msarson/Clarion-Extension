import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Hover } from 'vscode-languageserver-protocol';
import { HoverProvider } from '../providers/HoverProvider';
import { ControlService } from '../utils/ControlService';

/**
 * A word spelled like a window control hovered as that control anywhere in the file.
 *
 * SymbolHoverResolver.resolve() checks data types first whenever the word has a label
 * before it or sits outside a WINDOW/APPLICATION/REPORT, then fell back to checkControl —
 * a pure name lookup. So outside any window:
 *
 *   Amount   LONG(text)        ! hover text   -> "TEXT: Declares a multi-line text control..."
 *   Amount = text + 1          ! hover text   -> the same control card
 *   Button   LONG              ! a variable labelled Button, hovered in CODE -> the BUTTON control
 *
 * A control can only be declared inside a WINDOW/APPLICATION/REPORT, so outside one the
 * control fallback now declines and the rest of the hover ladder answers. Inside a window
 * nothing changes: an unlabelled control keyword still checks controls first, and a
 * labelled control still falls back to the control card after the data-type check.
 */

let tmpRoot: string;

function hoverOn(text: string, needle: string, offset = 1, occurrence = 0): Promise<string> {
    const file = path.join(tmpRoot, 'ctl' + Math.random().toString(36).slice(2) + '.clw');
    fs.writeFileSync(file, text);
    const uri = 'file:///' + file.replace(/\\/g, '/').replace(/^([a-zA-Z]):/, (_m, d) => d + '%3A');
    const doc = TextDocument.create(uri, 'clarion', 1, text);
    const lines = text.split(/\r?\n/);
    let seen = 0;
    for (let i = 0; i < lines.length; i++) {
        const idx = lines[i].indexOf(needle);
        if (idx === -1) continue;
        if (seen++ < occurrence) continue;
        return new HoverProvider().provideHover(doc, { line: i, character: idx + offset }).then((h: Hover | null) => {
            if (!h || !h.contents) return '';
            const c = h.contents as { value?: string } | string;
            return typeof c === 'string' ? c : (c.value ?? '');
        });
    }
    throw new Error(`needle '${needle}' (occurrence ${occurrence}) not found`);
}

/** The control card's own description line: wording unique to the control meaning. */
function controlDescription(name: string): string {
    const control = ControlService.getInstance().getControl(name);
    assert.ok(control && control.description, `test precondition: ${name} is a known control with a description`);
    return control!.description;
}

const SOURCE = [
    "  PROGRAM",
    "",
    "  MAP",
    "  END",
    "",
    "Window   WINDOW('Setup'),AT(,,270,130)",
    "           TEXT,AT(7,78,257,46),USE(?Memo)",
    "           BUTTON('Ok'),AT(10,10),USE(?Ok)",
    "Notes      TEXT,AT(7,20,257,46),USE(?Notes)",
    "         END",
    "",
    "Amount   LONG(text)",
    "Button   LONG",
    "",
    "  CODE",
    "  Amount = text + 1",
    "  Button = 1",
    "  RETURN",
    ""
].join('\n');

suite('Hover — a word spelled like a control, outside any WINDOW', () => {

    setup(() => { tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'hover-ctl-')); });
    teardown(() => { try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch { /* best-effort */ } });

    // ── the bug ───────────────────────────────────────────────────────────────
    test('`Amount LONG(text)`: text in a declaration\'s initial value is not the TEXT control', async () => {
        const text = await hoverOn(SOURCE, 'LONG(text)', 'LONG('.length + 1);
        assert.ok(!text.includes(controlDescription('TEXT')),
            `text in LONG(text) must not hover as the TEXT control; got: ${text}`);
    });

    test('`Amount = text + 1`: text in a CODE expression is not the TEXT control', async () => {
        const text = await hoverOn(SOURCE, '= text', '= '.length + 1);
        assert.ok(!text.includes(controlDescription('TEXT')),
            `text in an expression must not hover as the TEXT control; got: ${text}`);
    });

    test('`Button = 1`: a variable labelled Button is not the BUTTON control', async () => {
        const text = await hoverOn(SOURCE, 'Button = 1');
        assert.ok(!text.includes(controlDescription('BUTTON')),
            `a variable named Button must not hover as the BUTTON control; got: ${text}`);
    });

    // ── unchanged inside a window ─────────────────────────────────────────────
    test('TEXT,AT(...) inside a WINDOW still hovers as the TEXT control', async () => {
        const text = await hoverOn(SOURCE, 'TEXT,AT(7,78');
        assert.ok(text.includes(controlDescription('TEXT')),
            `an unlabelled TEXT control must keep its control card; got: ${text}`);
    });

    test('BUTTON(...) inside a WINDOW still hovers as the BUTTON control', async () => {
        const text = await hoverOn(SOURCE, "BUTTON('Ok')");
        assert.ok(text.includes(controlDescription('BUTTON')),
            `an unlabelled BUTTON control must keep its control card; got: ${text}`);
    });

    test('a labelled control inside a WINDOW (`Notes TEXT,AT(...)`) still hovers as the control', async () => {
        const text = await hoverOn(SOURCE, 'TEXT,AT(7,20');
        assert.ok(text.includes(controlDescription('TEXT')),
            `a labelled TEXT control must keep its control card (data-type miss, then control); got: ${text}`);
    });
});
