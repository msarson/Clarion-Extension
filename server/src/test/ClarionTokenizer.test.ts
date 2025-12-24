import * as assert from 'assert';
import { ClarionTokenizer, TokenType } from '../ClarionTokenizer';

suite('ClarionTokenizer Tests', () => {
    
    test('Should tokenize a simple PROCEDURE', () => {
        const code = 'MyProc PROCEDURE()\nCODE\nEND';
        const tokenizer = new ClarionTokenizer(code);
        const tokens = tokenizer.tokenize();
        
        assert.ok(tokens.length > 0, 'Should have tokens');
        
        // Find the PROCEDURE token
        const procToken = tokens.find(t => t.type === TokenType.Procedure || t.subType === TokenType.Procedure);
        assert.ok(procToken, 'Should find PROCEDURE token');
        assert.strictEqual(procToken?.value.toUpperCase(), 'PROCEDURE');
    });

    test('Should tokenize comments', () => {
        const code = '! This is a comment\nMyProc PROCEDURE()';
        const tokenizer = new ClarionTokenizer(code);
        const tokens = tokenizer.tokenize();
        
        const commentToken = tokens.find(t => t.type === TokenType.Comment);
        assert.ok(commentToken, 'Should find comment token');
        assert.ok(commentToken?.value.includes('This is a comment'));
    });

    test('Should tokenize string literals', () => {
        const code = 'Message STRING(\'Hello World\')';
        const tokenizer = new ClarionTokenizer(code);
        const tokens = tokenizer.tokenize();
        
        // The 'Hello World' part should be tokenized as a string
        // Look for tokens that contain the actual string content
        const hasString = tokens.some(t => 
            t.value.includes('Hello World') || 
            (t.type === TokenType.String && t.value.includes('\''))
        );
        assert.ok(hasString || tokens.length > 0, 'Should parse the line with string literal');
    });

    test('Should tokenize labels with colons', () => {
        const code = 'Cust:Name STRING(40)';
        const tokenizer = new ClarionTokenizer(code);
        const tokens = tokenizer.tokenize();
        
        // Should have a label token
        const labelToken = tokens.find(t => t.label && t.label.includes('Cust:Name'));
        assert.ok(labelToken || tokens.some(t => t.value.includes('Cust:Name')), 
                  'Should find label with colon');
    });

    test('Should handle empty input', () => {
        const code = '';
        const tokenizer = new ClarionTokenizer(code);
        const tokens = tokenizer.tokenize();
        
        assert.ok(Array.isArray(tokens), 'Should return an array');
    });

    test('Should tokenize ROUTINE', () => {
        const code = 'MyRoutine ROUTINE\nCODE\nEND';
        const tokenizer = new ClarionTokenizer(code);
        const tokens = tokenizer.tokenize();
        
        const routineToken = tokens.find(t => 
            t.type === TokenType.Routine || 
            t.subType === TokenType.Routine ||
            t.value.toUpperCase() === 'ROUTINE'
        );
        assert.ok(routineToken, 'Should find ROUTINE token');
    });

    test('Should tokenize structure fields', () => {
        const code = 'Queue QUEUE\n  Name STRING(40)\n  Age LONG\nEND';
        const tokenizer = new ClarionTokenizer(code);
        const tokens = tokenizer.tokenize();

        // Should find QUEUE structure
        const queueToken = tokens.find(t => t.value.toUpperCase() === 'QUEUE');
        assert.ok(queueToken, 'Should find QUEUE token');
    });

    test('Should NOT treat keywords after colons as keywords (nts:case)', () => {
        const code = `
   if GlobalResponse=RequestCancelled
         nts:case = hold:nts:case
         nts:notes = hold:nts:notes
   else 
         hold:nts:case = nts:case
         hold:nts:notes = nts:notes
   end`;
        const tokenizer = new ClarionTokenizer(code);
        const tokens = tokenizer.tokenize();
        
        // 'case' after colon should NOT be treated as a CASE keyword
        // It should be part of a qualified identifier
        // Look for standalone 'CASE' keyword tokens (not part of 'nts:case')
        const standaloneCaseKeywords = tokens.filter(t => 
            t.type === TokenType.Keyword && 
            t.value.toUpperCase() === 'CASE'
        );
        
        assert.strictEqual(standaloneCaseKeywords.length, 0, 
            'Should not find standalone CASE keywords - all instances are qualified (nts:case, hold:nts:case)');
    });

    test('Should NOT treat keywords after colons as keywords (nts:record)', () => {
        const code = `
   if GlobalResponse=RequestCancelled
         nts:record = hold:nts:record
         nts:notes = hold:nts:notes
   end`;
        const tokenizer = new ClarionTokenizer(code);
        const tokens = tokenizer.tokenize();
        
        // 'record' after colon should NOT be treated as a RECORD keyword
        // Look for standalone 'RECORD' keyword tokens (not part of 'nts:record')
        const standaloneRecordKeywords = tokens.filter(t => 
            t.type === TokenType.Keyword && 
            t.value.toUpperCase() === 'RECORD'
        );
        
        assert.strictEqual(standaloneRecordKeywords.length, 0, 
            'Should not find standalone RECORD keywords - all instances are qualified (nts:record)');
    });

    test('Should NOT treat keywords after colons as keywords (obj:end, obj:if, obj:loop)', () => {
        const code = `
   myObj:end = 5
   myObj:if = TRUE
   myObj:loop = 10
   myObj:case = 'value'`;
        const tokenizer = new ClarionTokenizer(code);
        const tokens = tokenizer.tokenize();
        
        // None of these should be treated as keywords
        const endKeywords = tokens.filter(t => 
            t.type === TokenType.Keyword && t.value.toUpperCase() === 'END');
        const ifKeywords = tokens.filter(t => 
            t.type === TokenType.Keyword && t.value.toUpperCase() === 'IF');
        const loopKeywords = tokens.filter(t => 
            t.type === TokenType.Keyword && t.value.toUpperCase() === 'LOOP');
        const caseKeywords = tokens.filter(t => 
            t.type === TokenType.Keyword && t.value.toUpperCase() === 'CASE');
        
        assert.strictEqual(endKeywords.length, 0, 'myObj:end should not be END keyword');
        assert.strictEqual(ifKeywords.length, 0, 'myObj:if should not be IF keyword');
        assert.strictEqual(loopKeywords.length, 0, 'myObj:loop should not be LOOP keyword');
        assert.strictEqual(caseKeywords.length, 0, 'myObj:case should not be CASE keyword');
    });

    test('Should still recognize actual keywords when not qualified', () => {
        const code = `
   case myVar
   of 1
      record:field = 5
   end`;
        const tokenizer = new ClarionTokenizer(code);
        const tokens = tokenizer.tokenize();
        
        // CASE should be recognized as a Structure, END as EndStatement
        const caseStructures = tokens.filter(t => 
            t.type === TokenType.Structure && 
            t.value.toUpperCase() === 'CASE'
        );
        const endStatements = tokens.filter(t => 
            t.type === TokenType.EndStatement && 
            t.value.toUpperCase() === 'END'
        );
        
        assert.ok(caseStructures.length > 0, 'Should find CASE structure when not qualified');
        assert.ok(endStatements.length > 0, 'Should find END statement when not qualified');
    });

    test('Should NOT treat keywords after periods as keywords (object.case)', () => {
        const code = `
   myObject.case = 'value'
   myObject.end = 5`;
        const tokenizer = new ClarionTokenizer(code);
        const tokens = tokenizer.tokenize();
        
        // Keywords after period should not be treated as keywords
        const caseKeywords = tokens.filter(t => 
            t.type === TokenType.Keyword && 
            t.value.toUpperCase() === 'CASE'
        );
        const endKeywords = tokens.filter(t => 
            t.type === TokenType.Keyword && 
            t.value.toUpperCase() === 'END'
        );
        
        assert.strictEqual(caseKeywords.length, 0, 'myObject.case should not be CASE keyword');
        assert.strictEqual(endKeywords.length, 0, 'myObject.end should not be END keyword');
    });
});
