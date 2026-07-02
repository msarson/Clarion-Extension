import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { RedirectionFileParserServer } from '../solution/redirectionFileParserServer';
import { serverSettings } from '../serverSettings';

/**
 * Failing-pin tests for task `cfaa7584` — Layer 1 follow-up to 01d635ef.
 *
 * 01d635ef fixed the bare `.`/`..` branch in `findFile` / `findFileAsync`
 * (and the synthetic `*.*` catch-all) so they anchor on the project dir.
 * The OTHER relative-path branch (`!path.isAbsolute(dir)` — for strings
 * like `.\classes` or `.\SharedCode\equates`) was intentionally left
 * untouched in 01d635ef per Bob's minimal-green brief; sync `:497-502`,
 * async `:594-599` still anchors those on `path.dirname(entry.redFile)`.
 *
 * Bug shape: developer-modified global `.red` containing entries like
 * `*.clw = .\classes` resolves the relative segment against the .red
 * file's own dir (e.g. `<ClarionRoot>\bin`), not the project dir. Project
 * sources at `<ProjDir>\classes\Foo.clw` go undiscovered.
 *
 * Masked under project-local .red (project-local sits in projDir →
 * `path.dirname(entry.redFile) == projectPath` by accident).
 *
 * Decoy pattern (carry-over from 01d635ef): for global-.red bug pins
 * the target file exists in BOTH `<projDir>/<rel>/Foo.clw` and
 * `<binDir>/<rel>/Foo.clw`. Current code resolves to the bin-side decoy,
 * proving the resolution went to the wrong base. Post-fix it should
 * resolve to the projDir copy.
 *
 * Per-test unique tmpdir → static `redFileCache` keys never collide.
 * `serverSettings.libsrcPaths` is zeroed in setup so Tier 3 (added in
 * b8b2d748) can't accidentally rescue a bug pin via an overlapping path.
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
    filesAtBin?: string[];
}

function writeFile(root: string, rel: string, contents: string): void {
    const full = path.join(root, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, contents);
}

function buildFixture(spec: FixtureSpec): Fixture {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'red-other-rel-cfaa7584-'));
    const projDir = path.join(tmpRoot, 'Proj');
    const binDir = path.join(tmpRoot, 'clarion', 'bin');
    fs.mkdirSync(projDir, { recursive: true });
    fs.mkdirSync(binDir, { recursive: true });

    const redLocation = spec.redLocation ?? 'global';
    const redFile = redLocation === 'projectLocal'
        ? path.join(projDir, 'Clarion110.red')
        : path.join(binDir, 'Clarion110.red');
    fs.writeFileSync(redFile, spec.redContents);

    for (const rel of spec.filesAtProj ?? []) {
        writeFile(projDir, rel, '! at proj\n');
    }
    for (const rel of spec.filesAtBin ?? []) {
        writeFile(binDir, rel, '! at bin (decoy)\n');
    }

    return { tmpRoot, projDir, binDir, redFile };
}

function teardownFixture(fix: Fixture | null): void {
    if (!fix) { return; }
    try {
        fs.rmSync(fix.tmpRoot, { recursive: true, force: true });
    } catch { /* best-effort cleanup */ }
}

suite('RedirectionParser.OtherRelativePaths (cfaa7584)', () => {

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
        serverSettings.libsrcPaths = []; // prevent Tier 3 from rescuing a bug pin
    });

    teardown(() => {
        serverSettings.redirectionFile = savedRedirectionFile;
        serverSettings.redirectionPaths = savedRedirectionPaths;
        serverSettings.libsrcPaths = savedLibsrcPaths;
        for (const f of fixtures) { teardownFixture(f); }
        fixtures = [];
    });

    function setupCase(spec: FixtureSpec): Fixture {
        const fix = buildFixture(spec);
        fixtures.push(fix);
        serverSettings.redirectionPaths = [fix.binDir];
        return fix;
    }

    // --- (1) sync `.\classes` under global .red ---
    test("findFile (sync) — '.\\\\classes' should resolve to <projDir>/classes, not <binDir>/classes", () => {
        const fix = setupCase({
            redContents: '[Common]\n*.clw = .\\classes\n',
            filesAtProj: [path.join('classes', 'Foo.clw')],
            filesAtBin: [path.join('classes', 'Foo.clw')] // decoy
        });

        const parser = new RedirectionFileParserServer();
        parser.parseRedFile(fix.projDir);
        const result = parser.findFile('Foo.clw');

        assert.ok(result, 'findFile should resolve Foo.clw via *.clw = .\\classes');
        assert.strictEqual(
            path.normalize(result!.path),
            path.normalize(path.join(fix.projDir, 'classes', 'Foo.clw')),
            'expected resolution to <projDir>/classes/Foo.clw, got ' + (result && result.path) +
            " — '.\\classes' is being resolved against the .red file's dir instead of the project dir"
        );
    });

    // --- (2) async mirror of (1) ---
    test("findFileAsync — '.\\\\classes' should resolve to <projDir>/classes, not <binDir>/classes", async () => {
        const fix = setupCase({
            redContents: '[Common]\n*.clw = .\\classes\n',
            filesAtProj: [path.join('classes', 'Foo.clw')],
            filesAtBin: [path.join('classes', 'Foo.clw')]
        });

        const parser = new RedirectionFileParserServer();
        await parser.parseRedFileAsync(fix.projDir);
        const result = await parser.findFileAsync('Foo.clw');

        assert.ok(result, 'findFileAsync should resolve Foo.clw via *.clw = .\\classes');
        assert.strictEqual(
            path.normalize(result!.path),
            path.normalize(path.join(fix.projDir, 'classes', 'Foo.clw')),
            'expected resolution to <projDir>/classes/Foo.clw, got ' + (result && result.path) +
            " — '.\\classes' is being resolved against the .red file's dir instead of the project dir"
        );
    });

    // --- (3) sync multi-segment `.\SharedCode\equates` under global .red ---
    test("findFile (sync) — '.\\\\SharedCode\\\\equates' should resolve under projDir, not binDir", () => {
        const targetRel = path.join('SharedCode', 'equates', 'Foo.inc');
        const fix = setupCase({
            redContents: '[Common]\n*.inc = .\\SharedCode\\equates\n',
            filesAtProj: [targetRel],
            filesAtBin: [targetRel]
        });

        const parser = new RedirectionFileParserServer();
        parser.parseRedFile(fix.projDir);
        const result = parser.findFile('Foo.inc');

        assert.ok(result, 'findFile should resolve Foo.inc via *.inc = .\\SharedCode\\equates');
        assert.strictEqual(
            path.normalize(result!.path),
            path.normalize(path.join(fix.projDir, targetRel)),
            'expected resolution under projDir, got ' + (result && result.path) +
            " — multi-segment relative is being resolved against the .red file's dir instead of the project dir"
        );
    });

    // --- (4) async mirror of (3) ---
    test("findFileAsync — '.\\\\SharedCode\\\\equates' should resolve under projDir, not binDir", async () => {
        const targetRel = path.join('SharedCode', 'equates', 'Foo.inc');
        const fix = setupCase({
            redContents: '[Common]\n*.inc = .\\SharedCode\\equates\n',
            filesAtProj: [targetRel],
            filesAtBin: [targetRel]
        });

        const parser = new RedirectionFileParserServer();
        await parser.parseRedFileAsync(fix.projDir);
        const result = await parser.findFileAsync('Foo.inc');

        assert.ok(result, 'findFileAsync should resolve Foo.inc via *.inc = .\\SharedCode\\equates');
        assert.strictEqual(
            path.normalize(result!.path),
            path.normalize(path.join(fix.projDir, targetRel)),
            'expected resolution under projDir, got ' + (result && result.path) +
            " — multi-segment relative is being resolved against the .red file's dir instead of the project dir"
        );
    });

    // --- (5) regression guard — sync project-local .red still works ---
    test("findFile (sync) — regression guard: project-local .red with '.\\\\classes' resolves correctly", () => {
        const fix = setupCase({
            redContents: '[Common]\n*.clw = .\\classes\n',
            redLocation: 'projectLocal',
            filesAtProj: [path.join('classes', 'Foo.clw')]
            // No decoy needed: project-local case already resolves to the right place,
            // both before AND after the fix.
        });

        const parser = new RedirectionFileParserServer();
        parser.parseRedFile(fix.projDir);
        const result = parser.findFile('Foo.clw');

        assert.ok(result, 'findFile should resolve Foo.clw under project-local .red');
        assert.strictEqual(
            path.normalize(result!.path),
            path.normalize(path.join(fix.projDir, 'classes', 'Foo.clw')),
            'expected <projDir>/classes/Foo.clw, got ' + (result && result.path)
        );
    });

    // --- (6) async mirror of (5) ---
    test("findFileAsync — regression guard: project-local .red with '.\\\\classes' resolves correctly", async () => {
        const fix = setupCase({
            redContents: '[Common]\n*.clw = .\\classes\n',
            redLocation: 'projectLocal',
            filesAtProj: [path.join('classes', 'Foo.clw')]
        });

        const parser = new RedirectionFileParserServer();
        await parser.parseRedFileAsync(fix.projDir);
        const result = await parser.findFileAsync('Foo.clw');

        assert.ok(result, 'findFileAsync should resolve Foo.clw under project-local .red');
        assert.strictEqual(
            path.normalize(result!.path),
            path.normalize(path.join(fix.projDir, 'classes', 'Foo.clw')),
            'expected <projDir>/classes/Foo.clw, got ' + (result && result.path)
        );
    });
});
