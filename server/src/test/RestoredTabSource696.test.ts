import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { decodeSourceBytes, isClarionSourcePath, readUnopenedSource } from '../utils/RestoredTabSource';
import { decodeSource, setSourceEncoding } from '../utils/SourceText';

/**
 * #696 — a restored tab VS Code has not instantiated is pulled by URI; the server reads the file
 * from disk. It must not read an ANSI file as UTF-8: every high-bit byte would become U+FFFD and
 * the #629 check would report a wrongly decoded file the user never opened.
 */
suite('Reading a restored tab\'s file from disk (#696)', () => {
    test('valid UTF-8 is read as UTF-8', () => {
        assert.strictEqual(decodeSourceBytes(Buffer.from("S STRING('café')", 'utf8')), "S STRING('café')");
    });

    test('ANSI bytes are read in the ANSI code page (Windows-1252 by default), with no replacement characters', () => {
        const ansi = Buffer.from([0x53, 0x20, 0x27, 0x41, 0xB3, 0x42, 0xFE, 0x27]); // generated-code field delimiters
        const text = decodeSourceBytes(ansi);
        assert.ok(!text.includes('\uFFFD'), JSON.stringify(text));
        assert.strictEqual(text, "S 'A\u00B3B\u00FE'");
    });

    test('#879: an unopened tab decodes as every other file read from disk, with files.encoding', () => {
        setSourceEncoding('windows1251');
        try {
            const bytes = Buffer.from([0x21, 0x20, 0xD1, 0xF3, 0xEC, 0xEC, 0xE0]); // "! \u0421\u0443\u043C\u043C\u0430" in Windows-1251
            assert.strictEqual(decodeSourceBytes(bytes), '! \u0421\u0443\u043C\u043C\u0430');
            assert.strictEqual(decodeSourceBytes(bytes), decodeSource(bytes));
        } finally {
            setSourceEncoding(undefined);
        }
    });

    test('only Clarion sources are read', () => {
        assert.ok(isClarionSourcePath('c:\\app\\Main.CLW'));
        assert.ok(isClarionSourcePath('c:\\app\\x.inc'));
        assert.ok(isClarionSourcePath('c:\\app\\x.equ'));
        assert.ok(!isClarionSourcePath('c:\\app\\notes.txt'));
    });

    test('readUnopenedSource returns the text and mtime, or null for a missing or foreign file', () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tab696-'));
        try {
            const file = path.join(dir, 'Main.clw');
            fs.writeFileSync(file, '  PROGRAM\r\n');
            const read = readUnopenedSource(file);
            assert.strictEqual(read?.text, '  PROGRAM\r\n');
            assert.strictEqual(typeof read?.mtimeMs, 'number');
            assert.strictEqual(readUnopenedSource(path.join(dir, 'Gone.clw')), null);
            fs.writeFileSync(path.join(dir, 'a.txt'), 'x');
            assert.strictEqual(readUnopenedSource(path.join(dir, 'a.txt')), null);
        } finally {
            fs.rmSync(dir, { recursive: true, force: true });
        }
    });
});
