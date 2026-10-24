import * as assert from 'assert';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Position } from 'vscode-languageserver-protocol';
import { HoverProvider } from '../providers/HoverProvider';
import { TokenCache } from '../TokenCache';
import { BuiltinFunctionService } from '../utils/BuiltinFunctionService';

/**
 * #784 — a built-in written without parentheses was captioned "Built-in constant". That card was
 * meant for NULL, which is both `NULL(field)` and a bare value; but Clarion calls any built-in that
 * needs no arguments without parentheses, so YIELD (a statement) and TODAY (a function) got it too.
 * A bare built-in that can be called with no arguments now gets its normal card: "Built-in
 * statement" when it returns nothing, "Built-in Function" when it returns a value. NULL, which
 * needs arguments when called, keeps the value card.
 */
suite('A bare built-in that needs no arguments hovers as what it is (#784)', () => {
    const code = [
        'MyProc PROCEDURE()',
        'd LONG',
        'p &LONG',
        '  CODE',
        '  YIELD',
        '  COMMIT',
        '  d = TODAY',
        '  d = TODAY()',
        '  IF ERRORCODE THEN HALT.',
        '  p &= NULL',
        '  HALT(1)',
        '  RETURN',
    ].join('\n');

    /** Hover over `word` on line `line` of `code` (0-based, as the array above reads). */
    async function hoverAt(line: number, word: string): Promise<string> {
        const tokenCache = TokenCache.getInstance();
        tokenCache.clearAllTokens();
        const doc = TextDocument.create('test://bare784.clw', 'clarion', 1, code);
        tokenCache.getTokens(doc);
        const lineText = code.split('\n')[line];
        const hover = await new HoverProvider().provideHover(doc, Position.create(line, lineText.indexOf(word) + 1));
        tokenCache.clearAllTokens();
        assert.ok(hover, `${word} should produce a hover`);
        const c = hover!.contents as { value?: string } | string;
        return typeof c === 'string' ? c : c.value ?? '';
    }

    test('YIELD is a built-in statement, not a constant', async () => {
        const text = await hoverAt(4, 'YIELD');
        assert.ok(!/constant/i.test(text), `YIELD called a constant:\n${text}`);
        assert.ok(/Built-in statement/i.test(text), `YIELD not captioned as a statement:\n${text}`);
        assert.ok(/cooperative multitasking/i.test(text), 'YIELD keeps its description');
    });

    test('COMMIT and a bare HALT are statements', async () => {
        assert.ok(/Built-in statement/i.test(await hoverAt(5, 'COMMIT')), 'COMMIT');
        assert.ok(/Built-in statement/i.test(await hoverAt(8, 'HALT')), 'HALT (its parameters are optional)');
    });

    test('a value-returning built-in written bare is a function, as with parentheses', async () => {
        for (const [line, word] of [[6, 'TODAY'], [7, 'TODAY'], [8, 'ERRORCODE']] as [number, string][]) {
            const text = await hoverAt(line, word);
            assert.ok(!/constant/i.test(text), `${word} called a constant:\n${text}`);
            assert.ok(/Built-in Function/i.test(text), `${word} on line ${line} is not captioned a function:\n${text}`);
        }
    });

    test('NULL, which needs arguments when called, keeps the value card', async () => {
        assert.ok(/Built-in constant/i.test(await hoverAt(9, 'NULL')), 'bare NULL');
    });

    test('the data\'s three ways of saying "returns nothing" all read as a statement', () => {
        const service = BuiltinFunctionService.getInstance();
        // YIELD has no return type, COMMIT says VOID, SETPENCOLOR says none.
        for (const name of ['YIELD', 'COMMIT', 'SETPENCOLOR']) {
            assert.strictEqual(service.returnsValue(name), false, `${name} returns nothing`);
        }
        assert.strictEqual(service.returnsValue('TODAY'), true, 'TODAY returns a LONG');
    });

    test('a parameter is optional by its label only where every mention of it is bracketed', () => {
        // INLIST( searchstring, liststring, liststring [, liststring... ] ): the first liststring is required.
        const service = BuiltinFunctionService.getInstance();
        assert.ok(!service.canCallWithoutArguments('INLIST'), 'INLIST needs its arguments');
        assert.ok(!/\[liststring\]/.test(service.getSignatures('INLIST')[0].label), service.getSignatures('INLIST')[0].label);
        // HALT( [ errorlevel ] [, message ] ): both optional, so HALT may be written bare.
        assert.ok(service.canCallWithoutArguments('HALT'), 'HALT can be called without arguments');
    });

    test('called with parentheses, a statement keeps its caption', async () => {
        // The caption names what the built-in is, however it is written (the card for `HALT(1)`).
        const text = await hoverAt(10, 'HALT');
        assert.ok(/Built-in statement/i.test(text), text);
    });

    test('DATE is the function DATE(month, day, year), not a value written bare', () => {
        // Its entry described the DATE data type with no parameters (help: DATE (return standard date)).
        const service = BuiltinFunctionService.getInstance();
        assert.strictEqual(service.canCallWithoutArguments('DATE'), false);
        assert.ok(/DATE\(month, day, year\)/.test(service.getSignatures('DATE')[0].label), service.getSignatures('DATE')[0].label);
    });
});
