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
import { setServerInitialized } from '../serverState';

/**
 * #396 — a `.app` global (declared in the generated PROGRAM) is flagged
 * "'X' is not declared in this file" from a MEMBER module, while hover on the
 * same word resolves it as a global. Both the diagnostic and hover locate the
 * PROGRAM parent via redirection — but through DIFFERENT resolvers:
 *
 *   - hover      → resolveViaProjectRedirection (the owning project's .red parser)
 *   - diagnostic → SolutionManager.findFileWithExtension (project sourceFiles first)
 *
 * In a generated multi-DLL layout (MEMBER in a DLL project's genfiles\src, PROGRAM
 * in the exe project) the two front doors disagree: the .red parser finds the
 * parent, findFileWithExtension misses — so the diagnostic false-positives on a
 * global hover resolves fine.
 *
 * This test reproduces that exact divergence: the fake project's .red parser
 * (resolveViaProjectRedirection's source) CAN resolve MyApp.clw, while
 * findFileWithExtension returns a miss. RED before the fix (diagnostic used only
 * findFileWithExtension → dbgCount flagged); GREEN after Tier 6 converges onto
 * resolveViaProjectRedirection, the resolver hover already uses.
 */

const MEMBER_SRC = [
    "  MEMBER('MyApp.clw')",        // 0
    '  MAP',                        // 1
    '  END',                        // 2
    'BrowseAuthors PROCEDURE',      // 3
    '  CODE',                       // 4
    '  dbgCount = 1',               // 5 — uses the .app global
    '  RETURN',                     // 6
].join('\n');

const PROGRAM_SRC = [
    '  PROGRAM',            // 0
    '',                     // 1
    '  MAP',                // 2
    '  END',                // 3
    '',                     // 4
    'dbgCount    LONG',     // 5 — Tier 6 global (the .app global)
    '',                     // 6
    '  CODE',               // 7
    '  RETURN',             // 8
].join('\n');

async function runDiagnostic(doc: TextDocument): Promise<{ line: number; message: string }[]> {
    const tokenCache = TokenCache.getInstance();
    const scopeAnalyzer = new ScopeAnalyzer(tokenCache, undefined as never);
    const symbolFinder = new SymbolFinderService(tokenCache, scopeAnalyzer);
    const tokens = new ClarionTokenizer(doc.getText()).tokenize();
    const diags = await validateUndeclaredVariablesAsync(tokens, doc, symbolFinder);
    return diags.map(d => ({
        line: d.range.start.line,
        message: typeof d.message === 'string' ? d.message : ''
    }));
}

suite('#396 — diagnostic converges on hover\'s redirection resolver for the MEMBER parent', () => {
    type SmSlot = { instance: SolutionManager | null };
    const smSlot = SolutionManager as unknown as SmSlot;

    let savedInstance: SolutionManager | null;
    let savedEnabled: boolean;
    let tmpRoot: string;
    let parentPath: string;   // <tmp>/exe/MyApp.clw  (a DIFFERENT dir from the member)
    let memberUri: string;    // <tmp>/dll/genfiles/src/BrowseAuthors.clw

    setup(() => {
        setServerInitialized(true);
        savedInstance = smSlot.instance;
        savedEnabled = serverSettings.undeclaredVariablesEnabled;
        serverSettings.undeclaredVariablesEnabled = true;
        TokenCache.getInstance().clearAllTokens();

        tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'clarion-396-'));
        const exeDir = path.join(tmpRoot, 'exe');
        const memberDir = path.join(tmpRoot, 'dll', 'genfiles', 'src');
        fs.mkdirSync(exeDir, { recursive: true });
        fs.mkdirSync(memberDir, { recursive: true });

        // The PROGRAM parent lives on disk in the exe project's dir.
        parentPath = path.join(exeDir, 'MyApp.clw');
        fs.writeFileSync(parentPath, PROGRAM_SRC, 'utf-8');

        memberUri = `file:///${path.join(memberDir, 'BrowseAuthors.clw').replace(/\\/g, '/')}`;

        // The DLL project owns the member. Its .red parser (what
        // resolveViaProjectRedirection consults) resolves MyApp.clw across to the
        // exe copy — modelling hover's WORKING path.
        const redParser = {
            findFile: (name: string) =>
                path.basename(name).toLowerCase() === 'myapp.clw' ? { path: parentPath } : null
        };
        const dllProject = {
            name: 'DllProj',
            path: path.join(tmpRoot, 'dll'),
            sourceFiles: [] as unknown[],
            getRedirectionParser: () => redParser
        };
        const fakeSm = {
            solution: { projects: [dllProject] },
            findProjectForFile: () => dllProject,
            getProjectPathForFile: () => dllProject.path,
            // The diagnostic's OTHER resolver misses for this shape — the divergence.
            findFileWithExtension: async () => ({ path: '', source: '' }),
            getEquatesTokens: () => null,
            getEquatesPath: () => null
        } as unknown as SolutionManager;
        smSlot.instance = fakeSm;
    });

    teardown(() => {
        smSlot.instance = savedInstance;
        serverSettings.undeclaredVariablesEnabled = savedEnabled;
        TokenCache.getInstance().clearAllTokens();
        try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch { /* best-effort */ }
    });

    test('dbgCount (PROGRAM-scope .app global, cross-dir MEMBER parent via .red) → no false positive', async () => {
        const member = TextDocument.create(memberUri, 'clarion', 1, MEMBER_SRC);
        const diags = await runDiagnostic(member);

        const hit = diags.find(d => d.line === 5);
        assert.strictEqual(
            hit,
            undefined,
            'expected NO undeclared-variable diagnostic on dbgCount at line 5 — the PROGRAM parent ' +
            'is redirection-reachable (hover resolves it); the diagnostic must use the same ' +
            'resolveViaProjectRedirection resolver. got: ' + JSON.stringify(diags)
        );
    });

    test('SENTINEL — a genuinely undeclared name still fires (fix did not widen too far)', async () => {
        const src = MEMBER_SRC.replace('  dbgCount = 1', '  dbgCount = 1\n  reallyBogus = 2');
        const member = TextDocument.create(memberUri, 'clarion', 1, src);
        const diags = await runDiagnostic(member);

        assert.ok(
            diags.some(d => d.message.toLowerCase().includes('reallybogus')),
            'expected a diagnostic on reallyBogus (genuinely undeclared); got: ' + JSON.stringify(diags)
        );
        assert.strictEqual(
            diags.find(d => d.message.toLowerCase().includes('dbgcount')),
            undefined,
            'dbgCount must still resolve; got: ' + JSON.stringify(diags)
        );
    });
});
