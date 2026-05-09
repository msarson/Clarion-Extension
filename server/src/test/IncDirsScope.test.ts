import * as assert from 'assert';
import * as path from 'path';
import { buildIncDirsToScan } from '../providers/incDirsScope';
import { SolutionManager } from '../solution/solutionManager';
import { serverSettings } from '../serverSettings';

/**
 * Failing-pin + regression-guard suite for task `8f1965c3` — FAR interface-
 * method `dirsToScan` widening (audit follow-up Q1 from 8c874d32).
 *
 * Pre-fix behaviour at `ReferencesProvider.ts:355-358` builds the dir set
 * from current-file-dir + libsrcPaths only. Layer 1 (RED-derived `.inc`
 * directories) is missing entirely, so projects that declare custom .inc
 * paths via `[Common] *.inc = .\classes` are silently invisible to FAR's
 * IMPLEMENTS / interface-declaration scan.
 *
 * Locked test contract (continuation_notes on task 8f1965c3):
 *   1. (bug pin)             Layer 1 hit — RED-derived dir included
 *   2. (regression — Layer 2) sibling of current file
 *   3. (regression — Layer 3) libsrc dirs
 *   4. (equivalence — config) Release skips [Debug] entries via getSearchPaths
 *   5. (equivalence — dedup) Set-based deduplication
 *   6. (regression — no-solution) sibling + libsrc only, no project layer
 *
 * Stub mimics CURRENT scope (sibling + libsrc only) — tests 1 + 4 RED on
 * stub, tests 2 / 3 / 5 / 6 GREEN. Alice's fix swaps the body to include
 * `solutionManager.solution.projects.flatMap(p => p.getSearchPaths('.inc'))`
 * — tests 1 + 4 flip GREEN.
 *
 * Tests pass an explicit `solutionManager` (not the singleton) — the
 * `_solutionManager` parameter on the helper makes mocks trivial.
 */

interface FakeProject {
    getSearchPaths(extension: string): string[];
}

function fakeSolutionManager(projectsSearchPaths: string[][]): SolutionManager {
    const projects: FakeProject[] = projectsSearchPaths.map(searchPaths => ({
        getSearchPaths: (ext: string) => {
            assert.strictEqual(ext, '.inc', 'helper should request .inc search paths');
            return searchPaths;
        }
    }));
    const solution = { projects };
    return { solution } as unknown as SolutionManager;
}

suite('IncDirsScope.buildIncDirsToScan (8f1965c3)', () => {

    let savedLibsrcPaths: string[] = [];

    setup(() => {
        savedLibsrcPaths = serverSettings.libsrcPaths;
        serverSettings.libsrcPaths = [];
    });

    teardown(() => {
        serverSettings.libsrcPaths = savedLibsrcPaths;
    });

    function lc(p: string): string { return p.toLowerCase(); }

    // --- (1) Bug pin — Layer 1 RED-derived dir present in scan set ---
    test("Layer 1 — RED-derived '<projectPath>/classes' is included in dirsToScan", () => {
        const projectRoot = path.normalize('C:/Proj');
        const classesDir = path.normalize('C:/Proj/classes');
        const currentFile = path.normalize('C:/Proj/IFace.inc');
        const sm = fakeSolutionManager([[projectRoot, classesDir]]);

        const dirs = buildIncDirsToScan(currentFile, sm);

        assert.ok(
            dirs.has(lc(classesDir)),
            'expected <projectPath>/classes in dirsToScan; got: ' + Array.from(dirs).join(', ') +
            " — RED-derived `.inc` paths not enumerated by FAR; classes folder is invisible"
        );
    });

    // --- (2) Regression guard — Layer 2 sibling-of-current-file always present ---
    test("Layer 2 — dirname(currentFilePath) is always in dirsToScan", () => {
        const projectRoot = path.normalize('C:/Proj');
        const currentFile = path.normalize('C:/Proj/somewhere/IFace.inc');
        const sm = fakeSolutionManager([[projectRoot]]);

        const dirs = buildIncDirsToScan(currentFile, sm);

        assert.ok(
            dirs.has(lc(path.dirname(currentFile))),
            'expected dirname(currentFile) in dirsToScan; got: ' + Array.from(dirs).join(', ')
        );
    });

    // --- (3) Regression guard — Layer 3 libsrcPaths included ---
    test('Layer 3 — every libsrcPaths entry is included in dirsToScan', () => {
        const lib1 = path.normalize('C:/clarion/libsrc/win');
        const lib2 = path.normalize('C:/clarion/libsrc/abc');
        serverSettings.libsrcPaths = [lib1, lib2];
        const currentFile = path.normalize('C:/Proj/IFace.inc');
        const sm = fakeSolutionManager([[]]);

        const dirs = buildIncDirsToScan(currentFile, sm);

        assert.ok(dirs.has(lc(lib1)), 'expected lib1 in dirsToScan; got: ' + Array.from(dirs).join(', '));
        assert.ok(dirs.has(lc(lib2)), 'expected lib2 in dirsToScan');
    });

    // --- (4) Equivalence — build-config filter (Release skips [Debug]) ---
    test("Build-config filter — when getSearchPaths('.inc') excludes [Debug] entries, dirsToScan does too", () => {
        // Simulates the post-bd7e4a29 behaviour where getSearchPaths returns
        // only Common + active-config entries. With Release active, the
        // project's Debug-only `*.inc = .\debug-only` should not appear here.
        const projectRoot = path.normalize('C:/Proj');
        const releaseOnly = path.normalize('C:/Proj/release-only');
        const debugOnly = path.normalize('C:/Proj/debug-only');
        const currentFile = path.normalize('C:/Proj/IFace.inc');

        // Fake project returns ONLY Common + Release-derived dirs (mimics
        // getSearchPaths post-config-filter).
        const sm = fakeSolutionManager([[projectRoot, releaseOnly]]);

        const dirs = buildIncDirsToScan(currentFile, sm);

        assert.ok(
            dirs.has(lc(releaseOnly)),
            'expected <projectPath>/release-only (active config) in dirsToScan'
        );
        assert.ok(
            !dirs.has(lc(debugOnly)),
            'expected <projectPath>/debug-only (inactive config) NOT in dirsToScan; ' +
            'helper must inherit getSearchPaths config filter rather than re-walking entries'
        );
    });

    // --- (5) Equivalence — Set dedup across sources ---
    test('Dedup — same dir appearing via project search paths AND libsrc is enumerated once', () => {
        const sharedDir = path.normalize('C:/Shared');
        serverSettings.libsrcPaths = [sharedDir];
        const currentFile = path.normalize('C:/Proj/IFace.inc');
        const sm = fakeSolutionManager([[sharedDir]]);

        const dirs = buildIncDirsToScan(currentFile, sm);

        // count occurrences of the shared dir (lowercase)
        const occurrences = Array.from(dirs).filter(d => d === lc(sharedDir)).length;
        assert.strictEqual(
            occurrences,
            1,
            'shared dir must appear exactly once due to Set dedup; got ' + occurrences +
            ' occurrences in: ' + Array.from(dirs).join(', ')
        );
    });

    // --- (6) Regression guard — no-solution mode falls back to sibling + libsrc only ---
    test('No-solution — solutionManager null falls back to dirname(currentFile) + libsrcPaths only', () => {
        const lib = path.normalize('C:/clarion/libsrc/win');
        serverSettings.libsrcPaths = [lib];
        const currentFile = path.normalize('C:/Proj/IFace.inc');

        const dirs = buildIncDirsToScan(currentFile, null);

        assert.ok(dirs.has(lc(path.dirname(currentFile))), 'expected dirname(currentFile)');
        assert.ok(dirs.has(lc(lib)), 'expected libsrc');
        assert.strictEqual(
            dirs.size,
            2,
            'no-solution mode should yield exactly {dirname, libsrc}; got: ' + Array.from(dirs).join(', ')
        );
    });
});
