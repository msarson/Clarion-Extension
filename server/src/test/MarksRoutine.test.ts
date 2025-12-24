import * as assert from 'assert';
import { ClarionTokenizer, TokenType } from '../ClarionTokenizer';

suite('Keywords in field qualifiers bug', () => {
    test('BUG: nts:record incorrectly tokenized as RECORD keyword', () => {
        const code = `if GlobalResponse=RequestCancelled
    nts:record = hold:nts:record
end`;

        const tokenizer = new ClarionTokenizer(code);
        const tokens = tokenizer.tokenize();
        
        console.log(`\n=== Testing nts:record field qualifier ===`);
        console.log(`Total tokens: ${tokens.length}`);
        
        tokens.forEach(token => {
            console.log(`  Line ${token.line}, col ${token.start}: type=${TokenType[token.type]}, value='${token.value}'`);
        });
        
        // Check if any 'record' tokens are incorrectly typed as Structure
        const recordTokens = tokens.filter(t => t.value.toLowerCase() === 'record');
        console.log(`\nFound ${recordTokens.length} 'record' tokens`);
        
        const bugExists = recordTokens.some(t => t.type === TokenType.Structure);
        if (bugExists) {
            console.log('❌ BUG CONFIRMED: "record" in "nts:record" is being tokenized as TokenType.Structure');
        } else {
            console.log('✅ Bug fixed or not present');
        }
    });


    test('BUG: nts:case incorrectly tokenized as CASE keyword', () => {
        const code = `if GlobalResponse=RequestCancelled
    nts:case = hold:nts:case
end`;

        const tokenizer = new ClarionTokenizer(code);
        const tokens = tokenizer.tokenize();
        
        console.log(`\n=== Testing nts:case field qualifier ===`);
        console.log(`Total tokens: ${tokens.length}`);
        
        tokens.forEach(token => {
            console.log(`  Line ${token.line}, col ${token.start}: type=${TokenType[token.type]}, value='${token.value}'`);
        });
        
        // Check if 'case' tokens are incorrectly typed as keywords  
        const caseTokens = tokens.filter(t => t.value.toLowerCase() === 'case');
        console.log(`\nFound ${caseTokens.length} 'case' tokens`);
        
        // CASE as a statement keyword would be TokenType.Keyword with value 'CASE'
        const caseKeywords = caseTokens.filter(t => t.type === TokenType.Keyword);
        if (caseKeywords.length > 0) {
            console.log(`❌ BUG CONFIRMED: ${caseKeywords.length} "case" tokens incorrectly tokenized as Keywords`);
        } else {
            console.log('✅ Bug fixed or not present');
        }
    });
});
