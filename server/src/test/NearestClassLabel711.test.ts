import * as assert from 'assert';
import * as path from 'path';
import { ClarionTokenizer, Token } from '../ClarionTokenizer';
import { nearestClassLabel } from '../utils/ClassNameUtils';

const NEWLINE = /\r?\n/;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { syntheticModuleText } = require(path.join(__dirname, '..', '..', '..', '..', 'scripts', 'perf', 'synthetic-module.js'));

/**
 * #711 — nearestClassLabel walked every token once per CLASS in the file, looking for that class's
 * label line: classes x tokens on every call. A generated module declares a local class in every
 * procedure (`ThisWindow CLASS(WindowManager)`), and the call runs for each receiver the
 * discarded-return pass resolves and on hover/F12 of `obj.member`: on a large module the background
 * pass held the event loop long enough that hovers in the first seconds timed out (1.0.6 vs 1.0.5,
 * from #654). Counted with a Proxy over the token array, a warm call at two sizes.
 */
suite('#711 nearestClassLabel does not walk the file once per class', function () {
    this.timeout(120000);

    const readsForWarmCall = (lines: number): { reads: number; found: Token | null; line: number } => {
        const text: string = syntheticModuleText(lines);
        const tokens = new ClarionTokenizer(text).tokenize();
        const textLines = text.split(NEWLINE);
        // The second procedure's call `ThisWindow.Kill()`.
        let seen = 0;
        let callLine = -1;
        for (let i = 0; i < textLines.length && callLine < 0; i++) {
            if (textLines[i].includes('ThisWindow.Kill()') && ++seen === 2) callLine = i;
        }
        assert.ok(callLine >= 0, 'the synthetic module calls ThisWindow.Kill()');

        let reads = 0;
        const counted = new Proxy(tokens, {
            get(target, prop, receiver) {
                if (typeof prop === 'string' && /^\d+$/.test(prop)) reads++;
                return Reflect.get(target, prop, receiver);
            },
        });
        nearestClassLabel(counted, 'ThisWindow', callLine); // warm-up: per-array indexes
        reads = 0;
        const found = nearestClassLabel(counted, 'ThisWindow', callLine);
        return { reads, found, line: callLine };
    };

    test('the label found is the nearest ThisWindow declared at or above the call', () => {
        const { found, line } = readsForWarmCall(2000);
        assert.ok(found, 'a ThisWindow label');
        assert.strictEqual(found!.value, 'ThisWindow');
        assert.ok(found!.line <= line, 'declared above the call');
    });

    test('bug-pin: four times the module costs a warm call about the same token reads', () => {
        const small = readsForWarmCall(2000).reads;
        const large = readsForWarmCall(8000).reads;
        assert.ok(large <= Math.max(50, small * 2),
            `a warm call read ${large} tokens at 8k lines, ${small} at 2k (classes x tokens grows ~16x)`);
    });
});
