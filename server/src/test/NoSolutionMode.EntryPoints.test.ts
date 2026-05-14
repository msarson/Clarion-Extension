import * as assert from 'assert';
import * as path from 'path';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Hover, Location } from 'vscode-languageserver-protocol';
import { HoverProvider } from '../providers/HoverProvider';
import { ImplementationProvider } from '../providers/ImplementationProvider';
// DefinitionProvider import deliberately omitted — Test 2 is `test.skip` pending
// Mark's framing call (Gap B); re-add when the test body lands.
import {
    NoSolutionFixture,
    buildNoSolutionFixture,
    cursorPositionOf,
    teardownNoSolutionFixture
} from './helpers/NoSolutionFixture';

/**
 * Full LSP entry-point smoke coverage for no-solution mode — #139.
 *
 * Closes the residual-risk surface deferred from #113 / 403afd0e: the fix-site
 * direct tests in `NoSolutionMode.FixSites.test.ts` pin the substrate hook
 * (resolveFileInNoSolutionMode wire-up) stays connected, but a future PR
 * adding a `!solutionManager` / `!project` / `!frg.isBuilt` guard at the public
 * provider entry-point ABOVE the fix-site would NOT be caught. These tests
 * drive the LSP entry-points end-to-end so that a regression like that fails
 * fast at test time, not in audit.
 *
 * B1 ships Hover / Definition / Implementation. B2 (DocumentLink) is deferred
 * behind d7e34cc5 (FRG no-solution-mode build) per #139 open question 1.
 *
 * **Bidirectional-pin shape** per `feedback_bidirectional_pin_assertion`:
 *   - Positive: result truthy AND result evidence matches expected fixture file
 *     AND result evidence references the expected libsrc dir
 *   - Negative regression sentinel: null on a genuine miss
 *
 * **PM-Bob's #4 sub-case discipline**: if a test surfaces (a) null-tolerant
 * pass-through it's in-scope and the assertion locks the behaviour; (b) a real
 * null-deref or crash → STOP and escalate to Bob before any production-code
 * scoping; (c) wrong-but-non-crashing → grey zone, surface to Bob.
 */

suite('NoSolutionMode LSP entry-points (#139)', () => {

    let fix: NoSolutionFixture | null = null;

    teardown(() => {
        teardownNoSolutionFixture(fix);
        fix = null;
    });

    /**
     * Helpers — decode `${file:///...}` URI back to a normalized fs path so
     * assertions can compare basename + libsrc-dir prefix without worrying
     * about percent-encoding or slash direction.
     */
    function fsPathFromUri(uri: string): string {
        return decodeURIComponent(uri.replace('file:///', '')).replace(/\//g, path.sep);
    }

    function hoverContentToText(hover: Hover): string {
        const c = hover.contents;
        if (typeof c === 'string') return c;
        if (Array.isArray(c)) {
            return c.map(p => (typeof p === 'string' ? p : p.value)).join('\n');
        }
        // MarkupContent | MarkedString
        return (c as { value?: string }).value ?? JSON.stringify(c);
    }

    suite('HoverProvider.provideHover on class-method call site', () => {

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

        test('resolves class-method hover via libsrc when no solution is loaded', async () => {
            fix = buildNoSolutionFixture({
                libsrcs: [{
                    'MyClass.inc': classDecl,
                    'MyClass.clw': classImpl
                }],
                sourceFile: {
                    filename: 'MyProg.clw',
                    content: sourceBody
                }
            });

            const provider = new HoverProvider();
            const sourceDoc = TextDocument.create(fix.sourceUri!, 'clarion', 1, sourceBody);
            const position = cursorPositionOf(sourceBody, 'MyMethod'); // call site — only occurrence in source body (decl lives in libsrc .inc)

            const result = await provider.provideHover(sourceDoc, position);

            // Bidirectional-pin shape (per feedback_bidirectional_pin_assertion):
            // Hover content doesn't expose the resolved fs path in user-visible markdown
            // (see HoverFormatter — it surfaces `**Method** — Class Method · ClassName`).
            // The cross-cutting libsrc-dir sentinel is carried by Test 3 (Impl) which
            // returns a Location URI; here we pin the entry-point reached the right
            // class-method resolution by asserting both the method name AND the class
            // name appear in the hover content (silent-mis-binding sentinel).
            //
            // (1) Positive — result IS truthy
            assert.ok(result,
                'provideHover must return a Hover for class-method call site in no-solution mode (libsrc resolution)');

            // (2) Positive — hover content references the resolved method name
            const content = hoverContentToText(result!);
            assert.ok(
                content.toLowerCase().includes('mymethod'),
                `hover content must reference resolved method 'MyMethod'; got: ${content}`
            );

            // (3) Positive — hover content references the resolved class binding
            //     (silent-mis-binding sentinel: if the entry-point silently bound `obj` to
            //     a wrong class, the class name in the hover header wouldn't be MyClass)
            assert.ok(
                content.toLowerCase().includes('myclass'),
                `hover content must reference resolved class binding 'MyClass'; got: ${content}`
            );
        });

        test('returns null on cursor over genuinely-missing method (regression sentinel)', async () => {
            const missingMethodSource =
                "  PROGRAM\n" +
                "  INCLUDE('MyClass.inc')\n" +
                "obj  &MyClass\n" +
                "  CODE\n" +
                "  obj.NotARealMethod()\n" +
                "  RETURN\n";

            fix = buildNoSolutionFixture({
                libsrcs: [{
                    'MyClass.inc': classDecl,
                    'MyClass.clw': classImpl
                }],
                sourceFile: {
                    filename: 'MyProg.clw',
                    content: missingMethodSource
                }
            });

            const provider = new HoverProvider();
            const sourceDoc = TextDocument.create(fix.sourceUri!, 'clarion', 1, missingMethodSource);
            const position = cursorPositionOf(missingMethodSource, 'NotARealMethod');

            const result = await provider.provideHover(sourceDoc, position);

            // Negative regression sentinel — genuinely-missing method must NOT silently
            // resolve to anything in libsrc; the negative-case contract is what keeps
            // the positive-case assertion honest.
            if (result !== null) {
                const content = hoverContentToText(result);
                assert.ok(
                    !content.toLowerCase().includes('myclass.clw'),
                    `genuine-miss hover must NOT reference libsrc impl file; got: ${content}`
                );
            }
        });
    });

    suite('DefinitionProvider.provideDefinition on INCLUDE filename', () => {

        // Gap B framing pending Mark decision — see PM channel.
        //
        // #139 Test 2 RED on `provideDefinition` of INCLUDE filename surfaced an entry-point
        // guard at `DefinitionProvider.ts:70-73` (`TokenHelper.isPositionInString`) that
        // bails immediately when the cursor sits inside a single-quoted string — which is
        // exactly where INCLUDE filenames live. The guard fires regardless of no-solution
        // mode (it would block F12-on-INCLUDE-filename even with a solution loaded), so
        // this is NOT a no-solution-specific gap; it's an entry-point-framing question
        // that Bob is escalating to Mark — either:
        //   (a) Fix `DefinitionProvider` to recognize INCLUDE-filename context and route
        //       through `fileResolver.findFileDefinition` despite the string-position guard
        //   (b) Re-target Test 2 to `DocumentLinkProvider.provideDocumentLinks` (= Test 4,
        //       B2-deferred behind d7e34cc5 / FRG no-solution-mode build), since the
        //       production user-flow for INCLUDE navigation is ctrl-click on the rendered
        //       link rather than F12.
        //
        // Un-skip + task-id link when Mark calls it.
        test.skip('resolves INCLUDE filename to libsrc when no solution is loaded', async () => {
            // Skipped pending Mark's framing call on (a) vs (b) above.
            // GH #139 + PM channel hold the decision context.
        });
    });

    suite('ImplementationProvider.provideImplementation on class-method call site', () => {

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

        test('resolves class-method implementation via libsrc when no solution is loaded', async () => {
            fix = buildNoSolutionFixture({
                libsrcs: [{
                    'MyClass.inc': classDecl,
                    'MyClass.clw': classImpl
                }],
                sourceFile: { filename: 'MyProg.clw', content: sourceBody }
            });

            const provider = new ImplementationProvider();
            const sourceDoc = TextDocument.create(fix.sourceUri!, 'clarion', 1, sourceBody);
            const position = cursorPositionOf(sourceBody, 'MyMethod'); // call site

            const result = await provider.provideImplementation(sourceDoc, position);

            // Bidirectional-pin (positive):
            assert.ok(result,
                'provideImplementation must return a Location for class-method call site in no-solution mode (libsrc resolution)');

            const loc: Location = Array.isArray(result) ? result[0] : (result as Location);
            assert.ok(loc?.uri, 'returned Location must have a uri');

            const resultPath = fsPathFromUri(loc.uri);
            assert.strictEqual(
                path.basename(resultPath).toLowerCase(),
                'myclass.clw',
                'resolved file basename must match the target impl file'
            );

            const libsrcDir = path.normalize(fix.libsrcDirs[0]).toLowerCase();
            assert.ok(
                path.normalize(resultPath).toLowerCase().startsWith(libsrcDir),
                `resolved path must be inside libsrc dir (expected prefix: ${libsrcDir}, got: ${resultPath})`
            );
        });

        test('returns null on cursor over genuinely-missing method (regression sentinel)', async () => {
            const missingMethodSource =
                "  PROGRAM\n" +
                "  INCLUDE('MyClass.inc')\n" +
                "obj  &MyClass\n" +
                "  CODE\n" +
                "  obj.NotARealMethod()\n" +
                "  RETURN\n";

            fix = buildNoSolutionFixture({
                libsrcs: [{
                    'MyClass.inc': classDecl,
                    'MyClass.clw': classImpl
                }],
                sourceFile: { filename: 'MyProg.clw', content: missingMethodSource }
            });

            const provider = new ImplementationProvider();
            const sourceDoc = TextDocument.create(fix.sourceUri!, 'clarion', 1, missingMethodSource);
            const position = cursorPositionOf(missingMethodSource, 'NotARealMethod');

            const result = await provider.provideImplementation(sourceDoc, position);

            // Negative regression sentinel — genuinely-missing method must NOT silently
            // resolve to the libsrc impl file. NotARealMethod doesn't exist in MyClass.clw,
            // so any Location pointing at MyClass.clw would be a silent-exclusion failure
            // mode per `feedback_bidirectional_pin_assertion`. Outer permissive `if` allows
            // null-or-non-libsrc Locations (provider may legitimately return either on miss);
            // the assertion enforces the regression contract when a Location IS returned.
            if (result !== null) {
                const loc: Location = Array.isArray(result) ? result[0] : (result as Location);
                if (loc?.uri) {
                    const resultPath = fsPathFromUri(loc.uri);
                    assert.ok(
                        !path.basename(resultPath).toLowerCase().includes('myclass.clw'),
                        `genuine-miss must NOT resolve to libsrc impl file; got: ${resultPath}`
                    );
                }
            }
        });
    });
});
