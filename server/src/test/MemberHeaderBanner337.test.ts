import * as assert from 'assert';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { ClarionTokenizer } from '../ClarionTokenizer';
import { DocumentStructure } from '../DocumentStructure';
import { TokenCache } from '../TokenCache';
import { ScopeAnalyzer } from '../utils/ScopeAnalyzer';
import { SymbolFinderService } from '../services/SymbolFinderService';
import { validateUndeclaredVariablesAsync } from '../providers/diagnostics/UndeclaredVariableDiagnostics';
import { serverSettings } from '../serverSettings';
import {
    buildMultiFileFixture,
    teardownMultiFileFixture
} from './helpers/MultiFileFARFixture';

/**
 * Issue #337 — the MEMBER/PROGRAM header lookup was hardcoded as
 * `t.line < 5` (or `< 10`) in 19 places, so a file with a comment banner of
 * five or more lines above `MEMBER('parent.clw')` silently lost every
 * MEMBER-parent tier: parent globals flagged undeclared, parent MAP
 * declarations invisible, hover/F12 parent walks dead.
 *
 * Caught live during Mark's v1.0.1 smoke on the hand-written SmokeTest101
 * fixture (BetaWin.clw carries a 6-line banner). Generated code always puts
 * MEMBER at the top, which is why app-generated solutions never surfaced it.
 *
 * Fix under test: `TokenHelper.findMemberHeaderToken` / `findProgramHeaderToken`
 * / `findDocumentHeaderToken` — first header-shaped token, no line cap —
 * swapped into all 19 sites.
 */

// Six comment lines — one past the old `line < 5` guard.
const BANNER = [
    '! ---------------------------------------------------------------',
    '! SmokeTest banner line 2',
    '! banner line 3',
    '! banner line 4',
    '! banner line 5',
    '! ---------------------------------------------------------------',
];

suite('Issue #337 — MEMBER header below a comment banner', () => {

    let savedUndeclaredEnabled = false;

    setup(() => {
        savedUndeclaredEnabled = serverSettings.undeclaredVariablesEnabled;
        serverSettings.undeclaredVariablesEnabled = true;
    });

    teardown(() => {
        serverSettings.undeclaredVariablesEnabled = savedUndeclaredEnabled;
        teardownMultiFileFixture();
    });

    function buildBannerFixture() {
        return buildMultiFileFixture({
            files: {
                'SimpleNewSln.clw': [
                    '  PROGRAM',
                    '  MAP',
                    '  END',
                    'ParentGlobal LONG',
                    '  CODE',
                    '  RETURN',
                ].join('\n'),
                'BannerMember.clw': [
                    ...BANNER,                          // lines 0-5
                    "  MEMBER('SimpleNewSln.clw')",     // line 6 — past the old guard
                    '  MAP',
                    '  END',
                    'BannerProc PROCEDURE',
                    '  CODE',
                    '  ParentGlobal = 1',               // line 10
                    '  RETURN',
                ].join('\n'),
            },
            frg: { programFile: 'SimpleNewSln.clw', memberFiles: ['BannerMember.clw'] }
        });
    }

    test('findSymbol resolves a parent global from a banner-headed MEMBER file', async () => {
        const fixture = buildBannerFixture();
        const memberDoc = fixture.documents['BannerMember.clw'];
        const tokenCache = TokenCache.getInstance();
        const symbolFinder = new SymbolFinderService(tokenCache, new ScopeAnalyzer(tokenCache, undefined as never));

        const result = await symbolFinder.findSymbol('ParentGlobal', memberDoc, { line: 10, character: 2 });
        assert.ok(result, 'ParentGlobal must resolve through the MEMBER parent despite the banner');
        assert.ok(result!.location.uri.toLowerCase().endsWith('simplenewsln.clw'),
            `expected the parent PROGRAM file; got ${result!.location.uri}`);
    });

    test('undeclared-variable check stays quiet for parent globals despite the banner', async () => {
        const fixture = buildBannerFixture();
        const memberDoc = fixture.documents['BannerMember.clw'];
        const tokenCache = TokenCache.getInstance();
        const symbolFinder = new SymbolFinderService(tokenCache, new ScopeAnalyzer(tokenCache, undefined as never));
        const tokens = new ClarionTokenizer(memberDoc.getText()).tokenize();

        const diags = await validateUndeclaredVariablesAsync(tokens, memberDoc, symbolFinder);
        assert.strictEqual(
            diags.find(d => d.message.includes("'ParentGlobal'")), undefined,
            `expected NO diagnostic on ParentGlobal; got: ${JSON.stringify(diags.map(d => d.message))}`);
    });

    test('DocumentStructure.getMemberParentFile sees the banner-headed MEMBER', () => {
        const code = [
            ...BANNER,
            "  MEMBER('SomeParent.clw')",
            '  MAP',
            '  END',
        ].join('\r\n');
        const tokens = new ClarionTokenizer(code).tokenize();
        const structure = new DocumentStructure(tokens);
        structure.process();
        assert.strictEqual(structure.getMemberParentFile(), 'SomeParent.clw');
    });

    test('regression: MEMBER at line 0 (generated shape) unchanged', async () => {
        const code = [
            "  MEMBER('SomeParent.clw')",
            '  MAP',
            '  END',
        ].join('\r\n');
        const tokens = new ClarionTokenizer(code).tokenize();
        const structure = new DocumentStructure(tokens);
        structure.process();
        assert.strictEqual(structure.getMemberParentFile(), 'SomeParent.clw');
    });
});
