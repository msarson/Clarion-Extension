import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Hover } from 'vscode-languageserver-protocol';
import { HoverProvider } from '../providers/HoverProvider';

/**
 * The reverse of the END hover (#575): hovering an IF / LOOP / CASE / EXECUTE / BEGIN / ACCEPT
 * shows the line of the END that closes it, as the parser paired them. A nested block missing
 * its END is paired with its container's END instead, so the hover also says when that END is
 * lined up with an enclosing block rather than the opener, and when the opener is not
 * terminated at all.
 */

let tmpRoot: string;

function hoverAt(text: string, lineNo: number, word: string): Promise<string> {
    const file = path.join(tmpRoot, 'open' + Math.random().toString(36).slice(2) + '.clw');
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

// Body starts on line 5 (0-based).
const NESTED = program([
    "  IF 1 = 1",               // 5
    "    LOOP 3 TIMES",         // 6
    "      BREAK",              // 7
    "    END",                  // 8
    "  END",                    // 9
]);

const MISSING_INNER_END = program([
    "  IF 1 = 1",               // 5
    "    IF 2 = 2",             // 6
    "      BREAK",              // 7
    "  END",                    // 8 — closes the inner IF, outer IF is left open
]);

// The LOOP's line starts at column 0 (its label); its END is under the LOOP keyword, which is
// also the enclosing IF's column — lined up with its own block first, so no warning.
const LABELLED = program([
    "    IF 1 = 1",             // 5
    "Lp  LOOP 3 TIMES",         // 6
    "      BREAK",              // 7
    "    END",                  // 8
    "    END",                  // 9
]);

// Both ENDs are there; the inner one is merely indented like the outer IF, which still has
// its own lined-up END. Nothing is missing.
const MISINDENTED_INNER_END = program([
    "  IF 1 = 1",               // 5
    "    IF 2 = 2",             // 6
    "      BREAK",              // 7
    "  END",                    // 8 — closes the inner IF
    "  END",                    // 9 — closes the outer IF
]);

// An END a column off, lined up with no block: sloppy, not a missing END.
const SLOPPY = program([
    "  IF 1 = 1",               // 5
    "    LOOP 3 TIMES",         // 6
    "      BREAK",              // 7
    "   END",                   // 8
    "  END",                    // 9
]);

const ONE_LINE = program([
    "  IF 1 = 1 THEN RETURN.",  // 5
]);

const ONE_LINE_END = program([
    "  IF 1 = 1 THEN RETURN END",   // 5
]);

// A one-line IF inside a multi-line one takes none of the outer IF's END.
const ONE_LINE_NESTED = program([
    "  IF 1 = 1",                   // 5
    "    IF 2 = 2 THEN BREAK END",  // 6
    "  END",                        // 7
]);

// A LOOP may end with UNTIL or WHILE instead of END.
const LOOP_UNTIL = program([
    "  LOOP",                   // 5
    "    BREAK",                // 6
    "  UNTIL 1 = 1",            // 7
    "  LOOP",                   // 8
    "    BREAK",                // 9
    "  WHILE 1 = 2",            // 10
]);

// Both ENDs on one line: the first closes the inner LOOP, the second the outer one. The outer
// LOOP has its own END, it just follows other code on the line, so nothing is missing.
const END_END = program([
    "  LOOP 2 TIMES",           // 5
    "    LOOP 3 TIMES",         // 6
    "      BREAK",              // 7
    "  END ; END",              // 8
]);

suite('IF/LOOP/CASE hover — shows the END that closes it', () => {

    setup(() => { tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'hover-opener-')); });
    teardown(() => { try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch { /* best-effort */ } });

    test('outer IF names its own END line, not the nested LOOP\'s', async () => {
        const text = await hoverAt(NESTED, 5, 'IF');
        assert.ok(/closed by END on line 10\b/.test(text), `expected END on line 10; got: ${text}`);
        assert.ok(/\]\(file:\/\/\/.*#L10\)/.test(text), `expected a link to line 10; got: ${text}`);
        assert.ok(!/lined up/.test(text), `aligned END must not warn; got: ${text}`);
    });

    test('nested LOOP names its own END line', async () => {
        const text = await hoverAt(NESTED, 6, 'LOOP');
        assert.ok(/\*\*LOOP\*\* — closed by END on line 9\b/.test(text), `expected END on line 9; got: ${text}`);
    });

    test('inner IF missing its END is paired with the outer END, and the hover says it is misaligned', async () => {
        const text = await hoverAt(MISSING_INNER_END, 6, 'IF');
        assert.ok(/closed by END on line 9\b/.test(text), `expected END on line 9; got: ${text}`);
        assert.ok(/lined up with the IF on line 6, not with this IF/.test(text), `expected a warning naming the outer IF; got: ${text}`);
    });

    test('inner END merely indented like the outer IF, which still has its own END, does not warn', async () => {
        const text = await hoverAt(MISINDENTED_INNER_END, 6, 'IF');
        assert.ok(/closed by END on line 9\b/.test(text), `expected END on line 9; got: ${text}`);
        assert.ok(!/lined up/.test(text), `nothing is missing, so no warning; got: ${text}`);
    });

    test('outer IF left open by the missing END says it is not terminated', async () => {
        const text = await hoverAt(MISSING_INNER_END, 5, 'IF');
        assert.ok(/not terminated/i.test(text), `expected "not terminated"; got: ${text}`);
    });

    test('END aligned with a labelled LOOP keyword does not warn', async () => {
        const text = await hoverAt(LABELLED, 6, 'LOOP');
        assert.ok(/closed by END on line 9\b/.test(text), `expected END on line 9; got: ${text}`);
        assert.ok(!/lined up/.test(text), `END under the LOOP keyword must not warn; got: ${text}`);
    });

    test('END a column off, lined up with no block, does not warn', async () => {
        const text = await hoverAt(SLOPPY, 6, 'LOOP');
        assert.ok(/closed by END on line 9\b/.test(text), `expected END on line 9; got: ${text}`);
        assert.ok(!/lined up/.test(text), `sloppy indentation must not warn; got: ${text}`);
    });

    test('one-line IF ... THEN ... . keeps the generic keyword card', async () => {
        const text = await hoverAt(ONE_LINE, 5, 'IF');
        assert.ok(!/closed by/.test(text), `one-line IF must not get the END card; got: ${text}`);
        assert.ok(!/not terminated/i.test(text), `one-line IF is terminated; got: ${text}`);
    });

    test('one-line IF ... THEN ... END keeps the generic keyword card', async () => {
        const text = await hoverAt(ONE_LINE_END, 5, 'IF');
        assert.ok(!/closed by/.test(text), `one-line IF must not get the END card; got: ${text}`);
        assert.ok(!/not terminated/i.test(text), `one-line IF is terminated; got: ${text}`);
    });

    test('a one-line IF nested in a multi-line IF leaves the outer pairing intact', async () => {
        const outer = await hoverAt(ONE_LINE_NESTED, 5, 'IF');
        assert.ok(/closed by END on line 8\b/.test(outer), `expected END on line 8; got: ${outer}`);
        assert.ok(!/lined up/.test(outer), `no warning expected; got: ${outer}`);
        const inner = await hoverAt(ONE_LINE_NESTED, 6, 'IF');
        assert.ok(!/closed by|not terminated/.test(inner), `one-line inner IF keeps the generic card; got: ${inner}`);
    });

    test('a LOOP ended by UNTIL or WHILE names that statement, not an END', async () => {
        const until = await hoverAt(LOOP_UNTIL, 5, 'LOOP');
        assert.ok(/\*\*LOOP\*\* — closed by UNTIL on line 8\b/.test(until), `expected UNTIL on line 8; got: ${until}`);
        const whileText = await hoverAt(LOOP_UNTIL, 8, 'LOOP');
        assert.ok(/\*\*LOOP\*\* — closed by WHILE on line 11\b/.test(whileText), `expected WHILE on line 11; got: ${whileText}`);
    });

    test('END ; END closing two blocks on one line does not warn', async () => {
        const text = await hoverAt(END_END, 6, 'LOOP');
        assert.ok(/closed by END on line 9\b/.test(text), `expected END on line 9; got: ${text}`);
        assert.ok(!/lined up/.test(text), `the outer LOOP has its own END; got: ${text}`);
    });

    test('the keyword description stays under the card, below the closing END', async () => {
        const closed = await hoverAt(NESTED, 5, 'IF');
        const at = closed.indexOf('Initiates a conditional execution structure');
        assert.ok(at > closed.indexOf('closed by END on line 10'), `expected IF's description below the closing END; got: ${closed}`);
        const open = await hoverAt(MISSING_INNER_END, 5, 'IF');
        assert.ok(/not terminated[\s\S]*Initiates a conditional execution structure/.test(open), `expected the description under "not terminated"; got: ${open}`);
        const loop = await hoverAt(NESTED, 6, 'LOOP');
        assert.ok(/closed by END on line 9[\s\S]*\S/.test(loop) && loop.split('---').length === 2, `expected one separator then LOOP's description; got: ${loop}`);
    });
});
