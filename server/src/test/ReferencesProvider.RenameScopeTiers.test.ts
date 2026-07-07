import * as assert from 'assert';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { WorkspaceEdit, TextEdit, TextDocumentEdit } from 'vscode-languageserver-protocol';
import { TokenCache } from '../TokenCache';
import { ReferencesProvider } from '../providers/ReferencesProvider';
import { RenameProvider } from '../providers/RenameProvider';
import { setServerInitialized } from '../serverState';

/**
 * #257 Phase 1 — rename-through-FAR scope-tier sentinel.
 *
 * The scariest regression surface of the ScopeTypeIndexService extraction is
 * rename correctness: any drift in the moved `lookupVarTypeAtLine` tier chain
 * changes the FAR result set that RenameProvider consumes verbatim. The #253
 * sentinel (SameLineDedup) pins dedup; THIS suite pins the tier chain itself,
 * end-to-end through FAR and rename.
 *
 * Fixture: two unrelated classes (`Tally`, `Other`) both declare a method
 * named `Check`. Receivers exist at three tiers:
 *   - `inst Tally`  — procedure-local (Tier 3)
 *   - `minst Tally` — module scope   (Tier 5)
 *   - `inst Other`  — ROUTINE DATA   (Tier 1), SHADOWING the proc-local `inst`
 *
 * Renaming Tally's `Check` from its DECLARATION must rewrite the Tally call
 * sites (both tiers) and must NOT touch the routine's `inst.Check()` — there
 * `inst` is `Other` via routine-local shadowing. If the extraction drops or
 * reorders a tier, one direction of this pin breaks:
 *   - routine tier lost → `inst` resolves proc-locally to Tally → line 32
 *     wrongly renamed → silently broken compile in Other's family
 *   - module tier lost → `minst` unresolvable → line 24 silently missed
 *
 * Bidirectional per `feedback_bidirectional_pin_assertion`.
 *
 * Cursor is DECL-side deliberately: that path (`parts.length===2 &&
 * !chainPrefixLower` in the matching loop) is the type-aware one the tier
 * index feeds. The CALL-side cursor path matches sibling `inst.Check` lines
 * TEXTUALLY by chainPrefix (no type lookup) — probed 2026-07-07: it wrongly
 * includes line 32 and misses line 24. That pre-existing bug is out of
 * Phase-1 scope and tracked in #269; when it's fixed, ADD a call-side
 * variant of these tests rather than editing this one.
 */

function createDocument(content: string, uri: string): TextDocument {
    return TextDocument.create(uri, 'clarion', 1, content);
}

const FIXTURE = [
    "  MEMBER('test')",              // 0
    '',                              // 1
    'Tally      CLASS,TYPE',         // 2
    'Check        PROCEDURE(),LONG', // 3  — Tally decl (RENAME)
    '           END',                // 4
    'Other      CLASS,TYPE',         // 5
    'Check        PROCEDURE(),LONG', // 6  — Other decl (MUST NOT rename)
    '           END',                // 7
    '',                              // 8
    'minst      Tally',              // 9  — module-scope Tally instance (Tier 5)
    '',                              // 10
    'Tally.Check PROCEDURE()',       // 11 — Tally impl (RENAME)
    '  CODE',                        // 12
    '  RETURN 1',                    // 13
    '',                              // 14
    'Other.Check PROCEDURE()',       // 15 — Other impl (MUST NOT rename)
    '  CODE',                        // 16
    '  RETURN 2',                    // 17
    '',                              // 18
    'MainProc PROCEDURE',            // 19
    'inst       Tally',              // 20 — proc-local Tally instance (Tier 3)
    'res        LONG',               // 21
    '  CODE',                        // 22
    '  res = inst.Check()',          // 23 — proc-local receiver → Tally (RENAME)
    '  res = minst.Check()',         // 24 — module receiver → Tally (RENAME)
    '  DO Sub',                      // 25
    '  RETURN',                      // 26
    '',                              // 27
    'Sub ROUTINE',                   // 28
    '  DATA',                        // 29
    'inst  Other',                   // 30 — routine-local `inst` SHADOWS proc-local (Tier 1)
    '  CODE',                        // 31
    '  res = inst.Check()',          // 32 — shadowed receiver → Other (MUST NOT rename)
].join('\n');

const CURSOR_LINE = 3;
const CURSOR_COL = 'Check        PROCEDURE(),LONG'.indexOf('Check') + 1;

// Line 11 (Tally impl header) is NOT in the pin: the decl-side matching loop
// does not currently surface impl headers for zero-arg methods (pre-existing,
// probed 2026-07-07) — pinning it would block Phase 1 on an unrelated fix.
const MUST_INCLUDE = [3, 23, 24];
const MUST_EXCLUDE = [6, 15, 32];

suite('FAR/Rename — scope-tier resolution sentinel (#257 Phase 1)', () => {

    setup(() => {
        setServerInitialized(true);
        TokenCache.getInstance().clearAllTokens();
    });

    test('FAR from the Tally decl resolves receivers per tier chain', async () => {
        const doc = createDocument(FIXTURE, 'file:///t257-far.clw');
        TokenCache.getInstance().getTokens(doc);
        const provider = new ReferencesProvider();

        const refs = await provider.provideReferences(doc,
            { line: CURSOR_LINE, character: CURSOR_COL },
            { includeDeclaration: true });

        assert.ok(refs, 'FAR should return references for the Tally call site');
        const lines = [...new Set(refs!.map(r => r.range.start.line))].sort((a, b) => a - b);

        for (const l of MUST_INCLUDE) {
            assert.ok(lines.includes(l),
                `expected line ${l} IN FAR result; got lines=[${lines.join(',')}] — ` +
                'a tier the receiver resolves through has been dropped');
        }
        for (const l of MUST_EXCLUDE) {
            assert.ok(!lines.includes(l),
                `expected line ${l} NOT in FAR result; got lines=[${lines.join(',')}] — ` +
                "Other's Check family is leaking in (routine-local shadowing broken?)");
        }
    });

    test('rename rewrites Tally call sites at every tier and leaves Other untouched', async () => {
        const uri = 'file:///t257-rename.clw';
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
                `expected a rename edit on line ${l}; got lines=[${editLines.join(',')}] — ` +
                'missing an edit at one of the receiver tiers silently breaks the compile');
        }
        for (const l of MUST_EXCLUDE) {
            assert.ok(!editLines.includes(l),
                `expected NO rename edit on line ${l}; got lines=[${editLines.join(',')}] — ` +
                "rename is rewriting Other's Check (routine-local shadowing broken?)");
        }
    });
});
