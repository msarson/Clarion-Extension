import * as assert from 'assert';
import * as path from 'path';
import { resolveFileInNoSolutionMode } from '../solution/findFileNoSolution';
import {
    NoSolutionFixture,
    buildNoSolutionFixture,
    teardownNoSolutionFixture
} from './helpers/NoSolutionFixture';

/**
 * End-to-end resolver tests for `clarion/findFile` no-solution mode
 * (#113 / 403afd0e items [0]+[1] — Eve's server-side commit f74e450,
 * refactored to a callable function in 7ce... — landed alongside Alice's
 * client passthrough b32e6ce + 807a468 + fixture scaffold 9015be5).
 *
 * Pin shape per `feedback_bidirectional_pin_assertion`:
 *   - POSITIVE: right result IS in the resolution (source label + filename
 *     basename match expectations)
 *   - NEGATIVE: wrong result is NOT silently masquerading as a hit (asserting
 *     `result.path !== ""` separately would be weaker — we instead pin the
 *     basename so a libsrc walk picking up a same-named file from the wrong
 *     dir would fail the test)
 *
 * Reach: invokes the resolver directly (not via LSP plumbing), since the
 * fixture sets `SolutionManager.instance = null` + monkey-patches
 * `serverSettings.libsrcPaths`, which is exactly the precondition the
 * resolver reads. LSP-level integration (hover / Go-to-Def / DocumentLink)
 * is covered by Alice's item [5] integration tests.
 */

suite('FindFile.NoSolutionResolution (#113 / 403afd0e end-to-end)', () => {

    let fix: NoSolutionFixture | null = null;

    teardown(() => {
        teardownNoSolutionFixture(fix);
        fix = null;
    });

    // ---- localDir tier ----

    test('localDir hit — sibling of source file resolves with source="local"', () => {
        fix = buildNoSolutionFixture({
            libsrcs: [],
            sourceFile: {
                filename: 'MyProg.clw',
                content: '  PROGRAM\n  INCLUDE("shared.inc")\n  CODE\n',
                siblings: { 'shared.inc': '! shared body\n' }
            }
        });

        const result = resolveFileInNoSolutionMode('shared.inc', fix.sourceUri ?? undefined);

        assert.ok(result, 'sibling .inc must resolve');
        assert.strictEqual(result!.source, 'local',
            'source label must be "local" for sibling-of-source hits');
        assert.strictEqual(path.basename(result!.path).toLowerCase(), 'shared.inc',
            'resolved file basename must match requested filename');
    });

    // ---- libsrcPaths tier ----

    test('libsrcPaths hit — file in libsrc dir resolves with source="libsrc"', () => {
        fix = buildNoSolutionFixture({
            libsrcs: [
                { 'StringTheory.inc': '! string theory body\n' }
            ],
            sourceFile: {
                filename: 'MyProg.clw',
                content: '!'
            }
        });

        const result = resolveFileInNoSolutionMode('StringTheory.inc', fix.sourceUri ?? undefined);

        assert.ok(result, 'file in libsrc must resolve');
        assert.strictEqual(result!.source, 'libsrc',
            'source label must be "libsrc" for libsrcPaths-tier hits');
        assert.strictEqual(path.basename(result!.path).toLowerCase(), 'stringtheory.inc',
            'resolved file basename must match requested filename');
        assert.ok(
            path.normalize(result!.path).toLowerCase().startsWith(path.normalize(fix.libsrcDirs[0]).toLowerCase()),
            'resolved path must be inside the libsrc1 directory, not elsewhere'
        );
    });

    // ---- precedence ----

    test('localDir wins over libsrcPaths when same filename exists in both', () => {
        fix = buildNoSolutionFixture({
            libsrcs: [
                { 'shared.inc': '! libsrc version\n' }
            ],
            sourceFile: {
                filename: 'MyProg.clw',
                content: '!',
                siblings: { 'shared.inc': '! local version\n' }
            }
        });

        const result = resolveFileInNoSolutionMode('shared.inc', fix.sourceUri ?? undefined);

        assert.ok(result, 'precedence-tied filename must resolve');
        assert.strictEqual(result!.source, 'local',
            'localDir must win — source must be "local", not "libsrc"');
        assert.ok(fix.sourceDir, 'fixture sourceDir must be populated for this assertion');
        assert.strictEqual(
            path.normalize(result!.path).toLowerCase(),
            path.normalize(path.join(fix.sourceDir!, 'shared.inc')).toLowerCase(),
            'resolved path must be the sibling under sourceDir, not the libsrc copy'
        );
    });

    // ---- walk order ----

    test('libsrc walk order — file in libsrc2 resolves correctly when libsrc1 is empty', () => {
        fix = buildNoSolutionFixture({
            libsrcs: [
                {}, // libsrc1 empty
                { 'Helper.clw': '! helper body\n' }
            ]
        });

        const result = resolveFileInNoSolutionMode('Helper.clw', undefined);

        assert.ok(result, 'file must resolve via libsrc2');
        assert.strictEqual(result!.source, 'libsrc');
        assert.strictEqual(path.basename(result!.path).toLowerCase(), 'helper.clw');
        assert.ok(
            path.normalize(result!.path).toLowerCase().startsWith(path.normalize(fix.libsrcDirs[1]).toLowerCase()),
            'resolved path must be inside libsrc2'
        );
    });

    // ---- extension fallback ----

    test('extension fallback hit — filename without ext finds .clw in libsrc', () => {
        fix = buildNoSolutionFixture({
            libsrcs: [
                { 'Foo.clw': '! foo body\n' }
            ]
        });

        // Requesting `Foo` without extension — extension fallback retries with .clw / .inc / etc.
        const result = resolveFileInNoSolutionMode('Foo', undefined);

        assert.ok(result, 'extensionless filename must resolve via fallback');
        assert.strictEqual(result!.source, 'libsrc');
        assert.strictEqual(path.basename(result!.path).toLowerCase(), 'foo.clw',
            'extension fallback must find Foo.clw, not skip it');
    });

    test('extension fallback NOT triggered when filename already has extension', () => {
        // `Foo.inc` requested but only `Foo.clw` exists — resolver must NOT try `Foo.inc.clw`.
        fix = buildNoSolutionFixture({
            libsrcs: [
                { 'Foo.clw': '! only the .clw exists\n' }
            ]
        });

        const result = resolveFileInNoSolutionMode('Foo.inc', undefined);

        assert.strictEqual(result, null,
            'filename with explicit extension must NOT trigger fallback; miss returns null');
    });

    // ---- misses ----

    test('genuine miss — file not in source dir or any libsrc → null', () => {
        fix = buildNoSolutionFixture({
            libsrcs: [
                { 'OtherFile.inc': '!' }
            ],
            sourceFile: {
                filename: 'MyProg.clw',
                content: '!',
                siblings: { 'AnotherSibling.inc': '!' }
            }
        });

        const result = resolveFileInNoSolutionMode('Missing.inc', fix.sourceUri ?? undefined);

        assert.strictEqual(result, null,
            'file absent everywhere must return null (caller emits silent-miss warn)');
    });

    test('empty libsrcPaths + no sourceUri → null (silent-miss surface — reproduces failure mode)', () => {
        fix = buildNoSolutionFixture({
            libsrcs: []
        });

        const result = resolveFileInNoSolutionMode('Anything.inc', undefined);

        assert.strictEqual(result, null,
            'no libsrc and no sourceUri = nothing to walk = null (caller logs warn diagnostic)');
    });

    test('empty libsrcPaths + sourceUri provided → resolves local sibling, libsrc walk is a no-op', () => {
        fix = buildNoSolutionFixture({
            libsrcs: [],
            sourceFile: {
                filename: 'MyProg.clw',
                content: '!',
                siblings: { 'sibling.inc': '!' }
            }
        });

        const result = resolveFileInNoSolutionMode('sibling.inc', fix.sourceUri ?? undefined);

        assert.ok(result, 'localDir tier must work even when libsrcPaths is empty');
        assert.strictEqual(result!.source, 'local');
        assert.strictEqual(path.basename(result!.path).toLowerCase(), 'sibling.inc');
    });
});
