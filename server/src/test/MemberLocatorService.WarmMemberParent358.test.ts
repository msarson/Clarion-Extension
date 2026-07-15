/**
 * #358 (cold residual) — warmMemberParent tokenizes a MEMBER module's parent off the felt path.
 *
 * A MEMBER module's globals (GlobalErrors / thisStartup) are declared deep in its
 * MEMBER('...') parent. On IBSWorking that parent (IBSCommon.clw) is 873 KB / 68k tokens,
 * so the first cold receiver-type resolution pays ~1.1s just to tokenize it. The startup
 * idle lane now warms it in the background, so no interactive validation lands that cost.
 *
 * Pins:
 *   1. A MEMBER parent that isn't yet tokenized gets resolved + cached.
 *   2. A doc with no MEMBER header is a clean no-op (returns false).
 */

import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { TokenCache } from '../TokenCache';
import { MemberLocatorService } from '../services/MemberLocatorService';
import { setServerInitialized } from '../serverState';

let tmpDir: string;

function write(name: string, lines: string[]): string {
    const p = path.join(tmpDir, name);
    fs.writeFileSync(p, lines.join('\n'));
    return p;
}
function makeDoc(name: string, lines: string[]): TextDocument {
    const p = write(name, lines);
    return TextDocument.create(`file:///${p.replace(/\\/g, '/')}`, 'clarion', 1, lines.join('\n'));
}

suite('MemberLocatorService #358 — warmMemberParent pre-tokenizes the MEMBER parent', () => {

    suiteSetup(() => {
        setServerInitialized(true);
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'warmmp358_'));
    });
    suiteTeardown(() => {
        try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* best-effort */ }
    });
    teardown(() => TokenCache.getInstance().clearAllTokens());

    test('resolves + caches a MEMBER parent that was not yet tokenized', async () => {
        const parentPath = write('parent358.clw', ['  PROGRAM', '  MAP', '  END', 'GVar358  LONG', '  CODE']);
        const host = makeDoc('member358.clw', ["  MEMBER('parent358.clw')", 'Caller PROCEDURE()', '  CODE']);

        const cache = TokenCache.getInstance();
        cache.getTokens(host); // host tokenized; parent deliberately NOT
        const parentUri = `file:///${parentPath.replace(/\\/g, '/')}`;
        assert.ok(!cache.getTokensByUri(parentUri), 'parent must not be cached before warming');

        const svc = new MemberLocatorService();
        const warmed = await svc.warmMemberParent(host);

        assert.strictEqual(warmed, true, 'a MEMBER parent was resolved');
        assert.ok(cache.getTokensByUri(parentUri), 'the MEMBER parent is now tokenized in the cache');
    });

    test('no MEMBER header → clean no-op', async () => {
        const prog = makeDoc('prog358.clw', ['  PROGRAM', '  MAP', '  END', '  CODE']);
        TokenCache.getInstance().getTokens(prog);
        const svc = new MemberLocatorService();
        assert.strictEqual(await svc.warmMemberParent(prog), false, 'a PROGRAM (no MEMBER) resolves no parent');
    });
});
