import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { TokenCache } from '../TokenCache';

/**
 * #260 — the TokenCache contract suite (none existed; the whole cache contract
 * was untested, including the array-identity guarantee #257's index caching
 * depends on).
 *
 * Contracts pinned:
 *   1. Token[] identity is stable per (uri, version)      — #257 dependency
 *   2. a content change invalidates (new array, new data)
 *   3. a phantom version bump (same text, higher version) CONVERGES — the
 *      zero-diff incremental path must adopt the new version, or
 *      getStructure()'s fast path fails forever after (rebuild per call)
 *   4. URI spelling (percent-encoding / case) does not split the cache —
 *      `file:///f%3A/…` and `file:///f:/…` are the same file (#196 disease,
 *      cache-key side)
 *   5. closedFileCache: same spelling rule + bounded size (LRU eviction)
 */

const SRC = [
    "  MEMBER('test')",     // 0
    '',                     // 1
    'GVar       LONG',      // 2
    '',                     // 3
    'MainProc PROCEDURE',   // 4
    'loc        STRING(10)',// 5
    '  CODE',               // 6
    '  RETURN',             // 7
].join('\n');

suite('TokenCache contract (#260)', () => {

    setup(() => TokenCache.getInstance().clearAllTokens());
    teardown(() => TokenCache.getInstance().clearAllTokens());

    test('Token[] identity is stable for the same (uri, version)', () => {
        const cache = TokenCache.getInstance();
        const doc = TextDocument.create('file:///t260-identity.clw', 'clarion', 1, SRC);
        const first = cache.getTokens(doc);
        const second = cache.getTokens(doc);
        assert.strictEqual(second, first,
            'same uri+version must return the SAME array object — #257 index caching keys on this identity');
    });

    test('a content change under the same uri yields a fresh array with the new content', () => {
        const cache = TokenCache.getInstance();
        const uri = 'file:///t260-invalidate.clw';
        const v1 = cache.getTokens(TextDocument.create(uri, 'clarion', 1, SRC));
        const edited = SRC.replace('GVar       LONG', 'GVar       REAL');
        const v2 = cache.getTokens(TextDocument.create(uri, 'clarion', 2, edited));
        assert.notStrictEqual(v2, v1, 'changed content must produce a new token array');
        const gvarLine = v2.filter(t => t.line === 2).map(t => t.value.toUpperCase());
        assert.ok(gvarLine.includes('REAL'), `expected the edited type REAL in v2 tokens, got [${gvarLine.join(',')}]`);
    });

    test('a phantom version bump (identical text) converges — getStructure fast path recovers', () => {
        const cache = TokenCache.getInstance();
        const uri = 'file:///t260-phantom.clw';
        const docV1 = TextDocument.create(uri, 'clarion', 1, SRC);
        cache.getTokens(docV1);

        // Same text, bumped version — e.g. a no-op format or undo/redo round-trip.
        const docV2 = TextDocument.create(uri, 'clarion', 2, SRC);
        cache.getTokens(docV2);

        const s1 = cache.getStructure(docV2);
        const s2 = cache.getStructure(docV2);
        assert.strictEqual(s2, s1,
            'after a no-op version bump the cached version must converge to the document version — ' +
            'otherwise getStructure never hits its fast path again and rebuilds a fresh structure per call');
    });

    test('percent-encoded and plain URI spellings hit the same cache entry', () => {
        const cache = TokenCache.getInstance();
        const encoded = 'file:///f%3A/proj/t260-spelling.clw';
        const plain = 'file:///f:/proj/t260-spelling.clw';
        const doc = TextDocument.create(encoded, 'clarion', 1, SRC);
        const tokens = cache.getTokens(doc);

        assert.strictEqual(cache.getTokensByUri(plain), tokens,
            'file:///f%3A/… and file:///f:/… are the same physical file — the cache must not split on spelling');
        assert.strictEqual(cache.getDocumentText(plain), SRC,
            'document text lookup must bridge URI spellings too');

        // clearTokens through the OTHER spelling must clear the one entry.
        cache.clearTokens(plain);
        assert.strictEqual(cache.getTokensByUri(encoded), null,
            'clearing via one spelling must evict the entry cached under the other');
    });

    suite('closedFileCache', () => {
        let tmpDir: string;

        setup(() => {
            tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 't260-'));
        });
        teardown(() => {
            try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* best-effort */ }
        });

        function writeClw(name: string, content: string): string {
            const p = path.join(tmpDir, name);
            fs.writeFileSync(p, content, 'utf-8');
            return p;
        }

        function encodedUriFor(fsPath: string): string {
            return 'file:///' + fsPath.replace(/\\/g, '/').replace(/^([a-zA-Z]):/, '$1%3A');
        }
        function plainUriFor(fsPath: string): string {
            return 'file:///' + fsPath.replace(/\\/g, '/');
        }

        test('URI spellings share one entry (file tokenized once, same array identity)', () => {
            const cache = TokenCache.getInstance();
            const p = writeClw('spell.clw', SRC);
            const viaEncoded = cache.getTokensForClosedFile(encodedUriFor(p));
            assert.ok(viaEncoded.length > 0, 'file must tokenize');
            const viaPlain = cache.getTokensForClosedFile(plainUriFor(p));
            assert.strictEqual(viaPlain, viaEncoded,
                'the second spelling must hit the first spelling\'s cache entry (same array identity), ' +
                'not re-tokenize into a second divergent entry');
        });

        test('closedFileCache is bounded — oldest entry evicted at the cap', () => {
            const cache = TokenCache.getInstance();
            const savedMax = TokenCache.closedFileCacheMax;
            try {
                TokenCache.closedFileCacheMax = 2;
                const pA = writeClw('a.clw', SRC);
                const pB = writeClw('b.clw', SRC);
                const pC = writeClw('c.clw', SRC);
                const firstA = cache.getTokensForClosedFile(plainUriFor(pA));
                cache.getTokensForClosedFile(plainUriFor(pB));
                cache.getTokensForClosedFile(plainUriFor(pC)); // evicts A (oldest)
                assert.ok(cache.closedFileCacheSize <= 2,
                    `cache must stay within the cap, size=${cache.closedFileCacheSize}`);
                const secondA = cache.getTokensForClosedFile(plainUriFor(pA));
                assert.notStrictEqual(secondA, firstA,
                    'A was evicted — reloading it must re-tokenize (fresh array), proving eviction happened');
            } finally {
                TokenCache.closedFileCacheMax = savedMax;
            }
        });

        test('a cache hit refreshes recency (LRU, not FIFO)', () => {
            const cache = TokenCache.getInstance();
            const savedMax = TokenCache.closedFileCacheMax;
            try {
                TokenCache.closedFileCacheMax = 2;
                const pA = writeClw('a.clw', SRC);
                const pB = writeClw('b.clw', SRC);
                const pC = writeClw('c.clw', SRC);
                const firstA = cache.getTokensForClosedFile(plainUriFor(pA));
                cache.getTokensForClosedFile(plainUriFor(pB));
                cache.getTokensForClosedFile(plainUriFor(pA)); // touch A — B becomes oldest
                cache.getTokensForClosedFile(plainUriFor(pC)); // evicts B, not A
                const thirdA = cache.getTokensForClosedFile(plainUriFor(pA));
                assert.strictEqual(thirdA, firstA,
                    'A was touched before the eviction — it must survive (LRU); losing it means FIFO eviction');
            } finally {
                TokenCache.closedFileCacheMax = savedMax;
            }
        });
    });
});
