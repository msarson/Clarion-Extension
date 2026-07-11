import * as assert from 'assert';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { WorkspaceEdit, TextEdit, TextDocumentEdit } from 'vscode-languageserver-protocol';
import { TokenCache } from '../TokenCache';
import { ReferencesProvider, canonicalLocationKey } from '../providers/ReferencesProvider';
import { RenameProvider } from '../providers/RenameProvider';
import { setServerInitialized } from '../serverState';

/**
 * #253 — the #196 dedup fix over-collapsed: `canonicalLocationKey` keyed on
 * uri:line with NO COLUMN, so two genuinely distinct references to the same
 * dotted member on one physical line collapsed to one. Worst consumer:
 * RenameProvider consumes the collapsed list verbatim, so F2-rename renamed
 * only ONE occurrence per line — a silently produced broken compile.
 *
 * The original UriEncodingDedup suite pinned "different lines do NOT collapse"
 * but never same-line/different-column (a one-direction pin). These tests add
 * the missing direction, end-to-end through FAR and rename.
 *
 * Fixture shape mirrors the known-green CallerCursorDotAccess harness
 * (MEMBER file, typed instance, dot-access call) with TWO calls on one line —
 * probed pre-fix: FAR returned only the first call's column.
 */

function createDocument(content: string, uri: string): TextDocument {
    return TextDocument.create(uri, 'clarion', 1, content);
}

const FIXTURE = [
    "  MEMBER('test')",                          // line 0
    '',                                          // line 1
    'Tally      CLASS,TYPE',                     // line 2
    'Check        PROCEDURE(),LONG',             // line 3 — decl
    '           END',                            // line 4
    '',                                          // line 5
    'Tally.Check PROCEDURE()',                   // line 6 — impl
    '  CODE',                                    // line 7
    '  RETURN 1',                                // line 8
    '',                                          // line 9
    'MainProc PROCEDURE',                        // line 10
    'inst       Tally',                          // line 11
    'res        LONG',                           // line 12
    '  CODE',                                    // line 13
    '  res = inst.Check() + inst.Check()',       // line 14 — TWO refs, same line
    '  RETURN',                                  // line 15
].join('\n');

const CALL_LINE = 14;
const FIRST_CHECK_COL = '  res = inst.Check() + inst.Check()'.indexOf('Check');

suite('FAR/Rename — same-line references survive dedup (#253)', () => {

    setup(() => {
        setServerInitialized(true);
        TokenCache.getInstance().clearAllTokens();
    });

    test('canonicalLocationKey distinguishes columns on the same line', () => {
        const uri = 'file:///f%3A/proj/a.clw';
        assert.notStrictEqual(
            canonicalLocationKey(uri, 8, 5),
            canonicalLocationKey(uri, 8, 20),
            'two different columns on one line must produce different keys'
        );
        // The #196 direction still holds: same position, different URI spellings collapse.
        assert.strictEqual(
            canonicalLocationKey('file:///F%3A/Proj/A.clw', 8, 5),
            canonicalLocationKey('file:///f:/proj/a.clw', 8, 5)
        );
    });

    test('FAR returns BOTH same-line call sites of inst.Check()', async () => {
        const doc = createDocument(FIXTURE, 'file:///t253-far.clw');
        TokenCache.getInstance().getTokens(doc);
        const provider = new ReferencesProvider();

        const refs = await provider.provideReferences(doc,
            { line: CALL_LINE, character: FIRST_CHECK_COL + 1 },
            { includeDeclaration: true });

        assert.ok(refs, 'FAR should return references');
        const callLineRefs = refs!.filter(r => r.range.start.line === CALL_LINE);
        assert.strictEqual(
            callLineRefs.length, 2,
            `expected BOTH line-${CALL_LINE} references (two columns), got ${callLineRefs.length} ` +
            `at cols [${callLineRefs.map(r => r.range.start.character).join(',')}] — ` +
            'same-line references are collapsing in the dedup'
        );
        const cols = callLineRefs.map(r => r.range.start.character).sort((a, b) => a - b);
        assert.notStrictEqual(cols[0], cols[1], 'the two references must be at different columns');
    });

    test('rename edits BOTH same-line occurrences (no silent broken compile)', async () => {
        const uri = 'file:///t253-rename.clw';
        const doc = createDocument(FIXTURE, uri);
        TokenCache.getInstance().getTokens(doc);
        const renameProvider = new RenameProvider();

        const edit: WorkspaceEdit | null = await renameProvider.provideRename(
            doc, { line: CALL_LINE, character: FIRST_CHECK_COL + 1 }, 'Verify');

        assert.ok(edit, 'rename should produce a WorkspaceEdit');
        let edits: TextEdit[] = [];
        for (const c of edit!.documentChanges ?? []) {
            if (TextDocumentEdit.is(c) && c.textDocument.uri === uri) edits = c.edits as TextEdit[];
        }
        const callLineEdits = edits.filter(e => e.range.start.line === CALL_LINE);
        assert.strictEqual(
            callLineEdits.length, 2,
            `expected 2 rename edits on line ${CALL_LINE}, got ${callLineEdits.length} — ` +
            'renaming only one occurrence per line silently breaks the compile'
        );
    });
});
