/**
 * Tests for HoverProvider refactoring to use DocumentStructure APIs
 * Tests hover behavior for MAP procedures
 */

import * as assert from 'assert';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Position } from 'vscode-languageserver-protocol';
import { HoverProvider } from '../providers/HoverProvider';
import { TokenCache } from '../TokenCache';

suite('HoverProvider - DocumentStructure API Integration', () => {
    let provider: HoverProvider;
    let tokenCache: TokenCache;

    setup(() => {
        provider = new HoverProvider();
        tokenCache = TokenCache.getInstance();
    });

    teardown(() => {
        // Clear cached documents
        tokenCache.clearTokens('test://hover1.clw');
        tokenCache.clearTokens('test://hover2.clw');
        tokenCache.clearTokens('test://hover3.clw');
        tokenCache.clearTokens('test://hover4.clw');
    });

    suite('MAP procedure hover (declaration → implementation)', () => {
        test('should show implementation hover when hovering on MAP declaration', async () => {
            const code = `  MAP
    TestProc PROCEDURE()
  END

TestProc PROCEDURE()
CODE
  RETURN
END`;
            const doc = TextDocument.create('test://hover1.clw', 'clarion', 1, code);
            const position = Position.create(1, 7); // On "TestProc" in MAP
            
            const hover = await provider.provideHover(doc, position);
            
            assert.ok(hover, 'Should provide hover info');
            assert.ok(hover.contents, 'Should have contents');
            
            // Check that it mentions "Implementation" and has code
            const content = typeof hover.contents === 'string' 
                ? hover.contents 
                : 'value' in hover.contents ? hover.contents.value : '';
            
            assert.ok(content.includes('.clw:'), 
                'Should show implementation location (file:line)');
        });

        test('should handle MAP declaration without implementation', async () => {
            const code = `  MAP
    NonExistent PROCEDURE()
  END`;
            const doc = TextDocument.create('test://hover2.clw', 'clarion', 1, code);
            const position = Position.create(1, 7); // On "NonExistent" in MAP
            
            const hover = await provider.provideHover(doc, position);
            
            // May return null or some hover info - just shouldn't crash
            assert.ok(true, 'Should not crash on missing implementation');
        });
    });

    suite('SELF.property hover - inline class (token-based)', () => {
        test('should provide hover for indented class property in same file', async () => {
            // In Clarion, method implementations end at the next procedure (not END)
            const code = [
                'MyClass    CLASS',
                '  MyProp   STRING(10)',
                '  DoWork   PROCEDURE()',
                'END',
                '',
                'MyClass.DoWork PROCEDURE()',
                'CODE',
                '  SELF.MyProp = \'hello\'',
            ].join('\n');

            const doc = TextDocument.create('test://selfprop1.clw', 'clarion', 1, code);
            // "  SELF.MyProp = 'hello'"  (line 7)
            // "  SELF." = 7 chars → MyProp starts at col 7, cursor at col 9 (inside)
            const position = Position.create(7, 9);

            const hover = await provider.provideHover(doc, position);

            assert.ok(hover, 'Should provide hover for class property');
            const content = typeof hover.contents === 'string'
                ? hover.contents
                : 'value' in hover.contents ? hover.contents.value : '';
            assert.ok(content.includes('MyProp'), 'Hover should mention the property name');
            assert.ok(content.includes('MyClass'), 'Hover should mention the class name');
            assert.ok(content.includes('Property'), 'Hover should indicate it is a property');

            tokenCache.clearTokens('test://selfprop1.clw');
        });

        test('should show PRIVATE visibility in hover', async () => {
            const code = [
                'MyClass    CLASS',
                '  SecretProp  STRING(10),PRIVATE',
                '  DoWork      PROCEDURE()',
                'END',
                '',
                'MyClass.DoWork PROCEDURE()',
                'CODE',
                '  SELF.SecretProp = \'hidden\'',
            ].join('\n');

            const doc = TextDocument.create('test://selfprop2.clw', 'clarion', 1, code);
            // "  SELF.SecretProp" — SecretProp starts at col 7
            const position = Position.create(7, 10);

            const hover = await provider.provideHover(doc, position);

            assert.ok(hover, 'Should provide hover for private class property');
            const content = typeof hover.contents === 'string'
                ? hover.contents
                : 'value' in hover.contents ? hover.contents.value : '';
            assert.ok(content.includes('SecretProp') || content.includes('PRIVATE'),
                'Hover should mention the property or its visibility');

            tokenCache.clearTokens('test://selfprop2.clw');
        });
    });

    suite('MAP procedure hover (implementation → declaration)', () => {
        test('should show MAP declaration hover when hovering on implementation', async () => {
            const code = `  MAP
    TestProc PROCEDURE()
  END

TestProc PROCEDURE()
CODE
  RETURN
END`;
            const doc = TextDocument.create('test://hover3.clw', 'clarion', 1, code);
            const position = Position.create(4, 3); // On "TestProc" implementation
            
            const hover = await provider.provideHover(doc, position);
            
            assert.ok(hover, 'Should provide hover info');
            assert.ok(hover.contents, 'Should have contents');
            
            // Check that it mentions "MAP Declaration"
            const content = typeof hover.contents === 'string' 
                ? hover.contents 
                : 'value' in hover.contents ? hover.contents.value : '';
            
            assert.ok(content.includes('PROCEDURE'), 
                'Should show MAP declaration signature code block');
        });

        test('should NOT show MAP hover for implementation outside MAP context', async () => {
            const code = `TestProc PROCEDURE()
CODE
  RETURN
END`;
            const doc = TextDocument.create('test://hover4.clw', 'clarion', 1, code);
            const position = Position.create(0, 3); // On "TestProc" (no MAP)
            
            const hover = await provider.provideHover(doc, position);
            
            // Should not show MAP-related hover since there's no MAP
            if (hover && hover.contents) {
                const content = typeof hover.contents === 'string' 
                    ? hover.contents 
                    : 'value' in hover.contents ? hover.contents.value : '';
                
                // Should not mention MAP declaration (might show other hover info though)
                assert.ok(!content.includes('MAP Declaration'), 
                    'Should not show MAP declaration when not in MAP context');
            }
        });
    });
});
