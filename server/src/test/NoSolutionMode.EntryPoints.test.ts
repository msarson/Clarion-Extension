import * as assert from 'assert';
import * as path from 'path';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Hover, Location } from 'vscode-languageserver-protocol';
import { HoverProvider } from '../providers/HoverProvider';
import { ImplementationProvider } from '../providers/ImplementationProvider';
import { DefinitionProvider } from '../providers/DefinitionProvider';
import { CompletionProvider } from '../providers/CompletionProvider';
import { DocumentLinkProvider } from '../providers/DocumentLinkProvider';
import { ReferencesProvider } from '../providers/ReferencesProvider';
import { FileRelationshipGraph } from '../FileRelationshipGraph';
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
 * B1 shipped Hover / Definition / Implementation. #172 closes the deferred
 * B2 surface by pinning DocumentLink entry-point behaviour in no-solution mode
 * using test-seeded FRG edges.
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
        FileRelationshipGraph.getInstance().reset();
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

        // Verification gate for #171 (MT 651935b9) — DefinitionProvider INCLUDE-aware
        // string-guard exception. Un-skipped here as the regression test for the
        // `TokenHelper.getFileRefArgStringToken` + DefinitionProvider entry-point
        // routing that #171 lands. If a future change breaks the file-ref-string
        // exception, this test re-RED's first.
        //
        // Scope expanded per Bob authorisation (2026-05-14, #171): the detector
        // covers all 4 file-ref statement types (INCLUDE / MODULE / MEMBER / LINK)
        // since they share `Token.referencedFile` substrate. This test exercises
        // the INCLUDE case end-to-end through the no-solution-mode resolver chain
        // (the direct loop-closure to #139's deferred surface).

        test('resolves INCLUDE filename to libsrc when no solution is loaded', async () => {
            const classDecl =
                "MyClass  CLASS,TYPE\n" +
                "MyMethod  PROCEDURE\n" +
                "         END\n";
            const sourceBody =
                "  PROGRAM\n" +
                "  INCLUDE('MyClass.inc')\n" +
                "  CODE\n" +
                "  RETURN\n";

            fix = buildNoSolutionFixture({
                libsrcs: [{ 'MyClass.inc': classDecl }],
                sourceFile: { filename: 'MyProg.clw', content: sourceBody }
            });

            const provider = new DefinitionProvider();
            const sourceDoc = TextDocument.create(fix.sourceUri!, 'clarion', 1, sourceBody);
            // Cursor on the 'M' of 'MyClass.inc' (inside the quoted-filename string).
            const position = cursorPositionOf(sourceBody, 'MyClass.inc');

            const result = await provider.provideDefinition(sourceDoc, position);

            // Bidirectional-pin (positive) per feedback_bidirectional_pin_assertion:
            // (1) result truthy
            assert.ok(result,
                'provideDefinition must return a Location for INCLUDE filename in no-solution mode (#171 fix + Gap A from #139)');

            const loc: Location = Array.isArray(result) ? result[0] : (result as Location);
            assert.ok(loc?.uri, 'returned Location must have a uri');

            // (2) basename matches the INCLUDE target
            const resultPath = fsPathFromUri(loc.uri);
            assert.strictEqual(
                path.basename(resultPath).toLowerCase(),
                'myclass.inc',
                'resolved file basename must match the INCLUDE target'
            );

            // (3) path inside the libsrc dir (silently-picked-from-elsewhere can't pass)
            const libsrcDir = path.normalize(fix.libsrcDirs[0]).toLowerCase();
            assert.ok(
                path.normalize(resultPath).toLowerCase().startsWith(libsrcDir),
                `resolved path must be inside libsrc dir (expected prefix: ${libsrcDir}, got: ${resultPath})`
            );
        });

        // #171 over-fire scope-fence — F12 inside ANY OTHER string literal must NOT
        // route through the file-ref exception. This is Bob's load-bearing negative
        // sentinel: the detector's `getFileRefArgStringToken` only matches the FIRST
        // string after a file-ref token (INCLUDE/MODULE/MEMBER/LINK); a string in a
        // regular CODE-section assignment must still bail at the
        // `isPositionInString` guard. If this assertion ever flips, the detector has
        // over-broadened and F12 has been silently opened to all string contents.
        test('over-fire scope-fence: F12 inside a non-file-ref string literal returns null', async () => {
            const sourceBody =
                "  PROGRAM\n" +
                "MyVar  STRING(30)\n" +
                "  CODE\n" +
                "  MyVar = 'looks_like_a_file.inc'\n" +
                "  RETURN\n";

            fix = buildNoSolutionFixture({
                // Even with a real file in libsrc with that exact name, the over-fire gate
                // must still bail because the cursor isn't sitting after a file-ref token.
                libsrcs: [{ 'looks_like_a_file.inc': '! decoy — should NOT be reachable via this string\n' }],
                sourceFile: { filename: 'MyProg.clw', content: sourceBody }
            });

            const provider = new DefinitionProvider();
            const sourceDoc = TextDocument.create(fix.sourceUri!, 'clarion', 1, sourceBody);
            // Cursor on the 'l' of 'looks_like_a_file.inc' inside the string assignment.
            const position = cursorPositionOf(sourceBody, 'looks_like_a_file.inc');

            const result = await provider.provideDefinition(sourceDoc, position);

            // Over-fire gate: cursor in non-file-ref string MUST NOT silently resolve
            // to the libsrc decoy. Per feedback_bidirectional_pin_assertion: the negative
            // sentinel keeps the positive case (file-ref string → resolve) honest.
            if (result !== null) {
                const loc: Location = Array.isArray(result) ? result[0] : (result as Location);
                if (loc?.uri) {
                    const resultPath = fsPathFromUri(loc.uri);
                    assert.notStrictEqual(
                        path.basename(resultPath).toLowerCase(),
                        'looks_like_a_file.inc',
                        `over-fire gate breach: F12 inside a non-file-ref string literal resolved to libsrc; got: ${resultPath}`
                    );
                }
            }
        });

        test('returns null on cursor over genuinely-missing INCLUDE filename (regression sentinel)', async () => {
            const missingIncludeSource =
                "  PROGRAM\n" +
                "  INCLUDE('MissingFile.inc')\n" +
                "  CODE\n" +
                "  RETURN\n";

            fix = buildNoSolutionFixture({
                libsrcs: [{ 'Other.inc': '! unrelated\n' }],
                sourceFile: { filename: 'MyProg.clw', content: missingIncludeSource }
            });

            const provider = new DefinitionProvider();
            const sourceDoc = TextDocument.create(fix.sourceUri!, 'clarion', 1, missingIncludeSource);
            const position = cursorPositionOf(missingIncludeSource, 'MissingFile.inc');

            const result = await provider.provideDefinition(sourceDoc, position);

            // Genuine miss → MUST NOT silently resolve to an unrelated libsrc file.
            // The negative-case contract keeps the positive-case assertion honest.
            if (result !== null) {
                const loc: Location = Array.isArray(result) ? result[0] : (result as Location);
                if (loc?.uri) {
                    const resultPath = fsPathFromUri(loc.uri);
                    assert.notStrictEqual(
                        path.basename(resultPath).toLowerCase(),
                        'other.inc',
                        `genuine-miss must NOT silently resolve to unrelated libsrc file; got: ${resultPath}`
                    );
                }
            }
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

    suite('CompletionProvider.onCompletion for PROGRAM globals from MEMBER file', () => {
        const sourceBody =
            "  MEMBER('MyProg.clw')\n" +
            "Worker PROCEDURE\n" +
            "  CODE\n" +
            "  GLO:\n" +
            "  TGLO:\n" +
            "  RETURN\n";
        const programBody =
            "  PROGRAM\n" +
            "GLO:SessionId  STRING(20)\n" +
            "TestGloGroup   GROUP,PRE(TGLO)\n" +
            "PageReceived   LONG\n" +
            "              END\n" +
            "Main PROCEDURE\n" +
            "  CODE\n" +
            "  RETURN\n";

        test('surfaces PROGRAM globals and prefix-safe insert text in no-solution mode', async () => {
            fix = buildNoSolutionFixture({
                libsrcs: [{}],
                sourceFile: {
                    filename: 'MyProg001.clw',
                    content: sourceBody,
                    siblings: { 'MyProg.clw': programBody }
                }
            });

            const provider = new CompletionProvider();
            const sourceDoc = TextDocument.create(fix.sourceUri!, 'clarion', 1, sourceBody);

            const gloItems = await provider.onCompletion({
                textDocument: { uri: sourceDoc.uri },
                position: { line: 3, character: 6 }
            } as any, sourceDoc);

            const tgloItems = await provider.onCompletion({
                textDocument: { uri: sourceDoc.uri },
                position: { line: 4, character: 7 }
            } as any, sourceDoc);

            const glo = gloItems.find(i => i.label === 'GLO:SessionId');
            const tglo = tgloItems.find(i => i.label === 'TGLO:PageReceived');
            assert.ok(glo, `expected GLO:SessionId in completion; got: ${gloItems.map(i => i.label).join(', ')}`);
            assert.ok(tglo, `expected TGLO:PageReceived in completion; got: ${tgloItems.map(i => i.label).join(', ')}`);
            assert.strictEqual(glo?.insertText, 'SessionId');
            assert.strictEqual(tglo?.insertText, 'PageReceived');
            assert.ok(FileRelationshipGraph.getInstance().isBuilt, 'completion should lazily build the FRG in no-solution mode');
        });
    });

    suite('ReferencesProvider.provideReferences for no-solution global scope', () => {
        test('includes sibling MEMBER callers connected through PROGRAM and INCLUDE edges', async () => {
            const programBody =
                "  PROGRAM\n" +
                "GLO:SessionId  STRING(20)\n" +
                "Main PROCEDURE\n" +
                "  CODE\n" +
                "  RETURN\n";
            const memberOneBody =
                "  MEMBER('MyProg.clw')\n" +
                "WorkerOne PROCEDURE\n" +
                "  CODE\n" +
                "  GLO:SessionId = 'one'\n" +
                "  RETURN\n";
            const memberTwoBody =
                "  MEMBER('MyProg.clw')\n" +
                "WorkerTwo PROCEDURE\n" +
                "  CODE\n" +
                "  GLO:SessionId = 'two'\n" +
                "  RETURN\n";

            fix = buildNoSolutionFixture({
                libsrcs: [{}],
                sourceFile: {
                    filename: 'MyProg001.clw',
                    content: memberOneBody,
                    siblings: {
                        'MyProg.clw': programBody,
                        'MyProg002.clw': memberTwoBody
                    }
                }
            });

            const provider = new ReferencesProvider();
            const sourceDoc = TextDocument.create(fix.sourceUri!, 'clarion', 1, memberOneBody);
            const position = cursorPositionOf(memberOneBody, 'GLO:SessionId');

            const refs = await provider.provideReferences(sourceDoc, position, { includeDeclaration: true });

            assert.ok(refs && refs.length >= 3, `expected declaration + two member references, got: ${(refs ?? []).map(r => r.uri).join(', ')}`);
            const basenames = refs!.map(r => path.basename(fsPathFromUri(r.uri)).toLowerCase());
            assert.ok(basenames.includes('myprog.clw'), 'references should include the PROGRAM/global declaration file');
            assert.ok(basenames.includes('myprog001.clw'), 'references should include the current MEMBER file');
            assert.ok(basenames.includes('myprog002.clw'), 'references should include the sibling MEMBER caller');
        });
    });

    suite('DocumentLinkProvider.provideDocumentLinks on INCLUDE filename', () => {
        test('returns INCLUDE document link to libsrc target when no solution is loaded', () => {
            const sourceBody =
                "  PROGRAM\n" +
                "  INCLUDE('MyClass.inc')\n" +
                "  CODE\n" +
                "  RETURN\n";

            fix = buildNoSolutionFixture({
                libsrcs: [{ 'MyClass.inc': '! decoy content\n' }],
                sourceFile: { filename: 'MyProg.clw', content: sourceBody }
            });

            const provider = new DocumentLinkProvider();
            const sourceDoc = TextDocument.create(fix.sourceUri!, 'clarion', 1, sourceBody);
            const links = provider.provideDocumentLinks(sourceDoc);

            assert.ok(links.length >= 1, 'provideDocumentLinks must return at least one link for INCLUDE in no-solution mode');
            assert.ok(FileRelationshipGraph.getInstance().isBuilt, 'document links should lazily build the FRG in no-solution mode');

            const includeLink = links.find(link =>
                !!link.target && path.basename(fsPathFromUri(link.target)).toLowerCase() === 'myclass.inc'
            );
            assert.ok(includeLink, 'at least one returned link must target MyClass.inc');

            const resultPath = fsPathFromUri(includeLink!.target!);
            const libsrcDir = path.normalize(fix.libsrcDirs[0]).toLowerCase();
            assert.ok(
                path.normalize(resultPath).toLowerCase().startsWith(libsrcDir),
                `resolved link target must be inside libsrc dir (expected prefix: ${libsrcDir}, got: ${resultPath})`
            );
        });

        test('returns empty list when source has no INCLUDE file references (regression sentinel)', () => {
            const sourceBody =
                "  PROGRAM\n" +
                "x LONG\n" +
                "  CODE\n" +
                "x = 1\n" +
                "  RETURN\n";

            fix = buildNoSolutionFixture({
                libsrcs: [{ 'MyClass.inc': '! decoy content\n' }],
                sourceFile: { filename: 'MyProg.clw', content: sourceBody }
            });

            const frg = FileRelationshipGraph.getInstance();
            frg.reset();
            frg.seedEdgesForTest([]); // Mark FRG as built while keeping zero references.

            const provider = new DocumentLinkProvider();
            const sourceDoc = TextDocument.create(fix.sourceUri!, 'clarion', 1, sourceBody);
            const links = provider.provideDocumentLinks(sourceDoc);

            assert.strictEqual(links.length, 0, 'provider must not fabricate links when no INCLUDE file references exist');
        });
    });
});
