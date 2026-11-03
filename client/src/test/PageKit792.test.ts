import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { minimalEdit, pageHtml } from '../webview/PageKit';

/**
 * #792 — the pages (Project Properties, Solution, New Solution review) share one shell: VS Code's
 * theme colours, a nonce'd script and nothing loaded from outside, and edits to a document that
 * replace only the span that changed.
 */
suite('Property pages: the shared page kit (#792)', () => {
    test('a page runs only its own script, and loads nothing from outside', () => {
        const html = pageHtml({ cspSource: 'vscode-resource:', title: 'A <page>', body: '<main id="x"></main>', script: 'run();' });
        const nonce = /script-src 'nonce-([A-Za-z0-9]+)'/.exec(html)?.[1];
        assert.ok(nonce && nonce.length >= 32, 'a nonce');
        assert.ok(html.includes(`<script nonce="${nonce}">`), 'the script carries it');
        assert.ok(html.includes("default-src 'none'"));
        assert.ok(!/https?:\/\//.test(html.replace(/xmlns="[^"]*"/g, '')), 'no remote URL');
        assert.ok(html.includes('<title>A &lt;page&gt;</title>'), 'the title is escaped');
        assert.ok(html.includes('run();') && html.includes('<main id="x"></main>'));
        assert.notStrictEqual(nonce, /nonce-([A-Za-z0-9]+)/.exec(pageHtml({ cspSource: 'x', title: 't', body: '', script: '' }))?.[1], 'a fresh nonce per page');
    });

    test('an edit replaces only the span that changed', () => {
        assert.deepStrictEqual(minimalEdit('<a>1</a>\r\n<b>2</b>', '<a>1</a>\r\n<b>3</b>'), { start: 13, end: 14, text: '3' });
        assert.deepStrictEqual(minimalEdit('abc', 'abXc'), { start: 2, end: 2, text: 'X' });
        assert.deepStrictEqual(minimalEdit('abcabc', 'abc'), { start: 3, end: 6, text: '' });
        assert.strictEqual(minimalEdit('same', 'same'), undefined);
    });
});

suite('Property pages: every page script parses (#792)', () => {
    // A page whose script does not parse draws nothing and says nothing: the webview stays blank.
    const root = path.resolve(__dirname, '..', '..', '..', '..');
    for (const file of ['client/src/project/ProjectPropertiesEditor.ts', 'client/src/solution/SolutionPanel.ts', 'client/src/solution/NewSolutionReviewPanel.ts']) {
        test(file, () => {
            const source = fs.readFileSync(path.join(root, file), 'utf8');
            const script = /script: `([\s\S]*?)`,\s*\}\);/.exec(source)?.[1];
            assert.ok(script, 'the page script is found');
            // eslint-disable-next-line no-new-func
            assert.doesNotThrow(() => new Function('vscode', 'el', 'document', 'window', script.replace(/\$\{[^}]*\}/g, 'null')));
        });
    }
});
