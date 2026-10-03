import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

/**
 * #669 — the #587 prompt ("… set both in this workspace file and in …\.vscode\settings.json …
 * Remove from folder settings / Keep as is") is the only place a user decides which copy of a
 * disagreeing setting is right, and it was a non-modal toast: #659's reporter saw it hide itself
 * before he answered and found it under the bell. It appears only when the two files disagree, so
 * it is now a modal dialog that cannot slip away. (The detection and the removal are pinned by
 * FolderSettingsShadow587.)
 */
suite('The folder-settings conflict prompt cannot be missed (#669)', () => {
    const src = fs.readFileSync(
        path.resolve(__dirname, '..', '..', '..', '..', 'client', 'src', 'solution', 'SolutionInitializer.ts'), 'utf8');
    const start = src.indexOf('async function offerToRemoveShadowedFolderSettings');
    const body = src.slice(start, src.indexOf('\n}\n', start));

    test('bug-pin: the prompt is modal', () => {
        assert.ok(start >= 0, 'offerToRemoveShadowedFolderSettings exists');
        assert.match(body, /showWarningMessage\([\s\S]*modal:\s*true/, 'shown with { modal: true }');
    });

    test('it still offers both choices', () => {
        assert.match(body, /'Remove from folder settings'/);
        assert.match(body, /'Keep as is'/);
    });
});
