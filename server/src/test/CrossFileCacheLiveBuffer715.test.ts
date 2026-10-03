import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { TokenCache } from '../TokenCache';
import { CrossFileCache } from '../providers/hover/CrossFileCache';
import { pathToCanonicalUri } from '../utils/UriUtils';

/**
 * #715 — the hover's cross-file loader read an open, edited module from disk and tokenized the
 * saved text under the module's own uri, replacing the buffer's tokens. The next request then
 * re-tokenized the whole buffer: 2-5 s for a hover on a procedure call after each edit of a
 * 60k-line module. An open buffer must be answered from the buffer and left in the cache.
 */
suite('#715 the cross-file loader answers an open buffer from the buffer', () => {
    let dir: string;
    let file: string;
    const SAVED = ['  MEMBER', 'Saved PROCEDURE', '  CODE', '  RETURN'].join('\r\n');
    const EDITED = ['  MEMBER', 'Edited PROCEDURE', '  CODE', '  RETURN'].join('\r\n');

    setup(() => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cfc715-'));
        file = path.join(dir, 'mod.clw');
        fs.writeFileSync(file, SAVED);
    });
    teardown(() => {
        TokenCache.getInstance().clearTokens(pathToCanonicalUri(file));
        fs.rmSync(dir, { recursive: true, force: true });
    });

    test('an edited open module comes back with its edited text and tokens', async () => {
        const cache = TokenCache.getInstance();
        const live = TextDocument.create(pathToCanonicalUri(file), 'clarion', 7, EDITED);
        const liveTokens = cache.getTokens(live);

        const loaded = await new CrossFileCache(cache).getOrLoadDocument(file);

        assert.ok(loaded, 'the module loads');
        assert.strictEqual(loaded!.document.getText(), EDITED, 'the buffer, not the saved file');
        assert.ok(loaded!.tokens.some(t => t.value === 'Edited'), 'tokens of the buffer');
        assert.strictEqual(cache.getDocumentText(live.uri), EDITED, 'the buffer is still what the cache holds');
        assert.strictEqual(cache.getTokens(live), liveTokens, 'the buffer is not re-tokenized afterwards');
    });

    test('a module nobody has open is read from disk', async () => {
        const loaded = await new CrossFileCache(TokenCache.getInstance()).getOrLoadDocument(file);
        assert.ok(loaded);
        assert.strictEqual(loaded!.document.getText(), SAVED);
    });
});
