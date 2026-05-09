import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { RedirectionFileParserServer } from '../solution/redirectionFileParserServer';
import { serverSettings } from '../serverSettings';

/**
 * Regression guard for task `9e580d19` — removing the now-redundant
 * libsrc fallback from `solutionManager.getEquatesTokens` (lines 364-370).
 *
 * Background: post-b8b2d748, `findFile` walks `serverSettings.libsrcPaths`
 * as Tier 3. The hand-rolled libsrc walk inside `getEquatesTokens` is now
 * strictly redundant — if `findFile('equates.clw')` returns null, the
 * duplicate walk also returns null; if `findFile` would find via libsrc,
 * it already did so before returning.
 *
 * These tests prove that all three equates.clw resolution scenarios still
 * GREEN through `RedirectionFileParserServer.findFile` directly. Post-fix,
 * `getEquatesTokens` reduces to `for project: findFile('equates.clw')` —
 * if the parser resolves correctly in all three scenarios, the post-fix
 * code cannot break for the same scenarios.
 *
 * Audit follow-up A from the 8c874d32 file-finding audit
 * (`docs/audits/file-finding-audit-2026-05-09.md`).
 *
 * No bug pins — all tests should be GREEN both before AND after the fix.
 * Per-test unique tmpdir → static `redFileCache` keys never collide.
 */

interface Fixture {
    tmpRoot: string;
    projDir: string;
    binDir: string;
    libDir: string;
    redFile: string | null;
}

interface FixtureSpec {
    redContents?: string;
    redLocation?: 'global' | 'projectLocal' | 'none';
    equatesAtProj?: boolean;
    equatesAtLib?: boolean;
}

function buildFixture(spec: FixtureSpec): Fixture {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'red-equates-9e580d19-'));
    const projDir = path.join(tmpRoot, 'Proj');
    const binDir = path.join(tmpRoot, 'clarion', 'bin');
    const libDir = path.join(tmpRoot, 'libsrc');
    fs.mkdirSync(projDir, { recursive: true });
    fs.mkdirSync(binDir, { recursive: true });
    fs.mkdirSync(libDir, { recursive: true });

    const redLocation = spec.redLocation ?? 'projectLocal';
    let redFile: string | null = null;
    if (redLocation !== 'none') {
        redFile = redLocation === 'projectLocal'
            ? path.join(projDir, 'Clarion110.red')
            : path.join(binDir, 'Clarion110.red');
        fs.writeFileSync(redFile, spec.redContents ?? '[Common]\n*.clw = .\n');
    }

    if (spec.equatesAtProj) {
        fs.writeFileSync(path.join(projDir, 'equates.clw'), '! equates at proj\n');
    }
    if (spec.equatesAtLib) {
        fs.writeFileSync(path.join(libDir, 'equates.clw'), '! equates at libsrc\n');
    }

    return { tmpRoot, projDir, binDir, libDir, redFile };
}

function teardownFixture(fix: Fixture | null): void {
    if (!fix) { return; }
    try {
        fs.rmSync(fix.tmpRoot, { recursive: true, force: true });
    } catch { /* best-effort cleanup */ }
}

suite('RedirectionParser.EquatesResolution (9e580d19)', () => {

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

    function track(fix: Fixture): Fixture {
        fixtures.push(fix);
        serverSettings.redirectionPaths = [fix.binDir];
        return fix;
    }

    // --- (1) project-local .red — equates.clw resolves via project dir ---
    test('findFile (sync) — equates.clw resolves via project-local .red (Layer 1/2)', () => {
        const fix = track(buildFixture({
            redLocation: 'projectLocal',
            redContents: '[Common]\n*.clw = .\n',
            equatesAtProj: true
        }));
        serverSettings.libsrcPaths = []; // not needed for this scenario

        const parser = new RedirectionFileParserServer();
        parser.parseRedFile(fix.projDir);
        const result = parser.findFile('equates.clw');

        assert.ok(result, 'findFile should resolve equates.clw via project-local red');
        assert.strictEqual(
            path.normalize(result!.path),
            path.normalize(path.join(fix.projDir, 'equates.clw')),
            'expected <projDir>/equates.clw, got ' + (result && result.path)
        );
    });

    // --- (2) libsrc Tier 3 — equates.clw resolves via libsrcPaths fallback ---
    test('findFile (sync) — equates.clw resolves via libsrc Tier 3 when RED+project miss', () => {
        const fix = track(buildFixture({
            // Global .red with no *.clw entry — neither RED Layer 1 nor synthetic
            // Layer 2 catch-all (empty projDir) finds equates.clw. Falls through
            // to Tier 3 libsrc walk (added in b8b2d748).
            redLocation: 'global',
            redContents: '[Common]\n*.obj = .\n',
            equatesAtLib: true
            // equates.clw NOT in projDir
        }));
        serverSettings.libsrcPaths = [fix.libDir];

        const parser = new RedirectionFileParserServer();
        parser.parseRedFile(fix.projDir);
        const result = parser.findFile('equates.clw');

        assert.ok(result, 'findFile should fall back to libsrc Tier 3 for equates.clw');
        assert.strictEqual(
            path.normalize(result!.path),
            path.normalize(path.join(fix.libDir, 'equates.clw')),
            'expected <libDir>/equates.clw, got ' + (result && result.path) +
            ' — libsrc Tier 3 fallback not engaged'
        );
    });

    // --- (3) nowhere — equates.clw not in any layer returns null ---
    test('findFile (sync) — equates.clw not in any layer returns null', () => {
        const fix = track(buildFixture({
            redLocation: 'global',
            redContents: '[Common]\n*.obj = .\n'
            // No equates.clw anywhere
        }));
        serverSettings.libsrcPaths = [fix.libDir]; // libsrc dir exists but doesn't contain equates.clw

        const parser = new RedirectionFileParserServer();
        parser.parseRedFile(fix.projDir);
        const result = parser.findFile('equates.clw');

        assert.strictEqual(
            result,
            null,
            'findFile should return null when equates.clw exists nowhere; got ' + JSON.stringify(result)
        );
    });
});
