/**
 * #574 — Clarion accepts whitespace BEFORE the member-access dot but not after it.
 *
 * COMPILER-VERIFIED on Clarion 12 (`F:\PlayGround\TestDottedCall`), one variant per build:
 *
 *   A   Result = Obj.GetByID(42)         compiles
 *   B   Result = Obj   .GetByID(42)      COMPILES   <- whitespace before the dot is legal
 *   E   Result = Obj   .Count            COMPILES   <- and for a property
 *   C   Result = Obj.   GetByID(42)      FAILS      <- whitespace after the dot is not
 *
 * C's diagnostics are worth recording, because they say what the compiler actually did:
 *
 *   (54,12) Warning!! : Unusual type conversion          <- read `Result = Obj`, object into a LONG
 *   (54,21) Error : Expected: <statement> <EOF> ...      <- the dot ended the statement
 *   (54,32) Error : No matching prototype available      <- GetByID(42) as a bare call
 *
 * So for C the compiler treats the dot as a STATEMENT TERMINATOR — exactly as our tokenizer already
 * does. The worry recorded on #574, that our EndStatement reading might close an enclosing IF and
 * corrupt folding and structure diagnostics, is therefore not a defect: the source is invalid and we
 * read it the same way the compiler does. That half of the issue needs no change.
 *
 * What was wrong is B and E. `StructureField`'s pattern required the dot to sit immediately after
 * the receiver, so `Obj   .GetByID` tokenized as Variable + Function — the dot dropped and a member
 * access read as a bare call to a procedure of that name. Every feature keyed on StructureField
 * missed those call sites: hover, Go to Definition, references, rename, completion, and the #517
 * unresolved-call check would report the method as undeclared.
 *
 * The rule the evidence supports, and what is implemented: whitespace may precede the dot; the dot
 * must be IMMEDIATELY followed by the member name. That keeps C a terminator.
 */
import * as assert from 'assert';
import { ClarionTokenizer, TokenType } from '../ClarionTokenizer';

suite('Whitespace around the member-access dot (#574)', () => {

    /** Tokens of the one executable line, as `Type(value)`, EndOfStatement dropped. */
    function tokensOf(line: string): string[] {
        const text = [
            '  PROGRAM',
            '  MAP',
            '  END',
            'TestClass       CLASS',
            'Count             LONG',
            'GetByID           PROCEDURE(LONG pID),LONG',
            '                END',
            'Result          LONG',
            '  CODE',
            line,
            '  RETURN',
        ].join('\r\n');
        return new ClarionTokenizer(text).tokenize()
            .filter(t => t.line === 9 && TokenType[t.type] !== 'EndOfStatement')
            .map(t => `${TokenType[t.type]}(${t.value})`);
    }

    const memberAccess = (toks: string[]) => toks.find(t => t.startsWith('StructureField('));
    const terminator = (toks: string[]) => toks.find(t => t.startsWith('EndStatement('));

    test('A — no whitespace is a member access (the shape that always worked)', () => {
        const toks = tokensOf('  Result = TestClass.GetByID(42)');
        assert.strictEqual(memberAccess(toks), 'StructureField(TestClass.GetByID)', toks.join('  '));
    });

    test('B — whitespace BEFORE the dot is a member access (compiles on Clarion 12)', () => {
        const toks = tokensOf('  Result = TestClass   .GetByID(42)');
        assert.ok(memberAccess(toks), `expected a StructureField token, got ${toks.join('  ')}`);
        assert.ok(!terminator(toks), `the dot must not become a terminator, got ${toks.join('  ')}`);
    });

    test('E — whitespace before the dot on a PROPERTY is a member access too', () => {
        const toks = tokensOf('  Result = TestClass   .Count');
        assert.ok(memberAccess(toks), `expected a StructureField token, got ${toks.join('  ')}`);
        assert.ok(!terminator(toks), `the dot must not become a terminator, got ${toks.join('  ')}`);
    });

    test('C — whitespace AFTER the dot stays a terminator, as the compiler reads it', () => {
        // Not a defect to fix: Clarion 12 rejects this line, having read the dot as the end of the
        // statement. Reinterpreting it as a member access would make us accept what the compiler
        // refuses, which is worse than mirroring it.
        const toks = tokensOf('  Result = TestClass.   GetByID(42)');
        assert.ok(terminator(toks), `expected the dot to remain an EndStatement, got ${toks.join('  ')}`);
        assert.ok(!memberAccess(toks), `must not be read as a member access, got ${toks.join('  ')}`);
    });

    test('a one-line structure terminator is still a terminator', () => {
        // The guard that matters: making whitespace-before-dot a member access must not swallow a
        // period that ends a structure. `END` here would be the same shape — name, space, dot.
        const text = [
            '  PROGRAM',
            '  MAP',
            '  END',
            'Result          LONG',
            '  CODE',
            '  IF Result = 1 THEN Result = 2 .',
            '  RETURN',
        ].join('\r\n');
        const toks = new ClarionTokenizer(text).tokenize().filter(t => t.line === 5);
        assert.ok(toks.some(t => TokenType[t.type] === 'EndStatement'),
            `the trailing period must still close the IF, got ${toks.map(t => `${TokenType[t.type]}(${t.value})`).join('  ')}`);
    });
});
