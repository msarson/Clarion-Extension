import * as assert from 'assert';
import { ScopeAnalyzer } from './ScopeAnalyzer';
import { TokenCache } from '../TokenCache';
import { TextDocument } from 'vscode-languageserver-textdocument';

function createTestDocument(content: string, uri: string = 'file:///test.clw'): TextDocument {
    return TextDocument.create(uri, 'clarion', 1, content);
}

suite('ScopeAnalyzer', () => {
    let analyzer: ScopeAnalyzer;
    let tokenCache: TokenCache;
    
    setup(() => {
        tokenCache = TokenCache.getInstance();
        analyzer = new ScopeAnalyzer(tokenCache, null);
    });
    
    suite('getTokenScope', () => {
        test('should identify global scope in PROGRAM file', () => {
            const document = createTestDocument(`PROGRAM
MAP
END

GlobalVar LONG

CODE
`);
            
            // First check we have tokens
            const tokens = tokenCache.getTokens(document);
            assert.ok(tokens && tokens.length > 0, 'Should have tokens');
            
            // Debug: print tokens
            console.log(`\n=== Tokens (${tokens.length}) ===`);
            tokens.forEach((t, i) => {
                console.log(`${i}: line=${t.line}, type=${t.type}, subType=${t.subType}, value='${t.value}'`);
            });
            
            // Position on 'GlobalVar' line
            const scope = analyzer.getTokenScope(document, { line: 4, character: 0 });
            
            assert.ok(scope !== null, 'Scope should not be null');
            console.log(`\nScope result:`, scope);
            assert.strictEqual(scope?.type, 'global', `Expected 'global' but got '${scope?.type}'`);
            assert.strictEqual(scope?.isProgramFile, true, `Expected isProgramFile=true but got ${scope?.isProgramFile}`);
            assert.strictEqual(scope?.memberModuleName, undefined);
        });
    });
});
