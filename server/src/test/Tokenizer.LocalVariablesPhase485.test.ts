/**
 * #485 — the tokenizer's "Procedure local variables" phase was quadratic on any
 * file with many function calls: its candidate set was every token of type
 * Procedure or Function that was not a prototype, and a function CALL
 * (`x = CLIP(y)`) is a Function token too — one with no body, no finishesAt,
 * and therefore an "EOF fallback" range. Each call then scanned forward, line
 * by line, until the next CODE keyword. On CTSQW10.CLW (5,992 lines) that was
 * 5,133 candidates, 15 million line reads and 1.47s, 8x the main tokenise pass.
 *
 * Only an IMPLEMENTATION has a local data section between its label and CODE.
 * The document-structure pass (which runs before this phase) marks those
 * GlobalProcedure / MethodImplementation. The phase must consider nothing else.
 *
 * The bound is asserted on LINE READS through a counting proxy, not on wall
 * time, so the test is deterministic. The token output is pinned unchanged.
 */

import * as assert from 'assert';
import { ClarionTokenizer, Token, TokenType } from '../ClarionTokenizer';

suite('Tokenizer — procedure local variables phase is linear (#485)', () => {
    /** P procedures, each with one local, a CODE section and C function calls. */
    function build(procCount: number, callsPerProc: number): string {
        const out: string[] = ['  PROGRAM', '  MAP'];
        for (let p = 0; p < procCount; p++) out.push(`Proc${p} PROCEDURE`);
        out.push('  END', '  CODE', '  Proc0', '');
        for (let p = 0; p < procCount; p++) {
            out.push(`Proc${p} PROCEDURE`);
            out.push(`Local${p}  LONG`);
            out.push('  CODE');
            for (let c = 0; c < callsPerProc; c++) out.push(`  Local${p} = LEN(CLIP(SUB('abc', 1, ${c})))`);
            out.push('  RETURN', '');
        }
        return out.join('\r\n');
    }

    /** Re-run only the phase under test with `lines` wrapped in a read-counting proxy. */
    function countLineReads(source: string): { reads: number; lines: number; tokens: Token[] } {
        const tokenizer = new ClarionTokenizer(source);
        const tokens = tokenizer.tokenize();
        const priv = tokenizer as unknown as { lines: string[]; tokenizeProcedureLocalVariables: () => void };
        for (const t of tokens) delete (t as unknown as { localVariablesAnalyzed?: boolean }).localVariablesAnalyzed;
        let reads = 0;
        const real = priv.lines;
        priv.lines = new Proxy(real, {
            get(target, prop, receiver) {
                if (typeof prop === 'string' && /^\d+$/.test(prop)) reads++;
                return Reflect.get(target, prop, receiver);
            }
        });
        priv.tokenizeProcedureLocalVariables();
        return { reads, lines: real.length, tokens };
    }

    test('a function call inside CODE is not a candidate — line reads stay within a small multiple of the line count', () => {
        const src = build(120, 25);                       // 120 procs, 3,000 call lines
        const { reads, lines } = countLineReads(src);
        // Linear: each procedure reads its own header lines up to CODE (a handful).
        // Quadratic (the bug): every call scans to the next CODE — ~3,000 × ~30 reads.
        assert.ok(reads <= lines * 3,
            `expected a linear bound (≤ ${lines * 3} reads for ${lines} lines); got ${reads}`);
    });

    test('quadrupling the calls per procedure does not grow the reads — calls are not candidates', () => {
        // The bug was quadratic in the CALL count (each call scanned to the next
        // CODE, and that distance grows with the calls before it). A linear phase
        // reads each procedure's header up to CODE and never looks at the calls.
        const a = countLineReads(build(60, 25)).reads;
        const b = countLineReads(build(60, 100)).reads;
        assert.ok(b <= a * 2, `reads must not grow with the number of calls; got ${a} → ${b}`);
    });

    test('a column-0 label whose first word is a statement keyword stays one Label, whatever its case', () => {
        // Exposed by the fix: the old scan-from-every-call had been synthesising a
        // token for `return:notset Equate(0)` in NetTalk's NetWeb.inc, masking that
        // the lower-case character-class order tried Keyword before Label and split
        // it into Keyword "return" + ":" + "notset". `Return:notset` never split.
        // `Omit:pXPos EQUATE(4)` (ABUserControl.CLW) is the Directive-shaped twin:
        // Directive was tried before Label in BOTH letter groups.
        for (const label of ['return:notset', 'Return:notset', 'exit:code', 'key:field', 'proc:x', 'Omit:pXPos', 'omit:x', 'Compile:flag']) {
            const src = ['  PROGRAM', '  MAP', '  END', `${label}   Equate(2)`, '  CODE', ''].join('\r\n');
            const line3 = new ClarionTokenizer(src).tokenize().filter(t => t.line === 3);
            assert.strictEqual(line3[0]?.type, TokenType.Label, `${label}: first token must be a Label; got ${TokenType[line3[0]?.type]} "${line3[0]?.value}"`);
            assert.strictEqual(line3[0]?.value, label, `${label}: the whole label, colon included; got "${line3[0]?.value}"`);
            assert.strictEqual(line3.filter(t => t.start === 0).length, 1, `${label}: exactly one token at column 0; got ${line3.filter(t => t.start === 0).map(t => TokenType[t.type] + ':' + t.value).join(', ')}`);
        }
    });

    test('guards: a real directive, PROGRAM, CODE and END at column 0 are not labels', () => {
        const src = ['  PROGRAM', '  MAP', '  END', "OMIT('_x_')", 'Foo EQUATE(1)', '_x_', '  CODE', ''].join('\r\n');
        const toks = new ClarionTokenizer(src).tokenize();
        const line3 = toks.filter(t => t.line === 3);
        assert.strictEqual(line3[0]?.type, TokenType.Directive, `OMIT('_x_') at column 0 stays a Directive; got ${TokenType[line3[0]?.type]}`);
        const prog = toks.filter(t => t.line === 0)[0];
        assert.notStrictEqual(prog?.type, TokenType.Label, 'PROGRAM is not a label');
        const code = toks.filter(t => t.line === 6)[0];
        assert.strictEqual(code?.type, TokenType.ExecutionMarker, `CODE is an execution marker; got ${TokenType[code?.type]}`);
        const end = toks.filter(t => t.line === 2)[0];
        assert.notStrictEqual(end?.type, TokenType.Label, 'END is not a label');
    });

    test('token output is unchanged: locals are still tokenised, calls are still calls', () => {
        const src = build(3, 2);
        const tokens = new ClarionTokenizer(src).tokenize();
        const locals = tokens.filter(t => /^Local\d$/.test(t.value) && t.start === 0);
        assert.strictEqual(locals.length, 3, `each procedure's local must have a column-0 token; got ${locals.length}`);
        const impls = tokens.filter(t => t.subType === TokenType.GlobalProcedure);
        assert.strictEqual(impls.length, 3, `three implementations; got ${impls.length}`);
        const calls = tokens.filter(t => t.type === TokenType.Function && t.subType === undefined && t.value.toUpperCase() === 'CLIP');
        assert.strictEqual(calls.length, 6, `six CLIP calls stay plain Function tokens; got ${calls.length}`);
    });
});
