/**
 * Issue #233 — scope-consistency across completion and hover.
 *
 * Pins the behaviour that the canonical ScopeResolver brings to the two converged
 * consumers: WordCompletionProvider (completion) and SymbolFinderService (hover/F12).
 * The headline is the anti-broadening fix — a Local Derived Method must see ONLY its
 * own declaring procedure's locals, not every global procedure's locals.
 */
import * as assert from 'assert';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { WordCompletionProvider } from '../providers/WordCompletionProvider';
import { SymbolFinderService } from '../services/SymbolFinderService';
import { TokenCache } from '../TokenCache';
import { ScopeAnalyzer } from '../utils/ScopeAnalyzer';
import { SolutionManager } from '../solution/solutionManager';
import { TokenHelper } from '../utils/TokenHelper';
import { setServerInitialized } from '../serverState';

let docCounter = 0;
function makeDoc(content: string): TextDocument {
    return TextDocument.create(`file:///scope-consistency-${++docCounter}.clw`, 'clarion', 1, content);
}

// Two procedures, each declaring a same-named local derived class + method impl, each with
// a DISTINCT local variable. Method B must not see ProcA's local (AOnly), and vice-versa.
// 4  ProcA PROCEDURE
// 8  AOnly LONG
// 12 SharedName.Run PROCEDURE   (method A)
// 16 ProcB PROCEDURE
// 20 BOnly LONG
// 24 SharedName.Run PROCEDURE   (method B)
// 26   BOnly = 2                (method B body)
const TWO_SAME_NAME = `PROGRAM
  MAP
  END

ProcA PROCEDURE
SharedName CLASS
Run PROCEDURE
  END
AOnly LONG
  CODE
  AOnly = 1

SharedName.Run PROCEDURE
  CODE
  AOnly = 2

ProcB PROCEDURE
SharedName CLASS
Run PROCEDURE
  END
BOnly LONG
  CODE
  BOnly = 1

SharedName.Run PROCEDURE
  CODE
  BOnly = 2
`;

suite('Scope consistency (#233) — completion ↔ hover', () => {
    setup(() => setServerInitialized(true));

    suite('SymbolFinderService — Local Derived Method visibility (anti-broadening)', () => {
        function serviceFor(doc: TextDocument) {
            const cache = TokenCache.getInstance();
            cache.clearAllTokens();
            const tokens = cache.getTokens(doc);
            const scopeAnalyzer = new ScopeAnalyzer(cache, SolutionManager.getInstance());
            const service = new SymbolFinderService(cache, scopeAnalyzer);
            return { tokens, service };
        }

        test('method B sees its OWN declaring procedure local (BOnly)', () => {
            const doc = makeDoc(TWO_SAME_NAME);
            const { tokens, service } = serviceFor(doc);
            const scope = TokenHelper.getInnermostScopeAtLine(tokens, 26); // inside method B
            assert.ok(scope, 'should find method-impl scope');
            const found = service.findLocalVariable('BOnly', tokens, scope!, doc);
            assert.ok(found, 'method B should resolve its declaring procedure ProcB local BOnly');
            assert.strictEqual(found!.location.line, 20);
        });

        test('method B does NOT see the OTHER procedure local (AOnly)', () => {
            const doc = makeDoc(TWO_SAME_NAME);
            const { tokens, service } = serviceFor(doc);
            const scope = TokenHelper.getInnermostScopeAtLine(tokens, 26); // inside method B
            const found = service.findLocalVariable('AOnly', tokens, scope!, doc);
            assert.strictEqual(found, null,
                'method B must NOT resolve ProcA local AOnly (Rule 4 is per declaring procedure, not a broad scan)');
        });
    });

    suite('WordCompletionProvider — Local Derived Method sees declaring procedure locals', () => {
        function providerFor(doc: TextDocument) {
            const cache = TokenCache.getInstance();
            cache.clearAllTokens();
            cache.getTokens(doc);
            const scopeAnalyzer = new ScopeAnalyzer(cache, SolutionManager.getInstance());
            return new WordCompletionProvider(cache, scopeAnalyzer);
        }

        test('completion inside method B offers BOnly but not AOnly', async () => {
            const doc = makeDoc(TWO_SAME_NAME);
            const provider = providerFor(doc);
            const items = await provider.provide(doc, { line: 26, character: 2 }, '');
            const labels = items.map(i => i.label);
            assert.ok(labels.includes('BOnly'), `expected BOnly in method B completion: ${labels.join(', ')}`);
            assert.ok(!labels.includes('AOnly'), `AOnly must NOT leak into method B completion: ${labels.join(', ')}`);
        });
    });
});
