import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { inactiveIncludeLines } from '../utils/ConditionalIncludes';

/**
 * #807 — the INCLUDE lines of a file that sit in a COMPILE/OMIT block decided not to compile,
 * with the version EQUATE read from an earlier INCLUDE on disk, as in the reported layout: a
 * one-line LibXLVer.INC picks one of several version-specific files, each included with ,ONCE.
 */
suite('#807 — inactive INCLUDE lines of a file on disk', () => {
    let dir: string;
    setup(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cond807-')); });
    teardown(() => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best-effort */ } });

    const LIBXL = [
        "  INCLUDE('LibXLVer.INC'),ONCE",          // 0
        "  COMPILE ('###', LibXL:Version = 411)",  // 1
        "     INCLUDE('LibXL.411.INT'),ONCE",      // 2
        '! ###',                                   // 3
        "  COMPILE ('###', LibXL:Version = 520)",  // 4
        "     INCLUDE('LibXL.520.INT'),ONCE",      // 5
        '! ###',                                   // 6
    ].join('\r\n');

    test('the version EQUATE comes from the INCLUDE before it: the 411 INCLUDE is not followed', () => {
        fs.writeFileSync(path.join(dir, 'LibXLVer.INC'), 'LibXL:Version  EQUATE(520)\r\n');
        const file = path.join(dir, 'LibXL.INC');
        fs.writeFileSync(file, LIBXL);
        assert.deepStrictEqual([...inactiveIncludeLines(file, LIBXL)], [2]);
    });

    test('an EQUATE two INCLUDEs deep counts too', () => {
        fs.writeFileSync(path.join(dir, 'LibXLVer.INC'), "  INCLUDE('Ver2.INC')\r\n");
        fs.writeFileSync(path.join(dir, 'Ver2.INC'), 'LibXL:Version  EQUATE(411)\r\n');
        const file = path.join(dir, 'LibXL.INC');
        assert.deepStrictEqual([...inactiveIncludeLines(file, LIBXL)], [5]);
    });

    test('a change two INCLUDEs deep is seen, though the file between did not change', () => {
        fs.writeFileSync(path.join(dir, 'LibXLVer.INC'), "  INCLUDE('Ver2.INC')\r\n");
        fs.writeFileSync(path.join(dir, 'Ver2.INC'), 'LibXL:Version  EQUATE(411)\r\n');
        const file = path.join(dir, 'LibXL.INC');
        assert.deepStrictEqual([...inactiveIncludeLines(file, LIBXL)], [5]);
        fs.writeFileSync(path.join(dir, 'Ver2.INC'), 'LibXL:Version  EQUATE(520)\r\n');
        const later = new Date(Date.now() + 5000);
        fs.utimesSync(path.join(dir, 'Ver2.INC'), later, later);
        assert.deepStrictEqual([...inactiveIncludeLines(file, LIBXL)], [2]);
    });

    test('the version file cannot be found: nothing is decided, every INCLUDE is followed', () => {
        const file = path.join(dir, 'LibXL.INC');
        assert.deepStrictEqual([...inactiveIncludeLines(file, LIBXL)], []);
    });

    test('a file that includes itself does not loop', () => {
        fs.writeFileSync(path.join(dir, 'LibXLVer.INC'), "  INCLUDE('LibXLVer.INC')\r\nLibXL:Version  EQUATE(520)\r\n");
        const file = path.join(dir, 'LibXL.INC');
        assert.deepStrictEqual([...inactiveIncludeLines(file, LIBXL)], [2]);
    });

    test('a file with no OMIT or COMPILE costs nothing and has no inactive lines', () => {
        assert.deepStrictEqual([...inactiveIncludeLines(path.join(dir, 'x.clw'), "  INCLUDE('a.inc')\r\n  INCLUDE('b.inc')")], []);
    });
});
