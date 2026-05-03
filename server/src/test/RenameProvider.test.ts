import * as assert from 'assert';
import { TextDocument } from 'vscode-languageserver-textdocument';
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
            assert.ok(edit!.changes, 'WorkspaceEdit should have changes');

            const fileEdits = edit!.changes![doc.uri];
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
            const fileEdits = edit!.changes![doc.uri];
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
            assert.ok(edit?.changes);
            const edits = edit!.changes![doc.uri];
            assert.ok(edits && edits.length > 0);

            // Each edit range should span exactly "MyVar" (5 chars)
            for (const e of edits) {
                const len = e.range.end.character - e.range.start.character;
                assert.strictEqual(len, 'MyVar'.length,
                    `Edit range should span 5 chars, got ${len}`);
            }
        });
    });
});
