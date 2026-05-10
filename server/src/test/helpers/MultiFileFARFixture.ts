import * as path from 'path';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { TokenCache } from '../../TokenCache';
import { SolutionManager } from '../../solution/solutionManager';
import { FileRelationshipGraph } from '../../FileRelationshipGraph';

/**
 * Multi-file FAR test scaffolding for the FAR family follow-ups
 * (`bb21f225`, surfaced during 35019583 step-2 escalation).
 *
 * `ReferencesProvider.findReferences` walks `solutionManager.solution.projects[].sourceFiles[]`
 * and constructs URIs as `\`file:///${fullPath.replace(/\\/g, '/')}\``
 * (per `ReferencesProvider.ts:1641`). For multi-file FAR tests to reach
 * the cross-file scan, three things must align:
 *
 *   1. `(SolutionManager as any).instance` populated with a fake
 *      `solution.projects[0]` carrying `path` + `sourceFiles[]`.
 *   2. `solutionManager.findProjectForFile(filename)` returns the same
 *      fake project (the cross-file walk at :1636 calls it).
 *   3. `TokenCache.getInstance().getTokens(doc)` seeded for each
 *      TextDocument constructed against the canonical URI shape above.
 *
 * Without (1) FAR returns only the cursor file. Without (2) the
 * project-scope iteration is silent (returns empty). Without (3) the
 * provider's `getTokensForUri(uri)` lookup misses, and tokens for
 * scanned files are unavailable.
 *
 * This helper consolidates all three so each multi-file test costs ~10
 * lines of fixture setup instead of ~80 lines of mock plumbing per task.
 */

export interface MultiFileFixture {
    projectRoot: string;
    uris: { [relPath: string]: string };
    documents: { [relPath: string]: TextDocument };
}

export interface BuildMultiFileFixtureOpts {
    files: { [relPath: string]: string };
    projectRoot?: string;
    /**
     * Optional FRG seeding — enables cross-file Tier 6 (PROGRAM-scope global receiver)
     * test coverage by seeding `FileRelationshipGraph` with `MEMBER → PROGRAM` edges.
     *
     * - `programFile`: relative path of the file in `files` that is the PROGRAM (e.g. `'main.clw'`)
     * - `memberFiles`: relative paths that are MEMBERs of the PROGRAM. When omitted, every
     *   non-PROGRAM file in `files` is treated as a MEMBER. Each MEMBER's `MEMBER('main.clw')`
     *   declaration is presumed to point at `programFile` — fixture authors are responsible
     *   for keeping the `MEMBER(...)` text in their file content consistent.
     *
     * When `frg` is provided, `teardownMultiFileFixture` calls `FileRelationshipGraph.reset()`
     * to restore the singleton's pre-test state. When omitted, FRG state is untouched
     * (existing callers without the opt-in see no behaviour change).
     *
     * Added 2026-05-10 by task `671d7cd8` to backfill the deferred Tier 6 cross-file
     * test coverage from `10ea5a80` + `9142af9f` + `0c289e16`.
     */
    frg?: {
        programFile: string;
        memberFiles?: string[];
    };
}

let _savedSmInstance: SolutionManager | null = null;
let _fixtureActive = false;
let _frgSeeded = false;

/** Constructs the canonical URI shape `getFilesToSearch` builds. */
export function createTestUri(projectRoot: string, relPath: string): string {
    const fullPath = path.join(projectRoot, relPath);
    return `file:///${fullPath.replace(/\\/g, '/')}`;
}

/**
 * Build a multi-file FAR test fixture. Mocks SolutionManager singleton +
 * seeds TokenCache for every file in `opts.files`. Caller is responsible
 * for invoking `teardownMultiFileFixture()` from the test's `teardown()`.
 *
 * Default `projectRoot` is `C:\\TestProj` — pick a deterministic absolute
 * path so URI normalization stays stable across runs.
 */
export function buildMultiFileFixture(opts: BuildMultiFileFixtureOpts): MultiFileFixture {
    if (_fixtureActive) {
        throw new Error('Multi-file FAR fixture already active — call teardownMultiFileFixture() before re-entering');
    }
    _fixtureActive = true;

    const projectRoot = opts.projectRoot ?? 'C:\\TestProj';
    const uris: { [relPath: string]: string } = {};
    const documents: { [relPath: string]: TextDocument } = {};

    // Build sourceFiles[] entries with relativePath + a getAbsolutePath() shim
    // (used by SolutionManager.findProjectForFile at solutionManager.ts:316).
    const sourceFiles = Object.keys(opts.files).map(relPath => {
        const absPath = path.join(projectRoot, relPath);
        return {
            relativePath: relPath,
            getAbsolutePath: () => absPath
        };
    });

    const fakeProject = {
        name: 'TestProj',
        path: projectRoot,
        sourceFiles
    };

    const fakeSolution = { projects: [fakeProject] };
    const fakeSm = {
        solution: fakeSolution,
        // findProjectForFile(filename) — returns the fake project for any
        // filename whose basename matches one of the fixture's relPaths.
        findProjectForFile(filename: string) {
            const baseName = path.basename(filename).toLowerCase();
            for (const relPath of Object.keys(opts.files)) {
                if (path.basename(relPath).toLowerCase() === baseName) {
                    return fakeProject;
                }
            }
            return undefined;
        },
        // getProjectPathForFile(filename) — returns the project root for any
        // file in the fixture (called by `findClassTypeReferences` at
        // ReferencesProvider.ts:2107). Falls back to dirname(filename) for
        // unknown files, mirroring the real impl at solutionManager.ts:335.
        getProjectPathForFile(filename: string) {
            const baseName = path.basename(filename).toLowerCase();
            for (const relPath of Object.keys(opts.files)) {
                if (path.basename(relPath).toLowerCase() === baseName) {
                    return projectRoot;
                }
            }
            return path.dirname(filename);
        }
    } as unknown as SolutionManager;

    _savedSmInstance = (SolutionManager as unknown as { instance: SolutionManager | null }).instance;
    (SolutionManager as unknown as { instance: SolutionManager | null }).instance = fakeSm;

    // Seed TokenCache for each file at its canonical URI.
    const tokenCache = TokenCache.getInstance();
    tokenCache.clearAllTokens();
    for (const [relPath, content] of Object.entries(opts.files)) {
        const uri = createTestUri(projectRoot, relPath);
        const doc = TextDocument.create(uri, 'clarion', 1, content);
        tokenCache.getTokens(doc);
        uris[relPath] = uri;
        documents[relPath] = doc;
    }

    // Optional FRG seeding for cross-file Tier 6 (PROGRAM-scope global receiver) coverage.
    if (opts.frg) {
        const programAbs = path.join(projectRoot, opts.frg.programFile);
        const memberPaths = opts.frg.memberFiles
            ?? Object.keys(opts.files).filter(p => p !== opts.frg!.programFile);
        const edges = memberPaths.map(memberRel => ({
            type: 'MEMBER' as const,
            fromFile: path.join(projectRoot, memberRel),
            toFile: programAbs,
            fromLine: 0
        }));
        FileRelationshipGraph.getInstance().seedEdgesForTest(edges);
        _frgSeeded = true;
    }

    return { projectRoot, uris, documents };
}

/** Restore SolutionManager.instance + clear TokenCache + reset FRG (when seeded). Idempotent. */
export function teardownMultiFileFixture(): void {
    if (!_fixtureActive) { return; }
    (SolutionManager as unknown as { instance: SolutionManager | null }).instance = _savedSmInstance;
    _savedSmInstance = null;
    TokenCache.getInstance().clearAllTokens();
    if (_frgSeeded) {
        FileRelationshipGraph.getInstance().reset();
        _frgSeeded = false;
    }
    _fixtureActive = false;
}
