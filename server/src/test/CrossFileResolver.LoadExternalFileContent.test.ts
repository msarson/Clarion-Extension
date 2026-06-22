import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { CrossFileResolver } from '../utils/CrossFileResolver';
import { TokenCache } from '../TokenCache';

/**
 * #117 B1 — focused unit coverage for the extracted shared content loader
 * `CrossFileResolver.loadExternalFileContent`. This is the dedup's safety net:
 * StructureDiagnostics (V1), MapDeclarationDiagnostics (V2a tokens / V2b lines) all
 * route their cross-file content load through this, so the cache-first / disk-fallback
 * / fail-open / `??`-not-`||` semantics are pinned here directly.
 */

// The helper only ever calls tokenCache.getDocumentText — a minimal fake suffices.
function fakeCache(map: Map<string, string | undefined>): TokenCache {
    return { getDocumentText: (uri: string) => map.get(uri) } as unknown as TokenCache;
}

function tmpFile(tag: string, content: string): string {
    const p = path.join(os.tmpdir(), `b1_${tag}_${process.pid}.clw`);
    fs.writeFileSync(p, content, 'utf8');
    return p;
}

suite('CrossFileResolver.loadExternalFileContent (#117 B1)', () => {

    test('cache hit — returns live TokenCache text without touching disk', () => {
        const cache = fakeCache(new Map([['file:///x.clw', 'CACHED']]));
        const r = CrossFileResolver.loadExternalFileContent(cache, 'file:///x.clw', 'Z:/does/not/exist.clw');
        assert.strictEqual(r, 'CACHED');
    });

    test('disk fallback — cache miss reads from fsPath', () => {
        const p = tmpFile('disk', 'ON_DISK');
        try {
            const cache = fakeCache(new Map());
            const r = CrossFileResolver.loadExternalFileContent(cache, 'file:///nope.clw', p);
            assert.strictEqual(r, 'ON_DISK');
        } finally {
            fs.unlinkSync(p);
        }
    });

    test('undefined uri — skips cache lookup, reads disk', () => {
        const p = tmpFile('nouri', 'ON_DISK2');
        try {
            // Cache map is non-empty to prove the undefined-uri path never consults it.
            const cache = fakeCache(new Map([['file:///other.clw', 'should-not-be-used']]));
            const r = CrossFileResolver.loadExternalFileContent(cache, undefined, p);
            assert.strictEqual(r, 'ON_DISK2');
        } finally {
            fs.unlinkSync(p);
        }
    });

    test('fail-open — cache miss + unreadable disk returns undefined (no throw)', () => {
        const cache = fakeCache(new Map());
        const r = CrossFileResolver.loadExternalFileContent(
            cache, 'file:///nope.clw', `Z:/definitely/missing_${process.pid}.clw`);
        assert.strictEqual(r, undefined);
    });

    test('empty-string cache content is returned as-is (?? not ||) — no disk fallback', () => {
        // Pins the nullish-coalescing semantics the original call sites relied on:
        // an empty (but defined) cached document must NOT fall through to disk.
        const cache = fakeCache(new Map([['file:///empty.clw', '']]));
        const r = CrossFileResolver.loadExternalFileContent(cache, 'file:///empty.clw', 'Z:/does/not/exist.clw');
        assert.strictEqual(r, '');
    });

    // ── #197 — live-doc-first tier (4th param `getLiveText(fsPath)`) ──────────────
    // Open+dirty cross-file files: onDidChangeContent clears the cache → getDocumentText
    // null → the loader fell to STALE saved disk. New FIRST tier sources the live editor
    // buffer via getLiveText, keyed by FSPATH (reuses server.ts:475 getOpenDocumentContent;
    // path-normalized → dodges the #196 f%3A/f: URI-drift).

    test('live tier — getLiveText(fsPath) wins over BOTH cache and disk', () => {
        const p = tmpFile('livewin', 'ON_DISK');
        try {
            const cache = fakeCache(new Map([['file:///x.clw', 'CACHED']]));
            const r = CrossFileResolver.loadExternalFileContent(cache, 'file:///x.clw', p, (fsPath) => (fsPath === p ? 'LIVE' : undefined));
            assert.strictEqual(r, 'LIVE');
        } finally {
            fs.unlinkSync(p);
        }
    });

    test('live tier — empty live buffer "" is returned as-is (?? not ||), no fall-through to cache/disk', () => {
        const cache = fakeCache(new Map([['file:///x.clw', 'CACHED']]));
        const r = CrossFileResolver.loadExternalFileContent(cache, 'file:///x.clw', 'Z:/does/not/exist.clw', () => '');
        assert.strictEqual(r, '');
    });

    test('live tier — getLiveText returning null/undefined falls through to cache then disk', () => {
        const cache = fakeCache(new Map([['file:///x.clw', 'CACHED']]));
        const r = CrossFileResolver.loadExternalFileContent(cache, 'file:///x.clw', 'Z:/does/not/exist.clw', () => undefined);
        assert.strictEqual(r, 'CACHED');
    });

    test('live tier — resolver is keyed by FSPATH, not uri', () => {
        const p = tmpFile('keyfs', 'ON_DISK');
        try {
            const seen: string[] = [];
            const cache = fakeCache(new Map());
            CrossFileResolver.loadExternalFileContent(cache, 'file:///x.clw', p, (arg) => { seen.push(arg); return undefined; });
            assert.deepStrictEqual(seen, [p], 'getLiveText must be called with the fsPath, not the uri');
        } finally {
            fs.unlinkSync(p);
        }
    });
});
