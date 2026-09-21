/**
 * Hover and F12 on a bare SELF or PARENT (#606): SELF is the class whose method is
 * being implemented, PARENT is that class's parent - both resolve to the CLASS
 * declaration instead of the generic keyword card.
 *
 * On app1's generated AccountFile_CommonLib.clw, hovering SELF in ThisWindow.Init
 * gave only the keyword description, F12 did nothing, and F12 on PARENT fell back to
 * a word search that landed on an unrelated `parent` property of another class.
 */
import * as assert from 'assert';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { TokenCache } from '../TokenCache';
import { HoverProvider } from '../providers/HoverProvider';
import { DefinitionProvider } from '../providers/DefinitionProvider';
import { setServerInitialized } from '../serverState';

const LINES = [
    '  MEMBER()',                                   // 0
    'Stuff        GROUP',                           // 1
    'Parent         LONG',                          // 2 — a field spelled Parent, the word-search trap
    '             END',                             // 3
    'Base         CLASS,TYPE',                      // 4
    'Work           PROCEDURE',                     // 5
    '             END',                             // 6
    'Other        CLASS,TYPE',                      // 7
    'Work           PROCEDURE',                     // 8
    '             END',                             // 9
    'FirstProc PROCEDURE',                          // 10
    'ThisWindow   CLASS(Base)',                     // 11
    'Init           PROCEDURE',                     // 12
    '             END',                             // 13
    '  CODE',                                       // 14
    'ThisWindow.Init PROCEDURE',                    // 15
    '  CODE',                                       // 16
    '  SELF.Work()',                                // 17
    '  PARENT.Work()',                              // 18
    'SecondProc PROCEDURE',                         // 19
    'ThisWindow   CLASS(Other)',                    // 20 — same label, another procedure
    'Init           PROCEDURE',                     // 21
    '             END',                             // 22
    '  CODE',                                       // 23
    'ThisWindow.Init PROCEDURE',                    // 24
    '  CODE',                                       // 25
    '  SELF.Work()',                                // 26
    '  PARENT.Work()',                              // 27
    'Base.Work PROCEDURE',                          // 28 — Base has no parent
    '  CODE',                                       // 29
    '  PARENT.Work()',                              // 30
    'Loose PROCEDURE',                              // 31 — not a method
    '  CODE',                                       // 32
    '  x# = SELF',                                  // 33
    '  Stuff.Parent = 1',                           // 34 — a member named Parent, not the keyword
];
const SOURCE = LINES.join('\r\n');

function at(line: number, word: string) {
    return { line, character: LINES[line].indexOf(word) + 1 };
}

suite('Bare SELF / PARENT resolve to their class (#606)', () => {
    let doc: TextDocument;

    setup(() => {
        setServerInitialized(true);
        TokenCache.getInstance().clearAllTokens();
        doc = TextDocument.create('file:///c:/test606/Procs.clw', 'clarion', 1, SOURCE);
    });

    async function defLine(line: number, word: string): Promise<number | null> {
        const loc = await new DefinitionProvider().provideDefinition(doc, at(line, word));
        const arr = Array.isArray(loc) ? loc : (loc ? [loc] : []);
        return arr.length ? (arr[0] as any).range.start.line : null;
    }

    async function hoverText(line: number, word: string): Promise<string> {
        const h = await new HoverProvider().provideHover(doc, at(line, word));
        return h ? (h.contents as any).value as string : '';
    }

    test('F12 on SELF goes to the CLASS of the method being implemented', async () => {
        assert.strictEqual(await defLine(17, 'SELF'), 11);
    });

    test('F12 on PARENT goes to that class\'s parent', async () => {
        assert.strictEqual(await defLine(18, 'PARENT'), 4);
    });

    test('with the same class label in two procedures, the nearest declaration wins', async () => {
        assert.strictEqual(await defLine(26, 'SELF'), 20);
        assert.strictEqual(await defLine(27, 'PARENT'), 7);
    });

    test('hover on SELF names the class and what it extends', async () => {
        const text = await hoverText(17, 'SELF');
        assert.ok(/ThisWindow/.test(text) && /CLASS/.test(text) && /Base/.test(text), text);
    });

    test('hover on PARENT names the parent class', async () => {
        const text = await hoverText(18, 'PARENT');
        assert.ok(/\bBase\b/.test(text) && /CLASS/.test(text), text);
        assert.ok(!/OOP Reference/.test(text), `still the keyword card: ${text}`);
    });

    test('PARENT in a class without a parent has no definition - no word-search guess', async () => {
        assert.strictEqual(await defLine(30, 'PARENT'), null);
    });

    test('SELF outside a method has no definition and keeps the keyword hover', async () => {
        assert.strictEqual(await defLine(33, 'SELF'), null);
        assert.ok(/OOP Reference/.test(await hoverText(33, 'SELF')));
    });

    test('a member named Parent after a dot is not the keyword', async () => {
        assert.strictEqual(await defLine(34, 'Parent'), 2);
    });
});
