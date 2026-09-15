/**
 * #534 — the editor's "word at the cursor" must be the whole colon-joined Clarion
 * label, not one segment.
 *
 * From Mark: Ctrl+hover over `DO CopyAssembly:CopyNow:CopyWalls:One:Adj` underlined
 * only `CopyNow`. The language configuration declared no `wordPattern`, so VS Code's
 * default applied, which treats `:` as a separator. The definition link's origin
 * range, double-click and Ctrl+D all take the word from this pattern.
 *
 * This asserts the pattern itself (the JSON is data; there is no editor here) by
 * doing what VS Code does: scan the line with the pattern and pick the match that
 * contains the cursor.
 */
import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

function repoRoot(): string {
    let dir = __dirname;
    for (let i = 0; i < 8; i++) {
        if (fs.existsSync(path.join(dir, 'syntaxes', 'clarion.configuration.json'))) return dir;
        dir = path.dirname(dir);
    }
    throw new Error('could not locate the repo root from ' + __dirname);
}

suite('Language word pattern joins colon-prefixed labels (#534)', () => {
    const config = JSON.parse(fs.readFileSync(path.join(repoRoot(), 'syntaxes', 'clarion.configuration.json'), 'utf8')) as { wordPattern?: string };

    const wordAt = (line: string, column: number): string | null => {
        assert.ok(config.wordPattern, 'clarion.configuration.json declares a wordPattern');
        const re = new RegExp(config.wordPattern!, 'g');
        let m: RegExpExecArray | null;
        while ((m = re.exec(line)) !== null) {
            if (m[0].length === 0) { re.lastIndex++; continue; }
            if (column >= m.index && column <= m.index + m[0].length) return m[0];
        }
        return null;
    };

    test('a colon-joined routine label is one word wherever the cursor sits in it', () => {
        const line = '  IF CA_Data.Q.CopyWhat.ADJ THEN DO CopyAssembly:CopyNow:CopyWalls:One:Adj END';
        const col = line.indexOf('CopyNow') + 2;
        assert.strictEqual(wordAt(line, col), 'CopyAssembly:CopyNow:CopyWalls:One:Adj');
        assert.strictEqual(wordAt(line, line.indexOf('Adj END') + 1), 'CopyAssembly:CopyNow:CopyWalls:One:Adj');
    });

    test('a prefixed variable is one word', () => {
        assert.strictEqual(wordAt("  GVF:Owner = 'x'", 6), 'GVF:Owner');
        assert.strictEqual(wordAt('  CUS:Name = CUS:Name', 16), 'CUS:Name');
    });

    test('a double-colon routine label is one word', () => {
        assert.strictEqual(wordAt('  DO Menu::MENUBAR1', 8), 'Menu::MENUBAR1');
    });

    test('dot notation stays per segment', () => {
        const line = '  Obj.Method()';
        assert.strictEqual(wordAt(line, 3), 'Obj');
        assert.strictEqual(wordAt(line, 8), 'Method');
        assert.strictEqual(wordAt('  CA_Data.Q.CopyWhat.ADJ', 14), 'CopyWhat');
    });

    test('a trailing or leading colon is not glued on', () => {
        assert.strictEqual(wordAt('  CASE x:', 7), 'x');
        assert.strictEqual(wordAt('  :Foo', 4), 'Foo');
    });

    test('numbers and plain identifiers behave as VS Code does', () => {
        assert.strictEqual(wordAt('  x = 123.45', 8), '123.45');
        assert.strictEqual(wordAt('  Total_Amount += 1', 6), 'Total_Amount');
    });
});
