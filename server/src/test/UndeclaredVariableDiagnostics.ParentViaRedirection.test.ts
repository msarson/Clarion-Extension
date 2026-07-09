import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { ClarionTokenizer } from '../ClarionTokenizer';
import { TokenCache } from '../TokenCache';
import { ScopeAnalyzer } from '../utils/ScopeAnalyzer';
import { SymbolFinderService } from '../services/SymbolFinderService';
import { SolutionManager } from '../solution/solutionManager';
import { validateUndeclaredVariablesAsync } from '../providers/diagnostics/UndeclaredVariableDiagnostics';
import { serverSettings } from '../serverSettings';

/**
 * #300 — false "'thisStartup' is not declared in this file" for a global class
 * instance declared in the MEMBER parent (`thisStartup ctStartup,External,DLL(dll_mode)`
 * in IBSUtils.clw) that hover resolves fine.
 *
 * Root cause: SymbolFinderService.findGlobalVariableInParentFile resolved the
 * MEMBER target SAME-DIR ONLY (`path.resolve(currentFileDir, parentFile)`).
 * Generated multi-DLL apps put member modules in genfiles\src while the app
 * main lives elsewhere (project root per the RED) — the same-dir probe misses
 * and the whole Tier-6 walk dead-ends, with no redirection fallback (the
 * pattern every other cross-file resolution path uses).
 *
 * Fixture: member file in tmp/sub/, parent app main in tmp/ — reachable only
 * via the (faked) solution redirection.
 */
suite('UndeclaredVariableDiagnostics — MEMBER parent via redirection (#300)', () => {

    let savedUndeclaredEnabled = false;
    let savedInstance: unknown;
    let tmpDir: string;
    let subDir: string;

    suiteSetup(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'issue300-'));
        subDir = path.join(tmpDir, 'sub');
        fs.mkdirSync(subDir);

        // App main in the ROOT dir — declares the global class instance
        fs.writeFileSync(path.join(tmpDir, 'parentapp.clw'), [
            '  PROGRAM',
            '',
            '  MAP',
            '  END',
            'thisStartup          ctStartup,External,DLL(dll_mode)',
            '  CODE',
            '  RETURN',
        ].join('\n'), 'utf8');

        savedInstance = (SolutionManager as any).instance;
        (SolutionManager as any).instance = {
            solution: { projects: [] },
            findFileWithExtension: async (filename: string) => {
                const candidate = path.join(tmpDir, filename.toLowerCase());
                return fs.existsSync(candidate)
                    ? { path: candidate, source: 'test' }
                    : { path: '', source: '' };
            },
            getEquatesTokens: () => null,
            getEquatesPath: () => null,
        };
    });

    suiteTeardown(() => {
        (SolutionManager as any).instance = savedInstance;
        try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
    });

    setup(() => {
        savedUndeclaredEnabled = serverSettings.undeclaredVariablesEnabled;
        serverSettings.undeclaredVariablesEnabled = true;
    });

    teardown(() => {
        serverSettings.undeclaredVariablesEnabled = savedUndeclaredEnabled;
    });

    test('global class instance in a redirection-resolved MEMBER parent does not fire; a bogus name still does', async () => {
        const memberCode = [
            "  MEMBER('parentapp.clw')",                            // 0
            '',                                                      // 1
            '  MAP',                                                 // 2
            '  END',                                                 // 3
            'MyProc  PROCEDURE',                                     // 4
            '  CODE',                                                // 5
            "  if thisStartup.Module <> 'SSP'",                     // 6 — Tier 6 global, cross-dir parent
            '  end',                                                 // 7
            '  bogus300 = 1',                                        // 8 — genuinely undeclared sentinel
            '  RETURN',                                              // 9
        ].join('\n');
        // The member lives in sub/ — the parent is NOT in the same dir
        const memberUri = 'file:///' + path.join(subDir, 'member1.clw').replace(/\\/g, '/');
        const doc = TextDocument.create(memberUri, 'clarion', 1, memberCode);
        const tokens = new ClarionTokenizer(memberCode).tokenize();

        const tokenCache = TokenCache.getInstance();
        const scopeAnalyzer = new ScopeAnalyzer(tokenCache, undefined as never);
        const symbolFinder = new SymbolFinderService(tokenCache, scopeAnalyzer);
        const diags = await validateUndeclaredVariablesAsync(tokens, doc, symbolFinder);

        const byLine = (line: number) => diags.find(d => d.range.start.line === line);

        assert.strictEqual(byLine(6), undefined,
            'expected NO diagnostic on thisStartup (global in the MEMBER parent, resolvable via redirection); got: ' +
            JSON.stringify(diags.map(d => ({ line: d.range.start.line, msg: d.message }))));

        const bogus = byLine(8);
        assert.ok(bogus,
            'sentinel: expected a diagnostic on bogus300 (genuinely undeclared); got: ' +
            JSON.stringify(diags.map(d => ({ line: d.range.start.line, msg: d.message }))));
    });
});
