import * as assert from 'assert';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { TokenCache } from '../TokenCache';
import { ReferencesProvider } from '../providers/ReferencesProvider';
import { ClassMemberResolver } from '../utils/ClassMemberResolver';
import { setServerInitialized } from '../serverState';

/**
 * #247 — PROCEDURE ≡ FUNCTION equivalence sentinels.
 *
 * Modern Clarion treats PROCEDURE and FUNCTION as the same construct (both can
 * return values). The tokenizer already honors this: a FUNCTION keyword token is
 * rewritten to TokenType.Procedure with the correct subType by
 * DocumentStructure.handleProcedureToken (empirically verified).
 *
 * But ~15 TEXT-level gates test only for the literal 'PROCEDURE' in declaration
 * line text / type strings, so FUNCTION-declared procedures and methods silently
 * lose overload filtering (FAR aggregates all overloads) and overload arity
 * resolution (every candidate gets paramCount = 0 → first-declared wins).
 *
 * Each test here is a NON-X REGRESSION SENTINEL: the identical fixture with
 * PROCEDURE is already green in ReferencesProvider.OverloadDistinction.test.ts /
 * the ClassMemberResolver consumers — these repeat the shape with FUNCTION.
 */

function createDocument(content: string, uri: string): TextDocument {
    return TextDocument.create(uri, 'clarion', 1, content);
}

function seedCache(document: TextDocument): void {
    TokenCache.getInstance().getTokens(document);
}

suite('FUNCTION keyword equivalence (#247)', () => {

    let referencesProvider: ReferencesProvider;
    let memberResolver: ClassMemberResolver;

    setup(() => {
        setServerInitialized(true);
        TokenCache.getInstance().clearAllTokens();
        referencesProvider = new ReferencesProvider();
        memberResolver = new ClassMemberResolver();
    });

    // ─── (1) FAR plain-symbol overload filter must engage for FUNCTION decls ───
    // PROCEDURE twin: OverloadDistinction test 1 (same-arity-different-type).
    // Pre-fix: buildPlainSymbolOverloadFilter's /\bPROCEDURE\b/ gate fails on a
    // FUNCTION decl line → overloadFilter undefined → wrong-overload decl+impl leak.

    test('FAR on Foo FUNCTION(STRING) decl returns ONLY the STRING decl + impl', async () => {
        const code = [
            '  PROGRAM',                                    // line 0
            '  MAP',                                        // line 1
            'Foo            FUNCTION(STRING),LONG',         // line 2 — STRING decl (FAR cursor here)
            'Foo            FUNCTION(LONG),LONG',           // line 3 — LONG decl
            '  END',                                        // line 4
            '',                                             // line 5
            '  CODE',                                       // line 6
            '  RETURN',                                     // line 7
            '',                                             // line 8
            'Foo FUNCTION(STRING s)',                       // line 9 — STRING impl
            '  CODE',                                       // line 10
            '  RETURN 1',                                   // line 11
            '',                                             // line 12
            'Foo FUNCTION(LONG n)',                         // line 13 — LONG impl
            '  CODE',                                       // line 14
            '  RETURN 1',                                   // line 15
        ].join('\n');

        const doc = createDocument(code, 'file:///t247-far-plain.clw');
        seedCache(doc);

        const refs = await referencesProvider.provideReferences(doc, { line: 2, character: 0 },
            { includeDeclaration: true });

        assert.ok(refs, 'FAR should return references for the FUNCTION STRING decl');
        const lines = refs!.map(r => r.range.start.line).sort((a, b) => a - b);

        assert.ok(
            !lines.includes(3),
            'line 3 (LONG decl) must NOT be in result; got lines=[' + lines.join(',') + '] — ' +
            'FUNCTION decl lines are bypassing the plain-symbol overload filter'
        );
        assert.ok(
            !lines.includes(13),
            'line 13 (LONG impl) must NOT be in result; got lines=[' + lines.join(',') + ']'
        );
        // Bidirectional pin — the right impl must still be present.
        assert.ok(
            lines.includes(9),
            'STRING impl line 9 SHOULD be in result; got lines=[' + lines.join(',') + ']'
        );
    });

    // ─── (2) FAR class-method decl-side overload filter for FUNCTION methods ───
    // PROCEDURE twin: OverloadDistinction test 4 (class-method decl-side-only).
    // Pre-fix: the member overloadFilter gate (/\bPROCEDURE\b/ on the decl line)
    // and gatherClassMemberOverloads both skip FUNCTION decls.

    test('FAR on a class FUNCTION method decl returns ONLY the matching overload decl + impl', async () => {
        const code = [
            '  MEMBER',                                          // line 0
            'Widget         CLASS,TYPE',                         // line 1
            'Render           FUNCTION(STRING pName),LONG',      // line 2 — STRING decl (FAR cursor here)
            'Render           FUNCTION(LONG pId),LONG',          // line 3 — LONG decl
            '               END',                                // line 4
            '',                                                  // line 5
            'Widget.Render FUNCTION(STRING pName)',              // line 6 — STRING impl
            '  CODE',                                            // line 7
            '  RETURN 1',                                        // line 8
            '',                                                  // line 9
            'Widget.Render FUNCTION(LONG pId)',                  // line 10 — LONG impl
            '  CODE',                                            // line 11
            '  RETURN 1',                                        // line 12
        ].join('\n');

        const doc = createDocument(code, 'file:///t247-far-member.clw');
        seedCache(doc);

        // Cursor on "Render" in the STRING decl (line 2). Label starts after the prefix column.
        const character = code.split('\n')[2].indexOf('Render');
        const refs = await referencesProvider.provideReferences(doc, { line: 2, character },
            { includeDeclaration: true });

        assert.ok(refs, 'FAR should return references for the FUNCTION method decl');
        const lines = refs!.map(r => r.range.start.line).sort((a, b) => a - b);

        assert.ok(
            !lines.includes(3),
            'line 3 (LONG overload decl) must NOT be in result; got lines=[' + lines.join(',') + '] — ' +
            'FUNCTION method decls are bypassing the member overload filter'
        );
        assert.ok(
            !lines.includes(10),
            'line 10 (LONG overload impl) must NOT be in result; got lines=[' + lines.join(',') + ']'
        );
        assert.ok(
            lines.includes(6),
            'STRING impl line 6 SHOULD be in result; got lines=[' + lines.join(',') + ']'
        );
    });

    // ─── (3) ClassMemberResolver arity resolution for FUNCTION-declared overloads ───
    // Pre-fix: scanClassBodyForMember / findClassMemberInfo only count parameters
    // when the type string starts with PROCEDURE → every FUNCTION candidate gets
    // paramCount 0 → selectBestMemberOverload ignores the caller's arg count and
    // returns the first-declared overload.

    test('findClassMemberInfo picks the FUNCTION overload matching the call arg count', () => {
        const code = [
            '  MEMBER',                                               // line 0
            'Basket         CLASS,TYPE',                              // line 1
            'AddItem          FUNCTION(STRING pName),LONG',           // line 2 — 1-param decl
            'AddItem          FUNCTION(STRING pName, LONG pQty),LONG',// line 3 — 2-param decl
            '               END',                                     // line 4
            '',                                                       // line 5
            'Basket.AddItem FUNCTION(STRING pName)',                  // line 6
            '  CODE',                                                 // line 7
            '  RETURN SELF.AddItem(pName, 1)',                        // line 8 — 2-arg call site
            '',                                                       // line 9
            'Basket.AddItem FUNCTION(STRING pName, LONG pQty)',       // line 10
            '  CODE',                                                 // line 11
            '  RETURN 1',                                             // line 12
        ].join('\n');

        const doc = createDocument(code, 'file:///t247-member-arity.clw');
        const tokens = TokenCache.getInstance().getTokens(doc);

        // Resolve SELF.AddItem(pName, 1) — 2 args — from inside the 1-param impl (line 8).
        const info = memberResolver.findClassMemberInfo('AddItem', doc, 8, tokens, 2);

        assert.ok(info, 'findClassMemberInfo should resolve the FUNCTION-declared method');
        assert.strictEqual(
            info!.line, 3,
            `expected the 2-param overload decl (line 3), got line ${info!.line} — ` +
            'FUNCTION-declared overloads are getting paramCount 0 (arity ignored)'
        );
    });
});
