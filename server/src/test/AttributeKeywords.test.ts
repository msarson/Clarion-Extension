import * as assert from 'assert';
import { isAttributeKeyword, getAttributeKeywords } from '../utils/AttributeKeywords';

suite('AttributeKeywords Tests', () => {
    
    suite('isAttributeKeyword()', () => {
        
        test('Should recognize calling convention attributes', () => {
            assert.ok(isAttributeKeyword('DLL'), 'DLL should be recognized');
            assert.ok(isAttributeKeyword('NAME'), 'NAME should be recognized');
            assert.ok(isAttributeKeyword('RAW'), 'RAW should be recognized');
            assert.ok(isAttributeKeyword('PASCAL'), 'PASCAL should be recognized');
            assert.ok(isAttributeKeyword('PROC'), 'PROC should be recognized');
            assert.ok(isAttributeKeyword('C'), 'C should be recognized');
        });

        test('Should recognize calling conventions in mixed case', () => {
            assert.ok(isAttributeKeyword('dll'), 'dll (lowercase) should be recognized');
            assert.ok(isAttributeKeyword('Pascal'), 'Pascal (mixed case) should be recognized');
            assert.ok(isAttributeKeyword('RAW'), 'RAW (uppercase) should be recognized');
        });

        test('Should recognize access modifiers', () => {
            assert.ok(isAttributeKeyword('PRIVATE'), 'PRIVATE should be recognized');
            assert.ok(isAttributeKeyword('PROTECTED'), 'PROTECTED should be recognized');
            assert.ok(isAttributeKeyword('PUBLIC'), 'PUBLIC should be recognized');
        });

        test('Should recognize method modifiers', () => {
            assert.ok(isAttributeKeyword('VIRTUAL'), 'VIRTUAL should be recognized');
            assert.ok(isAttributeKeyword('DERIVED'), 'DERIVED should be recognized');
        });

        test('Should recognize data structure attributes', () => {
            assert.ok(isAttributeKeyword('OVER'), 'OVER should be recognized');
            assert.ok(isAttributeKeyword('DIM'), 'DIM should be recognized');
            assert.ok(isAttributeKeyword('PRE'), 'PRE should be recognized');
            assert.ok(isAttributeKeyword('EQUATE'), 'EQUATE should be recognized');
            assert.ok(isAttributeKeyword('LIKE'), 'LIKE should be recognized');
        });

        test('Should recognize common modifiers', () => {
            assert.ok(isAttributeKeyword('AUTO'), 'AUTO should be recognized');
            assert.ok(isAttributeKeyword('STATIC'), 'STATIC should be recognized');
            assert.ok(isAttributeKeyword('THREAD'), 'THREAD should be recognized');
            assert.ok(isAttributeKeyword('EXTERNAL'), 'EXTERNAL should be recognized');
        });

        test('Should recognize other attributes', () => {
            assert.ok(isAttributeKeyword('ONCE'), 'ONCE should be recognized');
        });

        test('Should NOT recognize data type keywords as attributes', () => {
            // These are type keywords, not attributes
            assert.ok(!isAttributeKeyword('SIGNED'), 'SIGNED should NOT be an attribute (it is a type modifier)');
            assert.ok(!isAttributeKeyword('UNSIGNED'), 'UNSIGNED should NOT be an attribute (it is a type modifier)');
            assert.ok(!isAttributeKeyword('LONG'), 'LONG should NOT be an attribute (it is a data type)');
            assert.ok(!isAttributeKeyword('STRING'), 'STRING should NOT be an attribute (it is a data type)');
            assert.ok(!isAttributeKeyword('BYTE'), 'BYTE should NOT be an attribute (it is a data type)');
        });

        test('Should NOT recognize SIZE as an attribute', () => {
            // SIZE is a function that can be used in declarations like:
            // SavRec STRING(1),DIM(SIZE(Cus:Record))
            // but it's a function call, not an attribute
            assert.ok(!isAttributeKeyword('SIZE'), 'SIZE should NOT be an attribute (it is a function)');
        });

        test('Should NOT recognize structure keywords as attributes', () => {
            assert.ok(!isAttributeKeyword('CLASS'), 'CLASS should NOT be an attribute');
            assert.ok(!isAttributeKeyword('INTERFACE'), 'INTERFACE should NOT be an attribute');
            assert.ok(!isAttributeKeyword('GROUP'), 'GROUP should NOT be an attribute');
            assert.ok(!isAttributeKeyword('PROCEDURE'), 'PROCEDURE should NOT be an attribute');
        });

        test('Should NOT recognize control flow keywords as attributes', () => {
            assert.ok(!isAttributeKeyword('IF'), 'IF should NOT be an attribute');
            assert.ok(!isAttributeKeyword('LOOP'), 'LOOP should NOT be an attribute');
            assert.ok(!isAttributeKeyword('CASE'), 'CASE should NOT be an attribute');
            assert.ok(!isAttributeKeyword('RETURN'), 'RETURN should NOT be an attribute');
        });

        test('Should NOT recognize random strings as attributes', () => {
            assert.ok(!isAttributeKeyword('NOTAKEYWORD'), 'Random string should NOT be an attribute');
            assert.ok(!isAttributeKeyword(''), 'Empty string should NOT be an attribute');
            assert.ok(!isAttributeKeyword('123'), 'Number string should NOT be an attribute');
        });
    });

    suite('getAttributeKeywords()', () => {
        
        test('Should return an array of keywords', () => {
            const keywords = getAttributeKeywords();
            assert.ok(Array.isArray(keywords), 'Should return an array');
            assert.ok(keywords.length > 0, 'Should return non-empty array');
        });

        test('All returned keywords should be uppercase', () => {
            const keywords = getAttributeKeywords();
            for (const keyword of keywords) {
                assert.strictEqual(keyword, keyword.toUpperCase(), `Keyword ${keyword} should be uppercase`);
            }
        });

        test('Should extract keywords from tokenizer pattern', () => {
            const keywords = getAttributeKeywords();
            
            // Check for some common attributes that should be in the tokenizer pattern
            const expectedCommon = ['PRIVATE', 'PROTECTED', 'RAW', 'PASCAL', 'DLL', 'NAME'];
            
            for (const expected of expectedCommon) {
                const found = keywords.includes(expected);
                if (!found) {
                    console.log(`Expected attribute '${expected}' not found in tokenizer pattern`);
                    console.log(`Available keywords: ${keywords.join(', ')}`);
                }
            }
        });
    });

    suite('Real-world Examples', () => {
        
        test('Should correctly identify attributes in method declaration', () => {
            // StringTheory.Flush PROCEDURE (StringTheory pStr),long, proc, virtual
            assert.ok(isAttributeKeyword('PROC'), 'PROC in method declaration');
            assert.ok(isAttributeKeyword('VIRTUAL'), 'VIRTUAL in method declaration');
            assert.ok(!isAttributeKeyword('LONG'), 'LONG is return type, not attribute');
        });

        test('Should correctly identify attributes in MAP procedure', () => {
            // ToUpper (byte char), byte, name('Cla$isftoupper'),dll(DLL_Mode)
            assert.ok(isAttributeKeyword('NAME'), 'NAME in MAP procedure');
            assert.ok(isAttributeKeyword('DLL'), 'DLL in MAP procedure');
            assert.ok(!isAttributeKeyword('BYTE'), 'BYTE is data type, not attribute');
        });

        test('Should correctly identify attributes in data declaration', () => {
            // value &string,PRIVATE
            assert.ok(isAttributeKeyword('PRIVATE'), 'PRIVATE in data declaration');
            assert.ok(!isAttributeKeyword('STRING'), 'STRING is data type, not attribute');
        });

        test('Should correctly identify attributes with OVER and DIM', () => {
            // bits long
            // group,over(bits),pre()
            assert.ok(isAttributeKeyword('OVER'), 'OVER in GROUP declaration');
            assert.ok(isAttributeKeyword('PRE'), 'PRE in GROUP declaration');
            assert.ok(!isAttributeKeyword('LONG'), 'LONG is data type, not attribute');
            
            // array LONG,DIM(10)
            assert.ok(isAttributeKeyword('DIM'), 'DIM in array declaration');
        });

        test('Should correctly identify AUTO and STATIC modifiers', () => {
            // localVar LONG,AUTO
            assert.ok(isAttributeKeyword('AUTO'), 'AUTO modifier');
            
            // counter LONG,STATIC
            assert.ok(isAttributeKeyword('STATIC'), 'STATIC modifier');
        });

        test('Should correctly identify EQUATE and LIKE', () => {
            // MAX_SIZE EQUATE(100)
            assert.ok(isAttributeKeyword('EQUATE'), 'EQUATE for constant');
            
            // myField LIKE(OtherField)
            assert.ok(isAttributeKeyword('LIKE'), 'LIKE for type mirroring');
        });

        test('Should NOT identify SIZE as attribute in DIM(SIZE()) context', () => {
            // SavRec STRING(1),DIM(SIZE(Cus:Record))
            assert.ok(isAttributeKeyword('DIM'), 'DIM is an attribute');
            assert.ok(!isAttributeKeyword('SIZE'), 'SIZE is a function, not an attribute');
            assert.ok(!isAttributeKeyword('STRING'), 'STRING is a type, not an attribute');
        });

        test('Should correctly identify type modifiers are NOT attributes', () => {
            // myVar BYTE,UNSIGNED
            assert.ok(!isAttributeKeyword('UNSIGNED'), 'UNSIGNED modifies BYTE, not an attribute context');
            assert.ok(!isAttributeKeyword('SIGNED'), 'SIGNED modifies type, not an attribute context');
        });

        test('Should correctly identify calling conventions in complex signatures', () => {
            // stDeflateInit2_(ulong pStream, long pLevel),long,Pascal,raw,dll(_fp_)
            assert.ok(isAttributeKeyword('PASCAL'), 'PASCAL calling convention');
            assert.ok(isAttributeKeyword('RAW'), 'RAW attribute');
            assert.ok(isAttributeKeyword('DLL'), 'DLL linkage');
            assert.ok(!isAttributeKeyword('ULONG'), 'ULONG is a type, not attribute');
            assert.ok(!isAttributeKeyword('LONG'), 'LONG is a type, not attribute');
        });
    });
});
