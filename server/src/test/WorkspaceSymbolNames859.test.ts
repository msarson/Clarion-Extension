import * as assert from 'assert';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { SymbolInformation, SymbolKind } from 'vscode-languageserver-types';
import { TokenCache } from '../TokenCache';
import { ClarionDocumentSymbolProvider } from '../providers/ClarionDocumentSymbolProvider';
import { WorkspaceSymbolProvider } from '../providers/WorkspaceSymbolProvider';
import { setServerInitialized } from '../serverState';

/**
 * Issue #859 — workspace/symbol reused the Outline's display text as the symbol name,
 * so Ctrl+T showed `GROUP (GLO:Settings),PRE(GLO)` and matched the query against it.
 * The name is now the label; the Outline keeps its own text.
 */

const URI = 'file:///c:/test859/app.clw';
const SOURCE = [
    '  PROGRAM',
    '  MAP',
    'DoThing     PROCEDURE(LONG pId),LONG',
    '  END',
    'GLO:Settings GROUP,PRE(GLO)',
    'Name          STRING(20)',
    '            END',
    'GLO:ListQ   QUEUE,PRE(LQ)',
    'Id            LONG',
    '            END',
    "Cust        FILE,DRIVER('TOPSPEED'),PRE(CUS)",
    'IdKey         KEY(CUS:Id)',
    'Record        RECORD',
    'Id              LONG',
    '              END',
    '            END',
    'GLO:Count   LONG',
    'Thing       CLASS,TYPE',
    'Init          PROCEDURE',
    '            END',
    '  CODE',
    '  RETURN',
    'DoThing     PROCEDURE(LONG pId)',
    'Loc         LONG',
    '  CODE',
    '  DO MyRoutine',
    '  RETURN 1',
    'MyRoutine   ROUTINE',
    '  Loc = 1',
    'Thing.Init  PROCEDURE',
    '  CODE'
].join('\r\n');

suite('Issue #859 — workspace/symbol names are labels', () => {
    let provider: WorkspaceSymbolProvider;

    const find = (results: SymbolInformation[], name: string, kind?: SymbolKind): SymbolInformation => {
        const hit = results.find(r => r.name === name && (kind === undefined || r.kind === kind));
        assert.ok(hit, `no symbol named ${name}; got: ${results.map(r => r.name).join(' | ')}`);
        return hit!;
    };

    setup(() => {
        setServerInitialized(true);
        TokenCache.getInstance().clearAllTokens();
        TokenCache.getInstance().getTokens(TextDocument.create(URI, 'clarion', 1, SOURCE));
        provider = new WorkspaceSymbolProvider();
    });

    test('the name is the bare label, and the kind is unchanged', async () => {
        const results = await provider.provideWorkspaceSymbols('');
        find(results, 'GLO:Settings', SymbolKind.Struct);
        find(results, 'GLO:ListQ', SymbolKind.Array);
        find(results, 'Cust', SymbolKind.File);
        find(results, 'Record', SymbolKind.Struct);
        find(results, 'GLO:Count', SymbolKind.Variable);
        find(results, 'Name', SymbolKind.Variable);
        find(results, 'IdKey', SymbolKind.Key);
        find(results, 'Thing', SymbolKind.Class);
        find(results, 'DoThing', SymbolKind.Function);
        find(results, 'Thing.Init');
        find(results, 'MyRoutine');
    });

    test('a top-level symbol carries its type and attributes in containerName', async () => {
        const results = await provider.provideWorkspaceSymbols('');
        assert.strictEqual(find(results, 'GLO:Settings').containerName, 'GROUP,PRE(GLO)');
        assert.strictEqual(find(results, 'Cust').containerName, 'FILE,TOPSPEED,PRE(CUS)');
        assert.strictEqual(find(results, 'GLO:Count').containerName, 'LONG');
    });

    test("a child's containerName is its parent's label", async () => {
        const results = await provider.provideWorkspaceSymbols('');
        assert.strictEqual(find(results, 'Name').containerName, 'GLO:Settings');
        assert.strictEqual(find(results, 'IdKey').containerName, 'Cust');
        assert.strictEqual(find(results, 'Record').containerName, 'Cust');
        assert.strictEqual(find(results, 'Loc').containerName, 'DoThing');
    });

    test('the query matches the label, not the declaration text', async () => {
        assert.deepStrictEqual(await provider.provideWorkspaceSymbols('PRE('), []);
        assert.deepStrictEqual(await provider.provideWorkspaceSymbols('QUEUE'), []);
        const hits = await provider.provideWorkspaceSymbols('settings');
        assert.deepStrictEqual(hits.map(r => r.name), ['GLO:Settings']);
    });

    test('an unlabelled MAP is not listed, the procedures inside it are', async () => {
        const results = await provider.provideWorkspaceSymbols('');
        assert.ok(!results.some(r => r.name === 'MAP'), 'MAP has no label to go to');
        assert.ok(results.filter(r => r.name === 'DoThing').length >= 2, 'the prototype and the body');
    });

    test('an unlabelled window control keeps its text; a procedure labelled like a keyword keeps its label', async () => {
        const uri = 'file:///c:/test859/win.clw';
        TokenCache.getInstance().getTokens(TextDocument.create(uri, 'clarion', 1, [
            '  PROGRAM',
            '  MAP',
            '  END',
            'Win         WINDOW(\'Caption\'),AT(0,0,100,100)',
            '              BUTTON(\'OK\'),USE(?OkBtn),AT(1,1,10,10)',
            '            END',
            '  CODE',
            '  RETURN',
            'Join        PROCEDURE',
            '  CODE',
            'Module      PROCEDURE',
            '  CODE'
        ].join('\r\n')));
        const results = await provider.provideWorkspaceSymbols('');
        find(results, 'Join', SymbolKind.Function);
        find(results, 'Module', SymbolKind.Function);
        assert.strictEqual(find(results, 'Win').containerName, "WINDOW('Caption')");
        assert.strictEqual(find(results, "BUTTON('OK')").containerName, 'Win');
    });

    // Review follow-up: shapes the first fixture did not hold.
    test('procedures named Functions or Methods, an INDEX, overloads and empty parameter lists', async () => {
        const uri = 'file:///c:/test859/review.clw';
        TokenCache.getInstance().getTokens(TextDocument.create(uri, 'clarion', 1, [
            '  PROGRAM',
            '  MAP',
            'Functions   PROCEDURE(LONG a)',
            "    MODULE('ext.clw')",
            'Over          PROCEDURE(LONG a)',
            'Over          PROCEDURE(STRING a)',
            '    END',
            '  END',
            "Cust        FILE,DRIVER('TOPSPEED'),PRE(CUS)",
            'NameIdx       INDEX(CUS:Name)',
            'Record        RECORD',
            'Name            STRING(20)',
            '              END',
            '            END',
            'Thing       CLASS,TYPE',
            'Methods       PROCEDURE',
            '            END',
            '  CODE',
            '  RETURN',
            'Sub         PROCEDURE()',
            '  CODE'
        ].join('\r\n')));
        const results = (await provider.provideWorkspaceSymbols('')).filter(r => r.location.uri === uri);
        const names = results.map(r => `${r.name} [${r.containerName}]`).join(' | ');

        assert.ok(results.some(r => r.name === 'Functions'), `a MAP procedure named Functions is listed: ${names}`);
        assert.strictEqual(find(results, 'Methods').containerName, 'Thing', names);

        const index = find(results, 'NameIdx');
        assert.strictEqual(index.containerName, 'Cust', names);
        assert.ok(!results.some(r => /INDEX\(/.test(r.name)), `no INDEX text in a name: ${names}`);

        const overloads = results.filter(r => r.name === 'Over');
        assert.strictEqual(overloads.length, 2, names);
        assert.ok(overloads.some(r => /LONG/i.test(r.containerName ?? '')), `the LONG overload shows its signature: ${names}`);
        assert.ok(overloads.some(r => /STRING/i.test(r.containerName ?? '')), `the STRING overload shows its signature: ${names}`);

        assert.strictEqual(find(results, 'Sub').containerName, undefined, `no "()" beside a procedure without parameters: ${names}`);
    });

    test('the Outline keeps its display text', () => {
        const tokens = TokenCache.getInstance().getTokensByUri(URI)!;
        const names = new ClarionDocumentSymbolProvider().provideDocumentSymbols(tokens, URI).map(s => s.name);
        assert.ok(names.includes('GROUP (GLO:Settings),PRE(GLO)'), names.join(' | '));
    });
});
