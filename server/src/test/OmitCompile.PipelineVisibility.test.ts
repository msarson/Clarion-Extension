import * as assert from 'assert';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { WorkspaceEdit, TextEdit, TextDocumentEdit } from 'vscode-languageserver-protocol';
import { ClarionTokenizer } from '../ClarionTokenizer';
import { TokenCache } from '../TokenCache';
import { OmitCompileDetector } from '../utils/OmitCompileDetector';
import { DiagnosticProvider } from '../providers/DiagnosticProvider';
import { ReferencesProvider } from '../providers/ReferencesProvider';
import { RenameProvider } from '../providers/RenameProvider';
import { setServerInitialized } from '../serverState';

/**
 * #255 — OMIT/COMPILE'd-out code was invisible to the pipeline gates. Decided
 * semantics (Mark + Claude 2026-07-07, modeled on clangd/VS inactive-region
 * handling with one deliberate deviation):
 *
 *   - Diagnostics: SKIP omitted lines (inactive code isn't in the active build)
 *   - References / CodeLens counts: EXCLUDE omitted occurrences
 *   - Rename: INCLUDE omitted occurrences (deviation — Clarion ships multiple
 *     configurations off one source; excluding them silently breaks the others)
 *
 * Plus a detector polarity fix found by the #255 audit: an UNCONDITIONAL
 * COMPILE block is the "always compile this" directive — its body is LIVE
 * code, but the detector treated it identically to OMIT.
 *
 * Conditional OMIT/COMPILE (with a define argument) stays conservatively LIVE
 * everywhere — define evaluation from the active configuration is the deferred
 * substrate phase.
 */

function makeDoc(code: string, uri = 'file:///t255.clw'): TextDocument {
    return TextDocument.create(uri, 'clarion', 1, code);
}

suite('OMIT/COMPILE pipeline visibility (#255)', () => {

    setup(() => {
        setServerInitialized(true);
        TokenCache.getInstance().clearAllTokens();
    });
    teardown(() => TokenCache.getInstance().clearAllTokens());

    test("polarity: an unconditional COMPILE('***') body is LIVE, not omitted", () => {
        const code = [
            "  COMPILE('***')",          // 0 — unconditional COMPILE = always compiled
            'LiveCode    EQUATE(1)',     // 1 — LIVE
            '  ***',                     // 2
            "  OMIT('***')",             // 3
            'DeadCode    EQUATE(2)',     // 4 — omitted
            '  ***',                     // 5
        ].join('\n');
        const doc = makeDoc(code);
        const tokens = new ClarionTokenizer(code).tokenize();
        const blocks = OmitCompileDetector.findDirectiveBlocks(tokens, doc);

        assert.strictEqual(OmitCompileDetector.isLineOmittedWithBlocks(1, blocks), false,
            "COMPILE('***') without a condition means ALWAYS COMPILE — its body must be live");
        assert.strictEqual(OmitCompileDetector.isLineOmittedWithBlocks(4, blocks), true,
            'the OMIT body must still be omitted (polarity fix must not weaken OMIT)');
    });

    const DIAG_FIXTURE = [
        '  PROGRAM',                  // 0
        '  MAP',                      // 1
        'Foo  PROCEDURE(*LONG x)',    // 2
        '  END',                      // 3
        '  CODE',                     // 4
        '  Foo(3)',                   // 5 — literal to *LONG: diagnostic (control)
        "  OMIT('***')",              // 6
        '  Foo(3)',                   // 7 — same defect, but compiled out: NO diagnostic
        '  ***',                      // 8
        '  RETURN',                   // 9
    ].join('\n');

    test('diagnostics are skipped on OMIT-omitted lines', () => {
        const doc = makeDoc(DIAG_FIXTURE, 'file:///t255-diag.clw');
        const diagnostics = DiagnosticProvider.validateDocument(doc, undefined, 'test-255');

        const atControl = diagnostics.filter(d => d.range.start.line === 5);
        assert.ok(atControl.length > 0,
            'control: the live literal-to-*LONG call must produce a diagnostic (fixture sanity)');
        const atOmitted = diagnostics.filter(d => d.range.start.line === 7);
        assert.strictEqual(atOmitted.length, 0,
            `the identical call inside OMIT is not in the active build — no diagnostic; got ${atOmitted.length}`);
    });

    const REF_FIXTURE = [
        "  MEMBER('test')",     // 0
        '',                     // 1
        'GVar       LONG',      // 2 — decl
        '',                     // 3
        'MainProc PROCEDURE',   // 4
        '  CODE',               // 5
        '  GVar = 1',           // 6 — live use (IN)
        "  OMIT('***')",        // 7
        '  GVar = 2',           // 8 — omitted use (OUT of refs, IN for rename)
        '  ***',                // 9
        '  RETURN',             // 10
    ].join('\n');

    test('Find-All-References excludes occurrences inside OMIT blocks', async () => {
        const doc = makeDoc(REF_FIXTURE, 'file:///t255-far.clw');
        TokenCache.getInstance().getTokens(doc);
        const provider = new ReferencesProvider();
        const refs = await provider.provideReferences(doc,
            { line: 2, character: 1 }, { includeDeclaration: true });

        assert.ok(refs, 'FAR should return references');
        const lines = [...new Set(refs!.map(r => r.range.start.line))].sort((a, b) => a - b);
        assert.ok(lines.includes(6), `live use (line 6) must be IN; got [${lines.join(',')}]`);
        assert.ok(!lines.includes(8),
            `omitted use (line 8) must be OUT of references — the index reflects the active configuration; got [${lines.join(',')}]`);
    });

    test('rename INCLUDES occurrences inside OMIT blocks (deliberate deviation)', async () => {
        const uri = 'file:///t255-rename.clw';
        const doc = makeDoc(REF_FIXTURE, uri);
        TokenCache.getInstance().getTokens(doc);
        const renameProvider = new RenameProvider();

        const edit: WorkspaceEdit | null = await renameProvider.provideRename(
            doc, { line: 2, character: 1 }, 'GValue');

        assert.ok(edit, 'rename should produce a WorkspaceEdit');
        let edits: TextEdit[] = [];
        for (const c of edit!.documentChanges ?? []) {
            if (TextDocumentEdit.is(c) && c.textDocument.uri === uri) edits = c.edits as TextEdit[];
        }
        const editLines = [...new Set(edits.map(e => e.range.start.line))].sort((a, b) => a - b);
        assert.ok(editLines.includes(6), `live use must be renamed; got [${editLines.join(',')}]`);
        assert.ok(editLines.includes(8),
            `the OMIT'd occurrence MUST be renamed too — other configurations compile it; got [${editLines.join(',')}] — ` +
            'excluding inactive regions from rename silently breaks sibling configurations');
    });
});
