import * as assert from 'assert';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { TokenCache } from '../TokenCache';
import { ScopeAnalyzer } from '../utils/ScopeAnalyzer';
import { SymbolFinderService } from '../services/SymbolFinderService';
import { SolutionManager } from '../solution/solutionManager';
import { setServerInitialized } from '../serverState';
import { TokenType } from '../ClarionTokenizer';

/**
 * #711 — every hover that looked up a local variable rebuilt the whole document's symbol tree
 * (provideDocumentSymbols), only to find the procedure containing the cursor: about 100 ms a hover
 * on a 60k-line module, with the buffer unchanged. The tree depends only on the tokens, and the
 * token cache returns the same array until the document changes, so it is built once per array.
 */
suite('#711 the symbol tree is built once per version, not once per hover', () => {
    const src = [
        "  MEMBER('Prog')",
        '  MAP',
        '  END',
        'Work               PROCEDURE',
        'Loc:Total            LONG',
        'Loc:Name             STRING(20)',
        '  CODE',
        '  Loc:Total = 1',
        '  Loc:Name = 2',
    ].join('\r\n');

    let builds = 0;
    let service: SymbolFinderService;
    setup(() => {
        setServerInitialized(true);
        const tokenCache = TokenCache.getInstance();
        service = new SymbolFinderService(tokenCache, new ScopeAnalyzer(tokenCache, SolutionManager.getInstance()));
        const provider = (service as unknown as { symbolProvider: { provideDocumentSymbols: (...a: unknown[]) => unknown } }).symbolProvider;
        const original = provider.provideDocumentSymbols.bind(provider);
        builds = 0;
        provider.provideDocumentSymbols = (...a: unknown[]) => { builds++; return original(...a); };
    });

    const lookups = (doc: TextDocument) => {
        const tokens = TokenCache.getInstance().getTokens(doc);
        const scope = tokens.find(t => t.type === TokenType.Procedure)!;
        assert.ok(scope, 'the procedure token');
        const total = service.findLocalVariable('Loc:Total', tokens, scope, doc, undefined, 7, 4);
        const name = service.findLocalVariable('Loc:Name', tokens, scope, doc, undefined, 8, 4);
        assert.strictEqual(total?.token.line, 4, 'Loc:Total resolves to its declaration');
        assert.strictEqual(name?.token.line, 5, 'Loc:Name resolves to its declaration');
    };

    test('bug-pin: two hovers on an unchanged document build the tree once', () => {
        lookups(TextDocument.create('file:///c%3A/t711/tree1.clw', 'clarion', 1, src));
        assert.strictEqual(builds, 1, `the symbol tree was built ${builds} times for 2 lookups`);
    });

    test('a new version of the document builds it again', () => {
        lookups(TextDocument.create('file:///c%3A/t711/tree2.clw', 'clarion', 1, src));
        lookups(TextDocument.create('file:///c%3A/t711/tree2.clw', 'clarion', 2, src + '\r\n! edit'));
        assert.strictEqual(builds, 2, `built ${builds} times for 2 versions`);
    });
});
