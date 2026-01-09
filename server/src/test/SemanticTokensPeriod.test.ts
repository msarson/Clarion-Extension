/**
 * Test to verify semantic tokens work for period terminators
 */

import { suite, test } from 'mocha';
import * as assert from 'assert';
import { ClarionTokenizer } from '../ClarionTokenizer';
import { DocumentStructure } from '../DocumentStructure';
import { TokenType } from '../tokenizer/TokenTypes';

suite('Semantic Tokens - Period Terminator Tests', () => {
    test('Period terminator should have parent relationship', () => {
        const code = `MyProc PROCEDURE()
MyData  GROUP
Name      STRING(50)
        .
  CODE
  RETURN`;
        
        const tokenizer = new ClarionTokenizer(code);
        const tokens = tokenizer.tokenize();
        const docStructure = new DocumentStructure(tokens);
        
        // Find the period token on line 3
        const periodToken = tokens.find(t => 
            t.value === '.' && 
            t.type === TokenType.EndStatement && 
            t.line === 3
        );
        
        assert.ok(periodToken, 'Should find period token');
        assert.ok(periodToken.parent, 'Period should have parent');
        assert.strictEqual(periodToken.parent.value.toUpperCase(), 'GROUP', 
            'Period should close GROUP structure');
    });
    
    test('Multiple period terminators should match their parents', () => {
        const code = `MyProc PROCEDURE()
DATA1  GROUP
Field1   STRING(20)
       .
DATA2  QUEUE
Field2   LONG
       .
  CODE
  RETURN`;
        
        const tokenizer = new ClarionTokenizer(code);
        const tokens = tokenizer.tokenize();
        const docStructure = new DocumentStructure(tokens);
        
        // Find first period (closes GROUP)
        const period1 = tokens.find(t => 
            t.value === '.' && 
            t.type === TokenType.EndStatement && 
            t.line === 3
        );
        
        // Find second period (closes QUEUE)
        const period2 = tokens.find(t => 
            t.value === '.' && 
            t.type === TokenType.EndStatement && 
            t.line === 6
        );
        
        assert.ok(period1, 'Should find first period');
        assert.ok(period1.parent, 'First period should have parent');
        assert.strictEqual(period1.parent.value.toUpperCase(), 'GROUP', 
            'First period should close GROUP');
        
        assert.ok(period2, 'Should find second period');
        assert.ok(period2.parent, 'Second period should have parent');
        assert.strictEqual(period2.parent.value.toUpperCase(), 'QUEUE', 
            'Second period should close QUEUE');
    });
    
    test('Period and END terminators should both work', () => {
        const code = `MyProc PROCEDURE()
DATA1  GROUP
Field1   STRING(20)
       .
DATA2  QUEUE
Field2   LONG
       END
  CODE
  RETURN`;
        
        const tokenizer = new ClarionTokenizer(code);
        const tokens = tokenizer.tokenize();
        const docStructure = new DocumentStructure(tokens);
        
        // Find period (closes GROUP)
        const periodToken = tokens.find(t => 
            t.value === '.' && 
            t.line === 3
        );
        
        // Find END (closes QUEUE)
        const endToken = tokens.find(t => 
            t.value.toUpperCase() === 'END' && 
            t.line === 6
        );
        
        assert.ok(periodToken, 'Should find period');
        assert.ok(periodToken.parent, 'Period should have parent');
        assert.strictEqual(periodToken.parent.value.toUpperCase(), 'GROUP');
        
        assert.ok(endToken, 'Should find END');
        assert.ok(endToken.parent, 'END should have parent');
        assert.strictEqual(endToken.parent.value.toUpperCase(), 'QUEUE');
    });
    
    test('Period closing WINDOW structure', () => {
        const code = `MyWindow WINDOW('Test'),AT(0,0,100,100)
         BUTTON('OK'),AT(10,10,40,12)
         .
CODE
START(MyWindow)`;
        
        const tokenizer = new ClarionTokenizer(code);
        const tokens = tokenizer.tokenize();
        const docStructure = new DocumentStructure(tokens);
        
        // Find period (closes WINDOW)
        const periodToken = tokens.find(t => 
            t.value === '.' && 
            t.line === 2
        );
        
        assert.ok(periodToken, 'Should find period');
        assert.ok(periodToken.parent, 'Period should have parent');
        assert.strictEqual(periodToken.parent.value.toUpperCase(), 'WINDOW',
            'Period should close WINDOW structure');
    });
});
