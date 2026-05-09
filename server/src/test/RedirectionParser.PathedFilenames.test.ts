import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { RedirectionFileParserServer } from '../solution/redirectionFileParserServer';
import { serverSettings } from '../serverSettings';

/**
 * Failing-pin test for task `3161ea89` Phase A — pathed-vs-bare branching at
 * `findFile` entry under the strict compiler-truth resolution architecture.
 *
 * Architecture (locked with Mark):
 * ```
 * INPUT: filename, projectPath
 * 1. Absolute? → existsSync direct
 * 2. Pathed (contains / or \)? → path.join(projectPath, filename), SKIP RED
 * 3. Bare → 3-tier:
 *    Tier 1: walk RED entries (user-declared only — NO synthetic *.* catch-all)
 *    Tier 2: <projectPath>/<filename> explicitly
 *    Tier 3: walk libsrcPaths sequentially
 * ```
 *
 * Mark's rationale (from continuation_notes on 3161ea89):
 *   "I actually think we should be strict here, compiler is truth. I'm
 *    trying to make the extension work how the Clarion IDE would but
 *    better (Clarion IDE doesn't have many providers at all)."
 *
 * THIS test pins the SKIP semantics of step 2. A pathed name with NO file at
 * the canonical project-rooted location must return null — entries-walk
 * concatenation (which today would find the file under a custom dir like
 * `.\classes`) is intentionally bypassed.
 *
 * Fixture: red declares `*.inc = .\classes`. File exists ONLY at
 * `<projDir>/classes/subdir/foo.inc` (the entries-walk concatenation
 * destination). Canonical pathed location `<projDir>/subdir/foo.inc` does
 * NOT exist.
 *
 * Pre-fix (today):
 *   - Synthetic `*.* = ['.']` probes `<projDir>/subdir/foo.inc` → not found.
 *   - User entry `*.inc = .\classes` matches `subdir\\foo.inc`, resolves to
 *     `<projDir>/classes`, joins → `<projDir>/classes/subdir/foo.inc` → found.
 *   - findFile returns the entries-walk-concatenated path. Result is non-null.
 *   - Test asserts null → RED.
 *
 * Post-fix (Alice's step 4):
 *   - Pathed branch fires first, tries `<projDir>/subdir/foo.inc`, not found,
 *     returns null. SKIPS the entries walk entirely.
 *   - Test asserts null → GREEN.
 *
 * The assertion is `result === null` — that is the load-bearing pin for the
 * SKIP semantics. A complementary positive case (canonical exists, pathed
 * branch finds it) IS already covered today by the synthetic catch-all and
 * is not differentiating between the two architectures, so it's not added
 * here.
 */

interface Fixture {
    tmpRoot: string;
    projectDir: string;
    binDir: string;
    redFile: string;
    decoyTarget: string; // entries-walk concatenation lands here pre-fix
    canonicalAbsentPath: string; // pathed branch would probe here, not seeded
}

function buildFixture(): Fixture {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'red-pathed-3161ea89-'));
    const projectDir = path.join(tmpRoot, 'Proj');
    const binDir = path.join(tmpRoot, 'clarion', 'bin');
    const redFile = path.join(binDir, 'Clarion110.red');
    const decoyTarget = path.join(projectDir, 'classes', 'subdir', 'foo.inc');
    const canonicalAbsentPath = path.join(projectDir, 'subdir', 'foo.inc');

    fs.mkdirSync(path.dirname(decoyTarget), { recursive: true });
    fs.mkdirSync(binDir, { recursive: true });

    // Seed ONLY the decoy. The canonical pathed-branch target is intentionally
    // absent — the test asserts the pathed branch returns null rather than
    // falling through to the entries-walk-resolved decoy.
    fs.writeFileSync(decoyTarget, '! decoy (entries-walk concatenation lands here pre-fix)\n');

    fs.writeFileSync(redFile, '[Common]\n*.inc = .\\classes\n');

    return { tmpRoot, projectDir, binDir, redFile, decoyTarget, canonicalAbsentPath };
}

function teardownFixture(fix: Fixture | null): void {
    if (!fix) { return; }
    try {
        fs.rmSync(fix.tmpRoot, { recursive: true, force: true });
    } catch { /* best-effort cleanup */ }
}

suite('RedirectionParser — pathed-vs-bare branching (3161ea89)', () => {

    let fix: Fixture | null = null;
    let savedRedirectionFile = '';
    let savedRedirectionPaths: string[] = [];
    let savedLibsrcPaths: string[] = [];

    setup(() => {
        fix = buildFixture();
        savedRedirectionFile = serverSettings.redirectionFile;
        savedRedirectionPaths = serverSettings.redirectionPaths;
        savedLibsrcPaths = serverSettings.libsrcPaths;
        serverSettings.redirectionFile = 'Clarion110.red';
        serverSettings.redirectionPaths = [fix.binDir];
        serverSettings.libsrcPaths = []; // no Tier 3 rescue
    });

    teardown(() => {
        serverSettings.redirectionFile = savedRedirectionFile;
        serverSettings.redirectionPaths = savedRedirectionPaths;
        serverSettings.libsrcPaths = savedLibsrcPaths;
        teardownFixture(fix);
        fix = null;
    });

    test("findFile (sync) — pathed name with absent canonical SKIPS entries walk and returns null", () => {
        const parser = new RedirectionFileParserServer();
        parser.parseRedFile(fix!.projectDir);

        const result = parser.findFile('subdir\\foo.inc');

        assert.strictEqual(
            result,
            null,
            'expected null when canonical <projDir>/subdir/foo.inc does not exist; ' +
            'got ' + JSON.stringify(result) +
            ' — pathed branch is not bypassing the entries walk; entries `*.inc = .\\classes` ' +
            'is concatenating to find the decoy <projDir>/classes/subdir/foo.inc instead of ' +
            'returning null per compiler-truth (3161ea89)'
        );
    });
});
