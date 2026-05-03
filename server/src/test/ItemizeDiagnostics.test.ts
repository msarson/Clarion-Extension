import * as assert from 'assert';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Diagnostic } from 'vscode-languageserver/node';
import { TokenCache } from '../TokenCache';
import { validateItemizeBlocks } from '../providers/diagnostics/ItemizeDiagnostics';

/**
 * Note on indentation: Clarion's column-0 convention applies to ITEMIZE members —
 * the Label sits at column 0, the EQUATE keyword is whitespace-separated. This
 * mirrors the existing Gap B test layout in DocumentStructure.SemanticAPIs.test.ts.
 */

function makeDoc(code: string, uri: string = 'file:///itemize-test.clw'): TextDocument {
    return TextDocument.create(uri, 'clarion', 1, code);
}

function run(code: string): Diagnostic[] {
    const doc = makeDoc(code, `file:///itemize-${Math.random().toString(36).slice(2)}.clw`);
    const tokens = TokenCache.getInstance().getTokens(doc);
    return validateItemizeBlocks(tokens, doc);
}

function messagesOf(d: Diagnostic[]): string[] { return d.map(x => x.message); }

suite('ItemizeDiagnostics — itemize-non-equate', () => {

    test('ITEMIZE with only EQUATE members produces no diagnostics', () => {
        const code = [
            'Color ITEMIZE',
            'Red    EQUATE',
            'Green  EQUATE',
            'Blue   EQUATE',
            '       END',
        ].join('\n');
        const diags = run(code);
        assert.strictEqual(diags.length, 0,
            `expected 0 diagnostics; got: ${messagesOf(diags).join(' / ')}`);
    });

    test('ITEMIZE with a plain non-EQUATE declaration warns on that line', () => {
        const code = [
            'Color ITEMIZE',
            'Red    EQUATE',
            'MyVar  LONG',
            'Blue   EQUATE',
            '       END',
        ].join('\n');
        const diags = run(code);
        assert.strictEqual(diags.length, 1,
            `expected exactly 1 warning; got: ${messagesOf(diags).join(' / ')}`);
        assert.ok(diags[0].message.includes("'MyVar'"),
            `message should name MyVar; got: "${diags[0].message}"`);
        assert.strictEqual(diags[0].code, 'itemize-non-equate');
    });

    test('Comments, blank lines, and END do not generate warnings', () => {
        const code = [
            'Color ITEMIZE',
            '! list of named colors',
            '',
            'Red    EQUATE  ! primary',
            '',
            'Green  EQUATE',
            '       END',
        ].join('\n');
        const diags = run(code);
        assert.strictEqual(diags.length, 0,
            `expected 0 diagnostics; got: ${messagesOf(diags).join(' / ')}`);
    });

    test('ITEMIZE,PRE(X) with EQUATE members produces no diagnostics', () => {
        const code = [
            'Color ITEMIZE,PRE(Clr)',
            'Red    EQUATE',
            'Green  EQUATE',
            'Blue   EQUATE',
            '       END',
        ].join('\n');
        const diags = run(code);
        assert.strictEqual(diags.length, 0,
            `expected 0 diagnostics; got: ${messagesOf(diags).join(' / ')}`);
    });

    test('Nested ITEMIZE: outer flags inner ITEMIZE label; inner with only EQUATEs is silent at its own level', () => {
        const code = [
            'Outer ITEMIZE',
            'Red    EQUATE',
            'Inner  ITEMIZE',
            'Green  EQUATE',
            'Blue   EQUATE',
            '       END',
            'Yellow EQUATE',
            '       END',
        ].join('\n');
        const diags = run(code);
        // Outer pass should warn on `Inner` (the nested ITEMIZE label is NOT an EQUATE).
        assert.strictEqual(diags.length, 1,
            `expected exactly 1 warning at the outer level; got: ${messagesOf(diags).join(' / ')}`);
        assert.ok(diags[0].message.includes("'Inner'"),
            `message should name 'Inner'; got: "${diags[0].message}"`);
    });

    test('Document with no ITEMIZE blocks produces no diagnostics', () => {
        const code = [
            'MyProc PROCEDURE()',
            'Counter LONG',
            'CODE',
            '  RETURN',
            'END',
        ].join('\n');
        const diags = run(code);
        assert.strictEqual(diags.length, 0);
    });

    test('Multiple ITEMIZE blocks: each evaluated independently', () => {
        const code = [
            'Color ITEMIZE',
            'Red    EQUATE',
            '       END',
            '',
            'Status ITEMIZE',
            'Open   EQUATE',
            'Stale  STRING(10)',
            'Closed EQUATE',
            '       END',
        ].join('\n');
        const diags = run(code);
        assert.strictEqual(diags.length, 1,
            `expected 1 warning (Stale STRING); got: ${messagesOf(diags).join(' / ')}`);
        assert.ok(diags[0].message.includes("'Stale'"),
            `message should name 'Stale'; got: "${diags[0].message}"`);
    });
});
