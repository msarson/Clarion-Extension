import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Hover } from 'vscode-languageserver-protocol';
import { HoverProvider } from '../providers/HoverProvider';

/**
 * Hovering BREAK / CYCLE shows the LOOP or ACCEPT it acts on, as the END hover (#575) shows the
 * structure it closes: the innermost enclosing one, or the one its label names. BREAK also
 * shows the END (or UNTIL / WHILE) that execution continues after.
 */

let tmpRoot: string;

function hoverAt(text: string, lineNo: number, word: string): Promise<string> {
    const file = path.join(tmpRoot, 'loop' + Math.random().toString(36).slice(2) + '.clw');
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
    "Outer LOOP 3 TIMES",           // 5
    "    LOOP 2 TIMES",             // 6
    "      IF 1 = 1",               // 7
    "        BREAK",                // 8
    "      END",                    // 9
    "      BREAK Outer",            // 10
    "      CYCLE",                  // 11
    "      CYCLE Outer",            // 12
    "    END",                      // 13
    "  END",                        // 14
]);

// An indented loop label (#65) is a label too.
const INDENTED_LABEL = program([
    "  Scan LOOP 3 TIMES",          // 5
    "    LOOP 2 TIMES",             // 6
    "      BREAK Scan",             // 7
    "    END",                      // 8
    "  END",                        // 9
]);

const ACCEPT_LOOP = program([
    "  ACCEPT",                     // 5
    "    IF 1 = 1 THEN BREAK.",     // 6
    "  END",                        // 7
]);

const LOOP_UNTIL = program([
    "  LOOP",                       // 5
    "    BREAK",                    // 6
    "  UNTIL 1 = 1",                // 7
]);

const ONE_LINE = program([
    "  LOOP 3 TIMES ; BREAK ; END", // 5
]);

const OUTSIDE = program([
    "  IF 1 = 1",                   // 5
    "    BREAK",                    // 6
    "  END",                        // 7
]);

suite('BREAK/CYCLE hover — shows the LOOP or ACCEPT it acts on', () => {

    setup(() => { tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'hover-loopexit-')); });
    teardown(() => { try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch { /* best-effort */ } });

    test('BREAK inside an IF leaves the innermost LOOP, and names its END', async () => {
        const text = await hoverAt(NESTED, 8, 'BREAK');
        assert.ok(/\*\*BREAK\*\* — leaves LOOP\n/.test(text), `expected the inner, unlabelled LOOP; got: ${text}`);
        assert.ok(text.includes('LOOP 2 TIMES'), `expected the inner LOOP's line; got: ${text}`);
        assert.ok(/\]\(file:\/\/\/.*#L7\)/.test(text), `expected a link to line 7; got: ${text}`);
        assert.ok(/Continues after the END on line 14\b/.test(text), `expected the inner END on line 14; got: ${text}`);
        assert.ok(/\]\(file:\/\/\/.*#L14\)/.test(text), `expected a link to line 14; got: ${text}`);
    });

    test('BREAK Label leaves the labelled outer LOOP', async () => {
        const text = await hoverAt(NESTED, 10, 'BREAK');
        assert.ok(/\*\*BREAK\*\* — leaves LOOP `Outer`/.test(text), `expected LOOP Outer; got: ${text}`);
        assert.ok(/Continues after the END on line 15\b/.test(text), `expected the outer END on line 15; got: ${text}`);
    });

    test('CYCLE returns to the top of the innermost LOOP, with no continuation line', async () => {
        const text = await hoverAt(NESTED, 11, 'CYCLE');
        assert.ok(/\*\*CYCLE\*\* — returns to the top of LOOP\n/.test(text), `expected the inner LOOP; got: ${text}`);
        assert.ok(!/Continues after/.test(text), `CYCLE does not leave the loop; got: ${text}`);
    });

    test('CYCLE Label returns to the top of the labelled LOOP', async () => {
        const text = await hoverAt(NESTED, 12, 'CYCLE');
        assert.ok(/\*\*CYCLE\*\* — returns to the top of LOOP `Outer`/.test(text), `expected LOOP Outer; got: ${text}`);
    });

    test('BREAK names an indented loop label', async () => {
        const text = await hoverAt(INDENTED_LABEL, 7, 'BREAK');
        assert.ok(/\*\*BREAK\*\* — leaves LOOP `Scan`/.test(text), `expected LOOP Scan; got: ${text}`);
        assert.ok(/Continues after the END on line 10\b/.test(text), `expected END on line 10; got: ${text}`);
    });

    test('BREAK in a one-line IF inside an ACCEPT leaves the ACCEPT', async () => {
        const text = await hoverAt(ACCEPT_LOOP, 6, 'BREAK');
        assert.ok(/\*\*BREAK\*\* — leaves ACCEPT/.test(text), `expected ACCEPT; got: ${text}`);
        assert.ok(/Continues after the END on line 8\b/.test(text), `expected END on line 8; got: ${text}`);
    });

    test('BREAK in a LOOP ended by UNTIL continues after the UNTIL', async () => {
        const text = await hoverAt(LOOP_UNTIL, 6, 'BREAK');
        assert.ok(/Continues after the UNTIL on line 8\b/.test(text), `expected UNTIL on line 8; got: ${text}`);
    });

    test('BREAK in a one-line LOOP leaves that LOOP', async () => {
        const text = await hoverAt(ONE_LINE, 5, 'BREAK');
        assert.ok(/\*\*BREAK\*\* — leaves LOOP/.test(text), `expected the one-line LOOP; got: ${text}`);
        assert.ok(/Continues after the END on line 6\b/.test(text), `expected END on line 6; got: ${text}`);
    });

    test('BREAK outside any LOOP or ACCEPT keeps the generic keyword card', async () => {
        const text = await hoverAt(OUTSIDE, 6, 'BREAK');
        assert.ok(!/leaves|Continues after/.test(text), `no loop to name; got: ${text}`);
        assert.ok(/exits LOOP or ACCEPT/i.test(text), `expected the generic BREAK card; got: ${text}`);
    });

    test('the keyword description stays under the card', async () => {
        const text = await hoverAt(NESTED, 8, 'BREAK');
        assert.ok(text.indexOf('Immediately exits LOOP or ACCEPT') > text.indexOf('Continues after'),
            `expected BREAK's description below the card; got: ${text}`);
    });
});
