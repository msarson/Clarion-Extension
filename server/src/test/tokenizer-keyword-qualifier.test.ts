import * as assert from 'assert';
import { ClarionTokenizer, TokenType } from '../ClarionTokenizer';

suite('Tokenizer - Keyword in Field Qualifier Bug', () => {
    test('should NOT treat keywords after colon as statement keywords', () => {
        const code = `
   if GlobalResponse=RequestCancelled
         nts:case      = hold:nts:case
         nts:notes       = hold:nts:notes
   else hold:nts:case = nts:case
         hold:nts:notes  = nts:notes
         lcl:Preset_NTS  = TRUE
         lcl:Empty_Notes = CHOOSE( LEN(CLIP(NTS:Notes)) = 0 )
   end
`;

        console.log('Testing code:');
        console.log(code);
        
        const tokenizer = new ClarionTokenizer(code);
        const tokens = tokenizer.tokenize();
        
        console.log('\n=== TOKENS ===');
        tokens.forEach((token: any, i: number) => {
            console.log(`Token ${i}: type=${token.type}, value="${token.value}", line=${token.line}, col=${token.column}`);
        });
        
        // Look for CASE keyword tokens
        const caseTokens = tokens.filter((t: any) => 
            (t.type === TokenType.Keyword && t.value?.toUpperCase() === 'CASE') ||
            (t.subType && t.value?.toUpperCase() === 'CASE')
        );
        console.log(`\nFound ${caseTokens.length} CASE keyword tokens:`);
        caseTokens.forEach((t: any) => {
            console.log(`  Line ${t.line}: type=${t.type}, subType=${t.subType}, value="${t.value}"`);
        });
        
        // The word 'case' should NOT be tokenized as CASE keyword when it's after a colon
        assert.strictEqual(caseTokens.length, 0, 'Should not find any CASE keyword tokens - case after colon should be treated as field name');
    });

    test('should NOT treat keywords after period as statement keywords (class properties)', () => {
        const code = `
MyClass                 CLASS
case                       LONG
record                     LONG
if                         LONG
                        END

TestProc                PROCEDURE
obj                        &MyClass
    CODE
    obj &= NEW MyClass
    obj.case = 123
    obj.record = 456
    obj.if = 789
    RETURN
`;

        console.log('Testing class property code:');
        console.log(code);
        
        const tokenizer = new ClarionTokenizer(code);
        const tokens = tokenizer.tokenize();
        
        console.log('\n=== TOKENS ===');
        tokens.forEach((token: any, i: number) => {
            if (token.value?.match(/case|record|if/i)) {
                console.log(`Token ${i}: type=${token.type}, subType=${token.subType}, value="${token.value}", line=${token.line}, col=${token.column}`);
            }
        });
        
        // Look for CASE, RECORD, IF keyword tokens after the class definition
        // (we expect them in the CLASS definition but NOT when used as obj.case, obj.record, obj.if)
        const keywordTokens = tokens.filter((t: any) => 
            (t.line && t.line >= 11) && // After line 11 (obj.case, obj.record, obj.if lines)
            ((t.type === TokenType.Keyword && ['CASE', 'RECORD', 'IF'].includes(t.value?.toUpperCase())) ||
             (t.subType && ['CASE', 'RECORD', 'IF'].includes(t.value?.toUpperCase())))
        );
        
        console.log(`\nFound ${keywordTokens.length} keyword tokens after class definition:`);
        keywordTokens.forEach((t: any) => {
            console.log(`  Line ${t.line}: type=${t.type}, subType=${t.subType}, value="${t.value}"`);
        });
        
        // Should find NO keyword tokens in the property access lines
        assert.strictEqual(keywordTokens.length, 0, 'Should not find any keyword tokens after period - they should be treated as property names');
    });
});
