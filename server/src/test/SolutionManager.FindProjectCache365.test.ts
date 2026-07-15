/**
 * #365 — SolutionManager.findProjectForFile caches positive lookups.
 *
 * findProjectForFile scans every project's source files calling getAbsolutePath()
 * (an fs.existsSync per file) until it matches. The ClassConstantsCodeActionProvider
 * prefix calls it TWICE per code-action request (getProjectPathForFile +
 * getProjectCwprojForFile) — VS Code fires those on every cursor move — so on a
 * 3016-file solution one request is thousands of disk stats (the ~120-290ms
 * classConstants storm measured on the VM). A file's owning project is stable for the
 * loaded solution, so positive lookups are now memoized by normalized path.
 *
 * Pins:
 *   1. Repeated lookups for the same file scan the project files once (RED: every call
 *      re-scanned via getAbsolutePath).
 *   2. Distinct files resolve and cache independently.
 *   3. Clearing the cache (the on-reload invalidation hook) forces a re-scan.
 */

import * as assert from 'assert';
import * as path from 'path';
import { SolutionManager } from '../solution/solutionManager';

interface Spy { n: number; }

function makeSm(spy: Spy): SolutionManager {
    const mkFile = (root: string, rel: string) => ({
        name: path.basename(rel),
        relativePath: rel,
        getAbsolutePath: () => { spy.n++; return path.join(root, rel); }
    });
    // Private constructor (singleton) — build a minimal instance to drive the real method.
    const sm = Object.create(SolutionManager.prototype) as SolutionManager;
    (sm as unknown as { solution: unknown }).solution = {
        projects: [
            { name: 'P1', path: 'C:\\proj\\p1', sourceFiles: [mkFile('C:\\proj\\p1', 'a.clw'), mkFile('C:\\proj\\p1', 'b.clw')] },
            { name: 'P2', path: 'C:\\proj\\p2', sourceFiles: [mkFile('C:\\proj\\p2', 'c.clw')] },
        ]
    };
    (sm as unknown as { projectForFileCache: Map<string, unknown> }).projectForFileCache = new Map();
    return sm;
}

suite('SolutionManager #365 — findProjectForFile caches positive lookups', () => {

    test('repeated lookups for the same file scan the project files once', () => {
        const spy: Spy = { n: 0 };
        const sm = makeSm(spy);
        const target = 'C:\\proj\\p2\\c.clw';

        const first = sm.findProjectForFile(target);
        assert.strictEqual(first?.name, 'P2', 'resolves to the owning project');
        const afterFirst = spy.n;
        assert.ok(afterFirst >= 1, 'first lookup scans (calls getAbsolutePath)');

        for (let i = 0; i < 5; i++) {
            assert.strictEqual(sm.findProjectForFile(target)?.name, 'P2');
        }
        assert.strictEqual(spy.n, afterFirst,
            `repeated lookups for the same file must hit the cache — getAbsolutePath ran ${spy.n}x, expected ${afterFirst}`);
    });

    test('distinct files resolve and cache independently', () => {
        const spy: Spy = { n: 0 };
        const sm = makeSm(spy);

        assert.strictEqual(sm.findProjectForFile('C:\\proj\\p1\\a.clw')?.name, 'P1');
        assert.strictEqual(sm.findProjectForFile('C:\\proj\\p2\\c.clw')?.name, 'P2');
        const afterBoth = spy.n;

        sm.findProjectForFile('C:\\proj\\p1\\a.clw');
        sm.findProjectForFile('C:\\proj\\p2\\c.clw');
        assert.strictEqual(spy.n, afterBoth, 'both files answer from the cache on repeat');
    });

    test('clearing the cache forces a re-scan (the on-reload invalidation hook)', () => {
        const spy: Spy = { n: 0 };
        const sm = makeSm(spy);
        const target = 'C:\\proj\\p1\\b.clw';

        sm.findProjectForFile(target);
        const afterFirst = spy.n;
        sm.findProjectForFile(target);
        assert.strictEqual(spy.n, afterFirst, 'cached on repeat');

        (sm as unknown as { projectForFileCache: Map<string, unknown> }).projectForFileCache.clear();
        sm.findProjectForFile(target);
        assert.ok(spy.n > afterFirst, 'after a solution reload clears the cache, the next lookup re-scans');
    });
});
