import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execFileSync } from 'child_process';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Hover } from 'vscode-languageserver-protocol';
import { HoverProvider } from '../providers/HoverProvider';

/**
 * Control card that shows which attributes the hovered declaration sets.
 *
 * Hovering a control keyword (TEXT) inside its own declaration lists the attributes the
 * declaration actually carries, and, for every flag attribute the control accepts (no
 * parameters, so it can be toggled on/off), whether it is set. The list of attributes a
 * control accepts comes from the TEXT help topic's syntax line, not from
 * clarion-attributes.json's `applicableTo: CONTROL`, which is too coarse (it would offer
 * AUTO/GRAY, none of which the TEXT help lists, and it has no LEFT/RIGHT). The help is not
 * complete either: IMM and CAP are not on the TEXT syntax line but the compiler accepts them
 * (Clarion 11.1); it rejects AUTO, GRAY and MDI on TEXT with "unknown attribute".
 */

let tmpRoot: string;

function docFor(text: string): TextDocument {
    const file = path.join(tmpRoot, 'ca' + Math.random().toString(36).slice(2) + '.clw');
    fs.writeFileSync(file, text);
    const uri = 'file:///' + file.replace(/\\/g, '/').replace(/^([a-zA-Z]):/, (_m, d) => d + '%3A');
    return TextDocument.create(uri, 'clarion', 1, text);
}

async function hoverOn(text: string, needle: string, offset = 1): Promise<string> {
    const doc = docFor(text);
    const lines = text.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
        const idx = lines[i].indexOf(needle);
        if (idx === -1) continue;
        const h: Hover | null = await new HoverProvider().provideHover(doc, { line: i, character: idx + offset });
        if (!h || !h.contents) return '';
        const c = h.contents as { value?: string } | string;
        return typeof c === 'string' ? c : (c.value ?? '');
    }
    throw new Error(`needle '${needle}' not found`);
}

function program(windowLines: string[]): string {
    return [
        "  PROGRAM",
        "",
        "MyWindow WINDOW('Test'),AT(,,300,200)",
        ...windowLines,
        "         END",
        "",
        "  MAP",
        "  END",
        "  CODE",
        "  RETURN",
        ""
    ].join('\n');
}

/** The card section starting at `**<label>:**`, up to the next blank line. */
function cardSection(card: string, label: string): string {
    const start = card.indexOf(`**${label}:**`);
    if (start < 0) return '';
    const end = card.indexOf('\n\n', start);
    return card.slice(start, end < 0 ? undefined : end);
}

/** The names listed under **Available:**, across its wrapped lines. */
function availableNames(card: string): string[] {
    return cardSection(card, 'Available').replace('**Available:**', '').split(/\s*·\s*/).map(n => n.trim()).filter(n => n);
}

/** A flag is set when **Attributes:** carries it as `FLAG`, unset when **Available:** lists it. */
function flagState(card: string, flag: string): 'set' | 'unset' | 'absent' {
    if (cardSection(card, 'Attributes').includes('`' + flag + '`')) return 'set';
    if (availableNames(card).includes(flag)) return 'unset';
    return 'absent';
}

suite('Control card — the attributes the declaration sets', () => {
    setup(() => { tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'hover-ctlattr-')); });
    teardown(() => { try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch { /* ignore */ } });

    const TEXT_DECL = program([
        "           TEXT,AT(10,10,100,50),USE(Loc:Notes),HVSCROLL, |",
        "                READONLY  ! notes are view-only",
        "           BUTTON('Go'),AT(10,70),USE(?Go)",
    ]);

    test('TEXT: compact layout — one-line title, problems first, then Attributes, then Available', async () => {
        const card = await hoverOn(program([
            "           TEXT,AT(10,10,100,50),USE(Loc:Notes),VSCROLL,MDI",
        ]), 'TEXT,');
        assert.ok(card.startsWith('**TEXT** — '), card);
        assert.ok(!/Syntax:|☑|☐/.test(card), card);
        const problem = card.indexOf('⚠');
        const set = card.indexOf('**Attributes:**');
        const available = card.indexOf('**Available:**');
        assert.ok(problem > 0 && problem < set && set < available, card);
        // Available is alphabetical
        const names = availableNames(card);
        assert.deepStrictEqual(names, [...names].sort(), card);
        // a set flag is not repeated under Available
        assert.ok(!names.includes('VSCROLL'), card);
        // Available wraps: several lines, none wider than about 80 characters
        const lines = cardSection(card, 'Available').split('\n');
        assert.ok(lines.length > 1, card);
        for (const line of lines) assert.ok(line.length <= 80, `${line.length}: ${line}`);
    });

    test('TEXT: flags set on the declaration (across a | continuation) are marked set', async () => {
        const card = await hoverOn(TEXT_DECL, 'TEXT,');
        assert.strictEqual(flagState(card, 'HVSCROLL'), 'set', card);
        assert.strictEqual(flagState(card, 'READONLY'), 'set', card);
    });

    test('TEXT: flags the control accepts but the declaration lacks are marked unset', async () => {
        const card = await hoverOn(TEXT_DECL, 'TEXT,');
        for (const f of ['HIDE', 'DISABLE', 'SINGLE', 'HSCROLL', 'VSCROLL', 'SCROLL', 'LEFT', 'RIGHT', 'CENTER', 'IMM', 'CAP']) {
            assert.strictEqual(flagState(card, f), 'unset', `${f}: ${card}`);
        }
    });

    test('TEXT: flags the TEXT help does not list are not offered', async () => {
        const card = await hoverOn(TEXT_DECL, 'TEXT,');
        for (const f of ['AUTO', 'GRAY', 'MDI']) {
            assert.strictEqual(flagState(card, f), 'absent', `${f}: ${card}`);
        }
    });

    // The values are visible in the code right above the card: the card names the attribute only.
    test('TEXT: attributes with a value are listed by name, without their arguments', async () => {
        const card = await hoverOn(TEXT_DECL, 'TEXT,');
        assert.ok(cardSection(card, 'Attributes').includes('`AT`'), card);
        assert.ok(cardSection(card, 'Attributes').includes('`USE`'), card);
        assert.ok(!/10,10,100,50|Loc:Notes/.test(card), card);
        // the trailing comment is not an attribute
        assert.ok(!/notes are view-only/.test(card), card);
    });

    // A USE whose value contains an attribute-like name (`CAP_Field`) and an empty argument.
    test('TEXT: a USE value does not leak attributes into the card', async () => {
        const card = await hoverOn(program([
            "           TEXT,AT(37,21,231,42),USE(SELF.Settings.CAP_Field,, ?SettingsField), VSCROLL, CAP",
        ]), 'TEXT,');
        assert.strictEqual(cardSection(card, 'Attributes'), '**Attributes:** `AT` `USE` `VSCROLL` `CAP`', card);
    });

    test('TEXT: the card is about the hovered declaration, not the next control', async () => {
        const card = await hoverOn(TEXT_DECL, 'TEXT,');
        assert.ok(!card.includes('?Go'), card);
    });

    // #738: both compile, so the card notes the alternatives (ℹ) rather than warning (⚠).
    test('TEXT: alternative flags are noted, not warned about', async () => {
        const card = await hoverOn(program([
            "           TEXT,AT(10,10,100,50),USE(Loc:Notes),HSCROLL,HVSCROLL",
        ]), 'TEXT,');
        assert.ok(card.includes('ℹ HSCROLL and HVSCROLL are alternatives: the help gives one of them, though both compile'), card);
        assert.ok(!/⚠|exclusive/.test(card), card);
    });

    // HSCROLL and VSCROLL together are fine (HVSCROLL is just the shorter form); only HVSCROLL
    // clashes with either of them.
    test('TEXT: HSCROLL with VSCROLL is not a clash', async () => {
        const card = await hoverOn(program([
            "           TEXT,AT(10,10,100,50),USE(Loc:Notes),HSCROLL,VSCROLL",
        ]), 'TEXT,');
        assert.ok(!/exclusive/i.test(card), card);
    });

    test('TEXT: an attribute TEXT does not accept is reported as such', async () => {
        const card = await hoverOn(program([
            "           TEXT,AT(10,10,100,50),USE(Loc:Notes),MDI",
        ]), 'TEXT,');
        assert.ok(/MDI.*not valid on TEXT/i.test(card), card);
    });

    test('labelled TEXT (Notes TEXT,...) gets the same card', async () => {
        const card = await hoverOn(program([
            "Notes      TEXT,AT(10,10,100,50),USE(Loc:Notes),READONLY",
        ]), 'TEXT,');
        assert.strictEqual(flagState(card, 'READONLY'), 'set', card);
    });

    test('a line in CODE that opens with a control name gets no card', async () => {
        const text = program([
            "           TEXT,AT(10,10,100,50),USE(?Notes)",
        ]).replace("  RETURN", "  Text{PROP:Hide} = 1\n  RETURN");
        const card = await hoverOn(text, 'Text{');
        assert.ok(!/\*\*Attributes:\*\*|\*\*Available:\*\*/.test(card), card);
    });

    // Compiled on Clarion 10 and 12: RESIZE on a WINDOW's TEXT is "Unknown attribute", and a
    // bare RTF is "Wrong number of parameters" (it takes a save target, RTF(TEXT:Field)).
    test('TEXT in a WINDOW: RESIZE (report only) and RTF (takes a value) are not offered', async () => {
        const card = await hoverOn(TEXT_DECL, 'TEXT,');
        for (const f of ['RESIZE', 'RTF']) {
            assert.strictEqual(flagState(card, f), 'absent', `${f}: ${card}`);
        }
    });

    const REPORT_DECL = [
        "  PROGRAM",
        "",
        "MyReport REPORT,AT(0,0,8000,10000)",
        "Detail     DETAIL,AT(,,8000,1000)",
        "             TEXT,AT(1,1,500,500),USE(Loc:Notes),BOXED,REQ",
        "           END",
        "         END",
        "",
        "  MAP",
        "  END",
        "  CODE",
        "  RETURN",
        "",
    ].join('\n');

    // Compiled on Clarion 10 and 12: a REPORT's TEXT rejects every one of these as
    // "Unknown attribute", and accepts RESIZE, which a WINDOW's TEXT rejects.
    test('TEXT in a REPORT: offers only what a report accepts, and flags the rest', async () => {
        const card = await hoverOn(REPORT_DECL, 'TEXT,');
        for (const f of ['FLAT', 'FULL', 'HSCROLL', 'VSCROLL', 'HVSCROLL', 'READONLY', 'SCROLL', 'SINGLE']) {
            assert.strictEqual(flagState(card, f), 'absent', `${f}: ${card}`);
        }
        assert.strictEqual(flagState(card, 'RESIZE'), 'unset', card);
        assert.strictEqual(flagState(card, 'BOXED'), 'set', card);
        assert.ok(/REQ.*not valid on TEXT/i.test(card), card);
    });

    // #737: every control has a compiler-checked list (test-programs/ControlAttributesTest).
    const reportWith = (control: string) => REPORT_DECL.replace("TEXT,AT(1,1,500,500),USE(Loc:Notes),BOXED,REQ", control);

    test('#737 a picture STRING in a REPORT offers the totals; a constant STRING does not take them', async () => {
        const picture = await hoverOn(reportWith('STRING(@n9),AT(1,1,500,200),USE(Loc:Total),SUM'), 'STRING(');
        assert.strictEqual(flagState(picture, 'SUM'), 'set', picture);
        for (const f of ['CNT', 'AVE', 'PAGENO']) assert.strictEqual(flagState(picture, f), 'unset', `${f}: ${picture}`);
        const constant = await hoverOn(reportWith("STRING('Total'),AT(1,1,500,200),SUM"), 'STRING(');
        assert.ok(/SUM.*not valid on STRING/i.test(constant), constant);
        assert.strictEqual(flagState(constant, 'PAGENO'), 'absent', constant);
    });

    test('#737 a BUTTON, a LIST, a SHEET and a menu ITEM get the card', async () => {
        const button = await hoverOn(program(["           BUTTON('Go'),AT(10,70),USE(?Go),DEFAULT"]), 'BUTTON(');
        assert.strictEqual(flagState(button, 'DEFAULT'), 'set', button);
        assert.strictEqual(flagState(button, 'FLAT'), 'unset', button);
        assert.strictEqual(flagState(button, 'HVSCROLL'), 'absent', button);
        const list = await hoverOn(program(["           LIST,AT(10,10,100,50),USE(?L),VSCROLL"]), 'LIST,');
        for (const f of ['IMM', 'NOBAR', 'COLUMN']) assert.strictEqual(flagState(list, f), 'unset', `${f}: ${list}`);
        const sheet = await hoverOn(program(["           SHEET,AT(1,1,100,100),USE(?S),WIZARD", "             TAB('t'),USE(?T)", "             END", "           END"]), 'SHEET,');
        assert.strictEqual(flagState(sheet, 'WIZARD'), 'set', sheet);
        assert.strictEqual(flagState(sheet, 'NOSHEET'), 'unset', sheet);
        const item = await hoverOn(program(["           MENUBAR", "             MENU('File')", "               ITEM('Exit'),USE(?Exit),SEPARATOR", "             END", "           END"]), 'ITEM(');
        assert.strictEqual(flagState(item, 'SEPARATOR'), 'set', item);
        assert.strictEqual(flagState(item, 'CHECK'), 'unset', item);
    });

    // STRING and GROUP are data types too: a data declaration is not a control.
    test('#737 a STRING or GROUP data declaration gets no control card', async () => {
        const text = program([]).replace("  MAP", "Name     STRING(30),PRIVATE\nSettings GROUP,PRE(Set),STATIC\nFlag       BYTE\n         END\n  MAP");
        for (const needle of ['STRING(30)', 'GROUP,']) {
            const card = await hoverOn(text, needle);
            assert.ok(!/\*\*Attributes:\*\*|\*\*Available:\*\*|not valid on/.test(card), `${needle}: ${card}`);
        }
    });

    test('#737 clarion-controls.json holds what the compiler results say', () => {
        const apply = path.resolve(__dirname, '..', '..', '..', '..', 'test-programs', 'ControlAttributesTest', 'apply.js');
        execFileSync(process.execPath, [apply, '--check'], { stdio: 'pipe' });
    });
});
