import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
    resolveMemberFile,
    ResolveMemberFileDeps
} from '../commands/memberResolution';

/**
 * Failing-pin tests for task `7cbf07f7` — MEMBER file resolution bypasses
 * redirection (audit follow-up B from
 * `docs/audits/file-finding-audit-2026-05-09.md`).
 *
 * Pre-fix: `client/src/commands/IncludeStatementCommands.ts:85-101` does a
 * sibling-only `path.join(currentDir, targetFile)` + `fs.existsSync` check.
 * If the MEMBER's CLW lives in a RED-derived path (e.g. `[Common]
 * *.clw = .\classes`) or in libsrc, the command throws "MEMBER file not
 * found".
 *
 * Per audit Q2 + Bob's PM call: route through the LSP `clarion/findFile`
 * request (handler at `server.ts:1359`). NOT via `RedirectionService`
 * (that's a buggy parallel client-side implementation slated for deletion
 * under `0075728c`).
 *
 * No-solution-open caveat (Mark's 2026-05-09 observation): the LSP handler
 * relies on a loaded `SolutionManager` singleton. Single-file editing
 * without a loaded solution must STILL work for MEMBER resolution — the
 * sibling fallback is preserved post-fix.
 *
 * Helper under test: `resolveMemberFile(targetFile, currentFileFsPath, deps)`
 * in `client/src/commands/memberResolution.ts`. Pure async function with
 * dependency-injected LSP surface — tests pass fakes; production wires up
 * real `LanguageClientManager` deps.
 *
 * Per-test unique tmpdir avoids cross-test fixture collisions. No `vscode`
 * import anywhere in the chain — runs under plain mocha.
 */

interface Fixture {
    tmpRoot: string;
    projDir: string;
    classesDir: string;
}

function buildFixture(seedPaths: string[] = []): Fixture {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'member-res-7cbf07f7-'));
    const projDir = path.join(tmpRoot, 'Proj');
    const classesDir = path.join(projDir, 'classes');
    fs.mkdirSync(projDir, { recursive: true });
    fs.mkdirSync(classesDir, { recursive: true });

    for (const rel of seedPaths) {
        const full = path.join(tmpRoot, rel);
        fs.mkdirSync(path.dirname(full), { recursive: true });
        fs.writeFileSync(full, '! seeded\n');
    }

    return { tmpRoot, projDir, classesDir };
}

function teardownFixture(fix: Fixture | null): void {
    if (!fix) { return; }
    try {
        fs.rmSync(fix.tmpRoot, { recursive: true, force: true });
    } catch { /* best-effort */ }
}

suite('IncludeStatementCommands.MemberResolution (7cbf07f7)', () => {

    let fixtures: Fixture[] = [];

    setup(() => { fixtures = []; });
    teardown(() => {
        for (const f of fixtures) { teardownFixture(f); }
        fixtures = [];
    });

    function track(fix: Fixture): Fixture {
        fixtures.push(fix);
        return fix;
    }

    // --- (1) Bug pin — LSP returns RED-derived path; sibling check would have missed ---
    test('resolveMemberFile — when LSP returns a RED-derived path, returns it (sibling missing)', async () => {
        // Seed ONLY the LSP-returned path; sibling has no MyMember.clw.
        // Stub ignores deps and goes straight to sibling check → returns null → RED.
        const fix = track(buildFixture(['Proj/classes/MyMember.clw']));
        const lspPath = path.join(fix.classesDir, 'MyMember.clw');
        const currentFile = path.join(fix.projDir, 'SomeFile.clw');

        const deps: ResolveMemberFileDeps = {
            lspIsReady: () => true,
            lspSendRequest: async (method, params) => {
                assert.strictEqual(method, 'clarion/findFile', 'LSP method should be clarion/findFile');
                assert.deepStrictEqual(params, { filename: 'MyMember.clw' });
                return { path: lspPath, source: 'redirected' };
            }
        };

        const result = await resolveMemberFile('MyMember.clw', currentFile, deps);

        assert.strictEqual(
            result,
            lspPath,
            'expected LSP-returned path (' + lspPath + '); got ' + result +
            ' — LSP route is not engaged, sibling-only check is missing the RED-derived target'
        );
    });

    // --- (2) Regression — sibling-only when LSP not ready ---
    test('resolveMemberFile — LSP not ready: returns sibling path when present', async () => {
        const fix = track(buildFixture(['Proj/MyMember.clw']));
        const expectedPath = path.join(fix.projDir, 'MyMember.clw');
        const currentFile = path.join(fix.projDir, 'SomeFile.clw');

        let lspCalled = false;
        const deps: ResolveMemberFileDeps = {
            lspIsReady: () => false,
            lspSendRequest: async () => { lspCalled = true; return null; }
        };

        const result = await resolveMemberFile('MyMember.clw', currentFile, deps);

        assert.strictEqual(result, expectedPath, 'expected sibling path; got ' + result);
        assert.strictEqual(lspCalled, false, 'lspSendRequest must not be called when lspIsReady() is false');
    });

    // --- (3) Regression — no-solution-open mode (LSP returns null) ---
    test('resolveMemberFile — LSP returns null: falls back to sibling', async () => {
        const fix = track(buildFixture(['Proj/MyMember.clw']));
        const expectedPath = path.join(fix.projDir, 'MyMember.clw');
        const currentFile = path.join(fix.projDir, 'SomeFile.clw');

        const deps: ResolveMemberFileDeps = {
            lspIsReady: () => true,
            lspSendRequest: async () => null
        };

        const result = await resolveMemberFile('MyMember.clw', currentFile, deps);

        assert.strictEqual(
            result,
            expectedPath,
            'expected sibling fallback when LSP returns null; got ' + result
        );
    });

    // --- (4) Null guard — LSP unavailable AND sibling absent ---
    test('resolveMemberFile — LSP unavailable and sibling missing: returns null', async () => {
        const fix = track(buildFixture(/* no seeded files */));
        const currentFile = path.join(fix.projDir, 'SomeFile.clw');

        const deps: ResolveMemberFileDeps = {
            lspIsReady: () => false,
            lspSendRequest: async () => null
        };

        const result = await resolveMemberFile('MyMember.clw', currentFile, deps);

        assert.strictEqual(result, null, 'expected null when nothing resolves; got ' + result);
    });

    // --- (5) LSP error swallow — request throws → falls to sibling ---
    test('resolveMemberFile — LSP request throws: swallowed, falls back to sibling', async () => {
        const fix = track(buildFixture(['Proj/MyMember.clw']));
        const expectedPath = path.join(fix.projDir, 'MyMember.clw');
        const currentFile = path.join(fix.projDir, 'SomeFile.clw');

        const deps: ResolveMemberFileDeps = {
            lspIsReady: () => true,
            lspSendRequest: async () => { throw new Error('LSP transport failure'); }
        };

        const result = await resolveMemberFile('MyMember.clw', currentFile, deps);

        assert.strictEqual(
            result,
            expectedPath,
            'expected sibling fallback when LSP throws; got ' + result
        );
    });
});
