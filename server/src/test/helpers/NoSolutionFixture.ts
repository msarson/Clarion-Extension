import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { SolutionManager } from '../../solution/solutionManager';
import { serverSettings } from '../../serverSettings';

/**
 * No-solution-mode fixture scaffold for #113 (403afd0e) and #114 (0075728c).
 *
 * Exercises the `clarion/findFile` server resolver + client passthrough in the
 * "standalone .clw, no .sln loaded" workflow that Mark named in the task title:
 * FAR / Definition / Hover / Go-to-Impl / completion should all resolve files
 * via `serverSettings.libsrcPaths` (the dd87633f B1 version-bound substrate)
 * even when no solution is loaded.
 *
 * Three orthogonal state knobs the fixture controls:
 *
 *   1. **Filesystem** — real tmpdir with libsrc dirs holding target files +
 *      optional source file dir. `fs.existsSync` checks in Eve's server-side
 *      resolver (server.ts:1430) require real disk presence, so we can't stub
 *      with a virtual fs.
 *
 *   2. **`serverSettings.libsrcPaths`** — pointed at the fixture's libsrc
 *      tmpdirs so the resolver's no-solution-mode walk has something to find.
 *      Saved + restored across setup/teardown.
 *
 *   3. **`SolutionManager.instance` = null** — explicit no-solution mode.
 *      Eve's resolver branches on `SolutionManager.getInstance()` at
 *      server.ts:1378; null is what triggers the no-solution code path.
 *
 * Shared with 0075728c (client-side `RedirectionService` deletion / route all
 * file resolution through LSP `clarion/findFile`) per Bob's synergy note in
 * the 403afd0e continuation. Don't re-invent fixtures there — extend this
 * spec shape if a new state knob is needed.
 *
 * Per-test unique tmpdir + saved-state stack means parallel-suite execution
 * doesn't collide. Matches the pattern from
 * `RedirectionParser.LibsrcFallback.test.ts` (b8b2d748 / Layer 3).
 */

export interface NoSolutionFixture {
    tmpRoot: string;
    /** Source-file directory (when spec.sourceFile is set). */
    sourceDir: string | null;
    /** Absolute path to the source file (when spec.sourceFile is set). */
    sourceFile: string | null;
    /** `file:///` URI form of `sourceFile`, ready to send as `clarion/findFile` `sourceUri` param. */
    sourceUri: string | null;
    /** Libsrc directories created on disk, in walk order. */
    libsrcDirs: string[];
}

export interface NoSolutionFixtureSpec {
    /**
     * Files to create inside each libsrc directory.
     *
     * Each element is one libsrc dir's contents — outer array index is walk
     * order. Inner record maps filename → file content (write content is
     * irrelevant for `findFile` which only does `fs.existsSync`, but a
     * one-byte body keeps the file legitimate).
     *
     * Empty inner record creates an empty libsrc dir (useful for testing
     * "walk first → empty → walk second → hit" coverage).
     */
    libsrcs: Record<string, string>[];

    /**
     * Optional source file (the file the user is editing). When set, the
     * fixture creates a source-file directory under tmpRoot + writes the
     * file, and exposes `sourceUri` ready to send as the `clarion/findFile`
     * `sourceUri` param. Without it, the resolver has no `localDir` tier and
     * walks libsrcs only.
     */
    sourceFile?: {
        filename: string;
        content: string;
        /** Optional sibling files in the same source dir (e.g. an INCLUDE'd `.inc`). */
        siblings?: Record<string, string>;
    };

    /**
     * Override `serverSettings.defaultLookupExtensions` for extension-fallback
     * tests. Default is the production list (`.clw / .inc / .equ / .eq / .int`).
     */
    defaultLookupExtensions?: string[];
}

let _savedSmInstance: SolutionManager | null = null;
let _savedLibsrcPaths: string[] | null = null;
let _savedDefaultLookupExtensions: string[] | null = null;
let _fixtureActive = false;

/**
 * Build a no-solution-mode fixture. Throws if a previous fixture is still
 * active — call `teardownNoSolutionFixture(fix)` from the test's `teardown()`
 * before re-entering.
 */
export function buildNoSolutionFixture(spec: NoSolutionFixtureSpec): NoSolutionFixture {
    if (_fixtureActive) {
        throw new Error('No-solution fixture already active — call teardownNoSolutionFixture() before re-entering');
    }
    _fixtureActive = true;

    _savedSmInstance = (SolutionManager as unknown as { instance: SolutionManager | null }).instance;
    _savedLibsrcPaths = serverSettings.libsrcPaths;
    _savedDefaultLookupExtensions = serverSettings.defaultLookupExtensions;

    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'no-solution-403afd0e-'));

    const libsrcDirs: string[] = [];
    spec.libsrcs.forEach((files, idx) => {
        const dir = path.join(tmpRoot, `libsrc${idx + 1}`);
        fs.mkdirSync(dir, { recursive: true });
        for (const [filename, content] of Object.entries(files)) {
            fs.writeFileSync(path.join(dir, filename), content);
        }
        libsrcDirs.push(dir);
    });

    let sourceDir: string | null = null;
    let sourceFile: string | null = null;
    let sourceUri: string | null = null;
    if (spec.sourceFile) {
        sourceDir = path.join(tmpRoot, 'source');
        fs.mkdirSync(sourceDir, { recursive: true });
        sourceFile = path.join(sourceDir, spec.sourceFile.filename);
        fs.writeFileSync(sourceFile, spec.sourceFile.content);
        for (const [filename, content] of Object.entries(spec.sourceFile.siblings ?? {})) {
            fs.writeFileSync(path.join(sourceDir, filename), content);
        }
        sourceUri = `file:///${sourceFile.replace(/\\/g, '/').replace(/:/g, '%3A')}`;
    }

    // Enter no-solution mode + point libsrc walk at fixture
    (SolutionManager as unknown as { instance: SolutionManager | null }).instance = null;
    serverSettings.libsrcPaths = libsrcDirs.slice();
    if (spec.defaultLookupExtensions) {
        serverSettings.defaultLookupExtensions = spec.defaultLookupExtensions.slice();
    }

    return { tmpRoot, sourceDir, sourceFile, sourceUri, libsrcDirs };
}

/**
 * Restore `SolutionManager.instance` + `serverSettings.libsrcPaths` + the
 * extension list, then remove the fixture's tmpdir. Idempotent — safe to call
 * even if `buildNoSolutionFixture` threw mid-setup.
 */
export function teardownNoSolutionFixture(fix: NoSolutionFixture | null): void {
    if (!_fixtureActive) { return; }
    if (_savedSmInstance !== null) {
        (SolutionManager as unknown as { instance: SolutionManager | null }).instance = _savedSmInstance;
    } else {
        (SolutionManager as unknown as { instance: SolutionManager | null }).instance = null;
    }
    if (_savedLibsrcPaths !== null) {
        serverSettings.libsrcPaths = _savedLibsrcPaths;
    }
    if (_savedDefaultLookupExtensions !== null) {
        serverSettings.defaultLookupExtensions = _savedDefaultLookupExtensions;
    }
    _savedSmInstance = null;
    _savedLibsrcPaths = null;
    _savedDefaultLookupExtensions = null;
    if (fix) {
        try { fs.rmSync(fix.tmpRoot, { recursive: true, force: true }); } catch { /* best-effort */ }
    }
    _fixtureActive = false;
}
