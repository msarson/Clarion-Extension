import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Hover } from 'vscode-languageserver-protocol';
import { HoverProvider } from '../providers/HoverProvider';
import { clientFeatures } from '../utils/ClientFeatures';
import { SolutionManager } from '../solution/solutionManager';

/**
 * Click-to-toggle attribute links on a control card.
 *
 * A client that announces `capabilities.experimental.clarionAttributeEditLinks` gets the card's
 * flag names as links: under **Attributes:** a link removes the flag, under **Available:** it adds
 * it. Each link carries the exact text edits (relative to the hovered line) plus the original text
 * of every line they touch, so the client only checks and applies them — all Clarion knowledge
 * (commas, `|` continuations, comments, mutually exclusive groups) stays here, where it is tested.
 *
 * Link: [NAME](command:clarion.applyAttributeEdit?<args> "Add NAME — short description")
 * args: encodeURIComponent(JSON.stringify([payload])), with `(` and `)` encoded too (#739).
 * payload: { e: [ { l, c, el, ec, t, o } ] } — l/el lines relative to the hovered line, c/ec 0-based
 * columns, t the new text, o the original text of lines l..el.
 */

interface LinkEdit { l: number; c: number; el: number; ec: number; t: string; o: string[]; }
interface CardLink { name: string; title: string; edits: LinkEdit[]; }

let tmpRoot: string;

function docFor(text: string): TextDocument {
    const file = path.join(tmpRoot, 'el' + Math.random().toString(36).slice(2) + '.clw');
    fs.writeFileSync(file, text);
    const uri = 'file:///' + file.replace(/\\/g, '/').replace(/^([a-zA-Z]):/, (_m, d) => d + '%3A');
    return TextDocument.create(uri, 'clarion', 1, text);
}

/** Hover the first `TEXT,` in `text`; returns the card and the hovered (0-based) line. */
async function hoverText(text: string): Promise<{ card: string; line: number }> {
    const lines = text.split('\n');
    const line = lines.findIndex(l => l.includes('TEXT,'));
    const h: Hover | null = await new HoverProvider().provideHover(docFor(text), { line, character: lines[line].indexOf('TEXT,') + 1 });
    const c = h?.contents as { value?: string } | undefined;
    return { card: c?.value ?? '', line };
}

function links(card: string): CardLink[] {
    const result: CardLink[] = [];
    // The target must hold no raw parenthesis: one would end the markdown link early.
    const re = /\[([A-Z0-9]+)\]\(command:clarion\.applyAttributeEdit\?([^\s()"]+) "([^"]*)"\)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(card))) {
        const args = JSON.parse(decodeURIComponent(m[2]));
        // The server sends the payload alone; a client adds the hovered position itself.
        assert.ok(Array.isArray(args) && args.length === 1, `args must be [payload]: ${m[2]}`);
        result.push({ name: m[1], title: m[3], edits: args[0].e });
    }
    return result;
}

function linkFor(card: string, name: string): CardLink {
    const l = links(card).find(x => x.name === name);
    assert.ok(l, `no link for ${name}: ${card}`);
    return l!;
}

/** Apply a link's edits the way the client does: check the original lines, then splice from the end. */
function apply(text: string, anchor: number, link: CardLink): string {
    const lines = text.split('\n');
    for (const e of link.edits) {
        e.o.forEach((o, i) => assert.strictEqual(lines[anchor + e.l + i], o, 'original line check'));
    }
    const offset = (line: number, col: number) => lines.slice(0, line).reduce((n, l) => n + l.length + 1, 0) + col;
    const spans = link.edits
        .map(e => ({ start: offset(anchor + e.l, e.c), end: offset(anchor + e.el, e.ec), t: e.t }))
        .sort((a, b) => b.start - a.start);
    let out = text;
    for (const s of spans) out = out.slice(0, s.start) + s.t + out.slice(s.end);
    return out;
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

/** Hover the first `needle` in `text`; returns the card. */
async function hoverOn(text: string, needle: string, doc = docFor(text)): Promise<string> {
    const lines = text.split('\n');
    const line = lines.findIndex(l => l.includes(needle));
    const h: Hover | null = await new HoverProvider().provideHover(doc, { line, character: lines[line].indexOf(needle) + 1 });
    return (h?.contents as { value?: string } | undefined)?.value ?? '';
}

/** Hover in a document whose project's .cwproj marks it `<Generated>` (true) or not (false). */
async function hoverInProject(text: string, needle: string, generated: boolean): Promise<string> {
    const doc = docFor(text);
    const file = path.basename(decodeURIComponent(doc.uri));
    const holder = SolutionManager as unknown as { instance: unknown };
    const saved = holder.instance;
    holder.instance = {
        solution: { projects: [] },
        findProjectForFile: () => ({ path: tmpRoot, sourceFiles: [{ relativePath: file, generated }] }),
        getProjectPathForFile: () => tmpRoot,
        getEquatesTokens: () => [],
        getEquatesPath: () => undefined,
        findFileWithExtension: () => null,
    };
    try {
        return await hoverOn(text, needle, doc);
    } finally {
        holder.instance = saved;
    }
}

const REPORT_DECL = [
    "  PROGRAM",
    "",
    "MyReport REPORT,AT(0,0,8000,10000)",
    "Detail     DETAIL,AT(,,8000,1000)",
    "             TEXT,AT(1,1,500,500),USE(?T),BOXED,REQ",
    "           END",
    "         END",
    "",
    "  MAP",
    "  END",
    "  CODE",
    "  RETURN",
    "",
].join('\n');

/** The TEXT declaration lines of a program, for exact comparison. */
function decl(text: string): string[] {
    const lines = text.split('\n');
    const start = lines.findIndex(l => l.includes('TEXT,'));
    const end = lines.findIndex((l, i) => i > start && /^\s+END\s*$/.test(l));
    return lines.slice(start, end);
}

suite('Control card — attribute edit links', () => {
    setup(() => {
        tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'hover-editlinks-'));
        clientFeatures.attributeEditLinks = true;
    });
    teardown(() => {
        clientFeatures.attributeEditLinks = false;
        try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch { /* ignore */ }
    });

    test('no links unless the client asked for them', async () => {
        clientFeatures.attributeEditLinks = false;
        const { card } = await hoverText(program(["      TEXT,AT(10,10,100,50),USE(?T),VSCROLL"]));
        assert.strictEqual(links(card).length, 0, card);
        assert.ok(card.includes('**Available:**'), card);
    });

    test('flags are links — remove under Attributes, add under Available; AT/USE remove too (#743)', async () => {
        const { card } = await hoverText(program(["      TEXT,AT(10,10,100,50),USE(?T),VSCROLL"]));
        const attributes = card.slice(card.indexOf('**Attributes:**'), card.indexOf('**Available:**'));
        assert.ok(linkFor(attributes, 'AT').title.startsWith('Remove AT(10,10,100,50)'), card);
        assert.ok(linkFor(attributes, 'USE').title.startsWith('Remove USE(?T)'), card);
        assert.strictEqual(linkFor(attributes, 'VSCROLL').title.indexOf('Remove VSCROLL'), 0, card);
        assert.strictEqual(linkFor(card, 'HIDE').title, 'Add HIDE — hidden until UNHIDE', card);
        assert.ok(!card.includes(' · '), 'linked names need no separators: ' + card);
    });

    test('a flag with no short description gets a plain title', async () => {
        const { card } = await hoverText(program(["      TEXT,AT(10,10,100,50),USE(?T),VSCROLL"]));
        assert.strictEqual(linkFor(card, 'LEFT').title, 'Add LEFT', card);
    });

    test('add: appended to the end of the code, before a trailing comment', async () => {
        const src = program(["      TEXT,AT(10,10,100,50),USE(?T),VSCROLL  ! the notes"]);
        const { card, line } = await hoverText(src);
        assert.deepStrictEqual(decl(apply(src, line, linkFor(card, 'HIDE'))),
            ["      TEXT,AT(10,10,100,50),USE(?T),VSCROLL,HIDE  ! the notes"]);
    });

    test('add on a continued declaration goes on its last line', async () => {
        const src = program([
            "      TEXT,AT(10,10,100,50),USE(?T), |",
            "           VSCROLL",
        ]);
        const { card, line } = await hoverText(src);
        assert.deepStrictEqual(decl(apply(src, line, linkFor(card, 'HIDE'))), [
            "      TEXT,AT(10,10,100,50),USE(?T), |",
            "           VSCROLL,HIDE",
        ]);
    });

    test('remove: a flag in the middle of a line takes its comma with it', async () => {
        const src = program(["      TEXT,AT(10,10,100,50),USE(?T), VSCROLL, READONLY"]);
        const { card, line } = await hoverText(src);
        assert.deepStrictEqual(decl(apply(src, line, linkFor(card, 'VSCROLL'))),
            ["      TEXT,AT(10,10,100,50),USE(?T), READONLY"]);
    });

    test('remove: a flag opening a continuation line, more attributes after it', async () => {
        const src = program([
            "      TEXT,AT(10,10,100,50),USE(?T), |",
            "           READONLY,VSCROLL",
        ]);
        const { card, line } = await hoverText(src);
        assert.deepStrictEqual(decl(apply(src, line, linkFor(card, 'READONLY'))), [
            "      TEXT,AT(10,10,100,50),USE(?T),VSCROLL",
        ]);
    });

    test('remove: the only flag on the last continuation line — the declaration stays valid', async () => {
        const src = program([
            "      TEXT,AT(10,10,100,50),USE(?T), |",
            "           READONLY  ! view only",
        ]);
        const { card, line } = await hoverText(src);
        const after = decl(apply(src, line, linkFor(card, 'READONLY')));
        assert.deepStrictEqual(after, ["      TEXT,AT(10,10,100,50),USE(?T)  ! view only"]);
    });

    test('add: a mutually exclusive partner is replaced, not kept beside it', async () => {
        const src = program(["      TEXT,AT(10,10,100,50),USE(?T),VSCROLL,READONLY"]);
        const { card, line } = await hoverText(src);
        assert.deepStrictEqual(decl(apply(src, line, linkFor(card, 'HVSCROLL'))),
            ["      TEXT,AT(10,10,100,50),USE(?T),HVSCROLL,READONLY"]);
    });

    test('add: two exclusive partners present — the first is replaced, the other removed', async () => {
        const src = program(["      TEXT,AT(10,10,100,50),USE(?T),HSCROLL,VSCROLL,READONLY"]);
        const { card, line } = await hoverText(src);
        assert.deepStrictEqual(decl(apply(src, line, linkFor(card, 'HVSCROLL'))),
            ["      TEXT,AT(10,10,100,50),USE(?T),HVSCROLL,READONLY"]);
    });

    // HSCROLL and VSCROLL may be set together; only HVSCROLL replaces either of them.
    // With HVSCROLL set, clicking VSCROLL means "vertical only": it replaces HVSCROLL.
    test('add: VSCROLL while HVSCROLL is set replaces HVSCROLL', async () => {
        const src = program(["      TEXT,AT(10,10,100,50),USE(?T),HVSCROLL,READONLY"]);
        const { card, line } = await hoverText(src);
        assert.deepStrictEqual(decl(apply(src, line, linkFor(card, 'VSCROLL'))),
            ["      TEXT,AT(10,10,100,50),USE(?T),VSCROLL,READONLY"]);
    });

    test('add: VSCROLL beside HSCROLL keeps HSCROLL', async () => {
        const src = program(["      TEXT,AT(10,10,100,50),USE(?T),HSCROLL"]);
        const { card, line } = await hoverText(src);
        assert.deepStrictEqual(decl(apply(src, line, linkFor(card, 'VSCROLL'))),
            ["      TEXT,AT(10,10,100,50),USE(?T),HSCROLL,VSCROLL"]);
    });

    test('round trip: after a click, the next card shows the flag moved across', async () => {
        const src = program(["      TEXT,AT(10,10,100,50),USE(?T),VSCROLL"]);
        const first = await hoverText(src);
        const added = apply(src, first.line, linkFor(first.card, 'FULL'));
        const second = await hoverText(added);
        const attributes = second.card.slice(second.card.indexOf('**Attributes:**'), second.card.indexOf('**Available:**'));
        assert.ok(links(attributes).some(l => l.name === 'FULL'), second.card);
        const removed = apply(added, second.line, linkFor(attributes, 'FULL'));
        assert.strictEqual(removed, src);
    });

    test('the edits are relative to the hovered line', async () => {
        const src = program(["      TEXT,AT(10,10,100,50),USE(?T),VSCROLL"]);
        const { card } = await hoverText(src);
        for (const e of linkFor(card, 'HIDE').edits) assert.strictEqual(e.l, 0, JSON.stringify(e));
    });

    test('Available still wraps, counting the names only, not the link markup', async () => {
        const { card } = await hoverText(program(["      TEXT,AT(10,10,100,50),USE(?T),VSCROLL"]));
        const available = card.slice(card.indexOf('**Available:**')).split('\n');
        assert.ok(available.length > 1, card);
        for (const line of available) {
            // a title may hold parentheses ("Proper Case input (with MASK)"): skip it whole; the
            // bold markers and the trailing markdown line break are not visible either
            const visible = line.replace(/\[([A-Z0-9]+)\]\([^\s)]*(?: "[^"]*")?\)/g, '$1').replace(/\*/g, '').trimEnd();
            assert.ok(visible.length <= 75, `${visible.length}: ${visible}`);
        }
    });

    // A link must never add what the compiler rejects where the control sits (#737): a REPORT's
    // TEXT takes RESIZE and none of the scroll bars, and REQ there is a problem, not a flag to remove.
    test('in a REPORT the links follow the report list', async () => {
        const card = await hoverOn(REPORT_DECL, 'TEXT,');
        const names = links(card).map(l => l.name);
        assert.ok(names.includes('RESIZE'), card);
        for (const f of ['HSCROLL', 'VSCROLL', 'HVSCROLL', 'READONLY', 'REQ']) {
            assert.ok(!names.includes(f), `${f} must not be a link: ${card}`);
        }
        assert.strictEqual(linkFor(card, 'BOXED').title.indexOf('Remove BOXED'), 0, card);
    });

    test('every control with a list gets links, not only TEXT', async () => {
        const src = program(["      BUTTON('Go'),AT(10,10,40,14),USE(?Go),DEFAULT"]);
        const card = await hoverOn(src, "BUTTON(");
        assert.strictEqual(linkFor(card, 'DEFAULT').title.indexOf('Remove DEFAULT'), 0, card);
        assert.strictEqual(linkFor(card, 'FLAT').title.indexOf('Add FLAT'), 0, card);
    });

    // As rename (#549): the templates own a generated module, and the next generate undoes the edit.
    test('no links in a generated module; the card itself stays', async () => {
        const src = program(["      TEXT,AT(10,10,100,50),USE(?T),VSCROLL"]);
        const generated = await hoverInProject(src, 'TEXT,', true);
        assert.strictEqual(links(generated).length, 0, generated);
        assert.ok(generated.includes('**Available:**') && generated.includes('VSCROLL'), generated);
        const handWritten = await hoverInProject(src, 'TEXT,', false);
        assert.ok(links(handWritten).length > 0, handWritten);
    });
});
