import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

/**
 * #667 — the contributed `$clarionBuildMatcher` never matched: its `pattern` was an array of
 * three regexes, which VS Code reads as ONE multi-line pattern (consecutive lines matching in
 * turn), and the three shapes never appear in that order. It is now one pattern for the line the
 * Clarion compiler prints through MSBuild. The built-in Build task no longer names it, because it
 * reports the same errors from the build log itself (processBuildErrors).
 *
 * The lines below are from a fixture compiled through MSBuild with the extension's arguments
 * (paths shortened).
 */
const root = (() => {
    let dir = __dirname;
    while (dir !== path.dirname(dir)) {
        if (fs.existsSync(path.join(dir, 'package.json')) && fs.existsSync(path.join(dir, 'client'))) return dir;
        dir = path.dirname(dir);
    }
    throw new Error('project root not found');
})();

interface Pattern { regexp: string; file: number; line: number; column: number; severity: number; message: number }
const matcher = (() => {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    return (pkg.contributes.problemMatchers as Array<{ name: string; pattern: Pattern | Pattern[]; fileLocation: unknown }>)
        .find(m => m.name === 'clarionBuildMatcher')!;
})();

/** One pattern, applied to one line, the way VS Code applies a single-line matcher. */
function match(line: string) {
    const p = Array.isArray(matcher.pattern) ? matcher.pattern[0] : matcher.pattern;
    const m = new RegExp(p.regexp).exec(line);
    if (!m) return null;
    return { file: m[p.file], line: m[p.line], column: m[p.column], severity: m[p.severity], message: m[p.message] };
}

suite('The contributed Clarion build problem matcher (#667)', () => {
    test('bug-pin: it is a single-line pattern, not a three-line one', () => {
        assert.ok(!Array.isArray(matcher.pattern) || matcher.pattern.length === 1,
            'a pattern array is one multi-line pattern in VS Code');
    });

    test('a compiler error line gives file, line, column, severity and message', () => {
        const r = match('C:\\app\\viewjoin.clw(57,3): error : Unknown procedure label [C:\\app\\ViewJoinTest.cwproj]');
        assert.deepStrictEqual(r, { file: 'C:\\app\\viewjoin.clw', line: '57', column: '3', severity: 'error', message: 'Unknown procedure label' });
    });

    test('the message keeps its own text up to the project suffix', () => {
        const r = match('C:\\app\\viewjoin.clw(58,3): error : Unknown identifier: NOSUCHVAR [C:\\app\\ViewJoinTest.cwproj]');
        assert.strictEqual(r?.message, 'Unknown identifier: NOSUCHVAR');
    });

    test('the indented copy in the build summary and a node prefix still match', () => {
        assert.strictEqual(match('  C:\\app\\viewjoin.clw(57,3): error : Unknown procedure label [C:\\app\\ViewJoinTest.cwproj]')?.line, '57');
        assert.strictEqual(match('3>C:\\app\\viewjoin.clw(57,3): error : Unknown procedure label [C:\\app\\ViewJoinTest.cwproj]')?.file, 'C:\\app\\viewjoin.clw');
    });

    test('bug-pin: errors and warnings in include files match too', () => {
        assert.strictEqual(match('C:\\app\\equates.INC(12,5): warning : Something odd [C:\\app\\App.cwproj]')?.severity, 'warning');
        assert.strictEqual(match('C:\\app\\globals.equ(3,1): error : Syntax error [C:\\app\\App.cwproj]')?.file, 'C:\\app\\globals.equ');
    });

    // #673 — MSBuild wraps console output at the terminal width, so the [project] suffix can break
    // across lines (#659's real output); and .eq equate files were not matched.
    test('bug-pin (#673): a [project] suffix cut by MSBuild\'s line wrap is dropped from the message', () => {
        const r = match('C:\\app\\src\\CommonErrors.equ(6,39): error : Expected: <operand> <PICTURE> ( ) , + - CHOOSE NOT  [C:\\app\\App.cwpro');
        assert.strictEqual(r?.message, 'Expected: <operand> <PICTURE> ( ) , + - CHOOSE NOT');
        assert.strictEqual(r?.line, '6');
    });

    test('bug-pin (#673): an error in an .eq file matches', () => {
        const r = match('C:\\app\\Globals.eq(2,15): error : Expected: <operand> [C:\\app\\App.cwproj]');
        assert.strictEqual(r?.file, 'C:\\app\\Globals.eq');
        assert.strictEqual(r?.message, 'Expected: <operand>');
    });

    test('a line without the project suffix still matches', () => {
        assert.strictEqual(match('C:\\app\\viewjoin.clw(57,3): error : Unknown procedure label')?.message, 'Unknown procedure label');
    });

    test('ordinary build output does not match', () => {
        for (const line of ['Build succeeded.', '    2 Error(s)', 'MSBUILD : error MSB1008: Only one project can be specified.', 'Done Building Project "C:\\app\\ViewJoinTest.cwproj".']) {
            assert.strictEqual(match(line), null, line);
        }
    });

    test('the pattern avoids inline regex modifiers', () => {
        const p = Array.isArray(matcher.pattern) ? matcher.pattern[0] : matcher.pattern;
        assert.ok(!/\(\?[a-z]+:/.test(p.regexp), 'no (?i:...) — not needed and not in every regex engine VS Code has shipped');
    });

    test('the built-in Build task does not attach it (processBuildErrors reports the same errors)', () => {
        const src = fs.readFileSync(path.join(root, 'client', 'src', 'buildTasks.ts'), 'utf8');
        assert.ok(!src.includes('"clarionBuildMatcher"'), 'createBuildTask names no problem matcher');
    });
});
