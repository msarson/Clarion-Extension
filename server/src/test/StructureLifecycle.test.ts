import * as assert from 'assert';
import { ClarionTokenizer, TokenType } from '../ClarionTokenizer';

suite('Structure Lifecycle Tests', () => {
    
    test('MAP structure should have finishesAt set correctly', () => {
        const code = `MyMap MAP
  MyProc PROCEDURE()
END

TestProc PROCEDURE()
CODE
  RETURN
END`;
        const tokenizer = new ClarionTokenizer(code);
        const tokens = tokenizer.tokenize();
        
        // Find the MAP token
        const mapToken = tokens.find(t => t.value.toUpperCase() === 'MAP' && t.type === TokenType.Structure);
        assert.ok(mapToken, 'Should find MAP token');
        
        // MAP should finish at line 2 (the END line)
        assert.strictEqual(mapToken?.finishesAt, 2, 
            `MAP finishesAt should be 2 (END line), but is ${mapToken?.finishesAt}`);
    });

    test('PROCEDURE inside MAP should be child of MAP', () => {
        const code = `MyMap MAP
  MyProc PROCEDURE()
END

TestProc PROCEDURE()
CODE
  RETURN
END`;
        const tokenizer = new ClarionTokenizer(code);
        const tokens = tokenizer.tokenize();
        
        // Find the MAP token
        const mapToken = tokens.find(t => t.value.toUpperCase() === 'MAP' && t.type === TokenType.Structure);
        
        // Find the first PROCEDURE token (inside MAP)
        const firstProc = tokens.find(t => t.value.toUpperCase() === 'PROCEDURE' && t.line === 1);
        assert.ok(firstProc, 'Should find first PROCEDURE token');
        
        // First PROCEDURE should be child of MAP
        assert.strictEqual(firstProc?.parent, mapToken,
            'First PROCEDURE should be child of MAP');
    });

    test('PROCEDURE after MAP END should not be child of MAP', () => {
        const code = `MyMap MAP
  MyProc PROCEDURE()
END

TestProc PROCEDURE()
CODE
  RETURN
END`;
        const tokenizer = new ClarionTokenizer(code);
        const tokens = tokenizer.tokenize();
        
        // Find the MAP token
        const mapToken = tokens.find(t => t.value.toUpperCase() === 'MAP' && t.type === TokenType.Structure);
        
        // Find the second PROCEDURE token (outside MAP)
        const secondProc = tokens.find(t => t.value.toUpperCase() === 'PROCEDURE' && t.line === 4);
        assert.ok(secondProc, 'Should find second PROCEDURE token');
        
        // Second PROCEDURE should NOT be child of MAP
        assert.notStrictEqual(secondProc?.parent, mapToken,
            'Second PROCEDURE should NOT be child of MAP');
    });

    test('All structure types should have finishesAt set with proper END', () => {
        const structureTypes = ['MAP', 'CLASS', 'INTERFACE', 'GROUP', 'QUEUE', 'RECORD'];
        
        for (const structType of structureTypes) {
            const code = `My${structType} ${structType}
  Field1 LONG
  Field2 STRING(20)
END`;
            
            const tokenizer = new ClarionTokenizer(code);
            const tokens = tokenizer.tokenize();
            
            // Find the structure token
            const structToken = tokens.find(t => 
                t.value.toUpperCase() === structType && t.type === TokenType.Structure);
            
            assert.ok(structToken, `Should find ${structType} token`);
            assert.ok(structToken?.finishesAt !== undefined,
                `${structType} should have finishesAt set (currently ${structToken?.finishesAt})`);
            assert.strictEqual(structToken?.finishesAt, 3, 
                `${structType} should finish at line 3 (END line)`);
        }
    });

    test('Nested structures should all have finishesAt set', () => {
        const code = `OuterQueue QUEUE
  InnerGroup GROUP
    Field1 LONG
  END
  Field2 STRING(20)
END`;
        const tokenizer = new ClarionTokenizer(code);
        const tokens = tokenizer.tokenize();
        
        // Find both structure tokens
        const queueToken = tokens.find(t => t.value.toUpperCase() === 'QUEUE' && t.type === TokenType.Structure);
        const groupToken = tokens.find(t => t.value.toUpperCase() === 'GROUP' && t.type === TokenType.Structure);
        
        assert.ok(queueToken, 'Should find QUEUE token');
        assert.ok(groupToken, 'Should find GROUP token');
        
        // Both should have finishesAt set
        assert.ok(queueToken?.finishesAt !== undefined,
            `QUEUE should have finishesAt set (currently ${queueToken?.finishesAt})`);
        assert.ok(groupToken?.finishesAt !== undefined,
            `GROUP should have finishesAt set (currently ${groupToken?.finishesAt})`);
        
        // GROUP should finish before QUEUE
        assert.ok(groupToken!.finishesAt! < queueToken!.finishesAt!,
            'Inner GROUP should finish before outer QUEUE');
    });

    // ⚠️ REPRODUCTION TEST: Standalone dot terminator on separate line
    test('IF structure with standalone dot on separate line should close structure', () => {
        const code = `TestProc PROCEDURE()
x LONG
  CODE
  IF x > 0 THEN
    MESSAGE('Error allocating string of size ' & x)
  .
  RETURN`;
        
        const tokenizer = new ClarionTokenizer(code);
        const tokens = tokenizer.tokenize();
        
        // Find the IF token
        const ifToken = tokens.find(t => t.value.toUpperCase() === 'IF' && t.type === TokenType.Structure);
        assert.ok(ifToken, 'Should find IF token');
        assert.strictEqual(ifToken?.line, 3, 'IF should be on line 3');
        
        // Find the dot token
        const dotToken = tokens.find(t => t.value === '.' && t.type === TokenType.EndStatement && t.line === 5);
        assert.ok(dotToken, 'Should find standalone dot token on line 5');
        
        // ✅ CRITICAL ASSERTIONS:
        // 1. IF structure should have finishesAt set
        assert.ok(ifToken?.finishesAt !== undefined,
            `IF should have finishesAt set (currently ${ifToken?.finishesAt})`);
        
        // 2. IF should finish at the dot line (line 5)
        assert.strictEqual(ifToken?.finishesAt, 5,
            `IF should finish at line 5 (dot line), but finishesAt is ${ifToken?.finishesAt}`);
        
        // 3. IF should NOT be left on the structure stack (verified by finishesAt being set)
        // This is implicitly tested by assertion #1 and #2
        
        // 🔍 DEBUG: Log token details for investigation
        console.log(`\n=== DEBUG: IF Token Details ===`);
        console.log(`IF token type: ${TokenType[ifToken!.type]}`);
        console.log(`IF token subType: ${ifToken!.subType !== undefined ? TokenType[ifToken!.subType] : 'undefined'}`);
        console.log(`IF token finishesAt: ${ifToken!.finishesAt}`);
        console.log(`IF token line: ${ifToken!.line}`);
    });
});
