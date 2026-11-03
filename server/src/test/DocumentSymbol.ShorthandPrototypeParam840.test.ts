/**
 * #840 — a MAP prototype written without the PROCEDURE keyword (`Name (params)`) whose parameter
 * has a user-defined type and a name, `(HINTERNET handle)`, put an Outline entry
 * `HINTERNET handle)` under the prototype. The type is a plain word, not a data-type keyword,
 * so `HINTERNET handle` reads like a label and its type; the parameter list was only skipped
 * when a PROCEDURE keyword came first on the line. Nothing inside a parenthesis is declared.
 */
import * as assert from 'assert';
import { ClarionTokenizer } from '../ClarionTokenizer';
import { ClarionDocumentSymbolProvider, ClarionDocumentSymbol } from '../providers/ClarionDocumentSymbolProvider';
import { setServerInitialized } from '../serverState';

const SOURCE = [
    '  PROGRAM',                                                        // 0
    '  MAP',                                                            // 1
    "    MODULE('wininet')",                                            // 2
    'InternetCloseHandle (HINTERNET handle),BOOL,PROC,PASCAL',          // 3
    'InternetConnect     (HINTERNET       handle, |',                   // 4
    '                     CONST *CSTRING  server, |',                   // 5
    '                     HINTERNET       h2),HINTERNET,PASCAL',        // 6
    '  Indented          (LONG a, HINTERNET b),BOOL',                   // 7
    'WithProcedure       PROCEDURE(HINTERNET handle),BOOL',             // 8
    '    END',                                                          // 9
    '  END',                                                            // 10
    'Session      HINTERNET',                                           // 11
    'Group1       GROUP(MyGroupType)',                                  // 12
    '             END',                                                 // 13
    '  CODE',                                                           // 14
].join('\r\n');

function flat(list: ClarionDocumentSymbol[], out: ClarionDocumentSymbol[] = []): ClarionDocumentSymbol[] {
    for (const s of list) { out.push(s); flat((s.children ?? []) as ClarionDocumentSymbol[], out); }
    return out;
}

suite('#840 — Outline: a shorthand MAP prototype\'s parameters are not entries', () => {
    setup(() => setServerInitialized(true));

    const entries = () => flat(new ClarionDocumentSymbolProvider()
        .provideDocumentSymbols(new ClarionTokenizer(SOURCE).tokenize(), 'test://wininet.clw'));

    test('each prototype is one entry, with no entry for a parameter', () => {
        const module = entries().find(s => s.name.startsWith('MODULE'))!;
        assert.deepStrictEqual(
            (module.children as ClarionDocumentSymbol[]).map(s => `${s.name}@${s.range.start.line}`),
            ['InternetCloseHandle@3', 'InternetConnect@4', 'Indented@7', 'WithProcedure@8']);
        assert.deepStrictEqual(entries().filter(s => /HINTERNET [a-z]/i.test(s.name)).map(s => s.name), []);
    });

    test('CONTROL: a variable of a user-defined type and a GROUP with a type still are', () => {
        const names = entries().map(s => s.name);
        assert.ok(names.some(n => n.startsWith('Session')), JSON.stringify(names));
        assert.ok(names.includes('GROUP (Group1)'), JSON.stringify(names));
    });
});
