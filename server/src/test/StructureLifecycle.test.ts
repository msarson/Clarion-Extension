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

    test('All structure types should have finishesAt set at EOF', () => {
        const structureTypes = ['MAP', 'CLASS', 'INTERFACE', 'GROUP', 'QUEUE', 'RECORD'];
        
        for (const structType of structureTypes) {
            const code = `My${structType} ${structType}
  Field1 LONG
  Field2 STRING(20)`;
            
            const tokenizer = new ClarionTokenizer(code);
            const tokens = tokenizer.tokenize();
            
            // Find the structure token
            const structToken = tokens.find(t => 
                t.value.toUpperCase() === structType && t.type === TokenType.Structure);
            
            assert.ok(structToken, `Should find ${structType} token`);
            assert.ok(structToken?.finishesAt !== undefined,
                `${structType} should have finishesAt set (currently ${structToken?.finishesAt})`);
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
});
