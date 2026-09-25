import * as assert from 'assert';
import { ClarionTokenizer, TokenType, Token } from '../ClarionTokenizer';

/**
 * #660 — a cold start froze the server for ~2.6s tokenizing one 125 KB class header. Its method
 * prototypes pad an empty parameter list with ~490 spaces (`Name  PROCEDURE(<spaces>),LONG`), and
 * the continuation strip in joinedDeclarationLine used /\s*&?\s*\|\s*$/: unanchored, with two
 * adjacent \s*, it tried every split of the space run at every start position — cubic in the run
 * (960 spaces: ~80ms for ONE line). The strip is now a linear trim with the same result.
 */
function tokenize(source: string): Token[] {
    return new ClarionTokenizer(source).tokenize();
}

function method(tokens: Token[], label: string): Token | undefined {
    return tokens.find(t => t.label?.toUpperCase() === label.toUpperCase() &&
        (t.subType === TokenType.MethodDeclaration || t.subType === TokenType.MapProcedure || t.subType === TokenType.GlobalProcedure));
}

suite('Tokenizer: a parameter list padded with spaces (#660)', () => {
    test('bug-pin: a prototype with 3,000 spaces of padding tokenizes in linear time', () => {
        const source = `MyClass  CLASS,TYPE\nMyMethod  PROCEDURE(${' '.repeat(3000)}),LONG\n  END\n`;
        const t0 = Date.now();
        tokenize(source);
        const ms = Date.now() - t0;
        assert.ok(ms < 250, `took ${ms}ms (cubic before the fix: several seconds)`);
    });

    test('bug-pin: 100 such prototypes in one header stay well under a second', () => {
        const body = Array.from({ length: 100 }, (_, i) => `Method${i}  PROCEDURE(${' '.repeat(490)}),LONG,PROC,VIRTUAL`).join('\n');
        const t0 = Date.now();
        tokenize(`MyClass  CLASS,TYPE\n${body}\n  END\n`);
        const ms = Date.now() - t0;
        assert.ok(ms < 500, `took ${ms}ms (~1s before the fix)`);
    });

    test('the padded empty list still reads as no parameters', () => {
        const tokens = tokenize(`MyClass  CLASS,TYPE\nMyMethod  PROCEDURE(${' '.repeat(300)}),LONG\n  END\n`);
        const m = method(tokens, 'MyMethod');
        assert.ok(m, 'method token present');
        assert.deepStrictEqual(m!.parameters, []);
    });

    test('a | continuation still joins the next line', () => {
        const tokens = tokenize(`MyClass  CLASS,TYPE\nMyMethod  PROCEDURE(LONG pA,   |\n                    STRING pB),LONG\n  END\n`);
        const m = method(tokens, 'MyMethod');
        assert.deepStrictEqual(m!.parameters!.map(p => `${p.type} ${p.name}`), ['LONG pA', 'STRING pB']);
    });

    test('an &| continuation still joins the next line', () => {
        const tokens = tokenize(`MyClass  CLASS,TYPE\nMyMethod  PROCEDURE(LONG pA, &  |  \n                    STRING pB),LONG\n  END\n`);
        const m = method(tokens, 'MyMethod');
        assert.deepStrictEqual(m!.parameters!.map(p => `${p.type} ${p.name}`), ['LONG pA', 'STRING pB']);
    });

    test('a continuation followed by a comment still joins the next line', () => {
        const tokens = tokenize(`MyClass  CLASS,TYPE\nMyMethod  PROCEDURE(LONG pA, | ! first\n                    STRING pB),LONG\n  END\n`);
        const m = method(tokens, 'MyMethod');
        assert.deepStrictEqual(m!.parameters!.map(p => `${p.type} ${p.name}`), ['LONG pA', 'STRING pB']);
    });
});
