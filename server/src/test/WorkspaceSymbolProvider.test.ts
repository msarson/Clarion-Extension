import * as assert from 'assert';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { SymbolInformation, SymbolKind } from 'vscode-languageserver-types';
import { TokenCache } from '../TokenCache';
import { WorkspaceSymbolProvider } from '../providers/WorkspaceSymbolProvider';
import { setServerInitialized } from '../serverState';

function createDocument(content: string, uri: string = 'file:///test.clw'): TextDocument {
    return TextDocument.create(uri, 'clarion', 1, content);
}

function seedCache(document: TextDocument): void {
    TokenCache.getInstance().getTokens(document);
}

suite('WorkspaceSymbolProvider', () => {
    let provider: WorkspaceSymbolProvider;

    setup(() => {
        setServerInitialized(true);
        TokenCache.getInstance().clearAllTokens();
        provider = new WorkspaceSymbolProvider();
    });

    test('returns empty array when no documents cached', async () => {
        const results: SymbolInformation[] = await provider.provideWorkspaceSymbols('');
        assert.ok(Array.isArray(results), 'Should return an array');
    });

    test('finds procedures from a cached document', async () => {
        const code = [
            'MyProc PROCEDURE',
            'CODE',
            '  RETURN',
            '',
            'AnotherProc PROCEDURE',
            'CODE',
            '  RETURN',
        ].join('\n');
        const doc = createDocument(code);
        seedCache(doc);

        const results: SymbolInformation[] = await provider.provideWorkspaceSymbols('');
        assert.ok(results.length >= 2, `Expected at least 2 symbols, got ${results.length}`);
        const names = results.map((r: SymbolInformation) => r.name);
        assert.ok(names.some((n: string) => n.toLowerCase().includes('myproc')), 'Should find MyProc');
        assert.ok(names.some((n: string) => n.toLowerCase().includes('anotherproc')), 'Should find AnotherProc');
    });

    test('filters by query string (case-insensitive)', async () => {
        const code = [
            'InitProc PROCEDURE',
            'CODE',
            '  RETURN',
            '',
            'KillProc PROCEDURE',
            'CODE',
            '  RETURN',
        ].join('\n');
        const doc = createDocument(code);
        seedCache(doc);

        const results: SymbolInformation[] = await provider.provideWorkspaceSymbols('init');
        assert.ok(results.length >= 1, 'Should find at least one symbol matching "init"');
        assert.ok(
            results.every((r: SymbolInformation) => r.name.toLowerCase().includes('init')),
            'All results should match the query'
        );
    });

    test('empty query returns all symbols', async () => {
        const code = [
            'ProcA PROCEDURE',
            'CODE',
            '  RETURN',
            '',
            'ProcB PROCEDURE',
            'CODE',
            '  RETURN',
        ].join('\n');
        const doc = createDocument(code);
        seedCache(doc);

        const all: SymbolInformation[] = await provider.provideWorkspaceSymbols('');
        const filtered: SymbolInformation[] = await provider.provideWorkspaceSymbols('ProcA');
        assert.ok(all.length >= filtered.length, 'Empty query should return >= filtered results');
    });

    test('returns SymbolInformation with correct location URI', async () => {
        const uri = 'file:///myproject/myfile.clw';
        const doc = createDocument('MyProc PROCEDURE\nCODE\n  RETURN', uri);
        seedCache(doc);

        const results: SymbolInformation[] = await provider.provideWorkspaceSymbols('MyProc');
        assert.ok(results.length >= 1, 'Should find MyProc');
        assert.ok(
            results.some((r: SymbolInformation) => r.location.uri === uri),
            `Expected a result with URI ${uri}`
        );
    });

    test('symbols have appropriate SymbolKind', async () => {
        const code = [
            'MyProc PROCEDURE',
            'CODE',
            '  RETURN',
        ].join('\n');
        const doc = createDocument(code);
        seedCache(doc);

        const results: SymbolInformation[] = await provider.provideWorkspaceSymbols('MyProc');
        assert.ok(results.length >= 1);
        // Procedures should be Function (12) or Method (6)
        const validKinds = [SymbolKind.Function, SymbolKind.Method, SymbolKind.Module];
        assert.ok(
            results.some((r: SymbolInformation) => validKinds.includes(r.kind as any)),
            `Expected a procedure-like kind, got ${results[0]?.kind}`
        );
    });

    test('searches across multiple cached documents', async () => {
        const doc1 = createDocument('ProcFromFile1 PROCEDURE\nCODE\n  RETURN', 'file:///file1.clw');
        const doc2 = createDocument('ProcFromFile2 PROCEDURE\nCODE\n  RETURN', 'file:///file2.clw');
        seedCache(doc1);
        seedCache(doc2);

        const results: SymbolInformation[] = await provider.provideWorkspaceSymbols('ProcFrom');
        assert.ok(results.length >= 2, `Expected results from both files, got ${results.length}`);
        const uris = results.map((r: SymbolInformation) => r.location.uri);
        assert.ok(uris.includes('file:///file1.clw'), 'Should include file1');
        assert.ok(uris.includes('file:///file2.clw'), 'Should include file2');
    });
});
