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
});
