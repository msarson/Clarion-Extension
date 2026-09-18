/**
 * #593 — a MAP prototype reached through `INCLUDE(file,'SECTION')` is never classified, so F12 and
 * hover find nothing for a call to it.
 *
 * `DocumentStructure.processShorthandProcedures` returns immediately when the file has no MAP of its
 * own. An .inc that holds prototypes under `SECTION('PROTOTYPES')` has none — the includer supplies
 * the MAP — so none of its tokens ever receives `subType = MapProcedure`.
 * `ScopeAnalyzer.getMapTokensWithIncludes` then copies those unclassified tokens into the parent's
 * MAP token list, and every consumer that asks "is this a MAP declaration?" tests `subType`, so the
 * declaration is invisible to all of them.
 *
 * The shapes below are COMPILER-VERIFIED, not invented: `test-programs/PrefixedPrototypeTest`
 * compiles and links clean on Clarion 10.0.12567 with exactly these declarations, and its README
 * records the negative variant that pins the SECTION rule —
 *
 *     calling a prototype declared under SECTION('OTHER') from a MAP that included
 *     SECTION('PROTOTYPES') fails with "Unknown procedure label"
 *
 * — which is why the classification here is scoped to the requested section rather than taking every
 * prototype in the file. That guard is the compiler's rule, not a guess.
 *
 * Reported by @bill-atchison against a 38-project prefixed solution.
 */
import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { TokenCache } from '../TokenCache';
import { setServerInitialized } from '../serverState';
import { ScopeAnalyzer } from '../utils/ScopeAnalyzer';
import { TokenType, Token } from '../ClarionTokenizer';
import { serverSettings } from '../serverSettings';
import { SolutionManager } from '../solution/solutionManager';

suite('MAP prototypes reached through INCLUDE (#593)', () => {
    let dir: string;
    let savedLibsrc: string[] = [];
    let savedRed: string;
    let parentDoc: TextDocument;

    // protos.inc has NO MAP of its own — the includer supplies it. Mirrors
    // test-programs/PrefixedPrototypeTest/protos.inc, which compiles.
    const protosInc = [
        "  SECTION('PROTOTYPES')",              // 0
        '  WIN:ShowExits()',                    // 1  one colon
        '  WIN:Plain(LONG pX),LONG',            // 2  one colon, params + return
        '  reg:WIN:ShowExits()',                // 3  two colons
        '  PlainProto()',                       // 4  unprefixed
        '  WIN:BareOne',                        // 5  bare
        "  SECTION('OTHER')",                   // 6
        '  reg:WIN:NotInSection()',             // 7  must NOT be picked up
    ].join('\r\n');

    const parentClw = [
        '  PROGRAM',                            // 0
        '  MAP',                                // 1
        "    INCLUDE('protos.inc','PROTOTYPES'),ONCE",  // 2
        "    MODULE('parent.clw')",             // 3
        'reg:ITEM:CashOutExists  PROCEDURE(),LONG',     // 4  the control that already worked
        '    END',                              // 5
        '  END',                                // 6
        '  CODE',                               // 7
        '  WIN:ShowExits()',                    // 8
        '  reg:WIN:ShowExits()',                // 9
        '  RETURN',                             // 10
    ].join('\r\n');

    setup(() => {
        setServerInitialized(true);
        savedLibsrc = serverSettings.libsrcPaths;
        savedRed = serverSettings.redirectionFile;
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'inc593-'));
        fs.writeFileSync(path.join(dir, 'Clarion110.red'), '[Common]\r\n*.inc = .\r\n*.clw = .\r\n');
        serverSettings.redirectionFile = 'Clarion110.red';
        serverSettings.libsrcPaths = [dir];
        fs.writeFileSync(path.join(dir, 'protos.inc'), protosInc);
        const parentPath = path.join(dir, 'parent.clw');
        fs.writeFileSync(parentPath, parentClw);

        const tc = TokenCache.getInstance();
        tc.clearAllTokens();
        parentDoc = TextDocument.create(`file:///${parentPath.replace(/\\/g, '/')}`, 'clarion', 1, parentClw);
        tc.getTokens(parentDoc);
    });

    teardown(() => {
        serverSettings.libsrcPaths = savedLibsrc;
        serverSettings.redirectionFile = savedRed;
        TokenCache.getInstance().clearAllTokens();
        try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best-effort */ }
    });

    /** The MAP token list the parent sees, includes merged in — the list every consumer searches. */
    function mapTokensWithIncludes(): Token[] {
        const tc = TokenCache.getInstance();
        const tokens = tc.getTokens(parentDoc);
        const mapToken = tokens.find(t => t.type === TokenType.Structure && t.value.toUpperCase() === 'MAP');
        assert.ok(mapToken, 'the parent has a MAP');
        const analyzer = new ScopeAnalyzer(tc, SolutionManager.getInstance());
        return analyzer.getMapTokensWithIncludes(mapToken!, parentDoc, tokens);
    }

    const declaredNames = (merged: Token[]): string[] =>
        merged.filter(t => t.subType === TokenType.MapProcedure)
            .map(t => (t.label ?? t.value))
            .sort();

    test('the include is found and its tokens are merged into the parent MAP', () => {
        const merged = mapTokensWithIncludes();
        // Independent of classification: the .inc's text must be reachable at all, otherwise the
        // rest of this suite would be failing for the wrong reason.
        assert.ok(merged.some(t => t.value === 'ShowExits' || t.value === 'WIN:ShowExits'),
            'tokens from protos.inc reach the merged MAP list');
    });

    test('the control declared the explicit way is classified (it always was)', () => {
        assert.ok(declaredNames(mapTokensWithIncludes()).includes('reg:ITEM:CashOutExists'));
    });

    test('a one-colon prototype carried in by INCLUDE is a MAP declaration', () => {
        assert.ok(declaredNames(mapTokensWithIncludes()).includes('WIN:ShowExits'),
            `got ${JSON.stringify(declaredNames(mapTokensWithIncludes()))}`);
    });

    test('a two-colon prototype carried in by INCLUDE is a MAP declaration', () => {
        assert.ok(declaredNames(mapTokensWithIncludes()).includes('reg:WIN:ShowExits'),
            `got ${JSON.stringify(declaredNames(mapTokensWithIncludes()))}`);
    });

    test('an unprefixed prototype carried in by INCLUDE is a MAP declaration', () => {
        assert.ok(declaredNames(mapTokensWithIncludes()).includes('PlainProto'),
            `got ${JSON.stringify(declaredNames(mapTokensWithIncludes()))}`);
    });

    test('a prototype in a DIFFERENT section is not picked up — the compiler says so', () => {
        // test-programs/PrefixedPrototypeTest proves this by failing to compile: calling a
        // SECTION('OTHER') prototype from a MAP that included SECTION('PROTOTYPES') is
        // "Unknown procedure label". Taking every prototype in the file would contradict that.
        assert.ok(!declaredNames(mapTokensWithIncludes()).includes('reg:WIN:NotInSection'),
            'SECTION("OTHER") must stay out of a SECTION("PROTOTYPES") include');
    });
});
