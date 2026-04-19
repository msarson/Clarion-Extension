import * as assert from 'assert';
import { Position, Range, SelectionRange } from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { ClarionTokenizer } from '../ClarionTokenizer';
import { DocumentStructure } from '../DocumentStructure';
import { buildSelectionChain } from '../providers/SelectionRangeProvider';

function tokenize(code: string) {
    const lines = code.split(/\r?\n/);
    const tokenizer = new ClarionTokenizer(code);
    const tokens = tokenizer.tokenize();
    new DocumentStructure(tokens, lines).process();
    return { tokens, lines };
}

function cursor(line: number, char: number): Position {
    return Position.create(line, char);
}

function rangeStr(r: Range): string {
    return `(${r.start.line},${r.start.character})-(${r.end.line},${r.end.character})`;
}

/** Collect all ranges in the chain from innermost to outermost */
function collectChain(sr: SelectionRange): Range[] {
    const result: Range[] = [sr.range];
    let current = sr.parent;
    while (current) {
        result.push(current.range);
        current = current.parent;
    }
    return result;
}

// ─────────────────────────────────────────────────────────────────────────────
suite('SelectionRangeProvider — buildSelectionChain', () => {

    // ── 1. Flat procedure ────────────────────────────────────────────────────

    suite('flat procedure', () => {
        const code = [
            'MyProc  PROCEDURE()',   // 0
            'RetVal  LONG',          // 1
            'CODE',                  // 2
            '  RetVal = 1',          // 3
            '  RETURN RetVal',       // 4
        ].join('\n');

        test('cursor on CODE keyword: token → line → procedure', () => {
            const { tokens, lines } = tokenize(code);
            const chain = buildSelectionChain(tokens, lines, cursor(2, 0));
            const ranges = collectChain(chain);
            // Innermost: CODE token
            assert.strictEqual(ranges[0].start.line, 2, 'innermost should be token line');
            assert.ok(ranges[0].start.character >= 0 && ranges[0].end.character > ranges[0].start.character,
                'token range should have nonzero width');
            // Should contain a range covering whole procedure
            const procRange = ranges.find(r => r.start.line === 0 && r.end.line === 4);
            assert.ok(procRange, `Should have procedure range (0–4). Got: ${ranges.map(rangeStr).join(', ')}`);
        });

        test('cursor inside code line: token → line → procedure', () => {
            const { tokens, lines } = tokenize(code);
            // cursor on "RetVal" on line 3, col 2
            const chain = buildSelectionChain(tokens, lines, cursor(3, 2));
            const ranges = collectChain(chain);
            const procRange = ranges.find(r => r.start.line === 0 && r.end.line === 4);
            assert.ok(procRange, `Procedure range missing. Got: ${ranges.map(rangeStr).join(', ')}`);
        });

        test('ranges are in innermost-to-outermost order', () => {
            const { tokens, lines } = tokenize(code);
            const chain = buildSelectionChain(tokens, lines, cursor(3, 2));
            const ranges = collectChain(chain);
            for (let i = 0; i < ranges.length - 1; i++) {
                const inner = ranges[i];
                const outer = ranges[i + 1];
                const innerLines = inner.end.line - inner.start.line;
                const outerLines = outer.end.line - outer.start.line;
                assert.ok(
                    outerLines >= innerLines,
                    `Range ${i+1} should be >= range ${i}. Got ${rangeStr(inner)} and ${rangeStr(outer)}`
                );
            }
        });
    });

    // ── 2. WINDOW structure ──────────────────────────────────────────────────

    suite('WINDOW structure', () => {
        const code = [
            'TestProc  PROCEDURE()',            // 0
            'Window   WINDOW(\'My App\'),AT(,,640,480),GRAY',  // 1  (label = Window, keyword = WINDOW)
            '  PANEL,AT(10,10,620,430)',        // 2
            '  BUTTON(\'Close\'),AT(580,450,50,20)',  // 3
            'END',                              // 4
            'CODE',                             // 5
            'END',                              // 6
        ].join('\n');

        test('cursor on PANEL line: chain includes WINDOW range and procedure range', () => {
            const { tokens, lines } = tokenize(code);
            const chain = buildSelectionChain(tokens, lines, cursor(2, 2));
            const ranges = collectChain(chain);
            // Should include WINDOW range (1–4)
            const winRange = ranges.find(r => r.start.line === 1 && r.end.line === 4);
            assert.ok(winRange, `WINDOW range (1–4) missing. Got: ${ranges.map(rangeStr).join(', ')}`);
            // Should include procedure range (0–6)
            const procRange = ranges.find(r => r.start.line === 0 && r.end.line === 6);
            assert.ok(procRange, `Procedure range (0–6) missing. Got: ${ranges.map(rangeStr).join(', ')}`);
            // WINDOW range must come before (inner to) procedure range
            const winIdx = ranges.indexOf(winRange!);
            const procIdx = ranges.indexOf(procRange!);
            assert.ok(winIdx < procIdx, 'WINDOW range should be inner to procedure range');
        });

        test('cursor on WINDOW header line: chain includes WINDOW range', () => {
            const { tokens, lines } = tokenize(code);
            const chain = buildSelectionChain(tokens, lines, cursor(1, 10));
            const ranges = collectChain(chain);
            const winRange = ranges.find(r => r.start.line === 1 && r.end.line === 4);
            assert.ok(winRange, `WINDOW range (1–4) missing. Got: ${ranges.map(rangeStr).join(', ')}`);
        });

        test('cursor on END line of WINDOW: chain includes WINDOW range', () => {
            const { tokens, lines } = tokenize(code);
            const chain = buildSelectionChain(tokens, lines, cursor(4, 0));
            const ranges = collectChain(chain);
            const winRange = ranges.find(r => r.start.line === 1 && r.end.line === 4);
            assert.ok(winRange, `WINDOW range (1–4) missing for END cursor. Got: ${ranges.map(rangeStr).join(', ')}`);
        });
    });

    // ── 3. Nested CLASS structure ────────────────────────────────────────────

    suite('nested CLASS', () => {
        const code = [
            'MyClass CLASS',          // 0
            'Init  PROCEDURE()',      // 1
            'END',                    // 2
        ].join('\n');

        test('cursor on method declaration: chain includes CLASS range', () => {
            const { tokens, lines } = tokenize(code);
            const chain = buildSelectionChain(tokens, lines, cursor(1, 0));
            const ranges = collectChain(chain);
            const classRange = ranges.find(r => r.start.line === 0 && r.end.line === 2);
            assert.ok(classRange, `CLASS range (0–2) missing. Got: ${ranges.map(rangeStr).join(', ')}`);
        });
    });

    // ── 4. Cursor in whitespace (no token) ──────────────────────────────────

    suite('cursor in whitespace', () => {
        const code = [
            'MyProc  PROCEDURE()',   // 0
            'CODE',                  // 1
            '  x = 1',              // 2
            'END',                   // 3
        ].join('\n');

        test('cursor on leading whitespace: still returns line and procedure ranges', () => {
            const { tokens, lines } = tokenize(code);
            // col 0 of line 2 is a space
            const chain = buildSelectionChain(tokens, lines, cursor(2, 0));
            const ranges = collectChain(chain);
            const lineRange = ranges.find(r => r.start.line === 2 && r.end.line === 2);
            assert.ok(lineRange, `Line range for line 2 missing. Got: ${ranges.map(rangeStr).join(', ')}`);
            const procRange = ranges.find(r => r.start.line === 0 && r.end.line === 3);
            assert.ok(procRange, `Procedure range (0–3) missing. Got: ${ranges.map(rangeStr).join(', ')}`);
        });
    });

    // ── 5. Top-level code (not inside structure) ─────────────────────────────

    suite('top-level / no container', () => {
        const code = [
            'PROGRAM',               // 0
            'MAP',                   // 1
            'END',                   // 2
        ].join('\n');

        test('cursor at top level: returns at least line and document ranges', () => {
            const { tokens, lines } = tokenize(code);
            const chain = buildSelectionChain(tokens, lines, cursor(0, 0));
            const ranges = collectChain(chain);
            assert.ok(ranges.length >= 2, `Expected ≥2 ranges, got ${ranges.length}: ${ranges.map(rangeStr).join(', ')}`);
            // Outermost should cover whole document
            const last = ranges[ranges.length - 1];
            assert.strictEqual(last.start.line, 0);
            assert.strictEqual(last.end.line, lines.length - 1);
        });
    });

    // ── 6. Structure range endpoints ────────────────────────────────────────

    suite('range endpoints', () => {
        const code = [
            'AProc  PROCEDURE()',    // 0
            'CODE',                  // 1
            'END',                   // 2  ← finishesAt for procedure
        ].join('\n');

        test('procedure range starts at column 0 of header line', () => {
            const { tokens, lines } = tokenize(code);
            const chain = buildSelectionChain(tokens, lines, cursor(1, 0));
            const ranges = collectChain(chain);
            const procRange = ranges.find(r => r.start.line === 0 && r.end.line === 2);
            assert.ok(procRange, `Procedure range missing. Got: ${ranges.map(rangeStr).join(', ')}`);
            assert.strictEqual(procRange!.start.character, 0);
            assert.strictEqual(procRange!.end.character, lines[2].length);
        });

        test('no duplicate ranges in chain', () => {
            const { tokens, lines } = tokenize(code);
            const chain = buildSelectionChain(tokens, lines, cursor(1, 0));
            const ranges = collectChain(chain);
            const strs = ranges.map(rangeStr);
            const unique = new Set(strs);
            assert.strictEqual(unique.size, strs.length,
                `Duplicate ranges in chain: ${strs.join(', ')}`);
        });
    });
});
