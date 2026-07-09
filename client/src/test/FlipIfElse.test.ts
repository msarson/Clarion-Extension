import * as assert from 'assert';
import { flipIfElse } from '../refactor/flipIfElse';

/**
 * #278 — CodeRush-style "Flip IF/ELSE" (Reverse Conditional): on a block-form IF…ELSE…END, negate
 * the condition and swap the two branches. Pure and vscode-free — operates on the document's lines
 * plus the cursor line (which must sit on the IF). Returns null for shapes that are not a clean
 * two-branch flip (no ELSE, an ELSIF, single-line IF, unterminated block).
 */
suite('#278 flipIfElse', () => {
    test('negates the condition and swaps the branches, preserving indentation', () => {
        const lines = [
            '  IF x = 5',
            '    A',
            '  ELSE',
            '    B',
            '  END',
        ];
        const r = flipIfElse(lines, 0);
        assert.ok(r);
        assert.strictEqual(r!.startLine, 0);
        assert.strictEqual(r!.endLine, 4);
        assert.deepStrictEqual(r!.newLines, [
            '  IF x <> 5',
            '    B',
            '  ELSE',
            '    A',
            '  END',
        ]);
    });

    test('wraps a compound condition in ~(…)', () => {
        const lines = ['IF a AND b', '  A', 'ELSE', '  B', 'END'];
        const r = flipIfElse(lines, 0);
        assert.strictEqual(r!.newLines[0], 'IF ~(a AND b)');
    });

    test('negates a bare atom with ~', () => {
        const lines = ['IF eof(F)', '  A', 'ELSE', '  B', 'END'];
        const r = flipIfElse(lines, 0);
        assert.strictEqual(r!.newLines[0], 'IF ~eof(F)');
    });

    test('preserves a trailing THEN on the IF line', () => {
        const lines = ['IF x = 5 THEN', '  A', 'ELSE', '  B', 'END'];
        const r = flipIfElse(lines, 0);
        assert.strictEqual(r!.newLines[0], 'IF x <> 5 THEN');
    });

    test('handles multi-line branches', () => {
        const lines = [
            'IF done',
            '  A1',
            '  A2',
            'ELSE',
            '  B1',
            '  B2',
            '  B3',
            'END',
        ];
        const r = flipIfElse(lines, 0);
        assert.deepStrictEqual(r!.newLines, [
            'IF ~done',
            '  B1',
            '  B2',
            '  B3',
            'ELSE',
            '  A1',
            '  A2',
            'END',
        ]);
    });

    test('matches the correct ELSE/END across a nested IF in the THEN branch', () => {
        const lines = [
            'IF outer',        // 0
            '  IF inner',      // 1  (nested, depth 2)
            '    A',           // 2
            '  ELSE',          // 3  (nested ELSE — must be ignored)
            '    B',           // 4
            '  END',           // 5  (closes nested)
            'ELSE',            // 6  (our ELSE)
            '  C',             // 7
            'END',             // 8  (our END)
        ];
        const r = flipIfElse(lines, 0);
        assert.ok(r);
        assert.strictEqual(r!.endLine, 8);
        assert.deepStrictEqual(r!.newLines, [
            'IF ~outer',
            '  C',
            'ELSE',
            '  IF inner',
            '    A',
            '  ELSE',
            '    B',
            '  END',
            'END',
        ]);
    });

    test('steps over a nested LOOP/CASE in the branches', () => {
        const lines = [
            'IF flag',         // 0
            '  LOOP i = 1 TO 3',// 1  depth 2
            '    do#(i)',      // 2
            '  END',           // 3  back to depth 1
            'ELSE',            // 4  our ELSE
            '  CASE k',        // 5  depth 2
            '  OF 1',          // 6
            '    x',           // 7
            '  END',           // 8  back to depth 1
            'END',             // 9  our END
        ];
        const r = flipIfElse(lines, 0);
        assert.ok(r);
        assert.strictEqual(r!.endLine, 9);
        assert.strictEqual(r!.newLines[0], 'IF ~flag');
        // The (former) ELSE branch — the CASE — now leads.
        assert.strictEqual(r!.newLines[1], '  CASE k');
    });

    test('returns null when there is no ELSE (degrades to Negate-condition)', () => {
        const lines = ['IF x = 5', '  A', 'END'];
        assert.strictEqual(flipIfElse(lines, 0), null);
    });

    test('returns null when the chain has an ELSIF', () => {
        const lines = ['IF a', '  A', 'ELSIF b', '  B', 'ELSE', '  C', 'END'];
        assert.strictEqual(flipIfElse(lines, 0), null);
    });

    test('returns null for a single-line IF … THEN statement', () => {
        assert.strictEqual(flipIfElse(['IF x THEN doThing.'], 0), null);
    });

    test('does not treat a nested single-line IF as opening a block', () => {
        const lines = [
            'IF outer',            // 0
            '  IF a THEN b.',      // 1  single-line — opens no block
            'ELSE',                // 2  our ELSE (still at depth 1)
            '  C',                 // 3
            'END',                 // 4
        ];
        const r = flipIfElse(lines, 0);
        assert.ok(r);
        assert.strictEqual(r!.endLine, 4);
        assert.deepStrictEqual(r!.newLines, [
            'IF ~outer',
            '  C',
            'ELSE',
            '  IF a THEN b.',
            'END',
        ]);
    });

    test('returns null when the cursor line is not an IF', () => {
        const lines = ['LOOP WHILE x', '  A', 'ELSE', '  B', 'END'];
        assert.strictEqual(flipIfElse(lines, 0), null);
    });

    test('returns null for an unterminated block', () => {
        const lines = ['IF x', '  A', 'ELSE', '  B'];
        assert.strictEqual(flipIfElse(lines, 0), null);
    });
});
