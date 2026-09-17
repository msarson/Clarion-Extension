import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Hover } from 'vscode-languageserver-protocol';
import { HoverProvider } from '../providers/HoverProvider';

/**
 * Hovering an END now shows which structure/control-flow block it closes,
 * a preview of that block's opening line, and a clickable link back to it.
 * `DocumentStructure.handleEndStatementForStructure` already links
 * `endToken.parent` to the opener when it pops the structure stack — this
 * feature only surfaces that existing link in hover.
 */

let tmpRoot: string;

function hoverOnEnd(text: string, occurrence = 1): Promise<string> {
    const file = path.join(tmpRoot, 'endc' + Math.random().toString(36).slice(2) + '.clw');
    fs.writeFileSync(file, text);
    const uri = 'file:///' + file.replace(/\\/g, '/').replace(/^([a-zA-Z]):/, (_m, d) => d + '%3A');
    const doc = TextDocument.create(uri, 'clarion', 1, text);
    const lines = text.split(/\r?\n/);
    let seen = 0;
    for (let i = 0; i < lines.length; i++) {
        const idx = lines[i].search(/\bEND\b/);
        if (idx === -1) continue;
        seen++;
        if (seen !== occurrence) continue;
        return new HoverProvider().provideHover(doc, { line: i, character: idx + 1 }).then((h: Hover | null) => {
            if (!h || !h.contents) return '';
            const c = h.contents as { value?: string } | string;
            return typeof c === 'string' ? c : (c.value ?? '');
        });
    }
    throw new Error(`No END #${occurrence} found`);
}

const RECORD_SOURCE = [
    "  PROGRAM",
    "",
    "Customer             FILE,DRIVER('TOPSPEED'),PRE(CUS)",
    "Record                   RECORD,PRE()",
    "ID                          LONG",
    "Name                        STRING(30)",
    "                         END",
    "                     END",
    "",
    "  MAP",
    "  END",
    "  CODE",
    "  RETURN",
    ""
].join('\n');

const IF_SOURCE = [
    "  PROGRAM",
    "",
    "  MAP",
    "  END",
    "  CODE",
    "  IF 1 = 1",
    "    RETURN",
    "  END",
    "  RETURN",
    ""
].join('\n');

suite('END keyword hover — shows what it closes', () => {

    setup(() => { tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'hover-end-')); });
    teardown(() => { try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch { /* best-effort */ } });

    test('END closing a RECORD names the RECORD and its label', async () => {
        const text = await hoverOnEnd(RECORD_SOURCE, 1);
        assert.ok(/RECORD/i.test(text), `expected RECORD in hover; got: ${text}`);
        assert.ok(/Record/.test(text), `expected the label Record; got: ${text}`);
        assert.ok(/RECORD,PRE\(\)/.test(text), `expected declaration snippet; got: ${text}`);
    });

    test('END closing a FILE names the FILE and its label', async () => {
        const text = await hoverOnEnd(RECORD_SOURCE, 2);
        assert.ok(/FILE/i.test(text), `expected FILE in hover; got: ${text}`);
        assert.ok(/Customer/.test(text), `expected the label Customer; got: ${text}`);
    });

    test('END closing an IF names the IF (no label)', async () => {
        const text = await hoverOnEnd(IF_SOURCE, 2);
        assert.ok(/\bIF\b/.test(text), `expected IF in hover; got: ${text}`);
        assert.ok(/1 = 1/.test(text), `expected the IF condition snippet; got: ${text}`);
    });

    test('hover includes a clickable location link back to the opener', async () => {
        const text = await hoverOnEnd(RECORD_SOURCE, 1);
        assert.ok(/\]\(file:\/\/\/.*#L4\)/.test(text), `expected a file:// link to line 4; got: ${text}`);
    });
});
