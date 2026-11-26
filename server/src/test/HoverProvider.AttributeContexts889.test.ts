import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { HoverProvider } from '../providers/HoverProvider';
import { setServerInitialized } from '../serverState';

/**
 * #889 — some attribute cards read for one context only. IMM on a WINDOW showed the control text,
 * and that text was itself wrong (only a BUTTON gets EVENT:Accepted). CENTER on an ENTRY described
 * window position, FULL a full-screen window, ALRT window keys only, SCROLL a scrolling TEXT.
 * Wording per the Language Reference pages for IMM, CENTER, FULL, ALRT and SCROLL.
 */
suite('Attribute cards follow the window or control they are on (#889)', () => {
    let dir = '';
    setup(() => {
        setServerInitialized(true);
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'attr889-'));
    });
    teardown(() => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ } });

    const CODE = [
        '  PROGRAM',
        "Win WINDOW('x'),AT(,,300,200),IMM,ALRT(F2Key),CENTER",               // 1
        "      BUTTON('Go'),AT(10,10,40,14),USE(?Go),IMM",                    // 2
        '      ENTRY(@s20),AT(10,30,60,10),USE(?E),IMM,CENTER,ALRT(F3Key)',    // 3
        '      LIST,AT(10,50,60,40),USE(?L),IMM,FULL',                         // 4
        '      SHEET,AT(80,10,100,80),USE(?S),IMM',                            // 5
        '      REGION,AT(200,10,20,20),USE(?R),IMM,SCROLL',                    // 6
        '      SPIN(@n3),AT(10,100,30,10),USE(?Sp),IMM',                       // 7
        '      COMBO(@s20),AT(10,120,60,10),USE(?C),IMM,CENTER',               // 8
        '      TEXT,AT(10,140,60,30),USE(?T),CENTER',                          // 9
        '    END',
        "Frame APPLICATION('x'),AT(,,400,300),IMM,ALRT(F4Key),CENTER",       // 11
        '    END',
        '  CODE',
        ''].join('\n');

    async function card(line: number, word: string, nth = 0): Promise<string> {
        const file = path.join(dir, 'a889.clw');
        fs.writeFileSync(file, CODE);
        const uri = 'file:///' + file.replace(/\\/g, '/').replace(/^([a-zA-Z]):/, (_m, d) => d + '%3A');
        const text = CODE.split('\n')[line];
        let at = -1;
        for (let i = 0; i <= nth; i++) at = text.indexOf(',' + word, at + 1);
        assert.ok(at >= 0, `${word} on line ${line}`);
        const h = await new HoverProvider().provideHover(TextDocument.create(uri, 'clarion', 1, CODE),
            { line, character: at + 2 });
        return (h?.contents as { value?: string } | undefined)?.value ?? '';
    }

    suite('IMM', () => {
        test('on a WINDOW: move and size events before the action, which CYCLE cancels', async () => {
            const c = await card(1, 'IMM');
            assert.ok(/EVENT:Move/.test(c) && /EVENT:Size/.test(c) && /CYCLE/.test(c), c || '(no hover)');
            assert.ok(!/EVENT:Accepted/.test(c), c);
        });
        test('on a BUTTON: EVENT:Accepted on mouse-down, repeating while held', async () => {
            const c = await card(2, 'IMM');
            assert.ok(/EVENT:Accepted/.test(c) && /released/.test(c) && /DELAY/.test(c), c || '(no hover)');
            assert.ok(!/EVENT:NewSelection/.test(c), c);
        });
        test('on a COMBO: EVENT:NewSelection on every keystroke, as on a LIST', async () => {
            const c = await card(8, 'IMM');
            assert.ok(/keystroke/.test(c) && /QUEUE/.test(c), c || '(no hover)');
            assert.ok(!/EVENT:Accepted/.test(c), c);
        });
        test('on an APPLICATION: the frame\'s move and size events', async () => {
            const c = await card(11, 'IMM');
            assert.ok(/frame/.test(c) && /EVENT:Move/.test(c) && /CYCLE/.test(c), c || '(no hover)');
            assert.ok(!/EVENT:Accepted/.test(c), c);
        });
        test('on an ENTRY: EVENT:NewSelection when the contents or cursor change', async () => {
            const c = await card(3, 'IMM');
            assert.ok(/EVENT:NewSelection/.test(c) && /cursor/i.test(c), c || '(no hover)');
            assert.ok(!/EVENT:Accepted/.test(c), c);
        });
        test('on a SPIN: the same as an ENTRY', async () => {
            assert.ok(/cursor/i.test(await card(7, 'IMM')));
        });
        test('on a LIST: EVENT:NewSelection on every keystroke', async () => {
            const c = await card(4, 'IMM');
            assert.ok(/EVENT:NewSelection/.test(c) && /keystroke|key/i.test(c), c || '(no hover)');
            assert.ok(!/EVENT:Accepted/.test(c), c);
        });
        test('on a SHEET: EVENT:NewSelection on a TAB click', async () => {
            const c = await card(5, 'IMM');
            assert.ok(/EVENT:NewSelection/.test(c) && /TAB/.test(c), c || '(no hover)');
        });
        test('on a REGION: the mouse events', async () => {
            const c = await card(6, 'IMM');
            assert.ok(/EVENT:MouseIn/.test(c) && /EVENT:MouseOut/.test(c), c || '(no hover)');
        });
        test('lists WINDOW and APPLICATION among the places it applies', async () => {
            const c = await card(1, 'IMM');
            assert.ok(/Applicable to:\*\*[^\n]*WINDOW/.test(c) && /APPLICATION/.test(c), c);
        });
    });

    test('CENTER on an ENTRY is text justification, not the window position', async () => {
        const c = await card(3, 'CENTER');
        assert.ok(/justif|centered text|center of the control/i.test(c), c || '(no hover)');
        assert.ok(!/screen|window position/i.test(c), c);
    });

    test('CENTER on a COMBO and a TEXT is justification too (a TEXT takes no offset)', async () => {
        assert.ok(/justif/.test(await card(8, 'CENTER')));
        const t = await card(9, 'CENTER');
        assert.ok(/justif/.test(t) && /without an offset/.test(t), t || '(no hover)');
    });

    test('CENTER on a WINDOW centers it on its parent, only where AT omits a parameter', async () => {
        const c = await card(1, 'CENTER');
        assert.ok(/parent/.test(c) && /AT/.test(c), c || '(no hover)');
        assert.ok(!/justif/.test(c), c);
    });

    test('CENTER on an APPLICATION centers the frame on the screen', async () => {
        const c = await card(11, 'CENTER');
        assert.ok(/frame on the screen/.test(c), c || '(no hover)');
    });

    test('ALRT on an APPLICATION is a key active while the frame has focus', async () => {
        const c = await card(11, 'ALRT');
        assert.ok(/application frame has focus/.test(c) && /field-independent/.test(c), c || '(no hover)');
        assert.ok(!/field-specific/.test(c), c);
    });

    test('FULL fills the window for an omitted AT width or height, not a full-screen window', async () => {
        const c = await card(4, 'FULL');
        assert.ok(/AT/.test(c) && /width|height/i.test(c), c || '(no hover)');
        assert.ok(!/full-screen mode|no borders/i.test(c), c);
    });

    test('ALRT on a control is a key active while that control has focus', async () => {
        const c = await card(3, 'ALRT');
        assert.ok(/control/i.test(c) && /focus/i.test(c), c || '(no hover)');
    });

    test('ALRT on a WINDOW is a key active while the window has focus', async () => {
        const c = await card(1, 'ALRT');
        assert.ok(/while the window has focus/.test(c) && /EVENT:AlertKey/.test(c), c || '(no hover)');
        assert.ok(!/field-specific/.test(c), c);
    });

    test('SCROLL: the control moves with the window when it scrolls', async () => {
        const c = await card(6, 'SCROLL');
        assert.ok(/moves with the window|window scrolls/i.test(c), c || '(no hover)');
        assert.ok(!/TEXT control/i.test(c), c);
    });
});
