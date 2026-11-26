/**
 * #881 — a procedure is overloaded: several prototypes share one label and differ in
 * their parameters. Hovering a call showed the first prototype, whatever the call's
 * arguments were. The card should show the prototype the call's arguments pick, and,
 * when they cannot pick one, every prototype rather than a guess.
 */

import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Position } from 'vscode-languageserver-protocol';
import { HoverProvider } from '../providers/HoverProvider';
import { TokenCache } from '../TokenCache';
import { SolutionManager } from '../solution/solutionManager';
import { StructureDeclarationIndexer } from '../utils/StructureDeclarationIndexer';

const ONE = 'Fmt                 PROCEDURE(LONG pValue),STRING';
const TWO = 'Fmt                 PROCEDURE(STRING pText, LONG pWidth),STRING';

function hoverText(h: unknown): string {
    const c = (h as { contents: unknown } | null)?.contents;
    return typeof c === 'string' ? c : ((c as { value?: string })?.value ?? '');
}

function toUri(fsPath: string): string {
    return 'file:///' + fsPath.replace(/\\/g, '/').replace(/^([a-zA-Z]):/, (_m, d) => d + '%3A');
}

function at(source: string, needle: string, offset = 0): Position {
    const lines = source.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
        const idx = lines[i].indexOf(needle);
        if (idx !== -1) return { line: i, character: idx + offset };
    }
    throw new Error(`'${needle}' not found`);
}

async function hover(uri: string, text: string, pos: Position): Promise<string> {
    const cache = TokenCache.getInstance();
    cache.clearAllTokens();
    const doc = TextDocument.create(uri, 'clarion', 1, text);
    cache.getTokens(doc);
    const h = await new HoverProvider().provideHover(doc, pos);
    assert.ok(h, `expected a hover at ${pos.line}:${pos.character}`);
    return hoverText(h);
}

suite('Hover on a call to an overloaded procedure (#881)', () => {
    let dir: string;
    let savedSm: unknown;

    setup(() => {
        savedSm = (SolutionManager as unknown as { instance: unknown }).instance;
        (SolutionManager as unknown as { instance: unknown }).instance = null;
        StructureDeclarationIndexer.getInstance().clearCache();
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ce881-'));
        fs.writeFileSync(path.join(dir, 'fmt.clw'), [
            "  MEMBER('main')",
            'Fmt                 PROCEDURE(LONG pValue)',
            '  CODE',
            "  RETURN ''",
            'Fmt                 PROCEDURE(STRING pText, LONG pWidth)',
            '  CODE',
            "  RETURN ''",
        ].join('\r\n'));
    });
    teardown(() => {
        fs.rmSync(dir, { recursive: true, force: true });
        (SolutionManager as unknown as { instance: unknown }).instance = savedSm;
        StructureDeclarationIndexer.getInstance().clearCache();
    });

    function mainWith(mapBody: string[]): string {
        return [
            '  PROGRAM',
            '  MAP',
            ...mapBody,
            '  END',
            'S                   STRING(40)',
            '  CODE',
            "  S = Fmt('abc', 10)",
            '  S = Fmt(5)',
            '  S = Fmt(Mystery)',
        ].join('\r\n');
    }

    test('a MAP in the same file: the two-argument call shows the two-parameter prototype', async () => {
        const src = mainWith(["    MODULE('fmt.clw')", '  ' + ONE, '  ' + TWO, '    END']);
        const mainPath = path.join(dir, 'main.clw');
        fs.writeFileSync(mainPath, src);
        const text = await hover(toUri(mainPath), src, at(src, "Fmt('abc'", 1));
        assert.ok(text.includes('STRING pText, LONG pWidth'), `got: ${text}`);
    });

    test('a MAP in the same file: the one-argument call shows the one-parameter prototype', async () => {
        const src = mainWith(["    MODULE('fmt.clw')", '  ' + ONE, '  ' + TWO, '    END']);
        const mainPath = path.join(dir, 'main.clw');
        fs.writeFileSync(mainPath, src);
        const text = await hover(toUri(mainPath), src, at(src, 'Fmt(5)', 1));
        assert.ok(text.includes('LONG pValue'), `got: ${text}`);
        assert.ok(!text.includes('STRING pText, LONG pWidth') || /overload/i.test(text), `not the other one as the answer; got: ${text}`);
    });

    test('prototypes in an INCLUDEd file: the call picks by its arguments', async () => {
        fs.writeFileSync(path.join(dir, 'fmt.inc'), ["    MODULE('fmt.clw')", '  ' + ONE, '  ' + TWO, '    END'].join('\r\n'));
        const src = mainWith(["    INCLUDE('fmt.inc')"]);
        const mainPath = path.join(dir, 'main.clw');
        fs.writeFileSync(mainPath, src);
        const text = await hover(toUri(mainPath), src, at(src, "Fmt('abc'", 1));
        assert.ok(text.includes('STRING pText, LONG pWidth'), `the second prototype, not the first; got: ${text}`);
    });

    test('prototypes in the PROGRAM\'s MAP, called from a MEMBER module: the call picks by its arguments', async () => {
        const main = mainWith(["    MODULE('fmt.clw')", '  ' + ONE, '  ' + TWO, '    END', "    MODULE('use.clw')", 'Use                 PROCEDURE', '    END']);
        fs.writeFileSync(path.join(dir, 'main.clw'), main);
        const use = [
            "  MEMBER('main')",
            'Use                 PROCEDURE',
            'S                     STRING(40)',
            '  CODE',
            "  S = Fmt('abc', 10)",
        ].join('\r\n');
        const usePath = path.join(dir, 'use.clw');
        fs.writeFileSync(usePath, use);
        const text = await hover(toUri(usePath), use, at(use, "Fmt('abc'", 1));
        assert.ok(text.includes('STRING pText, LONG pWidth'), `the second prototype, not the first; got: ${text}`);
    });

    suite('same number of parameters, different types', () => {
        const LONG1 = '  Fmt                 PROCEDURE(LONG pValue),STRING';
        const STR1 = '  Fmt                 PROCEDURE(STRING pText),STRING';
        function src(mapBody: string[]): string {
            return [
                '  PROGRAM',
                '  MAP',
                ...mapBody,
                '  END',
                'S                   STRING(40)',
                'N                   LONG',
                '  CODE',
                '  S = Fmt(S)',
                '  S = Fmt(N)',
                "  S = Fmt('lit')",
            ].join('\r\n');
        }
        test('the order of the prototypes does not decide: Fmt(N) with the STRING prototype first', async () => {
            const mainPath = path.join(dir, 'main.clw');
            const s = src(["    MODULE('fmt.clw')", STR1, LONG1, '    END']);
            fs.writeFileSync(mainPath, s);
            const text = await hover(toUri(mainPath), s, at(s, 'Fmt(N)', 1));
            const firstProto = text.split('\n').find(l => /PROCEDURE\(/.test(l)) ?? '';
            assert.ok(firstProto.includes('LONG pValue') && !firstProto.includes('STRING pText'), `got: ${text}`);
        });

        for (const where of ['same file', 'INCLUDEd file'] as const) {
            for (const [call, want, notWant] of [
                ['Fmt(S)', 'STRING pText', 'LONG pValue'],
                ['Fmt(N)', 'LONG pValue', 'STRING pText'],
                ["Fmt('lit')", 'STRING pText', 'LONG pValue'],
            ] as const) {
                test(`${where}: ${call} shows the ${want} prototype`, async () => {
                    let text: string;
                    const mainPath = path.join(dir, 'main.clw');
                    if (where === 'same file') {
                        const s = src(["    MODULE('fmt.clw')", LONG1, STR1, '    END']);
                        fs.writeFileSync(mainPath, s);
                        text = await hover(toUri(mainPath), s, at(s, call, 1));
                    } else {
                        fs.writeFileSync(path.join(dir, 'fmt.inc'), ["    MODULE('fmt.clw')", LONG1, STR1, '    END'].join('\r\n'));
                        const s = src(["    INCLUDE('fmt.inc')"]);
                        fs.writeFileSync(mainPath, s);
                        text = await hover(toUri(mainPath), s, at(s, call, 1));
                    }
                    const firstProto = text.split('\n').find(l => /PROCEDURE\(/.test(l)) ?? '';
                    assert.ok(firstProto.includes(want) && !firstProto.includes(notWant), `got: ${text}`);
                });
            }
        }
    });

    test('arguments that cannot pick one: every prototype is listed', async () => {
        fs.writeFileSync(path.join(dir, 'fmt.inc'), ["    MODULE('fmt.clw')", '  ' + ONE,
            '  Fmt                 PROCEDURE(STRING pText),STRING', '    END'].join('\r\n'));
        const src = mainWith(["    INCLUDE('fmt.inc')"]);
        const mainPath = path.join(dir, 'main.clw');
        fs.writeFileSync(mainPath, src);
        const text = await hover(toUri(mainPath), src, at(src, 'Fmt(Mystery)', 1));
        assert.ok(text.includes('LONG pValue') && text.includes('STRING pText'), `both prototypes; got: ${text}`);
    });
});
