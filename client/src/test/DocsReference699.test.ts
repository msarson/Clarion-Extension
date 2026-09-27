import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

/**
 * #699 — docs/reference/settings.md and commands.md say which manifest they were written from, and
 * the stamp is hand-edited: the 1.0.5 release shipped them still reading v1.0.4. These tests fail
 * when a stamp differs from package.json's version, or when a setting or command in package.json
 * is missing from its page, so the release dry run catches a stale reference.
 */
suite('The settings and commands references match package.json (#699)', () => {
    let root = __dirname;
    while (!fs.existsSync(path.join(root, 'docs', 'reference', 'settings.md'))) root = path.dirname(root);
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    const settingsDoc = fs.readFileSync(path.join(root, 'docs', 'reference', 'settings.md'), 'utf8');
    const commandsDoc = fs.readFileSync(path.join(root, 'docs', 'reference', 'commands.md'), 'utf8');
    const settings = Object.keys(pkg.contributes.configuration.properties as Record<string, unknown>);
    const stamp = (doc: string) => /generated from the extension manifest for \*\*v([\d.]+)\*\*/.exec(doc)?.[1];

    test('both pages carry the version in package.json', () => {
        assert.strictEqual(stamp(settingsDoc), pkg.version, 'settings.md');
        assert.strictEqual(stamp(commandsDoc), pkg.version, 'commands.md');
    });

    test('every setting is in settings.md', () => {
        // A check's .enabled / .severity pair is documented by the `<check>` pattern plus its table row.
        const missing = settings
            .filter(k => !/^clarion\.diagnostics\.\w+\.(enabled|severity)$/.test(k))
            .filter(k => !settingsDoc.includes(`\`${k}\``) && !settingsDoc.includes(`${k} \``) && !settingsDoc.includes(`/ \`${k}\``));
        assert.deepStrictEqual(missing, []);
    });

    test('every diagnostic check is in the table, and the count says so', () => {
        const checks = settings
            .map(k => /^clarion\.diagnostics\.(\w+)\.enabled$/.exec(k)?.[1])
            .filter((id): id is string => !!id);
        assert.deepStrictEqual(checks.filter(id => !settingsDoc.includes(`| \`${id}\` |`)), []);
        assert.strictEqual(Number(/one of the (\d+) ids/.exec(settingsDoc)?.[1]), checks.length);
    });

    test('every command is in commands.md', () => {
        // Pairs are written `clarion.x.filter` / `clearFilter`: the second names only the last segment.
        const missing = (pkg.contributes.commands as { command: string }[])
            .map(c => c.command)
            .filter(id => !commandsDoc.includes(`\`${id}\``) && !commandsDoc.includes(`/ \`${id.split('.').pop()}\``));
        assert.deepStrictEqual(missing, []);
    });
});
