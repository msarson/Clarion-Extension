import * as assert from 'assert';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { CallHierarchyItem, Range, SymbolKind } from 'vscode-languageserver/node';
import { TokenCache } from '../TokenCache';
import { setServerInitialized } from '../serverState';
import { CallHierarchyProvider } from '../providers/CallHierarchyProvider';

/**
 * #509 — LSP call hierarchy: "who calls this" and "what does this call", walkable a
 * level at a time. Built on the existing definition / implementation / references
 * resolvers; `DO Routine` counts as a call to the routine, and a call from a PROGRAM's
 * main CODE is attributed to a "PROGRAM" item.
 *
 * One file, no solution: the resolvers fall back to the current document, which is
 * enough to pin the shape. Cross-file resolution is theirs and is covered by their
 * own suites.
 */
const SRC = [
    '  PROGRAM',                 // 0
    '  MAP',                     // 1
    'Helper  PROCEDURE()',       // 2
    '  END',                     // 3
    '  CODE',                    // 4
    '  Helper()',                // 5  ← call from main code
    '  RETURN',                  // 6
    'Main PROCEDURE()',          // 7
    '  CODE',                    // 8
    '  DO Setup',                // 9
    '  DO Prime:VPL',            // 10
    '  Helper',                  // 11 ← bare call
    '  Helper()',                // 12
    '  x = Helper() + 1',        // 13
    '  START(Helper)',           // 14 ← a reference, not a call
    '  RETURN',                  // 15
    'Setup ROUTINE',             // 16
    '  Helper()',                // 17
    'Prime:VPL ROUTINE',         // 18
    '  Helper ()',               // 19 ← a call with a space before the paren (NetTalk style)
    'Helper PROCEDURE()',        // 20
    '  CODE',                    // 21
    '  RETURN',                  // 22
].join('\n');

suite('Call hierarchy (#509)', () => {

    let doc: TextDocument;
    let provider: CallHierarchyProvider;

    suiteSetup(() => {
        setServerInitialized(true);
        doc = TextDocument.create('file:///c:/callhier509/main.clw', 'clarion', 1, SRC);
        TokenCache.getInstance().getTokens(doc);
        provider = new CallHierarchyProvider();
    });

    const prepare = async (line: number, character: number): Promise<CallHierarchyItem | null> => {
        const items = await provider.prepare(doc, { line, character });
        return items?.[0] ?? null;
    };
    const byName = <T extends { from?: CallHierarchyItem; to?: CallHierarchyItem; fromRanges: Range[] }>(calls: T[]) =>
        Object.fromEntries(calls.map(c => [(c.from ?? c.to)!.name, c]));

    test('prepare on a procedure label gives that procedure with its body range', async () => {
        const item = await prepare(7, 1);
        assert.ok(item, 'item');
        assert.strictEqual(item!.name, 'Main');
        assert.strictEqual(item!.kind, SymbolKind.Function);
        assert.deepStrictEqual([item!.range.start.line, item!.range.end.line], [7, 15]);
        assert.deepStrictEqual([item!.selectionRange.start.line, item!.selectionRange.start.character], [7, 0]);
    });

    test('prepare on a call site gives the callee\'s implementation, not the MAP prototype', async () => {
        const item = await prepare(12, 3);
        assert.ok(item, 'item');
        assert.strictEqual(item!.name, 'Helper');
        assert.strictEqual(item!.range.start.line, 20, 'the implementation, not the prototype at line 2');
    });

    test('prepare on a routine label gives the routine', async () => {
        const item = await prepare(16, 2);
        assert.strictEqual(item!.name, 'Setup');
        assert.strictEqual(item!.detail, 'ROUTINE');
        assert.deepStrictEqual([item!.range.start.line, item!.range.end.line], [16, 17]);
    });

    test('prepare on a plain body line falls back to the containing procedure', async () => {
        const item = await prepare(13, 2);
        assert.strictEqual(item!.name, 'Main');
    });

    test('incoming calls to a procedure: grouped by caller, call sites only, main code as PROGRAM', async () => {
        const helper = (await prepare(20, 1))!;
        const calls = byName(await provider.incomingCalls(helper));
        assert.deepStrictEqual(Object.keys(calls).sort(), ['Main', 'PROGRAM', 'Prime:VPL', 'Setup']);
        assert.deepStrictEqual(calls['Main'].fromRanges.map(r => r.start.line), [11, 12, 13], 'three calls; START(Helper) is a reference, not a call');
        assert.deepStrictEqual(calls['Setup'].fromRanges.map(r => r.start.line), [17]);
        assert.deepStrictEqual(calls['Prime:VPL'].fromRanges.map(r => r.start.line), [19], 'a call with a space before the paren');
        assert.deepStrictEqual(calls['PROGRAM'].fromRanges.map(r => r.start.line), [5]);
    });

    test('prepare on a call written with a space before the paren gives the callee', async () => {
        const item = await prepare(19, 3);
        assert.strictEqual(item!.name, 'Helper');
        assert.strictEqual(item!.range.start.line, 20);
    });

    test('incoming calls to a routine are its DO sites', async () => {
        const setup = (await prepare(16, 2))!;
        const calls = byName(await provider.incomingCalls(setup));
        assert.deepStrictEqual(Object.keys(calls), ['Main']);
        assert.deepStrictEqual(calls['Main'].fromRanges.map(r => r.start.line), [9]);
    });

    test('outgoing calls from a procedure: routines via DO and procedures, each once with all its sites', async () => {
        const main = (await prepare(7, 1))!;
        const calls = byName(await provider.outgoingCalls(main));
        assert.deepStrictEqual(Object.keys(calls).sort(), ['Helper', 'Prime:VPL', 'Setup']);
        assert.strictEqual(calls['Helper'].to!.range.start.line, 20, 'resolved to the implementation');
        assert.deepStrictEqual(calls['Helper'].fromRanges.map(r => r.start.line), [11, 12, 13]);
        assert.strictEqual(calls['Setup'].to!.detail, 'ROUTINE');
        assert.deepStrictEqual(calls['Prime:VPL'].fromRanges.map(r => r.start.line), [10]);
    });

    test('outgoing calls from a routine', async () => {
        const setup = (await prepare(16, 2))!;
        const calls = byName(await provider.outgoingCalls(setup));
        assert.deepStrictEqual(Object.keys(calls), ['Helper']);
        assert.deepStrictEqual(calls['Helper'].fromRanges.map(r => r.start.line), [17]);
    });
});
