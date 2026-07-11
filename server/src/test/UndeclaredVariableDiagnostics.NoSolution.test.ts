import * as assert from 'assert';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { TokenCache } from '../TokenCache';
import { DiagnosticProvider } from '../providers/DiagnosticProvider';
import { SymbolFinderService } from '../services/SymbolFinderService';
import { SolutionManager } from '../solution/solutionManager';
import { serverSettings } from '../serverSettings';
import { setServerInitialized } from '../serverState';

/**
 * #287 — the undeclared-variable diagnostic must be suppressed in no-solution mode. Without a loaded
 * solution there is no cross-file symbol index, so legitimate cross-file globals (GlobalRequest,
 * GlobalResponse, module/global data declared elsewhere) can't be resolved and would all be flagged
 * as undeclared (Edin's report on #82). Loading the solution restores full coverage.
 */

type SmSlot = { instance: SolutionManager | null };
const smSlot = SolutionManager as unknown as SmSlot;

// A finder that resolves nothing — so any name not declared in-file stays "undeclared".
const NULL_FINDER = { findSymbol: async () => null } as unknown as SymbolFinderService;

// `GlobalResponse` is used in CODE but declared in no other visible file — the classic cross-file
// global that only a loaded solution's index can resolve.
const FIXTURE = 'MyProc PROCEDURE\n  CODE\n  GlobalResponse = 1';

async function run(uri: string) {
    const doc = TextDocument.create(uri, 'clarion', 1, FIXTURE);
    const cache = TokenCache.getInstance();
    const tokens = cache.getTokens(doc);
    cache.getStructure(doc); // enrich executionMarker / finishesAt in place (as the pipeline does)
    return DiagnosticProvider.validateUndeclaredVariables(tokens, doc, NULL_FINDER);
}

suite('#287 undeclared-variable diagnostic suppressed in no-solution mode', () => {
    let savedInstance: SolutionManager | null;
    let savedEnabled: boolean;

    setup(() => {
        setServerInitialized(true);
        TokenCache.getInstance().clearAllTokens();
        savedInstance = smSlot.instance;
        savedEnabled = serverSettings.undeclaredVariablesEnabled;
        serverSettings.undeclaredVariablesEnabled = true;
    });

    teardown(() => {
        smSlot.instance = savedInstance;
        serverSettings.undeclaredVariablesEnabled = savedEnabled;
    });

    test('no solution loaded → suppressed (no false-positive on a cross-file global)', async () => {
        smSlot.instance = null;
        assert.deepStrictEqual(await run('file:///t287-nosln.clw'), []);
    });

    test('solution loaded → an unresolved global is still flagged', async () => {
        smSlot.instance = {} as unknown as SolutionManager; // non-null → gate passes
        const diags = await run('file:///t287-sln.clw');
        assert.strictEqual(diags.length, 1);
        assert.ok(diags[0].message.includes('GlobalResponse'), diags[0].message);
    });

    test('the enable setting still wins even with a solution loaded', async () => {
        smSlot.instance = {} as unknown as SolutionManager;
        serverSettings.undeclaredVariablesEnabled = false;
        assert.deepStrictEqual(await run('file:///t287-off.clw'), []);
    });
});
