import * as assert from 'assert';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { ClarionTokenizer, Token, TokenType } from '../ClarionTokenizer';
import { validateCycleBreakOutsideLoop } from '../providers/diagnostics/ControlFlowDiagnostics';

/**
 * Issue #333 — a trailing comment on the CODE (or DATA) line disabled the
 * tokenizer's inCodeSection tracking: `/^\s*code\s*$/i` only matched a bare
 * CODE line, so `CODE   !STOP('Print')` never entered the code section and
 * every execution structure (IF/LOOP/CASE) in the body was skipped — LOOP
 * lost its Structure classification and finishesAt, and BREAK/CYCLE were
 * flagged "outside of a LOOP or ACCEPT structure".
 *
 * Field-reported by Edin (@Chahton) with the appgen-generated shape below
 * (verbatim trigger: `CODE` + trailing `!STOP('Print')` comment).
 */

function createDocument(code: string): TextDocument {
    return TextDocument.create('file:///f:/test/issue333.clw', 'clarion', 1, code);
}

function tokenize(code: string): Token[] {
    return new ClarionTokenizer(code).tokenize();
}

function cycleBreakDiags(code: string) {
    return validateCycleBreakOutsideLoop(tokenize(code), createDocument(code));
}

// Edin's real repro shape: class-method PROCEDURE with default parameter,
// local declarations, comment-bearing CODE line, BREAK + CYCLE inside a LOOP.
function edinFixture(codeLine: string): string {
    return [
        'ExpClassType.PrintSekcija       PROCEDURE(SHORT pn:Sekcija=1)',
        'ExportFilter                        CSTRING(251)',
        'ln:Postoji                          BYTE                               ! Da li sekcija postoji',
        codeLine,
        '    IF SELF.Error THEN RETURN.',
        '    ExportFilter = \'\'',
        '    LOOP',
        '        IF NOT SELF.ExpObj.Next() THEN BREAK.',
        '        IF SELF.ExpObj.Q.Broj=0',
        '            ExportFilter = SELF.ExpObj.Q.Formula1',
        '            CYCLE',
        '        END',
        '    END',
    ].join('\r\n');
}

const COMMENTED_CODE_LINE = '    CODE                                                          !STOP(\'Print\')';

suite('Issue #333 — trailing comment on CODE line', () => {

    test('BREAK/CYCLE inside LOOP — no warning when CODE line carries a comment', () => {
        const diags = cycleBreakDiags(edinFixture(COMMENTED_CODE_LINE));
        assert.strictEqual(
            diags.length, 0,
            `expected no diagnostics; got: ${JSON.stringify(diags.map(d => d.message))}`);
    });

    test('agreement: commented CODE line tokenizes structures identically to bare CODE', () => {
        const structural = (code: string) =>
            tokenize(code)
                .filter(t => t.type === TokenType.Structure)
                .map(t => `${t.value.toUpperCase()}@${t.line}:fin=${t.finishesAt}`);

        const bare = structural(edinFixture('    CODE'));
        // Bare variant sanity: LOOP and IFs are Structure tokens with ranges.
        assert.ok(bare.some(s => s.startsWith('LOOP@')), `bare variant lost LOOP: ${JSON.stringify(bare)}`);

        const commented = structural(edinFixture(COMMENTED_CODE_LINE));
        assert.deepStrictEqual(commented, bare,
            'structure tokens must not depend on a trailing CODE-line comment');
    });

    test('bidirectional: genuine BREAK outside LOOP still flagged with commented CODE line', () => {
        const code = [
            'MyProc  PROCEDURE()',
            '    CODE          ! trailing comment',
            '    LOOP',
            '        CYCLE',
            '    END',
            '    BREAK',
        ].join('\r\n');
        const diags = cycleBreakDiags(code);
        assert.strictEqual(diags.length, 1,
            `expected exactly the outside-LOOP BREAK; got: ${JSON.stringify(diags.map(d => d.message))}`);
        assert.ok(diags[0].message.includes("'BREAK'"));
        assert.strictEqual(diags[0].range.start.line, 5);
    });

    test('ROUTINE DATA/CODE lines with trailing comments still delimit the data section', () => {
        const code = [
            'MyProc  PROCEDURE()',
            '    CODE',
            '    DO MyRout',
            '',
            'MyRout  ROUTINE',
            '    DATA        ! locals below',
            'RoutLocal   LONG',
            '    CODE        ! body below',
            '    RoutLocal = 1',
        ].join('\r\n');
        const tokens = tokenize(code);
        const local = tokens.find(t => t.value === 'RoutLocal' && t.start === 0 && t.type === TokenType.Label);
        assert.ok(local, 'RoutLocal declaration label not found');
        assert.strictEqual(local!.subType, TokenType.Variable,
            'routine-local under commented DATA line must be recognized as a variable');
    });
});
