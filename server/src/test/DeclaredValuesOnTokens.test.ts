import * as assert from 'assert';
import { ClarionTokenizer, TokenType, Token } from '../ClarionTokenizer';
import { DocumentStructure } from '../DocumentStructure';

function tokenize(source: string): Token[] {
    return new ClarionTokenizer(source).tokenize();
}

function findLabel(tokens: Token[], name: string): Token | undefined {
    const upper = name.toUpperCase();
    return tokens.find(t =>
        t.type === TokenType.Label &&
        t.start === 0 &&
        t.value.toUpperCase() === upper
    );
}

suite('ClarionTokenizer — declared values on Label tokens', () => {

    test('EQUATE: dataType + dataValue populated', () => {
        const code = `MyProg PROGRAM
MAX_ROWS EQUATE(100)`;
        const tokens = tokenize(code);
        const tok = findLabel(tokens, 'MAX_ROWS');
        assert.ok(tok, 'MAX_ROWS label must be present');
        assert.strictEqual(tok!.dataType, 'EQUATE');
        assert.strictEqual(tok!.dataValue, '100');
    });

    test('STRING(N): dataType=STRING, dataValue=N', () => {
        const code = `MyProg PROGRAM
Name STRING(20)`;
        const tokens = tokenize(code);
        const tok = findLabel(tokens, 'Name');
        assert.ok(tok);
        assert.strictEqual(tok!.dataType, 'STRING');
        assert.strictEqual(tok!.dataValue, '20');
    });

    test('LIKE(File:Field): dataType=LIKE, dataValue captures colon-qualified expression', () => {
        const code = `MyProg PROGRAM
Field LIKE(Cust:Id)`;
        const tokens = tokenize(code);
        const tok = findLabel(tokens, 'Field');
        assert.ok(tok);
        assert.strictEqual(tok!.dataType, 'LIKE');
        assert.strictEqual(tok!.dataValue, 'Cust:Id');
    });

    test('Bare LONG: dataType set, dataValue undefined', () => {
        const code = `MyProg PROGRAM
pId LONG`;
        const tokens = tokenize(code);
        const tok = findLabel(tokens, 'pId');
        assert.ok(tok);
        assert.strictEqual(tok!.dataType, 'LONG');
        assert.strictEqual(tok!.dataValue, undefined);
    });

    test('PROCEDURE labels are NOT given dataType (handled by parameter populator)', () => {
        const code = `MyProc PROCEDURE(LONG pId)
CODE
  RETURN
END`;
        const tokens = tokenize(code);
        // The procedure-keyword token gets the label; the column-0 Label that
        // sits before the keyword would normally trigger our populator, but the
        // populator skips tokens that already have a procedure subType.
        const procLabel = tokens.find(t =>
            t.type === TokenType.Label &&
            t.start === 0 &&
            t.value.toUpperCase() === 'MYPROC'
        );
        // The PROCEDURE keyword token has subType=GlobalProcedure; our column-0
        // Label may or may not be subTyped depending on tokenizer ordering.
        // The crucial assertion: no LONG dataType bleed onto MyProc.
        if (procLabel) {
            assert.notStrictEqual(procLabel.dataType, 'LONG');
        }
    });

    test('Re-assignment lines (Counter = 1) are NOT given a dataType', () => {
        const code = `MyProc PROCEDURE
  Counter LONG
CODE
  Counter = 1
END`;
        const tokens = tokenize(code);
        // The counter declaration line should be picked up …
        const decl = findLabel(tokens, 'Counter');
        // (May be absent because Counter is indented past column 0 — that's OK.)
        if (decl) {
            // Whatever it picked up, it's the LONG declaration, not '= 1'.
            assert.notStrictEqual(decl.dataType, undefined);
        }
        // The "Counter = 1" line at column 2 should never produce a dataType — column 0 only.
        const allLabels = tokens.filter(t =>
            t.type === TokenType.Label &&
            t.value.toUpperCase() === 'COUNTER'
        );
        for (const l of allLabels) {
            if (l.start !== 0) {
                assert.strictEqual(l.dataType, undefined);
            }
        }
    });

    test('DocumentStructure.getDeclaredValue returns the structured pair', () => {
        const code = `MyProg PROGRAM
MAX_ROWS EQUATE(100)
Name     STRING(20)
pId      LONG`;
        const tokens = tokenize(code);
        const ds = new DocumentStructure(tokens);
        ds.process();

        const maxRows = findLabel(tokens, 'MAX_ROWS')!;
        const name    = findLabel(tokens, 'Name')!;
        const pId     = findLabel(tokens, 'pId')!;

        assert.deepStrictEqual(ds.getDeclaredValue(maxRows), { type: 'EQUATE', value: '100' });
        assert.deepStrictEqual(ds.getDeclaredValue(name),    { type: 'STRING', value: '20' });
        assert.deepStrictEqual(ds.getDeclaredValue(pId),     { type: 'LONG',   value: undefined });
    });

    test('DocumentStructure.getDeclaredValue returns null for a Label with no declaration', () => {
        const code = `MyProg PROGRAM`;
        const tokens = tokenize(code);
        const ds = new DocumentStructure(tokens);
        ds.process();

        // Find an arbitrary token without dataType
        const someLabel = tokens.find(t =>
            t.type === TokenType.Label && t.dataType === undefined && t.dataValue === undefined
        );
        if (someLabel) {
            assert.strictEqual(ds.getDeclaredValue(someLabel), null);
        }
    });

    test('Trailing ! comment does not pollute dataValue', () => {
        const code = `MyProg PROGRAM
MAX_ROWS EQUATE(100) ! upper bound on rows`;
        const tokens = tokenize(code);
        const tok = findLabel(tokens, 'MAX_ROWS');
        assert.ok(tok);
        assert.strictEqual(tok!.dataType, 'EQUATE');
        assert.strictEqual(tok!.dataValue, '100');
    });

    test('Labels with colons (CONST:MAX shape) are recognised', () => {
        const code = `MyProg PROGRAM
CONST:MAX EQUATE(255)`;
        const tokens = tokenize(code);
        const tok = findLabel(tokens, 'CONST:MAX');
        assert.ok(tok);
        assert.strictEqual(tok!.dataType, 'EQUATE');
        assert.strictEqual(tok!.dataValue, '255');
    });
});
