import * as assert from 'assert';
import { ClarionTokenizer, Token } from '../ClarionTokenizer';
import { TokenType } from '../tokenizer/TokenTypes';

/**
 * #578 — an END that closes a multi-line structure, sharing its line with a one-line structure
 * that starts AFTER it (`END ; IF c THEN d = 1.`), was taken as that one-line structure's
 * terminator: the END handler treated any END on a line holding a structure keyword as inline.
 * The multi-line IF never closed — in Clarion 10's libsrc CBWndPreview.clw (line 3178) it stayed
 * open ~1,900 lines, into another method. The keyword side already finds its own terminator
 * (#536: the first END/period at depth 0 after the keyword on its logical line); the END side
 * now asks whether it IS that terminator instead of whether a structure shares its line.
 */
const tokenize = (lines: string[]): Token[] => new ClarionTokenizer(lines.join('\r\n')).tokenize();
const at = (tokens: Token[], line: number, word: string, nth = 0) =>
    tokens.filter(t => t.line === line && t.value.toUpperCase() === word)[nth];
const ends = (tokens: Token[]) => tokens.filter(t => t.type === TokenType.EndStatement);

suite('An END before a one-line structure on the same line closes the open structure (#578)', () => {
    test('the issue: END ; IF c THEN d = 1. closes the multi-line IF above', () => {
        const tokens = tokenize([
            'P PROCEDURE',              // 0
            '  CODE',                   // 1
            '  IF a THEN',              // 2
            '    b = 1',                // 3
            '  END ; IF c THEN d = 1.', // 4
            '  LOOP',                   // 5
            '  END',                    // 6
            '  RETURN',                 // 7
        ]);
        assert.strictEqual(at(tokens, 2, 'IF').finishesAt, 4, 'the multi-line IF closes at the END on line 5');
        assert.strictEqual(at(tokens, 4, 'END').parent, at(tokens, 2, 'IF'), 'that END is linked to it');
        assert.strictEqual(at(tokens, 4, 'IF').finishesAt, 4, 'the one-line IF closes on its own line');
        assert.notStrictEqual(at(tokens, 5, 'LOOP').parent, at(tokens, 2, 'IF'), 'the LOOP is not nested in the IF');
        assert.strictEqual(at(tokens, 5, 'LOOP').finishesAt, 6);
    });

    test('the CBWndPreview.clw shape', () => {
        const tokens = tokenize([
            'P PROCEDURE',                                                            // 0
            '  CODE',                                                                 // 1
            '    IF Poz:DropCnt<>Haz:DropCnt OR Poz:DropWd<>Haz:DropWd THEN ',        // 2
            '       X=1 ; PWnd$FEQ{PROP:Drop}=Poz:DropCnt',                          // 3
            '    END ; IF X=1 AND IsDROP THEN ListDrop(FEQ) ; Dropped=1.',            // 4
            '    IF Haz:DeftHt + Haz:FullHt THEN Haz:Ht=0.',                          // 5
            '  RETURN',                                                               // 6
        ]);
        assert.strictEqual(at(tokens, 2, 'IF').finishesAt, 4);
        assert.ok(tokens.filter(t => t.type === TokenType.Structure).every(t => t.finishesAt !== undefined), 'no structure left open');
    });

    test('an END after a one-line structure that is already closed closes the outer structure', () => {
        const tokens = tokenize([
            'P PROCEDURE',              // 0
            '  CODE',                   // 1
            '  LOOP',                   // 2
            '    IF a THEN b = 1. END', // 3
            '  RETURN',                 // 4
        ]);
        assert.strictEqual(at(tokens, 3, 'IF').finishesAt, 3, 'the IF closes at its period');
        assert.strictEqual(at(tokens, 2, 'LOOP').finishesAt, 3, 'the END closes the LOOP');
        assert.strictEqual(at(tokens, 3, 'END').parent, at(tokens, 2, 'LOOP'));
    });

    test('guard: one-line forms that already worked are unchanged', () => {
        const tokens = tokenize([
            'P PROCEDURE',                                                     // 0
            'fq    QUEUE(FILE:Queue) END',                                     // 1
            '  CODE',                                                          // 2
            '  CASE k',                                                        // 3
            '  OF DeleteKey ; IF ~RECORDS(xQ) THEN RETURN END ; y = 1',        // 4 (#536)
            '  END',                                                           // 5
            '  IF x THEN y = 1 END',                                           // 6
            '  IF x THEN LOOP ; BREAK ; END ; y = 1',                          // 7 — that END closes the LOOP
            '  END',                                                           // 8 — this one the IF
            '  IF x THEN |',                                                   // 9
            '    y = 1.',                                                      // 10
            '  RETURN',                                                        // 11
        ]);
        assert.strictEqual(at(tokens, 1, 'QUEUE').finishesAt, 1);
        assert.strictEqual(at(tokens, 4, 'IF').finishesAt, 4);
        assert.strictEqual(at(tokens, 3, 'CASE').finishesAt, 5, '#536: the CASE closes at its own END');
        assert.strictEqual(at(tokens, 6, 'IF').finishesAt, 6);
        assert.strictEqual(at(tokens, 7, 'LOOP').finishesAt, 7);
        assert.strictEqual(at(tokens, 7, 'IF').finishesAt, 8);
        assert.strictEqual(at(tokens, 9, 'IF').finishesAt, 10);
        assert.deepStrictEqual(ends(tokens).filter(t => t.parent).map(t => t.line), [5, 8], 'only the multi-line closers are linked');
    });
});
