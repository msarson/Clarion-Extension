// =============================================================================
// server/src/test/ClarionFormatter.test.ts
//
// TDD test suite for ClarionFormatter.  Tests are written RED-first:
//
//   Bug 1  identifyExecutionRanges / identifyLocalDataSections use
//          token.subType === TokenType.Procedure, which is NEVER true.
//          Actual subTypes set by DocumentStructure are GlobalProcedure and
//          MethodImplementation.  Routines already pass because
//          subType === TokenType.Routine IS the correct value.
//
//   Bug 2  The single-line structure path (finishesAt === currentLine) calls
//          padToCol0(this.indentSize) unconditionally, ignoring the indent
//          stack.  Structures nested inside another structure are formatted at
//          the minimum indent instead of the parent's child column.
//
//   Bug 3  format() always joins lines with "\r\n", ignoring the original
//          line-ending convention of the input text.
//
// RED tests:  FAIL with the current code, PASS after the corresponding fix.
// GREEN tests: PASS both before and after any fix (regression guard).
//
// Execution:  npm run test:server
// =============================================================================

import * as assert from 'assert';
import ClarionFormatter from '../ClarionFormatter';
import { ClarionTokenizer } from '../ClarionTokenizer';

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

/**
 * Tokenise `code` with ClarionTokenizer (which also runs DocumentStructure,
 * setting finishesAt, executionMarker, subType, parent/children, etc.) then
 * run ClarionFormatter on the enriched token array.
 */
function fmt(code: string, indentSize = 4): string {
    const tokens = new ClarionTokenizer(code).tokenize();
    return new ClarionFormatter(tokens, code, { indentSize }).format();
}

/**
 * Split a formatted result into individual lines regardless of whether the
 * formatter used LF or CRLF.  Use when the test itself is line-ending-agnostic.
 */
function splitLines(result: string): string[] {
    return result.split(/\r?\n/);
}

/**
 * Wrap body lines in a minimal PROCEDURE/CODE context.
 *
 * Without this wrapper, structure keywords like IF/END/ELSE that appear at
 * column 0 are tokenised as Label tokens (not Structure tokens), causing the
 * formatter to take the label path instead of the structure path.  All tests
 * that exercise structure-keyword formatting must use this wrapper.
 *
 * The resulting lines are (0-based):
 *   [0]  P       PROCEDURE()
 *   [1]      CODE
 *   [2..n]   <bodyLines>
 *   [n+1]    '' (trailing empty from final join separator)
 */
function wrap(bodyLines: string[], eol: string = '\r\n'): string {
    return ['P  PROCEDURE()', '  CODE', ...bodyLines, ''].join(eol);
}

// =============================================================================
// Bug 1 – identifyExecutionRanges / identifyLocalDataSections wrong subType
// =============================================================================
//
// Root cause (both functions, same pattern):
//
//   if (token.subType === TokenType.Procedure || token.subType === TokenType.Routine)
//
// TokenType.Procedure is a *type* value, not a *subType* value.
// DocumentStructure never writes it into token.subType.
// The fix must change the procedure arm to check for:
//   token.subType === TokenType.GlobalProcedure  ||
//   token.subType === TokenType.MethodImplementation
//
// Observable impact on format():
//   identifyLocalDataSections() never registers a local-data-section for any
//   PROCEDURE token → the variables before CODE fall through to the generic
//   label path, which aligns each variable's type independently at
//   snap0(labelLen + indentSize), producing inconsistent column positions
//   instead of the uniform snap0(maxLabelLength + 1) column.
//
// =============================================================================

suite('ClarionFormatter – Bug 1: wrong subType in identifyLocalDataSections', () => {

    // -------------------------------------------------------------------------
    // RED tests — fail with current code, pass after fix
    // -------------------------------------------------------------------------

    test('[RED] GlobalProcedure: two local-data vars with different label lengths must align types at the same column', () => {
        // ┌─ Why this fails ────────────────────────────────────────────────────┐
        // │  identifyLocalDataSections() tests:                                 │
        // │    token.subType === TokenType.Procedure                            │
        // │  But the PROCEDURE token has subType === TokenType.GlobalProcedure. │
        // │  The check never matches → no local-data section is registered.     │
        // │                                                                      │
        // │  Both vars fall to the generic label path:                          │
        // │    stmtCol0 = max(snap0(labelLen + indentSize), parentCol0)         │
        // │                                                                      │
        // │  'x'       (1 char): snap0(1+4)=8  → LONG    at col 8   (7 spaces) │
        // │  'longVar' (7 chars): snap0(7+4)=12 → STRING at col 12  (5 spaces) │
        // │                                                                      │
        // │  After fix, identifyLocalDataSections() registers the section:      │
        // │    maxLabelLength = max(1,7) = 7                                    │
        // │    alignCol0 = snap0(7+1) = snap0(8) = 8                           │
        // │                                                                      │
        // │  'x'       → spacesToAdd = max(1, 8-1) = 7 → 'x       LONG'       │
        // │  'longVar' → spacesToAdd = max(1, 8-7) = 1 → 'longVar STRING(10)'  │
        // └────────────────────────────────────────────────────────────────────┘

        const code = [
            'MyProc  PROCEDURE()',
            'x       LONG',
            'longVar STRING(10)',
            '  CODE',
            '  x = 1',
            '  RETURN',
        ].join('\n');

        const result = fmt(code);
        const lines = splitLines(result);

        // 'x': both paths happen to agree (col 8).
        // This assertion is green – it guards against accidental regression.
        assert.strictEqual(
            lines[1],
            'x       LONG',
            'x LONG – LONG must be at column 8',
        );

        // 'longVar': without fix → STRING at col 12 ('longVar     STRING(10)')
        //            with fix    → STRING at col 8  ('longVar STRING(10)')
        // This assertion FAILS before the Bug 1 fix.
        assert.strictEqual(
            lines[2],
            'longVar STRING(10)',
            '[RED] longVar STRING(10) – STRING must be at column 8, aligned with LONG above it',
        );
    });

    test('[RED] GlobalProcedure: three local-data vars align types at snap0(maxLabelLength+1)', () => {
        // maxLabelLength = max(1,2,3) = 3 → alignCol0 = snap0(4) = 4
        //   'a'   → spacesToAdd = max(1, 4-1) = 3 → 'a   LONG'
        //   'bb'  → spacesToAdd = max(1, 4-2) = 2 → 'bb  STRING(5)'
        //   'ccc' → spacesToAdd = max(1, 4-3) = 1 → 'ccc DATE'
        //
        // Without fix (label path, indentSize=4):
        //   snap0(1+4)=8  → 'a       LONG'
        //   snap0(2+4)=8  → 'bb      STRING(5)'
        //   snap0(3+4)=8  → 'ccc     DATE'
        //
        // With fix, types move from col 8 to col 4 — all three RED.

        const code = [
            'Simple  PROCEDURE()',
            'a       LONG',
            'bb      STRING(5)',
            'ccc     DATE',
            '  CODE',
            '  RETURN',
        ].join('\n');

        const result = fmt(code);
        const lines = splitLines(result);

        // Each assertion FAILS before Bug 1 fix (current output has types at col 8).
        assert.strictEqual(lines[1], 'a   LONG',      '[RED] a:   LONG must be at col 4');
        assert.strictEqual(lines[2], 'bb  STRING(5)', '[RED] bb:  STRING must be at col 4');
        assert.strictEqual(lines[3], 'ccc DATE',      '[RED] ccc: DATE must be at col 4');
    });

    test('[GREEN] GlobalProcedure: CODE body statements are indented as statements, not as label lines', () => {
        // Even when Bug 1 execution-range detection is broken, properly-indented
        // code lines (col > 0) avoid the label path because the Label pattern
        // only fires at column 0.  This test still documents the expected output
        // so any regression introduced by the fix is caught.
        //
        // Without fix: execution range not registered but indented statements
        // still use the else-branch → lineIndent = indentSize = 4.
        // With fix: execution range IS registered; result is identical because
        // identifyLabelLines / labelLines are not consulted by format() directly.
        // → This test is GREEN (passes before AND after fix).

        const code = [
            'DoSomething  PROCEDURE()',
            '  CODE',
            '  result = 42',
            '  RETURN',
        ].join('\n');

        const result = fmt(code);
        const lines = splitLines(result);

        // Statements inside CODE must be at indentSize (4) when no enclosing structure.
        assert.strictEqual(lines[2], '    result = 42', 'assignment inside CODE at col 4');
        assert.strictEqual(lines[3], '    RETURN',      'RETURN inside CODE at col 4');
    });

    // -------------------------------------------------------------------------
    // GREEN tests — must pass before and after Bug 1 fix
    // -------------------------------------------------------------------------

    test('[GREEN] standalone variable outside any procedure uses the label path', () => {
        // A variable declared at file level (no PROCEDURE parent) must still be
        // formatted by the label path.  The Bug 1 fix must not break this case.
        //
        // 'myVar' (5 chars): stmtCol0 = max(snap0(5+4), 4) = max(snap0(9)=12, 4) = 12
        // spacesToAdd = 12 - 5 = 7
        // Input 'myVar  LONG': LONG at original col 7; rebuild → 'myVar       LONG'

        const code = 'myVar  LONG';
        const result = fmt(code);

        // snap0(9) = 9 + ((4 - 9%4) % 4) = 9 + 3 = 12  → LONG at col 12
        assert.strictEqual(
            result,
            'myVar       LONG',
            'standalone variable: LONG must be at column 12 (label path)',
        );
    });

    test('[GREEN] ROUTINE local-data section is already correctly aligned (Routine subType check is correct)', () => {
        // token.subType === TokenType.Routine is the CORRECT check and was never
        // broken.  This test confirms routines are unaffected by the Bug 1 fix.
        //
        // The routine has two variables before CODE.
        // maxLabelLength = max(1, 2) = 2 → alignCol0 = snap0(3) = 4
        //   'a'  → spacesToAdd = max(1, 4-1) = 3 → 'a   LONG'
        //   'bc' → spacesToAdd = max(1, 4-2) = 2 → 'bc  STRING(10)'

        const code = [
            'WrapProc  PROCEDURE()',
            '  CODE',
            '  RETURN',
            'MyRoutine ROUTINE',
            '  DATA',
            'a   LONG',
            'bc  STRING(10)',
            '  CODE',
            '  RETURN',
        ].join('\n');

        const result = fmt(code);
        const lines = splitLines(result);

        // Lines 5 and 6 are the routine-local variables.
        assert.strictEqual(lines[5], 'a   LONG',       '[GREEN] routine var a:  LONG at col 4');
        assert.strictEqual(lines[6], 'bc  STRING(10)', '[GREEN] routine var bc: STRING at col 4');
    });
});

// =============================================================================
// Bug 2 – inline single-line structure ignores indent stack
// =============================================================================
//
// Root cause (format(), Structure branch):
//
//   if (firstToken.finishesAt !== undefined && firstToken.finishesAt === index) {
//       formattedLines.push(padToCol0(this.indentSize) + originalLine.trim());
//       continue;
//   }
//
// this.indentSize is the *minimum* indent (e.g. 4), hard-coded regardless of
// how deep the current indent stack is.  When the single-line structure appears
// inside a parent structure, the correct indent is the parent's indentLevel
// (parentCol0 + indentSize), not the bare minimum.
//
// The fix should derive currentIndent from the stack, falling back to
// this.indentSize only when the stack is empty.
//
// =============================================================================

suite('ClarionFormatter – Bug 2: single-line structure ignores indent stack', () => {

    // -------------------------------------------------------------------------
    // RED tests — fail with current code
    // -------------------------------------------------------------------------

    test('[RED] single-line IF nested inside outer IF must be at parent\'s child indent, not minimum', () => {
        // Layout (after wrapper header P PROCEDURE() + CODE at lines[0,1]):
        //   lines[2]: IF outer  → push {startColumn:4, indentLevel:8}
        //   lines[3]: IF inner END (single-line, finishesAt=3)
        //     BUG: padToCol0(indentSize=4)            → '    IF inner END'     (col 4 WRONG)
        //     FIX: padToCol0(indentStack.last.indentLevel=8) → '        IF inner END' (col 8)
        //   lines[4]: END → pop → lineIndent=4 → '    END'
        //
        // IF must be inside a PROCEDURE/CODE section to be tokenised as Structure
        // (not Label).  The wrap() helper provides that context.

        const code = wrap(['  IF outer', '    IF inner END', '  END']);
        const result = fmt(code);
        const lines = splitLines(result);

        assert.strictEqual(lines[2], '    IF outer', 'outer IF at col 4');
        assert.strictEqual(lines[4], '    END',      'outer END at col 4');

        // FAILS before the Bug 2 fix (current output: '    IF inner END').
        assert.strictEqual(
            lines[3],
            '        IF inner END',
            '[RED] nested single-line IF must be at col 8 (parent child indent), not col 4',
        );
    });

    test('[RED] single-line IF at second nesting level must be at 3×indentSize', () => {
        // lines[2]: IF a → push {startColumn:4,  indentLevel:8}
        // lines[3]: IF b → push {startColumn:8,  indentLevel:12}
        // lines[4]: IF c END (single-line, finishesAt=4)
        //   BUG: padToCol0(4)  → '    IF c END'
        //   FIX: padToCol0(12) → '            IF c END'
        // lines[5]: END → pop {8,12} → lineIndent=8 → '        END'
        // lines[6]: END → pop {4,8}  → lineIndent=4 → '    END'

        const code = wrap([
            '  IF a',
            '    IF b',
            '      IF c END',
            '    END',
            '  END',
        ]);

        const result = fmt(code);
        const lines = splitLines(result);

        assert.strictEqual(lines[2], '    IF a',     'first level IF at col 4');
        assert.strictEqual(lines[3], '        IF b', 'second level IF at col 8');
        assert.strictEqual(lines[5], '        END',  'second level END at col 8');
        assert.strictEqual(lines[6], '    END',      'first level END at col 4');

        // FAILS before Bug 2 fix (current output: '    IF c END').
        assert.strictEqual(
            lines[4],
            '            IF c END',
            '[RED] doubly-nested single-line IF must be at col 12',
        );
    });

    // -------------------------------------------------------------------------
    // GREEN tests — must pass before and after Bug 2 fix
    // -------------------------------------------------------------------------

    test('[GREEN] top-level single-line IF gets minimum indent (both paths agree)', () => {
        // When the indent stack is empty (at the first content level inside CODE),
        // the bug path and the fix path both produce padToCol0(indentSize) = 4 spaces.
        // No regression expected.

        const code = wrap(['  IF a END', '  IF b', '  END']);
        const result = fmt(code);
        const lines = splitLines(result);

        // lines[0,1] are P PROCEDURE() and CODE
        assert.strictEqual(lines[2], '    IF a END', 'top-level single-line IF at col 4 (minimum)');
        assert.strictEqual(lines[3], '    IF b',     'normal IF at col 4');
        assert.strictEqual(lines[4], '    END',      'END at col 4');
    });

    test('[GREEN] single-line structure does not corrupt the indent stack for following lines', () => {
        // After a single-line structure, the indent stack must remain unmodified
        // so subsequent lines at the same depth are formatted correctly.
        //
        //   lines[2]: IF outer           ← push {startColumn:4, indentLevel:8}
        //   lines[3]: IF single END      ← single-line; stack unchanged after
        //   lines[4]: x = 1              ← must be at 4+4=8 (child of outer IF)
        //   lines[5]: END                ← pop; lineIndent=4

        const code = wrap([
            '  IF outer',
            '    IF single END',
            '    x = 1',
            '  END',
        ]);

        const result = fmt(code);
        const lines = splitLines(result);

        // These assertions pass both before and after the Bug 2 fix.
        assert.strictEqual(lines[4], '        x = 1', 'statement after single-line structure at col 8');
        assert.strictEqual(lines[5], '    END',        'END at col 4');
    });
});

// =============================================================================
// Bug 3 – hardcoded CRLF in format()
// =============================================================================
//
// Root cause:
//   return formattedLines.join("\r\n");   ← always CRLF
//
// Fix: detect the line ending used in the *input* text and join with the same
// separator:
//   const eol = text.includes('\r\n') ? '\r\n' : '\n';
//   return formattedLines.join(eol);
//
// =============================================================================

suite('ClarionFormatter – Bug 3: hardcoded CRLF line endings', () => {

    test('[RED] LF input must produce LF output', () => {
        // Input uses Unix LF.  After the fix the output must also use LF.
        // Current code always joins with "\r\n" → output contains CRLF → FAIL.
        //
        // The wrap() helper is used with '\n' so the entire input uses LF.

        const code = wrap(['  IF x', '  END'], '\n');
        const result = fmt(code);

        assert.strictEqual(
            result,
            'P       PROCEDURE()\n    CODE\n    IF x\n    END\n',
            '[RED] LF input: output must use LF, not CRLF',
        );
    });

    test('[RED] mixed content: LF input with multiple lines', () => {
        const code = wrap(['  IF outer', '    IF inner', '    END', '  END'], '\n');
        const result = fmt(code);

        assert.strictEqual(
            result,
            'P       PROCEDURE()\n    CODE\n    IF outer\n        IF inner\n        END\n    END\n',
            '[RED] multi-line LF input: all separators must be LF',
        );
    });

    test('[GREEN] CRLF input produces CRLF output', () => {
        // Current code already handles CRLF correctly (join always uses \r\n).
        // After the fix, CRLF input is still detected and joined with \r\n.

        const code = wrap(['  IF x', '  END'], '\r\n');
        const result = fmt(code);

        assert.strictEqual(
            result,
            'P       PROCEDURE()\r\n    CODE\r\n    IF x\r\n    END\r\n',
            '[GREEN] CRLF input: output must use CRLF',
        );
    });

    test('[GREEN] CRLF input with multiple lines', () => {
        const code = wrap(['  IF outer', '    IF inner', '    END', '  END'], '\r\n');
        const result = fmt(code);

        assert.strictEqual(
            result,
            'P       PROCEDURE()\r\n    CODE\r\n    IF outer\r\n        IF inner\r\n        END\r\n    END\r\n',
            '[GREEN] multi-line CRLF: separators remain CRLF',
        );
    });
});

// =============================================================================
// Regression suite – basic formatting behaviours that must never break
// =============================================================================

suite('ClarionFormatter – regression: basic indentation', () => {

    test('unlabeled IF indents its children by indentSize and END aligns with IF', () => {
        // Structure keywords must be inside a PROCEDURE/CODE block to be tokenised
        // as Structure tokens.  Lines [0,1] are the procedure header and CODE.
        const code = wrap(['  IF x', '    x = 1', '  END']);
        const result = fmt(code);
        const lines = splitLines(result);

        assert.strictEqual(lines[2], '    IF x',       'IF at col 4');
        assert.strictEqual(lines[3], '        x = 1',  'child statement at col 8');
        assert.strictEqual(lines[4], '    END',         'END aligns with IF at col 4');
    });

    test('END aligns with its opening structure keyword', () => {
        const code = wrap(['  IF condition', '  END']);
        const result = fmt(code);
        const lines = splitLines(result);

        const ifIndent  = lines[2].search(/\S/);
        const endIndent = lines[3].search(/\S/);

        assert.strictEqual(ifIndent, endIndent, 'END must start at the same column as IF');
    });

    test('nested structures increase indent at each level', () => {
        const code = wrap([
            '  IF outer',
            '    IF inner',
            '    END',
            '  END',
        ]);

        const result = fmt(code);
        const lines = splitLines(result);

        assert.strictEqual(lines[2], '    IF outer',    'outer IF at col 4');
        assert.strictEqual(lines[3], '        IF inner', 'inner IF at col 8');
        assert.strictEqual(lines[4], '        END',      'inner END at col 8');
        assert.strictEqual(lines[5], '    END',          'outer END at col 4');
    });

    test('empty lines are preserved as empty strings with no added spaces', () => {
        const code = wrap(['  IF x', '', '  END']);
        const result = fmt(code);
        const lines = splitLines(result);

        assert.strictEqual(lines[3], '', 'blank line must be empty string');
    });

    test('comment inside a structure is indented to the child level', () => {
        const code = wrap(['  IF x', '    ! this is a comment', '  END']);
        const result = fmt(code);
        const lines = splitLines(result);

        assert.strictEqual(lines[3], '        ! this is a comment',
            'comment inside IF must be at col 8');
    });

    test('label followed by type keyword: label at col 0, type at next grid stop', () => {
        // 'x' (1 char) + LONG: stmtCol0 = max(snap0(1+4)=8, 4) = 8 → 7 spaces
        const code = 'x  LONG';
        const result = fmt(code);

        assert.strictEqual(result, 'x       LONG',
            'label (1 char) + LONG: LONG at column 8');
    });

    test('label followed by STRING type is aligned to next tab grid stop', () => {
        // 'myVar' (5 chars): stmtCol0 = max(snap0(9)=12, 4) = 12 → spacesToAdd=7
        const code = 'myVar  STRING(20)';
        const result = fmt(code);

        assert.strictEqual(result, 'myVar       STRING(20)',
            'myVar (5 chars): STRING must be at column 12');
    });

    test('label-only line (no type or structure) is preserved at column 0', () => {
        const code = 'SomeLabel';
        const result = fmt(code);

        assert.strictEqual(result, 'SomeLabel',
            'label-only line must stay at column 0');
    });

    test('label followed by structure keyword: structure placed at next full tab stop after label+gap', () => {
        // 'MyQ' (3 chars) + QUEUE:
        //   labelEnd0=3, minAfterLabel0=7, nextGridAfterLbl=snap0(7)=8
        //   structureCol0 = max(8, 0, 4) = 8 → spacesToAdd=5
        const code = 'MyQ  QUEUE\nEND';
        const result = fmt(code);
        const lines = splitLines(result);

        assert.ok(lines[0].startsWith('MyQ'),       'label MyQ must be at column 0');
        assert.ok(lines[0].includes('QUEUE'),        'QUEUE keyword must appear on the same line');
        const queueCol = lines[0].indexOf('QUEUE');
        assert.strictEqual(queueCol, 8,
            'QUEUE must start at column 8 (next tab stop after label+gap)');
    });

    test('ELSE reduces indent back to opening structure level then restores it', () => {
        const code = wrap([
            '  IF x',
            '    y = 1',
            '  ELSE',
            '    y = 2',
            '  END',
        ]);

        const result = fmt(code);
        const lines = splitLines(result);

        assert.strictEqual(lines[2], '    IF x',       'IF at col 4');
        assert.strictEqual(lines[3], '        y = 1',  'then-body at col 8');
        assert.strictEqual(lines[4], '    ELSE',        'ELSE at col 4 (same as IF)');
        assert.strictEqual(lines[5], '        y = 2',  'else-body at col 8');
        assert.strictEqual(lines[6], '    END',         'END at col 4');
    });

    test('indentSize option is respected throughout the document', () => {
        // With indentSize=2: IF at col 2, child at col 4, END at col 2
        const code = wrap(['  IF x', '    x = 1', '  END']);
        const result = fmt(code, 2);
        const lines = splitLines(result);

        assert.strictEqual(lines[2], '  IF x',    'IF at col 2 with indentSize=2');
        assert.strictEqual(lines[3], '    x = 1', 'child at col 4 with indentSize=2');
        assert.strictEqual(lines[4], '  END',     'END at col 2 with indentSize=2');
    });
});

// =============================================================================
// Bug 1 side-effect: procedure header formatting is unaffected by the fix
// =============================================================================

suite('ClarionFormatter – Bug 1 side-effect: procedure header line unchanged by fix', () => {

    test('PROCEDURE header line is formatted the same before and after Bug 1 fix', () => {
        // The header line uses the label path (firstToken=Label, secondToken=PROCEDURE).
        // Neither identifyLocalDataSections nor identifyExecutionRanges affects
        // how the header itself is formatted.
        //
        // 'MyProc' (6 chars) + PROCEDURE:
        //   stmtCol0 = max(snap0(6+4)=12, 4) = 12 → spacesToAdd=6
        //   formattedLine = 'MyProc' + 6×' ' + 'PROCEDURE()'
        //                 = 'MyProc      PROCEDURE()'

        const code = [
            'MyProc  PROCEDURE()',
            'x       LONG',
            '  CODE',
            '  RETURN',
        ].join('\n');

        const result = fmt(code);
        const lines = splitLines(result);

        assert.strictEqual(
            lines[0],
            'MyProc      PROCEDURE()',
            'procedure header: label at col 0, PROCEDURE at col 12',
        );
    });

    test('method implementation preserves dot-notation in label (e.g. ThisWindow.Init PROCEDURE)', () => {
        // The tokenizer emits Label("ThisWindow") + Variable("Init") + Procedure("PROCEDURE").
        // The formatter must reconstruct "ThisWindow.Init" from the original line text,
        // not just use firstToken.value which would drop the ".Init" part.
        //
        // "ThisWindow.Init" (15 chars): stmtCol0 = max(snap0(15+4)=20, 4) = 20
        const code = [
            'ThisWindow.Init  PROCEDURE()',
            '  CODE',
            '  RETURN',
        ].join('\r\n');

        const result = fmt(code);
        const lines = splitLines(result);

        assert.ok(
            lines[0].startsWith('ThisWindow.Init'),
            'dot-notation label must be preserved: got ' + JSON.stringify(lines[0]),
        );
        assert.ok(
            lines[0].includes('PROCEDURE'),
            'PROCEDURE keyword must appear on the same line',
        );
    });
});

// =============================================================================
// Bug 4 – CLASS in procedure local data section: END at wrong column,
//          method declarations not indented from CLASS keyword
// =============================================================================
//
// Root cause:
//   When a PROCEDURE contains a CLASS declaration in its local data section,
//   the formatter's local-data-section path fires for "ThisWindow CLASS(...)".
//   That path formats the line as a flat variable (label + spaces + rest) and
//   does NOT push the CLASS token to the indent stack.
//
//   Consequence 1: The END that closes the CLASS pops from an empty stack,
//   so lineIndent falls back to finalIndent (= indentSize), producing "    END"
//   instead of indenting to match the CLASS keyword column.
//
//   Consequence 2: Method declarations inside the CLASS body ("Init PROCEDURE()")
//   also go through the local-data-section path, aligning their PROCEDURE keyword
//   to the same column as the CLASS keyword rather than CLASS_col + indentSize.
//
// Fix: Skip the local-data-section path when either:
//   (a) the line contains a Structure token (CLASS/WINDOW/GROUP etc.) — these
//       must push to the indent stack; or
//   (b) the indent stack is non-empty (we are inside a structure already) —
//       items inside a CLASS body must use the stack-based indent context.
//
// =============================================================================

suite('ClarionFormatter – Bug 4: CLASS in local data section END alignment', () => {

    // Minimal test code: procedure with a CLASS in its local data section.
    //   Main    PROCEDURE()
    //   Obj     CLASS
    //   Init      PROCEDURE()
    //     END
    //     CODE
    //     RETURN
    //
    // With indentSize=4:
    //   - "Obj" (3 chars) + CLASS: structureCol0 = max(snap0(3+4)=8, 4) = 8
    //     Push {startColumn:8, indentLevel:12}
    //   - "Init" (4 chars) + PROCEDURE: stmtCol0 = max(snap0(4+4)=8, 12) = 12
    //   - END: pop → lineIndent=8

    const classInLocalData = [
        'Main  PROCEDURE()',
        'Obj  CLASS',
        'Init   PROCEDURE()',
        '  END',
        '  CODE',
        '  RETURN',
    ].join('\n');

    test('[RED] END of CLASS in local data section must align with CLASS keyword column', () => {
        const result = fmt(classInLocalData);
        const lines = splitLines(result);

        // Find the CLASS line and the END line
        const classLine = lines.find(l => /\bCLASS\b/.test(l) && !l.includes('CLASS('));
        const endLine   = lines.find(l => l.trimStart() === 'END');

        assert.ok(classLine, 'CLASS line must appear in output');
        assert.ok(endLine,   'END line must appear in output');

        const classCol = classLine!.indexOf('CLASS');
        const endCol   = endLine!.search(/\S/); // first non-space = E of END

        assert.strictEqual(
            endCol,
            classCol,
            `END must align with CLASS keyword (CLASS at col ${classCol}, END at col ${endCol})`,
        );
    });

    test('[RED] method declaration PROCEDURE must be indented from CLASS, not at same column', () => {
        const result = fmt(classInLocalData);
        const lines = splitLines(result);

        const classLine = lines.find(l => /\bCLASS\b/.test(l) && !l.includes('CLASS('));
        const initLine  = lines.find(l => l.trimStart().startsWith('Init'));

        assert.ok(classLine, 'CLASS line must appear in output');
        assert.ok(initLine,  'Init method line must appear in output');

        const classCol     = classLine!.indexOf('CLASS');
        const procedureCol = initLine!.indexOf('PROCEDURE');

        assert.ok(
            procedureCol > classCol,
            `PROCEDURE col (${procedureCol}) must be > CLASS col (${classCol}) — method must be indented inside CLASS`,
        );
    });
});
