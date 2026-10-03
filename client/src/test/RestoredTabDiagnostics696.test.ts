import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

/**
 * #696 — on startup VS Code instantiates only the tab in front, and the client pulled diagnostics
 * only for instantiated documents, so a restored background tab showed its problems only once
 * clicked. The client now pulls restored tabs too (`diagnosticPullOptions.onTabs`), under a setting.
 */
suite('Problems for restored tabs (#696)', () => {
    let dir = __dirname;
    while (!fs.existsSync(path.join(dir, 'client', 'src', 'server', 'LanguageServerManager.ts'))) dir = path.dirname(dir);

    test('the setting is contributed', () => {
        const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
        const setting = pkg.contributes.configuration.properties['clarion.restoredTabDiagnostics'];
        assert.ok(setting, 'clarion.restoredTabDiagnostics');
        assert.strictEqual(setting.type, 'boolean');
    });

    test('bug-pin: the client pulls restored tabs, from that setting', () => {
        const src = fs.readFileSync(path.join(dir, 'client', 'src', 'server', 'LanguageServerManager.ts'), 'utf8');
        assert.match(src, /diagnosticPullOptions:\s*\{\s*onTabs:\s*workspace\.getConfiguration\('clarion'\)\.get<boolean>\('restoredTabDiagnostics'/);
    });

    test('the document selector matches a tab by URI alone (a pattern, no language)', () => {
        const src = fs.readFileSync(path.join(dir, 'client', 'src', 'server', 'LanguageServerManager.ts'), 'utf8');
        assert.match(src, /lookupExtensions\.map\(ext => \(\{ scheme: 'file', pattern: `\*\*\/\*\$\{ext\}` \}\)\)/);
    });
});
