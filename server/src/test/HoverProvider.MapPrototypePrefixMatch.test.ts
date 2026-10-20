import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Hover } from 'vscode-languageserver-protocol';
import { HoverProvider } from '../providers/HoverProvider';
import { ClarionTokenizer } from '../ClarionTokenizer';
import { MapProcedureResolver } from '../utils/MapProcedureResolver';

/**
 * A global used from a MEMBER module was hovered as an unrelated MAP procedure whose
 * name merely STARTS WITH the hovered word: `Log.Write(...)` showed
 * "**Log** 🌍 Global Procedure / LogViewer", and a plain `Total` variable showed
 * `TotalsReport`.
 *
 * `findMapDeclaration` matched a MapProcedure token on
 * `t.value.toLowerCase().startsWith(procName.toLowerCase())`. For an indented prototype
 * (`    LogViewer`, the form generated apps emit for every procedure) the token's value
 * is the prototype NAME, so any shorter word that prefixes it matched. HoverProvider's
 * MEMBER-parent tier asks the MAP first ("before treating as variable"), so the false
 * hit outranked the real global declared a few lines further down.
 *
 * The clause adds no correct match: a MapProcedure token's `label` is always the
 * prototype name, and its value is either that same name or the PROCEDURE keyword.
 * Overloads share an exact name, so they are unaffected — the control below holds that.
 */

let tmpRoot: string;

interface Fixture { uri: string; text: string; }

function buildFixture(): Fixture {
    fs.writeFileSync(path.join(tmpRoot, 'parent.clw'), [
        '  PROGRAM',
        '',
        '  MAP',
        "    MODULE('member.clw')",
        '      Caller',
        '      LogViewer',
        '      TotalsReport(LONG pYear)',
        '      WidgetGet(LONG pId),LONG',
        '      WidgetGet(STRING pName),LONG',
        '    END',
        '  END',
        '',
        'LoggerType    CLASS,TYPE',
        'Write           PROCEDURE(STRING pMsg)',
        '              END',
        '',
        'Log           CLASS(LoggerType)',
        '              END',
        'Total         LONG',
        '',
        '  CODE',
        '  Caller()',
        ''
    ].join('\n'));

    const text = [
        "  MEMBER('parent.clw')",
        '',
        'Caller PROCEDURE',
        'n LONG',
        '  CODE',
        "  Log.Write('hello')",
        '  Total = 0',
        '  n = WidgetGet(1)',
        '  RETURN',
        ''
    ].join('\n');
    const file = path.join(tmpRoot, 'member.clw');
    fs.writeFileSync(file, text);
    return {
        uri: 'file:///' + file.replace(/\\/g, '/').replace(/^([a-zA-Z]):/, (_m, d) => d + '%3A'),
        text
    };
}

/** Hovers the first occurrence of `word` on the line that starts with `lineStart`. */
async function hoverWord(fix: Fixture, lineStart: string, word: string): Promise<string> {
    const lines = fix.text.split('\n');
    const line = lines.findIndex(l => l.trim().startsWith(lineStart));
    assert.notStrictEqual(line, -1, `fixture must contain a line starting with ${lineStart}`);
    const character = lines[line].indexOf(word) + 1;

    const doc = TextDocument.create(fix.uri, 'clarion', 1, fix.text);
    const hover = await new HoverProvider().provideHover(doc, { line, character }) as Hover | null;
    if (!hover || !hover.contents) return '';
    const c = hover.contents as { value?: string } | string;
    return typeof c === 'string' ? c : (c.value ?? '');
}

suite('MAP prototype lookup matches the whole name, not a prefix of it', () => {

    setup(() => { tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'hover-mapprefix-')); });
    teardown(() => { try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch { /* best-effort */ } });

    test('a global CLASS instance is not hovered as a MAP procedure that starts with its name', async () => {
        const text = await hoverWord(buildFixture(), 'Log.Write', 'Log');
        assert.notStrictEqual(text, '', 'the global object must produce a hover');

        assert.ok(!/LogViewer/.test(text),
            `"Log" is not "LogViewer"; got: ${text}`);
        assert.ok(!/Global Procedure/.test(text),
            `Log is an object, not a procedure; got: ${text}`);
        assert.ok(/CLASS/.test(text.split('\n')[0]),
            `expected the global CLASS card; got: ${text}`);
    });

    test('a plain global variable is not hovered as a MAP procedure that starts with its name', async () => {
        const text = await hoverWord(buildFixture(), 'Total =', 'Total');
        assert.notStrictEqual(text, '', 'the global variable must produce a hover');

        assert.ok(!/TotalsReport/.test(text),
            `"Total" is not "TotalsReport"; got: ${text}`);
        assert.ok(!/Global Procedure/.test(text),
            `Total is a variable, not a procedure; got: ${text}`);
    });

    test('control: a call to a real overloaded prototype still resolves to the procedure', async () => {
        const text = await hoverWord(buildFixture(), 'n = WidgetGet', 'WidgetGet');
        assert.ok(/🌍 Global Procedure/.test(text),
            `WidgetGet is declared twice in the PROGRAM's MAP; got: ${text || '(no hover at all)'}`);
    });

    test('findMapDeclaration: a prefix of a prototype name finds nothing; the exact name still does', () => {
        const code = [
            '  PROGRAM',
            '  MAP',
            '    LogViewer',
            '    WidgetGet(LONG pId),LONG',
            '    WidgetGet(STRING pName),LONG',
            '  END',
            '  CODE',
            ''
        ].join('\n');
        const doc = TextDocument.create('test://prefix.clw', 'clarion', 1, code);
        const tokens = new ClarionTokenizer(code).tokenize();
        const resolver = new MapProcedureResolver();

        assert.strictEqual(resolver.findMapDeclaration('Log', tokens, doc), null,
            'a prefix of LogViewer is not a declaration of Log');
        assert.strictEqual(resolver.findMapDeclaration('Widget', tokens, doc), null,
            'a prefix of WidgetGet is not a declaration of Widget');

        const viewer = resolver.findMapDeclaration('LogViewer', tokens, doc);
        assert.ok(viewer, 'the exact name must still resolve');
        assert.strictEqual(viewer!.range.start.line, 2);
        assert.ok(resolver.findMapDeclaration('widgetget', tokens, doc),
            'an overloaded name must still resolve, case-insensitively');
    });
});
