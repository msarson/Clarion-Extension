/**
 * #881 — a procedure is overloaded: several prototypes share one label and differ in
 * their parameters. Hovering a call showed the first prototype, whatever the call's
 * arguments were. The card should show the prototype the call's arguments pick, and,
 * when they cannot pick one, the prototypes they leave open rather than a guess.
 *
 * The overloads here are legal Clarion. Rules for Procedure Overloading (Language
 * Reference): prototypes must differ in the number of non-omittable parameters, or in
 * entity, named-group or variable (by-reference) parameter types; "all value-parameters
 * are considered to have the same type", so `(LONG)` and `(STRING)` alone would not
 * compile. Same-count overloads are therefore written with `*LONG` and `*STRING`.
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

const ONE = '  Fmt                 PROCEDURE(LONG pValue),STRING';
const TWO = '  Fmt                 PROCEDURE(STRING pText, LONG pWidth),STRING';
const BYLONG = '  Fmt                 PROCEDURE(*LONG pValue),STRING';
const BYSTR = '  Fmt                 PROCEDURE(*STRING pText),STRING';

function hoverText(h: unknown): string {
    const c = (h as { contents: unknown } | null)?.contents;
    return typeof c === 'string' ? c : ((c as { value?: string })?.value ?? '');
}

function toUri(fsPath: string): string {
    return 'file:///' + fsPath.replace(/\\/g, '/').replace(/^([a-zA-Z]):/, (_m, d) => d + '%3A');
}

/** The position of the `nth` occurrence of `needle`, plus `offset`. */
function at(source: string, needle: string, offset = 0, nth = 1): Position {
    const lines = source.split(/\r?\n/);
    let seen = 0;
    for (let i = 0; i < lines.length; i++) {
        let from = 0;
        for (;;) {
            const idx = lines[i].indexOf(needle, from);
            if (idx === -1) break;
            if (++seen === nth) return { line: i, character: idx + offset };
            from = idx + 1;
        }
    }
    throw new Error(`'${needle}' #${nth} not found`);
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

/** The first prototype line the card shows: the one it answers with. */
const shown = (text: string) => text.split('\n').find(l => /PROCEDURE\(/.test(l)) ?? '';

suite('Hover on a call to an overloaded procedure (#881)', () => {
    let dir: string;
    let mainPath: string;
    let savedSm: unknown;

    setup(() => {
        savedSm = (SolutionManager as unknown as { instance: unknown }).instance;
        (SolutionManager as unknown as { instance: unknown }).instance = null;
        StructureDeclarationIndexer.getInstance().clearCache();
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ce881-'));
        mainPath = path.join(dir, 'main.clw');
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

    /** A PROGRAM whose MAP holds `mapBody`, with calls to Fmt in its code. */
    function program(mapBody: string[], calls: string[]): string {
        return [
            '  PROGRAM',
            '  MAP',
            ...mapBody,
            '  END',
            'S                   STRING(40)',
            'N                   LONG',
            '  CODE',
            ...calls,
        ].join('\r\n');
    }

    async function hoverMain(src: string, needle: string, nth = 1): Promise<string> {
        fs.writeFileSync(mainPath, src);
        return hover(toUri(mainPath), src, at(src, needle, 1, nth));
    }

    test('arguments that cannot pick one, the file\'s calls are never listed (whole fallback list)', async () => {
        // Every argument unreadable: the fallback lists every prototype of the name, so a
        // call token counted as a prototype would show here.
        const text = await hoverMain(program(["    MODULE('fmt.clw')", BYLONG, BYSTR, '    END'],
            ['  S = Fmt(S)', '  S = Fmt(N)', '  S = Fmt(Mystery, Other)']), 'Fmt(Mystery');
        assert.ok(/2 overloads/.test(text), `the two prototypes only; got: ${text}`);
        assert.ok(!/S = Fmt\(/.test(text), `no call line listed; got: ${text}`);
    });

    suite('a different number of parameters', () => {
        const calls = ["  S = Fmt('abc', 10)", '  S = Fmt(5)'];

        test('a MAP in the same file: the two-argument call shows the two-parameter prototype', async () => {
            const text = await hoverMain(program(["    MODULE('fmt.clw')", ONE, TWO, '    END'], calls), "Fmt('abc'");
            assert.ok(shown(text).includes('STRING pText, LONG pWidth'), `got: ${text}`);
        });

        test('a MAP in the same file: the one-argument call shows the one-parameter prototype', async () => {
            const text = await hoverMain(program(["    MODULE('fmt.clw')", ONE, TWO, '    END'], calls), 'Fmt(5)');
            assert.ok(shown(text).includes('LONG pValue') && !shown(text).includes('pWidth'), `got: ${text}`);
        });

        test('prototypes in an INCLUDEd file: the call picks by its arguments', async () => {
            fs.writeFileSync(path.join(dir, 'fmt.inc'), ["    MODULE('fmt.clw')", ONE, TWO, '    END'].join('\r\n'));
            const text = await hoverMain(program(["    INCLUDE('fmt.inc')"], calls), "Fmt('abc'");
            assert.ok(shown(text).includes('STRING pText, LONG pWidth'), `got: ${text}`);
        });

        test('prototypes in the PROGRAM\'s MAP, called from a MEMBER module: the call picks by its arguments', async () => {
            fs.writeFileSync(mainPath, program(["    MODULE('fmt.clw')", ONE, TWO, '    END',
                "    MODULE('use.clw')", 'Use                 PROCEDURE', '    END'], []));
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
            assert.ok(shown(text).includes('STRING pText, LONG pWidth'), `got: ${text}`);
        });
    });

    suite('the same number of parameters, by-reference types', () => {
        const calls = ['  S = Fmt(S)', '  S = Fmt(N)'];
        for (const where of ['same file', 'INCLUDEd file'] as const) {
            const mapFor = (protos: string[]) => {
                if (where === 'same file') return ["    MODULE('fmt.clw')", ...protos, '    END'];
                fs.writeFileSync(path.join(dir, 'fmt.inc'), ["    MODULE('fmt.clw')", ...protos, '    END'].join('\r\n'));
                return ["    INCLUDE('fmt.inc')"];
            };
            test(`${where}: Fmt(S) with S a STRING shows the *STRING prototype`, async () => {
                const text = await hoverMain(program(mapFor([BYLONG, BYSTR]), calls), 'Fmt(S)');
                assert.ok(shown(text).includes('*STRING pText'), `got: ${text}`);
            });
            test(`${where}: Fmt(N) with N a LONG shows the *LONG prototype, whichever comes first`, async () => {
                const text = await hoverMain(program(mapFor([BYSTR, BYLONG]), calls), 'Fmt(N)');
                assert.ok(shown(text).includes('*LONG pValue'), `got: ${text}`);
            });
        }

        test('two calls on one line: the one under the cursor decides', async () => {
            // *STRING first, so neither "the first prototype" nor "the first call" lands on *LONG.
            const text = await hoverMain(program(["    MODULE('fmt.clw')", BYSTR, BYLONG, '    END'],
                ['  S = Fmt(S) & Fmt(N)']), 'Fmt(', 2);
            assert.ok(shown(text).includes('*LONG pValue'), `the second call, Fmt(N); got: ${text}`);
        });
    });

    suite('arguments that cannot pick one', () => {
        test('the card lists the prototypes left open, and only prototypes', async () => {
            // The file also calls Fmt elsewhere: a call is not a prototype.
            const text = await hoverMain(program(["    MODULE('fmt.clw')", BYLONG, BYSTR, '    END'],
                ['  S = Fmt(S)', '  S = Fmt(N)', '  S = Fmt(Mystery)']), 'Fmt(Mystery)');
            assert.ok(/2 overloads/.test(text), `exactly the two prototypes; got: ${text}`);
            assert.ok(text.includes('*LONG pValue') && text.includes('*STRING pText'), `both listed; got: ${text}`);
            assert.ok(!/S = Fmt\(/.test(text), `no call line listed as a prototype; got: ${text}`);
        });

        test('a same-named prototype in another procedure\'s local MAP is not an overload', async () => {
            const src = [
                '  PROGRAM',
                '  MAP',
                "    MODULE('fmt.clw')",
                BYLONG,
                BYSTR,
                '    END',
                'Other               PROCEDURE',
                '  END',
                'S                   STRING(40)',
                '  CODE',
                '  S = Fmt(Mystery)',
                'Other               PROCEDURE',
                '  MAP',
                '  Fmt                 PROCEDURE(*BYTE pFlag),STRING',
                '  END',
                '  CODE',
            ].join('\r\n');
            const text = await hoverMain(src, 'Fmt(Mystery)');
            assert.ok(/2 overloads/.test(text) && !text.includes('*BYTE pFlag'), `the local MAP's Fmt is another procedure; got: ${text}`);
        });
    });
});
