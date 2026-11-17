import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Hover } from 'vscode-languageserver-protocol';
import { HoverProvider } from '../providers/HoverProvider';
import { clientFeatures } from '../utils/ClientFeatures';

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

// 60 branches: OF n on line 5 + n (0-based), shown as line n + 6; END on line 66.
const BIG = program([
    "  CASE pNo",                             // 5
    ...Array.from({ length: 60 }, (_v, i) => `  OF ${i + 1}  ! branch ${i + 1}`),
    "  END",                                  // 66
]);

const SAME_LINE = program([
    "  CASE 1",                               // 5
    "  OF 1 OROF 2",                          // 6
    "    BREAK",                              // 7
    "  END",                                  // 8
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

    test('OF and OROF on one line: only the hovered one is marked', async () => {
        const card = await hoverAt(SAME_LINE, 6, 'OROF');
        assert.deepStrictEqual(rows(card).map(r => r[0]), ['6', '7', '▸7'], card);
    });

    test('a \\ before a | in the source keeps the cell whole (zero-width space between the backslashes)', async () => {
        const text = program([
            "  CASE 1",                           // 5
            "  OF 1 ! s = '\\|'",                 // 6
            "    BREAK",                          // 7
            "  END",                              // 8
        ]);
        const card = await hoverAt(text, 5, 'CASE');
        assert.deepStrictEqual(rows(card), [['7', "`OF 1 ! s = '\\​\\|'`"]], card);
    });

    test('a long source line is cut at 100 characters with …', async () => {
        const long = '  OF 1 ! ' + 'x'.repeat(150);
        const text = program(["  CASE 1", long, "    BREAK", "  END"]);
        const card = await hoverAt(text, 5, 'CASE');
        const cell = rows(card)[0][1];
        assert.strictEqual(cell, '`' + long.trim().slice(0, 99) + '…`', card);
    });
});

suite('CASE hover — the branch list is capped at 40 unless the client asks for all', () => {

    setup(() => { tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'hover-case-')); });
    teardown(() => {
        clientFeatures.caseBranchListAll = false;
        try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch { /* best-effort */ }
    });

    /** 1-based line of branch n (1..60) in BIG. */
    const lineOf = (n: number) => String(n + 6);
    const first = (count: number) => Array.from({ length: count }, (_v, i) => lineOf(i + 1));

    test('the CASE card lists the first 40 and a …20 more row linking to branch 41', async () => {
        const card = await hoverAt(BIG, 5, 'CASE');
        assert.ok(/^\*\*CASE\*\* — 60 branches ·/.test(card), card);
        const r = rows(card);
        assert.deepStrictEqual(r.map(x => x[0]), [...first(40), lineOf(41)], card);
        assert.deepStrictEqual(r[r.length - 1], [lineOf(41), '…20 more'], card);
    });

    test('a branch past the cap is kept, marked, in place of the 40th', async () => {
        const card = await hoverAt(BIG, 5 + 50, 'OF');
        assert.ok(/\*\*OF\*\* — branch 50 of 60 in CASE/.test(card), card);
        const r = rows(card);
        assert.deepStrictEqual(r.map(x => x[0]), ['6', ...first(39), '▸' + lineOf(50), lineOf(40)], card);
        assert.deepStrictEqual(r[r.length - 1], [lineOf(40), '…20 more'], card);
    });

    test('a branch within the cap is marked in the first 40', async () => {
        const card = await hoverAt(BIG, 5 + 10, 'OF');
        const labels = rows(card).map(x => x[0]);
        assert.strictEqual(labels.length, 1 + 40 + 1, card);
        assert.strictEqual(labels[10], '▸' + lineOf(10), card);
    });

    test('the END card is capped the same way', async () => {
        const card = await hoverAt(BIG, 66, 'END');
        const r = rows(card);
        assert.deepStrictEqual(r.map(x => x[0]), ['6', ...first(40), lineOf(41)], card);
        assert.deepStrictEqual(r[r.length - 1], [lineOf(41), '…20 more'], card);
    });

    test('a client that announced clarionCaseBranchListAll gets every branch and no …more row', async () => {
        clientFeatures.caseBranchListAll = true;
        const card = await hoverAt(BIG, 5 + 50, 'OF');
        const r = rows(card);
        assert.deepStrictEqual(r.map(x => x[0]), ['6', ...first(60).map(l => l === lineOf(50) ? '▸' + l : l)], card);
        assert.ok(!/more \|$/m.test(card), card);
    });
});
