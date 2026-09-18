/**
 * A routine hover did not say which procedure the routine belongs to.
 *
 * ROUTINE labels are procedure-local and legally repeat across procedures, so
 * the name on its own does not identify the routine on screen. Resolution was
 * already correct — `findScopedRoutineToken` (#264/#285) picks the enclosing
 * procedure's copy — but nothing in the card said so, which is precisely the
 * case where the reader needs to be told.
 *
 * The declaration label had a second problem. No resolver claimed it, so it fell
 * through to the variable tiers and `HoverFormatter.formatVariable` rendered it
 * as a variable whose declared type happens to be the word ROUTINE:
 *
 *     **SyncDisplay** — `ROUTINE`
 *     🔐 Local routine variable
 *
 * "Local routine variable" reads as "a variable local to a routine" — the one
 * thing a routine label is not.
 */

import * as assert from 'assert';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { HoverProvider } from '../providers/HoverProvider';
import { TokenCache } from '../TokenCache';
import { setServerInitialized } from '../serverState';

suite('A routine hover names its owning procedure', () => {
    // SyncDisplay is declared in BOTH procedures — legal, and the case the
    // owner line exists for.
    const source = [
        "  MEMBER('prog.clw')",          // 0
        '',                              // 1
        'AlphaProc    PROCEDURE()',      // 2
        'LocalOne       LONG',           // 3
        '  CODE',                        // 4
        '  DO SyncDisplay',              // 5
        '',                              // 6
        'SyncDisplay  ROUTINE',          // 7
        '  CODE',                        // 8
        '  LocalOne = 1',                // 9
        '',                              // 10
        'Grid::Refresh ROUTINE',         // 11
        '  CODE',                        // 12
        '  LocalOne = 2',                // 13
        '',                              // 14
        'BetaProc     PROCEDURE()',      // 15
        '  CODE',                        // 16
        '  DO SyncDisplay',              // 17
        '',                              // 18
        'SyncDisplay  ROUTINE',          // 19
        '  CODE',                        // 20
        '  RETURN',                      // 21
    ].join('\n');

    // A routine owned by a method implementation, to exercise the noun choice.
    const methodSource = [
        "  MEMBER('prog.clw')",          // 0
        '',                              // 1
        'ThisWindow.Init PROCEDURE()',   // 2
        '  CODE',                        // 3
        '  DO PrepareControls',          // 4
        '',                              // 5
        'PrepareControls ROUTINE',       // 6
        '  CODE',                        // 7
        '  RETURN',                      // 8
    ].join('\n');

    const text = (h: unknown) => {
        const c = (h as { contents: unknown } | null)?.contents;
        return typeof c === 'string' ? c : ((c as { value?: string })?.value ?? '');
    };
    const ownerLine = (t: string) => t.split('\n').find(l => l.startsWith('🔐')) ?? '';

    let counter = 0;
    async function hover(src: string, line: number, character: number): Promise<string> {
        const doc = TextDocument.create(
            `file:///C:/temp/routinehover-${++counter}.clw`, 'clarion', 1, src);
        const cache = TokenCache.getInstance();
        cache.clearAllTokens();
        cache.getTokens(doc);
        return text(await new HoverProvider().provideHover(doc, { line, character }));
    }

    suiteSetup(() => setServerInitialized(true));

    suite('on a DO reference', () => {
        test('names the owning procedure', async () => {
            const card = await hover(source, 5, 7);
            assert.ok(card.includes('**Routine:** `SyncDisplay`'), card);
            assert.strictEqual(ownerLine(card), '🔐 Routine in procedure `AlphaProc`');
        });

        test('a repeated routine name resolves to the reader\'s own procedure', async () => {
            assert.strictEqual(ownerLine(await hover(source, 5, 7)),
                '🔐 Routine in procedure `AlphaProc`');
            assert.strictEqual(ownerLine(await hover(source, 17, 7)),
                '🔐 Routine in procedure `BetaProc`',
                'the second DO must name BetaProc, not the first declaration found');
        });

        test('keeps the location link and source preview', async () => {
            const card = await hover(source, 5, 7);
            assert.ok(card.includes('📍'), 'location link should survive');
            assert.ok(card.includes('LocalOne = 1'), 'source preview should survive');
        });

        test('a method owner is called a method', async () => {
            assert.strictEqual(ownerLine(await hover(methodSource, 4, 7)),
                '🔐 Routine in method `ThisWindow.Init`');
        });
    });

    suite('on the ROUTINE declaration label', () => {
        test('is a routine card, not a variable card', async () => {
            const card = await hover(source, 7, 3);
            assert.ok(card.includes('**Routine:** `SyncDisplay`'),
                `expected a routine card, got:\n${card}`);
            assert.ok(!card.includes('Local routine variable'),
                'a routine label is not a variable local to a routine');
        });

        test('names the owning procedure', async () => {
            assert.strictEqual(ownerLine(await hover(source, 7, 3)),
                '🔐 Routine in procedure `AlphaProc`');
        });

        test('distinguishes two declarations that share a name', async () => {
            assert.strictEqual(ownerLine(await hover(source, 7, 3)),
                '🔐 Routine in procedure `AlphaProc`');
            assert.strictEqual(ownerLine(await hover(source, 19, 3)),
                '🔐 Routine in procedure `BetaProc`');
        });

        test('shows the declaration line', async () => {
            const card = await hover(source, 7, 3);
            assert.ok(card.includes('SyncDisplay  ROUTINE'), card);
        });

        test('handles a generated Module::Name label', async () => {
            const card = await hover(source, 11, 3);
            assert.ok(card.includes('**Routine:** `Grid::Refresh`'), card);
            assert.strictEqual(ownerLine(card), '🔐 Routine in procedure `AlphaProc`');
        });

        test('a method owner is called a method', async () => {
            assert.strictEqual(ownerLine(await hover(methodSource, 6, 3)),
                '🔐 Routine in method `ThisWindow.Init`');
        });

        test('does not claim the cursor once it is past the label', async () => {
            // On the ROUTINE keyword itself the declaration card must not fire —
            // that position belongs to the keyword help further down the chain.
            const card = await hover(source, 7, 15);
            assert.ok(!card.includes('**Routine:** `SyncDisplay`'),
                `the keyword position should fall through, got:\n${card}`);
        });
    });
});
