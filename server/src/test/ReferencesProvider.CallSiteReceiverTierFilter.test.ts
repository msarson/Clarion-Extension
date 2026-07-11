import * as assert from 'assert';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { WorkspaceEdit, TextEdit, TextDocumentEdit } from 'vscode-languageserver-protocol';
import { TokenCache } from '../TokenCache';
import { ReferencesProvider } from '../providers/ReferencesProvider';
import { RenameProvider } from '../providers/RenameProvider';
import { setServerInitialized } from '../serverState';

/**
 * #269 — the CALL-SIDE variant of the RenameScopeTiers sentinel (per that
 * suite's header note: add, don't edit).
 *
 * With the cursor on a dot-access CALL SITE, the matching loop carried
 * `chainPrefix` = the cursor receiver's NAME and matched sibling `x.member`
 * lines TEXTUALLY against it — no type lookup at all:
 *   - false positive: a routine-shadowed receiver ALSO named `inst` but of a
 *     DIFFERENT class leaked into FAR/rename → rename rewrote the wrong
 *     class's method (silently broken compile);
 *   - false negative: a same-class receiver under another name
 *     (`minst.Check()`) never matched, so rename silently missed it.
 *
 * Post-fix, the receiver's type is resolved via the scope-tier index and
 * gated on class family, exactly like the decl-side branch. Receivers whose
 * type can't be resolved keep the textual name match (conservative include).
 */

function createDocument(content: string, uri: string): TextDocument {
    return TextDocument.create(uri, 'clarion', 1, content);
}

const FIXTURE = [
    "  MEMBER('test')",              // 0
    '',                              // 1
    'Tally      CLASS,TYPE',         // 2
    'Check        PROCEDURE(),LONG', // 3  — Tally decl (IN)
    '           END',                // 4
    'Other      CLASS,TYPE',         // 5
    'Check        PROCEDURE(),LONG', // 6  — Other decl (OUT)
    '           END',                // 7
    '',                              // 8
    'minst      Tally',              // 9  — module-scope Tally instance
    '',                              // 10
    'Tally.Check PROCEDURE()',       // 11 — Tally impl
    '  CODE',                        // 12
    '  RETURN 1',                    // 13
    '',                              // 14
    'Other.Check PROCEDURE()',       // 15 — Other impl (OUT)
    '  CODE',                        // 16
    '  RETURN 2',                    // 17
    '',                              // 18
    'MainProc PROCEDURE',            // 19
    'inst       Tally',              // 20 — proc-local Tally
    'res        LONG',               // 21
    '  CODE',                        // 22
    '  res = inst.Check()',          // 23 — CURSOR HERE (Tally call)
    '  res = minst.Check()',         // 24 — Tally via module receiver (IN — was missed)
    '  DO Sub',                      // 25
    '  RETURN',                      // 26
    '',                              // 27
    'Sub ROUTINE',                   // 28
    '  DATA',                        // 29
    'inst  Other',                   // 30 — routine-local shadows proc-local
    '  CODE',                        // 31
    '  res = inst.Check()',          // 32 — OTHER via shadowing (OUT — was leaking in)
].join('\n');

const CURSOR_LINE = 23;
const CURSOR_COL = '  res = inst.Check()'.indexOf('Check') + 1;

const MUST_INCLUDE = [3, 23, 24];
const MUST_EXCLUDE = [6, 15, 32];

suite('FAR/Rename — call-site cursor receiver tier filtering (#269)', () => {

    setup(() => {
        setServerInitialized(true);
        TokenCache.getInstance().clearAllTokens();
    });

    test('FAR from the call site type-gates sibling receivers (no textual matching)', async () => {
        const doc = createDocument(FIXTURE, 'file:///t269-far.clw');
        TokenCache.getInstance().getTokens(doc);
        const provider = new ReferencesProvider();

        const refs = await provider.provideReferences(doc,
            { line: CURSOR_LINE, character: CURSOR_COL },
            { includeDeclaration: true });

        assert.ok(refs, 'FAR should return references');
        const lines = [...new Set(refs!.map(r => r.range.start.line))].sort((a, b) => a - b);

        for (const l of MUST_INCLUDE) {
            assert.ok(lines.includes(l),
                `expected line ${l} IN FAR result; got [${lines.join(',')}] — ` +
                'same-class receiver under a different name is being missed (textual chainPrefix matching)');
        }
        for (const l of MUST_EXCLUDE) {
            assert.ok(!lines.includes(l),
                `expected line ${l} NOT in FAR result; got [${lines.join(',')}] — ` +
                "a same-NAME receiver of the WRONG class is leaking in (routine shadowing ignored)");
        }
    });

    test('rename from the call site rewrites all Tally receivers and no Other receiver', async () => {
        const uri = 'file:///t269-rename.clw';
        const doc = createDocument(FIXTURE, uri);
        TokenCache.getInstance().getTokens(doc);
        const renameProvider = new RenameProvider();

        const edit: WorkspaceEdit | null = await renameProvider.provideRename(
            doc, { line: CURSOR_LINE, character: CURSOR_COL }, 'Verify');

        assert.ok(edit, 'rename should produce a WorkspaceEdit');
        let edits: TextEdit[] = [];
        for (const c of edit!.documentChanges ?? []) {
            if (TextDocumentEdit.is(c) && c.textDocument.uri === uri) edits = c.edits as TextEdit[];
        }
        const editLines = [...new Set(edits.map(e => e.range.start.line))].sort((a, b) => a - b);

        for (const l of MUST_INCLUDE) {
            assert.ok(editLines.includes(l),
                `expected a rename edit on line ${l}; got [${editLines.join(',')}]`);
        }
        for (const l of MUST_EXCLUDE) {
            assert.ok(!editLines.includes(l),
                `expected NO rename edit on line ${l}; got [${editLines.join(',')}] — ` +
                "rename is rewriting the wrong class's method (silently broken compile)");
        }
    });
});
