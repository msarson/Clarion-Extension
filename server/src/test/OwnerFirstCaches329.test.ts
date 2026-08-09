import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { SolutionManager } from '../solution/solutionManager';
import { IncludeVerifier } from '../utils/IncludeVerifier';

/**
 * Issue #329 — the two sites deferred from the #328 owner-first sweep because
 * their caches were keyed by FILENAME ALONE:
 *
 *   - `SolutionManager.findFileWithExtension` (`fileCache` + negative + in-flight)
 *   - `IncludeVerifier.resolveIncludePath` (`pathCache`, 60s TTL)
 *
 * In a multi-project solution where several projects resolve the same filename
 * to different physical copies (Edin's per-app `w_[name]_rc.inc` layout, #82),
 * the first caller's project poisoned the answer for every other project's
 * callers, and the solution-order walk picked the first project's copy even
 * when acting on behalf of another project's file.
 *
 * Fix under test: owner-project-first resolution with caches partitioned by
 * owner (findFileWithExtension) / from-file (resolveIncludePath).
 */

let tmpRoot = '';
let savedSm: unknown;

interface MockProject {
    name: string;
    path: string;
    sourceFiles: Array<{ name: string; relativePath: string; getAbsolutePath: () => string }>;
    getRedirectionParser: () => { findFile: (fn: string) => { path: string } | null };
    getSearchPaths: () => string[];
}

function mkProject(name: string, dir: string, fromFile: string): MockProject {
    return {
        name,
        path: dir,
        sourceFiles: [{
            name: fromFile,
            relativePath: fromFile,
            getAbsolutePath: () => path.join(dir, fromFile),
        }],
        getRedirectionParser: () => ({
            findFile: (fn: string) =>
                fn.toLowerCase() === 'w_rc.inc' ? { path: path.join(dir, 'w_rc.inc') } : null,
        }),
        getSearchPaths: () => [],
    };
}

suite('Issue #329 — owner-first resolution with re-keyed caches', () => {

    let projA: MockProject;
    let projB: MockProject;
    let fromA: string;
    let fromB: string;

    setup(() => {
        tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), '329-ownerfirst-'));
        const dirA = path.join(tmpRoot, 'projA');
        const dirB = path.join(tmpRoot, 'projB');
        fs.mkdirSync(dirA);
        fs.mkdirSync(dirB);
        fs.writeFileSync(path.join(dirA, 'w_rc.inc'), 'AVarFromA           LONG\r\n');
        fs.writeFileSync(path.join(dirB, 'w_rc.inc'), 'BVarFromB           LONG\r\n');
        fs.writeFileSync(path.join(dirA, 'main_a.clw'), '  PROGRAM\r\n  CODE\r\n');
        fs.writeFileSync(path.join(dirB, 'main_b.clw'), '  PROGRAM\r\n  CODE\r\n');

        projA = mkProject('projA', dirA, 'main_a.clw');
        projB = mkProject('projB', dirB, 'main_b.clw');
        fromA = path.join(dirA, 'main_a.clw');
        fromB = path.join(dirB, 'main_b.clw');

        // Real prototype methods over a fixture instance — findFileWithExtension,
        // findProjectForFile and the three caches are the code under test.
        const sm = Object.create(SolutionManager.prototype);
        sm.solution = { projects: [projA, projB] };
        sm.fileCache = new Map();
        sm.negativeFindCache = new Map();
        sm.inflightFinds = new Map();
        savedSm = (SolutionManager as unknown as { instance: unknown }).instance;
        (SolutionManager as unknown as { instance: unknown }).instance = sm;

        (IncludeVerifier as unknown as { instance: unknown }).instance = undefined;
    });

    teardown(() => {
        (SolutionManager as unknown as { instance: unknown }).instance = savedSm;
        (IncludeVerifier as unknown as { instance: unknown }).instance = undefined;
        try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch { /* best effort */ }
    });

    // Signature-agnostic caller so this suite compiles against the PRE-fix
    // 1-arg signature too (stash-RED discipline): pre-fix JS ignores the extra
    // argument, which is exactly the bug — the from-file had no effect.
    function findFile(filename: string, fromFsPath?: string): Promise<{ path: string; source: string }> {
        const sm = SolutionManager.getInstance() as unknown as {
            findFileWithExtension(f: string, from?: string): Promise<{ path: string; source: string }>;
        };
        return sm.findFileWithExtension(filename, fromFsPath);
    }

    test('findFileWithExtension: owner project wins over solution order, no cache poisoning (Edin shape)', async () => {
        // First caller: projA's file — primes the cache.
        const forA = await findFile('w_rc.inc', fromA);
        assert.strictEqual(forA.path.toLowerCase(), path.join(projA.path, 'w_rc.inc').toLowerCase(),
            `projA's caller must get projA's copy; got ${forA.path}`);

        // Second caller: projB's file — pre-fix the filename-keyed cache (or the
        // solution-order walk) served projA's copy here.
        const forB = await findFile('w_rc.inc', fromB);
        assert.strictEqual(forB.path.toLowerCase(), path.join(projB.path, 'w_rc.inc').toLowerCase(),
            `projB's caller must get projB's copy (owner-first, un-poisoned); got ${forB.path}`);
    });

    test('findFileWithExtension: no from-context preserves solution-order behavior', async () => {
        const result = await findFile('w_rc.inc');
        assert.strictEqual(result.path.toLowerCase(), path.join(projA.path, 'w_rc.inc').toLowerCase(),
            `without a from-file the first project in solution order answers; got ${result.path}`);
    });

    test('IncludeVerifier.resolveIncludePath: from-file keyed cache, owner-first (Edin shape)', async () => {
        const verifier = IncludeVerifier.getInstance() as unknown as {
            resolveIncludePath(fileName: string, baseDir: string, fromFsPath: string | null): Promise<string | null>;
        };

        const forA = await verifier.resolveIncludePath('w_rc.inc', path.dirname(fromA), fromA);
        assert.strictEqual(forA?.toLowerCase(), path.join(projA.path, 'w_rc.inc').toLowerCase(),
            `projA's chain walk must resolve projA's copy; got ${forA}`);

        const forB = await verifier.resolveIncludePath('w_rc.inc', path.dirname(fromB), fromB);
        assert.strictEqual(forB?.toLowerCase(), path.join(projB.path, 'w_rc.inc').toLowerCase(),
            `projB's chain walk must resolve projB's copy (pre-fix: projA's via filename-keyed pathCache); got ${forB}`);
    });

    test('sentinel: unknown filename still resolves to nothing for both callers', async () => {
        const missA = await findFile('no_such_file.inc', fromA);
        const missB = await findFile('no_such_file.inc', fromB);
        assert.strictEqual(missA.path, '');
        assert.strictEqual(missB.path, '');
    });
});
