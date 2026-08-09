import * as assert from 'assert';
import { ClarionTokenizer, TokenType } from '../ClarionTokenizer';
import { ClarionDocumentSymbolProvider } from '../providers/ClarionDocumentSymbolProvider';
import { setServerInitialized } from '../serverState';

/**
 * #416 — a structure keyword used as an in-parentheses reference / parameter type
 * (e.g. FROM(QUEUE), FROM(GROUP), or PROCEDURE(FILE,KEY)) is correctly skipped as
 * a structure opener (#415), but the skipped token was then MANGLED: the Variable
 * pattern excludes structure keywords, so the fall-through dropped the leading
 * character (QUEUE -> "UEUE", GROUP -> "ROUP").
 *
 * Fix: emit the skipped keyword as a clean Keyword reference token (Keyword is the
 * type a non-excluded keyword like KEY already produced, and the symbol/structure
 * builders ignore it — emitting as Variable made the DocumentSymbolProvider treat
 * a keyword-named param type as a data declaration).
 */
suite('#416 — in-params structure keyword tokenizes cleanly (no mangling)', () => {

    setup(() => { setServerInitialized(true); });

    function tokenize(line: string) {
        return new ClarionTokenizer(line).tokenize();
    }

    for (const kw of ['QUEUE', 'GROUP', 'FILE', 'RECORD']) {
        test(`FROM(${kw}) yields a clean "${kw}" token, not a mangled residue`, () => {
            const tokens = tokenize(`      LIST,AT(1,2,3,4),USE(?L),FROM(${kw})`);
            const mangled = tokens.filter(t => t.value.toUpperCase() === kw.slice(1)); // "UEUE" etc.
            assert.strictEqual(
                mangled.length, 0,
                `expected no mangled "${kw.slice(1)}" residue; got: ` +
                JSON.stringify(tokens.map(t => t.value))
            );
            const clean = tokens.find(t => t.value.toUpperCase() === kw);
            assert.ok(clean, `expected a clean "${kw}" token`);
            assert.notStrictEqual(clean!.type, TokenType.Structure,
                `${kw} in FROM(${kw}) must not be a structure opener`);
        });
    }

    test('REGRESSION — PROCEDURE(FILE,KEY) param types do NOT become outline symbols', () => {
        const code = [
            '  PROGRAM',
            '  MAP',
            "    MODULE('ABFILE.CLW')",
            '      GET     PROCEDURE(FILE,KEY)',
            '      SET     PROCEDURE(FILE,KEY)',
            '    END',
            '  END',
            '  CODE',
            '  RETURN',
        ].join('\n');
        const tokens = tokenize(code);
        const provider = new ClarionDocumentSymbolProvider();
        const symbols = provider.provideDocumentSymbols(tokens, 'test://mapkey416.clw');

        const flat: string[] = [];
        const walk = (arr: any[]) => arr.forEach(s => { flat.push(s.name); if (s.children) walk(s.children); });
        walk(symbols);
        // A param type must never become a declaration-shaped symbol. Guard against a
        // name that *is* the keyword or opens with it (the regression produced
        // "FILE,,KEY)"), without false-matching a filename like MODULE('ABFILE.CLW').
        for (const bad of ['FILE', 'KEY']) {
            const offenders = flat.filter(n => new RegExp(`^${bad}\\b`, 'i').test(n));
            assert.strictEqual(
                offenders.length, 0,
                `param type "${bad}" must not open an outline symbol; got: ${JSON.stringify(flat)}`
            );
        }
        // The procedures themselves must still be present.
        assert.ok(flat.includes('GET') && flat.includes('SET'), `expected GET/SET; got: ${JSON.stringify(flat)}`);
    });
});
