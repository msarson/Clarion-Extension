import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Hover } from 'vscode-languageserver-protocol';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { TokenCache } from '../TokenCache';
import { HoverProvider } from '../providers/HoverProvider';
import { setServerInitialized } from '../serverState';

/**
 * #265 item 2 — hover had NO INCLUDE/MODULE/MEMBER filename handling: the
 * context builder bailed unconditionally when the cursor sat inside a string
 * literal, while F12 has the #171 exception (file-ref string → redirection-
 * aware FileDefinitionResolver). Hover now mirrors that exception and shows
 * the RESOLVED path — genuinely useful with redirection files, where the
 * filename alone doesn't tell you which copy wins.
 */

function hoverText(h: Hover | null | undefined): string {
    if (!h) return '';
    const c = h.contents;
    if (typeof c === 'string') return c;
    if (Array.isArray(c)) return c.map(p => (typeof p === 'string' ? p : p.value)).join('\n');
    return (c as { value?: string }).value ?? '';
}

suite('Hover — INCLUDE/MODULE/MEMBER filename resolution (#265)', () => {
    let tmpDir: string;
    let mainPath: string;
    let mainUri: string;

    setup(() => {
        setServerInitialized(true);
        TokenCache.getInstance().clearAllTokens();
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 't265-'));
        mainPath = path.join(tmpDir, 'main.clw');
        mainUri = 'file:///' + mainPath.replace(/\\/g, '/');
        fs.writeFileSync(path.join(tmpDir, 'decls.inc'), 'MyLabel  LONG\n', 'utf-8');
        fs.writeFileSync(mainPath, [
            '  PROGRAM',
            "  INCLUDE('decls.inc'),ONCE",           // line 1 — filename hover target
            "  INCLUDE('missing.inc'),ONCE",         // line 2 — unresolvable
            "  INCLUDE('decls.inc','MySection')",    // line 3 — 2nd arg is a SECTION, not a file
            '  CODE',
            '  RETURN',
        ].join('\n'), 'utf-8');
    });

    teardown(() => {
        TokenCache.getInstance().clearAllTokens();
        try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* best-effort */ }
    });

    function openMain(): TextDocument {
        const doc = TextDocument.create(mainUri, 'clarion', 1, fs.readFileSync(mainPath, 'utf-8'));
        TokenCache.getInstance().getTokens(doc);
        return doc;
    }

    test('hover on the filename inside INCLUDE(...) shows the resolved path', async () => {
        const doc = openMain();
        const provider = new HoverProvider();
        const col = "  INCLUDE('decls.inc'".indexOf('decls') + 2;
        const text = hoverText(await provider.provideHover(doc, { line: 1, character: col }));

        assert.ok(text.length > 0,
            'hover must fire on a file-ref filename (the unconditional string bail is the #265 gap)');
        assert.ok(text.toLowerCase().includes('decls.inc'), `hover must name the file; got:\n${text}`);
        assert.ok(text.toLowerCase().includes(tmpDir.replace(/\\/g, '\\').toLowerCase().split(path.sep).pop()!.toLowerCase()) ||
                  text.toLowerCase().includes('t265-'),
            `hover must show the RESOLVED path (the redirection answer), got:\n${text}`);
    });

    test('hover on an unresolvable filename still shows a card, marked not found', async () => {
        const doc = openMain();
        const provider = new HoverProvider();
        const col = "  INCLUDE('missing.inc'".indexOf('missing') + 2;
        const text = hoverText(await provider.provideHover(doc, { line: 2, character: col }));

        assert.ok(text.toLowerCase().includes('missing.inc'), `hover must name the file; got:\n${text}`);
        assert.ok(text.toLowerCase().includes('not found'), `unresolvable ref must say so; got:\n${text}`);
    });

    test("hover on the SECTION argument (second string) does NOT produce a file card", async () => {
        const doc = openMain();
        const provider = new HoverProvider();
        const line3 = "  INCLUDE('decls.inc','MySection')";
        const col = line3.indexOf('MySection') + 2;
        const text = hoverText(await provider.provideHover(doc, { line: 3, character: col }));
        assert.ok(!text.toLowerCase().includes('resolves'),
            `the SECTION arg is not a file reference — no resolved-path card; got:\n${text}`);
    });
});
