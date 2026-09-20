/**
 * Structure view: a CODE-section statement that begins with the word `DATA` — bare, or as
 * the part after the colon of a prefixed name — must not put the rest of the section back
 * into "declarations" mode.
 *
 * Reported by Bill Atchison (#618) against a 1,648-line procedure whose CODE section assigns
 * the module global `GetAction:Data`: the outline carried 28 kind-13 (Variable) entries for
 * ordinary `IF`, `OF` and `DO` lines, named after the expression with its operators dropped
 * (`Loc:Flag AND01`, `OEPS:HandlerThread AND(())THEN`, `TRAN:SpecialOrder GetAction(`).
 *
 * The trigger is a prefix of NINE OR MORE characters: the tokenizer splits the long prefixed
 * name at the colon, leaving `Data` at the start of a statement where it reads as the routine
 * DATA-section keyword. An eight-character prefix is kept whole and never triggered it — the
 * same length boundary as #600.
 *
 * This is the main procedure body, not a routine, so it is a different trigger from #533.
 */
import * as assert from 'assert';
import { SymbolKind } from 'vscode-languageserver';
import { ClarionTokenizer } from '../ClarionTokenizer';
import { ClarionDocumentSymbolProvider, ClarionDocumentSymbol } from '../providers/ClarionDocumentSymbolProvider';
import { setServerInitialized } from '../serverState';

const CODE_LINE = 9;   // the procedure's CODE
const IF_LINE = 11;    // the ordinary IF that was being listed as data

/** Bill's minimal repro, with the one line that varies (line 10) supplied by the caller. */
function source(triggerLine: string): string {
    return [
        "  MEMBER('Repro.clw')",   // 0
        '',                        // 1
        '  MAP',                   // 2
        'Repro   PROCEDURE()',     // 3
        '  END',                   // 4
        '',                        // 5
        'Repro   PROCEDURE()',     // 6
        'Loc:Flag    BYTE',        // 7
        'Loc:Count   LONG',        // 8
        '  CODE',                  // 9
        triggerLine,               // 10
        '  IF Loc:Flag AND Loc:Count <> 0 AND Loc:Count = 1',  // 11
        '  END',                   // 12
        '  RETURN',                // 13
    ].join('\r\n');
}

function flatten(symbols: ClarionDocumentSymbol[], out: ClarionDocumentSymbol[] = []): ClarionDocumentSymbol[] {
    for (const s of symbols) { out.push(s); if (s.children) flatten(s.children as ClarionDocumentSymbol[], out); }
    return out;
}

function outlineFor(triggerLine: string): ClarionDocumentSymbol[] {
    const tokens = new ClarionTokenizer(source(triggerLine)).tokenize();
    return flatten(new ClarionDocumentSymbolProvider().provideDocumentSymbols(tokens, 'test://repro.clw'));
}

/** Anything the outline claims is a declaration at or below the CODE line. */
function declarationsInCodeSection(all: ClarionDocumentSymbol[]): ClarionDocumentSymbol[] {
    return all.filter(s => s.kind === SymbolKind.Variable && s.range.start.line > CODE_LINE);
}

suite('Structure view: DATA at the start of a CODE-section statement (#618)', () => {
    setup(() => setServerInitialized(true));

    // Every line Bill found to trigger it.
    const triggers = [
        '  Abcdefghi:Data = 1',    // 9-character prefix — the reported shape
        '  GetAction:Data = 1',    // the real module global from his file
        '  Abcdefghij:Data = 1',   // 10 characters
        '  Abcdefghi:DATA = 1',    // upper case
        '  Abcdefghi:Data=1',      // no spaces around the =
        '            Data = 1',    // bare DATA at the start of the statement
    ];

    for (const trigger of triggers) {
        test(`no declarations after "${trigger.trim()}"`, () => {
            const all = outlineFor(trigger);
            const bogus = declarationsInCodeSection(all);
            assert.deepStrictEqual(
                bogus.map(s => `${s.name}@${s.range.start.line}`), [],
                `a CODE section contains no declarations; got ${JSON.stringify(bogus.map(s => s.name))}`);
            assert.ok(!all.some(s => s.range.start.line === IF_LINE),
                `the IF on line ${IF_LINE} must not be an outline entry at all; got ` +
                JSON.stringify(all.filter(s => s.range.start.line === IF_LINE).map(s => s.name)));
        });
    }

    // Lines Bill confirmed were already fine — these must stay fine.
    for (const clean of ['  Abcdefgh:Data = 1', '  Foo:Data = 1', '  Loc:Count = 1', '  Abcdefghi:Dat = 1']) {
        test(`still clean after "${clean.trim()}"`, () => {
            assert.deepStrictEqual(declarationsInCodeSection(outlineFor(clean)).map(s => s.name), []);
        });
    }

    test('the procedure keeps the declarations it really has', () => {
        const all = outlineFor('  Abcdefghi:Data = 1');
        const names = all.map(s => s.name);
        assert.ok(names.some(n => /^Loc:Flag\b/.test(n)), `Loc:Flag stays; got ${names.join(' | ')}`);
        assert.ok(names.some(n => /^Loc:Count\b/.test(n)), `Loc:Count stays; got ${names.join(' | ')}`);
    });

    test('a real routine DATA section still lists its declarations', () => {
        const withRoutine = [
            "  MEMBER('Repro.clw')",
            'Repro   PROCEDURE()',
            '  CODE',
            '  Abcdefghi:Data = 1',
            '  DO Setup',
            'Setup ROUTINE',
            '  DATA',
            'NDX   LONG',
            '  CODE',
            '  NDX = 1',
        ].join('\r\n');
        const tokens = new ClarionTokenizer(withRoutine).tokenize();
        const all = flatten(new ClarionDocumentSymbolProvider().provideDocumentSymbols(tokens, 'test://repro2.clw'));
        assert.ok(all.some(s => /^NDX\b/.test(s.name)),
            `a routine's own DATA section still declares NDX; got ${all.map(s => s.name).join(' | ')}`);
    });
});
