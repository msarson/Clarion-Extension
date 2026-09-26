import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { toolbarIcons } from '../views/ToolbarIcons';

/**
 * #682 — the Actions toolbar in the Clarion Tools pane broke when the side bar was narrow: the
 * combined buttons stacked their two glyphs, the buttons that did not fit were cut off (the gear
 * vanished), and the emoji icons looked different in every font. Buttons now keep their size, the
 * toolbar wraps, and the icons are inline SVGs.
 */
const root = (() => {
    let dir = __dirname;
    while (dir !== path.dirname(dir)) {
        if (fs.existsSync(path.join(dir, 'package.json')) && fs.existsSync(path.join(dir, 'client'))) return dir;
        dir = path.dirname(dir);
    }
    throw new Error('project root not found');
})();
const source = fs.readFileSync(path.join(root, 'client', 'src', 'views', 'SolutionToolbarProvider.ts'), 'utf8');
const css = (selector: string) => {
    const m = new RegExp(`\\n\\s*${selector.replace('.', '\\.')}\\s*\\{([^}]*)\\}`).exec(source);
    assert.ok(m, `a ${selector} rule`);
    return m![1];
};
const toolbar = source.slice(source.indexOf('<div class="toolbar">'), source.indexOf('<div class="hsep">'));

suite('Actions toolbar layout (#682)', () => {
    test('bug-pin: the toolbar wraps instead of cutting buttons off', () => {
        assert.match(css('.toolbar'), /flex-wrap:\s*wrap/);
    });

    test('bug-pin: a button keeps its size and never wraps its content', () => {
        const button = css('button');
        assert.match(button, /flex:\s*none/);
        assert.match(button, /white-space:\s*nowrap/);
    });

    test('bug-pin: the buttons draw icons, not emoji text', () => {
        assert.doesNotMatch(toolbar, /[\u{1F528}\u{1F41B}▶⚙]|&#xFE0E;/u, 'no hammer, bug, play or gear glyphs');
        const buttons = toolbar.match(/<button[\s\S]*?<\/button>/g) ?? [];
        assert.strictEqual(buttons.length, 7);
        for (const b of buttons) {
            assert.match(b, /<img|\$\{toolbarIcons\.\w+\}/, `an icon in ${b.slice(0, 60)}`);
        }
        for (const [name, icon] of Object.entries(toolbarIcons)) {
            assert.match(icon, /^<svg [^>]*viewBox="0 0 16 16"[\s\S]*<\/svg>$/, name);
        }
    });

    test('every button keeps its tooltip and command', () => {
        for (const cmd of ['openInClarionIDE', 'build', 'run', 'buildAndRun', 'startDebugging', 'buildAndDebug', 'setActiveVersion']) {
            assert.match(toolbar, new RegExp(`title="[^"]+" data-cmd="${cmd}"`), cmd);
        }
    });
});
