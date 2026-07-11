import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { DirectoryFileIndex } from '../solution/DirectoryFileIndex';

/**
 * #288 — batch existence index for solution loading. One readdir per unique directory replaces a
 * stat per candidate file; lookups are case-insensitive (Windows/Clarion semantics). Must return
 * exactly what fs.existsSync would for (dir, file) pairs, cheaper.
 */
suite('#288 DirectoryFileIndex', () => {
    let tmpDir: string;

    setup(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'clarion-dfi-'));
        fs.writeFileSync(path.join(tmpDir, 'Main.clw'), 'x');
        fs.writeFileSync(path.join(tmpDir, 'Utils.inc'), 'x');
        DirectoryFileIndex.getInstance().clear();
    });

    teardown(() => {
        DirectoryFileIndex.getInstance().clear();
        try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
    });

    test('finds existing files, case-insensitively', () => {
        const idx = DirectoryFileIndex.getInstance();
        assert.strictEqual(idx.exists(tmpDir, 'Main.clw'), true);
        assert.strictEqual(idx.exists(tmpDir, 'MAIN.CLW'), true);
        assert.strictEqual(idx.exists(tmpDir, 'utils.INC'), true);
        assert.strictEqual(idx.exists(tmpDir, 'Missing.clw'), false);
    });

    test('reads each directory once regardless of lookup count', () => {
        const idx = DirectoryFileIndex.getInstance();
        for (let i = 0; i < 50; i++) idx.exists(tmpDir, `file${i}.clw`);
        const s = idx.stats();
        assert.strictEqual(s.dirsRead, 1, 'one readdir for 50 lookups');
        assert.strictEqual(s.lookups, 50);
    });

    test('a missing directory is cached as empty (no repeated failed I/O), and existsPath splits correctly', () => {
        const idx = DirectoryFileIndex.getInstance();
        const missing = path.join(tmpDir, 'no-such-dir');
        assert.strictEqual(idx.exists(missing, 'a.clw'), false);
        assert.strictEqual(idx.exists(missing, 'b.clw'), false);
        assert.strictEqual(idx.stats().dirsRead, 0, 'failed readdir not counted as a read');
        assert.strictEqual(idx.existsPath(path.join(tmpDir, 'Main.clw')), true);
        assert.strictEqual(idx.existsPath(path.join(tmpDir, 'Nope.clw')), false);
    });

    test('clear() drops listings so a reload sees fresh disk state', () => {
        const idx = DirectoryFileIndex.getInstance();
        assert.strictEqual(idx.exists(tmpDir, 'New.clw'), false);
        fs.writeFileSync(path.join(tmpDir, 'New.clw'), 'x');
        assert.strictEqual(idx.exists(tmpDir, 'New.clw'), false, 'stale until cleared (by design)');
        idx.clear();
        assert.strictEqual(idx.exists(tmpDir, 'New.clw'), true, 'fresh after clear');
    });
});
