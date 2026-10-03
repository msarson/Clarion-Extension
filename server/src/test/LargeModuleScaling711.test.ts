import * as assert from 'assert';
import * as path from 'path';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { ClarionTokenizer, Token } from '../ClarionTokenizer';
import { DocumentStructure } from '../DocumentStructure';
import { validateDiscardedReturnValuesForPlainCalls, validateReturnStatements } from '../providers/diagnostics/ReturnValueDiagnostics';

/**
 * #711 — after an edit, a hover on a 60k-line generated module waited up to 18 s: the hover re-tokenizes
 * the document, and three passes of that were quadratic in its size —
 *  - StructureProcessor.processStructureFieldPrefixes filtered every token for every PRE()'d structure;
 *  - DocumentStructure.linkUsesPass walked from the top of the document for every WINDOW;
 *  - resolveStructurePrefixTarget scanned every token for every USE(PRE:Field).
 * A fixed time budget would be flaky in CI, so this pins the SHAPE: four times the module must cost
 * well under the sixteen times a quadratic pass gives (linear is about four).
 */
// The benchmark's generator (scripts/perf/synthetic-module.js): generated-style procedures with
// local QUEUEs and GROUPs with PRE(), a WINDOW with USE() controls, ACCEPT loops and ROUTINEs.
const NEWLINE = /\r?\n/;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { syntheticModuleText } = require(path.join(__dirname, '..', '..', '..', '..', 'scripts', 'perf', 'synthetic-module.js'));

function tokenizeMs(lines: number): number {
    const text: string = syntheticModuleText(lines);
    new ClarionTokenizer(text).tokenize(); // warm-up: JIT and caches, not measured
    const runs: number[] = [];
    for (let k = 0; k < 3; k++) {
        const t0 = process.hrtime.bigint();
        new ClarionTokenizer(text).tokenize();
        runs.push(Number(process.hrtime.bigint() - t0) / 1e6);
    }
    return Math.min(...runs);
}

suite('#711 tokenizing a large module scales linearly', function () {
    this.timeout(120000);

    test('bug-pin: four times the lines costs well under sixteen times the time', () => {
        const small = tokenizeMs(4000);
        const large = tokenizeMs(16000);
        const ratio = large / small;
        assert.ok(ratio < 8, `16k lines took ${large.toFixed(0)} ms, 4k took ${small.toFixed(0)} ms: ${ratio.toFixed(1)}x (quadratic is ~16x, linear ~4x)`);
    });

    // The diagnostics the debounced re-validation runs after an edit (a hover waits behind it). Timing
    // these at small sizes is noise, so count token READS instead — deterministic: a Proxy over the
    // token array counts every element access, the filters and finds included.
    const tokenReads = (lines: number, check: (tokens: Token[], doc: TextDocument) => unknown): number => {
        const text: string = syntheticModuleText(lines);
        const doc = TextDocument.create('file:///c%3A/scale711/m.clw', 'clarion', 1, text);
        const tokens = new ClarionTokenizer(text).tokenize();
        let reads = 0;
        const counted = new Proxy(tokens, {
            get(target, prop, receiver) {
                if (typeof prop === 'string' && /^\d+$/.test(prop)) reads++;
                return Reflect.get(target, prop, receiver);
            },
        });
        check(counted, doc);
        return reads;
    };
    const assertLinear = (name: string, check: (tokens: Token[], doc: TextDocument) => unknown) => {
        const small = tokenReads(2000, check);
        const large = tokenReads(8000, check);
        const ratio = large / small;
        assert.ok(ratio < 8, `${name}: ${large} token reads for 8k lines, ${small} for 2k: ${ratio.toFixed(1)}x (quadratic is ~16x, linear ~4x)`);
    };

    test('bug-pin: the discarded-return check on plain calls reads tokens linearly', () => {
        assertLinear('validateDiscardedReturnValuesForPlainCalls', (t, d) => validateDiscardedReturnValuesForPlainCalls(t, d));
    });

    test('bug-pin: the RETURN-statement check reads tokens linearly (a MAP with an indented END)', () => {
        assertLinear('validateReturnStatements', (t, d) => validateReturnStatements(t, d));
    });

    // populateBranches (OF/ELSE/ELSIF of every CASE and IF) compared every container with every
    // other and with every branch keyword in the document. Counted, not timed (the pass takes under a
    // millisecond at small sizes, so a time ratio is noise): every read of a CASE/IF token's
    // `finishesAt` during the pass, through a counting accessor installed after process().
    const branchReads = (lines: number): number => {
        const text: string = syntheticModuleText(lines);
        const tokens = new ClarionTokenizer(text).tokenize();
        const ds = new DocumentStructure(tokens, text.split(NEWLINE));
        ds.process();
        let reads = 0;
        const byType = (ds as unknown as { structuresByType: Map<string, Token[]> }).structuresByType;
        for (const c of [...(byType.get('CASE') ?? []), ...(byType.get('IF') ?? [])]) {
            let value = c.finishesAt;
            Object.defineProperty(c, 'finishesAt', {
                get: () => { reads++; return value; },
                set: (v: number | undefined) => { value = v; },
                configurable: true, enumerable: true,
            });
        }
        (ds as unknown as { populateBranches(): void }).populateBranches();
        return reads;
    };

    test('bug-pin: the CASE/IF branch pass scales linearly', () => {
        const small = branchReads(2000);
        const large = branchReads(8000);
        const ratio = large / small;
        assert.ok(ratio < 8, `populateBranches: ${large} container reads for 8k lines, ${small} for 2k: ${ratio.toFixed(1)}x (quadratic is ~16x, linear ~4x)`);
    });
});
