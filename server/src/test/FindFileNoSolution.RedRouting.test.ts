import * as assert from 'assert';
import * as path from 'path';
import { resolveFileInNoSolutionMode } from '../solution/findFileNoSolution';
import { serverSettings } from '../serverSettings';
import {
    NoSolutionFixture,
    buildNoSolutionFixture,
    teardownNoSolutionFixture
} from './helpers/NoSolutionFixture';

/**
 * #156 — version `.red` redirection parsing in no-solution mode.
 *
 * Extends the existing `findFileNoSolution` suite (which covers localDir +
 * flat `libsrcPaths` resolution) to pin pattern-matched routing through the
 * version's `.red` file. Pre-#156, files routed through `.red` patterns to
 * subdirectories NOT in `libsrcPaths` (e.g. `*.equ = .;equates;libsrc\win` —
 * the `equates\` subdir) were unreachable in no-solution mode.
 *
 * Pin shape per `feedback_bidirectional_pin_assertion`: every positive case
 * pins BOTH the right tier (source label) AND the right path-prefix (resolved
 * file is inside the expected fixture subdirectory, not silently picked from
 * elsewhere). Per-tier source-label asserts catch silent mis-routing
 * (e.g. localDir hit masquerading as `.red` tier hit).
 *
 * Reach: invokes `resolveFileInNoSolutionMode` directly with the fixture's
 * `.red` file written to disk. LSP-level integration is server.ts handler
 * coverage (separate test surface).
 */

const SAVED_CONFIGURATION = serverSettings.configuration;

suite('FindFileNoSolution.RedRouting (#156)', () => {

    let fix: NoSolutionFixture | null = null;

    teardown(() => {
        teardownNoSolutionFixture(fix);
        fix = null;
        serverSettings.configuration = SAVED_CONFIGURATION;
    });

    // ---- Load-bearing case: pattern routes `*.equ` to a subdir not in libsrcPaths ----

    test('pattern hit — `*.equ` routes to `equates\\` subdir (not in libsrcPaths)', () => {
        fix = buildNoSolutionFixture({
            libsrcs: [{}], // empty libsrc — proves the .red routing is what's working, not libsrcs
            redFile: {
                filename: 'TestVersion.red',
                content: '[Common]\n*.equ = .;equates;libsrc\\win\n',
                targetDirs: {
                    'equates': { 'shared.equ': '! equates body\n' }
                }
            }
        });

        const result = resolveFileInNoSolutionMode('shared.equ', undefined);

        assert.ok(result, 'shared.equ must resolve via the `equates\\` subdir routed by *.equ pattern');
        assert.strictEqual(result!.source, 'redirected',
            'source label must be "redirected" — confirms .red pattern was the tier that matched');
        assert.strictEqual(path.basename(result!.path).toLowerCase(), 'shared.equ',
            'resolved file basename must match requested filename');
        assert.ok(fix.redDir, 'fixture redDir must be populated');
        const expectedDir = path.normalize(path.join(fix.redDir!, 'equates')).toLowerCase();
        assert.ok(
            path.normalize(result!.path).toLowerCase().startsWith(expectedDir),
            `resolved path must be inside the equates\\ subdir under the .red file (expected prefix: ${expectedDir})`
        );
    });

    // ---- Pattern hit on a different extension family (`*.clw`) ----

    test('pattern hit — `*.clw` routes to a libsrc-style subdir', () => {
        fix = buildNoSolutionFixture({
            libsrcs: [{}],
            redFile: {
                filename: 'TestVersion.red',
                content: '[Common]\n*.clw = .;src\\classes\n',
                targetDirs: {
                    'src\\classes': { 'StringTheory.clw': '! body\n' }
                }
            }
        });

        const result = resolveFileInNoSolutionMode('StringTheory.clw', undefined);

        assert.ok(result, '*.clw pattern route must resolve to the configured subdir');
        assert.strictEqual(result!.source, 'redirected');
        assert.strictEqual(path.basename(result!.path).toLowerCase(), 'stringtheory.clw');
    });

    // ---- Precedence: localDir wins over .red even when .red would also match ----

    test('precedence — localDir hit wins over .red routing for same filename', () => {
        fix = buildNoSolutionFixture({
            libsrcs: [{}],
            sourceFile: {
                filename: 'MyProg.clw',
                content: '!',
                siblings: { 'shared.inc': '! local sibling — should win\n' }
            },
            redFile: {
                filename: 'TestVersion.red',
                content: '[Common]\n*.inc = .;libsrc\\win\n',
                targetDirs: {
                    'libsrc\\win': { 'shared.inc': '! version libsrc — should NOT win\n' }
                }
            }
        });

        const result = resolveFileInNoSolutionMode('shared.inc', fix.sourceUri ?? undefined);

        assert.ok(result, 'shared.inc must resolve');
        assert.strictEqual(result!.source, 'local',
            'localDir tier MUST win over .red routing — user mental model: sibling-of-source wins');
        assert.ok(fix.sourceDir, 'fixture sourceDir must be populated');
        assert.strictEqual(
            path.normalize(result!.path).toLowerCase(),
            path.normalize(path.join(fix.sourceDir!, 'shared.inc')).toLowerCase(),
            'resolved path must be the sibling under sourceDir, not the .red-routed version libsrc'
        );
    });

    // ---- Section filtering: [Common] always active; [Debug] gated by serverSettings.configuration ----

    test('section filter — [Common] entries always active regardless of configuration', () => {
        fix = buildNoSolutionFixture({
            libsrcs: [{}],
            redFile: {
                filename: 'TestVersion.red',
                content: '[Common]\n*.inc = .;common-inc\n',
                targetDirs: {
                    'common-inc': { 'Always.inc': '!\n' }
                }
            }
        });
        // serverSettings.configuration defaults to 'Default' (per serverSettings.ts:5).
        // [Common] should match regardless.

        const result = resolveFileInNoSolutionMode('Always.inc', undefined);

        assert.ok(result, '[Common] section entries must resolve under any configuration');
        assert.strictEqual(result!.source, 'redirected');
    });

    test('section filter — [Debug] entries match only when serverSettings.configuration === "Debug"', () => {
        // First sub-test: configuration='Release' → [Debug] entries skipped → miss
        serverSettings.configuration = 'Release';
        fix = buildNoSolutionFixture({
            libsrcs: [{}],
            redFile: {
                filename: 'TestVersion.red',
                content: '[Debug]\n*.inc = .;debug-only\n',
                targetDirs: {
                    'debug-only': { 'DebugOnly.inc': '!\n' }
                }
            }
        });

        const miss = resolveFileInNoSolutionMode('DebugOnly.inc', undefined);
        assert.strictEqual(miss, null,
            '[Debug] section must NOT match when serverSettings.configuration is Release');

        // Tear down + rebuild with configuration='Debug'
        teardownNoSolutionFixture(fix);
        fix = null;
        serverSettings.configuration = 'Debug';

        fix = buildNoSolutionFixture({
            libsrcs: [{}],
            redFile: {
                filename: 'TestVersion.red',
                content: '[Debug]\n*.inc = .;debug-only\n',
                targetDirs: {
                    'debug-only': { 'DebugOnly.inc': '!\n' }
                }
            }
        });

        const hit = resolveFileInNoSolutionMode('DebugOnly.inc', undefined);
        assert.ok(hit, '[Debug] section MUST match when serverSettings.configuration is Debug');
        assert.strictEqual(hit!.source, 'redirected');
    });

    // ---- Extension retry under .red ----

    test('extension retry — extensionless filename resolves via `*.inc` pattern in .red', () => {
        fix = buildNoSolutionFixture({
            libsrcs: [{}],
            redFile: {
                filename: 'TestVersion.red',
                content: '[Common]\n*.inc = .;routes-inc\n',
                targetDirs: {
                    'routes-inc': { 'NoExt.inc': '!\n' }
                }
            }
        });

        // Requesting `NoExt` (no extension) — resolver should retry with each default
        // extension, find `.inc` matches the `*.inc` pattern, and resolve.
        const result = resolveFileInNoSolutionMode('NoExt', undefined);

        assert.ok(result, 'extensionless filename must trigger extension retry that finds NoExt.inc via .red routing');
        assert.strictEqual(result!.source, 'redirected');
        assert.strictEqual(path.basename(result!.path).toLowerCase(), 'noext.inc');
    });

    // ---- libsrcPaths Tier 3 fallback inside the .red walk ----

    test('libsrcs Tier 3 — file in libsrcPaths still resolves via parser.findFile Tier 3 (not just .red entries)', () => {
        fix = buildNoSolutionFixture({
            libsrcs: [{ 'LibOnly.inc': '!\n' }],
            redFile: {
                filename: 'TestVersion.red',
                content: '[Common]\n*.equ = .;equates\n', // .red has NO *.inc entry
            }
        });

        // LibOnly.inc isn't routed by .red (no *.inc entry), but it IS in libsrcs.
        // The RedirectionFileParserServer.findFile Tier 3 walks libsrcPaths.
        const result = resolveFileInNoSolutionMode('LibOnly.inc', undefined);

        assert.ok(result, 'file in libsrcPaths must resolve via parser Tier 3 even when not in .red entries');
        assert.strictEqual(result!.source, 'libsrc');
        assert.strictEqual(path.basename(result!.path).toLowerCase(), 'libonly.inc');
    });

    // ---- Graceful fallback when no .red configured ----

    test('no .red configured — falls back to libsrcs-only walk (pre-#156 behavior preserved)', () => {
        fix = buildNoSolutionFixture({
            libsrcs: [{ 'Foo.inc': '!\n' }],
            // redFile NOT set → serverSettings.redirectionFile = ''
        });

        const result = resolveFileInNoSolutionMode('Foo.inc', undefined);

        assert.ok(result, 'libsrcs-only walk must resolve when no .red is configured');
        assert.strictEqual(result!.source, 'libsrc');
    });

    // ---- Genuine miss → null ----

    test('genuine miss — file absent from sourceDir, .red entries, and libsrcs → null', () => {
        fix = buildNoSolutionFixture({
            libsrcs: [{ 'Other.inc': '!\n' }],
            redFile: {
                filename: 'TestVersion.red',
                content: '[Common]\n*.equ = .;equates\n',
                targetDirs: {
                    'equates': { 'Different.equ': '!\n' }
                }
            }
        });

        const result = resolveFileInNoSolutionMode('Missing.inc', undefined);

        assert.strictEqual(result, null,
            'file absent everywhere → null (caller handler emits silent-miss warn)');
    });
});
