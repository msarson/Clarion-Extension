/**
 * Tests for ImplementationProvider refactoring to use DocumentStructure APIs
 * Tests the IMPROVED behavior after refactoring to use DocumentStructure.isInMapBlock()
 */

import * as assert from 'assert';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Position } from 'vscode-languageserver-protocol';
import { ImplementationProvider } from '../providers/ImplementationProvider';
import { TokenCache } from '../TokenCache';

suite('ImplementationProvider - DocumentStructure API Integration', () => {
    let provider: ImplementationProvider;
    let tokenCache: TokenCache;

    setup(() => {
        provider = new ImplementationProvider();
        tokenCache = TokenCache.getInstance();
    });
    
    teardown(() => {
        // Clear any cached documents after each test
        tokenCache.clearTokens('test://test1.clw');
        tokenCache.clearTokens('test://test2.clw');
        tokenCache.clearTokens('test://test3.clw');
    });

    suite('MAP procedure implementation finding (integration test)', () => {
        test('should find implementation for MAP declaration', async () => {
            const code = `  MAP
    TestProc PROCEDURE()
  END

TestProc PROCEDURE()
CODE
  RETURN
END`;
            const doc = TextDocument.create('test://test1.clw', 'clarion', 1, code);
            const position = Position.create(1, 7); // On "TestProc" in MAP
            
            const location = await provider.provideImplementation(doc, position);
            
            assert.ok(location, 'Should find implementation');
            if (location && !Array.isArray(location)) {
                assert.strictEqual(location.range.start.line, 4, 'Should point to implementation line');
            }
        });

        test('should handle MAP declaration without implementation', async () => {
            const code = `  MAP
    NonExistent PROCEDURE()
  END`;
            const doc = TextDocument.create('test://test2.clw', 'clarion', 1, code);
            const position = Position.create(1, 7); // On "NonExistent" in MAP
            
            const location = await provider.provideImplementation(doc, position);
            
            assert.strictEqual(location, null, 'Should return null when no implementation found');
        });

        test('should handle overloaded procedures correctly', async () => {
            const code = `  MAP
    TestProc PROCEDURE()
    TestProc PROCEDURE(STRING s)
  END

TestProc PROCEDURE()
CODE
  RETURN
END

TestProc PROCEDURE(STRING s)
CODE
  RETURN
END`;
            const doc = TextDocument.create('test://test3.clw', 'clarion', 1, code);
            const position = Position.create(2, 7); // On second "TestProc" in MAP
            
            const location = await provider.provideImplementation(doc, position);
            
            assert.ok(location, 'Should find implementation');
            if (location && !Array.isArray(location)) {
                // Should find the one with STRING parameter
                assert.strictEqual(location.range.start.line, 10, 'Should point to overload with STRING parameter');
            }
        });
    });
});
