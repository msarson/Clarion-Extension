import * as assert from 'assert';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Location, Position } from 'vscode-languageserver-protocol';
import { HoverProvider } from '../providers/HoverProvider';
import { DefinitionProvider } from '../providers/DefinitionProvider';
import { ReferencesProvider } from '../providers/ReferencesProvider';
import { TokenCache } from '../TokenCache';
import { setServerInitialized } from '../serverState';
import { ProcedureSignatureUtils } from '../utils/ProcedureSignatureUtils';

/**
 * #825 — a parameter declared on a `|` continuation line of a procedure or method
 * implementation got no parameter card, no Go to Definition and no references: the
 * parameter lookup read the PROCEDURE line only. A continued parameter is a parameter.
 */

const SOURCE = [
    '  PROGRAM',                                                   // 0
    '  MAP',                                                       // 1
    'Query        PROCEDURE(STRING url, |',                        // 2
    '                       *HTTP:Query request, |',               // 3
    '                       *HTTP:Answer answer, |',               // 4
    '                       <LONG timeout>, |',                    // 5
    '                       LONG option, |',                       // 6
    '                       STRING Password),SIGNED',              // 7
    '  END',                                                       // 8
    'Cls          CLASS,TYPE',                                     // 9
    'Query          PROCEDURE(STRING url, |',                      // 10
    '                         *HTTP:Query request, |',             // 11
    '                         <LONG timeout>, |',                  // 12
    '                         LONG option),SIGNED',                // 13
    '             END',                                            // 14
    '  CODE',                                                      // 15
    '  RETURN',                                                    // 16
    '',                                                            // 17
    'Query        PROCEDURE(STRING url, |  ! the address',         // 18
    '                       *HTTP:Query request, |',               // 19
    '                       *HTTP:Answer answer, |',               // 20
    '                       <LONG timeout>, |',                    // 21
    '                       LONG option, |',                       // 22
    '                       STRING Password)',                     // 23
    'Result         LONG',                                         // 24
    '  CODE',                                                      // 25
    '  Result = url',                                              // 26
    '  Result = request',                                          // 27
    '  Result = answer',                                           // 28
    '  Result = timeout',                                          // 29
    '  Result = option',                                           // 30
    '  Result = Password',                                         // 31
    '  RETURN Result',                                             // 32
    '',                                                            // 33
    'Cls.Query    PROCEDURE(STRING url, |',                        // 34
    '                       *HTTP:Query request, |',               // 35
    '                       <LONG timeout>, |',                    // 36
    '                       LONG option)',                         // 37
    'Result         LONG',                                         // 38
    '  CODE',                                                      // 39
    '  Result = request',                                          // 40
    '  Result = timeout',                                          // 41
    '  Result = option',                                           // 42
    '  RETURN Result',                                             // 43
];

let counter = 0;
function makeDoc(): TextDocument {
    const doc = TextDocument.create(`file:///C:/temp/continued825-${++counter}.clw`, 'clarion', 1, SOURCE.join('\r\n'));
    TokenCache.getInstance().getTokens(doc);
    return doc;
}

/** Position on `needle` in `line`; the last occurrence, since usage lines start with `Result`. */
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

function firstLocation(r: any): Location | undefined {
    return Array.isArray(r) ? r[0] : r ?? undefined;
}

interface Case { name: string; declLine: number; useLine: number; type: string }

const PROC_CASES: Case[] = [
    { name: 'url', declLine: 18, useLine: 26, type: 'STRING' },
    { name: 'request', declLine: 19, useLine: 27, type: '*HTTP:Query' },
    { name: 'answer', declLine: 20, useLine: 28, type: '*HTTP:Answer' },
    { name: 'timeout', declLine: 21, useLine: 29, type: 'LONG' },
    { name: 'option', declLine: 22, useLine: 30, type: 'LONG' },
    { name: 'Password', declLine: 23, useLine: 31, type: 'STRING' },
];

const METHOD_CASES: Case[] = [
    { name: 'request', declLine: 35, useLine: 40, type: '*HTTP:Query' },
    { name: 'timeout', declLine: 36, useLine: 41, type: 'LONG' },
    { name: 'option', declLine: 37, useLine: 42, type: 'LONG' },
];

/** Parameters declared on a continued prototype: in the MAP and in the CLASS. */
const PROTOTYPE_CASES: { where: string; name: string; line: number; type: string }[] = [
    { where: 'MAP prototype', name: 'url', line: 2, type: 'STRING' },
    { where: 'MAP prototype', name: 'request', line: 3, type: '*HTTP:Query' },
    { where: 'MAP prototype', name: 'answer', line: 4, type: '*HTTP:Answer' },
    { where: 'MAP prototype', name: 'timeout', line: 5, type: 'LONG' },
    { where: 'MAP prototype', name: 'option', line: 6, type: 'LONG' },
    { where: 'MAP prototype', name: 'Password', line: 7, type: 'STRING' },
    { where: 'CLASS method prototype', name: 'request', line: 11, type: '*HTTP:Query' },
    { where: 'CLASS method prototype', name: 'timeout', line: 12, type: 'LONG' },
    { where: 'CLASS method prototype', name: 'option', line: 13, type: 'LONG' },
];

/** A field reached through a continued parameter's type: the parameter's type is read from its line. */
const MEMBER_SOURCE = [
    '  PROGRAM',                                                   // 0
    'QueryType    GROUP,TYPE',                                     // 1
    'Url            STRING(200)',                                  // 2
    '             END',                                            // 3
    '  MAP',                                                       // 4
    'Send         PROCEDURE(STRING url, |',                        // 5
    '                       *QueryType q)',                        // 6
    '  END',                                                       // 7
    '  CODE',                                                      // 8
    '  RETURN',                                                    // 9
    '',                                                            // 10
    'Send         PROCEDURE(STRING url, |',                        // 11
    '                       *QueryType q)',                        // 12
    '  CODE',                                                      // 13
    '  q.Url = url',                                               // 14
];

suite('A parameter on a | continuation line is a parameter (#825)', () => {
    setup(() => setServerInitialized(true));

    test('F12 on a field reached through a continued parameter lands on the field', async () => {
        const doc = TextDocument.create(`file:///C:/temp/continued825-m${++counter}.clw`, 'clarion', 1, MEMBER_SOURCE.join('\r\n'));
        TokenCache.getInstance().getTokens(doc);
        const loc = firstLocation(await new DefinitionProvider().provideDefinition(doc, Position.create(14, MEMBER_SOURCE[14].indexOf('Url') + 1)));
        assert.ok(loc, 'no definition');
        assert.strictEqual(loc!.range.start.line, 2);
    });

    test('hover on a field reached through a continued parameter shows the field', async () => {
        const doc = TextDocument.create(`file:///C:/temp/continued825-m${++counter}.clw`, 'clarion', 1, MEMBER_SOURCE.join('\r\n'));
        TokenCache.getInstance().getTokens(doc);
        const text = hoverText(await new HoverProvider().provideHover(doc, Position.create(14, MEMBER_SOURCE[14].indexOf('Url') + 1)));
        assert.ok(/STRING\(200\)/i.test(text), `got: ${text}`);
    });

    for (const c of PROTOTYPE_CASES) {
        test(`${c.where}: hover on ${c.name} shows its parameter card`, async () => {
            const text = hoverText(await new HoverProvider().provideHover(makeDoc(), pos(c.line, c.name)));
            assert.ok(text.startsWith(`**Parameter:** \`${c.name}\``), `got: ${text.split('\n')[0]}`);
            assert.ok(text.includes(`**Type:** \`${c.type}\``), `type: ${text}`);
        });
    }

    for (const [where, cases] of [['procedure', PROC_CASES], ['method implementation', METHOD_CASES]] as const) {
        for (const c of cases) {
            test(`${where}: hover on ${c.name} in code shows its parameter card`, async () => {
                const text = hoverText(await new HoverProvider().provideHover(makeDoc(), pos(c.useLine, c.name)));
                assert.ok(text.startsWith(`**Parameter:** \`${c.name}\``), `got: ${text.split('\n')[0]}`);
                assert.ok(text.includes(`**Type:** \`${c.type}\``), `type: ${text}`);
                assert.ok(text.includes(`#L${c.declLine + 1}`) || text.includes(`line ${c.declLine + 1}`),
                    `card should link the line that declares ${c.name} (${c.declLine + 1}): ${text}`);
            });

            test(`${where}: hover on ${c.name} where it is declared shows its parameter card`, async () => {
                const text = hoverText(await new HoverProvider().provideHover(makeDoc(), pos(c.declLine, c.name)));
                assert.ok(text.startsWith(`**Parameter:** \`${c.name}\``), `got: ${text.split('\n')[0]}`);
            });

            test(`${where}: F12 on ${c.name} lands on its declaration`, async () => {
                const loc = firstLocation(await new DefinitionProvider().provideDefinition(makeDoc(), pos(c.useLine, c.name)));
                assert.ok(loc, 'no definition');
                assert.strictEqual(loc!.range.start.line, c.declLine);
                assert.strictEqual(loc!.range.start.character, SOURCE[c.declLine].lastIndexOf(c.name));
            });

            test(`${where}: references of ${c.name} are its declaration and its use`, async () => {
                const refs = await new ReferencesProvider().provideReferences(
                    makeDoc(), pos(c.useLine, c.name), { includeDeclaration: true });
                // `*HTTP:Answer answer` also lists the type's tail `Answer`: the same on a header
                // that fits on one line (the tokens are identical), so not this issue's - left out.
                const typeTail = (l: Location) => l.range.start.line === c.declLine &&
                    l.range.start.character === SOURCE[c.declLine].indexOf(':' + c.name.charAt(0).toUpperCase() + c.name.slice(1)) + 1;
                const got = (refs ?? []).filter(l => !typeTail(l))
                    .map(l => `${l.range.start.line}:${l.range.start.character}`).sort();
                const want = [
                    `${c.declLine}:${SOURCE[c.declLine].lastIndexOf(c.name)}`,
                    `${c.useLine}:${SOURCE[c.useLine].lastIndexOf(c.name)}`,
                ].sort();
                assert.deepStrictEqual(got, want);
            });
        }
    }
});

suite('findHeaderParameter places a parameter named like its type on its name (#825 review)', () => {
    const lines = [
        'Show         PROCEDURE(&Window Window, |',
        '                       *MyGroup MyGroup)',
    ];
    const at = (word: string) => ProcedureSignatureUtils.findHeaderParameter(n => lines[n], 0, word);

    test('&Window Window: the name, not the type', () => {
        const got = at('Window');
        assert.deepStrictEqual(got && [got.line, got.character], [0, lines[0].lastIndexOf('Window')]);
    });

    test('*MyGroup MyGroup on a continuation line: the name, not the type', () => {
        const got = at('MyGroup');
        assert.deepStrictEqual(got && [got.line, got.character], [1, lines[1].lastIndexOf('MyGroup')]);
    });
});
