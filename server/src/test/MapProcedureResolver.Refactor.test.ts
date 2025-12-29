import { strictEqual } from 'assert';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { MapProcedureResolver } from '../utils/MapProcedureResolver';
import { TokenCache } from '../TokenCache';

/**
 * Baseline tests for MapProcedureResolver refactoring
 * Tests MAP block detection behavior before refactoring to use DocumentStructure
 */
suite('MapProcedureResolver - Refactor Tests', () => {
    const tokenCache = TokenCache.getInstance();
    const resolver = new MapProcedureResolver();

    teardown(() => {
        // Clear token cache between tests
        tokenCache.clearTokens('test://mapresolver1.clw');
        tokenCache.clearTokens('test://mapresolver2.clw');
        tokenCache.clearTokens('test://mapresolver3.clw');
    });

    test('findProcedureImplementation - detects position inside MAP block', async () => {
        const code = `  MAP
    TestProc PROCEDURE()
  END
  
TestProc PROCEDURE()
CODE
  RETURN`;

        const doc = TextDocument.create('test://mapresolver1.clw', 'clarion', 1, code);
        const tokens = tokenCache.getTokens(doc);
        
        // Position at line 1 (inside MAP, on TestProc declaration)
        const result = await resolver.findProcedureImplementation('TestProc', tokens, doc, { line: 1, character: 4 }, undefined);
        
        strictEqual(result !== null, true, 'Should find implementation from MAP declaration');
        if (result) {
            strictEqual(result.uri, doc.uri);
            strictEqual(result.range.start.line, 4, 'Should navigate to line 4 (implementation)');
        }
    });

    test('findProcedureImplementation - rejects position inside PROCEDURE block', async () => {
        const code = `  MAP
    TestProc PROCEDURE()
  END
  
TestProc PROCEDURE()
CODE
  RETURN
  TestProc  !Reference to self - should NOT navigate
END`;

        const doc = TextDocument.create('test://mapresolver2.clw', 'clarion', 1, code);
        const tokens = tokenCache.getTokens(doc);
        
        // Position at line 7 (inside PROCEDURE code, not MAP)
        const result = await resolver.findProcedureImplementation('TestProc', tokens, doc, { line: 7, character: 2 }, undefined);
        
        strictEqual(result === null, true, 'Should NOT navigate from inside PROCEDURE block');
    });

    test('findProcedureImplementation - rejects position outside MAP block', async () => {
        const code = `  MAP
    TestProc PROCEDURE()
  END
  
TestProc PROCEDURE()
CODE
  RETURN
END

! Comment outside all blocks - cursor on TestProc reference
! TestProc`;

        const doc = TextDocument.create('test://mapresolver3.clw', 'clarion', 1, code);
        const tokens = tokenCache.getTokens(doc);
        
        // Position at line 10 (outside MAP, outside PROCEDURE)
        const result = await resolver.findProcedureImplementation('TestProc', tokens, doc, { line: 10, character: 2 }, undefined);
        
        strictEqual(result === null, true, 'Should NOT navigate from outside MAP block');
    });
});
