import * as assert from 'assert';
import { ClarionTokenizer, TokenType } from '../ClarionTokenizer';

/**
 * Regression guard for the derived-type form `Label QUEUE(TypeName)` (and the
 * GROUP/RECORD equivalents), where a structure keyword appears BOTH as the
 * structure opener AND, inside the parentheses, as a base-type reference — on
 * the same line. The sharpest case is a base type whose label is itself a
 * structure keyword, e.g. `anotherQueue QUEUE(QUEUE)`.
 *
 * The #415/#416 fix must handle this: the OUTER keyword opens a structure and
 * balances to its END; the INNER (in-parentheses) keyword is a clean reference
 * (Keyword), never a phantom structure opener, never mangled. This locks in that
 * behaviour so it can't silently regress. (Navigation from the inner reference to
 * the type declaration is a separate enhancement — #417.)
 */
suite('Derived-type paren form — `Label QUEUE(QUEUE)` structure balance (#415/#416)', () => {

    const SRC = [
        '  PROGRAM',
        '  MAP',
        '  END',
        'QUEUE        QUEUE,TYPE',        // 3: a queue TYPE whose label is 'QUEUE'
        'Field1         STRING(10)',      // 4
        '             END',               // 5: closes the type queue
        'anotherQueue QUEUE(QUEUE)',      // 6: derived queue; inner (QUEUE) is a base-type ref
        'Field2         STRING(10)',      // 7
        '             END',               // 8: closes anotherQueue
        '  CODE',
    ].join('\n');

    test('both QUEUE structures open and balance to their END', () => {
        const tokens = new ClarionTokenizer(SRC).tokenize();
        const queueStructures = tokens.filter(
            t => t.type === TokenType.Structure && t.value.toUpperCase() === 'QUEUE');
        assert.strictEqual(queueStructures.length, 2,
            'expected exactly two QUEUE structure openers (the TYPE at line 3, the derived at line 6); got: ' +
            JSON.stringify(queueStructures.map(t => `L${t.line}`)));
        for (const s of queueStructures) {
            assert.notStrictEqual((s as any).finishesAt, undefined,
                `QUEUE structure at line ${s.line} must be terminated (finishesAt set) — a phantom ` +
                'inner-QUEUE structure would steal an END and leave this unbalanced.');
        }
    });

    test('the inner (QUEUE) base-type reference is a clean keyword, not a structure or a mangled residue', () => {
        const tokens = new ClarionTokenizer(SRC).tokenize();
        // No mangled "UEUE" residue anywhere.
        assert.strictEqual(
            tokens.filter(t => /^UEUE$/i.test(t.value)).length, 0,
            'the inner (QUEUE) reference must not be mangled to "UEUE"');
        // On line 6 there must be a QUEUE Keyword token (the base-type reference).
        const innerRef = tokens.find(
            t => t.line === 6 && t.type === TokenType.Keyword && t.value.toUpperCase() === 'QUEUE');
        assert.ok(innerRef, 'expected a clean QUEUE keyword token for the (QUEUE) base-type reference on line 6');
    });

    test('no unterminated structures in the snippet', () => {
        const tokens = new ClarionTokenizer(SRC).tokenize();
        const unterminated = tokens.filter(
            t => t.type === TokenType.Structure && (t as any).finishesAt === undefined);
        assert.strictEqual(unterminated.length, 0,
            'expected no unterminated structures; got: ' +
            JSON.stringify(unterminated.map(t => `${t.value}@L${t.line}`)));
    });
});
