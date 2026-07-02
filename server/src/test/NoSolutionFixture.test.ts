import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { SolutionManager } from '../solution/solutionManager';
import { serverSettings } from '../serverSettings';
import {
    NoSolutionFixture,
    buildNoSolutionFixture,
    cursorPositionOf,
    teardownNoSolutionFixture
} from './helpers/NoSolutionFixture';

/**
 * Scaffold smoke tests for `NoSolutionFixture` (#113 / 403afd0e item [4]).
 *
 * Pins the fixture's own invariants — not Eve's resolver, which is exercised
 * by the end-to-end test wire-up landing on top of this scaffold. Verifies:
 *   - Filesystem layout matches the spec
 *   - `SolutionManager.getInstance()` returns null inside the fixture
 *   - `serverSettings.libsrcPaths` points at fixture libsrcs
 *   - `sourceUri` shape decodes back to a valid source-file path
 *   - Teardown restores prior state
 *
 * Shared with 0075728c (RedirectionService deletion) — when those tests land,
 * extend this suite if a new invariant needs pinning.
 */

suite('NoSolutionFixture (403afd0e scaffold)', () => {

    let fix: NoSolutionFixture | null = null;

    teardown(() => {
        teardownNoSolutionFixture(fix);
        fix = null;
    });

    test('creates libsrc dirs + writes files at the right paths', () => {
        fix = buildNoSolutionFixture({
            libsrcs: [
                { 'Target.clw': '! target body\n' },
                { 'Other.inc': '! other body\n', 'Helper.clw': '! helper\n' }
            ]
        });

        assert.strictEqual(fix.libsrcDirs.length, 2, 'two libsrc dirs requested');
        assert.ok(fs.existsSync(path.join(fix.libsrcDirs[0], 'Target.clw')),
            'Target.clw should exist in libsrc1');
        assert.ok(fs.existsSync(path.join(fix.libsrcDirs[1], 'Other.inc')),
            'Other.inc should exist in libsrc2');
        assert.ok(fs.existsSync(path.join(fix.libsrcDirs[1], 'Helper.clw')),
            'Helper.clw should exist in libsrc2');
    });

    test('enters no-solution mode + points serverSettings.libsrcPaths at fixture', () => {
        fix = buildNoSolutionFixture({
            libsrcs: [{ 'A.clw': '!' }]
        });

        assert.strictEqual(SolutionManager.getInstance(), null,
            'SolutionManager.getInstance() must return null inside the fixture');
        assert.deepStrictEqual(serverSettings.libsrcPaths, fix.libsrcDirs,
            'serverSettings.libsrcPaths must match fixture libsrcDirs');
    });

    test('sourceFile spec writes source + decodes to a valid sourceUri', () => {
        fix = buildNoSolutionFixture({
            libsrcs: [],
            sourceFile: {
                filename: 'MyProg.clw',
                content: '  PROGRAM\n  CODE\n  RETURN\n'
            }
        });

        assert.ok(fix.sourceFile, 'sourceFile path should be populated');
        assert.ok(fs.existsSync(fix.sourceFile!), 'source file should exist on disk');
        assert.ok(fix.sourceUri, 'sourceUri should be populated');
        assert.ok(fix.sourceUri!.startsWith('file:///'),
            'sourceUri should use file:/// scheme');

        // Round-trip: decode the URI back to a path and confirm it matches sourceFile.
        // Mirrors Eve's server-side `decodeURIComponent(uri.replace('file:///',''))` decoder.
        const decoded = decodeURIComponent(fix.sourceUri!.replace('file:///', ''));
        assert.strictEqual(
            path.normalize(decoded).toLowerCase(),
            path.normalize(fix.sourceFile!).toLowerCase(),
            'sourceUri must decode back to the absolute sourceFile path'
        );
    });

    test('sourceFile.siblings creates additional files in the source dir', () => {
        fix = buildNoSolutionFixture({
            libsrcs: [],
            sourceFile: {
                filename: 'MyProg.clw',
                content: '!',
                siblings: { 'shared.inc': '!\n', 'data.equ': '!\n' }
            }
        });

        assert.ok(fix.sourceDir, 'sourceDir should be populated');
        assert.ok(fs.existsSync(path.join(fix.sourceDir!, 'shared.inc')),
            'sibling shared.inc should exist');
        assert.ok(fs.existsSync(path.join(fix.sourceDir!, 'data.equ')),
            'sibling data.equ should exist');
    });

    test('teardown restores SolutionManager.instance + serverSettings + removes tmpdir', () => {
        const savedSm = (SolutionManager as unknown as { instance: SolutionManager | null }).instance;
        const savedLibsrc = serverSettings.libsrcPaths;

        fix = buildNoSolutionFixture({
            libsrcs: [{ 'X.clw': '!' }]
        });
        const tmpRoot = fix.tmpRoot;
        assert.ok(fs.existsSync(tmpRoot), 'tmpRoot should exist while fixture is active');

        teardownNoSolutionFixture(fix);
        fix = null;

        assert.strictEqual(
            (SolutionManager as unknown as { instance: SolutionManager | null }).instance,
            savedSm,
            'SolutionManager.instance must be restored'
        );
        assert.deepStrictEqual(serverSettings.libsrcPaths, savedLibsrc,
            'serverSettings.libsrcPaths must be restored');
        assert.ok(!fs.existsSync(tmpRoot), 'tmpRoot should be removed after teardown');
    });

    test('re-entering before teardown throws', () => {
        fix = buildNoSolutionFixture({ libsrcs: [] });
        assert.throws(
            () => buildNoSolutionFixture({ libsrcs: [] }),
            /already active/,
            'second build call without teardown must throw'
        );
    });

    // #139 — cursor-position helper for entry-point smoke tests.
    suite('cursorPositionOf', () => {

        test('returns 0-based Position on the first occurrence by default', () => {
            const src = "  PROGRAM\n  INCLUDE('MyClass.inc')\n  CODE\n";
            const pos = cursorPositionOf(src, 'MyClass.inc');
            // Line index 1 (the INCLUDE line); character index where 'M' starts.
            // Line 1 prefix: `  INCLUDE('` = 11 chars before 'M'.
            assert.strictEqual(pos.line, 1, 'line is 0-based and lands on INCLUDE line');
            assert.strictEqual(pos.character, 11, "character lands on 'M' of MyClass.inc inside quotes");
        });

        test('finds nth occurrence via 1-based occurrence param', () => {
            const src = "  obj.MyMethod()\n  other.MyMethod()\n";
            const pos1 = cursorPositionOf(src, 'MyMethod', 1);
            const pos2 = cursorPositionOf(src, 'MyMethod', 2);
            assert.strictEqual(pos1.line, 0);
            assert.strictEqual(pos2.line, 1);
            assert.notStrictEqual(pos1.character, pos2.character,
                'multi-line second occurrence yields a distinct character offset on its line');
        });

        test('finds multiple occurrences on the same line', () => {
            const src = "  MyMethod() ; MyMethod()\n";
            const pos1 = cursorPositionOf(src, 'MyMethod', 1);
            const pos2 = cursorPositionOf(src, 'MyMethod', 2);
            assert.strictEqual(pos1.line, 0);
            assert.strictEqual(pos2.line, 0);
            assert.ok(pos2.character > pos1.character,
                'second occurrence on same line has greater character offset');
        });

        test('throws on genuine miss (silent off-by-one regression sentinel)', () => {
            const src = "  PROGRAM\n  CODE\n";
            assert.throws(
                () => cursorPositionOf(src, 'NotInSource'),
                /not found/,
                'missing search-string must throw, not silently return Position {0,0}'
            );
        });

        test('throws when requested occurrence exceeds matches', () => {
            const src = "  obj.MyMethod()\n";
            assert.throws(
                () => cursorPositionOf(src, 'MyMethod', 2),
                /occurrence 2.*only 1 matches/,
                'requesting Nth match when only N-1 exist must throw'
            );
        });

        test('rejects occurrence < 1', () => {
            assert.throws(
                () => cursorPositionOf('  CODE\n', 'CODE', 0),
                /occurrence must be >= 1/,
                '0-based occurrence index is rejected'
            );
        });
    });
});
