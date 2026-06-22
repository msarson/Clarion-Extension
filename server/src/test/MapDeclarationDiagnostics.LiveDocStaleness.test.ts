import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { TokenCache } from '../TokenCache';
import { ClarionTokenizer } from '../ClarionTokenizer';
import { validateMissingMapDeclarations } from '../providers/diagnostics/MapDeclarationDiagnostics';
import { setServerInitialized } from '../serverState';
import { SolutionManager } from '../solution/solutionManager';

/**
 * #197 integration RED — validateMissingMapDeclarations reads an INCLUDE'd .inc for
 * MAP declarations via CrossFileResolver.loadExternalFileContent (MapDeclarationDiagnostics.ts:162).
 * For an OPEN + DIRTY .inc, onDidChangeContent clears the cache → getDocumentText null →
 * the loader falls to STALE saved DISK → a procedure whose MAP decl exists only in the
 * LIVE (unsaved) .inc is reported as a false "missing-map-declaration".
 *
 * This pins the live-doc-first tier (B1): validateMissingMapDeclarations must accept a
 * getOpenDocumentContent resolver and thread it to the helper so the live .inc buffer is
 * read instead of stale disk.
 *
 * Bidirectional (proves the LIVE buffer is actually read, not blanket suppression):
 *   - `Foo` is declared in the LIVE .inc (but NOT on disk) → NO warning (live read).
 *   - `Bar` is declared in NEITHER live nor disk → warning STILL fires (genuine miss).
 *
 * Pre-fix (RED): validateMissingMapDeclarations had no resolver param → read stale disk
 * → Foo falsely warned. Post-fix: getOpenDocumentContent threaded to the helper → live
 * .inc read → Foo suppressed, Bar still warns.
 */

// ANSI + CRLF, per Clarion-fixture rule.
function writeCrlf(filePath: string, lines: string[]): void {
    fs.writeFileSync(filePath, lines.join('\r\n'), { encoding: 'latin1' });
}

suite('#197 — validateMissingMapDeclarations live-doc-first (.inc open+dirty)', () => {
    let tmpDir: string;
    let clwUri: string;
    let incDiskPath: string;

    setup(() => {
        setServerInitialized(true);
        TokenCache.getInstance().clearAllTokens();
        (SolutionManager as any).instance = null; // no solution → cross-file resolver miss → warning path
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'clw197_'));
        incDiskPath = path.join(tmpDir, 'decls.inc');
        clwUri = 'file:///' + path.join(tmpDir, 'mymember.clw').replace(/\\/g, '/');
    });

    teardown(() => {
        try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
    });

    function buildClwDoc(): { doc: TextDocument; tokens: ReturnType<ClarionTokenizer['tokenize']> } {
        // MEMBER file with a MAP that INCLUDEs decls.inc, plus two GlobalProcedure impls.
        const doc = TextDocument.create(clwUri, 'clarion', 2 /* dirty */, [
            "  MEMBER('noprog')",                 // 0 — PROGRAM that won't resolve (forces the cross-file miss path)
            '  MAP',                              // 1
            "    INCLUDE('decls.inc')",           // 2
            '  END',                              // 3
            'Foo PROCEDURE',                      // 4 — impl (declared only in the LIVE .inc)
            '  CODE',                             // 5
            '  RETURN',                           // 6
            'Bar PROCEDURE',                      // 7 — impl (declared in NEITHER)
            '  CODE',                             // 8
            '  RETURN',                           // 9
        ].join('\n'));
        const tokens = new ClarionTokenizer(doc.getText()).tokenize();
        return { doc, tokens };
    }

    // getOpenDocumentContent resolver — returns LIVE decls.inc (declares Foo, NOT Bar)
    // for the decls.inc path; null otherwise. Normalized match (mirrors server.ts:475).
    function liveIncResolver(): (absPath: string) => string | null {
        const liveInc = [
            "  MEMBER()",
            "  MODULE('mymember.clw')",
            'Foo PROCEDURE',
            '  END',
        ].join('\r\n');
        const target = incDiskPath.toLowerCase().replace(/\\/g, '/');
        return (absPath: string) =>
            absPath.toLowerCase().replace(/\\/g, '/') === target ? liveInc : null;
    }

    test('BUG PIN — Foo declared only in the LIVE .inc must NOT be flagged missing-map-declaration', async () => {
        // DISK decls.inc is STALE: a MODULE('mymember.clw') block that declares NEITHER proc.
        writeCrlf(incDiskPath, [
            "  MEMBER()",
            "  MODULE('mymember.clw')",
            '  END',
        ]);
        const { doc, tokens } = buildClwDoc();

        const diags = await validateMissingMapDeclarations(tokens, doc, liveIncResolver());
        const fooMissing = diags.find(d => d.code === 'missing-map-declaration' && /'Foo'/.test(d.message));
        assert.strictEqual(fooMissing, undefined,
            'Foo is declared in the LIVE (unsaved) .inc → must NOT be reported missing; ' +
            'reading stale disk instead of the live buffer is the #197 bug. got: ' +
            JSON.stringify(diags.map(d => d.message)));
    });

    test('SENTINEL — Bar (declared in NEITHER live nor disk) STILL fires missing-map-declaration', async () => {
        writeCrlf(incDiskPath, [
            "  MEMBER()",
            "  MODULE('mymember.clw')",
            '  END',
        ]);
        const { doc, tokens } = buildClwDoc();

        const diags = await validateMissingMapDeclarations(tokens, doc, liveIncResolver());
        const barMissing = diags.find(d => d.code === 'missing-map-declaration' && /'Bar'/.test(d.message));
        assert.ok(barMissing,
            'Bar is declared nowhere (live or disk) → must STILL fire — proves the live buffer drives ' +
            'the decision (Foo suppressed, Bar not), not blanket suppression. got: ' +
            JSON.stringify(diags.map(d => d.message)));
    });
});
