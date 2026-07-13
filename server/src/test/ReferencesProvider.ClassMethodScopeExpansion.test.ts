import * as assert from 'assert';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { TokenCache } from '../TokenCache';
import { ReferencesProvider } from '../providers/ReferencesProvider';
import { setServerInitialized } from '../serverState';
import {
    buildMultiFileFixture,
    teardownMultiFileFixture
} from './helpers/MultiFileFARFixture';

/**
 * Failing-pin + guardrail suite for task `3be2b68d` (P1 — class-method
 * scope expansion). Phase A.
 *
 * Phase 1 audit established that cursor-on-class-method-decl routes
 * through `provideMemberReferences` (line 171-187), with the
 * scope-restriction at `:736-744`'s `isLocalClass` branch:
 *   ```
 *   const isLocalClass = !effectiveModuleFile && !!className &&
 *       this.isClassDeclaredInDocument(className, document);
 *   const filesToSearch = isLocalClass
 *       ? [document.uri]
 *       : this.getMemberSearchFiles(...);
 *   ```
 *
 * When `isLocalClass = true`: filesToSearch is just the cursor's file —
 * cross-file callers unreachable. Within the file, the matching loop
 * may also miss cross-procedure callers depending on its line-range
 * gating + variable-type inference.
 *
 * Locked test contract — 5 tests:
 *   1. (BUG PIN) same-file cross-procedure caller, local class.
 *   2. (BUG PIN) multi-file cross-procedure caller (uses bb21f225 helper).
 *   3. (REGRESSION GUARD) procedure-local variable scope intact.
 *   4. (REGRESSION GUARD) class-method same-class-different-method scope.
 *   5. (EQUIVALENCE GUARD) fe254d6f OverloadFilter integration with
 *      cross-procedure callers.
 *
 * Track-(a)/(b) classification per RED test:
 *   - (a) filesToSearch-widening: caller's file isn't in filesToSearch.
 *   - (b) matching-loop-type-inference: caller's file IS scanned but
 *     matching loop misses (line-range gating, variable-type inference,
 *     etc.).
 *
 * ESCALATION TRIGGER per Bob's locked gate: if ANY RED test requires
 * track (b) substrate, surface in completion note and DO NOT proceed
 * to step 3.
 */

function createDocument(content: string, uri: string = 'file:///test.clw'): TextDocument {
    return TextDocument.create(uri, 'clarion', 1, content);
}

function seedCache(document: TextDocument): void {
    TokenCache.getInstance().getTokens(document);
}

suite('ReferencesProvider.ClassMethodScopeExpansion (3be2b68d)', () => {

    let provider: ReferencesProvider;

    setup(() => {
        setServerInitialized(true);
        TokenCache.getInstance().clearAllTokens();
        provider = new ReferencesProvider();
    });

    teardown(() => {
        teardownMultiFileFixture();
    });

    // ─── (1) BUG PIN — same-file cross-procedure caller, local class ───────

    /**
     * Class with `Append PROCEDURE(STRING)` decl + impl + caller in MainProc
     * (separate procedure body, same file). FAR cursor on STRING decl
     * expects: STRING decl + STRING impl + MainProc caller.
     *
     * Pre-fix: provideMemberReferences sees `isLocalClass=true` (no MODULE
     * attr), filesToSearch = [document.uri]; the caller's file IS scanned.
     * If caller still missing → track (b) (matching-loop gating).
     */
    test('BUG PIN — same-file cross-procedure caller — FAR returns MainProc caller', async () => {
        const code = [
            "  MEMBER('test')",                       // line 0
            '',                                        // line 1
            'MyClass    CLASS,TYPE',                   // line 2
            'Append       PROCEDURE(STRING)',          // line 3 — FAR cursor here
            '           END',                          // line 4
            '',                                        // line 5
            'MyClass.Append PROCEDURE(STRING s)',      // line 6 — impl
            '  CODE',
            '  RETURN',
            '',                                        // line 9
            'MainProc PROCEDURE',                      // line 10
            'inst       MyClass',                      // line 11
            '  CODE',                                  // line 12
            "  inst.Append('x')",                      // line 13 — cross-procedure caller
            '  RETURN',
        ].join('\n');

        const doc = createDocument(code, 'file:///3be2b68d-1.clw');
        seedCache(doc);

        // Cursor on "Append" in the decl (line 3, col 0).
        const refs = await provider.provideReferences(doc, { line: 3, character: 0 },
            { includeDeclaration: true });

        assert.ok(refs, 'FAR should return references');
        const lines = refs!.map(r => r.range.start.line).sort((a, b) => a - b);

        // Bidirectional pin shape: positive (matching impl IN result)
        // + positive (cross-procedure caller IN result) + negative
        // (no spurious matches).
        assert.ok(
            lines.includes(13),
            'expected line 13 (MainProc caller) IN result; got lines=[' + lines.join(',') + '] — ' +
            'cross-procedure caller missing; classify track-(a) or track-(b)'
        );
        assert.ok(
            lines.includes(6),
            'expected line 6 (STRING impl) IN result; got lines=[' + lines.join(',') + ']'
        );
    });

    // ─── (2) BUG PIN — multi-file cross-procedure caller ────────────────────

    /**
     * Same class shape as test 1 but caller in DIFFERENT file. Uses the
     * bb21f225 MultiFileFARFixture helper for cross-file scaffolding.
     * Tests filesToSearch widening (track (a)).
     */
    test('BUG PIN — multi-file cross-procedure caller — FAR returns caller in fileB', async () => {
        const fixture = buildMultiFileFixture({
            files: {
                'class.clw': [
                    "  MEMBER('main')",                // line 0
                    '',                                 // line 1
                    'MyClass    CLASS,TYPE',            // line 2
                    'Append       PROCEDURE(STRING)',   // line 3 — FAR cursor here
                    '           END',                   // line 4
                    '',                                 // line 5
                    'MyClass.Append PROCEDURE(STRING s)', // line 6 — impl
                    '  CODE',
                    '  RETURN',
                ].join('\n'),
                'caller.clw': [
                    "  MEMBER('main')",                // line 0
                    '',                                 // line 1
                    'MainProc PROCEDURE',               // line 2
                    'inst       MyClass',               // line 3
                    '  CODE',                           // line 4
                    "  inst.Append('cross-file')",      // line 5 — cross-file caller
                    '  RETURN',
                ].join('\n'),
            }
        });

        const docClass = fixture.documents['class.clw'];
        const callerUri = fixture.uris['caller.clw'];

        // Cursor on "Append" in the decl (line 3, col 0).
        const refs = await provider.provideReferences(docClass, { line: 3, character: 0 },
            { includeDeclaration: true });

        assert.ok(refs, 'FAR should return references');
        const refUris = refs!.map(r => r.uri.toLowerCase());

        // Load-bearing assertion: cross-file caller URI MUST be present.
        // Pre-fix: provideMemberReferences with isLocalClass=true → filesToSearch
        // is just the class file → caller.clw never scanned → assertion fails
        // (track (a) — filesToSearch widening).
        assert.ok(
            refUris.some(u => u === callerUri.toLowerCase()),
            'expected cross-file caller URI ' + callerUri + ' in result; got URIs=[' + refUris.join(', ') + '] — ' +
            'multi-file scope-restriction blocks cross-file callers (track (a))'
        );
    });

    // ─── (2b) BUG PIN #346 — procedure-local class must NOT bleed cross-file ───

    /**
     * A CLASS declared inside a procedure's DATA section (between the
     * procedure label and CODE) is invisible outside its file — but every
     * generated window declares its own `BRW1`, so family-wide scanning
     * textually matches OTHER procedures' unrelated instances.
     *
     * Mark's IBSWorking repro: lens on `BRW1.SetQueueRecord PROCEDURE` in
     * SelectJobNumber_IBSCommon.clw → is_local_class=true, files=262
     * (frg-family), results=114 phantom refs, 11.6s.
     *
     * Pre-fix: isLocalClass widens to getLocalClassSearchFiles for ALL
     * local classes; the procedure-local scope discriminator is missing.
     */
    test('BUG PIN #346 — procedure-local class method — sibling member instances NOT matched', async () => {
        const winShape = (procName: string) => [
            "  MEMBER('main.clw')",                    // line 0
            '  MAP',                                    // line 1
            '  END',                                    // line 2
            `${procName} PROCEDURE`,                    // line 3
            'BRW1       CLASS(BrowseClass)',            // line 4 — procedure-LOCAL class
            'Init         PROCEDURE(),VIRTUAL',         // line 5
            '           END',                           // line 6
            '  CODE',                                   // line 7
            '  BRW1.Init()',                            // line 8 — caller (this file's BRW1)
            '  RETURN',                                 // line 9
            'BRW1.Init PROCEDURE()',                    // line 10 — impl (lens anchors here)
            '  CODE',
            '  RETURN',
        ].join('\n');

        const fixture = buildMultiFileFixture({
            files: {
                'main.clw': '  PROGRAM\n  MAP\n  END\n  CODE\n  RETURN\n',
                'winA.clw': winShape('ProcA'),
                'winB.clw': winShape('ProcB'),   // its OWN unrelated BRW1
            },
            frg: { programFile: 'main.clw', memberFiles: ['winA.clw', 'winB.clw'] },
        });

        const docA = fixture.documents['winA.clw'];
        const winBUri = fixture.uris['winB.clw'].toLowerCase();
        const winAUri = fixture.uris['winA.clw'].toLowerCase();

        // Cursor on "Init" in winA's impl label (line 10, character 5) — the
        // lens count path.
        const refs = await provider.provideReferences(docA, { line: 10, character: 5 },
            { includeDeclaration: true });

        assert.ok(refs, 'FAR should return references');
        const uris = refs!.map(r => r.uri.toLowerCase());
        const lines = refs!.filter(r => r.uri.toLowerCase() === winAUri)
            .map(r => r.range.start.line).sort((a, b) => a - b);

        // Negative: winB's unrelated BRW1 must NOT appear.
        assert.ok(
            !uris.some(u => u === winBUri),
            'expected NO references in winB.clw (its BRW1 is a DIFFERENT procedure-local class); ' +
            'got URIs=[' + [...new Set(uris)].join(', ') + '] — procedure-local class bled across the family (#346)'
        );
        // Positive: winA's own caller + impl still found.
        assert.ok(
            lines.includes(8),
            'expected line 8 (winA BRW1.Init() caller) IN result; got winA lines=[' + lines.join(',') + ']'
        );
        assert.ok(
            lines.includes(10),
            'expected line 10 (winA impl) IN result; got winA lines=[' + lines.join(',') + ']'
        );
    });

    // ─── (3) REGRESSION GUARD — procedure-local variable scope intact ──────

    /**
     * Procedure-local variable references must STAY scoped to the procedure.
     * Cursor on a procedure-local variable; FAR must NOT cross-procedure-match
     * an unrelated variable of the same name in another procedure.
     */
    test('REGRESSION GUARD — procedure-local variable scope intact (no cross-procedure match)', async () => {
        const code = [
            "  PROGRAM",                               // line 0
            '  MAP',                                   // line 1
            '  END',                                   // line 2
            '',                                        // line 3
            '  CODE',                                  // line 4
            '  RETURN',                                // line 5
            '',                                        // line 6
            'ProcA PROCEDURE',                         // line 7
            'localVar    LONG',                        // line 8 — local var, FAR cursor here
            '  CODE',                                  // line 9
            '  localVar = 42',                         // line 10 — usage in ProcA
            '  RETURN',                                // line 11
            '',                                        // line 12
            'ProcB PROCEDURE',                         // line 13
            'localVar    STRING(20)',                  // line 14 — DIFFERENT var, same name, in ProcB
            '  CODE',
            "  localVar = 'something'",                // line 16 — usage in ProcB (must NOT match)
            '  RETURN',
        ].join('\n');

        const doc = createDocument(code, 'file:///3be2b68d-3.clw');
        seedCache(doc);

        // Cursor on "localVar" in ProcA's decl (line 8, col 0).
        const refs = await provider.provideReferences(doc, { line: 8, character: 0 },
            { includeDeclaration: true });

        const lines = refs ? refs.map(r => r.range.start.line).sort((a, b) => a - b) : [];

        // ProcB's localVar (different variable, same name) must NOT appear.
        assert.ok(
            !lines.includes(14),
            'expected line 14 (ProcB localVar decl) NOT in result; got lines=[' + lines.join(',') + '] — ' +
            'procedure-local scope leaked across procedures'
        );
        assert.ok(
            !lines.includes(16),
            'expected line 16 (ProcB localVar usage) NOT in result; got lines=[' + lines.join(',') + ']'
        );
    });

    // ─── (4) REGRESSION GUARD — class-method same-class-different-method ───

    /**
     * Cursor on `Append`; another method `Foo` on the same class with
     * `inst.Foo(...)` caller does NOT appear in `Append`'s FAR result.
     * Verifies that scope expansion doesn't accidentally cross-method-match.
     */
    test('REGRESSION GUARD — class-method scope respects method name (no cross-method match)', async () => {
        const code = [
            "  MEMBER('test')",                       // line 0
            '',                                        // line 1
            'MyClass    CLASS,TYPE',                   // line 2
            'Append       PROCEDURE(STRING)',          // line 3 — FAR cursor here
            'Foo          PROCEDURE',                  // line 4 — different method
            '           END',                          // line 5
            '',                                        // line 6
            'MyClass.Append PROCEDURE(STRING s)',      // line 7 — Append impl
            '  CODE',
            '  RETURN',
            '',                                        // line 10
            'MyClass.Foo PROCEDURE',                   // line 11 — Foo impl (must NOT match Append FAR)
            '  CODE',
            '  RETURN',
            '',                                        // line 14
            'MainProc PROCEDURE',                      // line 15
            'inst       MyClass',                      // line 16
            '  CODE',
            "  inst.Append('a')",                      // line 18 — Append caller
            '  inst.Foo()',                            // line 19 — Foo caller (must NOT match Append FAR)
            '  RETURN',
        ].join('\n');

        const doc = createDocument(code, 'file:///3be2b68d-4.clw');
        seedCache(doc);

        const refs = await provider.provideReferences(doc, { line: 3, character: 0 },
            { includeDeclaration: true });

        const lines = refs ? refs.map(r => r.range.start.line).sort((a, b) => a - b) : [];

        assert.ok(
            !lines.includes(4),
            'expected line 4 (Foo decl) NOT in Append FAR result; got lines=[' + lines.join(',') + ']'
        );
        assert.ok(
            !lines.includes(11),
            'expected line 11 (Foo impl) NOT in Append FAR result; got lines=[' + lines.join(',') + ']'
        );
        assert.ok(
            !lines.includes(19),
            'expected line 19 (Foo caller) NOT in Append FAR result; got lines=[' + lines.join(',') + ']'
        );
    });

    // ─── (Tier 6 backfill) BUG PIN — cross-file PROGRAM-scope global receiver ───

    /**
     * Phase B+ Tier 6 backfill (`671d7cd8`, follows `10ea5a80`'s transparency disclosure).
     *
     * Cursor-on-decl path: cursor on `Append(STRING)` decl in PROGRAM file. Receiver
     * `instGlobal MyClass` is declared at PROGRAM scope (col-0 Label outside any
     * procedure). Caller `instGlobal.Append('x')` lives in a sibling MEMBER file.
     *
     * Without FRG seeding (`frg` opt omitted), `loadGlobalScopeForCursor` returns null
     * and the matching loop never resolves `instGlobal` → MyClass for the call site
     * in the MEMBER file → call dropped silently. Test asserts the cross-file caller
     * URI IS in result — RED today via the fixture limitation that motivated the
     * deferral; flips GREEN after the fixture extension lands.
     *
     * Bidirectional pin per `feedback_bidirectional_pin_assertion`: STRING caller IN +
     * LONG caller NOT IN simultaneously.
     */
    test('Tier 6 BUG PIN — cross-file PROGRAM-scope global receiver — FAR finds caller in MEMBER file', async () => {
        const fixture = buildMultiFileFixture({
            files: {
                'main.clw': [
                    "  PROGRAM",                                  // line 0
                    '',                                            // line 1
                    'MyClass    CLASS,TYPE',                       // line 2
                    'Append       PROCEDURE(STRING)',              // line 3 — FAR cursor (STRING)
                    'Append       PROCEDURE(LONG)',                // line 4 — LONG overload
                    '           END',                              // line 5
                    '',                                            // line 6
                    'instGlobal MyClass',                          // line 7 — PROGRAM-scope global
                    '',                                            // line 8
                    '  CODE',                                      // line 9
                    '  RETURN',                                    // line 10
                    '',                                            // line 11
                    'MyClass.Append PROCEDURE(STRING s)',          // line 12 — STRING impl
                    '  CODE',
                    '  RETURN',
                    '',
                    'MyClass.Append PROCEDURE(LONG n)',            // line 16 — LONG impl
                    '  CODE',
                    '  RETURN',
                ].join('\n'),
                'caller.clw': [
                    "  MEMBER('main.clw')",                        // line 0
                    '',                                            // line 1
                    'CallerProc PROCEDURE',                        // line 2
                    '  CODE',                                      // line 3
                    "  instGlobal.Append('cross-file-global')",    // line 4 — STRING caller
                    '  instGlobal.Append(42)',                     // line 5 — LONG caller
                    '  RETURN',                                    // line 6
                ].join('\n'),
            },
            frg: {
                programFile: 'main.clw',
                memberFiles: ['caller.clw']
            }
        });

        const docMain = fixture.documents['main.clw'];
        const callerUri = fixture.uris['caller.clw'];

        // Cursor on `Append(STRING)` decl in main.clw (line 3, col 0).
        const refs = await provider.provideReferences(docMain, { line: 3, character: 0 },
            { includeDeclaration: true });

        assert.ok(refs, 'FAR should return references for Tier 6 cross-file global receiver');

        const refUris = refs!.map(r => r.uri.toLowerCase());
        const callerUriLower = callerUri.toLowerCase();
        const callerHits = refs!.filter(r => r.uri.toLowerCase() === callerUriLower)
            .map(r => r.range.start.line)
            .sort((a, b) => a - b);

        assert.ok(
            refUris.some(u => u === callerUriLower),
            'expected caller.clw URI in result; got URIs=[' + refUris.join(', ') + '] — ' +
            'Tier 6 PROGRAM-scope global receiver not resolved (FRG seeding missing OR loadGlobalScopeForCursor regression)'
        );
        assert.ok(
            callerHits.includes(4),
            'expected caller.clw line 4 (STRING caller) IN result; got lines=[' + callerHits.join(',') + '] — ' +
            'Tier 6 lookup chain failed to match `instGlobal` → MyClass at the cross-file call site'
        );
        assert.ok(
            !callerHits.includes(5),
            'expected caller.clw line 5 (LONG caller) NOT in STRING-cursor result; got lines=[' + callerHits.join(',') + '] — ' +
            'overload disambiguation must drop the wrong-overload caller'
        );
    });

    /**
     * Multi-overload class-method with cross-procedure callers; FAR returns
     * only matching-overload's caller. Verifies caller-scope expansion
     * cooperates with the fe254d6f Phase A signaturesMatch wire-up.
     *
     * Today: cross-procedure caller may be missed (3be2b68d bug pin shape);
     * the equivalence aspect is whether the OverloadFilter still discriminates
     * if the scope is widened. This test will likely be RED today (caller
     * missing) and GREEN post-fix (caller present + correctly filtered to
     * STRING overload only).
     */
    // ─── (6) BUG PIN — procedure parameter receiver (Tier 2) ────────────────

    /**
     * Phase B+ extension (`10ea5a80` Tier 2 coverage). Receiver is a procedure
     * parameter typed as MyClass — calls `param.Append('x')` inside that procedure
     * must appear in FAR results. Pre-fix: `buildProcVarTypeIndex` walked col-0
     * Labels only, missing parameters declared in the `PROCEDURE(...)` signature.
     * Bidirectional pin per `feedback_bidirectional_pin_assertion`.
     */
    test('Phase B+ Tier 2 — parameter receiver — FAR returns param.Append() caller', async () => {
        const code = [
            "  MEMBER('test')",                                 // line 0
            '',                                                  // line 1
            'MyClass    CLASS,TYPE',                             // line 2
            'Append       PROCEDURE(STRING)',                    // line 3 — FAR cursor (STRING)
            'Append       PROCEDURE(LONG)',                      // line 4 — LONG overload
            '           END',                                    // line 5
            '',                                                  // line 6
            'MyClass.Append PROCEDURE(STRING s)',                // line 7
            '  CODE',
            '  RETURN',
            '',
            'MyClass.Append PROCEDURE(LONG n)',                  // line 11
            '  CODE',
            '  RETURN',
            '',                                                  // line 14
            'DoStuff PROCEDURE(MyClass param, LONG flag)',       // line 15
            '  CODE',                                            // line 16
            "  param.Append('x')",                               // line 17 — STRING caller via param
            '  param.Append(42)',                                // line 18 — LONG caller via param
            '  RETURN',
        ].join('\n');

        const doc = createDocument(code, 'file:///3be2b68d-tier2.clw');
        seedCache(doc);

        const refs = await provider.provideReferences(doc, { line: 3, character: 0 },
            { includeDeclaration: true });

        const lines = refs ? refs.map(r => r.range.start.line).sort((a, b) => a - b) : [];

        assert.ok(
            lines.includes(17),
            'expected line 17 (STRING param.Append caller) IN result; got lines=[' + lines.join(',') + ']'
        );
        assert.ok(
            !lines.includes(18),
            'expected line 18 (LONG param.Append caller) NOT in STRING-cursor result; got lines=[' + lines.join(',') + ']'
        );
    });

    // ─── (7) BUG PIN — module-scope receiver (Tier 5) ───────────────────────

    /**
     * Phase B+ extension (Tier 5 coverage). Receiver is a MEMBER-scope variable
     * declared OUTSIDE any procedure. Calls from procedures in the same module
     * must appear in FAR results. Bidirectional pin: STRING caller IN, LONG NOT IN.
     */
    test('Phase B+ Tier 5 — module-scope receiver — FAR returns instModule.Append() caller', async () => {
        const code = [
            "  MEMBER('test')",                                 // line 0
            '',                                                  // line 1
            'MyClass    CLASS,TYPE',                             // line 2
            'Append       PROCEDURE(STRING)',                    // line 3 — FAR cursor (STRING)
            'Append       PROCEDURE(LONG)',                      // line 4 — LONG overload
            '           END',                                    // line 5
            '',                                                  // line 6
            'instModule MyClass',                                // line 7 — module-scope receiver
            '',                                                  // line 8
            'MyClass.Append PROCEDURE(STRING s)',                // line 9
            '  CODE',
            '  RETURN',
            '',
            'MyClass.Append PROCEDURE(LONG n)',                  // line 13
            '  CODE',
            '  RETURN',
            '',                                                  // line 16
            'MainProc PROCEDURE',                                // line 17
            '  CODE',                                            // line 18
            "  instModule.Append('x')",                          // line 19 — STRING caller
            '  instModule.Append(42)',                           // line 20 — LONG caller
            '  RETURN',
        ].join('\n');

        const doc = createDocument(code, 'file:///3be2b68d-tier5.clw');
        seedCache(doc);

        const refs = await provider.provideReferences(doc, { line: 3, character: 0 },
            { includeDeclaration: true });

        const lines = refs ? refs.map(r => r.range.start.line).sort((a, b) => a - b) : [];

        assert.ok(
            lines.includes(19),
            'expected line 19 (STRING instModule.Append caller) IN result; got lines=[' + lines.join(',') + ']'
        );
        assert.ok(
            !lines.includes(20),
            'expected line 20 (LONG instModule.Append caller) NOT in STRING-cursor result; got lines=[' + lines.join(',') + ']'
        );
    });

    // ─── (8) BUG PIN — SELF.field receiver (Tier 4) ─────────────────────────

    /**
     * Phase B+ extension (Tier 4 coverage). Receiver is a CLASS member field accessed
     * via `SELF.someInst`, called from inside another method body. Tokenizer produces
     * `StructureField("SELF.someInst") + Function("Append")` — the new Function-token
     * branch in the matching loop catches this shape.
     */
    test('Phase B+ Tier 4 — SELF.field receiver — FAR returns SELF.theInst.Append() caller', async () => {
        const code = [
            "  MEMBER('test')",                                 // line 0
            '',                                                  // line 1
            'MyClass    CLASS,TYPE',                             // line 2
            'Append       PROCEDURE(STRING)',                    // line 3 — FAR cursor (STRING)
            'Append       PROCEDURE(LONG)',                      // line 4 — LONG overload
            '           END',                                    // line 5
            '',                                                  // line 6
            'Outer    CLASS,TYPE',                               // line 7
            'theInst    MyClass',                                // line 8 — class-field receiver
            'SomeMethod   PROCEDURE',                            // line 9
            '           END',                                    // line 10
            '',                                                  // line 11
            'MyClass.Append PROCEDURE(STRING s)',                // line 12
            '  CODE',
            '  RETURN',
            '',
            'MyClass.Append PROCEDURE(LONG n)',                  // line 16
            '  CODE',
            '  RETURN',
            '',                                                  // line 19
            'Outer.SomeMethod PROCEDURE',                        // line 20
            '  CODE',                                            // line 21
            "  SELF.theInst.Append('x')",                        // line 22 — STRING caller via SELF.field
            '  SELF.theInst.Append(42)',                         // line 23 — LONG caller via SELF.field
            '  RETURN',
        ].join('\n');

        const doc = createDocument(code, 'file:///3be2b68d-tier4.clw');
        seedCache(doc);

        const refs = await provider.provideReferences(doc, { line: 3, character: 0 },
            { includeDeclaration: true });

        const lines = refs ? refs.map(r => r.range.start.line).sort((a, b) => a - b) : [];

        assert.ok(
            lines.includes(22),
            'expected line 22 (STRING SELF.theInst.Append caller) IN result; got lines=[' + lines.join(',') + ']'
        );
        assert.ok(
            !lines.includes(23),
            'expected line 23 (LONG SELF.theInst.Append caller) NOT in STRING-cursor result; got lines=[' + lines.join(',') + ']'
        );
    });

    // ─── (5) EQUIVALENCE GUARD — fe254d6f OverloadFilter integration ───────

    /**
     * Multi-overload class-method with cross-procedure callers; FAR returns
     * only matching-overload's caller. Verifies caller-scope expansion
     * cooperates with the fe254d6f Phase A signaturesMatch wire-up.
     *
     * Today: cross-procedure caller may be missed (3be2b68d bug pin shape);
     * the equivalence aspect is whether the OverloadFilter still discriminates
     * if the scope is widened. This test will likely be RED today (caller
     * missing) and GREEN post-fix (caller present + correctly filtered to
     * STRING overload only).
     */
    test('EQUIVALENCE GUARD — multi-overload class-method, cross-procedure caller respects fe254d6f filter', async () => {
        const code = [
            "  MEMBER('test')",                       // line 0
            '',                                        // line 1
            'MyClass    CLASS,TYPE',                   // line 2
            'Append       PROCEDURE(STRING)',          // line 3 — STRING decl, FAR cursor here
            'Append       PROCEDURE(LONG)',            // line 4 — LONG decl
            '           END',                          // line 5
            '',                                        // line 6
            'MyClass.Append PROCEDURE(STRING s)',      // line 7 — STRING impl
            '  CODE',
            '  RETURN',
            '',
            'MyClass.Append PROCEDURE(LONG n)',        // line 11 — LONG impl
            '  CODE',
            '  RETURN',
            '',                                        // line 14
            'MainProc PROCEDURE',                      // line 15
            'inst       MyClass',                      // line 16
            '  CODE',
            "  inst.Append('x')",                      // line 18 — STRING caller
            '  inst.Append(42)',                       // line 19 — LONG caller (must NOT match STRING FAR)
            '  RETURN',
        ].join('\n');

        const doc = createDocument(code, 'file:///3be2b68d-5.clw');
        seedCache(doc);

        const refs = await provider.provideReferences(doc, { line: 3, character: 0 },
            { includeDeclaration: true });

        const lines = refs ? refs.map(r => r.range.start.line).sort((a, b) => a - b) : [];

        // Bidirectional pin: STRING caller IN result, LONG caller NOT in result.
        assert.ok(
            lines.includes(18),
            'expected line 18 (STRING caller) IN result; got lines=[' + lines.join(',') + ']'
        );
        assert.ok(
            !lines.includes(19),
            'expected line 19 (LONG caller) NOT in result; got lines=[' + lines.join(',') + '] — ' +
            'OverloadFilter integration broken'
        );
        // Negative on wrong-overload decl + impl too.
        assert.ok(
            !lines.includes(4),
            'expected line 4 (LONG decl) NOT in result; got lines=[' + lines.join(',') + ']'
        );
        assert.ok(
            !lines.includes(11),
            'expected line 11 (LONG impl) NOT in result; got lines=[' + lines.join(',') + ']'
        );
    });

    // ─── (9) BUG PIN — Tier 1 routine-DATA shadowing breaks proc-local lookup ───

    /**
     * Phase B Tier 1 bug pin (`9142af9f`). When a procedure has a local var `inst MyClass`
     * AND a ROUTINE inside it declares `inst LONG` in DATA, today's `buildFileVarTypeIndex`
     * walks ALL col-0 Labels in the procedure scope including the routine's — last-write-wins
     * makes `inst LONG` overwrite `inst MyClass` in the procedure-local map. Procedure-body
     * callers then resolve to LONG (not MyClass), silently dropping the FAR match.
     *
     * Bidirectional pin per `feedback_bidirectional_pin_assertion`:
     *   - proc-body STRING caller `inst.Append('x')` IS in result (resolves via proc-local MyClass)
     *   - proc-body LONG caller `inst.Append(42)` NOT in STRING-cursor result (LONG decl is different overload)
     *
     * Pre-fix: both calls drop because lookup returns LONG → not in MyClass family. RED.
     * Post-fix: routine-bounded lines excluded from proc-local walk → proc-local correctly = MyClass.
     */
    test('Phase B Tier 1 BUG PIN — routine DATA shadowing must NOT pollute procedure-local lookup', async () => {
        const code = [
            "  MEMBER('test')",                                 // line 0
            '',                                                  // line 1
            'MyClass    CLASS,TYPE',                             // line 2
            'Append       PROCEDURE(STRING)',                    // line 3 — FAR cursor (STRING)
            'Append       PROCEDURE(LONG)',                      // line 4 — LONG overload
            '           END',                                    // line 5
            '',                                                  // line 6
            'MyClass.Append PROCEDURE(STRING s)',                // line 7
            '  CODE',
            '  RETURN',
            '',
            'MyClass.Append PROCEDURE(LONG n)',                  // line 11
            '  CODE',
            '  RETURN',
            '',                                                  // line 14
            'MainProc PROCEDURE',                                // line 15
            'inst       MyClass',                                // line 16 — proc-local MyClass
            '  CODE',                                            // line 17
            "  inst.Append('a')",                                // line 18 — proc-body STRING caller
            '  inst.Append(42)',                                 // line 19 — proc-body LONG caller
            '  DO MyRoutine',                                    // line 20
            '  RETURN',                                          // line 21
            '',                                                  // line 22
            'MyRoutine ROUTINE',                                 // line 23
            '  DATA',                                            // line 24
            'inst       LONG',                                   // line 25 — routine-local SHADOWS
            '  CODE',                                            // line 26
            '  inst = 99',                                       // line 27 — routine-body uses routine-local LONG (no method call)
            '  RETURN',                                          // line 28
        ].join('\n');

        const doc = createDocument(code, 'file:///9142af9f-tier1-shadow.clw');
        seedCache(doc);

        const refs = await provider.provideReferences(doc, { line: 3, character: 0 },
            { includeDeclaration: true });

        const lines = refs ? refs.map(r => r.range.start.line).sort((a, b) => a - b) : [];

        // Positive: proc-body STRING caller IS resolved via proc-local MyClass.
        assert.ok(
            lines.includes(18),
            'expected line 18 (proc-body STRING caller) IN result; got lines=[' + lines.join(',') + '] — ' +
            'routine DATA shadowing polluted proc-local lookup; proc-local should still resolve to MyClass'
        );
        // Negative: proc-body LONG caller NOT in STRING-cursor result (routes to LONG decl).
        assert.ok(
            !lines.includes(19),
            'expected line 19 (proc-body LONG caller) NOT in STRING-cursor result; got lines=[' + lines.join(',') + ']'
        );
    });

    // ─── (10) REGRESSION GUARD — routine WITHOUT DATA doesn't break proc-local ───

    /**
     * Phase B Tier 1 regression guard. The Tier 1 walk must not break the common
     * case: procedure with a routine that has NO DATA section (just CODE). Proc-local
     * `inst MyClass` should resolve normally for proc-body callers; routine has no
     * shadowing names to worry about.
     */
    test('Phase B Tier 1 REGRESSION — routine without DATA section preserves proc-local resolution', async () => {
        const code = [
            "  MEMBER('test')",                                 // line 0
            '',                                                  // line 1
            'MyClass    CLASS,TYPE',                             // line 2
            'Append       PROCEDURE(STRING)',                    // line 3 — FAR cursor
            '           END',                                    // line 4
            '',                                                  // line 5
            'MyClass.Append PROCEDURE(STRING s)',                // line 6
            '  CODE',
            '  RETURN',
            '',                                                  // line 9
            'MainProc PROCEDURE',                                // line 10
            'inst       MyClass',                                // line 11 — proc-local
            '  CODE',                                            // line 12
            "  inst.Append('a')",                                // line 13 — proc-body caller
            '  DO MyRoutine',                                    // line 14
            '  RETURN',                                          // line 15
            '',                                                  // line 16
            'MyRoutine ROUTINE',                                 // line 17
            '  CODE',                                            // line 18 — no DATA, code-only routine
            '  ! comment',                                       // line 19
            '  RETURN',                                          // line 20
        ].join('\n');

        const doc = createDocument(code, 'file:///9142af9f-tier1-nodata.clw');
        seedCache(doc);

        const refs = await provider.provideReferences(doc, { line: 3, character: 0 },
            { includeDeclaration: true });

        const lines = refs ? refs.map(r => r.range.start.line).sort((a, b) => a - b) : [];

        assert.ok(
            lines.includes(13),
            'expected line 13 (proc-body inst.Append caller) IN result; got lines=[' + lines.join(',') + '] — ' +
            'routine without DATA must not break proc-local lookup'
        );
    });

    // ─── (11) Tier 1 — routine body resolves via routine-local class instance ───

    /**
     * Phase B Tier 1 positive coverage. Symmetric shape to test 9: proc-local is now
     * a non-class type (LONG); routine DATA declares `inst MyClass` (no shadowing
     * conflict on lookup result, but exercises the routine-scope-first lookup path
     * directly). Routine body's `inst.Append('x')` must resolve via routine-local
     * MyClass and appear in FAR results.
     */
    test('Phase B Tier 1 — routine body resolves receiver via routine-local class instance', async () => {
        const code = [
            "  MEMBER('test')",                                 // line 0
            '',                                                  // line 1
            'MyClass    CLASS,TYPE',                             // line 2
            'Append       PROCEDURE(STRING)',                    // line 3 — FAR cursor (STRING)
            'Append       PROCEDURE(LONG)',                      // line 4 — LONG overload
            '           END',                                    // line 5
            '',                                                  // line 6
            'MyClass.Append PROCEDURE(STRING s)',                // line 7
            '  CODE',
            '  RETURN',
            '',
            'MyClass.Append PROCEDURE(LONG n)',                  // line 11
            '  CODE',
            '  RETURN',
            '',                                                  // line 14
            'MainProc PROCEDURE',                                // line 15
            'inst       LONG',                                   // line 16 — proc-local LONG (no class methods)
            '  CODE',                                            // line 17
            '  inst = 0',                                        // line 18 — proc-body LONG usage
            '  DO MyRoutine',                                    // line 19
            '  RETURN',                                          // line 20
            '',                                                  // line 21
            'MyRoutine ROUTINE',                                 // line 22
            '  DATA',                                            // line 23
            'inst       MyClass',                                // line 24 — routine-local MyClass
            '  CODE',                                            // line 25
            "  inst.Append('routine-local')",                    // line 26 — routine-body STRING caller
            '  inst.Append(7)',                                  // line 27 — routine-body LONG caller
            '  RETURN',                                          // line 28
        ].join('\n');

        const doc = createDocument(code, 'file:///9142af9f-tier1-positive.clw');
        seedCache(doc);

        const refs = await provider.provideReferences(doc, { line: 3, character: 0 },
            { includeDeclaration: true });

        const lines = refs ? refs.map(r => r.range.start.line).sort((a, b) => a - b) : [];

        // Positive: routine-body STRING caller IS in result via routine-local MyClass.
        assert.ok(
            lines.includes(26),
            'expected line 26 (routine-body STRING caller) IN result; got lines=[' + lines.join(',') + ']'
        );
        // Negative: routine-body LONG caller NOT in STRING-cursor result.
        assert.ok(
            !lines.includes(27),
            'expected line 27 (routine-body LONG caller) NOT in STRING-cursor result; got lines=[' + lines.join(',') + ']'
        );
    });
});
