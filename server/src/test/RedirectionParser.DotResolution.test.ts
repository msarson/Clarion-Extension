import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
    RedirectionFileParserServer,
    FilePathSource
} from '../solution/redirectionFileParserServer';
import { serverSettings } from '../serverSettings';

/**
 * Failing-pin tests for task `01d635ef` (redirection-parser bug stack, Layer 1).
 *
 * Per Clarion 11.1 docs (`redirection_file.htm`) and Mark's 2026-05-09 compiler
 * trace, `.` and `..` inside a redirection file's path list resolve to the
 * **project directory** (the directory of the file being compiled), NOT the
 * .red file's own directory.
 *
 * The current implementation in
 * `redirectionFileParserServer.ts:485-495` (sync) and `:576-586` (async)
 * resolves `.`/`..` against `path.dirname(entry.redFile)`. Additionally, the
 * synthetic catch-all entry pushed at `:231` (sync) / `:346` (async) — the
 * implicit `*.* = [redPath]` — also uses the .red file's dir as its base.
 *
 * The bug is masked for project-local .red (project-local .red sits in the
 * project dir, so the two happen to coincide). It bites for the global
 * fallback path (`%ClarionRoot%\bin\Clarion110.red`) where `.` / synthetic
 * catch-all then map to `…\bin\` instead of the project dir.
 *
 * Two suites cover both surfaces:
 *   - Suite A: explicit `*.clw = .` entry exercises the `.`/`..` branch.
 *   - Suite B: no `.clw` entry forces fall-through to the synthetic
 *     `*.*` catch-all.
 *
 * Both should be RED on current code and GREEN once Alice's fix anchors
 * BOTH branches on the project directory.
 *
 * Layout per test:
 *   <tmp>/SimpleProj/Other.clw            (correct target — the project dir)
 *   <tmp>/clarion/bin/Other.clw           (decoy — same filename in .red dir)
 *   <tmp>/clarion/bin/Clarion110.red      (global fallback red)
 *
 * Because Other.clw exists in BOTH directories, current code returns the decoy
 * (the .red-dir copy), proving resolution went to the wrong base. Post-fix
 * should return the project-dir copy.
 *
 * Each test uses a unique tmpdir name so the parser's static `redFileCache` /
 * `includeCache` keys (path + mtime) never collide between runs — no need to
 * mutate static caches.
 */

interface Fixture {
    tmpRoot: string;
    projectDir: string;
    binDir: string;
    redFile: string;
    projectTarget: string;
    decoyTarget: string;
}

function buildFixture(redContents: string): Fixture {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'red-dot-01d635ef-'));
    const projectDir = path.join(tmpRoot, 'SimpleProj');
    const binDir = path.join(tmpRoot, 'clarion', 'bin');
    const redFile = path.join(binDir, 'Clarion110.red');
    const projectTarget = path.join(projectDir, 'Other.clw');
    const decoyTarget = path.join(binDir, 'Other.clw');

    fs.mkdirSync(projectDir, { recursive: true });
    fs.mkdirSync(binDir, { recursive: true });
    fs.writeFileSync(projectTarget, '! project copy\n');
    fs.writeFileSync(decoyTarget, '! decoy copy in bin\n');
    fs.writeFileSync(redFile, redContents);

    return { tmpRoot, projectDir, binDir, redFile, projectTarget, decoyTarget };
}

function teardownFixture(fix: Fixture | null): void {
    if (!fix) { return; }
    try {
        fs.rmSync(fix.tmpRoot, { recursive: true, force: true });
    } catch { /* best-effort cleanup */ }
}

suite("RedirectionParser — explicit '.'/'..' under global fallback (01d635ef)", () => {

    let fix: Fixture | null = null;
    let savedRedirectionFile = '';
    let savedRedirectionPaths: string[] = [];

    setup(() => {
        // Minimal global fallback red containing an explicit `*.clw = .` only.
        fix = buildFixture('[Common]\n*.clw = .\n');
        savedRedirectionFile = serverSettings.redirectionFile;
        savedRedirectionPaths = serverSettings.redirectionPaths;
        serverSettings.redirectionFile = 'Clarion110.red';
        serverSettings.redirectionPaths = [fix.binDir];
    });

    teardown(() => {
        serverSettings.redirectionFile = savedRedirectionFile;
        serverSettings.redirectionPaths = savedRedirectionPaths;
        teardownFixture(fix);
        fix = null;
    });

    test('parseRedFile takes the global-fallback path when no project-local .red exists', () => {
        const parser = new RedirectionFileParserServer();
        const entries = parser.parseRedFile(fix!.projectDir);

        assert.ok(entries.length > 0, 'expected at least one entry parsed from the global red');
        for (const e of entries) {
            assert.strictEqual(
                path.normalize(e.redFile),
                path.normalize(fix!.redFile),
                'entry redFile should be the global fallback, got ' + e.redFile
            );
        }
    });

    test("findFile (sync) — '.' should resolve to project dir, not .red dir", () => {
        const parser = new RedirectionFileParserServer();
        parser.parseRedFile(fix!.projectDir);

        const result = parser.findFile('Other.clw');

        assert.ok(result, 'findFile should resolve Other.clw via the *.clw = . entry');
        assert.strictEqual(
            path.normalize(result!.path),
            path.normalize(fix!.projectTarget),
            "expected resolution to project dir copy (" + fix!.projectTarget + "), " +
            "got " + (result && result.path) +
            " — '.' is being resolved against the .red file's dir instead of the project dir"
        );
        assert.strictEqual(result!.source, FilePathSource.Redirected);
    });

    test("findFileAsync — '.' should resolve to project dir, not .red dir", async () => {
        const parser = new RedirectionFileParserServer();
        await parser.parseRedFileAsync(fix!.projectDir);

        const result = await parser.findFileAsync('Other.clw');

        assert.ok(result, 'findFileAsync should resolve Other.clw via the *.clw = . entry');
        assert.strictEqual(
            path.normalize(result!.path),
            path.normalize(fix!.projectTarget),
            "expected resolution to project dir copy (" + fix!.projectTarget + "), " +
            "got " + (result && result.path) +
            " — '.' is being resolved against the .red file's dir instead of the project dir"
        );
        assert.strictEqual(result!.source, FilePathSource.Redirected);
    });
});

suite("RedirectionParser — Tier 2 project-root fallback when no entry mask matches (01d635ef, renamed under 3161ea89)", () => {

    let fix: Fixture | null = null;
    let savedRedirectionFile = '';
    let savedRedirectionPaths: string[] = [];

    setup(() => {
        // Minimal red with NO `*.clw` entry — Other.clw cannot match any user-
        // declared mask in Tier 1, so resolution falls through to Tier 2
        // (explicit `<projectPath>/<filename>` probe added under 3161ea89).
        // Pre-3161ea89: same result was achieved via the synthetic `*.* = ['.']`
        // catch-all the parser pushed at parse time. Synthetic dropped under
        // 3161ea89 (compiler-truth principle); Tier 2 explicit probe replaces it.
        fix = buildFixture('[Common]\n*.obj = .\n');
        savedRedirectionFile = serverSettings.redirectionFile;
        savedRedirectionPaths = serverSettings.redirectionPaths;
        serverSettings.redirectionFile = 'Clarion110.red';
        serverSettings.redirectionPaths = [fix.binDir];
    });

    teardown(() => {
        serverSettings.redirectionFile = savedRedirectionFile;
        serverSettings.redirectionPaths = savedRedirectionPaths;
        teardownFixture(fix);
        fix = null;
    });

    test("findFile (sync) — Tier 2 project-root fallback resolves to project dir when no entry mask matches", () => {
        const parser = new RedirectionFileParserServer();
        parser.parseRedFile(fix!.projectDir);

        const result = parser.findFile('Other.clw');

        assert.ok(result, 'findFile should resolve Other.clw via Tier 2 project-root fallback (no *.clw entry exists)');
        assert.strictEqual(
            path.normalize(result!.path),
            path.normalize(fix!.projectTarget),
            "expected resolution to project dir copy (" + fix!.projectTarget + "), " +
            "got " + (result && result.path) +
            " — Tier 2 project-root fallback should resolve unmasked extensions against the project dir, not the .red file's dir"
        );
        assert.strictEqual(result!.source, FilePathSource.Redirected);
    });

    test("findFileAsync — Tier 2 project-root fallback resolves to project dir when no entry mask matches", async () => {
        const parser = new RedirectionFileParserServer();
        await parser.parseRedFileAsync(fix!.projectDir);

        const result = await parser.findFileAsync('Other.clw');

        assert.ok(result, 'findFileAsync should resolve Other.clw via Tier 2 project-root fallback (no *.clw entry exists)');
        assert.strictEqual(
            path.normalize(result!.path),
            path.normalize(fix!.projectTarget),
            "expected resolution to project dir copy (" + fix!.projectTarget + "), " +
            "got " + (result && result.path) +
            " — Tier 2 project-root fallback should resolve unmasked extensions against the project dir, not the .red file's dir"
        );
        assert.strictEqual(result!.source, FilePathSource.Redirected);
    });
});
