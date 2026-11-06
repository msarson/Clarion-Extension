import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Hover } from 'vscode-languageserver-protocol';
import { HoverProvider } from '../providers/HoverProvider';

/**
 * Hovering a CASE shows a quick-navigation list of its branches: one table row per
 * OF / OROF / ELSE, with the branch's line number (a link to it) and its source line,
 * comment included. A nested CASE's branches are not in its container's list.
 */

let tmpRoot: string;

function hoverAt(text: string, lineNo: number, word: string): Promise<string> {
    const file = path.join(tmpRoot, 'case' + Math.random().toString(36).slice(2) + '.clw');
    fs.writeFileSync(file, text);
    const uri = 'file:///' + file.replace(/\\/g, '/').replace(/^([a-zA-Z]):/, (_m, d) => d + '%3A');
    const doc = TextDocument.create(uri, 'clarion', 1, text);
    const idx = text.split(/\r?\n/)[lineNo].search(new RegExp(`\\b${word}\\b`));
    if (idx === -1) throw new Error(`No ${word} on line ${lineNo}`);
    return new HoverProvider().provideHover(doc, { line: lineNo, character: idx + 1 }).then((h: Hover | null) => {
        if (!h || !h.contents) return '';
        const c = h.contents as { value?: string } | string;
        return typeof c === 'string' ? c : (c.value ?? '');
    });
}

function program(body: string[]): string {
    return ["  PROGRAM", "", "  MAP", "  END", "  CODE", ...body, "  RETURN", ""].join('\n');
}

/** Table rows of the card: [line label, cell text] per row, header and separator excluded. The
 *  hovered branch's row has its label prefixed with ▸. */
function rows(card: string): Array<[string, string]> {
    return card.split('\n')
        .filter(l => /^\| (?:▸ )?\[\d+\]/.test(l))
        .map(l => {
            const m = /^\| (▸ )?\[(\d+)\]\([^)]*\) \| (.*) \|$/.exec(l);
            if (!m) throw new Error(`unexpected row: ${l}`);
            return [(m[1] ? '▸' : '') + m[2], m[3]] as [string, string];
        });
}

// Body starts on line 5 (0-based).
const EVENTS = program([
    "  CASE FIELD()",                         // 5
    "  OF ?OkButton            ! confirm",    // 6
    "    CASE EVENT()",                       // 7
    "    OF EVENT:Accepted",                  // 8
    "      BREAK",                            // 9
    "    END",                                // 10
    "  OF ?CancelButton",                     // 11
    "  OROF ?CloseButton       ! same path",  // 12
    "    BREAK",                              // 13
    "  ELSE",                                 // 14
    "    BREAK",                              // 15
    "  END",                                  // 16
]);

const PIPE = program([
    "  CASE 1",                               // 5
    "  OF 1 ! a | b",                         // 6
    "    BREAK",                              // 7
    "  OF 2 ! uses `tick`",                   // 8
    "    BREAK",                              // 9
    "  END",                                  // 10
]);

const NO_BRANCHES = program([
    "  CASE 1",                               // 5
    "  END",                                  // 6
]);

suite('CASE hover — quick-navigation list of its branches', () => {

    setup(() => { tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'hover-case-')); });
    teardown(() => { try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch { /* best-effort */ } });

    test('lists every OF / OROF / ELSE of the CASE, line number first, source line with comment', async () => {
        const card = await hoverAt(EVENTS, 5, 'CASE');
        assert.deepStrictEqual(rows(card), [
            ['7', '`OF ?OkButton            ! confirm`'],
            ['12', '`OF ?CancelButton`'],
            ['13', '`OROF ?CloseButton       ! same path`'],
            ['15', '`ELSE`'],
        ], card);
    });

    test('the header names the branch count and links the END', async () => {
        const card = await hoverAt(EVENTS, 5, 'CASE');
        assert.ok(/^\*\*CASE\*\* — 4 branches · END on line \[17\]\(file:\/\/\/[^)]*#L17 "Go to END"\)/.test(card), card);
    });

    test('each branch number links to its own line in this file, titled for the client', async () => {
        const card = await hoverAt(EVENTS, 5, 'CASE');
        assert.ok(/\| \[12\]\(file:\/\/\/[^)\s]*case[^)\s]*\.clw#L12 "Go to branch"\) \|/.test(card), card);
        assert.ok(!/\.clw:\d+/.test(card), `no file-name labels; got: ${card}`);
    });

    test('a nested CASE lists only its own branches', async () => {
        const card = await hoverAt(EVENTS, 7, 'CASE');
        assert.deepStrictEqual(rows(card), [['9', '`OF EVENT:Accepted`']], card);
        assert.ok(/1 branch ·/.test(card), card);
    });

    test('the card leaves out the generic CASE keyword description', async () => {
        const card = await hoverAt(EVENTS, 5, 'CASE');
        assert.ok(!/\n---\n/.test(card), `no description separator expected; got: ${card}`);
        assert.ok(!/structure/i.test(card), `no keyword description expected; got: ${card}`);
    });

    test('a | in the source line is escaped and a backtick gets a longer fence', async () => {
        const card = await hoverAt(PIPE, 5, 'CASE');
        assert.deepStrictEqual(rows(card), [
            ['7', '`OF 1 ! a \\| b`'],
            ['9', '`` OF 2 ! uses `tick` ``'],
        ], card);
    });

    test('an OF card keeps its branch details and adds the list, the CASE line first, this branch marked', async () => {
        const card = await hoverAt(EVENTS, 12, 'OROF');
        assert.ok(/\*\*OROF\*\* — branch 3 of 4 in CASE/.test(card), card);
        assert.ok(/Also matches when equal to: `\?CloseButton`/.test(card), card);
        assert.deepStrictEqual(rows(card).map(r => r[0]), ['6', '7', '12', '▸13', '15'], card);
        assert.deepStrictEqual(rows(card)[0], ['6', '`CASE FIELD()`'], card);
        assert.ok(/\| \[6\]\(file:\/\/\/[^)\s]*#L6 "Go to CASE"\) \|/.test(card), `CASE row titled "Go to CASE"; got: ${card}`);
    });

    test('an OF card of a CASE has no separate CASE preview or link (the list row replaces them)', async () => {
        const card = await hoverAt(EVENTS, 12, 'OROF');
        assert.ok(!/```clarion/.test(card), `no code block expected; got: ${card}`);
        assert.ok(!/\.clw:\d+\]/.test(card), `no file:line link expected; got: ${card}`);
    });

    test('an ELSE card of a CASE marks the ELSE row', async () => {
        const card = await hoverAt(EVENTS, 14, 'ELSE');
        assert.deepStrictEqual(rows(card).map(r => r[0]), ['6', '7', '12', '13', '▸15'], card);
    });

    test('an OF in a nested CASE lists only that CASE\'s branches', async () => {
        const card = await hoverAt(EVENTS, 8, 'OF');
        assert.deepStrictEqual(rows(card), [['8', '`CASE EVENT()`'], ['▸9', '`OF EVENT:Accepted`']], card);
    });

    test('the END of a CASE keeps its closes-CASE title and shows the list, the CASE line first', async () => {
        const card = await hoverAt(EVENTS, 16, 'END');
        assert.ok(/\*\*END\*\* — closes CASE/.test(card), card);
        assert.deepStrictEqual(rows(card).map(r => r[0]), ['6', '7', '12', '13', '15'], card);
        assert.ok(!/```clarion/.test(card), `no code block expected; got: ${card}`);
    });

    test('an IF\'s ELSE and END get no branch list and keep their IF preview', async () => {
        const text = program([
            "  IF 1 = 1",      // 5
            "    BREAK",       // 6
            "  ELSE",          // 7
            "    BREAK",       // 8
            "  END",           // 9
        ]);
        const elseCard = await hoverAt(text, 7, 'ELSE');
        const endCard = await hoverAt(text, 9, 'END');
        assert.deepStrictEqual(rows(elseCard), []);
        assert.deepStrictEqual(rows(endCard), []);
        assert.ok(/```clarion\nIF 1 = 1\n```/.test(elseCard), elseCard);
        assert.ok(/```clarion\nIF 1 = 1\n```/.test(endCard), endCard);
    });

    test('a CASE without branches keeps the closed-by-END card', async () => {
        const card = await hoverAt(NO_BRANCHES, 5, 'CASE');
        assert.ok(/\*\*CASE\*\* — closed by END on line 7\b/.test(card), card);
        assert.ok(!/\| Line \|/.test(card), card);
    });
});
