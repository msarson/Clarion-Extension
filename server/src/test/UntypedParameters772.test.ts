import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { ClarionTokenizer } from '../ClarionTokenizer';
import { TokenType } from '../tokenizer/TokenTypes';
import { ClarionDocumentSymbolProvider, ClarionDocumentSymbol } from '../providers/ClarionDocumentSymbolProvider';
import { HoverProvider } from '../providers/HoverProvider';
import { setServerInitialized } from '../serverState';

/**
 * #772 — `*?` (an untyped variable-parameter, passed by address) and `?` (an untyped value-parameter)
 * are different types (Prototype Parameter Lists help topic). The tokenizer dropped the `*` of `*?`,
 * so the outline showed `memcpy (? , ? , UNSIGNED ), ?`, and neither had a hover card.
 */
suite('Untyped parameters ? and *? (#772)', () => {
    const MAP_CODE = [
        "  MEMBER()",
        "  MAP",
        "    MODULE('')",
        "      memcpy (*?, *?, UNSIGNED),*?,PROC,RAW,NAME('_memcpy')",
        "      maxOf (?, ?),?",
        "    END",
        "  END",
        ""].join('\n');

    let dir = '';
    setup(() => {
        setServerInitialized(true);
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'untyped772-'));
    });
    teardown(() => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ } });

    function lineTokens(code: string, line: number) {
        return new ClarionTokenizer(code).tokenize().filter(t => t.line === line);
    }

    async function hoverAt(code: string, line: number, character: number): Promise<string> {
        const file = path.join(dir, 'u772.clw');
        fs.writeFileSync(file, code);
        const uri = 'file:///' + file.replace(/\\/g, '/').replace(/^([a-zA-Z]):/, (_m, d) => d + '%3A');
        const h = await new HoverProvider().provideHover(TextDocument.create(uri, 'clarion', 1, code), { line, character });
        const c = h?.contents as { value?: string } | undefined;
        return c?.value ?? '';
    }

    test('*? is one token, star included', () => {
        const stars = lineTokens(MAP_CODE, 3).filter(t => t.value.includes('?'));
        assert.deepStrictEqual(stars.map(t => [t.value, t.type]), [
            ['*?', TokenType.PointerParameter], ['*?', TokenType.PointerParameter], ['*?', TokenType.PointerParameter]]);
    });

    test('the outline keeps the star', () => {
        const symbols = new ClarionDocumentSymbolProvider().provideDocumentSymbols(new ClarionTokenizer(MAP_CODE).tokenize(), 'test://u772.clw');
        const all: ClarionDocumentSymbol[] = [];
        const walk = (s: ClarionDocumentSymbol[]) => s.forEach(x => { all.push(x); walk(x.children ?? []); });
        walk(symbols);
        const memcpy = all.find(s => s.name === 'memcpy');
        assert.ok(memcpy, 'memcpy in the outline');
        assert.ok(/^\(\*\?\s*,\s*\*\?\s*,\s*UNSIGNED\s*\)\s*,\s*\*\?/.test(memcpy!.detail ?? ''), memcpy!.detail);
    });

    test('hover on ? describes an untyped value-parameter', async () => {
        const line = MAP_CODE.split('\n')[4];
        const card = await hoverAt(MAP_CODE, 4, line.indexOf('?'));
        assert.ok(/untyped value-parameter/i.test(card), card || '(no hover)');
        assert.ok(/by value/i.test(card), card);
    });

    test('hover on *? describes an untyped variable-parameter', async () => {
        const line = MAP_CODE.split('\n')[3];
        const card = await hoverAt(MAP_CODE, 3, line.indexOf('*?') + 1);
        assert.ok(/untyped variable-parameter/i.test(card), card || '(no hover)');
        assert.ok(/by address/i.test(card), card);
    });

    test('the ? of USE(?) (an unnamed control) gets no untyped-parameter card', async () => {
        const code = ["  PROGRAM", "Win WINDOW('x'),AT(,,100,100)", "      BUTTON('OK'),AT(5,5),USE(?)", "    END", "  CODE", ""].join('\n');
        const line = code.split('\n')[2];
        const card = await hoverAt(code, 2, line.indexOf('?)'));
        assert.ok(!/untyped/i.test(card), card);
    });

    test('regression: ?Field is still a field equate, and a bare ? is unchanged', () => {
        const code = ["  PROGRAM", "  CODE", "  DISPLAY(?OkButton)", "  x = a * ?OkButton", ""].join('\n');
        const toks = new ClarionTokenizer(code).tokenize();
        assert.ok(toks.some(t => t.value === '?OkButton' && t.type === TokenType.FieldEquateLabel && t.line === 2));
        assert.ok(toks.some(t => t.value === '?OkButton' && t.type === TokenType.FieldEquateLabel && t.line === 3),
            JSON.stringify(toks.filter(t => t.line === 3).map(t => [t.value, t.type])));
        assert.strictEqual(lineTokens(MAP_CODE, 4).filter(t => t.value === '?').length, 3);
    });
});
