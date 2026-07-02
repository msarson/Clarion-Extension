import * as assert from 'assert';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { WorkspaceEdit, TextEdit, TextDocumentEdit } from 'vscode-languageserver-protocol';
import { TokenCache } from '../TokenCache';
import { RenameProvider } from '../providers/RenameProvider';
import { SolutionManager } from '../solution/solutionManager';
import { serverSettings } from '../serverSettings';
import { setServerInitialized } from '../serverState';

function createDocument(content: string, uri: string = 'file:///test.clw'): TextDocument {
    return TextDocument.create(uri, 'clarion', 1, content);
}

function seedCache(document: TextDocument): void {
    TokenCache.getInstance().getTokens(document);
}

/** Extract the TextEdits for a given uri from a #196 documentChanges WorkspaceEdit. */
function editsForUri(edit: WorkspaceEdit | null, uri: string): TextEdit[] {
    for (const c of edit?.documentChanges ?? []) {
        if (TextDocumentEdit.is(c) && c.textDocument.uri === uri) return c.edits as TextEdit[];
    }
    return [];
}

/**
 * Build a minimal SolutionManager stub whose projects' redirection parsers report
 * each entry of `resolvable` as a real on-disk file (we point at this test file,
 * which fs.existsSync confirms), and everything else as unresolvable.
 */
function stubSolutionManager(resolvable: string[] = []): void {
    const knownFile = __filename; // a guaranteed-existing file on this test run
    const knownLower = resolvable.map(f => f.toLowerCase());
    const stub = {
        solution: {
            projects: [
                {
                    getRedirectionParser: () => ({
                        findFile: (name: string) =>
                            knownLower.includes(name.toLowerCase())
                                ? { path: knownFile }
                                : null
                    })
                }
            ]
        }
    };
    (SolutionManager as any).instance = stub;
}

function clearSolutionManager(): void {
    (SolutionManager as any).instance = null;
}

suite('RenameProvider', () => {
    let provider: RenameProvider;

    setup(() => {
        setServerInitialized(true);
        TokenCache.getInstance().clearAllTokens();
        serverSettings.libsrcPaths = [];
        clearSolutionManager();
        provider = new RenameProvider();
    });

    teardown(() => {
        clearSolutionManager();
    });

    // ─── prepareRename ────────────────────────────────────────────────────────

    suite('prepareRename', () => {

        test('returns range when cursor is on a known local variable', async () => {
            const code = [
                'MyProc PROCEDURE',
                '  Counter  LONG',
                'CODE',
                '  Counter = 0',
                '  Counter += 1',
            ].join('\n');
            const doc = createDocument(code);
            seedCache(doc);

            // Cursor on "Counter" at line 3
            const result = await provider.prepareRename(doc, { line: 3, character: 3 });
            assert.ok(result !== null, 'prepareRename should return a range for a known symbol');
        });

        test('rejects with error when cursor is on an empty position', async () => {
            const doc = createDocument('MyProc PROCEDURE\nCODE\n  RETURN');
            seedCache(doc);

            try {
                await provider.prepareRename(doc, { line: 1, character: 0 });
                assert.fail('Should have thrown for blank position');
            } catch (e: any) {
                assert.ok(e.message, 'Should have an error message');
            }
        });

        test('rejects when file is in a libsrc directory', async () => {
            serverSettings.libsrcPaths = ['c:\\clarion\\clarion11.1\\libsrc\\win'];
            const code = 'SomeProc PROCEDURE\nCODE\n  RETURN';
            const doc = createDocument(code, 'file:///c%3A/Clarion/Clarion11.1/libsrc/win/ABBROWSE.CLW');
            seedCache(doc);

            try {
                await provider.prepareRename(doc, { line: 0, character: 3 });
                assert.fail('Should have thrown for libsrc file');
            } catch (e: any) {
                assert.ok(
                    e.message && e.message.toLowerCase().includes('library'),
                    `Error should mention library, got: "${e.message}"`
                );
            }
        });

        test('allows rename in user file even when libsrcPaths is set', async () => {
            serverSettings.libsrcPaths = ['c:\\clarion\\clarion11.1\\libsrc\\win'];
            const code = [
                'MyProc PROCEDURE',
                '  MyVar  LONG',
                'CODE',
                '  MyVar = 1',
            ].join('\n');
            const doc = createDocument(code, 'file:///f%3A/MyProject/IBS.CLW');
            seedCache(doc);

            // Should NOT throw — user's own file
            const result = await provider.prepareRename(doc, { line: 3, character: 3 });
            assert.ok(result !== null, 'prepareRename should succeed for user project file');
        });

        // ─── ,DLL / unresolvable MODULE rejection (issue #93) ─────────────────

        test('rejects a MAP procedure declared with ,DLL on its prototype line', async () => {
            const code = [
                'MAP',
                '  MODULE(\'GLREPORTS.DLL\')',
                '    CalcPercent FUNCTION(REAL,REAL),REAL,DLL',
                '  END',
                'END',
            ].join('\n');
            const doc = createDocument(code, 'file:///f%3A/MyProject/Reports.clw');
            seedCache(doc);

            try {
                // cursor on "CalcPercent" — line 2 (zero-based)
                await provider.prepareRename(doc, { line: 2, character: 6 });
                assert.fail('Should have thrown for ,DLL procedure');
            } catch (e: any) {
                assert.ok(
                    e.message && e.message.includes('DLL'),
                    `Error should mention DLL, got: "${e.message}"`
                );
            }
        });

        test('rejects ,DLL even when written in lowercase or with extra whitespace', async () => {
            const code = [
                'MAP',
                '  MODULE(\'glreports.dll\')',
                '    DoStuff PROCEDURE(LONG), STRING ,  dll',
                '  END',
                'END',
            ].join('\n');
            const doc = createDocument(code, 'file:///f%3A/MyProject/Reports.clw');
            seedCache(doc);

            try {
                await provider.prepareRename(doc, { line: 2, character: 6 });
                assert.fail('Should have thrown for case-variant ,dll procedure');
            } catch (e: any) {
                assert.ok(
                    e.message && e.message.toUpperCase().includes('DLL'),
                    `Error should mention DLL, got: "${e.message}"`
                );
            }
        });

        test('rejects a MAP procedure inside MODULE whose filename cannot be resolved via redirection', async () => {
            // Solution loaded, but redirection finds nothing for the referenced file
            stubSolutionManager(/* resolvable */ []);

            const code = [
                'MAP',
                '  MODULE(\'NotInSolution.clw\')',
                '    HelperProc PROCEDURE(BYTE)',
                '  END',
                'END',
            ].join('\n');
            const doc = createDocument(code, 'file:///f%3A/MyProject/Main.clw');
            seedCache(doc);

            try {
                await provider.prepareRename(doc, { line: 2, character: 6 });
                assert.fail('Should have thrown for unresolvable MODULE');
            } catch (e: any) {
                assert.ok(
                    e.message && e.message.toLowerCase().includes('could not be resolved'),
                    `Error should mention 'could not be resolved', got: "${e.message}"`
                );
                assert.ok(
                    e.message.includes('NotInSolution.clw'),
                    `Error should name the referenced file, got: "${e.message}"`
                );
            }
        });

        test('rejects a bare MODULE keyword (no parenthesised filename)', async () => {
            // No SolutionManager — bare MODULE rejection fires regardless of solution state
            const code = [
                'MAP',
                '  MODULE',
                '    HelperProc PROCEDURE(BYTE)',
                '  END',
                'END',
            ].join('\n');
            const doc = createDocument(code, 'file:///f%3A/MyProject/Bare.clw');
            seedCache(doc);

            try {
                await provider.prepareRename(doc, { line: 2, character: 6 });
                assert.fail('Should have thrown for bare MODULE keyword');
            } catch (e: any) {
                assert.ok(
                    e.message && e.message.toLowerCase().includes('could not be resolved'),
                    `Error should mention 'could not be resolved', got: "${e.message}"`
                );
            }
        });

        test('does NOT reject when MODULE filename resolves via redirection to a real file', async () => {
            stubSolutionManager(['Helpers.clw']);

            const code = [
                'MAP',
                '  MODULE(\'Helpers.clw\')',
                '    HelperProc PROCEDURE(BYTE)',
                '  END',
                'END',
            ].join('\n');
            const doc = createDocument(code, 'file:///f%3A/MyProject/Main.clw');
            seedCache(doc);

            // The new rejection paths must NOT fire. findSymbol may still throw a
            // "symbol not found" error in this minimal harness — that's fine; we
            // only assert the new errors do not surface.
            try {
                await provider.prepareRename(doc, { line: 2, character: 6 });
                // No throw is also acceptable — means rename is allowed through.
            } catch (e: any) {
                const msg = (e.message ?? '').toLowerCase();
                assert.ok(
                    !msg.includes('declared with ,dll') &&
                    !msg.includes('could not be resolved'),
                    `Should not throw the new rejection errors, got: "${e.message}"`
                );
            }
        });

        test('does NOT reject MODULE when no solution is loaded (skip the redirection check)', async () => {
            // Without a solution, we have no graph to consult — be permissive,
            // not aggressive. Only the bare-MODULE branch should still reject.
            clearSolutionManager();

            const code = [
                'MAP',
                '  MODULE(\'AnyFile.clw\')',
                '    HelperProc PROCEDURE(BYTE)',
                '  END',
                'END',
            ].join('\n');
            const doc = createDocument(code, 'file:///f%3A/MyProject/Main.clw');
            seedCache(doc);

            try {
                await provider.prepareRename(doc, { line: 2, character: 6 });
            } catch (e: any) {
                const msg = (e.message ?? '').toLowerCase();
                assert.ok(
                    !msg.includes('could not be resolved'),
                    `Should not raise the unresolvable-MODULE error when no solution is loaded, got: "${e.message}"`
                );
            }
        });

        // ─── FUNCTION declarations are renameable (hotfix 4d1435b1) ─────────────
        // Modern Clarion treats PROCEDURE and FUNCTION as semantically identical
        // (both can return values); the token-type split is a tokenizer artifact.
        // SymbolFinderService.findProcedureDeclaration was rejecting Function-typed
        // tokens silently, breaking F2 / Definition / Hover from any call site.

        test('FUNCTION-typed declaration is renameable from a call site (hotfix 4d1435b1)', async () => {
            // User reproducer: Foo FUNCTION(LONG),REAL with a call from another scope.
            const code = [
                'MyProg PROGRAM',                       // 0
                'MAP',                                   // 1
                'Foo FUNCTION(LONG pId),REAL',           // 2
                'END',                                   // 3
                '',                                       // 4
                'CODE',                                   // 5
                '  x = Foo(42)',                         // 6  ← cursor on Foo
                '',                                       // 7
                'Foo FUNCTION(LONG pId),REAL',           // 8 — implementation
                'CODE',                                   // 9
                '  RETURN 0.0',                          // 10
            ].join('\n');
            const doc = createDocument(code, 'file:///f%3A/MyProject/Func.clw');
            seedCache(doc);

            // Cursor on "Foo" at the call site — should resolve via findProcedureDeclaration.
            const result = await provider.prepareRename(doc, { line: 6, character: 7 });
            assert.ok(result !== null,
                'prepareRename should return a range for a FUNCTION-typed procedure declaration');
        });

        test('PROCEDURE and FUNCTION declarations side by side: both rename from their call sites', async () => {
            const code = [
                'MyProg PROGRAM',                       // 0
                'MAP',                                   // 1
                'ProcA PROCEDURE',                       // 2
                'FuncB FUNCTION(LONG),REAL',             // 3
                'END',                                   // 4
                '',                                       // 5
                'CODE',                                   // 6
                '  ProcA',                               // 7  ← call to PROCEDURE
                '  x = FuncB(1)',                        // 8  ← call to FUNCTION
                '',                                       // 9
                'ProcA PROCEDURE',                       // 10
                'CODE',                                   // 11
                '  RETURN',                              // 12
                '',                                       // 13
                'FuncB FUNCTION(LONG pId),REAL',         // 14
                'CODE',                                   // 15
                '  RETURN 0.0',                          // 16
            ].join('\n');
            const doc = createDocument(code, 'file:///f%3A/MyProject/Mixed.clw');
            seedCache(doc);

            // Both should be resolvable from the call sites.
            const procResult = await provider.prepareRename(doc, { line: 7, character: 4 });
            assert.ok(procResult !== null, 'PROCEDURE call site should be renameable');

            const funcResult = await provider.prepareRename(doc, { line: 8, character: 8 });
            assert.ok(funcResult !== null,
                'FUNCTION call site should also be renameable (hotfix 4d1435b1)');
        });

        // ─── Cross-file procedure rename (follow-up to hotfix 4d1435b1) ─────────
        // SymbolFinder is per-file: when F2 lands on a call site whose declaration
        // lives in another module, findSymbol returns null and the original
        // prepareRename rejected. provideRename, on the other hand, delegates to
        // ReferencesProvider which IS solution-aware (findProcedureReferences walks
        // project sourceFiles). The fix mirrors that fallback in prepareRename.

        test('cross-file procedure call site is renameable via ReferencesProvider fallback', async () => {
            const projectDir = 'f:/CrossFileRename';
            const procUri    = `file:///${projectDir}/proc.clw`;
            const callerUri  = `file:///${projectDir}/caller.clw`;

            // Declaration file (Foo PROCEDURE) — seeded into the cache so
            // findProcedureReferences finds it without going to disk.
            const procDoc = createDocument(
                ['Foo PROCEDURE', 'CODE', '  RETURN'].join('\n'),
                procUri
            );
            seedCache(procDoc);

            // Caller file (no MAP, no Foo declaration locally — SymbolFinder must miss).
            const callerDoc = createDocument(
                [
                    'MyProg PROGRAM',   // 0
                    'CODE',              // 1
                    '  Foo()',           // 2 ← cursor on Foo
                ].join('\n'),
                callerUri
            );
            seedCache(callerDoc);

            // Solution stub exposing both files as project sourceFiles. The equates +
            // project-path shims satisfy SolutionManager methods consulted by SymbolFinder
            // (getEquatesTokens / getEquatesPath) and ReferencesProvider's class-type
            // routing path (getProjectPathForFile / findProjectForFile).
            (SolutionManager as any).instance = {
                solution: {
                    projects: [{
                        path: projectDir,
                        sourceFiles: [
                            { relativePath: 'proc.clw' },
                            { relativePath: 'caller.clw' }
                        ],
                        getRedirectionParser: () => null
                    }]
                },
                getEquatesTokens: () => [],
                getEquatesPath: () => null,
                getProjectPathForFile: () => projectDir,
                getProjectCwprojForFile: () => null,
                findProjectForFile: () => null
            };

            const result = await provider.prepareRename(callerDoc, { line: 2, character: 4 });
            assert.ok(result !== null,
                'prepareRename should accept a cross-file call site (declaration in proc.clw)');
        });
    });

    // ─── provideRename ────────────────────────────────────────────────────────

    suite('provideRename', () => {

        test('renames a local variable across all usages in same file', async () => {
            const code = [
                'MyProc PROCEDURE',
                '  Counter  LONG',
                'CODE',
                '  Counter = 0',
                '  Counter += 1',
                '  IF Counter > 10',
                '    Counter = 0',
                '  END',
            ].join('\n');
            const doc = createDocument(code);
            seedCache(doc);

            const edit = await provider.provideRename(doc, { line: 3, character: 3 }, 'Index');
            assert.ok(edit !== null, 'Should return a WorkspaceEdit');
            assert.ok(edit!.documentChanges, 'WorkspaceEdit should have documentChanges');

            const fileEdits = editsForUri(edit, doc.uri);
            assert.ok(fileEdits && fileEdits.length >= 3,
                `Expected at least 3 edits for Counter, got ${fileEdits?.length ?? 0}`);

            assert.ok(
                fileEdits.every(e => e.newText === 'Index'),
                'All edits should replace with "Index"'
            );
        });

        test('returns null when new name is empty', async () => {
            const code = 'MyProc PROCEDURE\n  X LONG\nCODE\n  X = 1';
            const doc = createDocument(code);
            seedCache(doc);

            const edit = await provider.provideRename(doc, { line: 3, character: 3 }, '');
            assert.strictEqual(edit, null, 'Should return null for empty new name');
        });

        test('returns null when no symbol at cursor', async () => {
            const doc = createDocument('MyProc PROCEDURE\nCODE\n  RETURN');
            seedCache(doc);

            const edit = await provider.provideRename(doc, { line: 2, character: 0 }, 'NewName');
            assert.strictEqual(edit, null, 'Should return null when no word at cursor');
        });

        test('renames a global variable across multiple usages', async () => {
            const code = [
                'GlobalCounter  LONG',
                '',
                'MyProc PROCEDURE',
                'CODE',
                '  GlobalCounter = 0',
                '  GlobalCounter += 1',
            ].join('\n');
            const doc = createDocument(code);
            seedCache(doc);

            const edit = await provider.provideRename(doc, { line: 4, character: 5 }, 'TotalCount');
            assert.ok(edit !== null, 'Should return a WorkspaceEdit for global variable');
            const fileEdits = editsForUri(edit, doc.uri);
            assert.ok(fileEdits && fileEdits.length >= 2,
                `Expected at least 2 edits, got ${fileEdits?.length ?? 0}`);
            assert.ok(
                fileEdits.every(e => e.newText === 'TotalCount'),
                'All edits should replace with "TotalCount"'
            );
        });

        test('each edit range covers only the symbol name', async () => {
            const code = [
                'MyProc PROCEDURE',
                '  MyVar  LONG',
                'CODE',
                '  MyVar = 5',
            ].join('\n');
            const doc = createDocument(code);
            seedCache(doc);

            const edit = await provider.provideRename(doc, { line: 3, character: 3 }, 'Renamed');
            assert.ok(edit?.documentChanges);
            const edits = editsForUri(edit, doc.uri);
            assert.ok(edits && edits.length > 0);

            // Each edit range should span exactly "MyVar" (5 chars)
            for (const e of edits) {
                const len = e.range.end.character - e.range.start.character;
                assert.strictEqual(len, 'MyVar'.length,
                    `Edit range should span 5 chars, got ${len}`);
            }
        });
    });

    // ─── #195 — rename a class method AT ITS IMPL POINT with NO external callers ───
    // Mark repro (FAR-confirmed): MyFunctionsClass.GetNow declared in .inc +
    // implemented in .clw, NO call sites. prepareRename's findSymbol misses (the
    // word is the dotted cross-file 'MyFunctionsClass.GetNow') and its fallback used
    // includeDeclaration:FALSE → decl(.inc)+impl(.clw) both stripped → 0 → threw
    // 'symbol not found or not renameable', even though provideRename
    // (includeDeclaration:TRUE) would have succeeded. The pre-flight was stricter
    // than the op it gates. Fix: RenameProvider.ts:82 false→true. (441ffec3)
    suite('#195 — class method rename at impl point, no callers', () => {
        const projectDir = 'f:/Rename195';
        const incUri = `file:///${projectDir}/MyFunctionsClass.inc`;
        const clwUri = `file:///${projectDir}/MyFunctionsClass.clw`;
        const IMPL_LINE = 'MyFunctionsClass.GetNow PROCEDURE()';
        const GETNOW_COL = IMPL_LINE.indexOf('GetNow'); // boundary proving the prefix is preserved

        function seed195(): TextDocument {
            const incDoc = createDocument([
                'MyFunctionsClass CLASS,TYPE',
                'GetNow             PROCEDURE(),LONG',
                '                   END',
            ].join('\n'), incUri);
            seedCache(incDoc);
            const clwDoc = createDocument([
                "  MEMBER()",
                "  INCLUDE('MyFunctionsClass.inc'),ONCE",
                IMPL_LINE,                 // line 2 — impl; cursor lands here
                '  CODE',
                '  RETURN',
            ].join('\n'), clwUri);
            seedCache(clwDoc);
            (SolutionManager as any).instance = {
                solution: { projects: [{
                    path: projectDir,
                    sourceFiles: [{ relativePath: 'MyFunctionsClass.clw' }, { relativePath: 'MyFunctionsClass.inc' }],
                    getRedirectionParser: () => null
                }]},
                getEquatesTokens: () => [], getEquatesPath: () => null,
                getProjectPathForFile: () => projectDir, getProjectCwprojForFile: () => null, findProjectForFile: () => null
            };
            return clwDoc;
        }

        // BUG PIN — prepareRename currently THROWS 'not renameable' here (RED).
        test('prepareRename at the impl point returns a Range (does not throw) for a no-caller method', async () => {
            const clwDoc = seed195();
            const pos = { line: 2, character: GETNOW_COL + 1 };
            const range = await provider.prepareRename(clwDoc, pos);
            assert.ok(range !== null,
                'prepareRename must accept a no-caller class method at its impl point — decl+impl are the only refs, ' +
                'so the pre-flight must include the declaration (it must not be stricter than provideRename)');
        });

        // GUARD — provideRename (already includeDeclaration:TRUE) rewrites GetNow at
        // BOTH decl(.inc) + impl(.clw), preserving the MyFunctionsClass. prefix.
        test('provideRename rewrites GetNow at decl + impl, preserving the class prefix', async () => {
            const clwDoc = seed195();
            const pos = { line: 2, character: GETNOW_COL + 1 };
            const edit = await provider.provideRename(clwDoc, pos, 'GetTime');
            assert.ok(edit?.documentChanges, 'provideRename must return a WorkspaceEdit');
            const incEdits = editsForUri(edit, incUri);
            const clwEdits = editsForUri(edit, clwUri);
            assert.ok(incEdits.length > 0, 'declaration (.inc) must be rewritten');
            assert.ok(clwEdits.length > 0, 'implementation (.clw) must be rewritten');
            assert.ok([...incEdits, ...clwEdits].every(e => e.newText === 'GetTime'),
                'all edits replace with the new name');
            // Prefix preserved: the impl edit spans exactly GetNow, NOT MyFunctionsClass.GetNow.
            const implEdit = clwEdits.find(e => e.range.start.line === 2)!;
            assert.ok(implEdit, 'impl line must have an edit');
            assert.strictEqual(implEdit.range.start.character, GETNOW_COL,
                'impl edit must start at GetNow (the MyFunctionsClass. prefix is preserved)');
            assert.strictEqual(implEdit.range.end.character - implEdit.range.start.character, 'GetNow'.length,
                'impl edit must span exactly GetNow (6 chars), not the dotted name');
        });

        // PART 2 BUG PIN — prepareRename must narrow the dotted impl word to just the
        // method segment so VS Code's rename box targets 'GetNow', not the full
        // 'MyFunctionsClass.GetNow' (pre-part-2 it returned the whole dotted range).
        test('prepareRename narrows the dotted impl word to the method segment (GetNow)', async () => {
            const clwDoc = seed195();
            const pos = { line: 2, character: GETNOW_COL + 1 };
            const range = await provider.prepareRename(clwDoc, pos);
            assert.ok(range, 'prepareRename must return a range');
            assert.strictEqual(clwDoc.getText(range!), 'GetNow',
                'rename box must target ONLY the method segment, not the full MyFunctionsClass.GetNow');
        });

        // Non-regression: a plain (non-dotted) symbol's range is returned unchanged —
        // the narrowing only fires when the cursor word contains a '.'.
        test('non-regression — plain non-dotted symbol range is unchanged', async () => {
            const doc = createDocument([
                'MyProc PROCEDURE',
                '  Counter  LONG',
                'CODE',
                '  Counter = 0',
            ].join('\n'));
            seedCache(doc);
            const range = await provider.prepareRename(doc, { line: 3, character: 4 });
            assert.ok(range, 'prepareRename must return a range for a plain local');
            assert.strictEqual(doc.getText(range!), 'Counter',
                'non-dotted symbol range must be returned in full (no narrowing)');
        });
    });

    // ─── #196 — rename apply: documentChanges (NULL version) + dedup ─────────────
    // Mark: rename a method at its impl point with a TYPED name → "Failed to apply
    // edits" (PARTIAL — the .inc decl applied, the active .clw impl edit was rejected).
    //
    // The fix has TWO parts, and the FIRST attempt got one of them backwards:
    //   (A) emit `documentChanges` (modern, ordered) with version === NULL — i.e.
    //       UNVERSIONED. An earlier attempt attached the LSP document version, but
    //       VS Code's text-model version (model.getVersionId()) is a DIFFERENT counter
    //       that diverges across undo/redo, so the versioned edit for the OPEN .clw was
    //       rejected (version mismatch) while the closed .inc (no version) applied —
    //       reproducing the exact partial-rename symptom. Null version = "apply without
    //       a version check", which is correct for a synchronously-computed rename.
    //   (B) DEDUPE overlapping/duplicate ranges per uri (a WorkspaceEdit must never
    //       contain overlapping edits — VS Code rejects that file's edits while still
    //       applying others, the partial-rename tell).
    suite('#196 — rename apply: documentChanges (null version) + dedup', () => {
        test('provideRename emits UNVERSIONED documentChanges (version null, not legacy changes)', async () => {
            const doc = createDocument([
                'MyProc PROCEDURE',
                '  Counter  LONG',
                'CODE',
                '  Counter = 0',
                '  Counter += 1',
            ].join('\n'));
            seedCache(doc);

            const edit = await provider.provideRename(doc, { line: 3, character: 3 }, 'Index');
            assert.ok(edit, 'provideRename must return a WorkspaceEdit');
            assert.ok(edit!.documentChanges, 'must emit documentChanges, not legacy changes');
            assert.strictEqual(edit!.changes, undefined, 'must NOT emit unversioned changes');
            const tde = (edit!.documentChanges as TextDocumentEdit[]).find(
                c => TextDocumentEdit.is(c) && c.textDocument.uri === doc.uri);
            assert.ok(tde, 'documentChanges must include the active document');
            assert.strictEqual(tde!.textDocument.version, null,
                'edit version MUST be null — a concrete version is rejected by VS Code when its ' +
                'model version (a separate counter) has diverged via undo/redo, which was the bug');
        });

        test('dedupes duplicate + overlapping ranges per uri (no overlapping edits in the WorkspaceEdit)', async () => {
            const doc = createDocument([
                'MyProc PROCEDURE',
                '  Counter  LONG',
                'CODE',
                '  Counter = 0',
            ].join('\n'));
            seedCache(doc);

            // Stub provideReferences to return the SAME location 3× (one a fresh object
            // with identical coords) — mirrors FAR surfacing the active impl via both
            // live tokens AND a sourceFiles walk → duplicate/overlapping ranges.
            const dupRange = { start: { line: 3, character: 2 }, end: { line: 3, character: 9 } };
            (provider as any).referencesProvider = {
                provideReferences: async () => [
                    { uri: doc.uri, range: dupRange },
                    { uri: doc.uri, range: dupRange },
                    { uri: doc.uri, range: { start: { line: 3, character: 2 }, end: { line: 3, character: 9 } } },
                ],
            };

            const edit = await provider.provideRename(doc, { line: 3, character: 3 }, 'Index');
            assert.ok(edit?.documentChanges, 'must return documentChanges');
            const edits = editsForUri(edit, doc.uri);
            assert.strictEqual(edits.length, 1,
                `duplicate/overlapping ranges must collapse to ONE edit; got ${edits.length}`);
            // General invariant: no two edits for a uri overlap.
            for (let i = 1; i < edits.length; i++) {
                const prev = edits[i - 1].range, cur = edits[i].range;
                const overlaps = cur.start.line < prev.end.line ||
                    (cur.start.line === prev.end.line && cur.start.character < prev.end.character);
                assert.ok(!overlaps, 'WorkspaceEdit must not contain overlapping ranges');
            }
        });

        // REAL ROOT CAUSE (Mark's live #196-DIAG log, f:/Playground/TestIncInClw):
        // FAR returned the SAME .clw under TWO uri spellings — `file:///f%3A/…` (encoded
        // colon, VS Code's canonical active-doc form) AND `file:///f:/…` (un-encoded, from
        // the sourceFiles disk walk) — each with the identical impl range. Keyed by the
        // raw uri string those are two groups → two documentChanges for one physical file
        // → VS Code (which resolves both to one resource) saw overlapping edits → rejected
        // the .clw while the .inc (single edit) applied. The grouping key MUST normalize
        // the uri to a path so mixed encodings collapse to ONE documentChange.
        test('same file under different uri encodings (f%3A vs f:) collapses to ONE edit', async () => {
            const encodedUri = 'file:///f%3A/Playground/TestIncInClw/MyFunctionsClass.clw'; // active doc form
            const rawUri     = 'file:///f:/Playground/TestIncInClw/MyFunctionsClass.clw';   // disk-walk form
            const doc = createDocument([
                "  MEMBER",
                "  INCLUDE('MyFunctionsClass.inc'),ONCE",
                'MyFunctionsClass.RetrieveCurrentTime   PROCEDURE()',
                '  CODE',
                '  RETURN',
            ].join('\n'), encodedUri);
            seedCache(doc);

            const implRange = { start: { line: 2, character: 17 }, end: { line: 2, character: 36 } };
            (provider as any).referencesProvider = {
                provideReferences: async () => [
                    { uri: encodedUri, range: implRange },
                    { uri: rawUri, range: { start: { line: 2, character: 17 }, end: { line: 2, character: 36 } } },
                ],
            };

            const edit = await provider.provideRename(doc, { line: 2, character: 19 }, 'GetNow');
            assert.ok(edit?.documentChanges, 'must return documentChanges');
            const tdes = edit!.documentChanges as TextDocumentEdit[];

            // Exactly ONE documentChange for the .clw, regardless of the two uri spellings.
            assert.strictEqual(tdes.length, 1,
                `mixed-encoding uris for one file must collapse to ONE documentChange; got ${tdes.length}`);
            assert.strictEqual(tdes[0].edits.length, 1,
                `the collapsed group must hold ONE edit (no overlapping duplicate); got ${tdes[0].edits.length}`);
            // Emits under the active document's exact spelling (the encoded form).
            assert.strictEqual(tdes[0].textDocument.uri, encodedUri,
                'should emit under the active document uri spelling');
        });
    });
});
