import * as assert from 'assert';
import { ClarionTokenizer, TokenType } from '../ClarionTokenizer';

/**
 * #415 — a structure keyword used as an attribute argument on a CONTINUATION
 * line (e.g. a LIST whose multi-line FORMAT(...) picture string ends with
 * `...'),FROM(QUEUE)`) was misclassified as a structure OPENER. The phantom
 * QUEUE consumed an END, leaving the enclosing WINDOW unterminated → a
 * false-positive "missing END".
 *
 * The `isInsideParamsOrTemplate` guard only counted parens on the current
 * physical line (missing the FORMAT( opened on the previous continuation line)
 * and counted parens inside string literals. On the closing line the leading
 * `)` (closing FORMAT) drove the count negative and `FROM(` returned it to 0,
 * so QUEUE read as NOT inside parentheses.
 *
 * Repro mirrors genfiles/src/AccrualJournalDetail_py1.clw (lines ~72-89).
 */
suite('#415 — structure keyword in a continuation-line attribute arg (FROM(QUEUE))', () => {

    const WINDOW_SRC = [
        '  PROGRAM',
        '  MAP',
        '  END',
        "Window WINDOW('View Detail'),AT(,,414,227),SYSTEM",
        '  SHEET,AT(2,2,410,203),USE(?SHEET1)',
        "    TAB('Tab1'),USE(?TAB1)",
        "      LIST,AT(21,36,377,145),USE(?List1),FORMAT('48R(2)|M~Date~C(0)@d2@19R(5)|M~P/R~' & |",
        "  'L(2)@n2@24R(7)|M~Bank~L(2)@n2@28R(2)|M~Check~C(0)@n_6@38R(6)|M~Employee~' & |",
        "  'L(2)|M~Name~@s35@56R(2)|M~Amount~C(0)@n-14.2@'),FROM(QUEUE)",
        '        END',   // closes TAB
        '      END',     // closes SHEET
        '    END',       // closes WINDOW
        '  CODE',
    ].join('\n');

    test('QUEUE inside FROM(QUEUE) is NOT classified as a structure opener', () => {
        const tokens = new ClarionTokenizer(WINDOW_SRC).tokenize();
        // The core of the bug: the QUEUE keyword in FROM(QUEUE) must not open a
        // structure. (It is skipped as an in-params reference; a separate,
        // pre-existing quirk mangles the skipped token — not this bug's concern.)
        const queueStructures = tokens.filter(
            t => t.type === TokenType.Structure && t.value.toUpperCase() === 'QUEUE');
        assert.strictEqual(
            queueStructures.length, 0,
            'QUEUE in FROM(QUEUE) must NOT be a Structure opener — it is an attribute ' +
            'argument. A phantom QUEUE structure is what steals the WINDOW\'s END. got: ' +
            JSON.stringify(queueStructures)
        );
    });

    test('the WINDOW is recognized as terminated (no phantom QUEUE steals its END)', () => {
        const tokens = new ClarionTokenizer(WINDOW_SRC).tokenize();
        const windowToken = tokens.find(t =>
            t.type === TokenType.Structure && t.value.toUpperCase() === 'WINDOW');
        assert.ok(windowToken, 'expected a WINDOW structure token');
        assert.notStrictEqual(
            (windowToken as any).finishesAt, undefined,
            'WINDOW must have a finishesAt (be terminated); a phantom QUEUE structure ' +
            'from FROM(QUEUE) stealing an END leaves it unterminated → false "missing END".'
        );
    });
});
