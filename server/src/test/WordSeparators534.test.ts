/**
 * #534, second half — double-click and Ctrl+D select the whole colon-joined label.
 *
 * Those are cursor "word operations", and VS Code drives them from the editor's
 * `editor.wordSeparators` setting, not from the language's `wordPattern` (which
 * covers hover, the definition link's origin range, find-whole-word). The default
 * separators include ':', so `GBL:Owner` double-clicked as `GVF` or `Owner`. An
 * extension can only change that through a language-specific default, so the
 * package contributes one for `[clarion]`: VS Code's default separators minus ':'.
 */
import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

function repoRoot(): string {
    let dir = __dirname;
    for (let i = 0; i < 8; i++) {
        if (fs.existsSync(path.join(dir, 'package.json')) && fs.existsSync(path.join(dir, 'syntaxes'))) return dir;
        dir = path.dirname(dir);
    }
    throw new Error('could not locate the repo root from ' + __dirname);
}

// VS Code's default: `~!@#$%^&*()-=+[{]}\|;:'",.<>/?
const VSCODE_DEFAULT = '`~!@#$%^&*()-=+[{]}\\|;:\'",.<>/?';

suite('[clarion] editor.wordSeparators keeps the colon inside a label (#534)', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot(), 'package.json'), 'utf8')) as {
        contributes?: { configurationDefaults?: Record<string, Record<string, unknown>> };
    };
    const clarionDefaults = pkg.contributes?.configurationDefaults?.['[clarion]'];

    test('a language-specific default for editor.wordSeparators is contributed', () => {
        assert.ok(clarionDefaults, 'contributes.configurationDefaults["[clarion]"] exists');
        assert.strictEqual(typeof clarionDefaults!['editor.wordSeparators'], 'string');
    });

    test('it is VS Code\'s default minus the colon, nothing else', () => {
        const seps = clarionDefaults!['editor.wordSeparators'] as string;
        assert.ok(!seps.includes(':'), 'colon is not a separator');
        for (const ch of VSCODE_DEFAULT) {
            if (ch === ':') continue;
            assert.ok(seps.includes(ch), `separator ${JSON.stringify(ch)} kept`);
        }
        for (const ch of seps) {
            assert.ok(VSCODE_DEFAULT.includes(ch), `no separator added beyond the default: ${JSON.stringify(ch)}`);
        }
    });
});
