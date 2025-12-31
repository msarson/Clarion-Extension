import { ScopeAnalyzer } from './ScopeAnalyzer';
import { TokenCache } from '../TokenCache';
import { TextDocument } from 'vscode-languageserver-textdocument';

function createTestDocument(content: string, uri: string = 'file:///test.clw'): TextDocument {
    return TextDocument.create(uri, 'clarion', 1, content);
}

describe('ScopeAnalyzer', () => {
    let analyzer: ScopeAnalyzer;
    let tokenCache: TokenCache;
    
    beforeEach(() => {
        tokenCache = TokenCache.getInstance();
        analyzer = new ScopeAnalyzer(tokenCache, null);
    });
    
    // Tests will be added here
});
