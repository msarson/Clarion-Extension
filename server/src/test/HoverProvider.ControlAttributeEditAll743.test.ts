import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Hover } from 'vscode-languageserver-protocol';
import { HoverProvider } from '../providers/HoverProvider';
import { clientFeatures } from '../utils/ClientFeatures';
import { attributeSnippet } from '../utils/AttributeService';

/**
 * #743 — the control card adds and removes every attribute, not only flags (#741).
 *
 * - Under **Attributes:** every attribute is a remove link, its value included; the title shows
 *   the text that goes, and USE and AT carry a warning.
 * - A **With value:** line lists the value attributes the control accepts and does not set (ALRT
 *   always, one per key). Its links add a snippet: the edit carries `s: true` and the text is a
 *   VS Code snippet (`,TIP('${1:text}')`), the same one attribute completion inserts.
 */

interface LinkEdit { l: number; c: number; el: number; ec: number; t: string; o: string[]; s?: boolean; }
interface CardLink { name: string; title: string; edits: LinkEdit[]; }

let tmpRoot: string;

function docFor(text: string): TextDocument {
    const file = path.join(tmpRoot, 'ea' + Math.random().toString(36).slice(2) + '.clw');
    fs.writeFileSync(file, text);
    const uri = 'file:///' + file.replace(/\\/g, '/').replace(/^([a-zA-Z]):/, (_m, d) => d + '%3A');
    return TextDocument.create(uri, 'clarion', 1, text);
}

function program(windowLines: string[]): string {
    return ['  PROGRAM', '', "MyWindow WINDOW('Test'),AT(,,300,200)", ...windowLines, '         END', '',
        '  MAP', '  END', '  CODE', '  RETURN', ''].join('\n');
}

async function hoverOn(text: string, needle: string): Promise<{ card: string; line: number }> {
    const lines = text.split('\n');
    const line = lines.findIndex(l => l.includes(needle));
    const h: Hover | null = await new HoverProvider().provideHover(docFor(text), { line, character: lines[line].indexOf(needle) + 1 });
    return { card: (h?.contents as { value?: string } | undefined)?.value ?? '', line };
}

/** The links in one block of the card ("Attributes", "Available" or "With value"). */
function links(card: string, block: string): CardLink[] {
    const start = card.indexOf(`**${block}:**`);
    if (start < 0) return [];
    const next = card.indexOf('\n\n', start);
    const text = card.slice(start, next < 0 ? undefined : next);
    const result: CardLink[] = [];
    // a title may hold markdown-escaped quotes: "Remove TIP('Column \"M\"')"
    const re = /\[([A-Z0-9]+)\]\(command:clarion\.applyAttributeEdit\?([^\s()"]+) "((?:[^"\\]|\\.)*)"\)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
        const args = JSON.parse(decodeURIComponent(m[2]));
        assert.ok(Array.isArray(args) && args.length === 1, `args must be [payload]: ${m[2]}`);
        result.push({ name: m[1], title: m[3].replace(/\\(.)/g, '$1'), edits: args[0].e });
    }
    return result;
}

function linkFor(card: string, block: string, name: string): CardLink {
    const l = links(card, block).find(x => x.name === name);
    assert.ok(l, `no ${block} link for ${name}: ${card}`);
    return l!;
}

/** Apply like the client: check the originals, splice from the end; a snippet goes in as its plain text. */
function apply(text: string, anchor: number, link: CardLink): string {
    const lines = text.split('\n');
    for (const e of link.edits) e.o.forEach((o, i) => assert.strictEqual(lines[anchor + e.l + i], o, 'original line check'));
    const offset = (line: number, col: number) => lines.slice(0, line).reduce((n, l) => n + l.length + 1, 0) + col;
    const plain = (e: LinkEdit) => e.s ? e.t.replace(/\$\{\d+:([^}]*)\}/g, '$1').replace(/\$\d+/g, '') : e.t;
    const spans = link.edits.map(e => ({ start: offset(anchor + e.l, e.c), end: offset(anchor + e.el, e.ec), t: plain(e) }))
        .sort((a, b) => b.start - a.start);
    let out = text;
    for (const s of spans) out = out.slice(0, s.start) + s.t + out.slice(s.end);
    return out;
}

suite('Control card: every attribute can be added and removed (#743)', () => {
    suiteSetup(() => { tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ea743-')); });
    suiteTeardown(() => { clientFeatures.attributeEditLinks = false; fs.rmSync(tmpRoot, { recursive: true, force: true }); });
    setup(() => { clientFeatures.attributeEditLinks = true; });

    test('a value attribute under Attributes removes itself with its value', async () => {
        const text = program(["           TEXT,AT(10,10,100,20),USE(?A),TIP('Save the record'),VSCROLL  ! c"]);
        const { card, line } = await hoverOn(text, 'TEXT,');
        const tip = linkFor(card, 'Attributes', 'TIP');
        assert.strictEqual(tip.title, "Remove TIP('Save the record')");
        assert.ok(apply(text, line, tip).includes('           TEXT,AT(10,10,100,20),USE(?A),VSCROLL  ! c'));
    });

    test('AT and USE are removable, with a warning', async () => {
        const text = program(['           TEXT,AT(10,10,100,20),USE(?A),VSCROLL']);
        const { card, line } = await hoverOn(text, 'TEXT,');
        const at = linkFor(card, 'Attributes', 'AT');
        assert.ok(apply(text, line, at).includes('           TEXT,USE(?A),VSCROLL'));
        assert.match(at.title, /^Remove AT\(10,10,100,20\) — /);
        const use = linkFor(card, 'Attributes', 'USE');
        assert.ok(apply(text, line, use).includes('           TEXT,AT(10,10,100,20),VSCROLL'));
        assert.match(use.title, /^Remove USE\(\?A\) — .*\?A/);
    });

    test('USE of a variable warns about its field equate, spelled as the help gives it', async () => {
        const equate = async (use: string) => linkFor((await hoverOn(program([`           TEXT,AT(10,10,100,20),${use}`]), 'TEXT,')).card, 'Attributes', 'USE').title;
        assert.match(await equate('USE(Loc:Notes)'), /\?Loc:Notes will/);
        // periods become colons, an array element's subscript follows an underscore
        assert.match(await equate('USE(SELF.Find.What)'), /^Remove USE\(SELF\.Find\.What\) — .*\?SELF:Find:What will/);
        assert.match(await equate('USE(Pre:Array[1])'), /\?Pre:Array_1 will/);
    });

    test('a double quote in the value stays a double quote in the title, escaped for markdown', async () => {
        const text = program([`           TEXT,AT(10,10,100,20),USE(?A),TIP('Column "M" here')`]);
        const { card } = await hoverOn(text, 'TEXT,');
        assert.strictEqual(linkFor(card, 'Attributes', 'TIP').title, `Remove TIP('Column "M" here')`);
        assert.ok(card.includes(String.raw`"Remove TIP('Column \"M\" here')"`), card);
    });

    test('a remove title quotes the source, continuation lines joined', async () => {
        const text = program(["           LIST,AT(1,1,100,100),USE(?L),FORMAT('20L' & |", "                   '30R')"]);
        const { card } = await hoverOn(text, 'LIST,');
        assert.strictEqual(linkFor(card, 'Attributes', 'FORMAT').title, "Remove FORMAT('20L' & '30R')");
    });

    test('removing a value attribute that opens a continuation line joins it back', async () => {
        const text = program(['           TEXT,AT(10,10,100,20),USE(?A), |', "                TIP('x')  ! c"]);
        const { card, line } = await hoverOn(text, 'TEXT,');
        assert.ok(apply(text, line, linkFor(card, 'Attributes', 'TIP')).includes('           TEXT,AT(10,10,100,20),USE(?A)  ! c'));
    });

    test('With value: the value attributes not set, ALRT always; AT shows when it is missing', async () => {
        const set = await hoverOn(program(['           TEXT,AT(10,10,100,20),USE(?A),ALRT(F2Key)']), 'TEXT,');
        const offered = links(set.card, 'With value').map(l => l.name);
        assert.ok(offered.includes('TIP') && offered.includes('ALRT') && offered.includes('FONT'), offered.join(' '));
        assert.ok(!offered.includes('AT') && !offered.includes('USE'), offered.join(' '));
        // flags stay on Available, value attributes do not
        assert.ok(!links(set.card, 'Available').some(l => l.name === 'TIP'));
        const bare = await hoverOn(program(['           TEXT,USE(?A)']), 'TEXT,');
        assert.ok(links(bare.card, 'With value').some(l => l.name === 'AT'), bare.card);
    });

    test('adding a value attribute is one snippet edit before the comment, from the shared snippet', async () => {
        const text = program(['           TEXT,AT(10,10,100,20),USE(?A)  ! c']);
        const { card, line } = await hoverOn(text, 'TEXT,');
        const tip = linkFor(card, 'With value', 'TIP');
        assert.strictEqual(tip.edits.length, 1);
        assert.strictEqual(tip.edits[0].s, true);
        assert.strictEqual(tip.edits[0].t, ',' + attributeSnippet('TIP'));
        assert.strictEqual(attributeSnippet('TIP'), "TIP('${1:text}')");
        assert.strictEqual(tip.title, "Add TIP('text')");
        assert.ok(apply(text, line, tip).includes("           TEXT,AT(10,10,100,20),USE(?A),TIP('text')  ! c"));
    });

    test('flag links are unchanged: plain edits, no snippet mark', async () => {
        const text = program(['           TEXT,AT(10,10,100,20),USE(?A)']);
        const { card } = await hoverOn(text, 'TEXT,');
        assert.ok(!linkFor(card, 'Available', 'HIDE').edits.some(e => e.s));
    });

    test('without the capability the With value line is plain text', async () => {
        clientFeatures.attributeEditLinks = false;
        const { card } = await hoverOn(program(['           TEXT,USE(?A)']), 'TEXT,');
        assert.ok(!card.includes('command:'), card);
        assert.match(card, /\*\*With value:\*\* .*\bAT\b/);
    });

    test('snippets: curated ones, and one derived from the signature for the rest', () => {
        assert.strictEqual(attributeSnippet('AT'), 'AT(${1:x},${2:y},${3:width},${4:height})');
        assert.strictEqual(attributeSnippet('MSG'), "MSG('${1:text}')");
        // DELAY has no curated snippet: LONG time
        assert.strictEqual(attributeSnippet('DELAY'), 'DELAY(${1:time})');
        // an attribute the data does not describe still gets brackets to type in
        assert.strictEqual(attributeSnippet('NOSUCH'), 'NOSUCH(${1})');
    });
});
