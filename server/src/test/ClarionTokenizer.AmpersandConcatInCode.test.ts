import * as assert from 'assert';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Location, Position } from 'vscode-languageserver-protocol';
import { ClarionTokenizer, Token, TokenType } from '../ClarionTokenizer';
import { ReferencesProvider } from '../providers/ReferencesProvider';
import { DocumentHighlightProvider } from '../providers/DocumentHighlightProvider';
import { TokenCache } from '../TokenCache';
import { setServerInitialized } from '../serverState';

/**
 * In executable code `&` is string concatenation, so in `MESSAGE('Rows: ' & Num)` the name
 * after it is an ordinary use of `Num`. The ReferenceVariable pattern /&\s*Name/ matched there
 * too, so the operator, the space and the name became ONE token, `& Num`:
 *   - Find All References compares that token with `'&' + word`, so it found `&Num` but not
 *     `& Num`, the usual way to write it;
 *   - `& Tally.Rows` became `& Tally` + `Rows`, so the `Tally.Rows` field access was lost.
 *
 * In a declaration `&` makes a reference, and a space after it is legal: Clarion 11.1 compiles
 * `Ref & LONG`, `Ref &   LONG` and `Ref & SomeGroupType`. So the pattern keeps its `\s*` and is
 * only skipped in a CODE section.
 */

const SOURCE = [
    '  PROGRAM',                                  // 0
    '  MAP',                                      // 1
    'TakesRef     PROCEDURE(&LONG pX)',           // 2
    'TakesRefSp   PROCEDURE(& LONG pX)',          // 3
    'Worker       PROCEDURE()',                   // 4
    '  END',                                      // 5
    'GlobRef      & LONG',                        // 6
    'GlobRefNo    &LONG',                         // 7
    '  CODE',                                     // 8
    '',                                           // 9
    'Worker       PROCEDURE()',                   // 10
    'Num            LONG',                        // 11
    'Tally          GROUP',                       // 12
    'Rows             LONG',                      // 13
    '               END',                         // 14
    'LocRef         & LONG',                      // 15
    '  CODE',                                     // 16
    '  Num += 1',                                 // 17
    "  MESSAGE('Rows: ' & Num)",                  // 18
    "  MESSAGE('Rows: ' &Num)",                   // 19
    "  MESSAGE('Rows: ' & Num & ' rows')",        // 20
    "  MESSAGE('Rows: ' & Tally.Rows)",           // 21
    '  LocRef &= Num',                            // 22
    "  MESSAGE('Rows: ' & |",                     // 23
    '          Num)',                             // 24
    '  DO WithData',                              // 25
    '  DO NoData',                                // 26
    '',                                           // 27
    'WithData     ROUTINE',                       // 28
    '  DATA',                                     // 29
    'RtnRef  & LONG',                             // 30
    '  CODE',                                     // 31
    "  MESSAGE('Rows: ' & Num)",                  // 32
    '',                                           // 33
    'NoData       ROUTINE',                       // 34
    "  MESSAGE('Rows: ' & Num)",                  // 35
    '',                                           // 36
    'TakesRef     PROCEDURE(&LONG pX)',           // 37
    '  CODE',                                     // 38
    "  MESSAGE('Value: ' & pX)",                  // 39
];

function tokensOn(line: number): Token[] {
    return new ClarionTokenizer(SOURCE.join('\r\n')).tokenize().filter(t => t.line === line);
}

function shape(tokens: Token[]): string[] {
    return tokens.map(t => `${TokenType[t.type]} ${t.value}@${t.start}`);
}

let counter = 0;
function makeDoc(): TextDocument {
    const doc = TextDocument.create(`file:///C:/temp/ampersandconcat-${++counter}.clw`, 'clarion', 1, SOURCE.join('\r\n'));
    TokenCache.getInstance().getTokens(doc);
    return doc;
}

function keys(refs: Location[] | null | undefined): string[] {
    return (refs ?? []).map(l => `${l.range.start.line}:${l.range.start.character}`).sort();
}

/** `line:column` of the LAST occurrence of `word` on `line`. */
function at(line: number, word: string): string {
    const idx = SOURCE[line].lastIndexOf(word);
    if (idx < 0) throw new Error(`fixture: '${word}' not on line ${line}`);
    return `${line}:${idx}`;
}

async function far(line: number, word: string): Promise<string[]> {
    const idx = SOURCE[line].lastIndexOf(word);
    const refs = await new ReferencesProvider().provideReferences(
        makeDoc(), Position.create(line, idx + 1), { includeDeclaration: true });
    return keys(refs);
}

suite('`&` in executable code is concatenation, not a reference declaration', () => {

    suite('tokens', () => {
        const CODE_LINES: Array<[string, number]> = [
            ['`& Num`', 18],
            ['`&Num`', 19],
            ['`& Num` in a ROUTINE after its DATA section', 32],
            ['`& Num` in a ROUTINE without a DATA section', 35],
            ['`& pX` in a procedure whose header takes a reference', 39],
        ];
        for (const [what, line] of CODE_LINES) {
            test(`${what} gives no ReferenceVariable token, and the name is a Variable`, () => {
                const toks = tokensOn(line);
                const name = SOURCE[line].trim().match(/&\s*(\w+)\)/)![1];
                assert.deepStrictEqual(toks.filter(t => t.type === TokenType.ReferenceVariable), [],
                    `line ${line}: ${shape(toks).join(' | ')}`);
                assert.ok(toks.some(t => t.type === TokenType.Variable && t.value === name
                    && t.start === SOURCE[line].lastIndexOf(name)), `line ${line}: ${shape(toks).join(' | ')}`);
            });
        }

        test('`& Num & \' rows\'` gives Num a Variable token', () => {
            const toks = tokensOn(20);
            assert.deepStrictEqual(toks.filter(t => t.type === TokenType.ReferenceVariable), [], shape(toks).join(' | '));
            assert.ok(toks.some(t => t.type === TokenType.Variable && t.value === 'Num'), shape(toks).join(' | '));
        });

        test('`& Tally.Rows` keeps the field access as one StructureField token', () => {
            const toks = tokensOn(21);
            assert.deepStrictEqual(toks.filter(t => t.type === TokenType.ReferenceVariable), [], shape(toks).join(' | '));
            assert.ok(toks.some(t => t.type === TokenType.StructureField && t.value === 'Tally.Rows'
                && t.start === SOURCE[21].indexOf('Tally')), shape(toks).join(' | '));
        });

        // Controls: declarations keep their ReferenceVariable token, with or without a space.
        const DECLARATIONS: Array<[string, number, string]> = [
            ['MAP prototype parameter `&LONG`', 2, '&LONG'],
            ['MAP prototype parameter `& LONG`', 3, '& LONG'],
            ['global `& LONG`', 6, '& LONG'],
            ['global `&LONG`', 7, '&LONG'],
            ['procedure-local `& LONG`', 15, '& LONG'],
            ['ROUTINE DATA `& LONG`', 30, '& LONG'],
            ['procedure header parameter `&LONG` after CODE', 37, '&LONG'],
        ];
        for (const [what, line, value] of DECLARATIONS) {
            test(`control: ${what} is still a ReferenceVariable`, () => {
                const toks = tokensOn(line);
                assert.ok(toks.some(t => t.type === TokenType.ReferenceVariable && t.value === value),
                    `line ${line}: ${shape(toks).join(' | ')}`);
            });
        }

        test('control: `& |` at a line end is still a LineContinuation', () => {
            const toks = tokensOn(23);
            assert.ok(toks.some(t => t.type === TokenType.LineContinuation), shape(toks).join(' | '));
        });
    });

    suite('Find All References', () => {
        setup(() => setServerInitialized(true));

        test('FAR on a local finds it after `&` with and without a space', async () => {
            const got = await far(11, 'Num');
            for (const line of [17, 18, 19, 20, 22, 24, 32, 35]) {
                assert.ok(got.includes(at(line, 'Num')), `line ${line} missing: ${got.join(', ')}`);
            }
            assert.ok(got.includes('11:0'), `no declaration: ${got.join(', ')}`);
        });

        test('FAR on a GROUP label finds `& Tally.Rows`', async () => {
            const got = await far(12, 'Tally');
            assert.ok(got.includes(`21:${SOURCE[21].indexOf('Tally')}`), `line 21 missing: ${got.join(', ')}`);
        });
    });

    // Document highlight matched `&Tally` as a ReferenceVariable token. In code that is now
    // `Tally.Rows`, a StructureField, so the provider must read the receiver of a StructureField.
    suite('Document highlight', () => {
        const HL = [
            '  PROGRAM',                                  // 0
            '  CODE',                                     // 1
            '',                                           // 2
            'Worker       PROCEDURE()',                   // 3
            'Num            LONG',                        // 4
            'Tally          GROUP',                       // 5
            'Rows             LONG',                      // 6
            '               END',                         // 7
            'Other          GROUP',                       // 8
            'Rows             LONG',                      // 9
            '               END',                         // 10
            '  CODE',                                     // 11
            '  Tally.Rows += 1',                          // 12
            "  MESSAGE('Rows: ' & Tally.Rows)",           // 13
            "  MESSAGE('Rows: ' &Tally.Rows& ' rows')",   // 14
            "  MESSAGE('Rows: ' &tally.rows)",            // 15
            '  Other.Rows = TALLY.ROWS',                  // 16
            "  MESSAGE('Rows: ' & Num)",                  // 17
        ];

        function highlights(line: number, word: string): string[] {
            const doc = TextDocument.create(`file:///C:/temp/ampersandhl-${++counter}.clw`, 'clarion', 1, HL.join('\r\n'));
            TokenCache.getInstance().getTokens(doc);
            const pos = Position.create(line, HL[line].indexOf(word) + 1);
            return (new DocumentHighlightProvider().provideDocumentHighlights(doc, pos) ?? [])
                .map(h => `${h.range.start.line}:${h.range.start.character}-${h.range.end.character}`).sort();
        }
        const span = (line: number, word: string, from = 0): string => {
            const idx = HL[line].toUpperCase().indexOf(word.toUpperCase(), from);
            return `${line}:${idx}-${idx + word.length}`;
        };

        test('a GROUP label is highlighted as the receiver of Group.Field, with or without `&`, any case', () => {
            const got = highlights(5, 'Tally');
            const want = [span(5, 'Tally'), span(12, 'Tally'), span(13, 'Tally'), span(14, 'Tally'),
                span(15, 'Tally'), span(16, 'TALLY')].sort();
            assert.deepStrictEqual(got, want);
        });

        test('control: another GROUP with a same-named field is not highlighted', () => {
            const got = highlights(8, 'Other');
            assert.deepStrictEqual(got, [span(8, 'Other'), span(16, 'Other')].sort());
        });

        test('a plain local after `& ` is highlighted', () => {
            const got = highlights(4, 'Num');
            assert.deepStrictEqual(got, [span(4, 'Num'), span(17, 'Num')].sort());
        });
    });
});
