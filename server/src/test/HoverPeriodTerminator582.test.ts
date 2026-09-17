import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { HoverProvider } from '../providers/HoverProvider';

/**
 * #582 — #575 made hovering END show what it closes. A period terminator closes a structure just as
 * END does (the parser links both to their opener), but hovering it showed nothing: hover starts from
 * the word under the cursor, and `.` is not a word character. 677 periods close a multi-line
 * structure across the DirectSystems solution and the Clarion 10 libsrc.
 */
let tmpRoot: string;

async function hoverAt(lines: string[], line: number, character: number): Promise<string> {
    const text = lines.join('\r\n');
    const file = path.join(tmpRoot, `period${Math.random().toString(36).slice(2)}.clw`);
    fs.writeFileSync(file, text);
    const uri = 'file:///' + file.replace(/\\/g, '/').replace(/^([a-zA-Z]):/, (_m, d) => d + '%3A');
    const doc = TextDocument.create(uri, 'clarion', 1, text);
    const h = await new HoverProvider().provideHover(doc, { line, character });
    const c = h?.contents as { value?: string } | string | undefined;
    return !c ? '' : typeof c === 'string' ? c : (c.value ?? '');
}

const col = (lines: string[], line: number, needle: string, nth = 0) => {
    let at = -1;
    for (let i = 0; i <= nth; i++) at = lines[line].indexOf(needle, at + 1);
    return at;
};

const FILE_SOURCE = [
    '  PROGRAM',                                           // 0
    '',                                                    // 1
    "Customer   FILE,DRIVER('TOPSPEED'),PRE(CUS)",         // 2
    'Record       RECORD,PRE()',                           // 3
    'ID             LONG',                                 // 4
    '             .',                                      // 5 closes RECORD
    '           .',                                        // 6 closes FILE
    "Orders     FILE,DRIVER('TOPSPEED'),PRE(ORD)",         // 7
    'Record       RECORD,PRE()',                           // 8
    'ID             LONG',                                 // 9
    '           . .',                                      // 10 closes RECORD, then FILE
    '  MAP',                                               // 11
    '  END',                                               // 12
    '  CODE',                                              // 13
    '  LOOP 3 TIMES',                                      // 14
    '    Total# += 1.5',                                   // 15
    '    Total# += 1.',                                    // 16 closes LOOP
    '  IF Total# > 1 THEN Total# = 0.',                    // 17 one-line IF
    '  RETURN',                                            // 18
];

suite('Hovering a period terminator shows what it closes (#582)', () => {
    setup(() => { tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'hover-period-')); });
    teardown(() => { try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch { /* best-effort */ } });

    test('a period on its own line closing a RECORD names it, shows its line and links to it', async () => {
        const text = await hoverAt(FILE_SOURCE, 5, col(FILE_SOURCE, 5, '.'));
        assert.match(text, /closes RECORD `Record`/, text);
        assert.match(text, /Record\s+RECORD,PRE\(\)/, text);
        assert.match(text, /\]\(file:\/\/\/.*#L4\)/, text);
    });

    test('the period after it closes the FILE', async () => {
        const text = await hoverAt(FILE_SOURCE, 6, col(FILE_SOURCE, 6, '.'));
        assert.match(text, /closes FILE `Customer`/, text);
    });

    test('two periods on one line each describe their own structure', async () => {
        assert.match(await hoverAt(FILE_SOURCE, 10, col(FILE_SOURCE, 10, '.', 0)), /closes RECORD `Record`/);
        assert.match(await hoverAt(FILE_SOURCE, 10, col(FILE_SOURCE, 10, '.', 1)), /closes FILE `Orders`/);
    });

    test('a period ending a statement that closes a LOOP, with the cursor on it or just after it', async () => {
        const at = col(FILE_SOURCE, 16, '1.') + 1;
        assert.match(await hoverAt(FILE_SOURCE, 16, at), /closes LOOP/);
        assert.match(await hoverAt(FILE_SOURCE, 16, at + 1), /closes LOOP/);
    });

    test('guard: a one-line IF period, a decimal point and a member dot get no terminator card', async () => {
        assert.doesNotMatch(await hoverAt(FILE_SOURCE, 17, col(FILE_SOURCE, 17, '0.') + 1), /closes/);
        assert.doesNotMatch(await hoverAt(FILE_SOURCE, 15, col(FILE_SOURCE, 15, '1.5') + 1), /closes/);
        const member = ['  PROGRAM', '  MAP', '  END', 'C CLASS', 'Go PROCEDURE', '  END', '  CODE', '  C.Go()', '  RETURN'];
        assert.doesNotMatch(await hoverAt(member, 7, col(member, 7, '.')), /closes/);
    });

    test('guard: END still shows its own card', async () => {
        const lines = ['  PROGRAM', '  MAP', '  END', '  CODE', '  IF 1 = 1', '    RETURN', '  END', '  RETURN'];
        assert.match(await hoverAt(lines, 6, 3), /\*\*END\*\* — closes IF/);
    });
});
