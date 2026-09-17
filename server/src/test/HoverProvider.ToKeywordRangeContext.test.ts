import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Hover } from 'vscode-languageserver-protocol';
import { HoverProvider } from '../providers/HoverProvider';

/**
 * Issue #529 — hovering TO never resolved its LOOP/CASE context because
 * `handleToKeyword` checked `token.type === TokenType.Keyword` for LOOP
 * (actually TokenType.Structure) and OF/OROF (actually
 * TokenType.ConditionalContinuation), conditions that could never match.
 * This reads the LOOP's own Structure token, and the owning CASE's
 * `branches` entry, instead of that backward scan. The hover text itself
 * is unchanged from before the fix — LOOP/CASE are already visible next
 * to TO on the same line, so these tests only assert on which text is
 * chosen, not on any new content.
 */

let tmpRoot: string;

function hoverOnTo(text: string, occurrence = 1): Promise<string> {
    const file = path.join(tmpRoot, 'toc' + Math.random().toString(36).slice(2) + '.clw');
    fs.writeFileSync(file, text);
    const uri = 'file:///' + file.replace(/\\/g, '/').replace(/^([a-zA-Z]):/, (_m, d) => d + '%3A');
    const doc = TextDocument.create(uri, 'clarion', 1, text);
    const lines = text.split(/\r?\n/);
    let seen = 0;
    for (let i = 0; i < lines.length; i++) {
        const idx = lines[i].search(/\bTO\b/);
        if (idx === -1) continue;
        seen++;
        if (seen !== occurrence) continue;
        return new HoverProvider().provideHover(doc, { line: i, character: idx + 1 }).then((h: Hover | null) => {
            if (!h || !h.contents) return '';
            const c = h.contents as { value?: string } | string;
            return typeof c === 'string' ? c : (c.value ?? '');
        });
    }
    throw new Error(`No TO #${occurrence} found`);
}

const LOOP_SOURCE = [
    "  PROGRAM",
    "",
    "  MAP",
    "  END",
    "  CODE",
    "  LOOP i = 1 TO 10",
    "    RETURN",
    "  END",
    "  RETURN",
    ""
].join('\n');

const CASE_SOURCE = [
    "  PROGRAM",
    "",
    "  MAP",
    "  END",
    "  CODE",
    "  CASE Status",
    "  OF 1 TO 5",
    "    RETURN",
    "  OROF 10 TO 20",
    "    RETURN",
    "  END",
    "  RETURN",
    ""
].join('\n');

// A LOOP (with its own, unrelated TO) nested inside an OF/OROF branch whose
// own clause has no range at all (a control-equate CASE, not a value range).
// Regression fixture: an earlier version of this fix matched a branch's
// entire [startLine, endLine] body span instead of just its own OF/OROF
// line, so this LOOP's TO was misattributed to the enclosing OROF.
const NESTED_LOOP_IN_CASE_BRANCH_SOURCE = [
    "  PROGRAM",
    "",
    "  MAP",
    "  END",
    "  CODE",
    "  CASE EVENT()",
    "  OF EVENT:Accepted",
    "  OROF EVENT:Selected",
    "     LOOP i = 1 TO 10",
    "        RETURN",
    "     END",
    "  OF EVENT:CloseWindow",
    "     RETURN",
    "  END",
    "  RETURN",
    ""
].join('\n');

suite('TO keyword hover — resolves LOOP/CASE context (#529)', () => {

    setup(() => { tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'hover-to-')); });
    teardown(() => { try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch { /* best-effort */ } });

    test('TO in a LOOP counter clause is attributed to LOOP', async () => {
        const text = await hoverOnTo(LOOP_SOURCE, 1);
        assert.ok(/\bLOOP\b/.test(text), `expected LOOP in hover; got: ${text}`);
        assert.ok(!/\bCASE\b/.test(text), `did not expect CASE in hover; got: ${text}`);
    });

    test('TO in a CASE OF range is attributed to CASE', async () => {
        const text = await hoverOnTo(CASE_SOURCE, 1);
        assert.ok(/\bCASE\b/.test(text), `expected CASE in hover; got: ${text}`);
        assert.ok(!/\bLOOP\b/.test(text), `did not expect LOOP in hover; got: ${text}`);
    });

    test('TO in a CASE OROF range is attributed to CASE', async () => {
        const text = await hoverOnTo(CASE_SOURCE, 2);
        assert.ok(/\bCASE\b/.test(text), `expected CASE in hover; got: ${text}`);
    });

    test('TO in a LOOP nested inside an OF/OROF branch is attributed to LOOP, not the enclosing branch', async () => {
        const text = await hoverOnTo(NESTED_LOOP_IN_CASE_BRANCH_SOURCE, 1);
        assert.ok(/\bLOOP\b/.test(text), `expected LOOP in hover; got: ${text}`);
        assert.ok(!/\bCASE\b/.test(text), `did not expect CASE in hover; got: ${text}`);
    });
});
