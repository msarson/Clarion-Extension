import * as assert from 'assert';
import { ProcedureParameterParser } from '../tokenizer/ProcedureParameterParser';

suite('ProcedureParameterParser', () => {

    test('returns empty array when no parameter list is present', () => {
        assert.deepStrictEqual(ProcedureParameterParser.parse('MyProc PROCEDURE'), []);
        assert.deepStrictEqual(ProcedureParameterParser.parse('MyProc PROCEDURE,VIRTUAL'), []);
    });

    test('returns empty array for an empty parameter list', () => {
        assert.deepStrictEqual(ProcedureParameterParser.parse('MyProc PROCEDURE()'), []);
        assert.deepStrictEqual(ProcedureParameterParser.parse('MyProc PROCEDURE(   )'), []);
    });

    test('parses a single primitive parameter', () => {
        const result = ProcedureParameterParser.parse('MyProc PROCEDURE(LONG pId)');
        assert.strictEqual(result.length, 1);
        assert.deepStrictEqual(result[0], {
            name: 'pId',
            type: 'LONG',
            byRef: false,
            optional: false,
        });
    });

    test('parses multiple parameters', () => {
        const result = ProcedureParameterParser.parse('MyProc PROCEDURE(LONG pId, STRING pName)');
        assert.strictEqual(result.length, 2);
        assert.strictEqual(result[0].type, 'LONG');
        assert.strictEqual(result[0].name, 'pId');
        assert.strictEqual(result[1].type, 'STRING');
        assert.strictEqual(result[1].name, 'pName');
    });

    test('captures typeArg from STRING(20) and CSTRING(80)', () => {
        const result = ProcedureParameterParser.parse('MyProc PROCEDURE(STRING(20) pName, CSTRING(80) pPath)');
        assert.strictEqual(result.length, 2);
        assert.deepStrictEqual(result[0], {
            name: 'pName', type: 'STRING', typeArg: '20', byRef: false, optional: false,
        });
        assert.deepStrictEqual(result[1], {
            name: 'pPath', type: 'CSTRING', typeArg: '80', byRef: false, optional: false,
        });
    });

    test('captures LIKE(File:Field) typeArg', () => {
        const result = ProcedureParameterParser.parse('MyProc PROCEDURE(LIKE(Customer:Id) pId)');
        assert.strictEqual(result.length, 1);
        assert.deepStrictEqual(result[0], {
            name: 'pId', type: 'LIKE', typeArg: 'Customer:Id', byRef: false, optional: false,
        });
    });

    test('detects byRef leading *', () => {
        const result = ProcedureParameterParser.parse('MyProc PROCEDURE(*LONG pOut)');
        assert.strictEqual(result[0].byRef, true);
        assert.strictEqual(result[0].type, 'LONG');
        assert.strictEqual(result[0].name, 'pOut');
    });

    test('detects optional <...> wrapper', () => {
        const result = ProcedureParameterParser.parse('MyProc PROCEDURE(<LONG pId>)');
        assert.strictEqual(result[0].optional, true);
        assert.strictEqual(result[0].type, 'LONG');
        assert.strictEqual(result[0].name, 'pId');
    });

    test('combines byRef + optional', () => {
        const result = ProcedureParameterParser.parse('MyProc PROCEDURE(<*STRING pBuffer>)');
        assert.strictEqual(result[0].optional, true);
        assert.strictEqual(result[0].byRef, true);
        assert.strictEqual(result[0].type, 'STRING');
        assert.strictEqual(result[0].name, 'pBuffer');
    });

    test('parses default values', () => {
        const result = ProcedureParameterParser.parse('MyProc PROCEDURE(LONG pCount = 0, STRING pName = \'guest\')');
        assert.strictEqual(result.length, 2);
        assert.strictEqual(result[0].default, '0');
        assert.strictEqual(result[1].default, "'guest'");
    });

    test('mixes optional, byRef, default, typeArg in one signature', () => {
        const result = ProcedureParameterParser.parse(
            'Mixed PROCEDURE(LONG pId, *STRING(20) pBuf, <LONG pFlags = 0>, LIKE(Cust:Id) pCustId)'
        );
        assert.strictEqual(result.length, 4);

        assert.deepStrictEqual(result[0], { name: 'pId', type: 'LONG', byRef: false, optional: false });

        assert.strictEqual(result[1].byRef, true);
        assert.strictEqual(result[1].type, 'STRING');
        assert.strictEqual(result[1].typeArg, '20');
        assert.strictEqual(result[1].name, 'pBuf');

        assert.strictEqual(result[2].optional, true);
        assert.strictEqual(result[2].type, 'LONG');
        assert.strictEqual(result[2].name, 'pFlags');
        assert.strictEqual(result[2].default, '0');

        assert.strictEqual(result[3].type, 'LIKE');
        assert.strictEqual(result[3].typeArg, 'Cust:Id');
        assert.strictEqual(result[3].name, 'pCustId');
    });

    test('is case-insensitive on the PROCEDURE/FUNCTION keyword', () => {
        const a = ProcedureParameterParser.parse('lower function(long x)');
        const b = ProcedureParameterParser.parse('LOWER FUNCTION(LONG x)');
        const c = ProcedureParameterParser.parse('Mixed Procedure(LONG x)');
        for (const r of [a, b, c]) {
            assert.strictEqual(r.length, 1);
            assert.strictEqual(r[0].name, 'x');
        }
    });

    test('tolerates extra whitespace and tabs between parameters', () => {
        const result = ProcedureParameterParser.parse('Pad PROCEDURE(   LONG    pId  ,\t STRING\tpName )');
        assert.strictEqual(result.length, 2);
        assert.strictEqual(result[0].type, 'LONG');
        assert.strictEqual(result[0].name, 'pId');
        assert.strictEqual(result[1].type, 'STRING');
        assert.strictEqual(result[1].name, 'pName');
    });

    test('does not split on commas inside nested parens', () => {
        // STRING(20),LONG should NOT mid-split
        const result = ProcedureParameterParser.parse('Nested PROCEDURE(STRING(20) pName, LONG pId)');
        assert.strictEqual(result.length, 2);
        assert.strictEqual(result[0].typeArg, '20');
    });

    test('does not split on commas inside angle brackets', () => {
        // <STRING(20) pName, LONG pCount> would be one weird "param" — but the angle
        // bracket grouping should hold. (Unusual but legal in spec.)
        const result = ProcedureParameterParser.parse('Group PROCEDURE(<LONG x>, <LONG y>)');
        assert.strictEqual(result.length, 2);
        assert.strictEqual(result[0].optional, true);
        assert.strictEqual(result[1].optional, true);
        assert.strictEqual(result[0].name, 'x');
        assert.strictEqual(result[1].name, 'y');
    });

    test('treats prototype-only signatures (type only, no name) gracefully', () => {
        // Some prototype declarations omit the name: PROCEDURE(LONG, STRING)
        const result = ProcedureParameterParser.parse('Proto PROCEDURE(LONG, STRING)');
        assert.strictEqual(result.length, 2);
        assert.strictEqual(result[0].type, 'LONG');
        assert.strictEqual(result[0].name, '');
        assert.strictEqual(result[1].type, 'STRING');
        assert.strictEqual(result[1].name, '');
    });
});
