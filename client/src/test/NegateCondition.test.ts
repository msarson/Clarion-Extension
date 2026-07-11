import * as assert from 'assert';
import { negateExpression, extractCondition } from '../refactor/negateCondition';

/**
 * #279 — CodeRush-style "Negate condition": flip the logical sense of an IF / ELSIF /
 * LOOP WHILE / LOOP UNTIL condition. Both halves are pure and vscode-free:
 *   - `negateExpression` negates a bare boolean expression;
 *   - `extractCondition` locates the condition span within a conditional line.
 */
suite('#279 negateExpression', () => {
    const cases: Array<[string, string]> = [
        ['x', '~x'],
        ['~x', 'x'],
        ['x = 5', 'x <> 5'],
        ['x <> 5', 'x = 5'],
        ['x ~= 5', 'x = 5'],
        ['a < b', 'a >= b'],
        ['a >= b', 'a < b'],
        ['a > b', 'a <= b'],
        ['a <= b', 'a > b'],
        ['eof(F)', '~eof(F)'],
        ['~eof(F)', 'eof(F)'],
        ['a AND b', '~(a AND b)'],
        ['~(a AND b)', 'a AND b'],
    ];
    for (const [input, expected] of cases) {
        test(`${input} -> ${expected}`, () => {
            assert.strictEqual(negateExpression(input), expected);
        });
    }

    test('is an involution (negate twice returns the original) for canonical inputs', () => {
        // `~=` is a synonym of `<>` that normalises to the canonical `=`↔`<>`, so it is
        // intentionally excluded from the round-trip set.
        for (const [input] of cases.filter(([i]) => i !== 'x ~= 5')) {
            assert.strictEqual(negateExpression(negateExpression(input)), input,
                `double-negate should round-trip: ${input}`);
        }
    });
});

suite('#279 extractCondition', () => {
    test('IF block form', () => {
        assert.deepStrictEqual(extractCondition('  IF x = 5'),
            { keyword: 'IF', condition: 'x = 5', start: 5, end: 10 });
    });

    test('IF single-line form stops before THEN', () => {
        const r = extractCondition('  IF x = 5 THEN doThing.');
        assert.ok(r);
        assert.strictEqual(r!.condition, 'x = 5');
        assert.strictEqual(r!.start, 5);
        assert.strictEqual(r!.end, 10);
    });

    test('ELSIF', () => {
        const r = extractCondition('  ELSIF done');
        assert.deepStrictEqual(r, { keyword: 'ELSIF', condition: 'done', start: 8, end: 12 });
    });

    test('LOOP WHILE / LOOP UNTIL', () => {
        const w = extractCondition('  LOOP WHILE a AND b');
        assert.strictEqual(w?.keyword, 'LOOP WHILE');
        assert.strictEqual(w?.condition, 'a AND b');
        const u = extractCondition('  LOOP UNTIL eof(F)');
        assert.strictEqual(u?.keyword, 'LOOP UNTIL');
        assert.strictEqual(u?.condition, 'eof(F)');
    });

    test('strips a trailing comment (outside quotes)', () => {
        const r = extractCondition('  IF x   ! note');
        assert.strictEqual(r?.condition, 'x');
        assert.strictEqual(r?.start, 5);
        assert.strictEqual(r?.end, 6);
    });

    test('does not treat a bare ! inside a string as a comment', () => {
        const r = extractCondition("  IF s = '!'");
        assert.strictEqual(r?.condition, "s = '!'");
    });

    test('returns null for non-conditional lines', () => {
        assert.strictEqual(extractCondition('  x = 5'), null);
        assert.strictEqual(extractCondition('  LOOP'), null);
        assert.strictEqual(extractCondition('  DO Something'), null);
    });
});
