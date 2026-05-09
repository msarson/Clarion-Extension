import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { RedirectionFileParserServer } from '../solution/redirectionFileParserServer';
import { serverSettings } from '../serverSettings';

/**
 * Failing-pin tests for task `bd7e4a29` — `findFile` walks all entries
 * regardless of active build configuration.
 *
 * `clarionProjectServer.getSearchPaths` (`:381-383`) already filters with
 * `entry.section === "Common" || entry.section === serverSettings.configuration`.
 * `findFile` / `findFileAsync` in `redirectionFileParserServer.ts` does NOT
 * apply that filter — every entry from every section is searched. So a
 * `*.clw = .\debug-only` declared under `[Debug]` is found under a Release
 * build, and vice versa.
 *
 * Per Clarion 11.1 docs (`redirection_file.htm`):
 *   "Redirection lines within a section are only used if the section's
 *    corresponding Project System switches are true (COMMON is always true)."
 *
 * The tests also cover custom build configurations (a developer can add their
 * own to a .sln — `serverSettings.configuration` is free-form and section
 * parsing captures any `[name]` verbatim). Tests 11 and 13 act as canaries:
 * they go RED if the fix hardcodes section names instead of consulting
 * `serverSettings.configuration` at lookup time.
 *
 * Per-test unique tmpdir → static `redFileCache` keys never collide.
 * `serverSettings.libsrcPaths` zeroed in setup so Tier 3 (b8b2d748) cannot
 * accidentally rescue a bug pin.
 */

interface Fixture {
    tmpRoot: string;
    projDir: string;
    binDir: string;
    redFile: string;
}

interface FixtureSpec {
    redContents: string;
    redLocation?: 'global' | 'projectLocal';
    filesAtProj?: string[];
}

function writeFile(root: string, rel: string, contents: string): void {
    const full = path.join(root, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, contents);
}

function buildFixture(spec: FixtureSpec): Fixture {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'red-buildcfg-bd7e4a29-'));
    const projDir = path.join(tmpRoot, 'Proj');
    const binDir = path.join(tmpRoot, 'clarion', 'bin');
    fs.mkdirSync(projDir, { recursive: true });
    fs.mkdirSync(binDir, { recursive: true });

    const redLocation = spec.redLocation ?? 'projectLocal';
    const redFile = redLocation === 'projectLocal'
        ? path.join(projDir, 'Clarion110.red')
        : path.join(binDir, 'Clarion110.red');
    fs.writeFileSync(redFile, spec.redContents);

    for (const rel of spec.filesAtProj ?? []) {
        writeFile(projDir, rel, '! at proj\n');
    }

    return { tmpRoot, projDir, binDir, redFile };
}

function teardownFixture(fix: Fixture | null): void {
    if (!fix) { return; }
    try {
        fs.rmSync(fix.tmpRoot, { recursive: true, force: true });
    } catch { /* best-effort cleanup */ }
}

// Multi-section .red used by tests 1-10
const MULTI_SECTION_RED =
    '[Debug]\n' +
    '*.clw = .\\debug-only\n' +
    '[Release]\n' +
    '*.clw = .\\release-only\n' +
    '[Common]\n' +
    '*.clw = .\\common\n';

// Custom-config .red used by tests 11-14
const CUSTOM_PROFILE_RED =
    '[Profile]\n' +
    '*.clw = .\\profile-only\n';

suite('RedirectionParser.BuildConfigFilter (bd7e4a29)', () => {

    let fixtures: Fixture[] = [];
    let savedRedirectionFile = '';
    let savedRedirectionPaths: string[] = [];
    let savedLibsrcPaths: string[] = [];
    let savedConfiguration = '';

    setup(() => {
        fixtures = [];
        savedRedirectionFile = serverSettings.redirectionFile;
        savedRedirectionPaths = serverSettings.redirectionPaths;
        savedLibsrcPaths = serverSettings.libsrcPaths;
        savedConfiguration = serverSettings.configuration;
        serverSettings.redirectionFile = 'Clarion110.red';
        serverSettings.libsrcPaths = []; // prevent Tier 3 from rescuing a bug pin
    });

    teardown(() => {
        serverSettings.redirectionFile = savedRedirectionFile;
        serverSettings.redirectionPaths = savedRedirectionPaths;
        serverSettings.libsrcPaths = savedLibsrcPaths;
        serverSettings.configuration = savedConfiguration;
        for (const f of fixtures) { teardownFixture(f); }
        fixtures = [];
    });

    function setupCase(spec: FixtureSpec): Fixture {
        const fix = buildFixture(spec);
        fixtures.push(fix);
        serverSettings.redirectionPaths = [fix.binDir];
        return fix;
    }

    // --- (1) sync — Release config, target only in [Debug]'s subdir → null ---
    test("findFile (sync) — Release config skips [Debug] entries; target only in debug-only/ resolves to null", () => {
        serverSettings.configuration = 'Release';
        const fix = setupCase({
            redContents: MULTI_SECTION_RED,
            filesAtProj: [path.join('debug-only', 'Foo.clw')]
        });

        const parser = new RedirectionFileParserServer();
        parser.parseRedFile(fix.projDir);
        const result = parser.findFile('Foo.clw');

        assert.strictEqual(
            result,
            null,
            'expected null (Debug entry should be filtered out under Release config); got ' + JSON.stringify(result)
        );
    });

    // --- (2) async mirror of (1) ---
    test("findFileAsync — Release config skips [Debug] entries; target only in debug-only/ resolves to null", async () => {
        serverSettings.configuration = 'Release';
        const fix = setupCase({
            redContents: MULTI_SECTION_RED,
            filesAtProj: [path.join('debug-only', 'Foo.clw')]
        });

        const parser = new RedirectionFileParserServer();
        await parser.parseRedFileAsync(fix.projDir);
        const result = await parser.findFileAsync('Foo.clw');

        assert.strictEqual(
            result,
            null,
            'expected null (Debug entry should be filtered out under Release config); got ' + JSON.stringify(result)
        );
    });

    // --- (3) sync — Debug config, target only in [Release]'s subdir → null ---
    test("findFile (sync) — Debug config skips [Release] entries; target only in release-only/ resolves to null", () => {
        serverSettings.configuration = 'Debug';
        const fix = setupCase({
            redContents: MULTI_SECTION_RED,
            filesAtProj: [path.join('release-only', 'Foo.clw')]
        });

        const parser = new RedirectionFileParserServer();
        parser.parseRedFile(fix.projDir);
        const result = parser.findFile('Foo.clw');

        assert.strictEqual(
            result,
            null,
            'expected null (Release entry should be filtered out under Debug config); got ' + JSON.stringify(result)
        );
    });

    // --- (4) async mirror of (3) ---
    test("findFileAsync — Debug config skips [Release] entries; target only in release-only/ resolves to null", async () => {
        serverSettings.configuration = 'Debug';
        const fix = setupCase({
            redContents: MULTI_SECTION_RED,
            filesAtProj: [path.join('release-only', 'Foo.clw')]
        });

        const parser = new RedirectionFileParserServer();
        await parser.parseRedFileAsync(fix.projDir);
        const result = await parser.findFileAsync('Foo.clw');

        assert.strictEqual(
            result,
            null,
            'expected null (Release entry should be filtered out under Debug config); got ' + JSON.stringify(result)
        );
    });

    // --- (5) regression — Release with target in release-only/ resolves correctly ---
    test('findFile (sync) — Release config: target in [Release]\'s release-only/ resolves correctly', () => {
        serverSettings.configuration = 'Release';
        const fix = setupCase({
            redContents: MULTI_SECTION_RED,
            filesAtProj: [path.join('release-only', 'Foo.clw')]
        });

        const parser = new RedirectionFileParserServer();
        parser.parseRedFile(fix.projDir);
        const result = parser.findFile('Foo.clw');

        assert.ok(result, 'findFile should resolve Foo.clw via the active [Release] entry');
        assert.strictEqual(
            path.normalize(result!.path),
            path.normalize(path.join(fix.projDir, 'release-only', 'Foo.clw')),
            'expected <projDir>/release-only/Foo.clw, got ' + (result && result.path)
        );
    });

    // --- (6) regression — Release with target in [Common]'s common/ resolves correctly ---
    test('findFile (sync) — Release config: target in [Common]\'s common/ resolves correctly', () => {
        serverSettings.configuration = 'Release';
        const fix = setupCase({
            redContents: MULTI_SECTION_RED,
            filesAtProj: [path.join('common', 'Foo.clw')]
        });

        const parser = new RedirectionFileParserServer();
        parser.parseRedFile(fix.projDir);
        const result = parser.findFile('Foo.clw');

        assert.ok(result, 'findFile should resolve Foo.clw via the always-active [Common] entry');
        assert.strictEqual(
            path.normalize(result!.path),
            path.normalize(path.join(fix.projDir, 'common', 'Foo.clw')),
            'expected <projDir>/common/Foo.clw, got ' + (result && result.path)
        );
    });

    // --- (7) regression — Debug with target in debug-only/ resolves correctly ---
    test('findFile (sync) — Debug config: target in [Debug]\'s debug-only/ resolves correctly', () => {
        serverSettings.configuration = 'Debug';
        const fix = setupCase({
            redContents: MULTI_SECTION_RED,
            filesAtProj: [path.join('debug-only', 'Foo.clw')]
        });

        const parser = new RedirectionFileParserServer();
        parser.parseRedFile(fix.projDir);
        const result = parser.findFile('Foo.clw');

        assert.ok(result, 'findFile should resolve Foo.clw via the active [Debug] entry');
        assert.strictEqual(
            path.normalize(result!.path),
            path.normalize(path.join(fix.projDir, 'debug-only', 'Foo.clw')),
            'expected <projDir>/debug-only/Foo.clw, got ' + (result && result.path)
        );
    });

    // --- (8) regression — Debug with target in [Common]'s common/ resolves correctly ---
    test('findFile (sync) — Debug config: target in [Common]\'s common/ resolves correctly', () => {
        serverSettings.configuration = 'Debug';
        const fix = setupCase({
            redContents: MULTI_SECTION_RED,
            filesAtProj: [path.join('common', 'Foo.clw')]
        });

        const parser = new RedirectionFileParserServer();
        parser.parseRedFile(fix.projDir);
        const result = parser.findFile('Foo.clw');

        assert.ok(result, 'findFile should resolve Foo.clw via the always-active [Common] entry');
        assert.strictEqual(
            path.normalize(result!.path),
            path.normalize(path.join(fix.projDir, 'common', 'Foo.clw')),
            'expected <projDir>/common/Foo.clw, got ' + (result && result.path)
        );
    });

    // --- (9) sync — configurability: parse once, switch config between findFile calls ---
    test('findFile (sync) — same parser instance: switching configuration between calls flips active section', () => {
        const fix = setupCase({
            redContents: MULTI_SECTION_RED,
            filesAtProj: [
                path.join('debug-only', 'Foo.clw'),
                path.join('release-only', 'Foo.clw')
            ]
        });

        const parser = new RedirectionFileParserServer();
        parser.parseRedFile(fix.projDir);

        serverSettings.configuration = 'Debug';
        const r1 = parser.findFile('Foo.clw');
        assert.ok(r1, 'call 1 (Debug) should resolve Foo.clw via [Debug] entry');
        assert.strictEqual(
            path.normalize(r1!.path),
            path.normalize(path.join(fix.projDir, 'debug-only', 'Foo.clw')),
            'call 1 (Debug): expected <projDir>/debug-only/Foo.clw, got ' + (r1 && r1.path)
        );

        serverSettings.configuration = 'Release';
        const r2 = parser.findFile('Foo.clw');
        assert.ok(r2, 'call 2 (Release) should resolve Foo.clw via [Release] entry');
        assert.strictEqual(
            path.normalize(r2!.path),
            path.normalize(path.join(fix.projDir, 'release-only', 'Foo.clw')),
            'call 2 (Release): expected <projDir>/release-only/Foo.clw, got ' + (r2 && r2.path) +
            ' — config switch is not flipping the active section (filter is parse-time, hardcoded, or absent)'
        );
    });

    // --- (10) async mirror of (9) ---
    test('findFileAsync — same parser instance: switching configuration between calls flips active section', async () => {
        const fix = setupCase({
            redContents: MULTI_SECTION_RED,
            filesAtProj: [
                path.join('debug-only', 'Foo.clw'),
                path.join('release-only', 'Foo.clw')
            ]
        });

        const parser = new RedirectionFileParserServer();
        await parser.parseRedFileAsync(fix.projDir);

        serverSettings.configuration = 'Debug';
        const r1 = await parser.findFileAsync('Foo.clw');
        assert.ok(r1, 'call 1 (Debug) should resolve Foo.clw via [Debug] entry');
        assert.strictEqual(
            path.normalize(r1!.path),
            path.normalize(path.join(fix.projDir, 'debug-only', 'Foo.clw')),
            'call 1 (Debug): expected <projDir>/debug-only/Foo.clw, got ' + (r1 && r1.path)
        );

        serverSettings.configuration = 'Release';
        const r2 = await parser.findFileAsync('Foo.clw');
        assert.ok(r2, 'call 2 (Release) should resolve Foo.clw via [Release] entry');
        assert.strictEqual(
            path.normalize(r2!.path),
            path.normalize(path.join(fix.projDir, 'release-only', 'Foo.clw')),
            'call 2 (Release): expected <projDir>/release-only/Foo.clw, got ' + (r2 && r2.path) +
            ' — config switch is not flipping the active section (filter is parse-time, hardcoded, or absent)'
        );
    });

    // --- (11) hardcoding canary — sync: custom-config-active findability ---
    test('findFile (sync) — hardcoding canary: custom config [Profile] active resolves [Profile] entry', () => {
        serverSettings.configuration = 'Profile';
        const fix = setupCase({
            redContents: CUSTOM_PROFILE_RED,
            filesAtProj: [path.join('profile-only', 'Foo.clw')]
        });

        const parser = new RedirectionFileParserServer();
        parser.parseRedFile(fix.projDir);
        const result = parser.findFile('Foo.clw');

        assert.ok(result, 'findFile should resolve Foo.clw via the active [Profile] entry; ' +
            'returning null suggests the filter hardcodes section names instead of consulting serverSettings.configuration');
        assert.strictEqual(
            path.normalize(result!.path),
            path.normalize(path.join(fix.projDir, 'profile-only', 'Foo.clw')),
            'expected <projDir>/profile-only/Foo.clw, got ' + (result && result.path)
        );
    });

    // --- (12) sync — custom-config-inactive non-findability ---
    test('findFile (sync) — Release config skips [Profile] entries; target only in profile-only/ resolves to null', () => {
        serverSettings.configuration = 'Release';
        const fix = setupCase({
            redContents: CUSTOM_PROFILE_RED,
            filesAtProj: [path.join('profile-only', 'Foo.clw')]
        });

        const parser = new RedirectionFileParserServer();
        parser.parseRedFile(fix.projDir);
        const result = parser.findFile('Foo.clw');

        assert.strictEqual(
            result,
            null,
            'expected null ([Profile] entry should be filtered out under Release config); got ' + JSON.stringify(result)
        );
    });

    // --- (13) async mirror of (11) ---
    test('findFileAsync — hardcoding canary: custom config [Profile] active resolves [Profile] entry', async () => {
        serverSettings.configuration = 'Profile';
        const fix = setupCase({
            redContents: CUSTOM_PROFILE_RED,
            filesAtProj: [path.join('profile-only', 'Foo.clw')]
        });

        const parser = new RedirectionFileParserServer();
        await parser.parseRedFileAsync(fix.projDir);
        const result = await parser.findFileAsync('Foo.clw');

        assert.ok(result, 'findFileAsync should resolve Foo.clw via the active [Profile] entry; ' +
            'returning null suggests the filter hardcodes section names instead of consulting serverSettings.configuration');
        assert.strictEqual(
            path.normalize(result!.path),
            path.normalize(path.join(fix.projDir, 'profile-only', 'Foo.clw')),
            'expected <projDir>/profile-only/Foo.clw, got ' + (result && result.path)
        );
    });

    // --- (14) async mirror of (12) ---
    test('findFileAsync — Release config skips [Profile] entries; target only in profile-only/ resolves to null', async () => {
        serverSettings.configuration = 'Release';
        const fix = setupCase({
            redContents: CUSTOM_PROFILE_RED,
            filesAtProj: [path.join('profile-only', 'Foo.clw')]
        });

        const parser = new RedirectionFileParserServer();
        await parser.parseRedFileAsync(fix.projDir);
        const result = await parser.findFileAsync('Foo.clw');

        assert.strictEqual(
            result,
            null,
            'expected null ([Profile] entry should be filtered out under Release config); got ' + JSON.stringify(result)
        );
    });
});
