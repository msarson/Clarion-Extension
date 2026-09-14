import * as assert from 'assert';
import { ClarionTokenizer } from '../ClarionTokenizer';
import ClarionFoldingProvider from '../ClarionFoldingProvider';
import { LoggingConfig } from '../../../common/LoggingConfig';

// A nested structure (a VIEW's JOIN, a QUEUE inside a GROUP, …) is reached by the
// folding provider twice: once from the flat foldable-token scan of the whole
// stream, and once as a child of its parent via the children recursion. The
// "circular reference" guard suppressed the duplicate fold but logged a
// misleading warning for every nested structure — invisible until #440 made warn
// reachable. The recursion is redundant (the flat scan already covers every
// foldable token), so it is removed; this pins that no such warning is emitted
// and that the folds are still correct.

const SRC = [
    "  PROGRAM",
    "Customer  FILE,DRIVER('TOPSPEED'),PRE(CUS)",
    "CusKey      KEY(CUS:ID)",
    "Record        RECORD,PRE()",
    "ID              LONG",
    "              END",
    "          END",
    "Orders    FILE,DRIVER('TOPSPEED'),PRE(ORD)",
    "OrdKey      KEY(ORD:ID)",
    "Record        RECORD,PRE()",
    "ID              LONG",
    "CusID           LONG",
    "              END",
    "          END",
    "",
    "ViewInnerAttr        VIEW(Orders)",
    "                       PROJECT(ORD:ID)",
    "                       JOIN(CUS:CusKey, ORD:CusID),INNER",
    "                         PROJECT(CUS:Name)",
    "                       END",
    "                     END",
    "  CODE",
].join('\n');

function capture(): { lines: string[]; restore: () => void } {
    const lines: string[] = [];
    const orig = console.error;
    console.error = (...args: unknown[]) => { lines.push(args.map(String).join(' ')); };
    return { lines, restore: () => { console.error = orig; } };
}

suite('folding: a nested structure emits no "circular reference" warning', () => {

    teardown(() => { LoggingConfig.LEVEL_OVERRIDE = undefined; });

    test('a VIEW with a nested JOIN folds without warning', () => {
        const tokens = new ClarionTokenizer(SRC).tokenize();
        LoggingConfig.LEVEL_OVERRIDE = 'warn';
        const cap = capture();
        const ranges = new ClarionFoldingProvider(tokens).computeFoldingRanges();
        cap.restore();

        const circular = cap.lines.filter(l => /circular reference/i.test(l));
        assert.strictEqual(circular.length, 0, `unexpected circular-reference warning(s):\n${circular.join('\n')}`);

        const view = tokens.find(t => t.value.toUpperCase() === 'VIEW');
        const join = tokens.find(t => t.value.toUpperCase() === 'JOIN');
        assert.ok(ranges.some(r => r.startLine === view!.line && r.endLine === view!.finishesAt), 'VIEW should still fold');
        assert.ok(ranges.some(r => r.startLine === join!.line && r.endLine === join!.finishesAt), 'JOIN should still fold');
    });
});
