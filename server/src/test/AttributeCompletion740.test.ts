import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { CompletionItem, CompletionTriggerKind, InsertTextFormat } from 'vscode-languageserver/node';
import { CompletionProvider } from '../providers/CompletionProvider';
import { TokenCache } from '../TokenCache';
import { setServerInitialized } from '../serverState';
import { ControlService } from '../utils/ControlService';

/**
 * #740 — after a comma on a control declaration, or on a WINDOW, APPLICATION or REPORT
 * header, the only legal next word is an attribute. Completion there used to answer with the
 * whole word list (variables, keywords, built-ins, data types) and with attributes filtered by
 * the help-derived `applicableTo`, which is wrong both ways (#737). It now offers the
 * compiler-checked list for that control in that structure, without what the declaration
 * already sets.
 */

let counter = 0;

/** Completes at `¦` in `lines`; a comma right before the cursor is the trigger, as VS Code sends it. */
async function complete(lines: string[]): Promise<CompletionItem[]> {
    const line = lines.findIndex(l => l.includes('¦'));
    const character = lines[line].indexOf('¦');
    const text = lines.map(l => l.replace('¦', '')).join('\r\n');
    const doc = TextDocument.create(`file:///C:/temp/attrcompl740-${++counter}.clw`, 'clarion', 1, text);
    const cache = TokenCache.getInstance();
    cache.clearAllTokens();
    cache.getTokens(doc);
    const comma = lines[line].slice(0, character).endsWith(',');
    return new CompletionProvider().onCompletion({
        textDocument: { uri: doc.uri },
        position: { line, character },
        context: comma ? { triggerKind: CompletionTriggerKind.TriggerCharacter, triggerCharacter: ',' } : { triggerKind: CompletionTriggerKind.Invoked },
    }, doc);
}

const labels = (items: CompletionItem[]) => items.map(i => String(i.label)).sort();
const names = (list: string[] | undefined) => (list ?? []).map(a => a.replace('()', ''));

function inWindow(control: string[]): string[] {
    return ['  PROGRAM', '  MAP', '  END', 'LocalVar LONG', 'Notes    STRING(200)',
        "MyWin WINDOW('T'),AT(,,300,200)", ...control, '       END', '  CODE', '  RETURN'];
}
function inReport(control: string[]): string[] {
    return ['  PROGRAM', '  MAP', '  END', 'LocalVar LONG', 'Notes    STRING(200)',
        'Rpt REPORT,AT(0,0,8000,10000)', 'Det  DETAIL,AT(,,8000,1000)', ...control, '     END', '   END', '  CODE', '  RETURN'];
}

const controls = ControlService.getInstance();

suite('Attribute completion on a declaration (#740)', function () {
    suiteSetup(() => setServerInitialized(true));

    test('after a comma on a TEXT in a WINDOW: its compiler-checked list, less what it sets', async () => {
        const items = await complete(inWindow(['         TEXT,AT(10,10,100,50),USE(Notes),VSCROLL,¦']));
        const expected = names(controls.getWindowControl('TEXT')!.attributes).filter(a => !['AT', 'USE', 'VSCROLL'].includes(a)).sort();
        assert.deepStrictEqual(labels(items), expected);
    });

    test('nothing but attributes: no variable, keyword, built-in or data type', async () => {
        const got = labels(await complete(inWindow(['         TEXT,AT(10,10,100,50),USE(Notes),¦'])));
        for (const noise of ['LocalVar', 'Notes', 'IF', 'MESSAGE', 'LONG', 'BUTTON']) assert.ok(!got.includes(noise), noise);
        // The help's applicableTo lets these through; the compiler rejects them on a TEXT.
        for (const rejected of ['AUTO', 'MDI', 'GRAY']) assert.ok(!got.includes(rejected), rejected);
        for (const accepted of ['IMM', 'CAP', 'HIDE']) assert.ok(got.includes(accepted), accepted);
    });

    test('a typed partial narrows the list, and the word being typed is not taken as set', async () => {
        assert.deepStrictEqual(labels(await complete(inWindow(['         TEXT,AT(10,10,100,50),HI¦']))), ['HIDE', 'HLP', 'HSCROLL', 'HVSCROLL'].filter(a => names(controls.getWindowControl('TEXT')!.attributes).includes(a) && a.startsWith('HI')));
        assert.ok(labels(await complete(inWindow(['         TEXT,AT(10,10,100,50),HIDE¦']))).includes('HIDE'));
    });

    test('ALRT stays on offer once set: a declaration repeats it, one key each', async () => {
        const got = labels(await complete(inWindow(['         LIST,AT(10,10,100,50),ALRT(EnterKey),¦'])));
        assert.ok(got.includes('ALRT'), got.join(' '));
        const header = labels(await complete(['  PROGRAM', '  MAP', '  END', "MyWin WINDOW('T'),ALRT(EscKey),¦", '       END', '  CODE']));
        assert.ok(header.includes('ALRT'), header.join(' '));
    });

    test('a flag inserts its name; an attribute with a value inserts brackets with the cursor inside', async () => {
        const items = await complete(inWindow(['         TEXT,AT(10,10,100,50),¦']));
        const hide = items.find(i => i.label === 'HIDE')!;
        const tip = items.find(i => i.label === 'TIP')!;
        assert.ok(!hide.insertText || hide.insertText === 'HIDE');
        assert.strictEqual(tip.insertText, "TIP('${1:text}')"); // #743: the snippet the card's With value link inserts
        assert.strictEqual(tip.insertTextFormat, InsertTextFormat.Snippet);
        assert.ok(hide.documentation, 'carries the attribute description');
    });

    test('a REPORT takes its own list: a TEXT there offers RESIZE, not TIP or VSCROLL', async () => {
        const got = labels(await complete(inReport(['         TEXT,AT(10,10,100,50),USE(Notes),¦'])));
        assert.ok(got.includes('RESIZE'));
        assert.ok(!got.includes('TIP') && !got.includes('VSCROLL'));
    });

    test('in a REPORT a picture STRING offers the totals, a constant one does not', async () => {
        const picture = labels(await complete(inReport(['         STRING(@n9),AT(1,1),USE(LocalVar),¦'])));
        const constant = labels(await complete(inReport(["         STRING('Total'),AT(1,1),¦"])));
        assert.ok(picture.includes('SUM') && picture.includes('PAGENO'), picture.join(' '));
        assert.ok(!constant.includes('SUM') && !constant.includes('PAGENO'), constant.join(' '));
    });

    test('a picture holding brackets (`@n(15.2)`) does not hide the attribute position', async () => {
        const got = labels(await complete(inReport(['         STRING(@n(15.2)),AT(1,1),USE(LocalVar),¦'])));
        assert.ok(got.includes('SUM') && got.includes('RIGHT'), got.join(' '));
    });

    test('a | continuation line is part of the declaration', async () => {
        const after = labels(await complete(inWindow(['         TEXT,AT(10,10,100,50),USE(Notes), |', '              ¦'])));
        assert.ok(after.includes('HIDE') && !after.includes('AT') && !after.includes('USE') && !after.includes('LocalVar'), after.join(' '));
        const leading = labels(await complete(inWindow(['         TEXT,AT(10,10,100,50),USE(Notes) |', '              ,¦'])));
        assert.ok(leading.includes('HIDE') && !leading.includes('USE'), leading.join(' '));
    });

    test('a WINDOW header offers the WINDOW list', async () => {
        const got = labels(await complete(['  PROGRAM', '  MAP', '  END', "MyWin WINDOW('T'),AT(,,300,200),¦", "         BUTTON('Go'),USE(?Go)", '       END', '  CODE']));
        assert.deepStrictEqual(got, names(controls.getContainerStructure('WINDOW')!.attributes).filter(a => a !== 'AT').sort());
        assert.ok(got.includes('MDI') && !got.includes('HIDE'));
    });

    test('a REPORT header offers PRE and LANDSCAPE, and none of the help\'s ORIENT, COPIES or TO', async () => {
        const got = labels(await complete(['  PROGRAM', '  MAP', '  END', 'Rpt REPORT,AT(0,0,8000,10000),¦', 'Det  DETAIL', '     END', '   END', '  CODE']));
        assert.deepStrictEqual(got, names(controls.getContainerStructure('REPORT')!.attributes).filter(a => a !== 'AT').sort());
        assert.ok(got.includes('PRE') && got.includes('LANDSCAPE'));
        for (const wrong of ['ORIENT', 'COPIES', 'TO']) assert.ok(!got.includes(wrong), wrong);
    });

    test('an APPLICATION header offers the APPLICATION list (no MDI there)', async () => {
        const got = labels(await complete(['  PROGRAM', '  MAP', '  END', "Frame APPLICATION('App'),¦", '       END', '  CODE']));
        assert.deepStrictEqual(got, names(controls.getContainerStructure('APPLICATION')!.attributes).sort());
        assert.ok(!got.includes('MDI'));
    });

    test('inside brackets nothing changes: AT( and USE( are not an attribute position', async () => {
        assert.deepStrictEqual(await complete(inWindow(['         TEXT,AT(10,¦'])), [], 'a comma inside AT( offers nothing');
        const use = labels(await complete(inWindow(['         TEXT,AT(10,10,100,50),USE(Lo¦'])));
        assert.ok(use.includes('LocalVar'), 'USE( still offers variables: ' + use.slice(0, 20).join(' '));
    });

    test('a comma anywhere else offers nothing, and typing there keeps the word list', async () => {
        const code = ['  PROGRAM', '  MAP', '  END', 'LocalVar LONG', '  CODE', "  MESSAGE('a',¦"];
        assert.deepStrictEqual(await complete(code), []);
        const data = ['  PROGRAM', '  MAP', '  END', 'LocalVar LONG', 'Name STRING(20),¦', '  CODE'];
        assert.deepStrictEqual(await complete(data), [], 'a data declaration is not a control');
        const typed = labels(await complete(['  PROGRAM', '  MAP', '  END', 'LocalVar LONG', '  CODE', "  MESSAGE('a',Lo¦"]));
        assert.ok(typed.includes('LocalVar'));
    });

    test('the server announces the comma as a completion trigger', () => {
        let dir = __dirname;
        while (!fs.existsSync(path.join(dir, 'server', 'src', 'server.ts'))) dir = path.dirname(dir);
        const src = fs.readFileSync(path.join(dir, 'server', 'src', 'server.ts'), 'utf8');
        assert.match(src, /completionProvider:\s*\{\s*triggerCharacters:\s*\[[^\]]*','/);
    });
});
