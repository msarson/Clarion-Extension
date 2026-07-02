import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { RedirectionFileParserServer } from '../solution/redirectionFileParserServer';
import { serverSettings } from '../serverSettings';

/**
 * Failing-pin tests for task `b8b2d748` (redirection-parser bug stack, Layer 3).
 *
 * Per Mark's canonical resolution model, `findFile` should walk:
 *   1. RED file paths  (already covered post-01d635ef)
 *   2. PROJECT dir     (covered via the synthetic `.` catch-all post-01d635ef)
 *   3. LIBSRC paths    (from `<libsrc>` in ClarionProperties.xml — populated
 *                       into `serverSettings.libsrcPaths` by the client at
 *                       `server.ts:1035`)
 *
 * Layer 3 is currently NOT consulted by `findFile` /
 * `findFileAsync` in `redirectionFileParserServer.ts`. Hand-rolled fallbacks
 * exist in `solutionManager.ts:364-372`, `StructureDeclarationIndexer.ts:279-280`,
 * `ReferencesProvider.ts:356`, `RenameProvider.ts:222` — but callers without a
 * fallback (e.g. plain `findFile` consumers) miss the libsrc layer entirely.
 *
 * Fixture skeleton (per-test unique tmpdir → static redFileCache keys never
 * collide):
 *   <tmp>/Proj/                   project dir
 *   <tmp>/clarion/bin/Clarion110.red   global fallback red
 *   <tmp>/lib1/                   first libsrc path (often empty)
 *   <tmp>/lib2/                   second libsrc path (often holds Target.clw)
 *
 * Assertions check `result.path` only — `result.source` is intentionally
 * not asserted, since Alice may add a `LibSrc` enum value as part of her
 * fix (per Bob's b8b2d748 brief).
 */

interface Fixture {
    tmpRoot: string;
    projDir: string;
    binDir: string;
    redFile: string;
    lib1: string;
    lib2: string;
}

interface FixtureSpec {
    redContents: string;
    filesAtProj?: string[];
    filesAtLib1?: string[];
    filesAtLib2?: string[];
}

function buildFixture(spec: FixtureSpec): Fixture {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'red-libsrc-b8b2d748-'));
    const projDir = path.join(tmpRoot, 'Proj');
    const binDir = path.join(tmpRoot, 'clarion', 'bin');
    const redFile = path.join(binDir, 'Clarion110.red');
    const lib1 = path.join(tmpRoot, 'lib1');
    const lib2 = path.join(tmpRoot, 'lib2');

    fs.mkdirSync(projDir, { recursive: true });
    fs.mkdirSync(binDir, { recursive: true });
    fs.mkdirSync(lib1, { recursive: true });
    fs.mkdirSync(lib2, { recursive: true });

    fs.writeFileSync(redFile, spec.redContents);
    for (const f of spec.filesAtProj ?? []) {
        fs.writeFileSync(path.join(projDir, f), '! at proj\n');
    }
    for (const f of spec.filesAtLib1 ?? []) {
        fs.writeFileSync(path.join(lib1, f), '! at lib1\n');
    }
    for (const f of spec.filesAtLib2 ?? []) {
        fs.writeFileSync(path.join(lib2, f), '! at lib2\n');
    }

    return { tmpRoot, projDir, binDir, redFile, lib1, lib2 };
}

function teardownFixture(fix: Fixture | null): void {
    if (!fix) { return; }
    try {
        fs.rmSync(fix.tmpRoot, { recursive: true, force: true });
    } catch { /* best-effort cleanup */ }
}

suite('RedirectionParser.LibsrcFallback (b8b2d748)', () => {

    let fixtures: Fixture[] = [];
    let savedRedirectionFile = '';
    let savedRedirectionPaths: string[] = [];
    let savedLibsrcPaths: string[] = [];

    setup(() => {
        fixtures = [];
        savedRedirectionFile = serverSettings.redirectionFile;
        savedRedirectionPaths = serverSettings.redirectionPaths;
        savedLibsrcPaths = serverSettings.libsrcPaths;
        serverSettings.redirectionFile = 'Clarion110.red';
    });

    teardown(() => {
        serverSettings.redirectionFile = savedRedirectionFile;
        serverSettings.redirectionPaths = savedRedirectionPaths;
        serverSettings.libsrcPaths = savedLibsrcPaths;
        for (const f of fixtures) { teardownFixture(f); }
        fixtures = [];
    });

    /**
     * Helper: builds the fixture, registers cleanup, points serverSettings at
     * its bin/lib paths.
     */
    function setupCase(spec: FixtureSpec): Fixture {
        const fix = buildFixture(spec);
        fixtures.push(fix);
        serverSettings.redirectionPaths = [fix.binDir];
        serverSettings.libsrcPaths = [fix.lib1, fix.lib2];
        return fix;
    }

    // --- (1) Sync libsrc-fallback bug pin ---
    test("findFile (sync) — falls back to libsrcPaths when RED+project don't resolve", () => {
        const fix = setupCase({
            redContents: '[Common]\n*.obj = .\n',
            filesAtLib2: ['Target.clw']
        });

        const parser = new RedirectionFileParserServer();
        parser.parseRedFile(fix.projDir);
        const result = parser.findFile('Target.clw');

        assert.ok(result, 'findFile should fall back to libsrcPaths after RED+project miss');
        assert.strictEqual(
            path.normalize(result!.path),
            path.normalize(path.join(fix.lib2, 'Target.clw')),
            'expected libsrc resolution to <lib2>/Target.clw, got ' + (result && result.path)
        );
    });

    // --- (2) Async mirror of (1) ---
    test("findFileAsync — falls back to libsrcPaths when RED+project don't resolve", async () => {
        const fix = setupCase({
            redContents: '[Common]\n*.obj = .\n',
            filesAtLib2: ['Target.clw']
        });

        const parser = new RedirectionFileParserServer();
        await parser.parseRedFileAsync(fix.projDir);
        const result = await parser.findFileAsync('Target.clw');

        assert.ok(result, 'findFileAsync should fall back to libsrcPaths after RED+project miss');
        assert.strictEqual(
            path.normalize(result!.path),
            path.normalize(path.join(fix.lib2, 'Target.clw')),
            'expected libsrc resolution to <lib2>/Target.clw, got ' + (result && result.path)
        );
    });

    // --- (3) Priority guard: RED+project beat libsrc ---
    test("findFile (sync) — priority: project (via '.' in red) wins over libsrc", () => {
        const fix = setupCase({
            redContents: '[Common]\n*.clw = .\n',
            filesAtProj: ['Target.clw'],
            filesAtLib2: ['Target.clw']
        });

        const parser = new RedirectionFileParserServer();
        parser.parseRedFile(fix.projDir);
        const result = parser.findFile('Target.clw');

        assert.ok(result, 'findFile should resolve Target.clw');
        assert.strictEqual(
            path.normalize(result!.path),
            path.normalize(path.join(fix.projDir, 'Target.clw')),
            'expected project copy (Layer 1/2) to win over libsrc (Layer 3); got ' + (result && result.path)
        );
    });

    // --- (4) Async mirror of (3) ---
    test("findFileAsync — priority: project (via '.' in red) wins over libsrc", async () => {
        const fix = setupCase({
            redContents: '[Common]\n*.clw = .\n',
            filesAtProj: ['Target.clw'],
            filesAtLib2: ['Target.clw']
        });

        const parser = new RedirectionFileParserServer();
        await parser.parseRedFileAsync(fix.projDir);
        const result = await parser.findFileAsync('Target.clw');

        assert.ok(result, 'findFileAsync should resolve Target.clw');
        assert.strictEqual(
            path.normalize(result!.path),
            path.normalize(path.join(fix.projDir, 'Target.clw')),
            'expected project copy (Layer 1/2) to win over libsrc (Layer 3); got ' + (result && result.path)
        );
    });

    // --- (5) Multiple libsrc paths walked ---
    test('findFile (sync) — multiple libsrc paths walked; resolves to second when first is empty', () => {
        const fix = setupCase({
            redContents: '[Common]\n*.obj = .\n',
            filesAtLib2: ['Target.clw']
            // lib1 intentionally empty
        });

        const parser = new RedirectionFileParserServer();
        parser.parseRedFile(fix.projDir);
        const result = parser.findFile('Target.clw');

        assert.ok(result, 'findFile should walk lib1 then lib2 and resolve to lib2 copy');
        assert.strictEqual(
            path.normalize(result!.path),
            path.normalize(path.join(fix.lib2, 'Target.clw')),
            'expected resolution to <lib2>/Target.clw, got ' + (result && result.path)
        );
    });

    // --- (6) Nothing anywhere → null (regression guard) ---
    test('findFile (sync) — nothing anywhere returns null (no over-eager libsrc probe)', () => {
        const fix = setupCase({
            redContents: '[Common]\n*.obj = .\n'
            // No Target.clw anywhere — proj, lib1, lib2 all empty of it
        });

        const parser = new RedirectionFileParserServer();
        parser.parseRedFile(fix.projDir);
        const result = parser.findFile('Target.clw');

        assert.strictEqual(
            result,
            null,
            'findFile should return null when target exists nowhere; got ' + JSON.stringify(result)
        );
    });
});
