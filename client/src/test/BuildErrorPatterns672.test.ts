import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { buildErrorPatterns } from '../utils/BuildErrorPatterns';

/**
 * #672 (from #659) — processBuildErrors turned the build log into Problems only for errors in
 * .clw / .inc / .equ / .int files; an error in an .eq equate file (the reporter's repos use them)
 * was left out. The file-located patterns now share one extension list that includes .eq.
 * The first line is from a real compile of the ViewJoinTest fixture (paths shortened).
 */
const first = (re: RegExp, text: string) => { re.lastIndex = 0; return re.exec(text); };

suite('Build-log patterns for Problems (#672)', () => {
    test('a real compiler line is read: file, line, column, severity, message, project', () => {
        const m = first(buildErrorPatterns().single, 'C:\\app\\viewjoin.clw(57,3): error : Unknown procedure label [C:\\app\\ViewJoinTest.cwproj]');
        assert.deepStrictEqual(m && [m[1], m[2], m[3], m[4], m[5], m[6]],
            ['C:\\app\\viewjoin.clw', '57', '3', 'error', 'Unknown procedure label', 'C:\\app\\ViewJoinTest.cwproj']);
    });

    test('bug-pin: an error in an .eq file is read', () => {
        const m = first(buildErrorPatterns().single, 'C:\\app\\Globals.eq(12,5): error : Syntax error [C:\\app\\App.cwproj]');
        assert.strictEqual(m?.[1], 'C:\\app\\Globals.eq');
    });

    test('bug-pin: .eq in the wrapped form and the compiler\'s native form', () => {
        const p = buildErrorPatterns();
        assert.strictEqual(first(p.wrapped, 'C:\\app\\Globals.EQ(12,\n    5): error : Syntax error [C:\\app\\App.cwproj]')?.[1], 'C:\\app\\Globals.EQ');
        assert.strictEqual(first(p.native, 'Syntax error - C:\\app\\Globals.eq:12,5')?.[2], 'C:\\app\\Globals.eq');
    });

    test('.equ, .inc and .int are still read', () => {
        const p = buildErrorPatterns();
        for (const f of ['Equates.equ', 'Header.INC', 'Iface.int']) {
            assert.ok(first(p.single, `C:\\app\\${f}(1,1): warning : Something [C:\\app\\App.cwproj]`), f);
        }
    });

    test('a non-source file is not read as a source error', () => {
        assert.strictEqual(first(buildErrorPatterns().single, 'C:\\app\\notes.txt(1,1): error : nope [C:\\app\\App.cwproj]'), null);
    });

    test('processBuildErrors uses these patterns', () => {
        let dir = __dirname;
        while (!fs.existsSync(path.join(dir, 'client', 'src', 'processBuildErrors.ts'))) dir = path.dirname(dir);
        const src = fs.readFileSync(path.join(dir, 'client', 'src', 'processBuildErrors.ts'), 'utf8');
        assert.ok(src.includes('buildErrorPatterns()'), 'processBuildErrors builds its patterns from BuildErrorPatterns');
    });
});
