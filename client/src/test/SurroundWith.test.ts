import * as assert from 'assert';
import { buildSurround } from '../refactor/surroundWith';

/**
 * #277 — CodeRush-style "Surround With / Embedding": wrap the selected line(s) in a Clarion
 * structure, indenting the content one level and dropping a placeholder on the condition.
 *
 * `buildSurround` is the pure, vscode-free core (the command layer only handles editor I/O),
 * so the wrapping + indentation + placeholder-position logic is unit-tested directly.
 */
suite('#277 buildSurround — Surround With / Embedding', () => {
    const opts = { baseIndent: '  ', indentUnit: '  ' };

    test('IF wraps content one level in with a `condition` placeholder', () => {
        const r = buildSurround(['  x = 1', '  y = 2'], 'IF', opts);
        assert.deepStrictEqual(r.lines, [
            '  IF condition',
            '    x = 1',
            '    y = 2',
            '  END',
        ]);
        // '  IF condition' → 'condition' starts at col 5, length 9
        assert.deepStrictEqual(r.placeholder, { line: 0, startChar: 5, endChar: 14 });
    });

    test('LOOP has no placeholder', () => {
        const r = buildSurround(['  doThing()'], 'LOOP', opts);
        assert.deepStrictEqual(r.lines, ['  LOOP', '    doThing()', '  END']);
        assert.strictEqual(r.placeholder, undefined);
    });

    test('LOOP WHILE / LOOP UNTIL carry a condition placeholder', () => {
        const w = buildSurround(['  a'], 'LOOP_WHILE', opts);
        assert.deepStrictEqual(w.lines, ['  LOOP WHILE condition', '    a', '  END']);
        assert.deepStrictEqual(w.placeholder, { line: 0, startChar: 13, endChar: 22 });

        const u = buildSurround(['  a'], 'LOOP_UNTIL', opts);
        assert.deepStrictEqual(u.lines, ['  LOOP UNTIL condition', '    a', '  END']);
    });

    test('CASE aligns OF with CASE and indents content one level (Clarion/ABC convention)', () => {
        const r = buildSurround(['  x = 1'], 'CASE', opts);
        assert.deepStrictEqual(r.lines, [
            '  CASE expression',
            '  OF value',
            '    x = 1',
            '  END',
        ]);
        assert.deepStrictEqual(r.placeholder, { line: 0, startChar: 7, endChar: 17 });
    });

    test('an unknown structure id throws (guards the switch)', () => {
        assert.throws(() => buildSurround(['  a'], 'BEGIN', opts), /Unknown surround structure/);
    });

    test('preserves relative indentation of nested lines and leaves blank lines empty', () => {
        const r = buildSurround(['  outer', '    inner', '', '  outer2'], 'IF', opts);
        assert.deepStrictEqual(r.lines, [
            '  IF condition',
            '    outer',
            '      inner',
            '',
            '    outer2',
            '  END',
        ]);
    });

    test('honours a tab indent unit', () => {
        const r = buildSurround(['\tx'], 'IF', { baseIndent: '\t', indentUnit: '\t' });
        assert.deepStrictEqual(r.lines, ['\tIF condition', '\t\tx', '\tEND']);
    });
});
