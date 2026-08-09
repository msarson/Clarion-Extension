import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
    loadIncludeIndex,
    saveIncludeIndex,
    includeIndexFresh,
} from '../services/IncludeIndexDiskCache';
import {
    SymbolFinderService,
    getChainIndexBuildCount,
    getIncludeIndexDiskReuseCount,
    evictIncludeChainIndexes,
} from '../services/SymbolFinderService';
import { TokenCache } from '../TokenCache';
import { ScopeAnalyzer } from '../utils/ScopeAnalyzer';
import { SolutionManager } from '../solution/solutionManager';
import { ReferenceCountIndex } from '../services/ReferenceCountIndex';
import { setServerInitialized } from '../serverState';
import { bumpCrossFileEpoch } from '../utils/crossFileEpoch';
import {
    buildMultiFileFixture,
    teardownMultiFileFixture,
} from './helpers/MultiFileFARFixture';

/**
 * #295 — the startup prewarm's #344 include-chain and #345 sibling-label indexes
 * are now persisted to disk (mtime-validated), so a warm start reuses the derived
 * declaration maps instead of re-tokenizing / re-reading the whole INCLUDE/MEMBER
 * universe. These tests pin the disk-cache correctness (reuse when nothing changed,
 * rebuild on any drift — the silent-staleness guard) both at the helper level and
 * end-to-end through warmCrossFileIndexes.
 */
suite('IncludeIndexDiskCache — mtime-validated reuse (#295)', () => {
    const BUCKET = 'test295helper';
    let scratch: string;

    const bucketDir = () => path.join(os.tmpdir(), `clarion-extension-${BUCKET}`);

    setup(() => {
        scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'idx295_'));
        try { fs.rmSync(bucketDir(), { recursive: true, force: true }); } catch { /* first run */ }
    });

    teardown(() => {
        try { fs.rmSync(scratch, { recursive: true, force: true }); } catch { /* best-effort */ }
        try { fs.rmSync(bucketDir(), { recursive: true, force: true }); } catch { /* best-effort */ }
    });

    const writeContributor = (name: string, body: string): string => {
        const p = path.join(scratch, name);
        fs.writeFileSync(p, body);
        return p;
    };

    test('save → load round-trips the envelope', () => {
        const c1 = writeContributor('a.inc', 'A LONG');
        const key = path.join(scratch, 'host.clw');
        saveIncludeIndex<Record<string, number>>(BUCKET, key, {
            signature: 'sig-1',
            contributing: { [c1]: fs.statSync(c1).mtimeMs },
            payload: { alpha: 1, beta: 2 },
        });
        const loaded = loadIncludeIndex<Record<string, number>>(BUCKET, key);
        assert.ok(loaded, 'the entry loads back');
        assert.strictEqual(loaded!.signature, 'sig-1');
        assert.deepStrictEqual(loaded!.payload, { alpha: 1, beta: 2 });
    });

    test('load returns null for a key never written', () => {
        assert.strictEqual(loadIncludeIndex(BUCKET, path.join(scratch, 'absent.clw')), null);
    });

    test('load returns null on a version/shape mismatch (never misread)', () => {
        const key = path.join(scratch, 'host.clw');
        const file = path.join(bucketDir(), `${BUCKET}-` +
            require('crypto').createHash('md5').update(key.toLowerCase()).digest('hex') + '.json');
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, JSON.stringify({ version: 999, signature: 's', contributing: {}, payload: {} }));
        assert.strictEqual(loadIncludeIndex(BUCKET, key), null, 'a stale format is discarded, not misread');
    });

    test('fresh when the signature and every contributing mtime match', async () => {
        const c1 = writeContributor('a.inc', 'A LONG');
        const c2 = writeContributor('b.inc', 'B STRING(4)');
        const env = {
            version: 1,
            signature: 'sig',
            contributing: { [c1]: fs.statSync(c1).mtimeMs, [c2]: fs.statSync(c2).mtimeMs },
            payload: {},
        };
        assert.strictEqual(await includeIndexFresh(env, 'sig'), true);
    });

    test('stale when the identity signature differs (input set changed)', async () => {
        const c1 = writeContributor('a.inc', 'A LONG');
        const env = { version: 1, signature: 'old', contributing: { [c1]: fs.statSync(c1).mtimeMs }, payload: {} };
        assert.strictEqual(await includeIndexFresh(env, 'new'), false);
    });

    test('stale when a contributing file changed mtime (content drift)', async () => {
        const c1 = writeContributor('a.inc', 'A LONG');
        const env = { version: 1, signature: 'sig', contributing: { [c1]: fs.statSync(c1).mtimeMs }, payload: {} };
        // Rewrite + push the mtime forward (coarse-resolution filesystems).
        fs.writeFileSync(c1, 'A LONG\nExtra LONG');
        const future = new Date(Date.now() + 5000);
        fs.utimesSync(c1, future, future);
        assert.strictEqual(await includeIndexFresh(env, 'sig'), false);
    });

    test('stale when contributing is empty (signature alone is not enough to reuse)', async () => {
        const env = { version: 1, signature: 'sig', contributing: {}, payload: {} };
        assert.strictEqual(await includeIndexFresh(env, 'sig'), false,
            'an entry anchored to no real file must never be reused, even on a signature match');
    });

    test('stale when a contributing file was deleted', async () => {
        const c1 = writeContributor('a.inc', 'A LONG');
        const env = { version: 1, signature: 'sig', contributing: { [c1]: fs.statSync(c1).mtimeMs }, payload: {} };
        fs.rmSync(c1);
        assert.strictEqual(await includeIndexFresh(env, 'sig'), false);
    });
});

suite('warmCrossFileIndexes disk persistence end-to-end (#295)', () => {
    let dir: string;
    let fixture: ReturnType<typeof buildMultiFileFixture>;
    let service: SymbolFinderService;

    const filesMap: { [rel: string]: string } = {
        'main.clw': [
            '  PROGRAM',
            "  INCLUDE('globals.inc')",
            '  MAP',
            '  END',
            '  CODE',
            '  RETURN',
        ].join('\n'),
        'globals.inc': [
            'GlobalFromInclude LONG',
        ].join('\n'),
        'MemberA.clw': [
            "  MEMBER('main.clw')",
            'ProcA PROCEDURE',
            '  CODE',
            '  RETURN',
        ].join('\n'),
    };

    const clearDiskBuckets = () => {
        for (const b of ['chainindex', 'siblingindex']) {
            try { fs.rmSync(path.join(os.tmpdir(), `clarion-extension-${b}`), { recursive: true, force: true }); }
            catch { /* best-effort */ }
        }
    };

    setup(() => {
        setServerInitialized(true);
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'warm295_'));
        for (const [rel, content] of Object.entries(filesMap)) {
            fs.writeFileSync(path.join(dir, rel), content);
        }
        fixture = buildMultiFileFixture({
            files: filesMap,
            projectRoot: dir,
            frg: { programFile: 'main.clw', memberFiles: ['MemberA.clw'] }
        });
        const tc = TokenCache.getInstance();
        service = new SymbolFinderService(tc, new ScopeAnalyzer(tc, SolutionManager.getInstance()));
        clearDiskBuckets();
        evictIncludeChainIndexes();
        bumpCrossFileEpoch();
        ReferenceCountIndex.getInstance().reset();
    });

    teardown(() => {
        ReferenceCountIndex.getInstance().reset();
        evictIncludeChainIndexes();
        clearDiskBuckets();
        teardownMultiFileFixture();
        try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best-effort */ }
    });

    test('a warm start after an in-memory eviction reuses the persisted disk index (no rebuild)', async () => {
        const host = fixture.documents['MemberA.clw'];

        await service.warmCrossFileIndexes(host);
        const afterBuild = getChainIndexBuildCount();
        assert.ok(afterBuild > 0, 'the first warm cold-builds and persists the chain index');

        // Simulate a fresh process: drop the in-memory caches; the disk cache survives.
        evictIncludeChainIndexes();

        // Positive signal (immune to the process-wide build counter being nudged by
        // unrelated background builds): the second warm serves at least one index
        // from disk instead of re-tokenizing.
        const reuseBefore = getIncludeIndexDiskReuseCount();
        await service.warmCrossFileIndexes(host);
        assert.ok(getIncludeIndexDiskReuseCount() > reuseBefore,
            'the second warm serves the persisted index from disk — no re-tokenize, no rebuild');

        // The disk-served index still resolves the include global correctly — and
        // reuse only succeeds under the empty-contributing guard when the build
        // actually recorded the contributing mtimes, so this also proves the wiring.
        const tokens = TokenCache.getInstance().getTokens(host);
        const result = await service.findGlobalVariable('GlobalFromInclude', tokens, host);
        assert.ok(result, 'the include global still resolves from the disk-served chain index');
    });
    // NOTE: drift-rejection (changed/deleted/empty contributing, signature mismatch)
    // is pinned directly and without confounds by the IncludeIndexDiskCache helper
    // suite above; an integration-level drift test would also trip the *sibling*
    // index's legitimate reuse (its member is unchanged), muddying the signal.
});
