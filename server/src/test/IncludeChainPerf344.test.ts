import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { TokenCache } from '../TokenCache';
import { ScopeAnalyzer } from '../utils/ScopeAnalyzer';
import {
    SymbolFinderService,
    getChainIndexBuildCount,
    evictIncludeChainIndexes
} from '../services/SymbolFinderService';
import { IncludeVerifier } from '../utils/IncludeVerifier';
import { SolutionManager } from '../solution/solutionManager';
import {
    buildMultiFileFixture,
    teardownMultiFileFixture
} from './helpers/MultiFileFARFixture';

/**
 * Issue #344 — perf regression on the real 43-project solution:
 *
 * 1. #334's include-chain walk ran PER UNRESOLVED NAME (74s undeclaredVar,
 *    20s per RVD receiver type). The chain is now indexed ONCE per host and
 *    lookups hit the map — pinned via the build counter: N lookups on one
 *    host = ONE build; eviction (#340 watcher path) forces a rebuild.
 *
 * 2. #329 keyed IncludeVerifier's pathCache by (filename, from-file) — every
 *    document re-resolved the whole include universe (12.9s per class check).
 *    The partition is now the OWNER PROJECT: two files of the same project
 *    share entries; different projects stay isolated (the #329 pins in
 *    OwnerFirstCaches329.test.ts remain the correctness guard).
 */

suite('Issue #344 — include-chain perf contracts', () => {

    teardown(() => {
        teardownMultiFileFixture();
        evictIncludeChainIndexes();
        TokenCache.getInstance().clearAllTokens();
    });

    test('chain index builds once per host across multiple name lookups; eviction rebuilds', async () => {
        const fixture = buildMultiFileFixture({
            files: {
                'SimpleNewSln.clw': [
                    '  PROGRAM',
                    '  MAP',
                    '  END',
                    "  INCLUDE('Globals.inc'),ONCE",
                    '  CODE',
                    '  RETURN',
                ].join('\n'),
                'Globals.inc': [
                    'AlphaVar   LONG',
                    'BetaVar    LONG',
                    "  INCLUDE('Deep.inc'),ONCE",
                ].join('\n'),
                'Deep.inc': [
                    'DeepVar    LONG',
                ].join('\n'),
                'Member.clw': [
                    "  MEMBER('SimpleNewSln.clw')",
                    '  MAP',
                    '  END',
                    'P PROCEDURE',
                    '  CODE',
                    '  AlphaVar = 1',
                    '  RETURN',
                ].join('\n'),
            },
            frg: { programFile: 'SimpleNewSln.clw', memberFiles: ['Member.clw'] }
        });

        const tokenCache = TokenCache.getInstance();
        const sf = new SymbolFinderService(tokenCache, new ScopeAnalyzer(tokenCache, undefined as never));
        const memberDoc = fixture.documents['Member.clw'];
        const pos = { line: 5, character: 2 };

        evictIncludeChainIndexes();
        const before = getChainIndexBuildCount();

        const a = await sf.findSymbol('AlphaVar', memberDoc, pos);
        const b = await sf.findSymbol('BetaVar', memberDoc, pos);
        const d = await sf.findSymbol('DeepVar', memberDoc, pos);
        const miss = await sf.findSymbol('NotAnywhere', memberDoc, pos);

        assert.ok(a && b && d, 'chain globals must all resolve through the index');
        assert.strictEqual(miss, null);
        const builds = getChainIndexBuildCount() - before;
        assert.ok(builds <= 2,
            `four lookups (incl. an exhaustive miss) must build at most one index per host (member+parent); got ${builds} builds`);

        evictIncludeChainIndexes();
        await sf.findSymbol('AlphaVar', memberDoc, pos);
        assert.ok(getChainIndexBuildCount() > before + builds - 1,
            'eviction (the #340 watcher path) must force a rebuild on the next lookup');
    });

    test('pathCache partitions by OWNER PROJECT: same-project files share one entry per name', async () => {
        const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), '344-owner-'));
        try {
            const projDir = path.join(tmpRoot, 'projA');
            fs.mkdirSync(projDir);
            fs.writeFileSync(path.join(projDir, 'shared.inc'), 'SharedVar  LONG\r\n');
            const fileA = path.join(projDir, 'a.clw');
            const fileB = path.join(projDir, 'b.clw');
            fs.writeFileSync(fileA, '  PROGRAM\r\n  CODE\r\n');
            fs.writeFileSync(fileB, '  PROGRAM\r\n  CODE\r\n');

            const project = {
                name: 'projA',
                path: projDir,
                sourceFiles: [
                    { name: 'a.clw', relativePath: 'a.clw', getAbsolutePath: () => fileA },
                    { name: 'b.clw', relativePath: 'b.clw', getAbsolutePath: () => fileB },
                ],
                getRedirectionParser: () => ({ findFile: () => null }),
            };
            const savedSm = (SolutionManager as unknown as { instance: unknown }).instance;
            (SolutionManager as unknown as { instance: unknown }).instance = {
                solution: { projects: [project] },
                findProjectForFile: (fp: string) =>
                    path.normalize(fp).toLowerCase().startsWith(projDir.toLowerCase()) ? project : undefined,
            };

            try {
                (IncludeVerifier as unknown as { instance: unknown }).instance = undefined;
                const verifier = IncludeVerifier.getInstance() as unknown as {
                    resolveIncludePath(f: string, d: string, from: string | null): Promise<string | null>;
                    pathCache: Map<string, unknown>;
                };

                const r1 = await verifier.resolveIncludePath('shared.inc', projDir, fileA);
                const r2 = await verifier.resolveIncludePath('shared.inc', projDir, fileB);
                assert.ok(r1 && r2 && r1.toLowerCase() === r2.toLowerCase(), 'both files resolve the same copy');

                const keys = [...verifier.pathCache.keys()].filter(k => k.startsWith('shared.inc|'));
                assert.strictEqual(keys.length, 1,
                    `same-project callers must share ONE cache partition (the #329 per-file keying rebuilt the universe per document); got: ${keys.join(' ; ')}`);
            } finally {
                (SolutionManager as unknown as { instance: unknown }).instance = savedSm;
                (IncludeVerifier as unknown as { instance: unknown }).instance = undefined;
            }
        } finally {
            try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch { /* best effort */ }
        }
    });
});
