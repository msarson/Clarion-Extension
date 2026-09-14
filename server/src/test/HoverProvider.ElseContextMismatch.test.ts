import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Hover } from 'vscode-languageserver-protocol';
import { HoverProvider } from '../providers/HoverProvider';

/**
 * `handleElseKeyword`'s context detection checked `token.type ===
 * TokenType.Keyword` for CASE/IF, but CASE and IF are tokenized as
 * `TokenType.Structure` — that check could never match, so ELSE always fell
 * through to the generic "Control Flow" keyword card, identical whether ELSE
 * belonged to an IF or a CASE.
 *
 * The fix resolves the owner from `DocumentStructure.populateBranches()`'s
 * `branches` array instead of a backward token scan — also correct when a
 * nested, unrelated CASE/IF appears earlier in the same block.
 */

let tmpRoot: string;

function hoverOnElse(text: string, occurrence = 1): Promise<string> {
    const file = path.join(tmpRoot, 'else' + Math.random().toString(36).slice(2) + '.clw');
    fs.writeFileSync(file, text);
    const uri = 'file:///' + file.replace(/\\/g, '/').replace(/^([a-zA-Z]):/, (_m, d) => d + '%3A');
    const doc = TextDocument.create(uri, 'clarion', 1, text);
    const lines = text.split(/\r?\n/);
    let seen = 0;
    for (let i = 0; i < lines.length; i++) {
        const idx = lines[i].search(/\bELSE\b/);
        if (idx === -1) continue;
        seen++;
        if (seen !== occurrence) continue;
        return new HoverProvider().provideHover(doc, { line: i, character: idx + 1 }).then((h: Hover | null) => {
            if (!h || !h.contents) return '';
            const c = h.contents as { value?: string } | string;
            return typeof c === 'string' ? c : (c.value ?? '');
        });
    }
    throw new Error(`No ELSE #${occurrence} found`);
}

const IF_SOURCE = [
    "  PROGRAM",
    "",
    "  MAP",
    "  END",
    "  CODE",
    "  IF 1 = 1",
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
    "  CASE X",
    "  OF 1",
    "    RETURN",
    "  ELSE",
    "    RETURN",
    "  END",
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

suite('ELSE keyword hover — correct IF vs CASE context (type-mismatch fix)', () => {

    setup(() => { tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'hover-else-')); });
    teardown(() => { try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch { /* best-effort */ } });

    test('ELSE in an IF names the IF structure', async () => {
        const text = await hoverOnElse(IF_SOURCE, 1);
        assert.ok(/in IF structure/i.test(text), `expected IF-structure wording; got: ${text}`);
        assert.ok(!/OF and OROF/i.test(text), `must not be the CASE wording; got: ${text}`);
    });

    test('ELSE in a CASE names the CASE structure', async () => {
        const text = await hoverOnElse(CASE_SOURCE, 1);
        assert.ok(/in CASE structure/i.test(text), `expected CASE-structure wording; got: ${text}`);
        assert.ok(!/preceding IF and ELSIF/i.test(text), `must not be the IF wording; got: ${text}`);
    });

    test('ELSE in a CASE with an earlier nested IF still names the CASE (not the nested IF)', async () => {
        const text = await hoverOnElse(CASE_WITH_NESTED_IF_SOURCE, 1);
        assert.ok(/in CASE structure/i.test(text), `expected CASE-structure wording; got: ${text}`);
        assert.ok(!/preceding IF and ELSIF/i.test(text), `must not misattribute to the nested IF; got: ${text}`);
    });
});
