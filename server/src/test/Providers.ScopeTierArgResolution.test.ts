import * as assert from 'assert';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Location } from 'vscode-languageserver-protocol';
import { TokenCache } from '../TokenCache';
import { SignatureHelpProvider } from '../providers/SignatureHelpProvider';
import { DefinitionProvider } from '../providers/DefinitionProvider';
import { setServerInitialized } from '../serverState';

/**
 * #257 Phase 3 — ArgumentTypeResolver consults the ScopeTypeIndexService first.
 *
 * Two capabilities FAR's tier index has that the shared MemberLocatorService
 * stack lacked (the capability map on #257):
 *
 *   1. Correct scope priority — MLS's `findVariableTokenCrossFile` scans tokens
 *      in DOCUMENT ORDER, so a module-level var declared above the procedure
 *      wrongly shadows the procedure's own local of the same name. The tier
 *      index resolves proc-local first.
 *   2. PRE:Field typing — a `QUE:Fld` argument never resolved at all (the
 *      identifier regex rejected the colon and MLS has no prefix-alias keys),
 *      so overload selection fell back to conservative match-all.
 *
 * These pin both through the real consumers: signature help and F12.
 */

suite('Sighelp/F12 — scope-tier argument resolution (#257 Phase 3)', () => {
    setup(() => {
        setServerInitialized(true);
        TokenCache.getInstance().clearAllTokens();
    });
    teardown(() => TokenCache.getInstance().clearAllTokens());

    // ─── (1) module-var-vs-proc-local shadowing ────────────────────────────
    // `v` exists at module scope (LONG, declared FIRST in document order) AND
    // as the calling procedure's local (&problems). Clarion scope rules: the
    // proc-local wins inside the procedure. Overloads ordered LONG-first so a
    // document-order (or conservative) resolution yields 0 — correct answer is 1.
    const SHADOW_SRC = [
        '  PROGRAM',                       // 0
        '  MAP',                           // 1
        'DoIt  PROCEDURE(LONG n)',         // 2  overload index 0
        'DoIt  PROCEDURE(*problems q)',    // 3  overload index 1
        '  END',                           // 4
        '',                                // 5
        'problems  QUEUE,TYPE',            // 6
        'Name        STRING(20)',          // 7
        '          END',                   // 8
        '',                                // 9
        'v         LONG',                  // 10 module-scope v — the decoy
        '',                                // 11
        'Consume  PROCEDURE()',            // 12
        'v          &problems',            // 13 proc-local v — must win at line 15
        '  CODE',                          // 14
        '  DoIt(v',                        // 15 call site
    ].join('\n');

    test('proc-local declaration wins over an earlier module-scope decoy (sighelp)', async () => {
        const doc = TextDocument.create('file:///t257p3-shadow.clw', 'clarion', 1, SHADOW_SRC);
        TokenCache.getInstance().getTokens(doc);
        const provider = new SignatureHelpProvider();
        const result = await provider.provideSignatureHelp(doc, { line: 15, character: '  DoIt(v'.length });
        assert.ok(result && result.signatures.length >= 2, 'expected both overloads');
        assert.strictEqual(result!.activeSignature, 1,
            'inside Consume, `v` is the proc-local &problems — the *problems overload (index 1) ' +
            'must be highlighted; index 0 means the module-scope LONG decoy shadowed the proc-local');
    });

    // ─── (2) PRE:Field argument (sighelp) ──────────────────────────────────
    // Overloads ordered STRING-first so an unresolved argument (conservative
    // match-all → first compatible) yields 0 — correct answer is 1 (LONG).
    const PREFIELD_SRC = [
        '  PROGRAM',                       // 0
        '  MAP',                           // 1
        'DoIt  PROCEDURE(STRING s)',       // 2  overload index 0
        'DoIt  PROCEDURE(LONG n)',         // 3  overload index 1
        '  END',                           // 4
        '',                                // 5
        'MyQ       QUEUE,PRE(QUE)',        // 6
        'Fld         LONG',                // 7
        '          END',                   // 8
        '',                                // 9
        'Consume  PROCEDURE()',            // 10
        '  CODE',                          // 11
        '  DoIt(QUE:Fld',                  // 12 call site
    ].join('\n');

    test('a QUE:Fld (PRE-prefixed LONG field) argument highlights the LONG overload (sighelp)', async () => {
        const doc = TextDocument.create('file:///t257p3-prefield.clw', 'clarion', 1, PREFIELD_SRC);
        TokenCache.getInstance().getTokens(doc);
        const provider = new SignatureHelpProvider();
        const result = await provider.provideSignatureHelp(doc, { line: 12, character: '  DoIt(QUE:Fld'.length });
        assert.ok(result && result.signatures.length >= 2, 'expected both overloads');
        assert.strictEqual(result!.activeSignature, 1,
            'QUE:Fld is a LONG — the LONG overload (index 1) must be highlighted; ' +
            'index 0 means the PRE:Field argument never type-resolved');
    });

    // ─── (3) PRE:Field argument (F12 method-overload pick) ─────────────────
    const F12_SRC = [
        "  MEMBER('test')",                    // 0
        '',                                    // 1
        'MyQ       QUEUE,PRE(QUE)',            // 2
        'Fld         LONG',                    // 3
        '          END',                       // 4
        '',                                    // 5
        'MyClass  CLASS,TYPE',                 // 6
        'DoIt       PROCEDURE(STRING s)',      // 7  wrong overload
        'DoIt       PROCEDURE(LONG n)',        // 8  ← expected F12 target
        '         END',                        // 9
        '',                                    // 10
        'MyClass.DoIt PROCEDURE(STRING s)',    // 11
        '  CODE',                              // 12
        '  RETURN',                            // 13
        '',                                    // 14
        'MyClass.DoIt PROCEDURE(LONG n)',      // 15
        '  CODE',                              // 16
        '  RETURN',                            // 17
        '',                                    // 18
        'Consume  PROCEDURE()',                // 19
        'inst       MyClass',                  // 20
        '  CODE',                              // 21
        '  inst.DoIt(QUE:Fld)',                // 22 call site — F12 on DoIt
    ].join('\n');

    test('F12 on inst.DoIt(QUE:Fld) resolves the LONG overload declaration', async () => {
        const doc = TextDocument.create('file:///t257p3-f12.clw', 'clarion', 1, F12_SRC);
        TokenCache.getInstance().getTokens(doc);
        const provider = new DefinitionProvider();
        const callLine = '  inst.DoIt(QUE:Fld)';
        const cursor = { line: 22, character: callLine.indexOf('DoIt') + 1 };

        const result = await provider.provideDefinition(doc, cursor);
        assert.ok(result, 'F12 must resolve the method call');
        const locs: Location[] = Array.isArray(result) ? result : [result as Location];
        assert.ok(locs.length > 0, 'expected at least one definition location');
        const line = locs[0].range.start.line;
        assert.strictEqual(line, 8,
            `F12 must land on the LONG overload decl (line 8), got line ${line} — ` +
            'line 7 means the QUE:Fld argument never type-resolved (arity tie → first declared wins)');
    });
});
