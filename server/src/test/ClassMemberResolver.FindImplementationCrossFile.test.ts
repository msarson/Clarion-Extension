import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { ClassMemberResolver, MemberInfo } from '../utils/ClassMemberResolver';
import { ImplementationProvider } from '../providers/ImplementationProvider';
import { HoverProvider } from '../providers/HoverProvider';
import { SolutionManager } from '../solution/solutionManager';
import {
    NoSolutionFixture,
    buildNoSolutionFixture,
    teardownNoSolutionFixture
} from './helpers/NoSolutionFixture';

/**
 * Unit suite for `ClassMemberResolver.findImplementationCrossFile` — backfills
 * the zero-coverage gap surfaced by Eve at `6253f9d5` Phase A / GH #112 / MT
 * `72574468`. The function is load-bearing in two production scenarios:
 *
 *   1. **No-solution-open mode** — `SM.solution=null` + `FRG.isBuilt=false`
 *      → tiers 1+2+3 all bail → sibling-dir fallback at lines 1074-1078 is
 *      the only working path.
 *   2. **Cross-directory `.inc`/`.clw` siblings outside `.red` paths** —
 *      SM-loaded but redirection parser doesn't enumerate the dir holding
 *      the `.inc`; impl `.clw` sits next to `.inc` on disk → the same
 *      sibling-dir fallback hits.
 *
 * Both scenarios pin the **sibling-dir fallback** (line 1074, ratified KEEP
 * via `6253f9d5` Phase A — load-bearing cluster, DO NOT MODIFY IN ISOLATION
 * per the inline comment block). Per Bob's #112 spec the fallback "MUST be
 * explicitly pinned, not just exercised" — each positive test asserts the
 * resolved path is inside the directory the fallback would walk, NOT a path
 * the FRG/redirection/source-files tiers would have produced.
 *
 * Bidirectional-pin per `feedback_bidirectional_pin_assertion` on every
 * positive case (positive: Location truthy + correct file + correct path
 * tier; negative regression sentinel: null on genuine miss).
 *
 * **Caller-integration tests** (smoke through public API) are landed in
 * separate items per the #112 checklist matrix.
 */

interface CrossDirFixture {
    tmpRoot: string;
    /** Directory containing the source file (`src/`) — `MyProg.clw` lives here. */
    sourceDir: string;
    /** Directory NOT in `.red` paths, holding `MyClass.inc` + `MyClass.clw` siblings (`extras/`). */
    extrasDir: string;
    /** Directory the SolutionManager mock will claim is its only sourceFiles[] dir (`src/`). */
    sourceUri: string;
    /** Absolute path to the source file. */
    sourceFile: string;
    /** Absolute path to `extras/MyClass.inc`. */
    incFile: string;
    /** Absolute path to `extras/MyClass.clw` (the sibling-dir-fallback target). */
    clwFile: string;
}

let _crossDirSavedSm: SolutionManager | null = null;
let _crossDirActive = false;

function buildCrossDirFixture(opts: {
    classDecl: string;
    classImpl: string;
    /** When false, MyClass.clw is NOT written to extras/ — negative regression sentinel. */
    writeClw?: boolean;
}): CrossDirFixture {
    if (_crossDirActive) {
        throw new Error('Cross-dir fixture already active — teardown first');
    }
    _crossDirActive = true;

    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), '#112-cross-dir-'));
    const sourceDir = path.join(tmpRoot, 'src');
    const extrasDir = path.join(tmpRoot, 'extras');
    fs.mkdirSync(sourceDir, { recursive: true });
    fs.mkdirSync(extrasDir, { recursive: true });

    const sourceFile = path.join(sourceDir, 'MyProg.clw');
    fs.writeFileSync(sourceFile, "  PROGRAM\n  CODE\n  RETURN\n");
    const sourceUri = `file:///${sourceFile.replace(/\\/g, '/').replace(/:/g, '%3A')}`;

    const incFile = path.join(extrasDir, 'MyClass.inc');
    fs.writeFileSync(incFile, opts.classDecl);

    const clwFile = path.join(extrasDir, 'MyClass.clw');
    if (opts.writeClw !== false) {
        fs.writeFileSync(clwFile, opts.classImpl);
    }

    // Minimal SolutionManager shim:
    //   - project.path = sourceDir (NOT extrasDir — proves the fallback hit, not tier-3)
    //   - getRedirectionParser().findFile() returns null (redirection doesn't enumerate extras/)
    //   - sourceFiles[] excludes extras/MyClass.clw (proves tier-3 didn't hit either)
    const fakeProject = {
        path: sourceDir,
        sourceFiles: [{ relativePath: 'MyProg.clw' }],
        getRedirectionParser: () => ({
            findFile: (_: string) => null
        })
    };
    const fakeSolution = { projects: [fakeProject] };
    const fakeSm = { solution: fakeSolution } as unknown as SolutionManager;

    _crossDirSavedSm = (SolutionManager as unknown as { instance: SolutionManager | null }).instance;
    (SolutionManager as unknown as { instance: SolutionManager | null }).instance = fakeSm;

    return { tmpRoot, sourceDir, extrasDir, sourceUri, sourceFile, incFile, clwFile };
}

function teardownCrossDirFixture(fix: CrossDirFixture | null): void {
    if (!_crossDirActive) return;
    (SolutionManager as unknown as { instance: SolutionManager | null }).instance = _crossDirSavedSm;
    _crossDirSavedSm = null;
    if (fix) {
        try { fs.rmSync(fix.tmpRoot, { recursive: true, force: true }); } catch { /* best-effort */ }
    }
    _crossDirActive = false;
}

function fsPathFromUri(uri: string): string {
    return decodeURIComponent(uri.replace('file:///', '')).replace(/\//g, path.sep);
}

suite('ClassMemberResolver.findImplementationCrossFile (#112)', () => {

    let resolver: ClassMemberResolver;

    setup(() => {
        resolver = new ClassMemberResolver();
    });

    // ─── Scenario 1 — No-solution-open mode ────────────────────────────────
    suite('Scenario 1 — no-solution-open mode (sibling-dir fallback is only working path)', () => {

        let nsFix: NoSolutionFixture | null = null;

        teardown(() => {
            teardownNoSolutionFixture(nsFix);
            nsFix = null;
        });

        const classDecl =
            "MyClass  CLASS,TYPE\n" +
            "MyMethod  PROCEDURE\n" +
            "         END\n";
        const classImpl =
            "  MEMBER('MyClass.inc')\n" +
            "MyClass.MyMethod  PROCEDURE\n" +
            "  CODE\n" +
            "  RETURN\n";

        test('positive — resolves impl in libsrc-resident sibling .clw (sibling-dir fallback)', async () => {
            nsFix = buildNoSolutionFixture({
                libsrcs: [{
                    'MyClass.inc': classDecl,
                    'MyClass.clw': classImpl
                }],
                sourceFile: {
                    filename: 'MyProg.clw',
                    content: "  PROGRAM\n  INCLUDE('MyClass.inc')\n  CODE\n  RETURN\n"
                }
            });

            const incPath = path.join(nsFix.libsrcDirs[0], 'MyClass.inc');
            const memberInfo: MemberInfo = {
                type: 'PROCEDURE',
                className: 'MyClass',
                line: 1, // `MyMethod  PROCEDURE` on line 1 (0-based) of classDecl
                file: incPath
            };
            const sourceDoc = TextDocument.create(nsFix.sourceUri!, 'clarion', 1,
                "  PROGRAM\n  INCLUDE('MyClass.inc')\n  CODE\n  RETURN\n");

            const result = await resolver.findImplementationCrossFile(
                'MyClass', 'MyMethod', memberInfo, sourceDoc
            );

            // Bidirectional-pin (positive):
            assert.ok(result,
                'findImplementationCrossFile must return Location in no-solution mode (sibling-dir fallback is the only path)');
            const resultPath = fsPathFromUri(result!.uri);
            assert.strictEqual(
                path.basename(resultPath).toLowerCase(),
                'myclass.clw',
                'resolved basename must match the impl file'
            );
            // **Tier-trace assertion (Bob #112 spec — fallback must be EXPLICITLY pinned):**
            // SolutionManager.instance is null in no-solution mode, so tier 2 (redirection)
            // and tier 3 (project sourceFiles) bail at the SM-null check. FRG is unbuilt
            // (default test state). The ONLY remaining path is the sibling-dir fallback at
            // line 1074. The resolved path being inside libsrc (where we wrote the sibling)
            // is the structural proof the fallback hit.
            const libsrcDir = path.normalize(nsFix.libsrcDirs[0]).toLowerCase();
            assert.ok(
                path.normalize(resultPath).toLowerCase().startsWith(libsrcDir),
                `resolved path must be inside libsrc dir — proves sibling-dir fallback hit (expected prefix: ${libsrcDir}, got: ${resultPath})`
            );
        });

        test('negative — genuinely-missing method returns null (regression sentinel)', async () => {
            nsFix = buildNoSolutionFixture({
                libsrcs: [{
                    'MyClass.inc': classDecl,
                    'MyClass.clw': classImpl  // has MyMethod, NOT NotARealMethod
                }],
                sourceFile: {
                    filename: 'MyProg.clw',
                    content: "  PROGRAM\n  INCLUDE('MyClass.inc')\n  CODE\n  RETURN\n"
                }
            });

            const incPath = path.join(nsFix.libsrcDirs[0], 'MyClass.inc');
            const memberInfo: MemberInfo = {
                type: 'PROCEDURE',
                className: 'MyClass',
                line: 1,
                file: incPath
            };
            const sourceDoc = TextDocument.create(nsFix.sourceUri!, 'clarion', 1,
                "  PROGRAM\n  INCLUDE('MyClass.inc')\n  CODE\n  RETURN\n");

            // Method name doesn't exist anywhere in MyClass.clw — must return null.
            // Keeps the positive-case contract honest per feedback_bidirectional_pin_assertion.
            const result = await resolver.findImplementationCrossFile(
                'MyClass', 'NotARealMethod', memberInfo, sourceDoc
            );

            assert.strictEqual(result, null,
                'findImplementationCrossFile must return null for genuinely-missing method (no silent resolution)');
        });
    });

    // ─── Scenario 2 — Cross-directory siblings outside .red paths ──────────
    suite('Scenario 2 — cross-dir .inc/.clw siblings outside .red paths', () => {

        let cdFix: CrossDirFixture | null = null;

        teardown(() => {
            teardownCrossDirFixture(cdFix);
            cdFix = null;
        });

        const classDecl =
            "MyClass  CLASS,TYPE\n" +
            "MyMethod  PROCEDURE\n" +
            "         END\n";
        const classImpl =
            "  MEMBER('MyClass.inc')\n" +
            "MyClass.MyMethod  PROCEDURE\n" +
            "  CODE\n" +
            "  RETURN\n";

        test('positive — resolves impl via sibling-dir fallback when redirection misses', async () => {
            cdFix = buildCrossDirFixture({ classDecl, classImpl });

            const memberInfo: MemberInfo = {
                type: 'PROCEDURE',
                className: 'MyClass',
                line: 1,
                file: cdFix.incFile  // points at extras/MyClass.inc — OUTSIDE the project's sourceDir
            };
            const sourceDoc = TextDocument.create(cdFix.sourceUri, 'clarion', 1,
                "  PROGRAM\n  CODE\n  RETURN\n");

            const result = await resolver.findImplementationCrossFile(
                'MyClass', 'MyMethod', memberInfo, sourceDoc
            );

            // Bidirectional-pin (positive):
            assert.ok(result,
                'findImplementationCrossFile must return Location when sibling .clw exists next to .inc outside .red paths');
            const resultPath = fsPathFromUri(result!.uri);
            assert.strictEqual(
                path.basename(resultPath).toLowerCase(),
                'myclass.clw',
                'resolved basename must match the impl file'
            );
            // **Tier-trace assertion (Bob #112 spec — fallback EXPLICITLY pinned):**
            // SM-loaded with redirection returning null + sourceFiles[] excluding extras/ →
            // tier 2 (redirection-CLW) misses, tier 3 (project sourceFiles) misses.
            // Resolved path inside `extras/` (NOT `src/` which is the project.path) is the
            // structural proof the sibling-dir fallback hit (and NOT a tier-3 same-name
            // fall-through, since extras/ isn't in sourceFiles).
            const extrasDirNormalized = path.normalize(cdFix.extrasDir).toLowerCase();
            assert.ok(
                path.normalize(resultPath).toLowerCase().startsWith(extrasDirNormalized),
                `resolved path must be inside extras/ (cross-dir sibling) — proves sibling-dir fallback hit, NOT tier-3 sourceFiles walk (expected prefix: ${extrasDirNormalized}, got: ${resultPath})`
            );
        });

        test('negative — no sibling .clw on disk returns null (regression sentinel)', async () => {
            // Same fixture shape but withhold the .clw file — proves the fallback
            // returns null when the candidate path doesn't exist, rather than silently
            // resolving to some other tier's result.
            cdFix = buildCrossDirFixture({ classDecl, classImpl, writeClw: false });

            const memberInfo: MemberInfo = {
                type: 'PROCEDURE',
                className: 'MyClass',
                line: 1,
                file: cdFix.incFile
            };
            const sourceDoc = TextDocument.create(cdFix.sourceUri, 'clarion', 1,
                "  PROGRAM\n  CODE\n  RETURN\n");

            const result = await resolver.findImplementationCrossFile(
                'MyClass', 'MyMethod', memberInfo, sourceDoc
            );

            assert.strictEqual(result, null,
                'findImplementationCrossFile must return null when sibling .clw is genuinely missing (no silent resolution from another tier)');
        });
    });

    // ─── Caller-integration smoke (Scenario 1 — no-solution-open mode) ──────
    //
    // The two production callers (#112 acceptance):
    //   - ImplementationProvider.ts:489 + :504 — Go-to-Implementation on typed-method calls
    //   - MethodHoverResolver.ts:345 — chained-method-call hover (covers single-level
    //     typed-var class methods + multi-segment chains)
    //
    // These tests deliberately overlap with #139 Tests 1 + 3 in source-shape and fixture
    // (same `obj.MyMethod()` call site in no-solution mode resolving via libsrc), but
    // the framing is different and the test FILE is the discoverable #112 coverage
    // surface. A future reader of #112 should not have to know about #139 to verify
    // the caller-integration acceptance criterion was met. Cross-reference noted here
    // so the overlap is audit-trail-visible per Bob's "name explicit decisions" discipline.
    suite('Caller integration (Scenario 1) — both callers reach findImplementationCrossFile', () => {

        let nsFix: NoSolutionFixture | null = null;

        teardown(() => {
            teardownNoSolutionFixture(nsFix);
            nsFix = null;
        });

        const classDecl =
            "MyClass  CLASS,TYPE\n" +
            "MyMethod  PROCEDURE\n" +
            "         END\n";
        const classImpl =
            "  MEMBER('MyClass.inc')\n" +
            "MyClass.MyMethod  PROCEDURE\n" +
            "  CODE\n" +
            "  RETURN\n";
        const sourceBody =
            "  PROGRAM\n" +
            "  INCLUDE('MyClass.inc')\n" +
            "obj  &MyClass\n" +
            "  CODE\n" +
            "  obj.MyMethod()\n" +
            "  RETURN\n";

        test('ImplementationProvider.provideImplementation reaches findImplementationCrossFile (Go-to-Impl)', async () => {
            nsFix = buildNoSolutionFixture({
                libsrcs: [{
                    'MyClass.inc': classDecl,
                    'MyClass.clw': classImpl
                }],
                sourceFile: { filename: 'MyProg.clw', content: sourceBody }
            });

            const provider = new ImplementationProvider();
            const sourceDoc = TextDocument.create(nsFix.sourceUri!, 'clarion', 1, sourceBody);
            // Cursor on the 'M' of 'MyMethod' in `obj.MyMethod()` call site.
            const lines = sourceBody.split('\n');
            const callLineIdx = lines.findIndex(l => l.includes('obj.MyMethod()'));
            const callLine = lines[callLineIdx];
            const methodCharIdx = callLine.indexOf('MyMethod');

            const result = await provider.provideImplementation(sourceDoc, { line: callLineIdx, character: methodCharIdx });

            // Bidirectional-pin: positive Location URI inside libsrc dir + correct basename.
            // The chain provideImplementation → memberLocator.resolveDotAccess →
            // memberResolver.findImplementationCrossFile is what's being pinned.
            assert.ok(result,
                'provideImplementation must reach findImplementationCrossFile and return Location for typed-method call site in no-solution mode');
            const loc = Array.isArray(result) ? result[0] : result;
            const resultPath = fsPathFromUri(loc!.uri);
            assert.strictEqual(
                path.basename(resultPath).toLowerCase(),
                'myclass.clw',
                'caller-integration: returned Location basename must match the impl file'
            );
            const libsrcDir = path.normalize(nsFix.libsrcDirs[0]).toLowerCase();
            assert.ok(
                path.normalize(resultPath).toLowerCase().startsWith(libsrcDir),
                `caller-integration: chain must resolve through findImplementationCrossFile's sibling-dir fallback (resolved path inside libsrc, got: ${resultPath})`
            );
        });

        test('MethodHoverResolver chained-method-call hover reaches findImplementationCrossFile', async () => {
            nsFix = buildNoSolutionFixture({
                libsrcs: [{
                    'MyClass.inc': classDecl,
                    'MyClass.clw': classImpl
                }],
                sourceFile: { filename: 'MyProg.clw', content: sourceBody }
            });

            const provider = new HoverProvider();
            const sourceDoc = TextDocument.create(nsFix.sourceUri!, 'clarion', 1, sourceBody);
            const lines = sourceBody.split('\n');
            const callLineIdx = lines.findIndex(l => l.includes('obj.MyMethod()'));
            const callLine = lines[callLineIdx];
            const methodCharIdx = callLine.indexOf('MyMethod');

            const result = await provider.provideHover(sourceDoc, { line: callLineIdx, character: methodCharIdx });

            // Bidirectional-pin: positive Hover with method-and-class binding.
            // The chain provideHover → StructureFieldResolver.resolveFieldAccess →
            // memberLocator (resolveVariableType + findMemberInClass) →
            // MethodHoverResolver.resolveChainedMethodCall →
            // memberResolver.findImplementationCrossFile is what's being pinned.
            // (Note: hover content doesn't expose the resolved fs path in user-visible
            // markdown — see #139 Test 1 docstring — so the libsrc-dir sentinel is carried
            // cross-cuttingly by the ImplementationProvider sibling above.)
            assert.ok(result,
                'provideHover must reach findImplementationCrossFile via chained-method-call path');
            const content = (() => {
                const c = result!.contents;
                if (typeof c === 'string') return c;
                if (Array.isArray(c)) return c.map(p => (typeof p === 'string' ? p : p.value)).join('\n');
                return (c as { value?: string }).value ?? '';
            })();
            assert.ok(
                content.toLowerCase().includes('mymethod'),
                `caller-integration: hover content must reference the resolved method; got: ${content}`
            );
            assert.ok(
                content.toLowerCase().includes('myclass'),
                `caller-integration: hover content must reference the resolved class binding; got: ${content}`
            );
        });
    });
});
