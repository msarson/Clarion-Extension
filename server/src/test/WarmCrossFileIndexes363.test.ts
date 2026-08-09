import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
    SymbolFinderService,
    getChainIndexBuildCount,
    evictIncludeChainIndexes
} from '../services/SymbolFinderService';
import { TokenCache } from '../TokenCache';
import { ScopeAnalyzer } from '../utils/ScopeAnalyzer';
import { SolutionManager } from '../solution/solutionManager';
import { ReferenceCountIndex } from '../services/ReferenceCountIndex';
import { setServerInitialized } from '../serverState';
import { bumpCrossFileEpoch } from '../utils/crossFileEpoch';
import {
    buildMultiFileFixture,
    teardownMultiFileFixture
} from './helpers/MultiFileFARFixture';

/**
 * #363 — the startup lane pre-warms the cross-file indexes (the #344 include-chain
 * global index and the #345 sibling family label index) so the user's FIRST
 * hover / F12 / FAR is warm instead of paying the cold build. These tests prove
 * warmCrossFileIndexes actually BUILDS those shared (module-level) caches, so a
 * subsequent real lookup reuses them rather than rebuilding.
 */
suite('SymbolFinderService.warmCrossFileIndexes (#363)', () => {
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
            'SharedValue LONG',
            'ProcA PROCEDURE',
            '  CODE',
            '  RETURN',
        ].join('\n'),
        'MemberB.clw': [
            "  MEMBER('main.clw')",
            'ProcB PROCEDURE',
            '  CODE',
            '  RETURN',
        ].join('\n'),
    };

    setup(() => {
        setServerInitialized(true);
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'warm363_'));
        for (const [rel, content] of Object.entries(filesMap)) {
            fs.writeFileSync(path.join(dir, rel), content);
        }
        fixture = buildMultiFileFixture({
            files: filesMap,
            projectRoot: dir,
            frg: { programFile: 'main.clw', memberFiles: ['MemberA.clw', 'MemberB.clw'] }
        });
        const tc = TokenCache.getInstance();
        service = new SymbolFinderService(tc, new ScopeAnalyzer(tc, SolutionManager.getInstance()));
        evictIncludeChainIndexes();
        bumpCrossFileEpoch(); // clear the sibling family index cache
        ReferenceCountIndex.getInstance().reset();
    });

    teardown(() => {
        ReferenceCountIndex.getInstance().reset();
        evictIncludeChainIndexes();
        teardownMultiFileFixture();
        try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best-effort */ }
    });

    test('warm builds the include-chain index; a subsequent lookup does NOT rebuild it', async () => {
        const host = fixture.documents['MemberA.clw'];

        const beforeWarm = getChainIndexBuildCount();
        await service.warmCrossFileIndexes(host);
        const afterWarm = getChainIndexBuildCount();
        assert.ok(afterWarm > beforeWarm,
            `warming a host builds at least one include-chain index (host + parent); built ${afterWarm - beforeWarm}`);

        // A real global lookup that resolves through the parent PROGRAM's include
        // chain now reuses the warmed caches instead of rebuilding either one.
        const tokens = TokenCache.getInstance().getTokens(host);
        const result = await service.findGlobalVariable('GlobalFromInclude', tokens, host);
        assert.ok(result, 'the include global resolves (via the warmed parent chain)');
        assert.strictEqual(getChainIndexBuildCount(), afterWarm,
            'the first real lookup after warming must NOT rebuild any include-chain index');
    });

    test('warm is idempotent and best-effort (no throw, no redundant rebuild)', async () => {
        const host = fixture.documents['MemberA.clw'];
        await service.warmCrossFileIndexes(host);
        const afterFirst = getChainIndexBuildCount();
        // Second warm of the same unchanged host reuses the cache (content-keyed).
        await service.warmCrossFileIndexes(host);
        assert.strictEqual(getChainIndexBuildCount(), afterFirst,
            're-warming an unchanged host does not rebuild');
    });

    test('warm resolves for a synthetic document with no host chain (best-effort, no throw)', async () => {
        const orphan = fixture.documents['MemberB.clw'];
        // Must not throw even though MemberB has no INCLUDEs and a sparse family.
        await service.warmCrossFileIndexes(orphan);
        assert.ok(true, 'warming completed without throwing');
    });
});
