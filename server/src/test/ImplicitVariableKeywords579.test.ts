import * as assert from 'assert';
import { ClarionTokenizer, Token } from '../ClarionTokenizer';
import { TokenType } from '../tokenizer/TokenTypes';

/**
 * #579 — `END# = RECORDS(Q)` (generated AccessFrequencyAnalysis_CRS.clw) tokenized as an END
 * statement: the keyword pattern matched at the word boundary before the implicit-variable
 * pattern was tried, so the enclosing LOOP closed early and the real ENDs were left unmatched.
 *
 * Compiled on Clarion 10.0.12567 (one project per name, the variable assigned and read inside a
 * LOOP ... END): EVERY reserved word and structure keyword followed by #, $ or " builds as an
 * implicit variable — END#, IF#, LOOP#, CASE#, RETURN#, SELF#, END$, END" among them — although the
 * help says reserved words "may not be used as labels for any purpose". Controls: `END = 1`
 * (Expected: <LINEBREAK> ;), `IF = 1` (Expected: <operand>) and an undeclared name all fail.
 */
const KEYWORDS = ['ACCEPT', 'AND', 'ASSERT', 'BEGIN', 'BREAK', 'BY', 'CASE', 'CATCH', 'CHOOSE', 'CODE', 'COMPILE', 'CONST',
    'CYCLE', 'DATA', 'DO', 'ELSE', 'ELSIF', 'END', 'EXECUTE', 'EXIT', 'FINALLY', 'FUNCTION', 'GOTO', 'IF', 'INCLUDE', 'LOOP',
    'MEMBER', 'NEW', 'NOT', 'NULL', 'OF', 'OMIT', 'OR', 'OROF', 'PRAGMA', 'PROCEDURE', 'PROGRAM', 'RETURN', 'ROUTINE', 'SECTION',
    'THEN', 'THROW', 'TIMES', 'TO', 'TRY', 'UNTIL', 'WHILE', 'XOR',
    'APPLICATION', 'CLASS', 'DETAIL', 'FILE', 'FOOTER', 'FORM', 'GROUP', 'HEADER', 'ITEM', 'ITEMIZE', 'JOIN', 'MAP',
    'MENU', 'MENUBAR', 'MODULE', 'OLE', 'OPTION', 'QUEUE', 'PARENT', 'RECORD', 'REPORT', 'SELF', 'SHEET', 'TAB', 'TOOLBAR', 'VIEW', 'WINDOW'];

const tokenize = (lines: string[]): Token[] => new ClarionTokenizer(lines.join('\r\n')).tokenize();
const onLine = (tokens: Token[], line: number) => tokens.filter(t => t.line === line).map(t => `${t.value}:${TokenType[t.type]}`);

suite('A keyword followed by an implicit-variable suffix is a variable (#579)', () => {
    test('every compiler-accepted keyword with #, $ or " is one implicit variable, where it is assigned and where it is read', () => {
        const misread: string[] = [];
        for (const word of KEYWORDS) {
            for (const suffix of ['#', '$', '"']) {
                const name = word + suffix;
                const tokens = tokenize(['P PROCEDURE', 'Total LONG', '  CODE', '  LOOP 3 TIMES', `    ${name} = 1`, `    Total = Total + ${name}`, '  END', '  RETURN']);
                const assigned = onLine(tokens, 4)[0];
                const read = onLine(tokens, 5);
                if (assigned !== `${name}:ImplicitVariable` || !read.includes(`${name}:ImplicitVariable`)) {
                    misread.push(`${name} -> [${onLine(tokens, 4).join(' ')}] / [${read.join(' ')}]`);
                }
            }
        }
        assert.deepStrictEqual(misread, []);
    });

    test('an implicit variable named like a keyword leaves the enclosing structures intact', () => {
        const tokens = tokenize([
            'P PROCEDURE',              // 0
            '  CODE',                   // 1
            '  LOOP T# = 1 TO 5',       // 2
            '    END# = RECORDS(Q)',    // 3
            '    IF x',                 // 4
            '      END# -= 1',          // 5
            '      IF# = LOOP# + CASE#',// 6
            '    END',                  // 7
            '  END',                    // 8
            '  RETURN',                 // 9
        ]);
        const opener = (line: number, word: string) => tokens.find(t => t.line === line && t.value.toUpperCase() === word);
        assert.strictEqual(opener(2, 'LOOP')?.finishesAt, 8, 'LOOP closes at its own END');
        assert.strictEqual(opener(4, 'IF')?.finishesAt, 7, 'IF closes at its own END');
        const ends = tokens.filter(t => t.type === TokenType.EndStatement);
        assert.deepStrictEqual(ends.map(t => t.line), [7, 8], 'only the two real ENDs are END statements');
        assert.ok(ends.every(t => t.parent), 'both real ENDs are matched');
        assert.deepStrictEqual(onLine(tokens, 2).slice(0, 4), ['LOOP:Structure', 'T#:ImplicitVariable', '=:Operator', '1:Number']);
    });

    test('guard: the keywords themselves, ordinary implicit variables and #-bearing text are unchanged', () => {
        const tokens = tokenize([
            'P PROCEDURE',                                   // 0
            'Pic LONG,DEFAULT(@K###K)',                      // 1
            '  CODE',                                        // 2
            '  IF Counter# > 1',                             // 3
            "    Msg\" = 'IF# END# LOOP#'   ! END# IF# LOOP#",// 4
            '    Amount$ = FORMAT(Amount$,@P###P)',          // 5
            '  END',                                         // 6
            '  RETURN',                                      // 7
        ]);
        assert.deepStrictEqual(onLine(tokens, 3).slice(0, 2), ['IF:Structure', 'Counter#:ImplicitVariable']);
        const line4 = tokens.filter(t => t.line === 4);
        assert.strictEqual(`${line4[0].value}:${TokenType[line4[0].type]}`, 'Msg":ImplicitVariable');
        assert.ok(line4.some(t => t.type === TokenType.String && t.value.includes('IF# END# LOOP#')), 'the string stays a string');
        assert.ok(line4.some(t => t.type === TokenType.Comment), 'the comment stays a comment');
        assert.ok(!line4.some(t => t.type === TokenType.ImplicitVariable && t.value !== 'Msg"'), 'nothing inside the string or comment becomes a variable');
        for (const line of [1, 5]) {
            assert.ok(tokens.some(t => t.line === line && t.type === TokenType.PictureFormat), `line ${line}: the picture is still a picture`);
            assert.ok(!tokens.some(t => t.line === line && t.type === TokenType.ImplicitVariable && /^[KP]/.test(t.value)), `line ${line}: no picture letter becomes a variable`);
        }
        assert.deepStrictEqual(tokens.filter(t => t.line === 5 && t.type === TokenType.ImplicitVariable).map(t => t.value), ['Amount$', 'Amount$']);
        assert.strictEqual(tokens.find(t => t.line === 3 && t.value.toUpperCase() === 'IF')?.finishesAt, 6);
        assert.strictEqual(tokens.filter(t => t.type === TokenType.EndStatement).length, 1);
    });
});
