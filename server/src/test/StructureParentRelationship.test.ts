import * as assert from 'assert';
import { ClarionTokenizer, Token, TokenType } from '../ClarionTokenizer';

suite('Structure Parent Relationships', () => {
    /**
     * Helper to find END tokens
     */
    function findEndToken(tokens: Token[], lineNumber: number): Token | undefined {
        return tokens.find(t => t.type === TokenType.EndStatement && t.line === lineNumber);
    }

    function findStructureToken(tokens: Token[], lineNumber: number): Token | undefined {
        return tokens.find(t => t.type === TokenType.Structure && t.line === lineNumber);
    }

    test('GROUP...END should have parent relationship', () => {
        const source = `
   PROGRAM

TestGroup    GROUP
Field1         STRING(10)
             END
   CODE
   RETURN
`;
        const tokenizer = new ClarionTokenizer(source);
        const tokens = tokenizer.tokenize();
        
        const endToken = findEndToken(tokens, 5);
        const groupToken = findStructureToken(tokens, 3);
        
        assert.ok(endToken, 'END token should exist');
        assert.ok(groupToken, 'GROUP token should exist');
        assert.strictEqual(groupToken?.value.toUpperCase(), 'GROUP');
        assert.ok(endToken?.parent, 'END should have parent');
        assert.strictEqual(endToken?.parent, groupToken, 'END parent should be GROUP token');
    });

    test('VIEW...END should have parent relationship', () => {
        const source = `
   PROGRAM

TestView     VIEW(SomeFile)
               PROJECT(SomeField)
             END
   CODE
   RETURN
`;
        const tokenizer = new ClarionTokenizer(source);
        const tokens = tokenizer.tokenize();
        
        const endToken = findEndToken(tokens, 5);
        const viewToken = findStructureToken(tokens, 3);
        
        assert.ok(endToken, 'END token should exist');
        assert.ok(viewToken, 'VIEW token should exist');
        assert.strictEqual(viewToken?.value.toUpperCase(), 'VIEW');
        assert.ok(endToken?.parent, 'END should have parent');
        assert.strictEqual(endToken?.parent, viewToken, 'END parent should be VIEW token');
    });

    test('QUEUE...END should have parent relationship', () => {
        const source = `
   PROGRAM

TestQueue    QUEUE
Field1         STRING(10)
Mark           BYTE
             END
   CODE
   RETURN
`;
        const tokenizer = new ClarionTokenizer(source);
        const tokens = tokenizer.tokenize();
        
        const endToken = findEndToken(tokens, 6);
        const queueToken = findStructureToken(tokens, 3);
        
        assert.ok(endToken, 'END token should exist');
        assert.ok(queueToken, 'QUEUE token should exist');
        assert.strictEqual(queueToken?.value.toUpperCase(), 'QUEUE');
        assert.ok(endToken?.parent, 'END should have parent');
        assert.strictEqual(endToken?.parent, queueToken, 'END parent should be QUEUE token');
    });

    test('QUEUE without label prefix should have parent relationship', () => {
        const source = `
   PROGRAM

FieldColorQueue QUEUE
Feq             LONG
OldColor        LONG
              END
   CODE
   RETURN
`;
        const tokenizer = new ClarionTokenizer(source);
        const tokens = tokenizer.tokenize();
        
        const endToken = findEndToken(tokens, 6);
        const queueToken = findStructureToken(tokens, 3);
        
        assert.ok(endToken, 'END token should exist');
        assert.ok(queueToken, 'QUEUE token should exist');
        assert.strictEqual(queueToken?.value.toUpperCase(), 'QUEUE');
        assert.ok(endToken?.parent, 'END should have parent');
        assert.strictEqual(endToken?.parent, queueToken, 'END parent should be QUEUE token');
    });

    test('WINDOW...END should have parent relationship', () => {
        const source = `
   PROGRAM

TestWindow   WINDOW('Test'),AT(10,10,100,100)
               BUTTON('OK'),AT(10,10,40,12)
             END
   CODE
   RETURN
`;
        const tokenizer = new ClarionTokenizer(source);
        const tokens = tokenizer.tokenize();
        
        const endToken = findEndToken(tokens, 5);
        const windowToken = findStructureToken(tokens, 3);
        
        assert.ok(endToken, 'END token should exist');
        assert.ok(windowToken, 'WINDOW token should exist');
        assert.strictEqual(windowToken?.value.toUpperCase(), 'WINDOW');
        assert.ok(endToken?.parent, 'END should have parent');
        assert.strictEqual(endToken?.parent, windowToken, 'END parent should be WINDOW token');
    });

    test('WINDOW with SHEET and TAB should have proper nesting', () => {
        const source = `
   PROGRAM

MyWindow     WINDOW('Test'),AT(10,10,200,200)
               SHEET,AT(5,5,190,190)
                 TAB('Tab 1')
                   BUTTON('OK'),AT(10,10,40,12)
                 END
               END
             END
   CODE
   RETURN
`;
        const tokenizer = new ClarionTokenizer(source);
        const tokens = tokenizer.tokenize();
        
        // Find structure tokens
        const windowToken = tokens.find(t => t.type === TokenType.Structure && t.value.toUpperCase() === 'WINDOW');
        const sheetToken = tokens.find(t => t.type === TokenType.Structure && t.value.toUpperCase() === 'SHEET');
        const tabToken = tokens.find(t => t.type === TokenType.Structure && t.value.toUpperCase() === 'TAB');
        
        // Find END tokens
        const tabEnd = findEndToken(tokens, 7);
        const sheetEnd = findEndToken(tokens, 8);
        const windowEnd = findEndToken(tokens, 9);
        
        // Verify tokens exist
        assert.ok(windowToken, 'WINDOW token should exist');
        assert.ok(sheetToken, 'SHEET token should exist');
        assert.ok(tabToken, 'TAB token should exist');
        assert.ok(tabEnd, 'TAB END should exist');
        assert.ok(sheetEnd, 'SHEET END should exist');
        assert.ok(windowEnd, 'WINDOW END should exist');
        
        // Verify parent relationships
        assert.strictEqual(tabEnd?.parent, tabToken, 'TAB END should close TAB');
        assert.strictEqual(sheetEnd?.parent, sheetToken, 'SHEET END should close SHEET');
        assert.strictEqual(windowEnd?.parent, windowToken, 'WINDOW END should close WINDOW');
        
        // Verify nesting hierarchy
        assert.strictEqual(tabToken?.parent, sheetToken, 'TAB should be child of SHEET');
        assert.strictEqual(sheetToken?.parent, windowToken, 'SHEET should be child of WINDOW');
    });

    test('WINDOW with line continuation should work', () => {
        const source = `
   PROGRAM

MyWindow     WINDOW('Test'),AT(10,10,200,200),FONT('Arial',8), |
               GRAY,DOUBLE
               BUTTON('OK'),AT(10,10,40,12)
             END
   CODE
   RETURN
`;
        const tokenizer = new ClarionTokenizer(source);
        const tokens = tokenizer.tokenize();
        
        const windowToken = tokens.find(t => t.type === TokenType.Structure && t.value.toUpperCase() === 'WINDOW');
        const endToken = findEndToken(tokens, 6);
        
        assert.ok(windowToken, 'WINDOW token should exist on line with continuation');
        assert.ok(endToken, 'END token should exist');
        assert.ok(endToken?.parent, 'END should have parent');
        assert.strictEqual(endToken?.parent, windowToken, 'END should close WINDOW despite continuation');
    });
});
