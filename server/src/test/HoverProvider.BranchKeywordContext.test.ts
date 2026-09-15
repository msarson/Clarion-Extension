import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Hover } from 'vscode-languageserver-protocol';
import { HoverProvider } from '../providers/HoverProvider';

/**
 * ELSE, ELSIF, OF and OROF now show which CASE/IF they belong to (with
 * label, if any), their position among sibling branches, their condition
 * (when they have one), and a location link back to the opening CASE/IF
 * line — instead of a flat, context-free keyword description.
 *
 * Supersedes HoverProvider.ElseContextMismatch.test.ts's wording assertions
 * (that PR's fix — resolving the owner via `branches` instead of a broken
 * `TokenType.Keyword` check — is the same mechanism this reuses via
 * `HoverRouter.findBranchAt`), while keeping its nested-CASE/IF regression
 * case.
 */

let tmpRoot: string;

function hoverOnWord(text: string, needleRe: RegExp, occurrence = 1): Promise<string> {
    const file = path.join(tmpRoot, 'br' + Math.random().toString(36).slice(2) + '.clw');
    fs.writeFileSync(file, text);
    const uri = 'file:///' + file.replace(/\\/g, '/').replace(/^([a-zA-Z]):/, (_m, d) => d + '%3A');
    const doc = TextDocument.create(uri, 'clarion', 1, text);
    const lines = text.split(/\r?\n/);
    let seen = 0;
    for (let i = 0; i < lines.length; i++) {
        const m = lines[i].match(needleRe);
        if (!m || m.index === undefined) continue;
        seen++;
        if (seen !== occurrence) continue;
        return new HoverProvider().provideHover(doc, { line: i, character: m.index + 1 }).then((h: Hover | null) => {
            if (!h || !h.contents) return '';
            const c = h.contents as { value?: string } | string;
            return typeof c === 'string' ? c : (c.value ?? '');
        });
    }
    throw new Error(`No match #${occurrence} for ${needleRe} found`);
}

const IF_SOURCE = [
    "  PROGRAM",
    "",
    "  MAP",
    "  END",
    "  CODE",
    "  IF Amount > 1000",
    "    RETURN",
    "  ELSIF Amount > 500",
    "    RETURN",
    "  ELSE",
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
    "MyCase               CASE Status",
    "                       OF 'Active'",
    "                         RETURN",
    "                       OROF 'Pending'",
    "                         RETURN",
    "                       ELSE",
    "                         RETURN",
    "                     END",
    "  RETURN",
    ""
].join('\n');

// A CASE whose OF branch contains a nested, unrelated IF...END *before* the
// CASE's own ELSE — a naive backward scan hits the nested IF first.
const CASE_WITH_NESTED_IF_SOURCE = [
    "  PROGRAM",
    "",
    "  MAP",
    "  END",
    "  CODE",
    "  CASE X",
    "  OF 1",
    "    IF Y = 1",
    "      RETURN",
    "    END",
    "    RETURN",
    "  ELSE",
    "    RETURN",
    "  END",
    "  RETURN",
    ""
].join('\n');

suite('ELSE / ELSIF / OF / OROF hover — structure, position, condition, location', () => {

    setup(() => { tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'hover-branch-')); });
    teardown(() => { try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch { /* best-effort */ } });

    test('ELSIF in an IF shows the IF, its position, and its own condition', async () => {
        const text = await hoverOnWord(IF_SOURCE, /\bELSIF\b/);
        assert.ok(/\*\*ELSIF\*\* — branch 1 of 2 in IF/.test(text), `expected header; got: ${text}`);
        assert.ok(/Amount > 500/.test(text), `expected the ELSIF's own condition; got: ${text}`);
        assert.ok(/```clarion\nIF Amount > 1000\n```/.test(text), `expected the IF opener snippet; got: ${text}`);
        assert.ok(/\]\(file:\/\/\/.*#L6\)/.test(text), `expected a link to the IF's line; got: ${text}`);
    });

    test('ELSE in that IF is branch 2 of 2, no condition of its own', async () => {
        const text = await hoverOnWord(IF_SOURCE, /\bELSE\b/);
        assert.ok(/\*\*ELSE\*\* — branch 2 of 2 in IF/.test(text), `expected header; got: ${text}`);
        assert.ok(/evaluated false/i.test(text), `expected IF-flavored ELSE wording; got: ${text}`);
        assert.ok(!/OF\/OROF/.test(text), `must not be the CASE wording; got: ${text}`);
    });

    test('OF in a labelled CASE shows the CASE label, position, and match value', async () => {
        const text = await hoverOnWord(CASE_SOURCE, /\bOF\b/);
        assert.ok(/\*\*OF\*\* — branch 1 of 3 in CASE `MyCase`/.test(text), `expected labelled CASE header; got: ${text}`);
        assert.ok(/'Active'/.test(text), `expected the OF's match value; got: ${text}`);
    });

    test('OROF in that CASE is branch 2 of 3 with its own match value', async () => {
        const text = await hoverOnWord(CASE_SOURCE, /\bOROF\b/);
        assert.ok(/\*\*OROF\*\* — branch 2 of 3 in CASE `MyCase`/.test(text), `expected header; got: ${text}`);
        assert.ok(/'Pending'/.test(text), `expected the OROF's match value; got: ${text}`);
    });

    test('ELSE in that CASE is branch 3 of 3, CASE-flavored wording', async () => {
        const text = await hoverOnWord(CASE_SOURCE, /\bELSE\b/);
        assert.ok(/\*\*ELSE\*\* — branch 3 of 3 in CASE `MyCase`/.test(text), `expected header; got: ${text}`);
        assert.ok(/OF\/OROF/.test(text), `expected CASE-flavored ELSE wording; got: ${text}`);
        assert.ok(!/evaluated false/i.test(text), `must not be the IF wording; got: ${text}`);
    });

    test('ELSE in a CASE with an earlier nested IF still names the CASE (not the nested IF)', async () => {
        const text = await hoverOnWord(CASE_WITH_NESTED_IF_SOURCE, /\bELSE\b/);
        assert.ok(/in CASE/.test(text), `expected CASE attribution; got: ${text}`);
        assert.ok(/OF\/OROF/.test(text), `must not misattribute to the nested IF; got: ${text}`);
    });
});
