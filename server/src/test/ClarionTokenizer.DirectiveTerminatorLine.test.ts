import * as assert from 'assert';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { ClarionTokenizer, Token } from '../ClarionTokenizer';
import { TokenType } from '../tokenizer/TokenTypes';
import { TokenCache } from '../TokenCache';
import { globalScopeIndex } from '../utils/GlobalScopeIndex';

/**
 * The terminator line of an OMIT/COMPILE block was tokenized as code. With a terminator that
 * starts with END and a non-word character — `COMPILE('END***',_WIDTH32_)` ... `END***`, as a
 * vendor's prototype block in a MAP's MODULE has it — the line matched EndStatement and closed
 * the MODULE a line early. The MODULE's own END then closed the MAP, and everything after it
 * was misread: a column-0 prototype still inside the MAP (`DebugInfo PROCEDURE()`) became a
 * PROCEDURE, global scope ended there, and every global declared after the MAP was invisible
 * to hover and go-to-definition.
 *
 * Compiler-verified (Clarion 12, MSBuild): the `END***` program below builds, so `END***` does
 * not close the MODULE (the same program with a plain END in its place fails); and a block
 * closed by `END XYZ` with terminator 'XYZ' builds too, so the rest of a terminator line IS read
 * — only the terminator text is not. The tokenizer now blanks just that text.
 */
const tokenize = (lines: string[]): Token[] => new ClarionTokenizer(lines.join('\r\n')).tokenize();

const program = (directive: string, terminatorLine: string) => [
    '  PROGRAM',                                     // 0
    '  MAP',                                         // 1
    "    MODULE('ZIPX')",                            // 2
    '      ZipVer(),LONG,RAW,PASCAL',                // 3
    `      ${directive}`,                            // 4
    '      ZipMem(),LONG,RAW,PASCAL',                // 5
    `      ${terminatorLine}`,                       // 6
    '    END',                                       // 7
    "    MODULE('OTHER')",                           // 8
    '      OtherProc()',                             // 9
    '    END',                                       // 10
    'DebugInfo PROCEDURE()',                         // 11
    '  END',                                         // 12
    'GlobalCount LONG',                              // 13
    '  CODE',                                        // 14
    '  GlobalCount = 1',                             // 15
];

const structureAt = (tokens: Token[], line: number, value: RegExp) =>
    tokens.find(t => t.line === line && value.test(t.value) && t.finishesAt !== undefined);

suite('The terminator line of an OMIT/COMPILE block is not an END statement', () => {
    for (const [directive, terminator] of [["COMPILE('END***',_WIDTH32_)", 'END***'], ["OMIT('END-OMIT')", 'END-OMIT']]) {
        test(`${terminator}: the MODULE and MAP close at their own ENDs, and the globals after the MAP stay global`, () => {
            const tokens = tokenize(program(directive, terminator));
            assert.deepStrictEqual(tokens.filter(t => t.type === TokenType.EndStatement).map(t => t.line), [7, 10, 12]);
            assert.strictEqual(structureAt(tokens, 2, /^module$/i)?.finishesAt, 7, 'MODULE');
            assert.strictEqual(structureAt(tokens, 1, /^map$/i)?.finishesAt, 12, 'MAP');
            const onDebugInfo = tokens.filter(t => t.line === 11).map(t => t.subType);
            assert.ok(onDebugInfo.includes(TokenType.MapProcedure), 'DebugInfo is a prototype inside the MAP');
            assert.ok(!onDebugInfo.some(s => s === TokenType.Procedure || s === TokenType.GlobalProcedure), 'not a PROCEDURE');
            assert.ok(globalScopeIndex(tokens).plainLabels.has('globalcount'), 'GlobalCount is a global');
        });
    }

    test('guard: code on a terminator line is still read — `END  !***` closes the MODULE (compiler-verified)', () => {
        const tokens = tokenize(program("COMPILE('***',_WIDTH32_)", 'END  !***').filter((_, i) => i !== 7));
        assert.deepStrictEqual(tokens.filter(t => t.type === TokenType.EndStatement).map(t => t.line), [6, 9, 11]);
        assert.strictEqual(structureAt(tokens, 2, /^module$/i)?.finishesAt, 6, 'MODULE');
        assert.strictEqual(structureAt(tokens, 1, /^map$/i)?.finishesAt, 11, 'MAP');
    });

    test('guard: with an ordinary terminator, a plain END after the block still closes', () => {
        const tokens = tokenize(program("COMPILE('***',_WIDTH32_)", '***'));
        assert.deepStrictEqual(tokens.filter(t => t.type === TokenType.EndStatement).map(t => t.line), [7, 10, 12]);
        assert.strictEqual(structureAt(tokens, 1, /^map$/i)?.finishesAt, 12, 'MAP');
    });

    test('guard: the terminator text inside a string literal does not end the block', () => {
        const lines = program("COMPILE('END***',_WIDTH32_)", 'END***');
        lines.splice(5, 0, "      Note('END***'),RAW");   // before the real terminator
        const tokens = tokenize(lines);
        assert.deepStrictEqual(tokens.filter(t => t.type === TokenType.EndStatement).map(t => t.line), [8, 11, 13]);
    });

    test('an edit beside the terminator line re-tokenizes to what a full tokenize gives', () => {
        const cache = TokenCache.getInstance();
        const uri = 'file:///c%3A/term/m.clw';
        cache.clearTokens(uri);
        let doc = TextDocument.create(uri, 'clarion', 1, program("COMPILE('END***',_WIDTH32_)", 'END***').join('\r\n'));
        cache.getTokens(doc);
        doc = TextDocument.update(doc, [{ range: { start: { line: 6, character: 6 }, end: { line: 6, character: 12 } }, text: 'END***  ' }], 2);
        const inc = cache.getTokens(doc);
        const full = new ClarionTokenizer(doc.getText()).tokenize();
        const sig = (ts: Token[]) => ts.map(t => `${t.line}:${t.start}:${t.type}:${t.subType}:${t.value}:${t.finishesAt}`);
        assert.deepStrictEqual(sig(inc), sig(full));
        assert.deepStrictEqual(inc.filter(t => t.type === TokenType.EndStatement).map(t => t.line), [7, 10, 12]);
        cache.clearTokens(uri);
    });
});
