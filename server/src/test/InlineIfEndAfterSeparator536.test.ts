import * as assert from 'assert';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { TokenCache } from '../TokenCache';
import { TokenType } from '../tokenizer/TokenTypes';
import { DiagnosticProvider } from '../providers/DiagnosticProvider';
import { UnreachableCodeProvider } from '../providers/UnreachableCodeProvider';

/**
 * #536 — a single-line `IF cond THEN stmt END` placed AFTER a statement separator, with more
 * statements following on the same line, was never closed:
 *
 *     OF DeleteKey ; IF ~RECORDS(xQ) THEN RETURN END ; GlobalRequest = Action:Delete
 *
 * The structure opener only looked at the LAST significant token of the line to decide
 * "closes on the same line", and here that token is `Delete`, so the IF was pushed onto the
 * structure stack. The END handler then saw a structure keyword on the same line and treated
 * the END as inline (no pop). Result: an IF that is open forever, which then swallows the
 * CASE's END, which swallows the LOOP's, and the Problems tab reports "CASE statement is not
 * terminated with END or ." on code that compiles. The unreachable-code walker inherits the
 * same stale IF on top of its stack, so the OF lines after a `RETURN` branch were dimmed.
 */
suite('Inline IF … END after a statement separator (#536)', () => {

    let docVersion = 0;
    const createDocument = (code: string) =>
        TextDocument.create('file:///inline-if-536.clw', 'clarion', ++docVersion, code);

    const tokensOf = (code: string) => TokenCache.getInstance().getTokens(createDocument(code));

    const unterminated = (code: string) =>
        DiagnosticProvider.validateDocument(createDocument(code))
            .map(d => String(d.message))
            .filter(m => m.toLowerCase().includes('not terminated'));

    const dimmed = (code: string) =>
        UnreachableCodeProvider.provideUnreachableRanges(createDocument(code))
            .map(r => r.start.line).sort((a, b) => a - b);

    const structure = (tokens: ReturnType<typeof tokensOf>, keyword: string) =>
        tokens.find(t => t.type === TokenType.Structure && t.value.toUpperCase() === keyword)!;

    // Verbatim shape from the report (the ROUTINE labels are stand-ins for the real ones).
    const REPORTED = [
        'Browse PROCEDURE()',                                                                          // 0
        'xQ  QUEUE',                                                                                   // 1
        'x     LONG',                                                                                  // 2
        '    END',                                                                                     // 3
        '  CODE',                                                                                      // 4
        '  LOOP',                                                                                      // 5
        '      CASE KEYCODE()',                                                                        // 6
        '        OF InsertKey      ; DO Handle_Insert:Prime_VPL      ; GlobalRequest = Action:Insert   ', // 7
        '        OF MouseLeft2',                                                                       // 8
        '      OROF CtrlEnter      ; IF ~RECORDS(xQ) THEN RETURN END ; GlobalRequest = Action:Change          ', // 9
        '        OF DeleteKey      ; IF ~RECORDS(xQ) THEN RETURN END ; GlobalRequest = Action:Delete', // 10
        '',                                                                                            // 11
        '        OF CtrlMouseLeft2',                                                                   // 12
        '      OROF CtrlShiftEnter;  IF ~RECORDS(xQ) THEN RETURN END ; DO Change_VRT; RETURN',         // 13
        '      ',                                                                                      // 14
        '        OF AltShiftEnter  ;                                   Routines.Call_SP(SP:VIEW:VPL); RETURN', // 15
        '      ELSE RETURN',                                                                           // 16
        '      END',                                                                                   // 17
        '  END',                                                                                       // 18
        'Handle_Insert:Prime_VPL ROUTINE',                                                             // 19
        'Change_VRT ROUTINE',                                                                          // 20
    ].join('\r\n');

    test('bug-pin: the reported CASE raises no "not terminated" diagnostic', () => {
        assert.deepStrictEqual(unterminated(REPORTED), []);
    });

    test('bug-pin: CASE and LOOP close at their own END lines', () => {
        const tokens = tokensOf(REPORTED);
        assert.strictEqual(structure(tokens, 'CASE').finishesAt, 17, 'CASE closes at its END');
        assert.strictEqual(structure(tokens, 'LOOP').finishesAt, 18, 'LOOP closes at its END');
    });

    test('an inline IF after `;` with statements after its END closes on its own line', () => {
        const ifs = tokensOf(REPORTED).filter(t => t.type === TokenType.Structure && t.value.toUpperCase() === 'IF');
        assert.deepStrictEqual(ifs.map(t => [t.line, t.finishesAt]), [[9, 9], [10, 10], [13, 13]]);
    });

    test('bug-pin: the OF lines after a RETURN branch are not dimmed as unreachable', () => {
        assert.deepStrictEqual(dimmed(REPORTED), []);
    });

    test('the period form after `;` closes on its own line too', () => {
        const code = [
            'P PROCEDURE()',
            'xQ  QUEUE',
            'x     LONG',
            '    END',
            '  CODE',
            '  CASE KEYCODE()',
            '  OF DeleteKey ; IF ~RECORDS(xQ) THEN RETURN. ; GlobalRequest = Action:Delete',
            '  END',
        ].join('\n');
        assert.deepStrictEqual(unterminated(code), []);
        assert.strictEqual(structure(tokensOf(code), 'IF').finishesAt, 6);
    });

    test('sentinel: a genuinely unterminated CASE is still reported', () => {
        const code = [
            'P PROCEDURE()',
            '  CODE',
            '  CASE KEYCODE()',
            '  OF DeleteKey ; IF ~RECORDS(xQ) THEN RETURN END ; GlobalRequest = Action:Delete',
            '  RETURN',
        ].join('\n');
        assert.deepStrictEqual(unterminated(code), ['CASE statement is not terminated with END or .']);
    });

    test('sentinel: an IF opened after `;` that continues on later lines still needs its own END', () => {
        const code = [
            'P PROCEDURE()',
            '  CODE',
            '  CASE KEYCODE()',
            '  OF DeleteKey ; IF ~RECORDS(xQ)',
            '                   RETURN',
            '                 END',
            '  END',
        ].join('\n');
        assert.deepStrictEqual(unterminated(code), []);
        const tokens = tokensOf(code);
        assert.strictEqual(structure(tokens, 'IF').finishesAt, 5);
        assert.strictEqual(structure(tokens, 'CASE').finishesAt, 6);
    });

    test('sentinel: a same-line END that belongs to a nested structure does not close the outer one', () => {
        // The END on line 2 closes the LOOP, not the IF; the IF closes on line 4.
        const code = [
            'P PROCEDURE()',
            '  CODE',
            '  IF x THEN LOOP ; BREAK ; END ; x = 1',
            '    y = 2',
            '  END',
            '  RETURN',
        ].join('\n');
        assert.deepStrictEqual(unterminated(code), []);
        const tokens = tokensOf(code);
        assert.strictEqual(structure(tokens, 'LOOP').finishesAt, 2);
        assert.strictEqual(structure(tokens, 'IF').finishesAt, 4);
    });
});
