import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { RedirectionFileParserServer } from '../solution/redirectionFileParserServer';
import { serverSettings } from '../serverSettings';

/**
 * Failing-pin tests for task `3f9f91c8` (`{include}` chaining audit, Phase B
 * Piece 1 — async ordering fix).
 *
 * Per Eve's Phase A audit (`docs/audits/include-chaining-audit-3f9f91c8.md`):
 *
 *   Sync `parseRedFileRecursive` recurses synchronously into the included
 *   file at the include directive's position; child entries push into the
 *   shared array BEFORE the parent loop continues to its next iteration.
 *   Result: interleaved-at-include-position. **Verdict: CORRECT.**
 *
 *   Async `parseRedFileRecursiveAsync` queues per-include promises onto
 *   `includePromises[]` (line 407-409) and awaits them ALL at line 450 —
 *   AFTER the parent loop has finished pushing every parent entry. Result:
 *   child entries always appear AFTER all parent entries; multiple
 *   includes resolve concurrently with non-deterministic relative order.
 *   **Verdict: INCORRECT.**
 *
 * Counterfactual sentinel per Eve's audit Step 2 (and the broader
 * `feedback_non_x_regression_sentinel` discipline): the regression test
 * MUST include parent entries AFTER the include directive (B in the
 * fixture below) and assert they appear at the END of the flat list —
 * not between child entries — to discriminate against the appended-only
 * behaviour.
 *
 * Bidirectional pin per `feedback_bidirectional_pin_assertion`:
 *   - POSITIVE: interleaved-at-include-position IS the result
 *     (`[A, X, Y, B]` for parent A|{include child}|B, child X|Y)
 *   - NEGATIVE: appended-after-parent shape is NOT the result
 *     (test asserts B's position is AFTER child entries, not before)
 *
 * Multi-include determinism (the load-bearing test): two `{include}`
 * directives must resolve in deterministic interleaved order across
 * repeated async invocations. Pre-fix this test will be flaky (or
 * deterministically wrong) depending on fs read timing.
 *
 * Sync regression guard mirrors the same fixtures via `parseRedFile` —
 * GREEN today (per Eve's audit) and post-fix; pins that the async fix
 * doesn't accidentally regress sync semantics.
 *
 * Per-test unique tmpdir so the parser's static `redFileCache` /
 * `includeCache` mtime-keyed entries never collide.
 */

interface Fixture {
    tmpRoot: string;
    projDir: string;
    redFile: string;
}

interface FixtureSpec {
    parentRed: string;
    includes: { [relPath: string]: string };
}

function buildFixture(spec: FixtureSpec): Fixture {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'red-include-3f9f91c8-'));
    const projDir = path.join(tmpRoot, 'Proj');
    fs.mkdirSync(projDir, { recursive: true });

    const redFile = path.join(projDir, 'Clarion110.red');
    fs.writeFileSync(redFile, spec.parentRed);

    for (const [relPath, content] of Object.entries(spec.includes)) {
        const fullPath = path.join(projDir, relPath);
        fs.mkdirSync(path.dirname(fullPath), { recursive: true });
        fs.writeFileSync(fullPath, content);
    }

    return { tmpRoot, projDir, redFile };
}

function teardownFixture(fix: Fixture | null): void {
    if (!fix) { return; }
    try { fs.rmSync(fix.tmpRoot, { recursive: true, force: true }); } catch { /* best-effort */ }
}

/**
 * Returns the flat-list ordering of entry extensions, ignoring the synthetic
 * sections / paths — the test cares about ordering of distinct extensions
 * across parent + child files.
 */
function extensionsOf(entries: { extension: string }[]): string[] {
    return entries.map(e => e.extension);
}

suite('RedirectionParser.IncludeChainOrdering (3f9f91c8)', () => {

    let fixtures: Fixture[] = [];
    let savedRedirectionFile = '';
    let savedRedirectionPaths: string[] = [];
    let savedConfiguration = '';

    setup(() => {
        fixtures = [];
        savedRedirectionFile = serverSettings.redirectionFile;
        savedRedirectionPaths = serverSettings.redirectionPaths;
        savedConfiguration = serverSettings.configuration;
        serverSettings.redirectionFile = 'Clarion110.red';
        serverSettings.configuration = 'Common';
    });

    teardown(() => {
        serverSettings.redirectionFile = savedRedirectionFile;
        serverSettings.redirectionPaths = savedRedirectionPaths;
        serverSettings.configuration = savedConfiguration;
        for (const f of fixtures) { teardownFixture(f); }
        fixtures = [];
    });

    function setupCase(spec: FixtureSpec): Fixture {
        const fix = buildFixture(spec);
        fixtures.push(fix);
        serverSettings.redirectionPaths = [fix.projDir];
        return fix;
    }

    // ─── (1) ASYNC SINGLE-INCLUDE — interleaved at include position ─────────

    /**
     * Parent: `*.A = .` then `{include child.red}` then `*.B = .`.
     * Child:  `*.X = .` then `*.Y = .`.
     *
     * Expected flat-list extensions in order: ['*.A', '*.X', '*.Y', '*.B'].
     * Pre-fix async: ['*.A', '*.B', '*.X', '*.Y'] (B appears BEFORE child entries).
     */
    test('async — single include — interleaved-at-position; B comes after child X+Y', async () => {
        const fix = setupCase({
            parentRed:
                '[Common]\n' +
                '*.A = .\n' +
                '{include child.red}\n' +
                '*.B = .\n',
            includes: {
                'child.red':
                    '[Common]\n' +
                    '*.X = .\n' +
                    '*.Y = .\n',
            }
        });

        const parser = new RedirectionFileParserServer();
        const entries = await parser.parseRedFileAsync(fix.projDir);
        const exts = extensionsOf(entries);

        // Positive: interleaved order present.
        assert.deepStrictEqual(
            exts,
            ['*.A', '*.X', '*.Y', '*.B'],
            'async single-include should produce interleaved-at-position ordering [A,X,Y,B]; ' +
            'got [' + exts.join(',') + '] — non-deterministic / appended-after-parent shape ' +
            '(parseRedFileRecursiveAsync queues includePromises and awaits Promise.all AFTER parent loop)'
        );

        // Negative bidirectional pin: B must NOT precede child entries.
        const idxB = exts.indexOf('*.B');
        const idxX = exts.indexOf('*.X');
        assert.ok(
            idxB > idxX && idxB > exts.indexOf('*.Y'),
            'B must come AFTER X+Y (interleaved at include position); ' +
            'got [' + exts.join(',') + '] — appended-shape detected'
        );
    });

    // ─── (2) ASYNC MULTI-INCLUDE — deterministic across N invocations ───────

    /**
     * Two includes — the load-bearing non-determinism check. Pre-fix, async
     * resolves `Promise.all([include1, include2])` in fs-completion order;
     * even if the SAME fixture runs twice, the relative order of include1's
     * vs include2's child entries can flip between runs.
     *
     * Test invokes the parser N times against fresh parser instances (to
     * avoid `redFileCache` masking by re-using a cached result) and asserts
     * the flat-list ordering is identical across all invocations.
     */
    test('async — multi-include — deterministic ordering across N invocations', async () => {
        const fix = setupCase({
            parentRed:
                '[Common]\n' +
                '*.A = .\n' +
                '{include alpha.red}\n' +
                '*.B = .\n' +
                '{include beta.red}\n' +
                '*.C = .\n',
            includes: {
                'alpha.red':
                    '[Common]\n' +
                    '*.alpha1 = .\n' +
                    '*.alpha2 = .\n',
                'beta.red':
                    '[Common]\n' +
                    '*.beta1 = .\n' +
                    '*.beta2 = .\n',
            }
        });

        const N = 8;
        const orderings: string[][] = [];
        for (let i = 0; i < N; i++) {
            // Bust the static redFileCache by clearing it between runs so each
            // invocation does a fresh disk parse + fresh promise scheduling.
            (RedirectionFileParserServer as unknown as { redFileCache: Map<string, unknown> })
                .redFileCache.clear();
            (RedirectionFileParserServer as unknown as { includeCache: Map<string, unknown> })
                .includeCache.clear();

            const parser = new RedirectionFileParserServer();
            const entries = await parser.parseRedFileAsync(fix.projDir);
            orderings.push(extensionsOf(entries));
        }

        // All orderings should be identical.
        const first = orderings[0];
        for (let i = 1; i < N; i++) {
            assert.deepStrictEqual(
                orderings[i],
                first,
                `multi-include async ordering non-deterministic across runs — run 0 = [${first.join(',')}], ` +
                `run ${i} = [${orderings[i].join(',')}] — Promise.all flushes children in fs-completion order`
            );
        }

        // And the canonical interleaved order is what we want.
        assert.deepStrictEqual(
            first,
            ['*.A', '*.alpha1', '*.alpha2', '*.B', '*.beta1', '*.beta2', '*.C'],
            'expected interleaved ordering; got [' + first.join(',') + ']'
        );
    });

    // ─── (3) SYNC REGRESSION GUARD — same fixture, same expected ordering ──

    /**
     * Mirror of test 1 via the sync `parseRedFile` path. Should be GREEN
     * today (per Eve's audit) and post-fix — pins that the async fix
     * doesn't accidentally regress sync semantics. Same fixture exposed
     * via the sync entry point.
     */
    test('sync regression guard — single include — interleaved-at-position [A,X,Y,B]', () => {
        const fix = setupCase({
            parentRed:
                '[Common]\n' +
                '*.A = .\n' +
                '{include child.red}\n' +
                '*.B = .\n',
            includes: {
                'child.red':
                    '[Common]\n' +
                    '*.X = .\n' +
                    '*.Y = .\n',
            }
        });

        const parser = new RedirectionFileParserServer();
        const entries = parser.parseRedFile(fix.projDir);
        const exts = extensionsOf(entries);

        assert.deepStrictEqual(
            exts,
            ['*.A', '*.X', '*.Y', '*.B'],
            'sync ordering should be interleaved-at-position [A,X,Y,B]; got [' + exts.join(',') + ']'
        );
    });
});
