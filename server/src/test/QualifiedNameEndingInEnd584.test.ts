import * as assert from 'assert';
import { ClarionTokenizer, Token } from '../ClarionTokenizer';
import { TokenType } from '../tokenizer/TokenTypes';

/**
 * #584 — `ACCESS_TOKEN:END` produced an END statement: the keyword branch skips a match preceded by
 * `:` or `.` (a qualified name such as `nts:case`), but the EndStatement pattern had no such check,
 * so the LOOP around it closed on the assignment line. Upper case already did this; #581 (lower case
 * reaching the END pattern) would have extended it to `access_token:end` in libcurldropbox.clw.
 */
const tokenize = (lines: string[]): Token[] => new ClarionTokenizer(lines.join('\r\n')).tokenize();

const program = (name: string) => [
    'P PROCEDURE',                                   // 0
    `${name}    LONG`,                               // 1
    '  CODE',                                        // 2
    '  LOOP 2 TIMES',                                // 3
    `    ${name} = INSTRING('x', S, 1, 1)`,          // 4
    `    IF ${name} > 0`,                            // 5
    `      x = SUB(S, 1, ${name})`,                  // 6
    '    END',                                       // 7
    '  END',                                         // 8
    '  RETURN',                                      // 9
];

suite('A qualified name ending in END is not an END statement (#584)', () => {
    for (const name of ['ACCESS_TOKEN:END', 'access_token:end', 'Tok:End']) {
        test(`${name}: only the two real ENDs are END statements, and the LOOP and IF close at them`, () => {
            const tokens = tokenize(program(name));
            assert.deepStrictEqual(tokens.filter(t => t.type === TokenType.EndStatement).map(t => t.line), [7, 8]);
            assert.strictEqual(tokens.find(t => t.line === 3 && /^loop$/i.test(t.value))?.finishesAt, 8, 'LOOP');
            assert.strictEqual(tokens.find(t => t.line === 5 && /^if$/i.test(t.value))?.finishesAt, 7, 'IF');
        });
    }

    test('a dotted member named End is not an END statement either', () => {
        const tokens = tokenize(['P PROCEDURE', '  CODE', '  LOOP 2 TIMES', '    x = Range.End', '    Obj.End()', '  END', '  RETURN']);
        assert.deepStrictEqual(tokens.filter(t => t.type === TokenType.EndStatement).map(t => t.line), [5]);
    });

    test('guard: a real END, in either case and after a statement separator, still is one', () => {
        const tokens = tokenize(['P PROCEDURE', '  CODE', '  LOOP 2 TIMES', '    x = 1', '  end', '  IF a THEN', '    b = 1 ; END', '  RETURN']);
        assert.deepStrictEqual(tokens.filter(t => t.type === TokenType.EndStatement && /^end$/i.test(t.value)).map(t => t.line), [4, 6]);
    });
});
