/**
 * Structure view: `IF x THEN DO Some:Routine END` inside a ROUTINE must not appear as
 * a data declaration "DO Some" (field icon, name cut at the first colon).
 *
 * Reported by Mark on CopyAssembly.clw: a routine without DATA, following a routine
 * WITH a DATA section, listed six "DO CopyAssembly" children — one per
 * `IF ... THEN DO CopyAssembly:CopyNow:CopyWalls:One:Adj END` line. The routine names
 * themselves are valid Clarion labels; the colon is not the fault.
 */
import * as assert from 'assert';
import { ClarionTokenizer } from '../ClarionTokenizer';
import { ClarionDocumentSymbolProvider, ClarionDocumentSymbol } from '../providers/ClarionDocumentSymbolProvider';
import { setServerInitialized } from '../serverState';

const SOURCE = [
    '  MEMBER()',                                                          // 0
    '  MAP',                                                               // 1
    '  END',                                                               // 2
    'CopyAssembly:CopyNow PROCEDURE()',                                    // 3
    'QPtr  LONG',                                                          // 4
    '  CODE',                                                              // 5
    '  DO CopyAssembly:CopyNow:CopyWalls',                                 // 6
    'CopyAssembly:CopyNow:CopyWalls ROUTINE',                              // 7
    '  DATA',                                                              // 8
    'NDX   LONG',                                                          // 9
    '  CODE',                                                              // 10
    '  DO CopyAssembly:CopyNow:CopyWalls:One',                             // 11
    'CopyAssembly:CopyNow:CopyWalls:One ROUTINE',                          // 12 — no DATA section
    "  WAL:Record = CA_Data.Q.WAL",                                        // 13
    '  IF CA_Data.Q.CopyWhat.ODD THEN DO CopyAssembly:CopyNow:CopyWalls:One:Odd END',   // 14
    '  IF CA_Data.Q.CopyWhat.ADJ THEN DO CopyAssembly:CopyNow:CopyWalls:One:Adj END',   // 15
    '  IF CA_Data.Q.CopyWhat.PRS THEN DO CopyAssembly:CopyNow:CopyWalls:One:Prs END',   // 16
    '  IF Simple THEN DO Plain END',                                       // 17
    'CopyAssembly:CopyNow:CopyWalls:One:Adj ROUTINE',                      // 18
    '  WallKids:Adj.Free()',                                               // 19
    'CopyAssembly:CopyNow:CopyWalls:One:Odd ROUTINE',                      // 20
    '  RETURN',                                                            // 21
    'CopyAssembly:CopyNow:CopyWalls:One:Prs ROUTINE',                      // 22
    '  RETURN',                                                            // 23
    'Plain ROUTINE',                                                       // 24
    '  RETURN',                                                            // 25
].join('\r\n');

function flatten(symbols: ClarionDocumentSymbol[], out: ClarionDocumentSymbol[] = []): ClarionDocumentSymbol[] {
    for (const s of symbols) { out.push(s); if (s.children) flatten(s.children as ClarionDocumentSymbol[], out); }
    return out;
}

suite('Structure view: THEN DO is a call, not a declaration (#533)', () => {
    setup(() => setServerInitialized(true));

    test('no "DO ..." entries appear anywhere in the outline', () => {
        const tokens = new ClarionTokenizer(SOURCE).tokenize();
        const symbols = new ClarionDocumentSymbolProvider().provideDocumentSymbols(tokens, 'test://copyassembly.clw');
        const all = flatten(symbols);
        const doEntries = all.filter(s => /^DO\b/i.test(s.name));
        assert.deepStrictEqual(doEntries.map(s => `${s.name}@${s.range.start.line}`), [],
            `DO call sites must not be outline entries; got ${JSON.stringify(doEntries.map(s => s.name))}`);
    });

    test('a routine without DATA has no data children, even after a routine with DATA', () => {
        const tokens = new ClarionTokenizer(SOURCE).tokenize();
        const symbols = new ClarionDocumentSymbolProvider().provideDocumentSymbols(tokens, 'test://copyassembly.clw');
        const all = flatten(symbols);
        const one = all.find(s => s.name.startsWith('CopyAssembly:CopyNow:CopyWalls:One') && !s.name.includes(':One:') && /ROUTINE/i.test(s.detail ?? '') || false)
            ?? all.find(s => s.name.startsWith('CopyAssembly:CopyNow:CopyWalls:One') && !s.name.includes(':One:'));
        assert.ok(one, `routine One found; names: ${all.map(s => s.name).join(' | ')}`);
        const dataChildren = (one!.children ?? []).filter(c => !/ROUTINE|CODE/i.test(String((c as ClarionDocumentSymbol).detail ?? '')));
        assert.deepStrictEqual(dataChildren.map(c => c.name), [], `no declarations in a DATA-less routine; got ${JSON.stringify(dataChildren.map(c => c.name))}`);
        // The routine WITH data keeps its declaration
        const walls = all.find(s => s.name.startsWith('CopyAssembly:CopyNow:CopyWalls') && !s.name.includes(':One'));
        assert.ok(walls && (walls.children ?? []).some(c => /^NDX\b/.test(c.name)), 'NDX stays under the routine that declares it');
    });
});
