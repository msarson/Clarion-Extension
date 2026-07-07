import * as assert from 'assert';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { ClarionTokenizer, Token } from '../ClarionTokenizer';
import { ScopeTypeIndexService } from '../services/ScopeTypeIndexService';
import { TokenCache } from '../TokenCache';
import { FileRelationshipGraph } from '../FileRelationshipGraph';
import { setServerInitialized } from '../serverState';
import { buildMultiFileFixture, teardownMultiFileFixture } from './helpers/MultiFileFARFixture';

/**
 * #257 Phase 1 — unit tests for the ScopeTypeIndexService extracted verbatim
 * from ReferencesProvider. These pin the tier semantics the move must
 * preserve (any drift here changes the FAR result set feeding RenameProvider):
 *
 *   - tier shadowing priority: routine-local > proc-local/params > module > global
 *   - PRE prefix-keying is set-if-absent (explicit colon-label declaration wins)
 *   - Tier 4 SELF.field resolves class data members, not method declarations
 *   - Tier 6 symmetry: cursor-in-MEMBER and cursor-in-PROGRAM both reach
 *     PROGRAM-scope globals (the `671d7cd8` silent-asymmetry pin, now at
 *     service level)
 */

function tokenize(content: string): Token[] {
    return new ClarionTokenizer(content).tokenize();
}

suite('ScopeTypeIndexService (#257 Phase 1)', () => {

    setup(() => {
        setServerInitialized(true);
        TokenCache.getInstance().clearAllTokens();
    });

    // ─── Tier shadowing priority ────────────────────────────────────────────

    const SHADOW_FIXTURE = [
        "  MEMBER('test')",     // 0
        '',                     // 1
        'x          LONG',      // 2  — module-scope x
        'm          DECIMAL',   // 3  — module-only var
        '',                     // 4
        'MainProc PROCEDURE',   // 5
        'x          REAL',      // 6  — proc-local x shadows module x
        'y          SHORT',     // 7  — proc-only var
        '  CODE',               // 8
        '  x = 1',              // 9  — proc CODE line
        '  DO Sub',             // 10
        '  RETURN',             // 11
        '',                     // 12
        'Sub ROUTINE',          // 13
        '  DATA',               // 14
        'x  BYTE',              // 15 — routine-local x shadows proc-local x
        '  CODE',               // 16
        '  x = 2',              // 17 — routine CODE line
    ].join('\n');

    test('routine-local shadows proc-local shadows module (lookup at routine line)', () => {
        const svc = new ScopeTypeIndexService();
        const idx = svc.buildFileVarTypeIndex(tokenize(SHADOW_FIXTURE));
        assert.strictEqual(svc.lookupVarTypeAtLine(idx, null, 17, 'x'), 'BYTE',
            'inside the routine, the routine-local declaration must win');
    });

    test('proc-local shadows module (lookup at proc CODE line, outside routine)', () => {
        const svc = new ScopeTypeIndexService();
        const idx = svc.buildFileVarTypeIndex(tokenize(SHADOW_FIXTURE));
        assert.strictEqual(svc.lookupVarTypeAtLine(idx, null, 9, 'x'), 'REAL',
            'inside the procedure but outside the routine, the proc-local declaration must win');
    });

    test('module scope resolves outside any procedure', () => {
        const svc = new ScopeTypeIndexService();
        const idx = svc.buildFileVarTypeIndex(tokenize(SHADOW_FIXTURE));
        assert.strictEqual(svc.lookupVarTypeAtLine(idx, null, 1, 'x'), 'LONG',
            'outside any procedure, the module-scope declaration must win');
    });

    test('routine line falls through to proc scope for a name the routine does not shadow', () => {
        const svc = new ScopeTypeIndexService();
        const idx = svc.buildFileVarTypeIndex(tokenize(SHADOW_FIXTURE));
        assert.strictEqual(svc.lookupVarTypeAtLine(idx, null, 17, 'y'), 'SHORT',
            'a routine-line lookup must fall through to the enclosing proc scope on routine miss');
    });

    test('proc line falls through to module scope, then to the passed globalScope', () => {
        const svc = new ScopeTypeIndexService();
        const idx = svc.buildFileVarTypeIndex(tokenize(SHADOW_FIXTURE));
        assert.strictEqual(svc.lookupVarTypeAtLine(idx, null, 9, 'm'), 'DECIMAL',
            'proc-line lookup must fall through to module scope');
        const globalScope = new Map([['g', 'STRING']]);
        assert.strictEqual(svc.lookupVarTypeAtLine(idx, globalScope, 9, 'g'), 'STRING',
            'lookup must fall through to the caller-provided global scope (Tier 6)');
        assert.strictEqual(svc.lookupVarTypeAtLine(idx, globalScope, 9, 'nosuch'), undefined,
            'a name in no tier must return undefined');
    });

    test('Tier 2 — procedure parameters resolve, with pass-by-ref decoration stripped', () => {
        const fixture = [
            "  MEMBER('test')",                              // 0
            '',                                              // 1
            'ParamProc PROCEDURE(LONG count, *CSTRING buf)', // 2
            '  CODE',                                        // 3
            '  RETURN',                                      // 4
        ].join('\n');
        const svc = new ScopeTypeIndexService();
        const idx = svc.buildFileVarTypeIndex(tokenize(fixture));
        assert.strictEqual(svc.lookupVarTypeAtLine(idx, null, 3, 'count'), 'LONG');
        assert.strictEqual(svc.lookupVarTypeAtLine(idx, null, 3, 'buf'), 'CSTRING',
            'the * pass-by-ref decoration must be stripped from the parameter type');
    });

    // ─── PRE prefix-keying (#193 semantics preserved through the move) ─────

    test('PRE alias keys resolve additively alongside bare labels', () => {
        const fixture = [
            "  MEMBER('test')",          // 0
            '',                          // 1
            'MyQ        QUEUE,PRE(QUE)', // 2
            'Fld          LONG',         // 3
            '           END',            // 4
        ].join('\n');
        const svc = new ScopeTypeIndexService();
        const idx = svc.buildFileVarTypeIndex(tokenize(fixture));
        assert.strictEqual(svc.lookupVarTypeAtLine(idx, null, 1, 'que:fld'), 'LONG',
            'PRE-prefixed alias key must resolve');
        assert.strictEqual(svc.lookupVarTypeAtLine(idx, null, 1, 'fld'), 'LONG',
            'bare-label key must still resolve (aliasing is additive)');
    });

    test('PRE alias is set-if-absent — an explicit colon-label declaration wins', () => {
        const fixture = [
            "  MEMBER('test')",           // 0
            '',                           // 1
            'LOC:Name   STRING(10)',      // 2 — explicit colon-label declaration
            '',                           // 3
            'MyGroup    GROUP,PRE(LOC)',  // 4
            'Name         LONG',          // 5 — alias key would be loc:name too
            '           END',             // 6
        ].join('\n');
        const svc = new ScopeTypeIndexService();
        const idx = svc.buildFileVarTypeIndex(tokenize(fixture));
        const resolved = svc.lookupVarTypeAtLine(idx, null, 1, 'loc:name');
        assert.notStrictEqual(resolved, 'LONG',
            'the PRE alias must NOT clobber the explicit LOC:Name declaration');
        assert.ok(resolved && resolved.toUpperCase().startsWith('STRING'),
            `explicit declaration's type must win, got "${resolved}"`);
    });

    // ─── Tier 4 — SELF.field via classFields ───────────────────────────────

    test('SELF.field resolves class data members inside a method impl, and only there', () => {
        const fixture = [
            "  MEMBER('test')",             // 0
            '',                             // 1
            'MyClass    CLASS,TYPE',        // 2
            'Field        LONG',            // 3
            'DoIt         PROCEDURE()',     // 4
            '           END',               // 5
            '',                             // 6
            'MyClass.DoIt PROCEDURE()',     // 7
            '  CODE',                       // 8
            '  SELF.Field = 1',             // 9
            '  RETURN',                     // 10
        ].join('\n');
        const svc = new ScopeTypeIndexService();
        const idx = svc.buildFileVarTypeIndex(tokenize(fixture));
        assert.strictEqual(svc.lookupVarTypeAtLine(idx, null, 9, 'self.field'), 'LONG',
            'SELF.field inside the method impl must resolve via classFields');
        assert.strictEqual(svc.lookupVarTypeAtLine(idx, null, 1, 'self.field'), undefined,
            'SELF.field outside any method impl must not resolve');
        assert.strictEqual(svc.lookupVarTypeAtLine(idx, null, 9, 'self.doit'), undefined,
            'method declarations must be excluded from classFields (fields only)');
    });

    // ─── Index caching (#257 Phase 2) ───────────────────────────────────────

    suite('index caching (Phase 2)', () => {

        test('same Token[] identity returns the SAME index object (cache hit)', () => {
            const svc = new ScopeTypeIndexService();
            const tokens = tokenize(SHADOW_FIXTURE);
            const first = svc.buildFileVarTypeIndex(tokens);
            const second = svc.buildFileVarTypeIndex(tokens);
            assert.strictEqual(second, first,
                'rebuilding for the same token array must return the cached index object — ' +
                'this is what de-quadratifies the #189 CodeLens precompute');
        });

        test('a different Token[] gets a fresh index reflecting its own content', () => {
            const svc = new ScopeTypeIndexService();
            const idx1 = svc.buildFileVarTypeIndex(tokenize(SHADOW_FIXTURE));
            const edited = SHADOW_FIXTURE.replace('x          REAL', 'x          DATE');
            const idx2 = svc.buildFileVarTypeIndex(tokenize(edited));
            assert.notStrictEqual(idx2, idx1, 'a new token array must not serve the old index');
            assert.strictEqual(svc.lookupVarTypeAtLine(idx2, null, 9, 'x'), 'DATE',
                'the fresh index must reflect the edited declaration');
            assert.strictEqual(svc.lookupVarTypeAtLine(idx1, null, 9, 'x'), 'REAL',
                'the old index must be untouched (no cross-contamination)');
        });

        test('TokenCache version bump invalidates end-to-end (new array → fresh index)', () => {
            const uri = 'file:///stix-invalidation.clw';
            const cache = TokenCache.getInstance();
            const svc = new ScopeTypeIndexService(cache);

            const docV1 = TextDocument.create(uri, 'clarion', 1, SHADOW_FIXTURE);
            const tokensV1 = cache.getTokens(docV1);
            const idxV1 = svc.buildFileVarTypeIndex(tokensV1);
            assert.strictEqual(svc.lookupVarTypeAtLine(idxV1, null, 9, 'x'), 'REAL');

            const edited = SHADOW_FIXTURE.replace('x          REAL', 'x          DATE');
            const docV2 = TextDocument.create(uri, 'clarion', 2, edited);
            const tokensV2 = cache.getTokens(docV2);
            assert.notStrictEqual(tokensV2, tokensV1,
                'precondition: TokenCache must hand out a new Token[] for changed content ' +
                '(the identity the WeakMap keys on)');
            const idxV2 = svc.buildFileVarTypeIndex(tokensV2);
            assert.strictEqual(svc.lookupVarTypeAtLine(idxV2, null, 9, 'x'), 'DATE',
                'post-edit lookups must see the edited declaration, not a stale cached index');
        });
    });

    // ─── Tier 6 symmetry ────────────────────────────────────────────────────

    suite('Tier 6 — loadGlobalScopeForCursor symmetry', () => {

        teardown(() => {
            teardownMultiFileFixture();
        });

        const PROGRAM_CONTENT = [
            '  PROGRAM',        // 0
            '',                 // 1
            'GVar       LONG',  // 2 — PROGRAM-scope global
            '',                 // 3
            '  CODE',           // 4
            '  RETURN',         // 5
        ].join('\n');

        const MEMBER_CONTENT = [
            "  MEMBER('main.clw')", // 0
            '',                     // 1
            'MProc PROCEDURE',      // 2
            '  CODE',               // 3
            '  RETURN',             // 4
        ].join('\n');

        test('cursor-in-MEMBER: FRG forward edge loads the PROGRAM moduleScope', () => {
            const fixture = buildMultiFileFixture({
                files: { 'main.clw': PROGRAM_CONTENT, 'member.clw': MEMBER_CONTENT },
                frg: { programFile: 'main.clw' }
            });
            const svc = new ScopeTypeIndexService();
            const globalScope = svc.loadGlobalScopeForCursor(fixture.documents['member.clw']);
            assert.ok(globalScope, 'MEMBER cursor must reach a global scope via the FRG MEMBER edge');
            assert.strictEqual(globalScope!.get('gvar'), 'LONG');
        });

        test('cursor-in-PROGRAM (symmetry): reverse-MEMBER edges yield the own moduleScope', () => {
            const fixture = buildMultiFileFixture({
                files: { 'main.clw': PROGRAM_CONTENT, 'member.clw': MEMBER_CONTENT },
                frg: { programFile: 'main.clw' }
            });
            const svc = new ScopeTypeIndexService();
            const globalScope = svc.loadGlobalScopeForCursor(fixture.documents['main.clw']);
            assert.ok(globalScope,
                'PROGRAM cursor must return its own moduleScope as globalScope so ' +
                'reverse-MEMBER file scans can resolve PROGRAM-level vars (671d7cd8 symmetry)');
            assert.strictEqual(globalScope!.get('gvar'), 'LONG');
        });

        test('no FRG and no MEMBER declaration: returns null', () => {
            FileRelationshipGraph.getInstance().reset();
            const doc = TextDocument.create('file:///stix-nofrg.clw', 'clarion', 1, PROGRAM_CONTENT);
            TokenCache.getInstance().getTokens(doc);
            const svc = new ScopeTypeIndexService();
            assert.strictEqual(svc.loadGlobalScopeForCursor(doc), null);
        });
    });
});
