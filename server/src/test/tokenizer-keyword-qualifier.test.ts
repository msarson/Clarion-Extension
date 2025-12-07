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
});
