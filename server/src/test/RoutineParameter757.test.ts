import * as assert from 'assert';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Location, Position } from 'vscode-languageserver-protocol';
import { HoverProvider } from '../providers/HoverProvider';
import { DefinitionProvider } from '../providers/DefinitionProvider';
import { TokenCache } from '../TokenCache';
import { setServerInitialized } from '../serverState';

/**
 * #757 — a ROUTINE sees its procedure's parameters, as it sees the procedure's local data, but
 * hover on one inside a ROUTINE showed nothing: the ROUTINE was taken as the scope, and a
 * ROUTINE has no parameters. The routine's procedure is the scope, and the card names it (#755).
 */
const SOURCE = [
    '  PROGRAM',                                        // 0
    '  MAP',                                            // 1
    'Compute      PROCEDURE(LONG pCount)',              // 2
    '  END',                                            // 3
    'Cls          CLASS,TYPE',                          // 4
    'Run            PROCEDURE(STRING pName, |',         // 5
    '                         LONG pTimes)',            // 6
    '             END',                                 // 7
    '  CODE',                                           // 8
    '  RETURN',                                         // 9
    '',                                                 // 10
    'Compute      PROCEDURE(LONG pCount)',              // 11
    'Total          LONG',                              // 12
    '  CODE',                                           // 13
    '  Total = pCount',                                 // 14
    '  DO Tally',                                       // 15
    '',                                                 // 16
    'Tally        ROUTINE',                             // 17
    '  Total += pCount',                                // 18
    '',                                                 // 19
    'Cls.Run      PROCEDURE(STRING pName, |',           // 20
    '                       LONG pTimes)',              // 21
    'Count          LONG',                              // 22
    '  CODE',                                           // 23
    '  DO Repeat',                                      // 24
    '',                                                 // 25
    'Repeat       ROUTINE',                             // 26
    '  Count = pTimes',                                 // 27
    '  Count = LEN(pName)',                             // 28
];

let counter = 0;
function makeDoc(): TextDocument {
    const doc = TextDocument.create(`file:///C:/temp/routine757-${++counter}.clw`, 'clarion', 1, SOURCE.join('\r\n'));
    TokenCache.getInstance().getTokens(doc);
    return doc;
}

function pos(line: number, needle: string): Position {
    const idx = SOURCE[line].lastIndexOf(needle);
    if (idx < 0) throw new Error(`fixture: '${needle}' not on line ${line}`);
    return Position.create(line, idx + 1);
}

function hoverText(hover: any): string {
    if (!hover) return '';
    const c = hover.contents;
    return typeof c === 'string' ? c : 'value' in c ? c.value : '';
}

const CASES = [
    { name: 'pCount', useLine: 18, declLine: 11, type: 'LONG', procedure: 'Compute' },
    { name: 'pTimes', useLine: 27, declLine: 21, type: 'LONG', procedure: 'Cls.Run' },
    { name: 'pName', useLine: 28, declLine: 20, type: 'STRING', procedure: 'Cls.Run' },
];

suite('A ROUTINE sees its procedure\'s parameters (#757)', () => {
    setup(() => setServerInitialized(true));

    for (const c of CASES) {
        test(`hover on ${c.name} inside a ROUTINE of ${c.procedure} shows the parameter, naming the procedure`, async () => {
            const text = hoverText(await new HoverProvider().provideHover(makeDoc(), pos(c.useLine, c.name)));
            assert.ok(text.startsWith(`**Parameter:** \`${c.name}\``), `got: ${text.split('\n')[0]}`);
            assert.ok(text.includes(`**Type:** \`${c.type}\``), `type: ${text}`);
            assert.ok(text.includes(c.procedure) && !/Tally|Repeat/.test(text), `should name ${c.procedure}: ${text}`);
        });

        test(`F12 on ${c.name} inside a ROUTINE of ${c.procedure} lands on the parameter`, async () => {
            const r = await new DefinitionProvider().provideDefinition(makeDoc(), pos(c.useLine, c.name));
            const loc = (Array.isArray(r) ? r[0] : r) as Location | undefined;
            assert.ok(loc, 'no definition');
            assert.deepStrictEqual([loc!.range.start.line, loc!.range.start.character], [c.declLine, SOURCE[c.declLine].indexOf(c.name)]);
        });
    }
});
