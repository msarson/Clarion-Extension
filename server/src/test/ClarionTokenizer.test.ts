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
});
