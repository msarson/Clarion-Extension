import * as assert from 'assert';
import * as path from 'path';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { ClarionTokenizer } from '../ClarionTokenizer';
import { validateFileStructures, validateStructureTerminators } from '../providers/diagnostics/StructureDiagnostics';

/**
 * #715 step 2 — the two slowest checks of the re-validation that follows an edit tested every token
 * against every OMIT/COMPILE block (and the terminator check looked up every IF's position by
 * scanning the token array): 206 ms and 86 ms on a 60k-line module, run in one block that a hover
 * landing then waited behind. Four times the lines must cost well under the sixteen times a
 * quadratic pass gives.
 */
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { syntheticModuleText } = require(path.join(__dirname, '..', '..', '..', '..', 'scripts', 'perf', 'synthetic-module.js'));

function bestMs(lines: number, check: (t: ReturnType<ClarionTokenizer['tokenize']>, d: TextDocument) => unknown): number {
    const text: string = syntheticModuleText(lines, { shape: 'giant' });
    const doc = TextDocument.create('file:///c%3A/sd715/m.clw', 'clarion', 1, text);
    const tokens = new ClarionTokenizer(text).tokenize();
    check(tokens, doc); // warm-up
    const runs: number[] = [];
    for (let k = 0; k < 3; k++) {
        const t0 = process.hrtime.bigint();
        check(tokens, doc);
        runs.push(Number(process.hrtime.bigint() - t0) / 1e6);
    }
    return Math.min(...runs);
}

suite('#715 the structure checks scale linearly', function () {
    this.timeout(120000);
    const assertLinear = (name: string, check: (t: ReturnType<ClarionTokenizer['tokenize']>, d: TextDocument) => unknown) => {
        const small = bestMs(8000, check);
        const large = bestMs(32000, check);
        const ratio = large / small;
        assert.ok(ratio < 8, `${name}: 32k lines took ${large.toFixed(1)} ms, 8k took ${small.toFixed(1)} ms: ${ratio.toFixed(1)}x (quadratic is ~16x, linear ~4x)`);
    };
    test('bug-pin: validateStructureTerminators', () => assertLinear('validateStructureTerminators', validateStructureTerminators));
    test('bug-pin: validateFileStructures', () => assertLinear('validateFileStructures', validateFileStructures));
});
