import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { SymbolFinderService } from '../services/SymbolFinderService';
import { TokenCache } from '../TokenCache';
import { ScopeAnalyzer } from '../utils/ScopeAnalyzer';
import { SolutionManager } from '../solution/solutionManager';
import { TokenHelper } from '../utils/TokenHelper';
import { StructureDeclarationIndexer } from '../utils/StructureDeclarationIndexer';
import { serverSettings } from '../serverSettings';
import { setServerInitialized } from '../serverState';

/**
 * #362 step 3b — F12 / definition on a cross-file library PROCEDURE now resolves
 * from the procedure index BEFORE the tier-6 sibling-member VARIABLE walk. That
 * walk builds a whole family label index (~15s on a big program) hunting a module
 * variable that a library MODULE prototype can never be.
 *
 * The fixture uses the real NetTalk shorthand shape: a keyword-less `Name(...)`
 * prototype indented inside a `module('')` block. The host does NOT include the
 * declaring file, so ONLY the index can reach it — a non-null result proves the
 * fast-path fired and landed on the right declaration.
 */
suite('SymbolFinderService - definition proc index fast-path (#362 step 3b)', () => {
    let tmpDir: string;
    let savedLibsrc: string[] = [];
    let service: SymbolFinderService;
    const tokenCache = TokenCache.getInstance();
    const indexer = StructureDeclarationIndexer.getInstance();

    setup(() => {
        setServerInitialized(true);
        const scopeAnalyzer = new ScopeAnalyzer(tokenCache, SolutionManager.getInstance());
        service = new SymbolFinderService(tokenCache, scopeAnalyzer);

        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'def-procidx-362-'));
        // netlib.inc — keyword-less shorthand prototype inside a module('') block.
        fs.writeFileSync(path.join(tmpDir, 'netlib.inc'), [
            '  map',
            "    module('netlib.clw')",
            "      NetLibTrace(string),long,proc,pascal,name('NetLibTrace'),DLL(dll_mode)",
            '    end',
            '  end'
        ].join('\n'));

        savedLibsrc = serverSettings.libsrcPaths;
        serverSettings.libsrcPaths = [tmpDir];
        indexer.clearCache();
    });

    teardown(async () => {
        await (indexer as unknown as { runDeferredValidations(): Promise<void> }).runDeferredValidations();
        serverSettings.libsrcPaths = savedLibsrc;
        indexer.clearCache();
        setServerInitialized(false);
        try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
    });

    test('resolves a library MODULE prototype the host does not include', async () => {
        await indexer.buildIndex(tmpDir);
        assert.strictEqual(indexer.findProcedure('NetLibTrace').length, 1,
            'precondition: the shorthand prototype is indexed');

        // Host: a procedure whose CODE calls NetLibTrace, with NO include of netlib.inc.
        const hostCode = [
            "  MEMBER('host.clw')",
            '  MAP',
            '  END',
            'HostProc PROCEDURE',
            '  CODE',
            '  NetLibTrace(\'hello\')',
            '  RETURN'
        ].join('\n');
        const doc = TextDocument.create('test://defproc.clw', 'clarion', 1, hostCode);
        const tokens = tokenCache.getTokens(doc);
        // Position on the NetLibTrace call (line index 5).
        const callLine = 5;
        const scope = TokenHelper.getInnermostScopeAtLine(tokens, callLine) ?? undefined;

        const result = await service.findSymbol('NetLibTrace', doc, { line: callLine, character: 4 }, scope);

        assert.ok(result, 'the procedure index resolved a proc the host does not INCLUDE (only the index could)');
        assert.ok(result!.location.uri.toLowerCase().includes('netlib.inc'), 'resolved to the declaring header');
        assert.strictEqual(result!.location.line, 2, 'landed on the NetLibTrace prototype (0-based line 2)');
        assert.strictEqual(result!.type, 'PROCEDURE');

        tokenCache.clearTokens('test://defproc.clw');
    });

    test('a dotted/qualified name is not probed as a procedure', async () => {
        await indexer.buildIndex(tmpDir);
        const doc = TextDocument.create('test://defproc2.clw', 'clarion', 1,
            ['HostProc PROCEDURE', '  CODE', '  x = Foo.Bar', '  RETURN'].join('\n'));
        const tokens = tokenCache.getTokens(doc);
        const scope = TokenHelper.getInnermostScopeAtLine(tokens, 2) ?? undefined;
        // Foo.Bar is member access — the proc-index tier must decline (returns via
        // other tiers or null), never mis-resolving a qualified name.
        const result = await service.findSymbol('Foo.Bar', doc, { line: 2, character: 6 }, scope);
        // No such symbol anywhere → null; the key assertion is it did not throw and
        // did not resolve to the header.
        assert.ok(!result || !result.location.uri.toLowerCase().includes('netlib.inc'),
            'qualified name must not resolve to the library prototype');
        tokenCache.clearTokens('test://defproc2.clw');
    });
});
