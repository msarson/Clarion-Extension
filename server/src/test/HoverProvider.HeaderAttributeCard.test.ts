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
 * The WINDOW, APPLICATION and REPORT header card lists the header's attributes the way a control
 * card does (#736, #741, #743), from the compiler-checked header lists (#740): **Attributes:**,
 * **Available:** and **With value:**, under the title and geometry it already showed. With the
 * client capability (#731) every name is an edit link, as on a control card.
 */

interface LinkEdit { l: number; c: number; el: number; ec: number; t: string; o: string[]; s?: boolean; }
interface CardLink { name: string; title: string; edits: LinkEdit[]; }

let tmpRoot: string;

function docFor(text: string): TextDocument {
    const file = path.join(tmpRoot, 'hd' + Math.random().toString(36).slice(2) + '.clw');
    fs.writeFileSync(file, text);
    const uri = 'file:///' + file.replace(/\\/g, '/').replace(/^([a-zA-Z]):/, (_m, d) => d + '%3A');
    return TextDocument.create(uri, 'clarion', 1, text);
}

function program(headerLines: string[], body: string[] = ['      BUTTON(\'OK\'),AT(10,10,40,14),USE(?OK)']): string {
    return ['  PROGRAM', '', ...headerLines, ...body, '    END', '', '  MAP', '  END', '  CODE', '  RETURN', ''].join('\n');
}

async function hoverOn(text: string, needle: string, doc?: TextDocument): Promise<{ card: string; line: number }> {
    const lines = text.split('\n');
    const line = lines.findIndex(l => l.includes(needle));
    const h: Hover | null = await new HoverProvider().provideHover(doc ?? docFor(text), { line, character: lines[line].indexOf(needle) + 1 });
    return { card: (h?.contents as { value?: string } | undefined)?.value ?? '', line };
}

/** A block of the card ("Attributes", "Available" or "With value"), or '' when it is missing. */
function block(card: string, name: string): string {
    const start = card.indexOf(`**${name}:**`);
    if (start < 0) return '';
    const next = card.indexOf('\n\n', start);
    return card.slice(start, next < 0 ? undefined : next);
}

function links(card: string, name: string): CardLink[] {
    const result: CardLink[] = [];
    const re = /\[([A-Z0-9]+)\]\(command:clarion\.applyAttributeEdit\?([^\s()"]+) "((?:[^"\\]|\\.)*)"\)/g;
    let m: RegExpExecArray | null;
    const text = block(card, name);
    while ((m = re.exec(text))) {
        const args = JSON.parse(decodeURIComponent(m[2]));
        assert.ok(Array.isArray(args) && args.length === 1, `args must be [payload]: ${m[2]}`);
        result.push({ name: m[1], title: m[3].replace(/\\(.)/g, '$1'), edits: args[0].e });
    }
    return result;
}

function linkFor(card: string, name: string, attribute: string): CardLink {
    const l = links(card, name).find(x => x.name === attribute);
    assert.ok(l, `no ${name} link for ${attribute}: ${card}`);
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
        return (await hoverOn(text, needle, doc)).card;
    } finally {
        holder.instance = saved;
    }
}

const WINDOW_HEADER = "MyWindow WINDOW('Test'),AT(,,300,200),GRAY,SYSTEM  ! main";

suite('Header card: WINDOW, APPLICATION and REPORT list their attributes like a control card', () => {
    suiteSetup(() => { tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'hdr-')); });
    suiteTeardown(() => { clientFeatures.attributeEditLinks = false; fs.rmSync(tmpRoot, { recursive: true, force: true }); });
    setup(() => { clientFeatures.attributeEditLinks = false; });

    test('a WINDOW header keeps its title and geometry, and lists set, available and value attributes', async () => {
        const { card } = await hoverOn(program([WINDOW_HEADER]), 'WINDOW(');
        assert.ok(card.startsWith('**MyWindow WINDOW**\n*Test*'), card);
        assert.ok(card.includes('📐 AT(,,300,200)'), card);
        assert.strictEqual(block(card, 'Attributes'), '**Attributes:** `AT` `GRAY` `SYSTEM`');
        const available = block(card, 'Available');
        for (const flag of ['CENTER', 'MDI', 'RESIZE', 'STATUS']) assert.ok(available.includes(flag), `${flag}: ${available}`);
        for (const set of ['GRAY', 'SYSTEM']) assert.ok(!available.includes(set), `${set} is set: ${available}`);
        const withValue = block(card, 'With value');
        for (const value of ['ICON', 'TIMER', 'FONT', 'ALRT']) assert.ok(withValue.includes(value), `${value}: ${withValue}`);
        assert.ok(!/\bAT\b/.test(withValue), `AT is set: ${withValue}`);
    });

    test('an attribute the header does not take is flagged, as on a control card', async () => {
        const { card } = await hoverOn(program(["MyWindow WINDOW('Test'),AT(,,300,200),BOXED"]), 'WINDOW(');
        assert.ok(/⚠ BOXED: not valid on WINDOW/.test(card), card);
    });

    test('a REPORT header gets the REPORT list', async () => {
        const text = program(['MyReport REPORT,AT(1000,1000,6000,9000),PRE(RPT),THOUS'],
            ['Detail     DETAIL,AT(,,6000,300)', "             STRING('x'),AT(10,10),USE(?S)", '           END']);
        const { card } = await hoverOn(text, 'REPORT,');
        assert.strictEqual(block(card, 'Attributes'), '**Attributes:** `AT` `PRE` `THOUS`');
        const available = block(card, 'Available');
        for (const flag of ['LANDSCAPE', 'MM', 'POINTS']) assert.ok(available.includes(flag), `${flag}: ${available}`);
        assert.ok(block(card, 'With value').includes('PREVIEW'), card);
        assert.ok(!/\bGRAY\b/.test(card), `no WINDOW attributes on a REPORT: ${card}`);
    });

    test('an APPLICATION header gets the APPLICATION list', async () => {
        const { card } = await hoverOn(program(["Main APPLICATION('App'),AT(,,400,300),SYSTEM,MAX"], []), 'APPLICATION(');
        assert.strictEqual(block(card, 'Attributes'), '**Attributes:** `AT` `SYSTEM` `MAX`');
        assert.ok(block(card, 'Available').includes('RESIZE'), card);
        assert.ok(!block(card, 'Available').includes('MDI'), `MDI is not on the APPLICATION list: ${card}`);
    });

    test('with the client capability every name is an edit link, applied as on a control card', async () => {
        clientFeatures.attributeEditLinks = true;
        const text = program([WINDOW_HEADER]);
        const { card, line } = await hoverOn(text, 'WINDOW(');
        assert.deepStrictEqual(links(card, 'Attributes').map(l => l.name), ['AT', 'GRAY', 'SYSTEM']);
        assert.ok(apply(text, line, linkFor(card, 'Available', 'CENTER')).includes("MyWindow WINDOW('Test'),AT(,,300,200),GRAY,SYSTEM,CENTER  ! main"));
        assert.ok(apply(text, line, linkFor(card, 'Attributes', 'GRAY')).includes("MyWindow WINDOW('Test'),AT(,,300,200),SYSTEM  ! main"));
        assert.ok(apply(text, line, linkFor(card, 'Attributes', 'AT')).includes("MyWindow WINDOW('Test'),GRAY,SYSTEM  ! main"));
        const timer = linkFor(card, 'With value', 'TIMER');
        assert.ok(timer.edits.length === 1 && timer.edits[0].s === true, JSON.stringify(timer.edits));
        assert.ok(apply(text, line, timer).includes("MyWindow WINDOW('Test'),AT(,,300,200),GRAY,SYSTEM,TIMER("), apply(text, line, timer));
    });

    test('the title in the keyword\'s own brackets is not an attribute', async () => {
        clientFeatures.attributeEditLinks = true;
        const { card } = await hoverOn(program([WINDOW_HEADER]), 'WINDOW(');
        assert.ok(!links(card, 'Attributes').some(l => /Test/.test(l.title)), card);
    });

    test('an exclusive partner is replaced in place (VSCROLL becomes HVSCROLL)', async () => {
        clientFeatures.attributeEditLinks = true;
        const text = program(["MyWindow WINDOW('Test'),AT(,,300,200),VSCROLL,GRAY"]);
        const { card, line } = await hoverOn(text, 'WINDOW(');
        assert.ok(apply(text, line, linkFor(card, 'Available', 'HVSCROLL')).includes("MyWindow WINDOW('Test'),AT(,,300,200),HVSCROLL,GRAY"));
    });

    test('a header continued with | is one declaration, edited as a control\'s is', async () => {
        clientFeatures.attributeEditLinks = true;
        const text = program(["MyWindow WINDOW('Test'),AT(,,300,200), |", '         GRAY,SYSTEM']);
        const { card, line } = await hoverOn(text, 'WINDOW(');
        assert.deepStrictEqual(links(card, 'Attributes').map(l => l.name), ['AT', 'GRAY', 'SYSTEM']);
        // the first attribute after the | goes with its comma, which joins the line back (#741)
        const gray = apply(text, line, linkFor(card, 'Attributes', 'GRAY'));
        assert.ok(gray.includes("MyWindow WINDOW('Test'),AT(,,300,200),SYSTEM\n"), gray);
        const system = apply(text, line, linkFor(card, 'Attributes', 'SYSTEM'));
        assert.ok(system.includes("MyWindow WINDOW('Test'),AT(,,300,200), |\n         GRAY\n"), system);
        const center = apply(text, line, linkFor(card, 'Available', 'CENTER'));
        assert.ok(center.includes('         GRAY,SYSTEM,CENTER\n'), center);
    });

    test('a generated module gets the lists without links', async () => {
        clientFeatures.attributeEditLinks = true;
        const text = program([WINDOW_HEADER]);
        const generated = await hoverInProject(text, 'WINDOW(', true);
        assert.ok(block(generated, 'Available').includes('CENTER') && !generated.includes('command:'), generated);
        const handWritten = await hoverInProject(text, 'WINDOW(', false);
        assert.ok(handWritten.includes('command:clarion.applyAttributeEdit'), handWritten);
    });

    test('the label and a WINDOW in code keep their own cards', async () => {
        const text = program([WINDOW_HEADER]);
        const label = (await hoverOn(text, 'MyWindow WINDOW')).card;
        assert.ok(!block(label, 'Available'), label);
    });
});
