import * as assert from 'assert';
import * as path from 'path';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { ClarionTokenizer, Token } from '../ClarionTokenizer';
import { validateIndistinguishablePrototypes } from '../providers/diagnostics/IndistinguishablePrototypeDiagnostics';

/**
 * #715 — the indistinguishable-prototype check filtered every token of the document once for every
 * CLASS, INTERFACE and MAP, and a generated module declares a local CLASS in every procedure: 1.2 s
 * on a 60k-line module, run by the re-validation after every edit while the next hover waited.
 * Counted, not timed (as #711): every read of a token array element, through a Proxy.
 */
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { syntheticModuleText } = require(path.join(__dirname, '..', '..', '..', '..', 'scripts', 'perf', 'synthetic-module.js'));

function tokenReads(lines: number): number {
    const text: string = syntheticModuleText(lines);
    const doc = TextDocument.create('file:///c%3A/scale715/m.clw', 'clarion', 1, text);
    const tokens = new ClarionTokenizer(text).tokenize();
    let reads = 0;
    const counted = new Proxy(tokens, {
        get(target, prop, receiver) {
            if (typeof prop === 'string' && /^\d+$/.test(prop)) reads++;
            return Reflect.get(target, prop, receiver);
        },
    });
    validateIndistinguishablePrototypes(counted as Token[], doc);
    return reads;
}

suite('#715 the indistinguishable-prototype check scales linearly', function () {
    this.timeout(120000);

    test('bug-pin: four times the lines reads well under sixteen times the tokens', () => {
        const small = tokenReads(2000);
        const large = tokenReads(8000);
        const ratio = large / small;
        assert.ok(ratio < 8, `${large} token reads for 8k lines, ${small} for 2k: ${ratio.toFixed(1)}x (quadratic is ~16x, linear ~4x)`);
    });
});
