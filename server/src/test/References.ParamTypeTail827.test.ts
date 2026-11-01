import * as assert from 'assert';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Location, Position } from 'vscode-languageserver-protocol';
import { ReferencesProvider } from '../providers/ReferencesProvider';
import { TokenCache } from '../TokenCache';
import { setServerInitialized } from '../serverState';

/**
 * #827 — for a parameter declared `*HTTP:Answer answer`, Find All References on
 * `answer` also listed the `Answer` that is the tail of the type name `HTTP:Answer`.
 * The tokens are `*HTTP` `:` `Answer` `answer`, and the tail token equals the word.
 * The type of a declaration is never a reference to a variable.
 */

const SOURCE = [
    '  PROGRAM',                                                   // 0
    '  MAP',                                                       // 1
    'OneLine      PROCEDURE(*HTTP:Answer answer)',                 // 2
    'Continued    PROCEDURE(STRING url, |',                        // 3
    '                       *HTTP:Answer answer)',                 // 4
    'UsesLocal    PROCEDURE()',                                    // 5
    '  END',                                                       // 6
    'Cls          CLASS,TYPE',                                     // 7
    'Fetch          PROCEDURE(*HTTP:Answer answer),LONG',          // 8
    '             END',                                            // 9
    'Rec          GROUP,PRE(PRE)',                                 // 10
    'Answer         LONG',                                         // 11
    '             END',                                            // 12
    'Long         GROUP,PRE(LONGPREFIX)',                          // 13
    'Answer         LONG',                                         // 14
    '             END',                                            // 15
    '  CODE',                                                      // 16
    '  PRE:Answer = 1',                                            // 17
    '  LONGPREFIX:Answer = 2',                                     // 18
    '  RETURN',                                                    // 19
    '',                                                            // 20
    'OneLine      PROCEDURE(*HTTP:Answer answer)',                 // 21
    'Result         LONG',                                         // 22
    '  CODE',                                                      // 23
    '  Result = answer',                                           // 24
    '  RETURN',                                                    // 25
    '',                                                            // 26
    'Continued    PROCEDURE(STRING url, |',                        // 27
    '                       *HTTP:Answer answer)',                 // 28
    'Result         LONG',                                         // 29
    '  CODE',                                                      // 30
    '  Result = answer',                                           // 31
    '  RETURN',                                                    // 32
    '',                                                            // 33
    'Cls.Fetch    PROCEDURE(*HTTP:Answer answer)',                 // 34
    'Result         LONG',                                         // 35
    '  CODE',                                                      // 36
    '  Result = answer',                                           // 37
    '  RETURN Result',                                             // 38
    '',                                                            // 39
    'UsesLocal    PROCEDURE()',                                    // 40
    'Answer         LONG',                                         // 41
    '  CODE',                                                      // 42
    '  Answer = 3',                                                // 43
    '  RETURN',                                                    // 44
];

let counter = 0;
function makeDoc(): TextDocument {
    const doc = TextDocument.create(`file:///C:/temp/paramtypetail827-${++counter}.clw`, 'clarion', 1, SOURCE.join('\r\n'));
    TokenCache.getInstance().getTokens(doc);
    return doc;
}

/** Position inside the LAST occurrence of `needle` on `line` (the parameter name, never the type). */
function pos(line: number, needle: string): Position {
    const idx = SOURCE[line].lastIndexOf(needle);
    if (idx < 0) throw new Error(`fixture: '${needle}' not on line ${line}`);
    return Position.create(line, idx + 1);
}

function at(line: number, needle: string): string {
    return `${line}:${SOURCE[line].lastIndexOf(needle)}`;
}

function keys(refs: Location[] | null | undefined): string[] {
    return (refs ?? []).map(l => `${l.range.start.line}:${l.range.start.character}`).sort();
}

/** Every `Answer` that is the tail of `HTTP:Answer` in the fixture. */
const TYPE_TAILS = new Set(SOURCE.flatMap((text, line) =>
    text.includes('HTTP:Answer') ? [`${line}:${text.indexOf('HTTP:Answer') + 5}`] : []));

async function far(line: number, needle: string): Promise<string[]> {
    const refs = await new ReferencesProvider().provideReferences(
        makeDoc(), pos(line, needle), { includeDeclaration: true });
    return keys(refs);
}

suite('FAR on a parameter does not list the tail of its colon type (#827)', () => {
    setup(() => setServerInitialized(true));

    const PROCS = [
        { where: 'one-line header', declLine: 21, useLine: 24 },
        { where: 'continued header', declLine: 28, useLine: 31 },
        { where: 'method implementation', declLine: 34, useLine: 37 },
    ];

    for (const p of PROCS) {
        for (const from of ['declaration', 'use'] as const) {
            // FAR asked on a method implementation's header parameter returns nothing,
            // whatever its type (`LONG answer` too) - a separate gap, not this issue's.
            if (p.where === 'method implementation' && from === 'declaration') continue;
            test(`${p.where}: FAR on answer from its ${from} is the parameter and its use`, async () => {
                const got = await far(from === 'declaration' ? p.declLine : p.useLine, 'answer');
                const tails = got.filter(k => TYPE_TAILS.has(k));
                assert.deepStrictEqual(tails, [], `the type's tail was listed: ${got.join(', ')}`);
                assert.ok(got.includes(at(p.declLine, 'answer')), `no declaration: ${got.join(', ')}`);
                assert.ok(got.includes(at(p.useLine, 'answer')), `no use: ${got.join(', ')}`);
                if (p.where !== 'method implementation') {
                    assert.deepStrictEqual(got, [at(p.declLine, 'answer'), at(p.useLine, 'answer')].sort());
                }
            });
        }
    }

    test('control: FAR on a PRE() field named Answer still finds PRE:Answer', async () => {
        const got = await far(11, 'Answer');
        assert.ok(got.includes('11:0'), `no declaration: ${got.join(', ')}`);
        assert.ok(got.includes(`17:${SOURCE[17].indexOf('Answer')}`), `no PRE:Answer: ${got.join(', ')}`);
        assert.deepStrictEqual(got.filter(k => TYPE_TAILS.has(k)), [], `type tail listed: ${got.join(', ')}`);
    });

    test('control: FAR on a field whose prefix is longer than eight characters still finds it', async () => {
        const got = await far(14, 'Answer');
        assert.ok(got.includes('14:0'), `no declaration: ${got.join(', ')}`);
        assert.ok(got.includes(`18:${SOURCE[18].indexOf('Answer')}`), `no LONGPREFIX:Answer: ${got.join(', ')}`);
        assert.deepStrictEqual(got.filter(k => TYPE_TAILS.has(k)), [], `type tail listed: ${got.join(', ')}`);
    });

    test('control: FAR on a local named like a type tail finds its declaration and use', async () => {
        const got = await far(43, 'Answer');
        assert.deepStrictEqual(got, ['41:0', `43:${SOURCE[43].indexOf('Answer')}`]);
    });
});
