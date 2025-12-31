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
        tokenCache.clearAllTokens(); // Clear cache between tests
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
            
            const scope = analyzer.getTokenScope(document, { line: 4, character: 0 });
            
            assert.ok(scope !== null, 'Scope should not be null');
            assert.strictEqual(scope?.type, 'global');
            assert.strictEqual(scope?.isProgramFile, true);
            assert.strictEqual(scope?.memberModuleName, undefined);
        });

        test('should identify module scope in MEMBER file', () => {
            const document = createTestDocument(`MEMBER('Main')

ModuleVar LONG

MyProc PROCEDURE
`);
            
            const scope = analyzer.getTokenScope(document, { line: 2, character: 0 });
            
            assert.ok(scope !== null, 'Scope should not be null');
            assert.strictEqual(scope?.type, 'module');
            assert.strictEqual(scope?.isProgramFile, false);
            assert.strictEqual(scope?.memberModuleName, 'Main');
        });
    });
});
