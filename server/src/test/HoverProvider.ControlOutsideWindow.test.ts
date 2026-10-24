import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Hover } from 'vscode-languageserver-protocol';
import { HoverProvider } from '../providers/HoverProvider';
import { ControlService } from '../utils/ControlService';
import { ClarionTokenizer } from '../ClarionTokenizer';
import { SymbolFinderService } from '../services/SymbolFinderService';
import { TokenCache } from '../TokenCache';
import { ScopeAnalyzer } from '../utils/ScopeAnalyzer';
import { setServerInitialized } from '../serverState';

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
 *
 * Declining exposed a second, older gap further down the ladder. When the word sits in a
 * PROCEDURE whose own WINDOW has an unlabelled control of that name, the local-variable
 * lookup matched the control's document symbol (named after its keyword, detail
 * `USE(...)`). SymbolFinderService.findLocalVariable already discards such a match for
 * controls tokenized as Structure (TOOLBAR, MENUBAR); TEXT, BUTTON, ENTRY and the other
 * WindowElement controls slipped through:
 *
 *   Window   WINDOW(...)
 *              TEXT,AT(...),USE(Memo)
 *            END
 *   Amount   LONG(text)       ! text -> "text — USE(Memo)  Local procedure variable"
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

    setup(() => {
        setServerInitialized(true);   // without it the symbol provider returns nothing and the local-variable tier is never exercised
        tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'hover-ctl-'));
    });
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

// ── the local-variable tier: a control of the same name in the procedure's own WINDOW ──

const PROC_SOURCE = [
    "  MEMBER('app')",
    "",
    "  MAP",
    "SomeProc   PROCEDURE()",
    "  END",
    "",
    "SomeProc              PROCEDURE()",
    "Window   WINDOW('Setup'),AT(,,270,130)",
    "           GROUP('Opts'),AT(1,68,267,59),USE(?Grp),BOXED",
    "             TEXT,AT(7,78,257,46),USE(Memo)",
    "           END",
    "           BUTTON('Ok'),AT(10,10),USE(?Ok)",
    "         END",
    "Memo     STRING(200)",
    "Amount   LONG(text)",
    "  CODE",
    "  Amount = text + 1",
    "  Amount = button",
    "  RETURN",
    ""
].join('\n');

const METHOD_SOURCE = [
    "  MEMBER('app')",
    "",
    "  MAP",
    "  END",
    "",
    "ThisClass.Run         PROCEDURE()",
    "Window   WINDOW('Setup'),AT(,,270,130)",
    "           TEXT,AT(7,78,257,46),USE(SELF.Memo)",
    "         END",
    "Amount   LONG(text)",
    "  CODE",
    "  RETURN",
    ""
].join('\n');

const REAL_VARIABLE_SOURCE = [
    "  MEMBER('app')",
    "",
    "  MAP",
    "SomeProc   PROCEDURE()",
    "  END",
    "",
    "SomeProc              PROCEDURE()",
    "Window   WINDOW('Setup'),AT(,,270,130)",
    "           TEXT,AT(7,78,257,46),USE(Memo)",
    "         END",
    "Memo     STRING(200)",
    "Text     STRING(20)",
    "  CODE",
    "  Text = 'x'",
    "  RETURN",
    ""
].join('\n');

suite('Hover — a control in the procedure\'s own WINDOW is not a local variable', () => {

    setup(() => {
        setServerInitialized(true);
        tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'hover-ctl-local-'));
    });
    teardown(() => { try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch { /* best-effort */ } });

    test('`Amount LONG(text)` in a procedure with a TEXT control: not the control as a variable', async () => {
        const text = await hoverOn(PROC_SOURCE, 'LONG(text)', 'LONG('.length + 1);
        assert.ok(!/USE\(Memo\)/.test(text), `text must not bind to the TEXT control's symbol; got: ${text}`);
        assert.ok(!text.includes(controlDescription('TEXT')), `nor be the TEXT control card; got: ${text}`);
    });

    test('`Amount = text + 1` in CODE: not the TEXT control as a variable', async () => {
        const text = await hoverOn(PROC_SOURCE, '= text', '= '.length + 1);
        assert.ok(!/USE\(Memo\)/.test(text), `text must not bind to the TEXT control's symbol; got: ${text}`);
    });

    test('`Amount = button` in CODE: not the BUTTON control as a variable', async () => {
        const text = await hoverOn(PROC_SOURCE, '= button', '= '.length + 1);
        assert.ok(!/USE\(\?Ok\)/.test(text), `button must not bind to the BUTTON control's symbol; got: ${text}`);
        assert.ok(!text.includes(controlDescription('BUTTON')), `nor be the BUTTON control card; got: ${text}`);
    });

    test('a method (`ThisClass.Run`) behaves the same: `LONG(text)` is not the TEXT control', async () => {
        const text = await hoverOn(METHOD_SOURCE, 'LONG(text)', 'LONG('.length + 1);
        assert.ok(!/USE\(SELF\.Memo\)/.test(text), `text must not bind to the TEXT control's symbol; got: ${text}`);
    });

    test('findLocalVariable: an undeclared `text` next to a TEXT control finds nothing', () => {
        const tokens = new ClarionTokenizer(PROC_SOURCE).tokenize();
        const doc = TextDocument.create('test://ControlLocal.clw', 'clarion', 1, PROC_SOURCE);
        const cache = TokenCache.getInstance();
        cache.getTokens(doc);
        const finder = new SymbolFinderService(cache, new ScopeAnalyzer(cache, null));
        const procs = tokens.filter(t => t.label === 'SomeProc' || t.value === 'SomeProc');
        const scope = procs[procs.length - 1];   // the implementation, not the MAP prototype
        assert.ok(scope, 'test precondition: the SomeProc implementation token');
        const result = finder.findLocalVariable('text', tokens, scope, doc);
        assert.strictEqual(result, null, `expected no local named text; got: ${JSON.stringify(result && { line: result.location.line, type: result.type })}`);
    });

    test('a real `Text STRING(20)` beside a TEXT control still resolves to the variable', async () => {
        const text = await hoverOn(REAL_VARIABLE_SOURCE, "Text = 'x'");
        assert.ok(/STRING\(20\)/.test(text), `Text must resolve to its STRING(20) declaration; got: ${text}`);
        assert.ok(!/USE\(Memo\)/.test(text), `and not to the control; got: ${text}`);

        const tokens = new ClarionTokenizer(REAL_VARIABLE_SOURCE).tokenize();
        const doc = TextDocument.create('test://ControlRealVar.clw', 'clarion', 1, REAL_VARIABLE_SOURCE);
        const cache = TokenCache.getInstance();
        cache.getTokens(doc);
        const finder = new SymbolFinderService(cache, new ScopeAnalyzer(cache, null));
        const procs = tokens.filter(t => t.label === 'SomeProc' || t.value === 'SomeProc');
        const result = finder.findLocalVariable('Text', tokens, procs[procs.length - 1], doc);
        const declLine = REAL_VARIABLE_SOURCE.split('\n').findIndex(l => /^Text\s+STRING\(20\)/.test(l));
        assert.ok(result, 'findLocalVariable must find the Text variable');
        assert.strictEqual(result!.location.line, declLine, `must point at the declaration, not the control line`);
    });
});