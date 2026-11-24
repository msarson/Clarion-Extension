/**
 * A CODE or DATA statement written at column 0 is still the execution marker.
 *
 * The compiler accepts it (Clarion 11.1 builds a PROGRAM, a procedure and a ROUTINE whose
 * CODE/DATA start at column 0, with or without a trailing comment).
 * The tokenizer typed it ExecutionMarker, but DocumentStructure.processLabels then turned every
 * column-0 token into a Label, the bare CODE too. DocumentStructure itself copes (it accepts a
 * Label CODE), but every reader that keys on ExecutionMarker missed it: the outline kept reading
 * the CODE section as declarations and listed `CODE Total1` and `TO Total` as variables.
 *
 * #855 still holds: `Code  LONG` declares a variable labelled Code and stays a Label.
 */
import * as assert from 'assert';
import { SymbolKind } from 'vscode-languageserver';
import { ClarionTokenizer, Token, TokenType } from '../ClarionTokenizer';
import { ClarionDocumentSymbolProvider, ClarionDocumentSymbol } from '../providers/ClarionDocumentSymbolProvider';
import { setServerInitialized } from '../serverState';

function procedureWith(codeLine: string): string[] {
    return [
        '  PROGRAM',                    // 0
        '  MAP',                        // 1
        'Worker       PROCEDURE()',     // 2
        '  END',                        // 3
        '  CODE',                       // 4
        'Worker       PROCEDURE()',     // 5
        'Total          LONG',          // 6
        'i              LONG',          // 7
        codeLine,                       // 8
        '  Total = 1',                  // 9
        '  LOOP i = 1 TO Total',        // 10
        '  END',                        // 11
        '  RETURN',                     // 12
    ];
}
const PROC_CODE_LINE = 8;

const ROUTINE_SOURCE = [
    '  PROGRAM',                        // 0
    '  MAP',                            // 1
    'Worker       PROCEDURE()',         // 2
    '  END',                            // 3
    '  CODE',                           // 4
    'Worker       PROCEDURE()',         // 5
    'Total          LONG',              // 6
    '  CODE',                           // 7
    '  DO Calc',                        // 8
    'Calc         ROUTINE',             // 9
    'DATA',                             // 10
    'r              LONG',              // 11
    'CODE',                             // 12
    '  r = 2',                          // 13
    '  LOOP r = 1 TO Total',            // 14
    '  END',                            // 15
];

const PROGRAM_SOURCE = [
    '  PROGRAM',                        // 0
    '  MAP',                            // 1
    '  END',                            // 2
    'Glob         LONG',                // 3
    'CODE',                             // 4
    '  Glob = 1',                       // 5
];

function tokenize(lines: string[]): Token[] {
    return new ClarionTokenizer(lines.join('\r\n')).tokenize();
}

function wordAt(tokens: Token[], line: number, word: string): Token {
    const t = tokens.find(t => t.line === line && t.start === 0 && t.value.toUpperCase() === word);
    assert.ok(t, `no ${word} token at column 0 of line ${line}`);
    return t!;
}

function flatten(symbols: ClarionDocumentSymbol[], out: ClarionDocumentSymbol[] = []): ClarionDocumentSymbol[] {
    for (const s of symbols) { out.push(s); if (s.children) flatten(s.children as ClarionDocumentSymbol[], out); }
    return out;
}

function variables(lines: string[]): ClarionDocumentSymbol[] {
    const outline = new ClarionDocumentSymbolProvider().provideDocumentSymbols(tokenize(lines), 'test://col0.clw');
    return flatten(outline).filter(s => s.kind === SymbolKind.Variable);
}

const show = (syms: ClarionDocumentSymbol[]) => JSON.stringify(syms.map(s => `${s.name}@${s.range.start.line}`));

suite('A CODE/DATA statement at column 0 is the execution marker', () => {
    setup(() => setServerInitialized(true));

    for (const codeLine of ['CODE', 'code', 'CODE                         ! with a comment']) {
        test(`"${codeLine}" in a procedure is an ExecutionMarker token`, () => {
            const t = wordAt(tokenize(procedureWith(codeLine)), PROC_CODE_LINE, 'CODE');
            assert.strictEqual(TokenType[t.type], 'ExecutionMarker');
        });

        test(`the outline lists no variables from the CODE section after "${codeLine}"`, () => {
            const vars = variables(procedureWith(codeLine));
            assert.deepStrictEqual(vars.filter(s => s.range.start.line >= PROC_CODE_LINE).map(s => s.name), [],
                `a CODE section declares nothing; outline variables: ${show(vars)}`);
            assert.deepStrictEqual(vars.map(s => s.range.start.line), [6, 7],
                `Total and i are still the procedure's variables; got ${show(vars)}`);
        });
    }

    test('the PROGRAM CODE at column 0 is an ExecutionMarker token', () => {
        const t = wordAt(tokenize(PROGRAM_SOURCE), 4, 'CODE');
        assert.strictEqual(TokenType[t.type], 'ExecutionMarker');
    });

    test('ROUTINE DATA and CODE at column 0 are ExecutionMarker tokens', () => {
        const tokens = tokenize(ROUTINE_SOURCE);
        assert.strictEqual(TokenType[wordAt(tokens, 10, 'DATA').type], 'ExecutionMarker');
        assert.strictEqual(TokenType[wordAt(tokens, 12, 'CODE').type], 'ExecutionMarker');
    });

    test('a ROUTINE with column-0 DATA/CODE: its DATA declares r, its CODE declares nothing', () => {
        const vars = variables(ROUTINE_SOURCE);
        assert.deepStrictEqual(vars.filter(s => s.range.start.line >= 12).map(s => s.name), [],
            `the routine's CODE section declares nothing; outline variables: ${show(vars)}`);
        assert.ok(vars.some(s => s.range.start.line === 11 && /^r\b/.test(s.name)),
            `the routine's DATA section still declares r; got ${show(vars)}`);
    });

    test('the procedure and the routine keep their CODE as execution marker', () => {
        const tokens = tokenize(procedureWith('CODE'));
        const proc = tokens.find(t => t.line === 5 && t.executionMarker);
        assert.strictEqual(proc?.executionMarker?.line, PROC_CODE_LINE);
        const rtokens = tokenize(ROUTINE_SOURCE);
        const routine = rtokens.find(t => t.line === 9 && t.executionMarker);
        assert.strictEqual(routine?.executionMarker?.line, 12);
    });

    // Controls: what must not change.
    test('an indented CODE is still an ExecutionMarker token', () => {
        const tokens = tokenize(procedureWith('  CODE'));
        const t = tokens.find(t => t.line === PROC_CODE_LINE && t.value.toUpperCase() === 'CODE');
        assert.strictEqual(t && TokenType[t.type], 'ExecutionMarker');
    });

    for (const decl of ['Code         LONG', 'Data         LONG', 'Code         LONG    ! a comment']) {
        test(`#855: "${decl}" is still a Label and a variable`, () => {
            const lines = ['  PROGRAM', '  MAP', '  END', decl, '  CODE'];
            const t = tokens0(lines, 3);
            assert.strictEqual(TokenType[t.type], 'Label');
            assert.deepStrictEqual(variables(lines).map(s => s.range.start.line), [3]);
        });
    }
});

function tokens0(lines: string[], line: number): Token {
    const t = tokenize(lines).find(t => t.line === line && t.start === 0);
    assert.ok(t, `no column-0 token on line ${line}`);
    return t!;
}
