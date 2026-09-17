import * as assert from 'assert';
import { ClarionTokenizer, TokenType } from '../ClarionTokenizer';
import { DocumentStructure } from '../DocumentStructure';

/**
 * #589 — a period terminator was only recognised when the next character was
 * whitespace, `!` or end of line. Any other following character and NO token was
 * emitted at all: the period was silently dropped and the structure it closes
 * stayed open, swallowing the rest of the file.
 *
 * Two legal shapes fell outside that lookahead, both of them documented language:
 *
 *   1. `.` immediately before `;` — the semi-colon is an optional statement
 *      separator, so `IF a THEN b.; IF c THEN d.` is ordinary source. Shipped
 *      Clarion libsrc uses it (CBWndPreview.clw:4234), where the unclosed IF
 *      leaked from line 4234 to 5082.
 *
 *   2. Adjacent periods — the help's END page says that when several nested
 *      structures terminate at the same place, multiple periods on one line are
 *      used instead of ENDs. Only the LAST period was tokenized, so every outer
 *      structure was left open.
 *
 * The controls pin what must NOT change: a decimal number, a qualified name and
 * a file name in a string keep their dots.
 */

const prog = (body: string) => `PROGRAM\n  MAP\n  END\n  CODE\n${body}\n`;
const CODE_LINE = 4;

function codeTokens(body: string) {
    return new ClarionTokenizer(prog(body)).tokenize().filter(t => t.line === CODE_LINE);
}

function terminators(body: string) {
    return codeTokens(body).filter(t => t.type === TokenType.EndStatement).map(t => t.start);
}

suite('ClarionTokenizer — period terminators before ";" and before another period (#589)', () => {

    test('a period immediately followed by ";" is a terminator', () => {
        //      0123456789...
        const body = `  IF a THEN b = 1.; c = 2`;
        assert.deepStrictEqual(terminators(body), [17],
            'the period at column 17 closes the IF even though ";" follows it');
    });

    test('the shape shipped in libsrc (CBWndPreview.clw:4234) closes its IF', () => {
        const body = `  IF P>1 THEN HelpCW(1).; IF P=1 THEN MESSAGE('x').`;
        assert.deepStrictEqual(terminators(body), [23, 50],
            'both one-line IFs are closed: the first by the period before ";"');
    });

    test('two adjacent periods close both nested structures', () => {
        const body = `  IF a THEN IF b THEN c = 1..`;
        assert.deepStrictEqual(terminators(body), [27, 28],
            'the inner IF is closed by the first period, the outer by the second');
    });

    test('three adjacent periods close all three nested structures', () => {
        const body = `  LOOP i = 1 TO 2 ; IF a THEN IF b THEN c = 1...`;
        assert.deepStrictEqual(terminators(body), [45, 46, 47]);
    });

    test('each period is linked to the structure it closes', () => {
        const source = prog(`  IF a THEN IF b THEN c = 1..`);
        const tokens = new ClarionTokenizer(source).tokenize();
        new DocumentStructure(tokens).process();

        const periods = tokens.filter(t => t.line === CODE_LINE && t.type === TokenType.EndStatement);
        assert.strictEqual(periods.length, 2, 'both periods are terminators');
        for (const p of periods) {
            assert.ok(p.parent, `the period at column ${p.start} names the structure it closes`);
            assert.strictEqual(p.parent!.value.toUpperCase(), 'IF');
        }
        assert.notStrictEqual(periods[0].parent, periods[1].parent,
            'the two periods close DIFFERENT IFs — the inner one first');
        assert.strictEqual(periods[0].parent!.start, 12, 'the first period closes the inner IF');
        assert.strictEqual(periods[1].parent!.start, 2, 'the second period closes the outer IF');
    });

    test('a structure after the ";" is not left open', () => {
        const source = prog(`  IF a THEN b = 1.; IF c THEN d = 2.`);
        const tokens = new ClarionTokenizer(source).tokenize();
        new DocumentStructure(tokens).process();
        const ifs = tokens.filter(t => t.line === CODE_LINE && t.type === TokenType.Structure);
        assert.strictEqual(ifs.length, 2, 'both IFs are structures');
        assert.deepStrictEqual(terminators(`  IF a THEN b = 1.; IF c THEN d = 2.`), [17, 35]);
    });

    // ---- controls: dots that are NOT terminators keep their current meaning

    test('control — a decimal number is untouched', () => {
        const toks = codeTokens(`  x = 1.5 ; y = 2`);
        assert.strictEqual(toks.filter(t => t.type === TokenType.EndStatement).length, 0,
            'the dot in 1.5 is part of the number, not a terminator');
    });

    test('control — a qualified name is untouched', () => {
        const toks = codeTokens(`  x = obj.field`);
        assert.strictEqual(toks.filter(t => t.type === TokenType.EndStatement).length, 0);
        assert.ok(toks.some(t => t.value === 'obj.field'), 'obj.field stays one token');
    });

    test('control — a dot inside a string literal is untouched', () => {
        const toks = codeTokens(`  x = 'a.inc;b.inc'`);
        assert.strictEqual(toks.filter(t => t.type === TokenType.EndStatement).length, 0);
    });

    test('control — a period before whitespace, a comment or EOL still terminates', () => {
        assert.deepStrictEqual(terminators(`  IF a THEN b = 1. ; c = 2`), [17]);
        assert.deepStrictEqual(terminators(`  IF a THEN b = 1.! done`), [17]);
        assert.deepStrictEqual(terminators(`  IF a THEN b = 1.`), [17]);
    });
});
