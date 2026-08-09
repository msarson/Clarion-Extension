import * as assert from 'assert';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { ClarionTokenizer } from '../ClarionTokenizer';
import { validateUndeclaredVariablesAsync } from '../providers/diagnostics/UndeclaredVariableDiagnostics';
import { SymbolFinderService } from '../services/SymbolFinderService';
import { setServerInitialized } from '../serverState';

/**
 * Issue #351 — the augment loop's candidate collector grabbed colon-split
 * FRAGMENTS of compound references (BRW1::SortHeader.Init → 'SortHeader',
 * ScrollSort:AllowAlpha → 'ScrollSort'). The fragments can never resolve, so
 * every validation exhausted all cross-file tiers per ghost — and the first
 * one paid the include-chain cold build (SCROLLSORT=22,966ms on Mark's
 * IBSWorking after each restart).
 *
 * Pinned with a spy SymbolFinder: fragments must never reach findSymbol;
 * genuine unknown names still must.
 */
suite('UndeclaredVariableDiagnostics — colon-split fragments (#351)', () => {

    function makeSpyFinder(queried: string[]): SymbolFinderService {
        return {
            findSymbol: async (word: string) => {
                queried.push(word.toUpperCase());
                return null;
            }
        } as unknown as SymbolFinderService;
    }

    setup(() => setServerInitialized(true));

    test('BUG PIN #351 — fragments of compound references never reach findSymbol', async () => {
        const code = [
            'TestProc PROCEDURE()',
            'BRW1::SortHeader  CLASS(SortHeaderClassType)',
            'Init                PROCEDURE()',
            '                  END',
            'BRW1::LastSortOrder BYTE',
            '  CODE',
            '  BRW1::SortHeader.Init()',
            '  BRW1::LastSortOrder = 1',
            '  ThisListManager:Browse:1.SetSort(ScrollSort:AllowAlpha)',
            '  RETURN',
        ].join('\n');
        const doc = TextDocument.create('test://351a.clw', 'clarion', 1, code);
        const tokens = new ClarionTokenizer(code).tokenize();

        const queried: string[] = [];
        await validateUndeclaredVariablesAsync(tokens, doc, makeSpyFinder(queried));

        for (const ghost of ['SORTHEADER', 'LASTSORTORDER', 'SCROLLSORT', 'ALLOWALPHA', 'BROWSE']) {
            assert.ok(!queried.includes(ghost),
                `fragment "${ghost}" must not reach findSymbol (colon-adjacent split of a compound reference); queried=[${queried.join(', ')}]`);
        }
    });

    test('#351 REGRESSION GUARD — genuine unknown names still reach findSymbol', async () => {
        const code = [
            'TestProc PROCEDURE()',
            '  CODE',
            '  TrulyUnknownVar = 1',
            '  RETURN',
        ].join('\n');
        const doc = TextDocument.create('test://351b.clw', 'clarion', 1, code);
        const tokens = new ClarionTokenizer(code).tokenize();

        const queried: string[] = [];
        await validateUndeclaredVariablesAsync(tokens, doc, makeSpyFinder(queried));

        assert.ok(queried.includes('TRULYUNKNOWNVAR'),
            `genuine unknown names must still be resolved cross-file; queried=[${queried.join(', ')}]`);
    });

    test('#351 REGRESSION GUARD — fused prefixed compounds (JCA:StartedDate) never false-positive', async () => {
        // Fused compounds tokenize as a single non-Variable token — they were
        // never augment candidates (that's why they never appeared in the
        // IBSWorking unresolved lists) and must stay diagnostic-silent.
        const code = [
            'TestProc PROCEDURE()',
            '  CODE',
            '  IF JCA:StartedDate > 0',
            '  END',
            '  RETURN',
        ].join('\n');
        const doc = TextDocument.create('test://351c.clw', 'clarion', 1, code);
        const tokens = new ClarionTokenizer(code).tokenize();

        const queried: string[] = [];
        const diags = await validateUndeclaredVariablesAsync(tokens, doc, makeSpyFinder(queried));

        assert.ok(!diags.some(d => d.message.includes('JCA:StartedDate')),
            `fused compound must not be flagged undeclared; diags=[${diags.map(d => d.message).join(' | ')}]`);
    });
});
