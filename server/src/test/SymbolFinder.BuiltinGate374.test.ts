/**
 * #374 — findSymbol bails before the expensive cross-file tiers when the word
 * is a Clarion built-in (LONGPATH, CLIP, …) that no cheaper tier resolved.
 *
 * F12 on `LONGPATH()` measured 24.5s cold: the miss exhausted every tier,
 * forcing the include-chain + sibling-family index builds to prove that a
 * declaration which cannot exist… doesn't. Same precedent as #345 ("'OPEN'
 * alone triggered the full include-chain cold build") and the #362 proc-index
 * tier: the gate sits AFTER the cheap in-document tiers and the proc index, so
 * a same-named local still shadows and a user MAP procedure named like a
 * built-in still resolves.
 *
 * Pins:
 *   1. Built-in miss (scoped): expensive tiers are NOT entered; result null.
 *   2. Built-in miss (no-scope): same.
 *   3. Sentinel — a non-built-in unknown word still runs the expensive tiers
 *      (the gate must not over-block).
 *   4. Shadowing — a local variable named like a built-in still resolves.
 */

import * as assert from 'assert';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { TokenCache } from '../TokenCache';
import { SymbolFinderService } from '../services/SymbolFinderService';
import { ScopeAnalyzer } from '../utils/ScopeAnalyzer';
import { setServerInitialized } from '../serverState';

function makeDoc(lines: string[]): TextDocument {
    return TextDocument.create('file:///f%3A/test374/host374.clw', 'clarion', 1, lines.join('\n'));
}

/** Patch the two expensive cross-file tiers on THIS instance: count + return null. */
function gateInstrument(finder: SymbolFinderService) {
    const counts = { global: 0, sibling: 0 };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const anyFinder = finder as any;
    anyFinder.findGlobalVariable = async () => { counts.global++; return null; };
    anyFinder.findModuleVariableInSiblingMembers = async () => { counts.sibling++; return null; };
    anyFinder.findProcedureViaIndex = async () => null; // proc-index miss (LONGPATH is not a proc)
    return counts;
}

suite('SymbolFinderService #374 — built-in gate before the cross-file tiers', () => {

    suiteSetup(() => setServerInitialized(true));
    teardown(() => TokenCache.getInstance().clearAllTokens());

    function newFinder(): SymbolFinderService {
        const tokenCache = TokenCache.getInstance();
        return new SymbolFinderService(tokenCache, new ScopeAnalyzer(tokenCache, undefined as never));
    }

    test('built-in miss inside a procedure scope: cross-file tiers never entered', async () => {
        const doc = makeDoc([
            "  MEMBER('prog374.clw')",
            '  MAP',
            '  END',
            'MyProc PROCEDURE()',
            'x        CSTRING(261)',
            '  CODE',
            '  x = LONGPATH()',
        ]);
        const finder = newFinder();
        const counts = gateInstrument(finder);

        const result = await finder.findSymbol('LONGPATH', doc, { line: 6, character: 8 });
        assert.strictEqual(result, null, 'a built-in has no findable source declaration');
        assert.strictEqual(counts.global + counts.sibling, 0,
            `built-in miss must not enter the expensive cross-file tiers ` +
            `(global=${counts.global}, sibling=${counts.sibling})`);
    });

    test('built-in miss with no enclosing scope: cross-file tiers never entered', async () => {
        const doc = makeDoc([
            "  MEMBER('prog374.clw')",
            '  MAP',
            '  END',
        ]);
        const finder = newFinder();
        const counts = gateInstrument(finder);

        const result = await finder.findSymbol('CLIP', doc, { line: 1, character: 4 });
        assert.strictEqual(result, null);
        assert.strictEqual(counts.global + counts.sibling, 0,
            `no-scope built-in miss must not enter the cross-file tiers ` +
            `(global=${counts.global}, sibling=${counts.sibling})`);
    });

    test('sentinel: a non-built-in unknown word still runs the expensive tiers', async () => {
        const doc = makeDoc([
            "  MEMBER('prog374.clw')",
            '  MAP',
            '  END',
            'MyProc PROCEDURE()',
            '  CODE',
            '  NotARealName374()',
        ]);
        const finder = newFinder();
        const counts = gateInstrument(finder);

        const result = await finder.findSymbol('NotARealName374', doc, { line: 5, character: 4 });
        assert.strictEqual(result, null, 'genuinely unknown word resolves nowhere');
        assert.ok(counts.global + counts.sibling > 0,
            'a NON-built-in miss must still get the full cross-file walk — the gate must not over-block');
    });

    test('shadowing: a local variable named like a built-in still resolves locally', async () => {
        const doc = makeDoc([
            "  MEMBER('prog374.clw')",
            '  MAP',
            '  END',
            'MyProc PROCEDURE()',
            'LongPath LONG',
            '  CODE',
            '  LongPath = 1',
        ]);
        const finder = newFinder();
        const counts = gateInstrument(finder);

        const result = await finder.findSymbol('LongPath', doc, { line: 6, character: 4 });
        assert.ok(result, 'the local declaration must shadow the built-in name');
        assert.strictEqual(result!.location.line, 4, 'resolves to the local declaration line');
        assert.strictEqual(counts.global + counts.sibling, 0, 'local hit — expensive tiers untouched');
    });
});
