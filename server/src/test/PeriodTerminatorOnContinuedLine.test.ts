import * as assert from 'assert';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { TokenCache } from '../TokenCache';
import { TokenType } from '../tokenizer/TokenTypes';
import { DiagnosticProvider } from '../providers/DiagnosticProvider';

/**
 * A `.` terminator that lands on the tail of a `|`-continued statement closes its structure,
 * exactly as a `.` on an unbroken line does:
 *
 *     IF hr = 0
 *       RETURN SELF.Run(a, b, |
 *         c, d).
 *     END
 *
 * The `.` closes the inner IF; the END closes the outer one. `handleEndStatementForStructure`
 * used to bail out of the pop whenever the preceding line ended in `|`, on the premise that
 * such a period "ends a continued statement, not a structure". Clarion has no statement-
 * terminating period — a standalone `.` is the END equivalent and nothing else — so the inner
 * IF stayed open, the following END popped IT instead of the outer IF, and the outer IF was
 * reported as unterminated on code the compiler accepts.
 */
suite('Period terminator on a |-continued line', () => {

    let docVersion = 0;
    const createDocument = (code: string) =>
        TextDocument.create('file:///period-continued.clw', 'clarion', ++docVersion, code);

    const tokensOf = (code: string) => TokenCache.getInstance().getTokens(createDocument(code));

    const unterminated = (code: string) =>
        DiagnosticProvider.validateDocument(createDocument(code))
            .map(d => String(d.message))
            .filter(m => m.toLowerCase().includes('not terminated'));

    const structures = (code: string, keyword: string) =>
        tokensOf(code).filter(t => t.type === TokenType.Structure && t.value.toUpperCase() === keyword);

    // The reported shape: a nested IF closed by a period at the end of a continued RETURN,
    // with the outer IF closed by a plain END on the next line.
    const NESTED = [
        'SomeClass.Invoke PROCEDURE(LONG p1, LONG p2)',
        'hr    LONG',
        '  CODE',
        '    IF Helper.Init(p1)',
        '      hr = Helper.Resolve(p2)',
        '      IF hr = 0',
        '        RETURN SELF.Run(p1, p2, |',
        '          p2, hr).',
        '    END',
        '    RETURN hr',
        ''
    ].join('\n');

    test('neither IF is reported as unterminated', () => {
        assert.deepStrictEqual(unterminated(NESTED), []);
    });

    test('the inner IF closes on the continued line\'s period, the outer on the END', () => {
        const ifs = structures(NESTED, 'IF');
        assert.strictEqual(ifs.length, 2, 'expected two IF structures');
        const [outer, inner] = ifs;
        assert.strictEqual(inner.finishesAt, 7, 'inner IF should close at the period line');
        assert.strictEqual(outer.finishesAt, 8, 'outer IF should close at the END line');
    });

    // The same period, reached without any continuation, has always worked — kept as the
    // control so a regression here is distinguishable from a regression in the fix above.
    const UNBROKEN = [
        'SomeClass.Invoke PROCEDURE(LONG p1)',
        'hr    LONG',
        '  CODE',
        '    IF Helper.Init(p1)',
        '      IF hr = 0',
        '        RETURN SELF.Run(p1).',
        '    END',
        '    RETURN hr',
        ''
    ].join('\n');

    test('control: the same nesting without a continuation is unaffected', () => {
        assert.deepStrictEqual(unterminated(UNBROKEN), []);
        const ifs = structures(UNBROKEN, 'IF');
        assert.strictEqual(ifs[1].finishesAt, 5);
        assert.strictEqual(ifs[0].finishesAt, 6);
    });

    // A continued statement with no period at all must still leave the structure open for the
    // END to close — the fix must not start inventing terminators.
    const CONTINUED_NO_PERIOD = [
        'SomeClass.Invoke PROCEDURE(LONG p1, LONG p2)',
        'hr    LONG',
        '  CODE',
        '    IF Helper.Init(p1)',
        '      hr = SELF.Run(p1, p2, |',
        '        p2, hr)',
        '    END',
        '    RETURN hr',
        ''
    ].join('\n');

    test('a continued statement with no period leaves the IF for the END', () => {
        assert.deepStrictEqual(unterminated(CONTINUED_NO_PERIOD), []);
        assert.strictEqual(structures(CONTINUED_NO_PERIOD, 'IF')[0].finishesAt, 6);
    });
});
