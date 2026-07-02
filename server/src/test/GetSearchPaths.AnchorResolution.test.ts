import * as assert from 'assert';
import * as path from 'path';
import { ClarionProjectServer } from '../solution/clarionProjectServer';
import { RedirectionEntry, RedirectionFileParserServer } from '../solution/redirectionFileParserServer';
import { serverSettings } from '../serverSettings';

/**
 * Failing-pin + regression-guard suite for task `ff28f45f` —
 * `clarionProjectServer.getSearchPaths` resolution-anchor bug.
 *
 * Pre-fix at `clarionProjectServer.ts:402-405`:
 *   const redFileDir = path.dirname(entry.redFile);
 *   const resolvedPath = path.isAbsolute(p) ? p : path.resolve(redFileDir, p);
 *
 * Same shape as the parser-side bugs fixed by 01d635ef + cfaa7584, but in a
 * parallel implementation. `getSearchPaths` lives inside `ClarionProjectServer`
 * so `this.path` (the project root) is directly available — fix swaps
 * `redFileDir` for `this.path`. No defensive `?? redFileDir` fallback needed
 * (unlike the parser side, which is reusable across projects); `this.path` is
 * always set from the constructor.
 *
 * Locked test contract (continuation_notes on task ff28f45f):
 *   1. (bug pin) fallback mode — global red `<bin>\Clarion110.red` with `.\classes`
 *   2. (bug pin) multi-segment / `..` — `..\shared` (cfaa7584 mirror)
 *   3. (bug pin) include mode — included file's entry.redFile points at the
 *      included global red, but resolution should still anchor on outer
 *      project's this.path
 *   4. (regression) absolute paths in entries pass through unchanged
 *   5. (regression — load-bearing equivalence witness) project-local red mask:
 *      `.\classes` resolves correctly pre AND post (the mask case was the
 *      only reason this bug stayed hidden)
 *   6. (regression) project root invariant — `pathSet.add(this.path)` at :393
 *      ensures `this.path` is always in result regardless of entries
 *   7. (regression) build-config filter — `[Debug]` excluded under Release
 *
 * Tests construct entries directly (no parser invocation) and a fake
 * `ClarionProjectServer` with `redirectionEntries` set + lazy-init bypass.
 *
 * Per-test fresh project instance avoids `searchPathsCache` pollution.
 */

interface FixtureSpec {
    projectPath: string;
    entries: RedirectionEntry[];
}

function buildProject(spec: FixtureSpec): ClarionProjectServer {
    const project = new ClarionProjectServer('TestProj', 'app', spec.projectPath, '{TEST}');
    project.redirectionEntries = spec.entries;
    // Bypass lazy init in `getSearchPaths` (which calls `getRedirectionParser`
    // on first access). With `redirectionParser` non-null, the lazy init is
    // skipped and our curated entries above are used.
    (project as unknown as { redirectionParser: RedirectionFileParserServer | null }).redirectionParser =
        {} as RedirectionFileParserServer;
    return project;
}

function entry(redFile: string, section: string, extension: string, paths: string[]): RedirectionEntry {
    return { redFile, section, extension, paths };
}

suite('GetSearchPaths.AnchorResolution (ff28f45f)', () => {

    let savedConfiguration = '';

    setup(() => {
        savedConfiguration = serverSettings.configuration;
        serverSettings.configuration = 'Release'; // default for non-build-config tests
    });

    teardown(() => {
        serverSettings.configuration = savedConfiguration;
    });

    // --- (1) Bug pin — fallback mode (global red anchors on bin instead of project) ---
    test('fallback mode — `.\\\\classes` in global red resolves to <projectPath>/classes, not <binDir>/classes', () => {
        const projectPath = 'C:\\Workspace\\Proj';
        const globalRed = 'C:\\Clarion\\bin\\Clarion110.red';
        const project = buildProject({
            projectPath,
            entries: [entry(globalRed, 'Common', '*.inc', ['.\\classes'])]
        });

        const result = project.getSearchPaths('.inc');

        const expected = path.resolve(projectPath, 'classes');
        assert.ok(
            result.some(p => path.normalize(p) === path.normalize(expected)),
            'expected ' + expected + ' in result; got: ' + result.join(', ') +
            " — '.\\classes' is being resolved against the .red file's dir instead of the project dir"
        );
    });

    // --- (2) Bug pin — multi-segment / `..` (cfaa7584 mirror) ---
    test('multi-segment — `..\\\\shared` in global red resolves under projectPath\'s parent, not binDir\'s parent', () => {
        const projectPath = 'C:\\Workspace\\Proj';
        const globalRed = 'C:\\Clarion\\bin\\Clarion110.red';
        const project = buildProject({
            projectPath,
            entries: [entry(globalRed, 'Common', '*.clw', ['..\\shared'])]
        });

        const result = project.getSearchPaths('.clw');

        const expected = path.resolve(projectPath, '..\\shared'); // C:\Workspace\shared
        const wrongAnchor = path.resolve('C:\\Clarion\\bin', '..\\shared'); // C:\Clarion\shared
        assert.notStrictEqual(expected, wrongAnchor, 'fixture sanity: expected and wrong-anchor must differ');
        assert.ok(
            result.some(p => path.normalize(p) === path.normalize(expected)),
            'expected ' + expected + ' (anchored on project parent) in result; got: ' + result.join(', ') +
            ' — `..` is being resolved from the .red file\'s dir instead of the project dir'
        );
    });

    // --- (3) Bug pin — include mode (included red still anchors on outer project) ---
    test('include mode — entry from `{include}`\'d global red still anchors on outer project\'s this.path', () => {
        // Project-local red includes the global red. Per parseRedFileRecursive,
        // the included file's entries carry redFile pointing at the included
        // file (the global red), not the outer project-local one. The fix
        // must still anchor on the OUTER project's this.path.
        const projectPath = 'C:\\Workspace\\Proj';
        const includedGlobalRed = 'C:\\Clarion\\bin\\Clarion110.red';
        const project = buildProject({
            projectPath,
            entries: [entry(includedGlobalRed, 'Common', '*.inc', ['.\\classes'])]
        });

        const result = project.getSearchPaths('.inc');

        const expected = path.resolve(projectPath, 'classes');
        assert.ok(
            result.some(p => path.normalize(p) === path.normalize(expected)),
            'expected ' + expected + ' in result; got: ' + result.join(', ') +
            ' — include-mode entries should still anchor on outer project, not the included file\'s dir'
        );
    });

    // --- (4) Regression guard — absolute paths pass through unchanged ---
    test('absolute paths in entries pass through unchanged', () => {
        const projectPath = 'C:\\Workspace\\Proj';
        const absoluteLib = 'C:\\Lib\\classes';
        const project = buildProject({
            projectPath,
            entries: [entry('C:\\Clarion\\bin\\Clarion110.red', 'Common', '*.inc', [absoluteLib])]
        });

        const result = project.getSearchPaths('.inc');

        assert.ok(
            result.some(p => path.normalize(p) === path.normalize(absoluteLib)),
            'expected absolute ' + absoluteLib + ' to pass through; got: ' + result.join(', ')
        );
    });

    // --- (5) Regression — load-bearing equivalence witness for project-local red mask ---
    test('project-local red mask — `.\\\\classes` resolves correctly when entry.redFile dir == project path', () => {
        // The bug stayed hidden because for project-local reds, dirname(entry.redFile)
        // and this.path coincide. Pre-fix this is correct by accident; post-fix it's
        // correct by design. Either way the result must be <projectPath>/classes.
        const projectPath = 'C:\\Workspace\\Proj';
        const projectLocalRed = path.join(projectPath, 'Clarion110.red');
        const project = buildProject({
            projectPath,
            entries: [entry(projectLocalRed, 'Common', '*.inc', ['.\\classes'])]
        });

        const result = project.getSearchPaths('.inc');

        const expected = path.resolve(projectPath, 'classes');
        assert.ok(
            result.some(p => path.normalize(p) === path.normalize(expected)),
            'expected ' + expected + ' in result; got: ' + result.join(', ')
        );
    });

    // --- (6) Regression guard — project root invariant (line 393 pathSet.add(this.path)) ---
    test('project root invariant — this.path is always in result regardless of entries', () => {
        const projectPath = 'C:\\Workspace\\Proj';
        // Empty entries → no matching entries to walk; only the unconditional
        // pathSet.add(this.path) at line 393 contributes.
        const project = buildProject({
            projectPath,
            entries: []
        });

        const result = project.getSearchPaths('.inc');

        assert.ok(
            result.some(p => path.normalize(p) === path.normalize(projectPath)),
            'expected ' + projectPath + ' (this.path) in result; got: ' + result.join(', ')
        );
    });

    // --- (7) Regression — build-config filter (Common||configuration) ---
    test('build-config filter — Release config skips [Debug] entries', () => {
        serverSettings.configuration = 'Release';
        const projectPath = 'C:\\Workspace\\Proj';
        const projectLocalRed = path.join(projectPath, 'Clarion110.red');
        const project = buildProject({
            projectPath,
            entries: [
                entry(projectLocalRed, 'Debug', '*.inc', ['.\\debug-only']),
                entry(projectLocalRed, 'Release', '*.inc', ['.\\release-only']),
                entry(projectLocalRed, 'Common', '*.inc', ['.\\common'])
            ]
        });

        const result = project.getSearchPaths('.inc');

        const debugDir = path.resolve(projectPath, 'debug-only');
        const releaseDir = path.resolve(projectPath, 'release-only');
        const commonDir = path.resolve(projectPath, 'common');

        assert.ok(
            !result.some(p => path.normalize(p) === path.normalize(debugDir)),
            'expected NO ' + debugDir + ' (inactive Debug section); got: ' + result.join(', ')
        );
        assert.ok(
            result.some(p => path.normalize(p) === path.normalize(releaseDir)),
            'expected ' + releaseDir + ' (active Release section)'
        );
        assert.ok(
            result.some(p => path.normalize(p) === path.normalize(commonDir)),
            'expected ' + commonDir + ' (always-active Common section)'
        );
    });
});
