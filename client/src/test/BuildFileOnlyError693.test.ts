import * as assert from 'assert';
import * as path from 'path';
import { parseBuildOutput } from '../utils/BuildErrorPatterns';

/**
 * #693 — a compile error that names a source file but no (line,col), such as the compiler failing to
 * open a MEMBER program, fell through to the generic fallback: three Problems filed against
 * `BuildOutput.log` resolved from the extension host's working directory (the VS Code install
 * folder), the first still carrying MSBuild's escaped `\r`, the other two nothing but `\r` and the
 * project tail. The lines below are MSBuild's, from a real compile (paths shortened).
 */
const LOG = [
    '  Making Test687Member.obj : file does not exist',
    'f:\\app\\Test687Member.clw : error : Error(3): cif$fileopen NoSuchProg_687.CLW The system cannot find the path specified.\\r [f:\\app\\App.cwproj]',
    'f:\\app\\Test687Member.clw : error : \\r [f:\\app\\App.cwproj]',
    'f:\\app\\Test687Member.clw : error :  [f:\\app\\App.cwproj]',
    '  made Test687Member.obj',
    'Done executing task "CW" -- FAILED.',
].join('\r\n');

suite('A build error that names a file but no line (#693)', () => {
    test('bug-pin: one error, on the named file at line 1, without the escaped \\r', () => {
        const problems = parseBuildOutput(LOG);
        assert.deepStrictEqual(problems.map(p => ({ ...p, file: p.file && p.file.toLowerCase() })), [{
            file: path.resolve('f:\\app\\Test687Member.clw').toLowerCase(),
            line: 0,
            column: 0,
            type: 'error',
            message: 'Error(3): cif$fileopen NoSuchProg_687.CLW The system cannot find the path specified.',
        }]);
    });

    test('the MSBuild summary repeats the lines indented: still one error', () => {
        const summary = LOG + '\r\n\r\n"f:\\app\\App.cwproj" (build target) (1) ->\r\n(CoreCompile target) -> \r\n  '
            + LOG.split('\r\n').slice(1, 4).join('\r\n');
        assert.strictEqual(parseBuildOutput(summary).length, 1);
    });

    test('a file-located error whose message ends in \\r before the project is reported once', () => {
        const problems = parseBuildOutput('C:\\app\\Main.clw(3,1): error : Bad thing.\\r [C:\\app\\App.cwproj]');
        assert.deepStrictEqual(problems.map(p => p.message), ['Bad thing.']);
    });

    test('a file-only warning is a warning; a non-source file is left to the fallback', () => {
        const [warning] = parseBuildOutput('C:\\app\\Globals.equ : warning : Odd [C:\\app\\App.cwproj]');
        assert.deepStrictEqual([warning.type, warning.file?.toLowerCase(), warning.message], ['warning', path.resolve('C:\\app\\Globals.equ').toLowerCase(), 'Odd']);
        assert.strictEqual(parseBuildOutput('C:\\app\\notes.txt : error : nope')[0].file, null);
    });

    test('a generic MSBuild error with no file still reaches Problems', () => {
        const [problem] = parseBuildOutput('MSBUILD : error MSB1009: Project file does not exist.');
        assert.deepStrictEqual([problem.file, problem.message], [null, 'MSB1009: Project file does not exist.']);
    });
});
