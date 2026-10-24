import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { HoverProvider } from '../providers/HoverProvider';
import { setServerInitialized } from '../serverState';

/**
 * #777 — the COLOR card always said its colour parameter is the background colour. The COLOR
 * help topic says that holds for most controls only: on a BOX, ELLIPSE or REGION it is the
 * border colour, and on a LINE the colour of the line.
 */
suite('COLOR card on BOX, ELLIPSE, REGION and LINE (#777)', () => {
    let dir = '';
    setup(() => {
        setServerInitialized(true);
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'color777-'));
    });
    teardown(() => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ } });

    const CODE = [
        '  PROGRAM',
        "Win WINDOW('x'),AT(,,300,200)",
        '      BOX,AT(10,10,20,20),COLOR(COLOR:Black),FILL(COLOR:Yellow)',   // 2
        '      ELLIPSE,AT(40,10,20,20),COLOR(COLOR:Black)',                  // 3
        '      REGION,AT(70,10,20,20),COLOR(COLOR:Black)',                   // 4
        '      LINE,AT(100,10,20,0),COLOR(COLOR:Black)',                     // 5
        "      ENTRY(@s20),AT(10,40,60,10),USE(?E),COLOR(COLOR:White)",      // 6
        '    END',
        '  CODE',
        ''].join('\n');

    async function colorCard(line: number): Promise<string> {
        const file = path.join(dir, 'c777.clw');
        fs.writeFileSync(file, CODE);
        const uri = 'file:///' + file.replace(/\\/g, '/').replace(/^([a-zA-Z]):/, (_m, d) => d + '%3A');
        const text = CODE.split('\n')[line];
        const h = await new HoverProvider().provideHover(TextDocument.create(uri, 'clarion', 1, CODE),
            { line, character: text.indexOf('COLOR(') + 2 });
        return (h?.contents as { value?: string } | undefined)?.value ?? '';
    }

    for (const [line, control] of [[2, 'BOX'], [3, 'ELLIPSE'], [4, 'REGION']] as const) {
        test(`on a ${control} the colour is the border`, async () => {
            const card = await colorCard(line);
            assert.ok(/border/i.test(card), card || '(no hover)');
            assert.ok(!/background/i.test(card), card);
        });
    }

    test('on a LINE the colour is the line\'s', async () => {
        const card = await colorCard(5);
        assert.ok(/colou?r of the line/i.test(card), card || '(no hover)');
        assert.ok(!/background/i.test(card), card);
    });

    test('regression: on other controls it is still the background', async () => {
        const card = await colorCard(6);
        assert.ok(/background/i.test(card), card || '(no hover)');
    });
});
