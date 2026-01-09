import * as assert from 'assert';
import { ClarionTokenizer, Token, TokenType } from '../ClarionTokenizer';
import { DocumentStructure } from '../DocumentStructure';

suite('DocumentStructure - Parent Index', () => {
    /**
     * Helper to find token by line and type
     */
    function findToken(tokens: Token[], lineNumber: number, type: TokenType, value?: string): Token | undefined {
        return tokens.find(t => {
            if (t.line !== lineNumber || t.type !== type) return false;
            if (value && t.value.toUpperCase() !== value.toUpperCase()) return false;
            return true;
        });
    }

    test('getParent() should return immediate parent structure', () => {
        const source = `
   PROGRAM

MyGroup      GROUP
Field1         STRING(10)
           END

   CODE
   RETURN
`;
        const tokenizer = new ClarionTokenizer(source);
        const tokens = tokenizer.tokenize();
        const structure = new DocumentStructure(tokens);
        structure.process();
        
        const groupToken = findToken(tokens, 3, TokenType.Structure, 'GROUP');
        const stringToken = tokens.find(t => t.line === 4 && t.value.toUpperCase() === 'STRING');
        
        assert.ok(groupToken, 'GROUP token should exist');
        assert.ok(stringToken, 'STRING token should exist');
        
        const parent = structure.getParent(stringToken!);
        assert.ok(parent, 'Token should have a parent');
        assert.strictEqual(parent, groupToken, 'Parent should be the GROUP token');
    });

    test('getParent() should handle nested structures', () => {
        const source = `
   PROGRAM

OuterGroup   GROUP
InnerGroup     GROUP
Field1           STRING(10)
             END
           END

   CODE
   RETURN
`;
        const tokenizer = new ClarionTokenizer(source);
        const tokens = tokenizer.tokenize();
        const structure = new DocumentStructure(tokens);
        structure.process();
        
        const outerGroup = findToken(tokens, 3, TokenType.Structure, 'GROUP');
        const innerGroup = findToken(tokens, 4, TokenType.Structure, 'GROUP');
        const stringToken = tokens.find(t => t.line === 5 && t.value.toUpperCase() === 'STRING');
        
        assert.ok(outerGroup, 'Outer GROUP should exist');
        assert.ok(innerGroup, 'Inner GROUP should exist');
        assert.ok(stringToken, 'String token should exist');
        
        // STRING token's parent should be inner group
        const stringParent = structure.getParent(stringToken!);
        assert.strictEqual(stringParent, innerGroup, 'String token parent should be inner GROUP');
        
        // Inner group's parent should be outer group
        const innerParent = structure.getParent(innerGroup!);
        assert.strictEqual(innerParent, outerGroup, 'Inner GROUP parent should be outer GROUP');
        
        // Outer group should have no parent
        const outerParent = structure.getParent(outerGroup!);
        assert.strictEqual(outerParent, undefined, 'Outer GROUP should have no parent');
    });

    test('getParentScope() should return containing procedure', () => {
        const source = `
   PROGRAM

MyProc       PROCEDURE
MyGroup        GROUP
Field1           STRING(10)
             END
           CODE
           RETURN

   CODE
   RETURN
`;
        const tokenizer = new ClarionTokenizer(source);
        const tokens = tokenizer.tokenize();
        const structure = new DocumentStructure(tokens);
        structure.process();
        
        const procToken = tokens.find(t => t.line === 3 && t.value.toUpperCase() === 'PROCEDURE');
        const groupToken = findToken(tokens, 4, TokenType.Structure, 'GROUP');
        const stringToken = tokens.find(t => t.line === 5 && t.value.toUpperCase() === 'STRING');
        
        assert.ok(procToken, 'PROCEDURE token should exist');
        assert.ok(groupToken, 'GROUP token should exist');
        assert.ok(stringToken, 'STRING token should exist');
        
        // String token's immediate parent is GROUP, but parent scope is PROCEDURE
        const stringParent = structure.getParent(stringToken!);
        assert.strictEqual(stringParent, groupToken, 'String immediate parent should be GROUP');
        
        const stringScope = structure.getParentScope(stringToken!);
        assert.strictEqual(stringScope, procToken, 'String parent scope should be PROCEDURE');
        
        // Group's parent scope is also PROCEDURE
        const groupScope = structure.getParentScope(groupToken!);
        assert.strictEqual(groupScope, procToken, 'GROUP parent scope should be PROCEDURE');
    });

    test('getParentScope() should handle nested procedures (routines)', () => {
        const source = `
   PROGRAM

OuterProc    PROCEDURE
InnerRoutine   ROUTINE
LocalGroup       GROUP
Field1             STRING(10)
               END
             CODE
             RETURN
           CODE
           RETURN

   CODE
   RETURN
`;
        const tokenizer = new ClarionTokenizer(source);
        const tokens = tokenizer.tokenize();
        const structure = new DocumentStructure(tokens);
        structure.process();
        
        const outerProc = tokens.find(t => t.line === 3 && t.value.toUpperCase() === 'PROCEDURE');
        const innerRoutine = tokens.find(t => t.line === 4 && t.value.toUpperCase() === 'ROUTINE');
        const localGroup = findToken(tokens, 5, TokenType.Structure, 'GROUP');
        
        assert.ok(outerProc, 'Outer PROCEDURE should exist');
        assert.ok(innerRoutine, 'Inner ROUTINE should exist');
        assert.ok(localGroup, 'Local GROUP should exist');
        
        // LocalGroup's parent scope should be the routine
        const groupScope = structure.getParentScope(localGroup!);
        assert.strictEqual(groupScope, innerRoutine, 'GROUP parent scope should be ROUTINE');
        
        // Routine's parent scope should be the procedure
        const routineScope = structure.getParentScope(innerRoutine!);
        assert.strictEqual(routineScope, outerProc, 'ROUTINE parent scope should be PROCEDURE');
    });

    test('getParent() should return undefined for top-level tokens', () => {
        const source = `
   PROGRAM

GlobalVar    STRING(10)

   CODE
   RETURN
`;
        const tokenizer = new ClarionTokenizer(source);
        const tokens = tokenizer.tokenize();
        const structure = new DocumentStructure(tokens);
        structure.process();
        
        const stringToken = tokens.find(t => t.line === 3 && t.value.toUpperCase() === 'STRING');
        assert.ok(stringToken, 'STRING token should exist');
        
        const parent = structure.getParent(stringToken!);
        assert.strictEqual(parent, undefined, 'Top-level token should have no parent');
    });

    test('getParentScope() should work with MAP structure', () => {
        const source = `
   PROGRAM

   MAP
MyProc       PROCEDURE
   END

MyProc       PROCEDURE
LocalGroup     GROUP
Field1           STRING(10)
             END
           CODE
           RETURN

   CODE
   RETURN
`;
        const tokenizer = new ClarionTokenizer(source);
        const tokens = tokenizer.tokenize();
        const structure = new DocumentStructure(tokens);
        structure.process();
        
        const mapToken = findToken(tokens, 3, TokenType.Structure, 'MAP');
        const mapProc = tokens.find(t => t.line === 4 && t.value.toUpperCase() === 'PROCEDURE');
        const implProc = tokens.find(t => t.line === 7 && t.value.toUpperCase() === 'PROCEDURE');
        const localGroup = findToken(tokens, 8, TokenType.Structure, 'GROUP');
        
        assert.ok(mapToken, 'MAP should exist');
        assert.ok(mapProc, 'MAP PROCEDURE should exist');
        assert.ok(implProc, 'PROCEDURE implementation should exist');
        assert.ok(localGroup, 'Local GROUP should exist');
        
        // MAP procedure's parent should be MAP structure
        const mapProcParent = structure.getParent(mapProc!);
        assert.strictEqual(mapProcParent, mapToken, 'MAP PROCEDURE parent should be MAP');
        
        // Local group's parent scope should be procedure implementation
        const groupScope = structure.getParentScope(localGroup!);
        assert.strictEqual(groupScope, implProc, 'GROUP parent scope should be PROCEDURE implementation');
    });

    test('Performance: getParent() should be O(1)', () => {
        // Build a large structure with many tokens
        const lines = ['   PROGRAM', '', 'MyGroup    GROUP'];
        for (let i = 0; i < 100; i++) {
            lines.push(`Var${i}      STRING(10)`);
        }
        lines.push('         END', '   CODE', '   RETURN');
        
        const source = lines.join('\n');
        const tokenizer = new ClarionTokenizer(source);
        const tokens = tokenizer.tokenize();
        const structure = new DocumentStructure(tokens);
        structure.process();
        
        // Find a STRING token in the middle
        const targetToken = tokens.find(t => t.line === 52 && t.value.toUpperCase() === 'STRING');
        assert.ok(targetToken, 'Target token should exist');
        
        // Measure getParent performance - should be instant (O(1))
        const iterations = 10000;
        const start = performance.now();
        
        for (let i = 0; i < iterations; i++) {
            structure.getParent(targetToken!);
        }
        
        const end = performance.now();
        const avgTime = (end - start) / iterations;
        
        // O(1) operation should be < 0.01ms per call
        assert.ok(avgTime < 0.01, `getParent should be O(1) (was ${avgTime.toFixed(4)}ms per call)`);
    });
});
