import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { IncludeVerifier } from '../utils/IncludeVerifier';
import { SolutionManager } from '../solution/solutionManager';

/**
 * #366 — the missingIncludes validator calls IncludeVerifier.isClassIncluded once
 * per include-check (6x per pass on a generated module), and each call re-read +
 * re-tokenized the (large) MEMBER('...') parent from disk (~660ms x 6 = ~4s, all
 * producing zero diagnostics). The resolved parent depends only on the host's
 * MEMBER line, so getMemberParentDocument is now memoized per (uri, version).
 * These tests pin that: repeated checks on one document read the parent once, and
 * a version bump recomputes.
 */
suite('IncludeVerifier — MEMBER parent doc memoization (#366)', () => {
    let tmpRoot = '';
    let savedSm: SolutionManager | null = null;

    const fileUri = (p: string) => `file:///${p.replace(/\\/g, '/')}`;

    setup(() => {
        tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), '366-member-parent-'));
        // No-solution mode forces local-directory MEMBER resolution.
        savedSm = (SolutionManager as unknown as { instance: SolutionManager | null }).instance;
        (SolutionManager as unknown as { instance: SolutionManager | null }).instance = null;
        IncludeVerifier.getInstance().clearCache();
        clearReachableSetBucket();

        // Parent PROGRAM that INCLUDEs the class — a non-empty MEMBER parent.
        fs.writeFileSync(path.join(tmpRoot, 'parent.clw'), [
            '  PROGRAM',
            "  INCLUDE('SharedThings.inc'),ONCE",
            '  MAP',
            '  END',
            '  CODE',
            '  RETURN',
            '',
        ].join('\r\n'));
        fs.writeFileSync(path.join(tmpRoot, 'SharedThings.inc'), [
            'SomeClass   CLASS,TYPE',
            'DoIt          PROCEDURE(),LONG',
            '            END',
            '',
        ].join('\r\n'));
        // A nested chain + a PROGRAM host so a single isClassIncluded drives exactly
        // ONE reachable-set BFS (hostprog → level1 → SharedThings, found transitively;
        // a PROGRAM has no MEMBER parent, so no second host is walked).
        fs.writeFileSync(path.join(tmpRoot, 'level1.inc'), [
            "  INCLUDE('SharedThings.inc'),ONCE",
            '',
        ].join('\r\n'));
        fs.writeFileSync(path.join(tmpRoot, 'hostprog.clw'), [
            '  PROGRAM',
            "  INCLUDE('level1.inc'),ONCE",
            '  MAP',
            '  END',
            '  CODE',
            '  RETURN',
            '',
        ].join('\r\n'));
        // Member module — no own INCLUDE of the class; resolves through its parent.
        fs.writeFileSync(path.join(tmpRoot, 'child.clw'), [
            "  MEMBER('parent.clw')",
            '  MAP',
            '  END',
            'MyProc PROCEDURE',
            '  CODE',
            '  RETURN',
            '',
        ].join('\r\n'));
    });

    teardown(() => {
        (SolutionManager as unknown as { instance: SolutionManager | null }).instance = savedSm;
        savedSm = null;
        IncludeVerifier.getInstance().clearCache();
        clearReachableSetBucket();
        try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch { /* best-effort */ }
    });

    const clearReachableSetBucket = () => {
        try { fs.rmSync(path.join(os.tmpdir(), 'clarion-extension-reachableset'), { recursive: true, force: true }); }
        catch { /* best-effort */ }
    };

    const childDoc = (version = 1) => {
        const p = path.join(tmpRoot, 'child.clw');
        return TextDocument.create(fileUri(p), 'clarion', version, fs.readFileSync(p, 'utf-8'));
    };

    const hostProgDoc = () => {
        const p = path.join(tmpRoot, 'hostprog.clw');
        return TextDocument.create(fileUri(p), 'clarion', 1, fs.readFileSync(p, 'utf-8'));
    };

    // Count disk reads of the parent file specifically, around a body of work.
    const withParentReadCounter = async (fn: () => Promise<void>): Promise<number> => {
        const parentPath = path.join(tmpRoot, 'parent.clw').toLowerCase();
        const realReadFile = fs.promises.readFile;
        let reads = 0;
        (fs.promises as unknown as { readFile: unknown }).readFile =
            ((p: unknown, ...rest: unknown[]) => {
                if (typeof p === 'string' && p.toLowerCase() === parentPath) reads++;
                return (realReadFile as (...a: unknown[]) => unknown)(p, ...rest);
            });
        try {
            await fn();
        } finally {
            (fs.promises as unknown as { readFile: unknown }).readFile = realReadFile;
        }
        return reads;
    };

    test('extra include-checks on the same document add zero MEMBER-parent reads (memoized)', async () => {
        const iv = IncludeVerifier.getInstance();

        // Sanity precondition: the check must actually route through the MEMBER parent.
        assert.strictEqual(await iv.isClassIncluded('SharedThings.inc', childDoc()), true,
            'SharedThings.inc is reachable only via the MEMBER parent — must resolve as included');

        // Baseline: one cold check.
        iv.clearCache();
        const oneCheck = await withParentReadCounter(async () => {
            await iv.isClassIncluded('SharedThings.inc', childDoc());
        });

        // Same pass: six checks, cold start (one clearCache, then the loop — the
        // exact shape validateMissingIncludes uses).
        iv.clearCache();
        const sixChecks = await withParentReadCounter(async () => {
            const doc = childDoc();
            for (let i = 0; i < 6; i++) await iv.isClassIncluded('SharedThings.inc', doc);
        });

        assert.ok(oneCheck >= 1, `sanity: one cold check reads the parent at least once (got ${oneCheck})`);
        assert.strictEqual(sixChecks, oneCheck,
            `six checks must read the MEMBER parent the same number of times as one (memoized); one=${oneCheck} six=${sixChecks}`);
    });

    test('two concurrent passes share ONE reachable-set build (no stampede)', async () => {
        const iv = IncludeVerifier.getInstance();

        // Baseline: a single pass builds the host's reachable set exactly once
        // (hostprog → level1 → SharedThings, found transitively; no MEMBER parent).
        // Clear the DISK bucket too, else the persisted set (#366) would be served
        // instead of built, defeating the build-count comparison.
        iv.clearCache();
        clearReachableSetBucket();
        const singleBefore = iv.getReachableSetBuildCount();
        assert.strictEqual(await iv.isClassIncluded('SharedThings.inc', hostProgDoc()), true,
            'sanity: the class is reachable via the transitive chain');
        const singleBuilds = iv.getReachableSetBuildCount() - singleBefore;

        // Two overlapping passes on the SAME host (the #359 shape), fired concurrently
        // so the second arrives mid-build. They must await one shared build — the total
        // must match the single-pass build count, not double it.
        iv.clearCache();
        clearReachableSetBucket();
        const concBefore = iv.getReachableSetBuildCount();
        await Promise.all([
            iv.isClassIncluded('SharedThings.inc', hostProgDoc()),
            iv.isClassIncluded('SharedThings.inc', hostProgDoc()),
        ]);
        const concBuilds = iv.getReachableSetBuildCount() - concBefore;

        assert.ok(singleBuilds >= 1, `sanity: one pass builds the set (got ${singleBuilds})`);
        assert.strictEqual(concBuilds, singleBuilds,
            `two concurrent passes must share the build (single=${singleBuilds} concurrent=${concBuilds})`);
    });

    test('a warm start reuses the persisted reachable-include set from disk (#366)', async () => {
        const iv = IncludeVerifier.getInstance();
        iv.clearCache();
        clearReachableSetBucket();

        // First pass: cold BFS build + persist to disk (hostprog → level1 → SharedThings).
        const buildBefore = iv.getReachableSetBuildCount();
        assert.strictEqual(await iv.isClassIncluded('SharedThings.inc', hostProgDoc()), true,
            'sanity: SharedThings.inc resolves via the transitive chain');
        assert.ok(iv.getReachableSetBuildCount() > buildBefore, 'first pass builds + persists the reachable set');

        // Simulate a fresh process: drop the in-memory cache; the disk cache survives.
        iv.clearCache();
        const buildAfterEvict = iv.getReachableSetBuildCount();
        const reuseBefore = iv.getReachableSetDiskReuseCount();
        assert.strictEqual(await iv.isClassIncluded('SharedThings.inc', hostProgDoc()), true,
            'still resolves from the disk-served reachable set');
        assert.strictEqual(iv.getReachableSetBuildCount(), buildAfterEvict,
            'the second pass reuses the persisted set — no re-walk');
        assert.ok(iv.getReachableSetDiskReuseCount() > reuseBefore,
            'the reachable set was served from the disk cache');
    });

    test('a changed contributing include invalidates the persisted set (no stale reuse) (#366)', async () => {
        const iv = IncludeVerifier.getInstance();
        iv.clearCache();
        clearReachableSetBucket();

        await iv.isClassIncluded('SharedThings.inc', hostProgDoc()); // build + persist

        iv.clearCache();
        // Change a CONTRIBUTING include's content + advance its mtime.
        const inc = path.join(tmpRoot, 'SharedThings.inc');
        fs.writeFileSync(inc, 'SomeClass   CLASS,TYPE\nDoIt PROCEDURE(),LONG\n            END\nExtra LONG\n');
        const future = new Date(Date.now() + 5000);
        fs.utimesSync(inc, future, future);

        const reuseBefore = iv.getReachableSetDiskReuseCount();
        const buildBefore = iv.getReachableSetBuildCount();
        await iv.isClassIncluded('SharedThings.inc', hostProgDoc());
        assert.strictEqual(iv.getReachableSetDiskReuseCount(), reuseBefore,
            'a drifted contributing mtime must NOT be served from disk — the mtime check rejects it');
        assert.ok(iv.getReachableSetBuildCount() > buildBefore, 'it rebuilds cold instead of serving stale');
    });

    test('a document version bump recomputes the parent (memo keyed by uri+version)', async () => {
        const iv = IncludeVerifier.getInstance();
        iv.clearCache();

        const reads = await withParentReadCounter(async () => {
            const v1 = childDoc(1);
            await iv.isClassIncluded('SharedThings.inc', v1);
            await iv.isClassIncluded('SharedThings.inc', v1); // same version → cache hit
        });
        const afterSameVersion = reads;

        const readsAfterBump = afterSameVersion + await withParentReadCounter(async () => {
            const v2 = childDoc(2); // new version, same uri
            await iv.isClassIncluded('SharedThings.inc', v2);
        });

        assert.ok(readsAfterBump > afterSameVersion,
            `a version bump must recompute the parent (reads ${afterSameVersion} -> ${readsAfterBump})`);
    });
});
