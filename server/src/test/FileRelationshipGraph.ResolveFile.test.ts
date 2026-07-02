import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { FileRelationshipGraph } from '../FileRelationshipGraph';
import { ClarionProjectServer } from '../solution/clarionProjectServer';
import { SolutionManager } from '../solution/solutionManager';
import { serverSettings } from '../serverSettings';

/**
 * Regression-guard suite for task `5cbb2f27` — `FileRelationshipGraph.resolveFile`
 * canonical resolution chain (audit follow-up C from 8c874d32).
 *
 * Locked test contract per the continuation_notes on task 5cbb2f27:
 *
 *   1. red+root             → Tier 1 (synthetic catch-all) hits project root
 *   2. red+sub              → Tier 1 hits project root
 *   3. red+sub target only in sub → Tier 2 (sourceFilePath) hits sub.
 *      THE pin that proves Bob's `findFile(filename, fromFile)` change
 *      actually engages parser Tier 2.
 *   4. no-red+root          → Tier 2 probes projectPath (= dirname(fromFile))
 *   5. no-red+sub safety net → line 484 safety net hits projectRoot
 *   6. total miss           → null
 *
 * All six are GREEN both pre- and post-fix (six regression guards, zero
 * documented behaviour changes per Eve's pushback on the initial draft).
 *
 * Mechanism shifts post-fix matter for tests 3 and 4: pre-fix line 490
 * (post-loop sibling probe) covers them; post-fix the deleted line 490 is
 * replaced by parser Tier 2 sourceFilePath. A botched fix that drops
 * line 490 without engaging Tier 2 (e.g. forgets to pass `fromFile` into
 * `findFile`) would flip tests 3 and 4 RED — that's the load-bearing
 * failure mode this suite catches.
 *
 * Test 5 covers the no-red safety-net path (kept inside the project loop
 * per Alice/Eve negotiation) — without line 484, no-red projects with
 * subfolder source files silently lose `<projectPath>/<filename>` edges.
 *
 * Per-test unique tmpdir → static `redFileCache` keys never collide.
 * SolutionManager singleton is mocked via `(SolutionManager as any).instance`
 * — restored in teardown.
 */

interface Fixture {
    tmpRoot: string;
    projDir: string;
    subDir: string;
}

interface FixtureSpec {
    /** When provided, drops a Clarion110.red at projDir with these contents. */
    redContents?: string;
    /** Files to seed: relative paths under projDir. */
    filesAtProj?: string[];
}

function buildFixture(spec: FixtureSpec): Fixture {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'frg-resolve-5cbb2f27-'));
    const projDir = path.join(tmpRoot, 'Proj');
    const subDir = path.join(projDir, 'sub');
    fs.mkdirSync(projDir, { recursive: true });
    fs.mkdirSync(subDir, { recursive: true });

    if (spec.redContents !== undefined) {
        fs.writeFileSync(path.join(projDir, 'Clarion110.red'), spec.redContents);
    }
    for (const rel of spec.filesAtProj ?? []) {
        const full = path.join(projDir, rel);
        fs.mkdirSync(path.dirname(full), { recursive: true });
        fs.writeFileSync(full, '! seeded\n');
    }

    return { tmpRoot, projDir, subDir };
}

function teardownFixture(fix: Fixture | null): void {
    if (!fix) { return; }
    try {
        fs.rmSync(fix.tmpRoot, { recursive: true, force: true });
    } catch { /* best-effort cleanup */ }
}

/**
 * Build a fake SolutionManager pointing at a single in-test project.
 * Mocks via the private static `instance` slot on SolutionManager.
 */
function installFakeSolutionManager(projDir: string): SolutionManager {
    const project = new ClarionProjectServer('TestProj', 'app', projDir, '{TEST-GUID}');
    const fakeSolution = { projects: [project] };
    const fake = { solution: fakeSolution } as unknown as SolutionManager;
    (SolutionManager as unknown as { instance: SolutionManager | null }).instance = fake;
    return fake;
}

suite('FileRelationshipGraph.resolveFile (5cbb2f27)', () => {

    let fixtures: Fixture[] = [];
    let savedSmInstance: SolutionManager | null = null;
    let savedRedirectionFile = '';
    let savedRedirectionPaths: string[] = [];
    let savedLibsrcPaths: string[] = [];

    setup(() => {
        fixtures = [];
        savedSmInstance = (SolutionManager as unknown as { instance: SolutionManager | null }).instance;
        savedRedirectionFile = serverSettings.redirectionFile;
        savedRedirectionPaths = serverSettings.redirectionPaths;
        savedLibsrcPaths = serverSettings.libsrcPaths;
        serverSettings.libsrcPaths = []; // prevent Tier 3 rescue
    });

    teardown(() => {
        (SolutionManager as unknown as { instance: SolutionManager | null }).instance = savedSmInstance;
        serverSettings.redirectionFile = savedRedirectionFile;
        serverSettings.redirectionPaths = savedRedirectionPaths;
        serverSettings.libsrcPaths = savedLibsrcPaths;
        for (const f of fixtures) { teardownFixture(f); }
        fixtures = [];
    });

    function setupRedCase(filesAtProj: string[]): { fix: Fixture } {
        // "red" mode: project-local Clarion110.red exists.
        // serverSettings.redirectionFile must match what the parser looks for.
        serverSettings.redirectionFile = 'Clarion110.red';
        const fix = buildFixture({
            redContents: '[Common]\n*.clw = .\n',
            filesAtProj
        });
        fixtures.push(fix);
        installFakeSolutionManager(fix.projDir);
        return { fix };
    }

    function setupNoRedCase(filesAtProj: string[]): { fix: Fixture } {
        // "no-red" mode: no .red anywhere AND redirectionFile is empty so the
        // parser's early-return at parseRedFile:84 fires immediately and
        // entries stays []. Tier 1 cannot engage.
        serverSettings.redirectionFile = '';
        const fix = buildFixture({ filesAtProj });
        fixtures.push(fix);
        installFakeSolutionManager(fix.projDir);
        return { fix };
    }

    /** Type-erased accessor for the private resolveFile method. */
    function callResolveFile(filename: string, fromFile: string): string | null {
        const graph = FileRelationshipGraph.getInstance();
        return (graph as unknown as {
            resolveFile: (f: string, from: string) => string | null
        }).resolveFile(filename, fromFile);
    }

    // --- (1) red+root → Tier 1 hits ---
    test('red+root — target at project root, source at project root → resolves via Tier 1', () => {
        const { fix } = setupRedCase(['Target.clw', 'Source.clw']);
        const result = callResolveFile('Target.clw', path.join(fix.projDir, 'Source.clw'));
        assert.strictEqual(
            result,
            path.join(fix.projDir, 'Target.clw'),
            'expected <projDir>/Target.clw'
        );
    });

    // --- (2) red+sub → Tier 1 hits project root ---
    test('red+sub — target at project root, source in sub → Tier 1 synthetic catch-all hits project root', () => {
        const { fix } = setupRedCase(['Target.clw', path.join('sub', 'Source.clw')]);
        const result = callResolveFile('Target.clw', path.join(fix.subDir, 'Source.clw'));
        assert.strictEqual(
            result,
            path.join(fix.projDir, 'Target.clw'),
            'expected <projDir>/Target.clw'
        );
    });

    // --- (3) DELETED under 3161ea89 ---
    // Test 3 ("red+sub, target only in sub → Tier 2 sourceFilePath hits sub")
    // was deleted as part of the strict compiler-truth resolution architecture.
    // Per Mark: "I actually think we should be strict here, compiler is truth.
    // I'm trying to make the extension work how the Clarion IDE would but
    // better (Clarion IDE doesn't have many providers at all)."
    // The sourceFilePath sibling probe is no longer part of the canonical
    // resolution chain — the Clarion compiler doesn't do it, so the IDE
    // shouldn't either. Under the new arch this scenario returns null.
    // Remaining sibling-related coverage lives in clientside memberResolution
    // (no-solution-loaded ad-hoc editing, where compiler-truth doesn't apply).

    // --- (4) no-red+root → Tier 2 hits projectPath ---
    test('no-red+root — no .red loaded, source at project root → Tier 2 probes projectPath (=dirname(fromFile))', () => {
        const { fix } = setupNoRedCase(['Target.clw', 'Source.clw']);
        const result = callResolveFile('Target.clw', path.join(fix.projDir, 'Source.clw'));
        assert.strictEqual(
            result,
            path.join(fix.projDir, 'Target.clw'),
            'expected <projDir>/Target.clw via Tier 2 (no .red loaded)'
        );
    });

    // --- (5) no-red+sub → parser Tier 2 project-root fallback ---
    test('no-red+sub — target at projectRoot, source in sub → parser Tier 2 project-root fallback hits projectRoot', () => {
        // Target NOT in sub — only at project root. Source in sub.
        //
        // History:
        //   Pre-3161ea89: FRG.resolveFile's per-project safety net (line 484,
        //     `path.join(project.path, filename)` after findFile miss) caught this.
        //     Original 5cbb2f27 contract preserved this safety net under Eve's
        //     pushback to avoid silent failure for no-red+sub cases.
        //   Post-3161ea89 (Phase A): parser added an explicit Tier 2 probe
        //     (`<projectPath>/<filename>`) inside findFile/findFileAsync; the
        //     no-red+sub case now resolves via parser Tier 2 directly.
        //   Post-2a2656b1 (Phase B step 2): FRG.resolveFile drops the now-
        //     redundant per-project safety net since parser Tier 2 covers it.
        //
        // The test name + comments anticipate the Phase B step-2 deletion of
        // the FRG safety-net block. Assertion is unchanged because both the
        // old FRG safety net and the new parser Tier 2 produce the same
        // resolved path.
        const { fix } = setupNoRedCase(['Target.clw', path.join('sub', 'Source.clw')]);
        const result = callResolveFile('Target.clw', path.join(fix.subDir, 'Source.clw'));
        assert.strictEqual(
            result,
            path.join(fix.projDir, 'Target.clw'),
            'expected <projDir>/Target.clw via parser Tier 2 project-root fallback ' +
            '(no Tier 1 entries; pathed-vs-bare branching wouldn\'t fire on bare "Target.clw")'
        );
    });

    // --- (6) total miss → null ---
    test('total miss — target not anywhere → returns null', () => {
        const { fix } = setupRedCase([path.join('sub', 'Source.clw')]);
        const result = callResolveFile('NotFound.clw', path.join(fix.subDir, 'Source.clw'));
        assert.strictEqual(
            result,
            null,
            'expected null when target exists nowhere; got ' + JSON.stringify(result)
        );
    });
});
