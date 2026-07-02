import * as assert from 'assert';
import { ClarionTokenizer, TokenType } from '../ClarionTokenizer';
import { DocumentStructure } from '../DocumentStructure';

// Issue #65 — labeled LOOP / ACCEPT and BREAK/CYCLE label-target resolution.
// Verifies that DocumentStructure attaches `token.label` and `token.finishesAt`
// to LOOP/ACCEPT structure tokens preceded by a column-0 label, and that
// resolveLoopLabel() locates the enclosing target for BREAK/CYCLE consumers.

function build(code: string): { tokens: ReturnType<ClarionTokenizer['tokenize']>; structure: DocumentStructure } {
    const tokens = new ClarionTokenizer(code).tokenize();
    const structure = new DocumentStructure(tokens);
    structure.process();
    return { tokens, structure };
}

function findStructure(tokens: ReturnType<ClarionTokenizer['tokenize']>, value: string, line: number) {
    return tokens.find(t =>
        t.type === TokenType.Structure &&
        t.value.toUpperCase() === value.toUpperCase() &&
        t.line === line
    );
}

suite('Issue #65 — Labeled LOOP / ACCEPT', () => {

    suite('DocumentStructure: token.label on labelled LOOP/ACCEPT', () => {
        test('Loop1 LOOP attaches label "Loop1" to the LOOP token', () => {
            const code = `TestProc PROCEDURE()
CODE
Loop1 LOOP
  BREAK
END
RETURN`;
            const { tokens } = build(code);
            const loop = findStructure(tokens, 'LOOP', 2);
            assert.ok(loop, 'LOOP token should exist');
            assert.strictEqual(loop!.label, 'Loop1', 'LOOP token should carry label "Loop1"');
        });

        test('Outer ACCEPT attaches label "Outer" to the ACCEPT token', () => {
            const code = `TestProc PROCEDURE()
CODE
Outer ACCEPT
  BREAK
END
RETURN`;
            const { tokens } = build(code);
            const accept = findStructure(tokens, 'ACCEPT', 2);
            assert.ok(accept, 'ACCEPT token should exist');
            assert.strictEqual(accept!.label, 'Outer');
        });

        // Note: a bare `LOOP` / `ACCEPT` at column 0 is mistyped as TokenType.Label by the
        // tokenizer (long-standing quirk) — these tests use indented forms, which are
        // typed as TokenType.Structure correctly. Verifying that the indented unlabelled
        // case is NOT promoted by the issue-#65 leading-Variable fallback above.
        test('Unlabelled LOOP has no label', () => {
            const code = `TestProc PROCEDURE()
CODE
  LOOP
    BREAK
  END
RETURN`;
            const { tokens } = build(code);
            const loop = findStructure(tokens, 'LOOP', 2);
            assert.ok(loop);
            assert.strictEqual(loop!.label, undefined);
        });

        test('Unlabelled ACCEPT has no label', () => {
            const code = `TestProc PROCEDURE()
CODE
  ACCEPT
    BREAK
  END
RETURN`;
            const { tokens } = build(code);
            const accept = findStructure(tokens, 'ACCEPT', 2);
            assert.ok(accept);
            assert.strictEqual(accept!.label, undefined);
        });
    });

    suite('DocumentStructure: token.finishesAt on labelled LOOP/ACCEPT', () => {
        test('finishesAt points to the closing END line', () => {
            const code = `TestProc PROCEDURE()
CODE
Loop1 LOOP
  BREAK
END
RETURN`;
            const { tokens } = build(code);
            const loop = findStructure(tokens, 'LOOP', 2);
            assert.ok(loop);
            assert.strictEqual(loop!.finishesAt, 4, 'LOOP should end at line 4 (END)');
        });

        test('Nested labelled LOOPs each get their own finishesAt', () => {
            const code = `TestProc PROCEDURE()
CODE
Outer LOOP
  Inner LOOP
    BREAK Outer
  END
END
RETURN`;
            const { tokens } = build(code);
            const outer = findStructure(tokens, 'LOOP', 2);
            const inner = findStructure(tokens, 'LOOP', 3);
            assert.strictEqual(outer!.label, 'Outer');
            assert.strictEqual(inner!.label, 'Inner');
            assert.strictEqual(inner!.finishesAt, 5, 'Inner LOOP closes at line 5');
            assert.strictEqual(outer!.finishesAt, 6, 'Outer LOOP closes at line 6');
        });
    });

    suite('DocumentStructure.resolveLoopLabel()', () => {
        test('returns the LOOP token when name + line match', () => {
            const code = `TestProc PROCEDURE()
CODE
Loop1 LOOP
  BREAK Loop1
END
RETURN`;
            const { tokens, structure } = build(code);
            const loop = findStructure(tokens, 'LOOP', 2);
            const resolved = structure.resolveLoopLabel('Loop1', 3);
            assert.strictEqual(resolved, loop, 'Should resolve to the LOOP token at line 2');
        });

        test('is case-insensitive on the name', () => {
            const code = `TestProc PROCEDURE()
CODE
Loop1 LOOP
  CYCLE LOOP1
END
RETURN`;
            const { tokens, structure } = build(code);
            const loop = findStructure(tokens, 'LOOP', 2);
            assert.strictEqual(structure.resolveLoopLabel('LOOP1', 3), loop);
            assert.strictEqual(structure.resolveLoopLabel('loop1', 3), loop);
            assert.strictEqual(structure.resolveLoopLabel('LoOp1', 3), loop);
        });

        test('resolves outer label from inside nested inner loop', () => {
            const code = `TestProc PROCEDURE()
CODE
Outer LOOP
  Inner LOOP
    BREAK Outer
  END
END
RETURN`;
            const { tokens, structure } = build(code);
            const outer = findStructure(tokens, 'LOOP', 2);
            // Line 4 is inside both Outer (lines 2-6) and Inner (lines 3-5).
            // BREAK Outer should resolve to the outer LOOP, not the inner.
            assert.strictEqual(structure.resolveLoopLabel('Outer', 4), outer);
        });

        test('resolves ACCEPT-labelled target', () => {
            const code = `TestProc PROCEDURE()
CODE
Outer ACCEPT
  IF True
    BREAK Outer
  END
END
RETURN`;
            const { tokens, structure } = build(code);
            const accept = findStructure(tokens, 'ACCEPT', 2);
            assert.strictEqual(structure.resolveLoopLabel('Outer', 4), accept);
        });

        test('returns undefined for unknown label', () => {
            const code = `TestProc PROCEDURE()
CODE
Loop1 LOOP
  BREAK NotALabel
END
RETURN`;
            const { structure } = build(code);
            assert.strictEqual(structure.resolveLoopLabel('NotALabel', 3), undefined);
        });

        test('returns undefined when the line is outside any labelled loop/accept', () => {
            const code = `TestProc PROCEDURE()
CODE
Loop1 LOOP
  BREAK
END
RETURN`;
            const { structure } = build(code);
            // Line 5 is on RETURN, after the LOOP closes — out of scope.
            assert.strictEqual(structure.resolveLoopLabel('Loop1', 5), undefined);
        });

        test('does not match unlabelled LOOP/ACCEPT', () => {
            const code = `TestProc PROCEDURE()
CODE
LOOP
  BREAK
END
RETURN`;
            const { structure } = build(code);
            // Empty / missing name lookups must not surface unlabelled structures.
            assert.strictEqual(structure.resolveLoopLabel('', 3), undefined);
            assert.strictEqual(structure.resolveLoopLabel('LOOP', 3), undefined);
        });

        test('skips outer labelled LOOP when query targets a different name', () => {
            const code = `TestProc PROCEDURE()
CODE
Outer LOOP
  Inner LOOP
    BREAK Inner
  END
END
RETURN`;
            const { tokens, structure } = build(code);
            const inner = findStructure(tokens, 'LOOP', 3);
            assert.strictEqual(structure.resolveLoopLabel('Inner', 4), inner);
        });
    });
});
