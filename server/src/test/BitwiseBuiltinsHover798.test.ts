import * as assert from 'assert';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Position } from 'vscode-languageserver-protocol';
import { HoverProvider } from '../providers/HoverProvider';
import { SignatureHelpProvider } from '../providers/SignatureHelpProvider';
import { TokenCache } from '../TokenCache';
import { KeywordService } from '../utils/KeywordService';
import { BuiltinFunctionService } from '../utils/BuiltinFunctionService';
import * as keywordsData from '../data/clarion-keywords.json';
import * as builtinsData from '../data/clarion-builtins.json';

/**
 * #798 — BAND, BOR, BXOR and BSHIFT are built-in functions in the Language
 * Reference (13 - Built-in Functions): BAND(value,mask), BOR(value,mask),
 * BXOR(value,mask), BSHIFT(value,count). clarion-keywords.json also listed them
 * as "Operator" keywords (`expr1 BAND expr2`), and the keyword handler runs
 * ahead of the built-in handler in the hover router, so the wrong card won.
 */

const LINES = [
    'MyProc PROCEDURE()',
    'r LONG',
    'x LONG',
    '  CODE',
    '  r = BAND(x, 0FFh)',
    '  r = BOR(x, 1)',
    '  r = BXOR(x, 2)',
    '  r = BSHIFT(x, 4)',
    '  RETURN',
];

let counter = 0;

function newDoc(): TextDocument {
    const doc = TextDocument.create(`file:///C:/temp/bitwise798-${++counter}.clw`, 'clarion', 1, LINES.join('\r\n'));
    TokenCache.getInstance().getTokens(doc);
    return doc;
}

function hoverText(hover: any): string {
    if (!hover) return '';
    return typeof hover.contents === 'string'
        ? hover.contents
        : 'value' in hover.contents ? hover.contents.value : '';
}

const CASES: { name: string; params: [string, string] }[] = [
    { name: 'BAND', params: ['value', 'mask'] },
    { name: 'BOR', params: ['value', 'mask'] },
    { name: 'BXOR', params: ['value', 'mask'] },
    { name: 'BSHIFT', params: ['value', 'count'] },
];

suite('Bitwise built-ins hover as built-in functions (#798)', () => {
    for (const { name, params } of CASES) {
        test(`${name} hovers as a built-in function, not an operator`, async () => {
            const doc = newDoc();
            const line = LINES.findIndex(l => l.includes(`${name}(`));
            const hover = await new HoverProvider().provideHover(doc, Position.create(line, LINES[line].indexOf(name) + 1));
            const content = hoverText(hover);
            assert.ok(content.includes(`Built-in Function: ${name}`), `expected the built-in card, got: ${content}`);
            assert.ok(!/operator/i.test(content), `card still calls ${name} an operator: ${content}`);
            assert.ok(!content.includes(`expr1 ${name} expr2`), `card shows the infix syntax: ${content}`);
            assert.ok(content.includes(params[0]) && content.includes(params[1]),
                `card should name the ${params.join(', ')} parameters: ${content}`);
        });

        test(`signature help after ${name}( shows ${name}(${params.join(', ')})`, async () => {
            const doc = newDoc();
            const line = LINES.findIndex(l => l.includes(`${name}(`));
            const character = LINES[line].indexOf(`${name}(`) + name.length + 1;
            const help = await new SignatureHelpProvider().provideSignatureHelp(doc, { line, character });
            const sig = help?.signatures?.[help.activeSignature ?? 0];
            assert.ok(sig, `no signature for ${name}(`);
            assert.ok(new RegExp(`^${name}\\(${params[0]},\\s*${params[1]}`, 'i').test(sig!.label), sig!.label);
        });
    }

    test('no name is both a language keyword and a built-in function', () => {
        const keywords = (keywordsData as unknown as { keywords: { name: string }[] }).keywords;
        const builtins = BuiltinFunctionService.getInstance();
        const both = keywords.map(k => k.name).filter(n => builtins.isBuiltin(n));
        assert.deepStrictEqual(both, [],
            `the keyword card shadows the built-in card for: ${both.join(', ')}`);
        // Sanity: the built-ins really are there, and the keyword service no longer claims them.
        const data = builtinsData as unknown as { functions: { name: string }[] };
        for (const { name } of CASES) {
            assert.ok(data.functions.some(f => f.name.toUpperCase() === name), `${name} missing from clarion-builtins.json`);
            assert.strictEqual(KeywordService.getInstance().isKeyword(name), false, `${name} is still a keyword`);
        }
    });
});
