import * as assert from 'assert';
import { PathUtils } from '../PathUtils';

/**
 * #263 — solution activation never completed for slow-loading solutions.
 *
 * The server's `clarion/solutionReady` notification carried the solution DIRECTORY
 * (projectPaths[0]) while the client compared it against the full `.sln` file path
 * with a strict `!==` — so every notification was rejected as "stale" and the
 * deferred-activation path (markActivationComplete / refreshOpenDocuments) never ran.
 *
 * Fix: the server sends the actual solution FILE path, and the client compares via
 * PathUtils.equalPath (normalized, case-insensitive). These tests pin the comparison
 * semantics the SolutionInitializer handler now relies on. (First adoption of
 * PathUtils per #266 — it previously had no callers and no tests.)
 */
suite('PathUtils — clarion/solutionReady path comparison (#263)', () => {

    test('solution DIRECTORY does not match the solution FILE path (the #263 repro shape)', () => {
        // If the server regresses to sending the directory again, the client must
        // still treat it as a mismatch — this pins that the FILE path is required.
        assert.strictEqual(
            PathUtils.equalPath('F:\\Dev\\MyApp', 'F:\\Dev\\MyApp\\MyApp.sln'),
            false
        );
    });

    test('same .sln path with different drive-letter/segment case matches (Windows)', () => {
        // The old strict !== rejected exactly this spelling drift.
        assert.strictEqual(
            PathUtils.equalPath('F:\\DEV\\MyApp\\MYAPP.SLN', 'f:\\dev\\myapp\\myapp.sln'),
            true
        );
    });

    test('forward-slash vs backslash spellings of the same .sln match', () => {
        assert.strictEqual(
            PathUtils.equalPath('F:/Dev/MyApp/MyApp.sln', 'F:\\Dev\\MyApp\\MyApp.sln'),
            true
        );
    });

    test('identical paths match', () => {
        assert.strictEqual(
            PathUtils.equalPath('F:\\Dev\\MyApp\\MyApp.sln', 'F:\\Dev\\MyApp\\MyApp.sln'),
            true
        );
    });

    test('trailing slash on a directory still does not make it match the file', () => {
        assert.strictEqual(
            PathUtils.equalPath('F:\\Dev\\MyApp\\', 'F:\\Dev\\MyApp\\MyApp.sln'),
            false
        );
    });

    test('empty/missing sides never match (no accidental activation on blank payload)', () => {
        assert.strictEqual(PathUtils.equalPath('', 'F:\\Dev\\MyApp\\MyApp.sln'), false);
        assert.strictEqual(PathUtils.equalPath('F:\\Dev\\MyApp\\MyApp.sln', ''), false);
        assert.strictEqual(PathUtils.equalPath('', ''), false);
    });
});

/**
 * #266 — normalizeForKey is now the key discipline for findSourceInProject's
 * exact/relative path strategies and every path-keyed cache/comparison the
 * batch converted. These pin the key-equality semantics those sites rely on.
 */
suite('PathUtils — normalizeForKey key discipline (#266)', () => {

    test('separator and case variants of one file produce the SAME key', () => {
        const a = PathUtils.normalizeForKey('F:/Dev/MyApp/main.clw');
        const b = PathUtils.normalizeForKey('f:\\DEV\\myapp\\MAIN.CLW');
        assert.ok(a.length > 0, 'key must not be empty');
        assert.strictEqual(a, b);
    });

    test('trailing slashes are stripped from directory keys', () => {
        assert.strictEqual(
            PathUtils.normalizeForKey('F:\\Dev\\MyApp\\'),
            PathUtils.normalizeForKey('F:\\Dev\\MyApp')
        );
    });

    test('a relative path resolves against the provided base', () => {
        assert.strictEqual(
            PathUtils.normalizeForKey('src\\main.clw', 'F:\\Dev\\MyApp'),
            PathUtils.normalizeForKey('F:\\Dev\\MyApp\\src\\main.clw')
        );
    });

    test('a relative path WITHOUT a base returns empty (cannot be keyed)', () => {
        assert.strictEqual(PathUtils.normalizeForKey('src\\main.clw'), '');
    });

    test('dot segments normalize into the same key', () => {
        assert.strictEqual(
            PathUtils.normalizeForKey('F:\\Dev\\MyApp\\sub\\..\\main.clw'),
            PathUtils.normalizeForKey('F:\\Dev\\MyApp\\main.clw')
        );
    });
});
