import * as assert from 'assert';
import * as path from 'path';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { FileDefinitionResolver } from '../utils/FileDefinitionResolver';
import { ImplementationProvider } from '../providers/ImplementationProvider';
import { HoverProvider } from '../providers/HoverProvider';
import {
    NoSolutionFixture,
    buildNoSolutionFixture,
    teardownNoSolutionFixture
} from './helpers/NoSolutionFixture';

/**
 * Fix-site direct tests for the C2 server-side no-solution-mode remediation
 * (#113 / 403afd0e item [5], B-retargeted-on-LIVE scope per Bob 2026-05-12).
 *
 * Targets the LIVE fix-sites Eve's commit will modify, NOT the dead Def pair
 * her D1 audit caught. Each test invokes the live method directly with no-solution
 * fixture state and pins the bidirectional assertion shape per
 * `feedback_bidirectional_pin_assertion`:
 *   - Positive: result IS truthy AND result references the expected fixture file
 *     AND result is inside the expected fixture libsrc dir (not silently picked
 *     from elsewhere)
 *   - Negative: today (RED), result is null because of the un-fixed bail
 *
 * Expected lifecycle:
 *   - At task start (pre-Eve-fix): all tests RED — providers bail at function entry
 *     when `SolutionManager.getInstance()` is null
 *   - After Eve's C2 commit lands: all tests GREEN — providers route through
 *     `resolveFileInNoSolutionMode` substrate (or thin wrapper)
 *
 * **Residual risk surface** (per Bob's GH #113 close-out directive): these tests
 * cover the fix-site method only. A future PR adding a `!solutionManager` /
 * `!project` / `!frg.isBuilt` guard at the public provider entry-point ABOVE
 * the fix-site (e.g., in `DefinitionProvider.provideDefinition` before
 * `this.fileResolver.findFileDefinition` is called) would NOT be caught by
 * these tests. Audit practice is the load-bearing prevention layer for that
 * regression class; full LSP-entry-point coverage is filed as a follow-up.
 */

suite('NoSolutionMode fix-sites (#113 C2)', () => {

    let fix: NoSolutionFixture | null = null;

    teardown(() => {
        teardownNoSolutionFixture(fix);
        fix = null;
    });

    suite('FileDefinitionResolver.findFileDefinition (line 109)', () => {

        test('resolves file in libsrc when no solution is loaded', async () => {
            fix = buildNoSolutionFixture({
                libsrcs: [{ 'StringTheory.inc': '! class declaration body\n' }],
                sourceFile: {
                    filename: 'MyProg.clw',
                    content: "  PROGRAM\n  INCLUDE('StringTheory.inc')\n  CODE\n  RETURN\n"
                }
            });

            const resolver = new FileDefinitionResolver();
            const result = await resolver.findFileDefinition('StringTheory.inc', fix.sourceUri!);

            // Bidirectional-pin shape:
            // (1) Positive — result IS truthy (not silently null)
            assert.ok(result, 'findFileDefinition must return a Location in no-solution mode when file is in libsrc');
            assert.ok(result!.uri, 'returned Location must have a uri');

            // (2) Positive — result references the expected fixture file
            const resultPath = decodeURIComponent(result!.uri.replace('file:///', '')).replace(/\//g, path.sep);
            assert.strictEqual(
                path.basename(resultPath).toLowerCase(),
                'stringtheory.inc',
                'resolved file basename must match the target'
            );

            // (3) Positive — result is INSIDE the expected libsrc dir (silently-picked-from-elsewhere can't pass)
            const libsrcDir = path.normalize(fix.libsrcDirs[0]).toLowerCase();
            assert.ok(
                path.normalize(resultPath).toLowerCase().startsWith(libsrcDir),
                `resolved path must be inside libsrc dir (expected prefix: ${libsrcDir}, got: ${resultPath})`
            );
        });

        test('returns null when file is genuinely missing (regression sentinel)', async () => {
            fix = buildNoSolutionFixture({
                libsrcs: [{ 'Other.inc': '! unrelated\n' }],
                sourceFile: {
                    filename: 'MyProg.clw',
                    content: "  PROGRAM\n  INCLUDE('Missing.inc')\n  CODE\n  RETURN\n"
                }
            });

            const resolver = new FileDefinitionResolver();
            const result = await resolver.findFileDefinition('Missing.inc', fix.sourceUri!);

            assert.strictEqual(result, null,
                'findFileDefinition must return null when the file is genuinely missing — keeps the negative-case contract honest after Eve fix lands');
        });

        test('resolves source-relative file (localDir tier) when no solution is loaded', async () => {
            fix = buildNoSolutionFixture({
                libsrcs: [],
                sourceFile: {
                    filename: 'MyProg.clw',
                    content: "  PROGRAM\n  INCLUDE('Shared.inc')\n  CODE\n  RETURN\n",
                    siblings: { 'Shared.inc': '! sibling include in source dir\n' }
                }
            });

            const resolver = new FileDefinitionResolver();
            const result = await resolver.findFileDefinition('Shared.inc', fix.sourceUri!);

            // Note: the un-fixed `findFileDefinition` already has a `path.join(currentDir, fileName)`
            // fallback at line 134-141 that works WITHOUT the solution path. So this test passes
            // TODAY (pre-Eve-fix). It exists as a substrate-symmetry sentinel for the localDir
            // tier — proves the fallback works in no-solution mode and pins the assertion shape.
            assert.ok(result, 'localDir-tier fallback should resolve sibling file in source dir');
            const resultPath = decodeURIComponent(result!.uri.replace('file:///', '')).replace(/\//g, path.sep);
            assert.strictEqual(path.basename(resultPath).toLowerCase(), 'shared.inc');

            const sourceDir = path.normalize(fix.sourceDir!).toLowerCase();
            assert.ok(
                path.normalize(resultPath).toLowerCase().startsWith(sourceDir),
                'localDir-tier resolution must be inside source dir'
            );
        });
    });

    suite('ImplementationProvider.findMethodImplementationCrossFile (line 855)', () => {

        test('resolves class-method implementation in libsrc when no solution is loaded', async () => {
            const classImpl = "MyClass.MyMethod  PROCEDURE\n  CODE\n  RETURN\n";
            fix = buildNoSolutionFixture({
                libsrcs: [{ 'MyClass.clw': classImpl }],
                sourceFile: {
                    filename: 'MyProg.clw',
                    content: "  PROGRAM\n  INCLUDE('MyClass.inc')\n  CODE\n  obj.MyMethod()\n  RETURN\n"
                }
            });

            const provider = new ImplementationProvider();
            const sourceDoc = TextDocument.create(fix.sourceUri!, 'clarion', 1,
                "  PROGRAM\n  INCLUDE('MyClass.inc')\n  CODE\n  obj.MyMethod()\n  RETURN\n");

            // findMethodImplementationCrossFile is private; cast through `any` per Bob's spec.
            // Args: (className, methodName, currentDocument, paramCount?, moduleFile?, declarationSignature?, declarationFile?)
            const result = await (provider as any).findMethodImplementationCrossFile(
                'MyClass',
                'MyMethod',
                sourceDoc,
                undefined,
                'MyClass.clw'  // moduleFile hint → resolver should find this in libsrc
            );

            // Bidirectional-pin shape:
            // (1) Positive — result IS truthy
            assert.ok(result, 'findMethodImplementationCrossFile must return a Location in no-solution mode when impl is in libsrc');
            assert.ok(result.uri, 'returned Location must have a uri');

            // (2) Positive — result references the expected libsrc file
            const resultPath = decodeURIComponent(result.uri.replace('file:///', '')).replace(/\//g, path.sep);
            assert.strictEqual(
                path.basename(resultPath).toLowerCase(),
                'myclass.clw',
                'resolved file basename must match the target impl file'
            );

            // (3) Positive — result is INSIDE the expected libsrc dir
            const libsrcDir = path.normalize(fix.libsrcDirs[0]).toLowerCase();
            assert.ok(
                path.normalize(resultPath).toLowerCase().startsWith(libsrcDir),
                `resolved path must be inside libsrc dir (expected prefix: ${libsrcDir}, got: ${resultPath})`
            );
        });
    });

    suite('MethodHoverResolver.findMethodImplementationCrossFile (line 478)', () => {

        test('resolves class-method implementation in libsrc when no solution is loaded', async () => {
            const classImpl = "MyClass.MyMethod  PROCEDURE\n  CODE\n  RETURN\n";
            fix = buildNoSolutionFixture({
                libsrcs: [{ 'MyClass.clw': classImpl }],
                sourceFile: {
                    filename: 'MyProg.clw',
                    content: "  PROGRAM\n  INCLUDE('MyClass.inc')\n  CODE\n  obj.MyMethod()\n  RETURN\n"
                }
            });

            // MethodHoverResolver requires constructed deps; cleanest path is to
            // extract it from a fully-built HoverProvider instance.
            const hover = new HoverProvider();
            const methodResolver = (hover as any).methodResolver;
            assert.ok(methodResolver, 'HoverProvider must expose methodResolver internally');

            const sourceDoc = TextDocument.create(fix.sourceUri!, 'clarion', 1,
                "  PROGRAM\n  INCLUDE('MyClass.inc')\n  CODE\n  obj.MyMethod()\n  RETURN\n");

            // findMethodImplementationCrossFile is private; cast through `any` per Bob's spec.
            // Args: (className, methodName, currentDocument, paramCount?, moduleFile?)
            const result = await methodResolver.findMethodImplementationCrossFile(
                'MyClass',
                'MyMethod',
                sourceDoc,
                undefined,
                'MyClass.clw'  // moduleFile hint → resolver should find this in libsrc
            );

            // Bidirectional-pin shape (return is `${fileUri}:${implLine}` string here, NOT a Location):
            // (1) Positive — result IS truthy
            assert.ok(result, 'findMethodImplementationCrossFile must return a non-null result in no-solution mode when impl is in libsrc');
            assert.strictEqual(typeof result, 'string', 'result must be a `${fileUri}:${implLine}` string');

            // (2) Positive — result string references the expected libsrc file basename
            assert.ok(
                result.toLowerCase().includes('myclass.clw'),
                `result must reference target impl file 'MyClass.clw', got: ${result}`
            );

            // (3) Positive — result string contains the libsrc dir path
            const libsrcDirNormalized = path.normalize(fix.libsrcDirs[0]).replace(/\\/g, '/').toLowerCase();
            assert.ok(
                result.toLowerCase().includes(libsrcDirNormalized),
                `result must point inside libsrc dir (expected substring: ${libsrcDirNormalized}, got: ${result})`
            );
        });
    });
});
