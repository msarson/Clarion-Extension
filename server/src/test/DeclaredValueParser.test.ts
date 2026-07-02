import * as assert from 'assert';
import { DeclaredValueParser } from '../tokenizer/DeclaredValueParser';

suite('DeclaredValueParser', () => {

    test('returns null for empty / non-declaration lines', () => {
        assert.strictEqual(DeclaredValueParser.parse(''), null);
        assert.strictEqual(DeclaredValueParser.parse('   '), null);
        assert.strictEqual(DeclaredValueParser.parse('! just a comment'), null);
        assert.strictEqual(DeclaredValueParser.parse('  Counter = 1'), null);
    });

    test('parses EQUATE with numeric value', () => {
        assert.deepStrictEqual(
            DeclaredValueParser.parse('MAX_ROWS EQUATE(100)'),
            { dataType: 'EQUATE', dataValue: '100' }
        );
    });

    test('parses EQUATE with string value', () => {
        assert.deepStrictEqual(
            DeclaredValueParser.parse("APP_NAME EQUATE('MyApp')"),
            { dataType: 'EQUATE', dataValue: "'MyApp'" }
        );
    });

    test('parses STRING(N)', () => {
        assert.deepStrictEqual(
            DeclaredValueParser.parse('Name STRING(20)'),
            { dataType: 'STRING', dataValue: '20' }
        );
    });

    test('parses LIKE(File:Field) with colon-qualified inner expression', () => {
        assert.deepStrictEqual(
            DeclaredValueParser.parse('Field LIKE(Cust:Id)'),
            { dataType: 'LIKE', dataValue: 'Cust:Id' }
        );
    });

    test('parses bare type without parens (LONG, BYTE, DATE, TIME)', () => {
        assert.deepStrictEqual(DeclaredValueParser.parse('pId LONG'),    { dataType: 'LONG' });
        assert.deepStrictEqual(DeclaredValueParser.parse('flag BYTE'),   { dataType: 'BYTE' });
        assert.deepStrictEqual(DeclaredValueParser.parse('birth DATE'),  { dataType: 'DATE' });
        assert.deepStrictEqual(DeclaredValueParser.parse('start TIME'),  { dataType: 'TIME' });
    });

    test('captures DECIMAL(20,2) with comma in arg', () => {
        assert.deepStrictEqual(
            DeclaredValueParser.parse('Amount DECIMAL(20,2)'),
            { dataType: 'DECIMAL', dataValue: '20,2' }
        );
    });

    test('keyword is upper-cased even if source is lower / mixed', () => {
        assert.deepStrictEqual(DeclaredValueParser.parse('x equate(1)'),  { dataType: 'EQUATE', dataValue: '1' });
        assert.deepStrictEqual(DeclaredValueParser.parse('y String(10)'), { dataType: 'STRING', dataValue: '10' });
        assert.deepStrictEqual(DeclaredValueParser.parse('z LonG'),       { dataType: 'LONG' });
    });

    test('tolerates extra whitespace and tabs between label and type', () => {
        assert.deepStrictEqual(
            DeclaredValueParser.parse('MAX_ROWS\t\tEQUATE(  100  )'),
            { dataType: 'EQUATE', dataValue: '  100  ' }
        );
    });

    test('strips trailing ! comment before parsing', () => {
        assert.deepStrictEqual(
            DeclaredValueParser.parse('MAX_ROWS EQUATE(100)  ! upper bound'),
            { dataType: 'EQUATE', dataValue: '100' }
        );
    });

    test('does NOT mistake `!` inside a string literal as a comment', () => {
        assert.deepStrictEqual(
            DeclaredValueParser.parse("MSG EQUATE('Hello!  World')"),
            { dataType: 'EQUATE', dataValue: "'Hello!  World'" }
        );
    });

    test('returns null for PROCEDURE and FUNCTION (not data-type keywords)', () => {
        assert.strictEqual(DeclaredValueParser.parse('MyProc PROCEDURE'), null);
        assert.strictEqual(DeclaredValueParser.parse('MyFn FUNCTION(LONG)'), null);
        assert.strictEqual(DeclaredValueParser.parse('MyProc PROCEDURE,VIRTUAL'), null);
    });

    test('GROUP / QUEUE / FILE / RECORD produce dataType only (no value)', () => {
        // Inline structures legitimately produce a Label + structure-keyword token
        // pair. v1 captures the type tag for hover/inspection — the field structure
        // itself is the parent-tree's job.
        assert.deepStrictEqual(DeclaredValueParser.parse('MyGrp  GROUP'),  { dataType: 'GROUP' });
        assert.deepStrictEqual(DeclaredValueParser.parse('MyQ    QUEUE'),  { dataType: 'QUEUE' });
        assert.deepStrictEqual(DeclaredValueParser.parse('MyFile FILE'),   { dataType: 'FILE' });
        assert.deepStrictEqual(DeclaredValueParser.parse('Rec    RECORD'), { dataType: 'RECORD' });
    });

    test('does not split on commas inside the parenthesised arg', () => {
        // Already covered by DECIMAL(20,2) — sanity-check with another shape.
        assert.deepStrictEqual(
            DeclaredValueParser.parse('Args STRING(LEN(SomeFunc(1,2,3)))'),
            { dataType: 'STRING', dataValue: 'LEN(SomeFunc(1,2,3))' }
        );
    });

    test('returns null when first identifier looks like a label but is followed by `=` or operator', () => {
        // Re-assignments and expressions shouldn't be picked up as declarations.
        assert.strictEqual(DeclaredValueParser.parse('Counter = 1'), null);
        assert.strictEqual(DeclaredValueParser.parse('Counter += 1'), null);
    });

    test('isDataTypeKeyword identifies recognised triggers', () => {
        assert.strictEqual(DeclaredValueParser.isDataTypeKeyword('equate'), true);
        assert.strictEqual(DeclaredValueParser.isDataTypeKeyword('STRING'), true);
        assert.strictEqual(DeclaredValueParser.isDataTypeKeyword('Long'),   true);
        assert.strictEqual(DeclaredValueParser.isDataTypeKeyword('GROUP'),  true);
        assert.strictEqual(DeclaredValueParser.isDataTypeKeyword('PROCEDURE'), false);
        assert.strictEqual(DeclaredValueParser.isDataTypeKeyword('IF'),       false);
    });

    test('label may include colons (CONST:MAX shape)', () => {
        assert.deepStrictEqual(
            DeclaredValueParser.parse('CONST:MAX EQUATE(255)'),
            { dataType: 'EQUATE', dataValue: '255' }
        );
    });
});
