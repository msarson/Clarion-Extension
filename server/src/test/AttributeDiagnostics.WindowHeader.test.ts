import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Hover } from 'vscode-languageserver-protocol';
import { HoverProvider } from '../providers/HoverProvider';
import { ClarionTokenizer } from '../ClarionTokenizer';
import { validateAttributeApplicability } from '../providers/diagnostics/AttributeDiagnostics';

/**
 * Attributes on a WINDOW header line.
 *
 * The header line has no control context, so attribute validation skipped it and an
 * attribute hover there found nothing. The Clarion 11.1 compiler rejects some attributes
 * that look plausible on a WINDOW — `HIDE` and `PRE(...)` both fail with "unknown
 * attribute" — and HVSCROLL clashes with HSCROLL or VSCROLL (HSCROLL with VSCROLL is
 * fine). The WINDOW entry in clarion-controls.json now lists the attributes it accepts
 * (`attributes`) and the clashing pairs (`exclusive`); the header is checked against them.
 */

let tmpRoot: string;

function docFor(text: string): TextDocument {
    const file = path.join(tmpRoot, 'wh' + Math.random().toString(36).slice(2) + '.clw');
    fs.writeFileSync(file, text);
    const uri = 'file:///' + file.replace(/\\/g, '/').replace(/^([a-zA-Z]):/, (_m, d) => d + '%3A');
    return TextDocument.create(uri, 'clarion', 1, text);
}

function program(header: string[], controls: string[] = ["           BUTTON('Go'),AT(10,70),USE(?Go)"]): string {
    return ["  PROGRAM", "", ...header, ...controls, "         END", "", "  MAP", "  END", "  CODE", "  RETURN", ""].join('\n');
}

function diagnosticsFor(text: string): { line: number; message: string }[] {
    return validateAttributeApplicability(new ClarionTokenizer(text).tokenize(), docFor(text))
        .map(d => ({ line: d.range.start.line, message: String(d.message) }));
}

/** Hover `word` on the line containing `lineNeedle`. */
async function hoverWord(text: string, lineNeedle: string, word: string): Promise<string> {
    const lines = text.split('\n');
    const line = lines.findIndex(l => l.includes(lineNeedle));
    const character = lines[line].lastIndexOf(word) + 1;
    const h: Hover | null = await new HoverProvider().provideHover(docFor(text), { line, character });
    const c = h?.contents as { value?: string } | string | undefined;
    return typeof c === 'string' ? c : (c?.value ?? '');
}

suite('Attributes on a WINDOW header line', () => {
    setup(() => { tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'window-header-')); });
    teardown(() => { try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch { /* ignore */ } });

    test('HIDE on the WINDOW gets a diagnostic; HIDE on a control does not', () => {
        const diags = diagnosticsFor(program(
            ["MyWindow WINDOW('Test'),AT(,,300,200),HIDE"],
            ["           BUTTON('Go'),AT(10,70),USE(?Go),HIDE"]));
        assert.deepStrictEqual(diags.filter(d => /HIDE/.test(d.message)), [{ line: 2, message: 'HIDE is not valid on WINDOW' }]);
    });

    test('PRE on the WINDOW gets a diagnostic', () => {
        const diags = diagnosticsFor(program(["MyWindow WINDOW('Test'),AT(,,300,200),PRE(Scr)"]));
        assert.deepStrictEqual(diags.filter(d => /PRE/.test(d.message)), [{ line: 2, message: 'PRE is not valid on WINDOW' }]);
    });

    // A label spelled like the keyword matched the WINDOW definition by name too, so every
    // problem was reported twice.
    test('a WINDOW labelled `Window`, continued over two lines, reports each problem once', () => {
        const diags = diagnosticsFor(program([
            "Window WINDOW('Test'),AT(,,300,200),MDI,GRAY,FONT('Segoe UI', |",
            "         9,,FONT:regular), HIDE, PRE(Scr)",
        ]));
        assert.deepStrictEqual(diags.map(d => d.message).sort(), ['HIDE is not valid on WINDOW', 'PRE is not valid on WINDOW']);
        assert.ok(diags.every(d => d.line === 3), JSON.stringify(diags));
    });

    test('a valid header, continued over two lines, gets no diagnostic', () => {
        const diags = diagnosticsFor(program([
            "Window WINDOW('Test'),AT(,,300,200),MDI,GRAY,SYSTEM,FONT('Segoe UI', |",
            "         9,,FONT:regular),CENTER,ICON('app.ico'),TIMER(10),ALRT(EscKey),RESIZE",
        ]));
        assert.deepStrictEqual(diags, []);
    });

    test('HSCROLL with VSCROLL is fine; HVSCROLL with either one is a clash', () => {
        assert.deepStrictEqual(diagnosticsFor(program(["MyWindow WINDOW('Test'),AT(,,300,200),HSCROLL,VSCROLL"])), []);
        assert.deepStrictEqual(diagnosticsFor(program(["MyWindow WINDOW('Test'),AT(,,300,200),VSCROLL,HVSCROLL"])).map(d => d.message),
            ['VSCROLL and HVSCROLL are mutually exclusive']);
    });

    test('hover on a WINDOW\'s HIDE shows the attribute and says it is not valid there', async () => {
        const card = await hoverWord(program(["MyWindow WINDOW('Test'),AT(,,300,200),HIDE"]), 'MyWindow', 'HIDE');
        assert.ok(/HIDE is not valid on WINDOW/.test(card), card);
        assert.ok(/Attribute: HIDE/.test(card), card);
    });

    test('hover on a valid WINDOW attribute shows its card, with no warning', async () => {
        const card = await hoverWord(program(["MyWindow WINDOW('Test'),AT(,,300,200),RESIZE"]), 'MyWindow', 'RESIZE');
        assert.ok(/Attribute: RESIZE/.test(card), card);
        assert.ok(!/not valid/.test(card), card);
    });

    test('the TEXT control card lists HSCROLL and VSCROLL beside HVSCROLL', async () => {
        const card = await hoverWord(program(
            ["MyWindow WINDOW('Test'),AT(,,300,200)"],
            ["           TEXT,AT(10,10,100,50),USE(?Notes)"]), 'TEXT,', 'TEXT');
        for (const name of ['HSCROLL', 'VSCROLL', 'HVSCROLL']) {
            assert.ok(new RegExp(`- ${name}\\b`).test(card), `${name}: ${card}`);
        }
    });
});
