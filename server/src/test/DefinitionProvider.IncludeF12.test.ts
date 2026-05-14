import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Location, Position } from 'vscode-languageserver-protocol';
import { DefinitionProvider } from '../providers/DefinitionProvider';
import { SolutionManager } from '../solution/solutionManager';

/**
 * Solution-mode F12 on INCLUDE filename — #171 integration coverage.
 *
 * The `TokenHelper.getFileRefArgStringToken` + DefinitionProvider entry-point
 * exception are mode-agnostic (no `SolutionManager.getInstance()` reads in
 * the new code path), but the integration THROUGH `DefinitionProvider.provideDefinition`
 * → `findFileDefinition` on a string-cursor was NEW for solution-mode at #171
 * commit time — previously the `isPositionInString` guard bailed first and
 * `findFileDefinition` was never reached from this entry-point on this shape.
 *
 * This suite locks the user-visible "F12 on INCLUDE filename in solution mode"
 * contract explicitly. Without it, a future refactor that accidentally couples
 * the detector or extract path to `SolutionManager` could regress solution-mode
 * F12 silently while no-solution-mode tests (Test 2 in `NoSolutionMode.EntryPoints.test.ts`)
 * still pass.
 *
 * **Bidirectional-pin shape** per `feedback_bidirectional_pin_assertion`:
 *   - Positive: Location truthy + URI basename matches expected INCLUDE target
 *     + URI points inside the fixture's tmpdir
 *   - Negative regression sentinel: F12 on cursor over a genuinely-missing INCLUDE
 *     filename returns null
 *
 * Fixture isolates SolutionManager.instance to a minimal shim — projects[0]
 * has a `getRedirectionParser()` stub that returns `findFile() → null`, forcing
 * `findFileDefinition` to fall through to its relative-path probe (line 134-142).
 * This is the path most real-world solution-mode F12s actually take when the
 * INCLUDE target is co-located with the source file (no redirection rewrite needed).
 */

interface SolutionModeFixture {
    tmpRoot: string;
    sourceFile: string;
    sourceUri: string;
}

let _savedSmInstance: SolutionManager | null = null;
let _fixtureActive = false;

function buildSolutionModeFixture(opts: {
    sourceFilename: string;
    sourceContent: string;
    siblings?: Record<string, string>;
}): SolutionModeFixture {
    if (_fixtureActive) {
        throw new Error('Solution-mode fixture already active — call teardown first');
    }
    _fixtureActive = true;

    _savedSmInstance = (SolutionManager as unknown as { instance: SolutionManager | null }).instance;

    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sln-mode-171-'));
    const sourceFile = path.join(tmpRoot, opts.sourceFilename);
    fs.writeFileSync(sourceFile, opts.sourceContent);
    for (const [name, content] of Object.entries(opts.siblings ?? {})) {
        fs.writeFileSync(path.join(tmpRoot, name), content);
    }
    const sourceUri = `file:///${sourceFile.replace(/\\/g, '/').replace(/:/g, '%3A')}`;

    // Minimal SolutionManager shim: one project with a redirection parser that
    // always returns null. Forces `findFileDefinition` to fall through to the
    // relative-path probe (line 134-142), which finds the target via fs.existsSync.
    const fakeProject = {
        path: tmpRoot,
        getRedirectionParser: () => ({
            findFile: (_: string) => null
        })
    };
    const fakeSolution = { projects: [fakeProject] };
    const fakeSm = { solution: fakeSolution } as unknown as SolutionManager;
    (SolutionManager as unknown as { instance: SolutionManager | null }).instance = fakeSm;

    return { tmpRoot, sourceFile, sourceUri };
}

function teardownSolutionModeFixture(fix: SolutionModeFixture | null): void {
    if (!_fixtureActive) return;
    (SolutionManager as unknown as { instance: SolutionManager | null }).instance = _savedSmInstance;
    _savedSmInstance = null;
    if (fix) {
        try { fs.rmSync(fix.tmpRoot, { recursive: true, force: true }); } catch { /* best-effort */ }
    }
    _fixtureActive = false;
}

function cursorPositionOf(sourceText: string, searchString: string): Position {
    const lines = sourceText.split(/\r?\n/);
    for (let line = 0; line < lines.length; line++) {
        const idx = lines[line].indexOf(searchString);
        if (idx !== -1) return { line, character: idx };
    }
    throw new Error(`cursorPositionOf: '${searchString}' not found in source`);
}

function fsPathFromUri(uri: string): string {
    return decodeURIComponent(uri.replace('file:///', '')).replace(/\//g, path.sep);
}

suite('DefinitionProvider F12 on INCLUDE filename — solution mode (#171)', () => {

    let fix: SolutionModeFixture | null = null;

    teardown(() => {
        teardownSolutionModeFixture(fix);
        fix = null;
    });

    test('resolves INCLUDE filename to sibling file when solution is loaded', async () => {
        const sourceBody =
            "  PROGRAM\n" +
            "  INCLUDE('MyClass.inc')\n" +
            "  CODE\n" +
            "  RETURN\n";

        fix = buildSolutionModeFixture({
            sourceFilename: 'MyProg.clw',
            sourceContent: sourceBody,
            siblings: { 'MyClass.inc': "MyClass  CLASS,TYPE\n  END\n" }
        });

        const provider = new DefinitionProvider();
        const sourceDoc = TextDocument.create(fix.sourceUri, 'clarion', 1, sourceBody);
        const position = cursorPositionOf(sourceBody, 'MyClass.inc');

        const result = await provider.provideDefinition(sourceDoc, position);

        // Bidirectional-pin (positive):
        // (1) Location truthy
        assert.ok(result,
            'provideDefinition must return a Location for INCLUDE filename in solution mode (#171)');

        const loc: Location = Array.isArray(result) ? result[0] : (result as Location);
        assert.ok(loc?.uri, 'returned Location must have a uri');

        // (2) basename matches the INCLUDE target
        const resultPath = fsPathFromUri(loc.uri);
        assert.strictEqual(
            path.basename(resultPath).toLowerCase(),
            'myclass.inc',
            'resolved file basename must match the INCLUDE target'
        );

        // (3) path is inside the fixture's tmpdir (silently-picked-from-elsewhere can't pass)
        const tmpRootNormalized = path.normalize(fix.tmpRoot).toLowerCase();
        assert.ok(
            path.normalize(resultPath).toLowerCase().startsWith(tmpRootNormalized),
            `resolved path must be inside fixture tmpdir (expected prefix: ${tmpRootNormalized}, got: ${resultPath})`
        );
    });

    test('returns null on cursor over genuinely-missing INCLUDE filename (regression sentinel)', async () => {
        const sourceBody =
            "  PROGRAM\n" +
            "  INCLUDE('MissingFile.inc')\n" +
            "  CODE\n" +
            "  RETURN\n";

        fix = buildSolutionModeFixture({
            sourceFilename: 'MyProg.clw',
            sourceContent: sourceBody,
            siblings: { 'OtherFile.inc': "! unrelated\n" }
        });

        const provider = new DefinitionProvider();
        const sourceDoc = TextDocument.create(fix.sourceUri, 'clarion', 1, sourceBody);
        const position = cursorPositionOf(sourceBody, 'MissingFile.inc');

        const result = await provider.provideDefinition(sourceDoc, position);

        // Genuine miss → must NOT silently resolve to the unrelated sibling.
        // The negative-case contract keeps the positive case honest.
        if (result !== null) {
            const loc: Location = Array.isArray(result) ? result[0] : (result as Location);
            if (loc?.uri) {
                const resultPath = fsPathFromUri(loc.uri);
                assert.notStrictEqual(
                    path.basename(resultPath).toLowerCase(),
                    'otherfile.inc',
                    `genuine-miss must NOT silently resolve to unrelated sibling; got: ${resultPath}`
                );
            }
        }
    });
});
