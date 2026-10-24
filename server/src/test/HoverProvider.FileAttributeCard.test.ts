import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { CompletionItem, CompletionTriggerKind, Hover } from 'vscode-languageserver/node';
import { HoverProvider } from '../providers/HoverProvider';
import { CompletionProvider } from '../providers/CompletionProvider';
import { validateAttributeApplicability } from '../providers/diagnostics/AttributeDiagnostics';
import { ClarionTokenizer } from '../ClarionTokenizer';
import { TokenCache } from '../TokenCache';
import { setServerInitialized } from '../serverState';
import { clientFeatures } from '../utils/ClientFeatures';
import { SolutionManager } from '../solution/solutionManager';

/**
 * #746 — a FILE declaration lists its attributes the way a WINDOW header and a control do
 * (#736, #745): hovering the FILE keyword, or the KEY, INDEX, MEMO or BLOB keyword of a
 * declaration inside it, shows **Attributes:**, **Available:** and **With value:** from the
 * compiler-checked lists (test-programs/ControlAttributesTest, Clarion 10 and 12), with edit
 * links where the client applies them.
 *
 * The compiler, not the help, settled the rules these tests pin:
 *   - a FILE without DRIVER fails (`FILE must have DRIVER attribute`): DRIVER gets no remove link;
 *   - `ENCRYPT attribute requires OWNER` and `DLL attribute requires EXTERNAL attribute`;
 *   - TYPE (Clarion# only) is `Invalid FILE attribute`; EXTERNAL on a MEMO is `Invalid data
 *     declaration attribute`;
 *   - PRIMARY with DUP or OPT compiles, so nothing flags it.
 */

interface LinkEdit { l: number; c: number; el: number; ec: number; t: string; o: string[]; s?: boolean; }
interface CardLink { name: string; title: string; edits: LinkEdit[]; }

let tmpRoot: string;

function docFor(text: string): TextDocument {
    const file = path.join(tmpRoot, 'fd' + Math.random().toString(36).slice(2) + '.clw');
    fs.writeFileSync(file, text);
    const uri = 'file:///' + file.replace(/\\/g, '/').replace(/^([a-zA-Z]):/, (_m, d) => d + '%3A');
    return TextDocument.create(uri, 'clarion', 1, text);
}

/** A program declaring one FILE; `header` is the FILE line, `members` the lines before its RECORD. */
function program(header: string, members: string[] = []): string {
    return ['  PROGRAM', '', header, ...members,
        'Record    RECORD', 'ID          LONG', 'Name        STRING(20)', '          END', '        END', '',
        '  MAP', '  END', '  CODE', '  OPEN(Customer)', '  RETURN', ''].join('\n');
}

const HEADER = "Customer FILE,DRIVER('TOPSPEED'),PRE(Cus),CREATE  ! customers";

async function hoverOn(text: string, needle: string, doc?: TextDocument): Promise<{ card: string; line: number }> {
    const lines = text.split('\n');
    const line = lines.findIndex(l => l.includes(needle));
    assert.ok(line >= 0, `no line holds ${needle}`);
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

/** The names a block lists, linked or not. */
function namesIn(card: string, name: string): string[] {
    return [...block(card, name).replace(/^\*\*[^*]+:\*\*/, '').matchAll(/\[([A-Z]+)\]\(command:|`([A-Z]+)`|\b([A-Z]{2,})\b(?![^(]*\))/g)]
        .map(m => m[1] ?? m[2] ?? m[3]);
}

function links(card: string, name: string): CardLink[] {
    const result: CardLink[] = [];
    const re = /\[([A-Z0-9]+)\]\(command:clarion\.applyAttributeEdit\?([^\s()"]+) "((?:[^"\\]|\\.)*)"\)/g;
    let m: RegExpExecArray | null;
    const text = block(card, name);
    while ((m = re.exec(text))) {
        const args = JSON.parse(decodeURIComponent(m[2]));
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

/** Hover in a document whose project's .cwproj marks it `<Generated>`. */
async function hoverInGenerated(text: string, needle: string): Promise<string> {
    const doc = docFor(text);
    const file = path.basename(decodeURIComponent(doc.uri));
    const holder = SolutionManager as unknown as { instance: unknown };
    const saved = holder.instance;
    holder.instance = {
        solution: { projects: [] },
        findProjectForFile: () => ({ path: tmpRoot, sourceFiles: [{ relativePath: file, generated: true }] }),
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

let counter = 0;

/** Completes at `¦`; a comma right before the cursor is the trigger, as VS Code sends it. */
async function complete(text: string): Promise<string[]> {
    const lines = text.split('\n');
    const line = lines.findIndex(l => l.includes('¦'));
    const character = lines[line].indexOf('¦');
    const doc = TextDocument.create(`file:///C:/temp/filecompl746-${++counter}.clw`, 'clarion', 1, text.replace('¦', ''));
    const cache = TokenCache.getInstance();
    cache.clearAllTokens();
    cache.getTokens(doc);
    const items: CompletionItem[] = await new CompletionProvider().onCompletion({
        textDocument: { uri: doc.uri },
        position: { line, character },
        context: { triggerKind: CompletionTriggerKind.TriggerCharacter, triggerCharacter: ',' },
    }, doc);
    return items.map(i => String(i.label)).sort();
}

function attributeWarnings(text: string): string[] {
    const doc = TextDocument.create(`file:///C:/temp/filediag746-${++counter}.clw`, 'clarion', 1, text);
    const tokens = new ClarionTokenizer(text).tokenize();
    return validateAttributeApplicability(tokens, doc).filter(d => d.code === 'invalid-attribute-context').map(d => String(d.message));
}

suite('FILE, KEY, INDEX, MEMO and BLOB list their attributes like a control card (#746)', () => {
    suiteSetup(() => { setServerInitialized(true); tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'fd-')); });
    suiteTeardown(() => { clientFeatures.attributeEditLinks = false; fs.rmSync(tmpRoot, { recursive: true, force: true }); });
    setup(() => { clientFeatures.attributeEditLinks = false; });

    test('the FILE keyword lists what the header sets, the flags it accepts and those that take a value', async () => {
        const { card } = await hoverOn(program(HEADER), 'FILE,');
        assert.ok(card.startsWith('**Customer FILE**'), card);
        assert.deepStrictEqual(namesIn(card, 'Attributes'), ['DRIVER', 'PRE', 'CREATE']);
        assert.deepStrictEqual(namesIn(card, 'Available'), ['BINDABLE', 'DLL', 'ENCRYPT', 'EXTERNAL', 'OEM', 'RECLAIM', 'THREAD']);
        assert.deepStrictEqual(namesIn(card, 'With value'), ['NAME', 'OWNER']);
        assert.ok(!/\bTYPE\b/.test(card), `TYPE is Clarion# only: ${card}`);
    });

    test('KEY and INDEX take their own lists; the components in brackets are not attributes', async () => {
        const text = program(HEADER, ['CusKey    KEY(Cus:ID),NOCASE,OPT', 'NameNdx   INDEX(-Cus:Name),NOCASE']);
        const key = (await hoverOn(text, 'KEY(')).card;
        assert.ok(key.startsWith('**CusKey KEY**'), key);
        assert.deepStrictEqual(namesIn(key, 'Attributes'), ['NOCASE', 'OPT']);
        assert.deepStrictEqual(namesIn(key, 'Available'), ['DUP', 'PRIMARY']);
        assert.deepStrictEqual(namesIn(key, 'With value'), ['NAME']);
        const index = (await hoverOn(text, 'INDEX(')).card;
        assert.ok(index.startsWith('**NameNdx INDEX**'), index);
        assert.deepStrictEqual(namesIn(index, 'Attributes'), ['NOCASE']);
        assert.deepStrictEqual(namesIn(index, 'Available'), ['OPT']);
    });

    test('MEMO and BLOB take BINARY and NAME', async () => {
        const text = program(HEADER, ['Notes     MEMO(200)', 'Photo     BLOB,BINARY']);
        const memo = (await hoverOn(text, 'MEMO(')).card;
        assert.ok(memo.startsWith('**Notes MEMO**'), memo);
        assert.deepStrictEqual(namesIn(memo, 'Available'), ['BINARY']);
        assert.deepStrictEqual(namesIn(memo, 'With value'), ['NAME']);
        const blob = (await hoverOn(text, 'BLOB')).card;
        assert.deepStrictEqual(namesIn(blob, 'Attributes'), ['BINARY']);
        assert.ok(!block(blob, 'Available'), blob);
    });

    test('an attribute the compiler rejects there is flagged on the card', async () => {
        const text = program("Customer FILE,DRIVER('TOPSPEED'),TYPE", ['Notes     MEMO(200),EXTERNAL']);
        assert.ok(/⚠ TYPE: not valid on FILE/.test((await hoverOn(text, 'FILE,')).card));
        assert.ok(/⚠ EXTERNAL: not valid on MEMO/.test((await hoverOn(text, 'MEMO(')).card));
    });

    test('ENCRYPT without OWNER, DLL without EXTERNAL and a FILE without DRIVER are flagged', async () => {
        assert.ok(/⚠ ENCRYPT requires OWNER/.test((await hoverOn(program("Customer FILE,DRIVER('TOPSPEED'),ENCRYPT"), 'FILE,')).card));
        assert.ok(/⚠ DLL requires EXTERNAL/.test((await hoverOn(program("Customer FILE,DRIVER('TOPSPEED'),DLL"), 'FILE,')).card));
        assert.ok(/⚠ FILE requires DRIVER/.test((await hoverOn(program('Customer FILE,PRE(Cus)'), 'FILE,')).card));
        const fine = (await hoverOn(program("Customer FILE,DRIVER('TOPSPEED'),OWNER('pw'),ENCRYPT,EXTERNAL,DLL"), 'FILE,')).card;
        assert.ok(!fine.includes('⚠'), fine);
    });

    test('PRIMARY with DUP or OPT compiles, so the card does not flag it', async () => {
        const { card } = await hoverOn(program(HEADER, ['CusKey    KEY(Cus:ID),PRIMARY,DUP,OPT']), 'KEY(');
        assert.ok(!card.includes('⚠'), card);
    });

    test('with edit links: DRIVER cannot be removed, the rest can, and values go in as snippets', async () => {
        clientFeatures.attributeEditLinks = true;
        const text = program(HEADER);
        const { card, line } = await hoverOn(text, 'FILE,');
        assert.deepStrictEqual(links(card, 'Attributes').map(l => l.name), ['PRE', 'CREATE'], card);
        assert.ok(namesIn(card, 'Attributes').includes('DRIVER'), card);
        assert.ok(apply(text, line, linkFor(card, 'Attributes', 'CREATE')).includes("Customer FILE,DRIVER('TOPSPEED'),PRE(Cus)  ! customers"));
        assert.ok(apply(text, line, linkFor(card, 'Available', 'THREAD')).includes("Customer FILE,DRIVER('TOPSPEED'),PRE(Cus),CREATE,THREAD  ! customers"));
        const owner = linkFor(card, 'With value', 'OWNER');
        assert.ok(owner.edits.length === 1 && owner.edits[0].s === true, JSON.stringify(owner.edits));
    });

    test('adding ENCRYPT or DLL brings what it requires; removing OWNER or EXTERNAL takes the dependant with it', async () => {
        clientFeatures.attributeEditLinks = true;
        const text = program(HEADER);
        const { card, line } = await hoverOn(text, 'FILE,');
        const encrypt = linkFor(card, 'Available', 'ENCRYPT');
        assert.ok(encrypt.edits.length === 1 && encrypt.edits[0].s === true, JSON.stringify(encrypt.edits));
        assert.ok(/OWNER\(.*\),ENCRYPT  ! customers/.test(apply(text, line, encrypt)), apply(text, line, encrypt));
        assert.ok(/OWNER/.test(encrypt.title), encrypt.title);
        assert.ok(apply(text, line, linkFor(card, 'Available', 'DLL')).includes(',CREATE,EXTERNAL,DLL  ! customers'));

        const both = program("Customer FILE,DRIVER('TOPSPEED'),OWNER('pw'),ENCRYPT,EXTERNAL,DLL");
        const hovered = await hoverOn(both, 'FILE,');
        assert.ok(apply(both, hovered.line, linkFor(hovered.card, 'Attributes', 'OWNER')).includes("Customer FILE,DRIVER('TOPSPEED'),EXTERNAL,DLL\n"));
        assert.ok(apply(both, hovered.line, linkFor(hovered.card, 'Attributes', 'EXTERNAL')).includes("Customer FILE,DRIVER('TOPSPEED'),OWNER('pw'),ENCRYPT\n"));
        // ENCRYPT and DLL themselves go alone
        assert.ok(apply(both, hovered.line, linkFor(hovered.card, 'Attributes', 'ENCRYPT')).includes("OWNER('pw'),EXTERNAL,DLL\n"));
        const encryptPresent = linkFor(hovered.card, 'Attributes', 'OWNER');
        assert.ok(/ENCRYPT/.test(encryptPresent.title), encryptPresent.title);
    });

    test('a KEY attribute is added and removed on the KEY line', async () => {
        clientFeatures.attributeEditLinks = true;
        const text = program(HEADER, ['CusKey    KEY(Cus:ID),NOCASE']);
        const { card, line } = await hoverOn(text, 'KEY(');
        assert.ok(apply(text, line, linkFor(card, 'Available', 'DUP')).includes('CusKey    KEY(Cus:ID),NOCASE,DUP\n'));
        assert.ok(apply(text, line, linkFor(card, 'Attributes', 'NOCASE')).includes('CusKey    KEY(Cus:ID)\n'));
    });

    test('a generated module gets the lists without links', async () => {
        clientFeatures.attributeEditLinks = true;
        const card = await hoverInGenerated(program(HEADER, ['CusKey    KEY(Cus:ID),NOCASE']), 'KEY(');
        assert.ok(block(card, 'Available').includes('DUP') && !card.includes('command:'), card);
    });

    test('the FILE label keeps its summary card', async () => {
        const text = program(HEADER, ['CusKey    KEY(Cus:ID),NOCASE']);
        const label = (await hoverOn(text, 'Customer FILE')).card;
        assert.ok(label.includes('🗄️') && !block(label, 'Available'), label);
        const key = (await hoverOn(text, 'CusKey')).card;
        assert.ok(!block(key, 'Available'), key);
    });

    test('hovering an attribute on a FILE or KEY line shows its card, and flags one not valid there', async () => {
        const text = program("Customer FILE,DRIVER('TOPSPEED'),TYPE,RECLAIM", ['CusKey    KEY(Cus:ID),NOCASE']);
        const nocase = (await hoverOn(text, 'NOCASE')).card;
        assert.ok(/NOCASE/.test(nocase) && !nocase.includes('⚠'), nocase);
        assert.ok(/⚠ TYPE is not valid on FILE/.test((await hoverOn(text, 'TYPE')).card));
        assert.ok(/RECLAIM/.test((await hoverOn(text, 'RECLAIM')).card));
    });

    test('diagnostics: an attribute not valid there, and ENCRYPT without OWNER, are warnings', () => {
        const warnings = attributeWarnings(program("Customer FILE,DRIVER('TOPSPEED'),TYPE,ENCRYPT", ['CusKey    KEY(Cus:ID),BINARY', 'Notes     MEMO(200),DUP']));
        assert.ok(warnings.includes('TYPE is not valid on FILE'), warnings.join(' | '));
        assert.ok(warnings.includes('ENCRYPT requires OWNER'), warnings.join(' | '));
        assert.ok(warnings.includes('BINARY is not valid on KEY'), warnings.join(' | '));
        assert.ok(warnings.includes('DUP is not valid on MEMO'), warnings.join(' | '));
        assert.deepStrictEqual(attributeWarnings(program("Customer FILE,DRIVER('TOPSPEED'),OWNER('pw'),ENCRYPT", ['CusKey    KEY(Cus:ID),PRIMARY,DUP'])), []);
    });

    test('completion after a comma offers the list for that declaration, less what it sets', async () => {
        assert.deepStrictEqual(await complete(program("Customer FILE,DRIVER('TOPSPEED'),CREATE,¦")),
            ['BINDABLE', 'DLL', 'ENCRYPT', 'EXTERNAL', 'NAME', 'OEM', 'OWNER', 'PRE', 'RECLAIM', 'THREAD']);
        assert.deepStrictEqual(await complete(program(HEADER, ['CusKey    KEY(Cus:ID),NOCASE,¦'])), ['DUP', 'NAME', 'OPT', 'PRIMARY']);
        assert.deepStrictEqual(await complete(program(HEADER, ['Notes     MEMO(200),¦'])), ['BINARY', 'NAME']);
    });
});
