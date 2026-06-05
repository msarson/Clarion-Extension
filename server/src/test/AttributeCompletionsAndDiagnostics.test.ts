import * as assert from 'assert';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { CompletionItemKind, DiagnosticSeverity } from 'vscode-languageserver/node';
import { WordCompletionProvider } from '../providers/WordCompletionProvider';
import { TokenCache } from '../TokenCache';
import { ScopeAnalyzer } from '../utils/ScopeAnalyzer';
import { SolutionManager } from '../solution/solutionManager';
import { validateAttributeApplicability } from '../providers/diagnostics/AttributeDiagnostics';
import { ClarionTokenizer } from '../ClarionTokenizer';

let docCounter = 0;
function makeDoc(lines: string[]): TextDocument {
    return TextDocument.create(`file:///test-attr-${++docCounter}.clw`, 'clarion', 1, lines.join('\n'));
}

function makeProvider(document: TextDocument): WordCompletionProvider {
    const cache = TokenCache.getInstance();
    cache.getTokens(document);
    const scopeAnalyzer = new ScopeAnalyzer(cache, SolutionManager.getInstance());
    return new WordCompletionProvider(cache, scopeAnalyzer);
}

function tokenize(document: TextDocument) {
    const tokenizer = new ClarionTokenizer(document.getText());
    return tokenizer.tokenize();
}

// ─── Attribute Completions ────────────────────────────────────────────────────

suite('WordCompletionProvider — attribute completions', () => {

    test('attribute items have CompletionItemKind.Property', async () => {
        const doc = makeDoc([
            'MyWin WINDOW',
            "  BUTTON('OK'),AT(10,10,50,14)",
            'END',
        ]);
        const p = makeProvider(doc);
        // Cursor inside the BUTTON attribute list
        const items = await p.provide(doc, { line: 1, character: 20 }, '');
        const attrItems = items.filter(i => i.kind === CompletionItemKind.Property);
        assert.ok(attrItems.length > 0, 'Expected at least one attribute completion item');
    });

    test('AT is offered (applicableTo includes CONTROL)', async () => {
        const doc = makeDoc([
            'MyWin WINDOW',
            "  BUTTON('OK'),DEFAULT",
            'END',
        ]);
        const p = makeProvider(doc);
        const items = await p.provide(doc, { line: 1, character: 18 }, '');
        const labels = items.map(i => i.label.toUpperCase());
        assert.ok(labels.includes('AT'), 'AT should be offered in BUTTON context');
    });

    test('DEFAULT is offered in BUTTON context', async () => {
        const doc = makeDoc([
            'MyWin WINDOW',
            "  BUTTON('OK'),AT(10,10,50,14)",
            'END',
        ]);
        const p = makeProvider(doc);
        const items = await p.provide(doc, { line: 1, character: 20 }, '');
        const labels = items.map(i => i.label.toUpperCase());
        assert.ok(labels.includes('DEFAULT'), 'DEFAULT should be offered in BUTTON context');
    });

    test('WINDOW-level attributes offered when in WINDOW structure (no specific control)', async () => {
        const doc = makeDoc([
            "MyWin WINDOW('Title'),AT(,,400,300)",
            'END',
        ]);
        const p = makeProvider(doc);
        // Cursor on the WINDOW line, inside attribute list
        const items = await p.provide(doc, { line: 0, character: 30 }, '');
        const labels = items.map(i => i.label.toUpperCase());
        // RESIZE is WINDOW-only — should appear in WINDOW context
        assert.ok(labels.includes('RESIZE'), 'RESIZE should be offered in WINDOW context');
    });

    test('prefix filter works for attributes', async () => {
        const doc = makeDoc([
            'MyWin WINDOW',
            "  BUTTON('OK'),AT(10,10,50,14)",
            'END',
        ]);
        const p = makeProvider(doc);
        const items = await p.provide(doc, { line: 1, character: 20 }, 'DE');
        const labels = items.map(i => i.label.toUpperCase());
        assert.ok(labels.includes('DEFAULT'), 'DEFAULT should match prefix DE');
        assert.ok(labels.every(l => l.startsWith('DE')), `All results should start with DE, got: ${labels.join(', ')}`);
    });

    test('all attributes offered when no control context', async () => {
        const doc = makeDoc([
            'MyProc PROCEDURE()',
            'CODE',
            '  x = 1',
            'END',
        ]);
        const p = makeProvider(doc);
        const items = await p.provide(doc, { line: 2, character: 2 }, '');
        const attrItems = items.filter(i => i.kind === CompletionItemKind.Property);
        // When no context, all attributes are returned — should be a large set
        assert.ok(attrItems.length > 50, `Expected >50 attribute items in no-context, got ${attrItems.length}`);
    });
});

// ─── Attribute Diagnostics ────────────────────────────────────────────────────

suite('validateAttributeApplicability', () => {

    test('no diagnostic for AT on BUTTON (CONTROL wildcard)', () => {
        const doc = makeDoc([
            'MyWin WINDOW',
            "  BUTTON('OK'),AT(10,10,50,14)",
            'END',
        ]);
        const tokens = tokenize(doc);
        const diagnostics = validateAttributeApplicability(tokens, doc);
        const attrDiags = diagnostics.filter(d => d.code === 'invalid-attribute-context');
        assert.strictEqual(attrDiags.length, 0, `Expected no attribute diagnostics, got: ${JSON.stringify(attrDiags)}`);
    });

    test('no diagnostic for DEFAULT on BUTTON (in commonAttributes)', () => {
        const doc = makeDoc([
            'MyWin WINDOW',
            "  BUTTON('OK'),DEFAULT",
            'END',
        ]);
        const tokens = tokenize(doc);
        const diagnostics = validateAttributeApplicability(tokens, doc);
        const attrDiags = diagnostics.filter(d => d.code === 'invalid-attribute-context');
        assert.strictEqual(attrDiags.length, 0, `Expected no attribute diagnostics, got: ${JSON.stringify(attrDiags)}`);
    });

    test('warning when RESIZE (WINDOW-only) used on BUTTON', () => {
        const doc = makeDoc([
            'MyWin WINDOW',
            "  BUTTON('OK'),RESIZE",
            'END',
        ]);
        const tokens = tokenize(doc);
        const diagnostics = validateAttributeApplicability(tokens, doc);
        const attrDiags = diagnostics.filter(d => d.code === 'invalid-attribute-context');
        assert.ok(attrDiags.length > 0, 'Expected a warning for RESIZE on BUTTON');
        assert.strictEqual(attrDiags[0].severity, DiagnosticSeverity.Warning);
        assert.ok(attrDiags[0].message.includes('RESIZE'), `Expected RESIZE in message: ${attrDiags[0].message}`);
    });

    test('warning when MDI (WINDOW-only) used on BUTTON', () => {
        const doc = makeDoc([
            'MyWin WINDOW',
            "  BUTTON('OK'),MDI",
            'END',
        ]);
        const tokens = tokenize(doc);
        const diagnostics = validateAttributeApplicability(tokens, doc);
        const attrDiags = diagnostics.filter(d => d.code === 'invalid-attribute-context');
        assert.ok(attrDiags.length > 0, 'Expected a warning for MDI on BUTTON');
        assert.strictEqual(attrDiags[0].severity, DiagnosticSeverity.Warning);
    });

    test('no diagnostic for attributes on WINDOW structure itself', () => {
        // RESIZE is valid on WINDOW — cursor not on a control, so no warning
        const doc = makeDoc([
            "MyWin WINDOW('Title'),RESIZE",
            'END',
        ]);
        const tokens = tokenize(doc);
        const diagnostics = validateAttributeApplicability(tokens, doc);
        const attrDiags = diagnostics.filter(d => d.code === 'invalid-attribute-context');
        assert.strictEqual(attrDiags.length, 0, `Expected no attribute diagnostics on WINDOW line, got: ${JSON.stringify(attrDiags)}`);
    });

    test('no false positive for PRE on GROUP (data structure context)', () => {
        // PRE is valid on GROUP as a data structure; window GROUP.commonAttributes
        // does not list PRE but applicableTo is the authoritative source.
        const doc = makeDoc([
            'MyWin WINDOW',
            "  CustomerGroup GROUP,PRE(CUS)",
            '  END',
            'END',
        ]);
        const tokens = tokenize(doc);
        const diagnostics = validateAttributeApplicability(tokens, doc);
        const attrDiags = diagnostics.filter(d => d.code === 'invalid-attribute-context');
        assert.strictEqual(attrDiags.length, 0, `Expected no diagnostic for PRE on GROUP, got: ${JSON.stringify(attrDiags)}`);
    });

    test('no false positive for TYPE on GROUP (data structure context)', () => {
        const doc = makeDoc([
            'MyWin WINDOW',
            '  ItemGroup GROUP,TYPE',
            '  END',
            'END',
        ]);
        const tokens = tokenize(doc);
        const diagnostics = validateAttributeApplicability(tokens, doc);
        const attrDiags = diagnostics.filter(d => d.code === 'invalid-attribute-context');
        assert.strictEqual(attrDiags.length, 0, `Expected no diagnostic for TYPE on GROUP, got: ${JSON.stringify(attrDiags)}`);
    });

    test('no false positive for OVER on GROUP (DATA_TYPE applicableTo, ambiguous context)', () => {
        // OVER has applicableTo:["DATA_TYPE"] — GROUP is excluded from validation
        // because it is ambiguous (window control vs data structure).
        const doc = makeDoc([
            'MyWin WINDOW',
            '  Overlay GROUP,OVER(SomeVar)',
            '  END',
            'END',
        ]);
        const tokens = tokenize(doc);
        const diagnostics = validateAttributeApplicability(tokens, doc);
        const attrDiags = diagnostics.filter(d => d.code === 'invalid-attribute-context');
        assert.strictEqual(attrDiags.length, 0, `Expected no diagnostic for OVER on GROUP, got: ${JSON.stringify(attrDiags)}`);
    });

    test('diagnostic has correct range pointing at the attribute token', () => {
        const doc = makeDoc([
            'MyWin WINDOW',
            "  BUTTON('OK'),RESIZE",
            'END',
        ]);
        const tokens = tokenize(doc);
        const diagnostics = validateAttributeApplicability(tokens, doc);
        const diag = diagnostics.find(d => d.code === 'invalid-attribute-context');
        assert.ok(diag, 'Expected a diagnostic');
        assert.strictEqual(diag!.range.start.line, 1, 'Diagnostic should be on line 1 (BUTTON line)');
        assert.ok(diag!.range.start.character >= 0, 'Diagnostic should have valid start character');
    });

    // ─── #174 — Attribute-applicability false positive on :Suffix label names ─────
    // Real-user repro: Frame_AcctsMap.clw:816 — `STRING('...'),USE(?SL_Clients:External)`
    // inside PROGRESS structure. Pre-fix tokenized `External` as a separate Attribute
    // token, driving 'External is not applicable to PROGRESS' false positive.
    //
    // Root-cause fix at TokenPatterns.ts:63 (FieldEquateLabel regex now includes `:` in
    // its character class, symmetric to the sibling Label pattern at line 89). All
    // attribute-keyword suffixes in field-equate label position are now captured as
    // part of the single FieldEquateLabel token, so AttributeDiagnostics never sees
    // them.
    //
    // Bidirectional-pin per feedback_bidirectional_pin_assertion:
    //   - Positive: :EXTERNAL / :HIDE / :TRN suffixes on field-equate labels do NOT fire
    //   - Negative regression sentinel: genuine misapplied EXTERNAL (in an actual
    //     control's attribute list, not a USE-arg label) STILL fires. Without the
    //     sentinel, the fix could over-relax the diagnostic.
    suite('#174 — :Suffix label names do not trigger false-positive diagnostics', () => {

        test('real-user repro — STRING with USE(?Label:External) inside PROGRESS does NOT fire', () => {
            const doc = makeDoc([
                'MyWin WINDOW',
                "  PROGRESS,AT(10,10,200,14),USE(?Prog)",
                "  STRING('Data In External Accounting System'),AT(20,30,,10),USE(?SL_Clients:External)",
                'END',
            ]);
            const tokens = tokenize(doc);
            const diagnostics = validateAttributeApplicability(tokens, doc);
            const attrDiags = diagnostics.filter(d => d.code === 'invalid-attribute-context');
            assert.strictEqual(attrDiags.length, 0,
                `Expected NO diagnostic on :External label-suffix; got: ${JSON.stringify(attrDiags)}`);
        });

        test('generalisation — :Hide suffix on field-equate label does NOT fire', () => {
            const doc = makeDoc([
                'MyWin WINDOW',
                "  STRING('Label'),AT(20,40),USE(?Control:Hide)",
                'END',
            ]);
            const tokens = tokenize(doc);
            const diagnostics = validateAttributeApplicability(tokens, doc);
            const attrDiags = diagnostics.filter(d => d.code === 'invalid-attribute-context');
            assert.strictEqual(attrDiags.length, 0,
                `Expected NO diagnostic on :Hide label-suffix; got: ${JSON.stringify(attrDiags)}`);
        });

        test('generalisation — :Trn suffix on field-equate label does NOT fire', () => {
            const doc = makeDoc([
                'MyWin WINDOW',
                "  BUTTON('OK'),AT(20,40),USE(?Btn:Trn)",
                'END',
            ]);
            const tokens = tokenize(doc);
            const diagnostics = validateAttributeApplicability(tokens, doc);
            const attrDiags = diagnostics.filter(d => d.code === 'invalid-attribute-context');
            assert.strictEqual(attrDiags.length, 0,
                `Expected NO diagnostic on :Trn label-suffix; got: ${JSON.stringify(attrDiags)}`);
        });

        // Negative regression sentinel — Bob's load-bearing scope-fence per
        // feedback_bidirectional_pin_assertion. Without this test, the fix could
        // silently over-relax: if we simply skipped all "External" tokens regardless of
        // context, a real misapplied EXTERNAL attribute would no longer fire either.
        // EXTERNAL has applicableTo: ["DATA_TYPE", "PROCEDURE"] per clarion-attributes.json
        // — neither is a control. STRING is in VALIDATABLE_CONTROLS, so a genuine
        // STRING-control EXTERNAL attribute is the right reverse-pinning shape.
        test('negative regression sentinel — genuinely misapplied EXTERNAL still fires', () => {
            // Use BUTTON (in VALIDATABLE_CONTROLS at AttributeDiagnostics.ts:19-23) — STRING is
            // NOT in VALIDATABLE_CONTROLS so wouldn't be validated regardless. EXTERNAL has
            // applicableTo:["DATA_TYPE", "PROCEDURE"]; BUTTON matches neither — should fire.
            // Mirrors the existing working `BUTTON('OK'),RESIZE` test shape at lines 138-150.
            const doc = makeDoc([
                'MyWin WINDOW',
                "  BUTTON('OK'),EXTERNAL",
                'END',
            ]);
            const tokens = tokenize(doc);
            const diagnostics = validateAttributeApplicability(tokens, doc);
            const attrDiags = diagnostics.filter(d => d.code === 'invalid-attribute-context');
            assert.ok(attrDiags.length > 0,
                'Expected diagnostic for misapplied EXTERNAL on BUTTON control (scope-fence — fix must NOT over-relax)');
            assert.ok(attrDiags.some(d => d.message.toUpperCase().includes('EXTERNAL')),
                `Diagnostic message must reference EXTERNAL; got: ${attrDiags.map(d => d.message).join(' | ')}`);
        });
    });

    // ─── #175 — Attribute-applicability false positive on bare-identifier compound USE-labels ─
    // Real-user repro: Frame_AcctsMap.clw:820 — `CHECK(' Filter Bar'),AT(...),USE(RCFilter_SL_Clients:External),...`.
    // Same false-positive shape as #174 but the USE-label has no `?` prefix, so it routes through
    // the Variable tokenizer pattern instead of FieldEquateLabel. #174's tokenizer-side fix
    // (FieldEquateLabel including `:`) didn't cover this case.
    //
    // Fix shape (option b — diagnostic-side guard, per Phase A architectural-threshold analysis):
    // skip Attribute tokens that are the suffix of a compound `Variable:External` or
    // `FieldEquateLabel:External` pattern. The tokenizer-side fix for Variable was rejected as
    // the same-cycle option because Variable has 128 references across 30 files vs FieldEquateLabel's
    // 4 files (architectural-surprise threshold per Mark's standing rule). Tokenizer-side question
    // deferred to a follow-up task for Mark's architectural review.
    //
    // Bidirectional-pin per feedback_bidirectional_pin_assertion:
    //   - Positive ×3: :External / :Hide / :Trn suffixes on bare-identifier USE-labels do NOT fire
    //   - Negative regression sentinel: genuinely misapplied attributes STILL fire (scope-fence)
    //   - Type-annotation regression coverage: MyVar:BYTE / MyVar:LONG STILL tokenize correctly
    //   - #174 symmetry verification: the ?-prefixed case still works (no regression on #174)
    suite('#175 — bare-identifier compound USE-labels do not trigger false-positive diagnostics', () => {

        test('real-user repro — CHECK with USE(RCFilter_SL_Clients:External) does NOT fire', () => {
            const doc = makeDoc([
                'MyWin WINDOW',
                "  CHECK(' Filter Bar'),AT(650,61),USE(RCFilter_SL_Clients:External),TIP('Filter')",
                'END',
            ]);
            const tokens = tokenize(doc);
            const diagnostics = validateAttributeApplicability(tokens, doc);
            const attrDiags = diagnostics.filter(d => d.code === 'invalid-attribute-context');
            assert.strictEqual(attrDiags.length, 0,
                `Expected NO diagnostic on bare-identifier :External label-suffix; got: ${JSON.stringify(attrDiags)}`);
        });

        test('generalisation — :Hide suffix on bare-identifier label does NOT fire', () => {
            const doc = makeDoc([
                'MyWin WINDOW',
                "  BUTTON('OK'),AT(20,40),USE(Btn_Control:Hide)",
                'END',
            ]);
            const tokens = tokenize(doc);
            const diagnostics = validateAttributeApplicability(tokens, doc);
            const attrDiags = diagnostics.filter(d => d.code === 'invalid-attribute-context');
            assert.strictEqual(attrDiags.length, 0,
                `Expected NO diagnostic on bare-identifier :Hide label-suffix; got: ${JSON.stringify(attrDiags)}`);
        });

        test('generalisation — :Trn suffix on bare-identifier label does NOT fire', () => {
            const doc = makeDoc([
                'MyWin WINDOW',
                "  CHECK('Foo'),AT(20,40),USE(Win_Element:Trn)",
                'END',
            ]);
            const tokens = tokenize(doc);
            const diagnostics = validateAttributeApplicability(tokens, doc);
            const attrDiags = diagnostics.filter(d => d.code === 'invalid-attribute-context');
            assert.strictEqual(attrDiags.length, 0,
                `Expected NO diagnostic on bare-identifier :Trn label-suffix; got: ${JSON.stringify(attrDiags)}`);
        });

        // Negative regression sentinel — load-bearing scope-fence per
        // feedback_bidirectional_pin_assertion. Without it, the fix could over-relax:
        // a real misapplied attribute (without the compound-label prefix shape) MUST
        // still fire. This mirrors #174's negative sentinel exactly — same control,
        // same attribute, same diagnostic.
        test('negative regression sentinel — genuinely misapplied EXTERNAL still fires on bare control', () => {
            const doc = makeDoc([
                'MyWin WINDOW',
                "  CHECK('OK'),EXTERNAL",
                'END',
            ]);
            const tokens = tokenize(doc);
            const diagnostics = validateAttributeApplicability(tokens, doc);
            const attrDiags = diagnostics.filter(d => d.code === 'invalid-attribute-context');
            assert.ok(attrDiags.length > 0,
                'Expected diagnostic for misapplied EXTERNAL on CHECK control (scope-fence — guard must NOT over-relax)');
            assert.ok(attrDiags.some(d => d.message.toUpperCase().includes('EXTERNAL')),
                `Diagnostic message must reference EXTERNAL; got: ${attrDiags.map(d => d.message).join(' | ')}`);
        });

        // Type-annotation regression coverage NOT included because option (b) doesn't
        // touch the tokenizer. The TypeAnnotation regression risk (load-bearing for
        // option (a)) is mitigated by construction here — the tokenizer's existing
        // behavior for `MyVar:BYTE` / `MyVar:LONG` / etc. is untouched by this fix.
        // Full server suite catches any incidental regression in tokenizer-driven
        // tests as a structural cross-check.
        //
        // If a future cycle adopts option (a) tokenizer-side fix (deferred via GH #176
        // architectural follow-up), explicit type-annotation regression coverage
        // becomes load-bearing and should land in `FieldEquateLabel.test.ts` or a new
        // tokenizer test file.

        // #174 symmetry verification — the `?`-prefixed case still passes after #175's
        // diagnostic-side guard lands. #174's tokenizer-side fix should be untouched by
        // this change. If this test regresses, #175's guard accidentally interferes with
        // the FieldEquateLabel single-token path.
        test('#174 symmetry — ?-prefixed compound label STILL captured as single FieldEquateLabel + no diagnostic', () => {
            const doc = makeDoc([
                'MyWin WINDOW',
                "  PROGRESS,AT(10,10,200,14),USE(?Prog)",
                "  STRING('Foo'),AT(20,30,,10),USE(?SL_Clients:External)",
                'END',
            ]);
            const tokens = tokenize(doc);
            const diagnostics = validateAttributeApplicability(tokens, doc);
            const attrDiags = diagnostics.filter(d => d.code === 'invalid-attribute-context');
            assert.strictEqual(attrDiags.length, 0,
                `#174 symmetry: ?-prefixed :External label-suffix must NOT fire (regression check); got: ${JSON.stringify(attrDiags)}`);
        });
    });

    // ─── #177 — Attribute as PREFIX of compound EQUATE (CREATE:Radio family) ─────
    // Symmetric partner of #175 — third instance of the compound-name false-positive
    // cluster.
    //
    // Real-user repros (Frame_AcctsMap.clw lines 3485, 3486, 7808):
    //   - EnhancedFocusManager.DisableControlType(CREATE:Radio)
    //   - EnhancedFocusManager.DisableControlType(CREATE:Check)
    //   - RegionBottomRightFEQ = CREATE(0,CREATE:Region)
    //
    // `CREATE:Radio` etc. are Clarion built-in EQUATE constants. The tokenizer
    // splits them as `Attribute(CREATE) + Delimiter(:) + WindowElement(Radio)`
    // because CREATE is in the attribute keyword list and Radio/Check/Region are
    // in the WindowElement keyword list. `validateAttributeApplicability` then
    // sees `Attribute(CREATE)`, infers an enclosing control context from the
    // adjacent WindowElement token, and fires the false-positive diagnostic.
    //
    // Fix shape: forward-direction symmetric guard added to AttributeDiagnostics
    // alongside #175's backward-direction guard. Skip Attribute tokens where the
    // FOLLOWING token is `:` and the token after that is a Variable / FieldEquateLabel /
    // WindowElement on the same line.
    //
    // Bidirectional-pin per feedback_bidirectional_pin_assertion:
    //   - Positive ×N: 3 real-user repros + 2 keyword-agnostic synthetic cases
    //   - Negative regression sentinel: genuinely misapplied CREATE on a non-FILE
    //     control STILL fires (scope-fence)
    //   - #174/#175 regression: prior fix surfaces still work
    suite('#177 — Attribute as PREFIX of compound EQUATE does NOT trigger false-positive diagnostics', () => {

        test('real-user repro — CREATE:Radio in function-call argument does NOT fire', () => {
            const doc = makeDoc([
                'MyProc PROCEDURE',
                '  CODE',
                '  EnhancedFocusManager.DisableControlType(CREATE:Radio)',
                '  RETURN',
            ]);
            const tokens = tokenize(doc);
            const diagnostics = validateAttributeApplicability(tokens, doc);
            const attrDiags = diagnostics.filter(d => d.code === 'invalid-attribute-context');
            assert.strictEqual(attrDiags.length, 0,
                `Expected NO diagnostic on CREATE:Radio compound EQUATE; got: ${JSON.stringify(attrDiags)}`);
        });

        test('real-user repro — CREATE:Check in function-call argument does NOT fire', () => {
            const doc = makeDoc([
                'MyProc PROCEDURE',
                '  CODE',
                '  EnhancedFocusManager.DisableControlType(CREATE:Check)',
                '  RETURN',
            ]);
            const tokens = tokenize(doc);
            const diagnostics = validateAttributeApplicability(tokens, doc);
            const attrDiags = diagnostics.filter(d => d.code === 'invalid-attribute-context');
            assert.strictEqual(attrDiags.length, 0,
                `Expected NO diagnostic on CREATE:Check compound EQUATE; got: ${JSON.stringify(attrDiags)}`);
        });

        test('real-user repro — CREATE:Region in assignment RHS does NOT fire', () => {
            const doc = makeDoc([
                'MyProc PROCEDURE',
                '  CODE',
                '  RegionBottomRightFEQ = CREATE(0,CREATE:Region)',
                '  RETURN',
            ]);
            const tokens = tokenize(doc);
            const diagnostics = validateAttributeApplicability(tokens, doc);
            const attrDiags = diagnostics.filter(d => d.code === 'invalid-attribute-context');
            assert.strictEqual(attrDiags.length, 0,
                `Expected NO diagnostic on CREATE:Region compound EQUATE; got: ${JSON.stringify(attrDiags)}`);
        });

        // Keyword-agnostic generalisation per Bob's spec — demonstrates the guard
        // isn't CREATE-specific. The Attribute keyword list has ~70 entries; only
        // a handful have common EQUATE forms in production Clarion (CREATE: being
        // the widespread one). These synthetic cases prove the guard catches any
        // Attribute:Identifier compound regardless of the specific keyword.
        test('generalisation — ICON:Custom compound EQUATE does NOT fire', () => {
            const doc = makeDoc([
                'MyProc PROCEDURE',
                '  CODE',
                '  MyVar = ICON:Custom',
                '  RETURN',
            ]);
            const tokens = tokenize(doc);
            const diagnostics = validateAttributeApplicability(tokens, doc);
            const attrDiags = diagnostics.filter(d => d.code === 'invalid-attribute-context');
            assert.strictEqual(attrDiags.length, 0,
                `Expected NO diagnostic on ICON:Custom compound EQUATE; got: ${JSON.stringify(attrDiags)}`);
        });

        test('generalisation — STATIC:Foo compound EQUATE does NOT fire', () => {
            const doc = makeDoc([
                'MyProc PROCEDURE',
                '  CODE',
                '  MyVar = STATIC:Foo',
                '  RETURN',
            ]);
            const tokens = tokenize(doc);
            const diagnostics = validateAttributeApplicability(tokens, doc);
            const attrDiags = diagnostics.filter(d => d.code === 'invalid-attribute-context');
            assert.strictEqual(attrDiags.length, 0,
                `Expected NO diagnostic on STATIC:Foo compound EQUATE; got: ${JSON.stringify(attrDiags)}`);
        });

        // Negative regression sentinel — load-bearing scope-fence per
        // feedback_bidirectional_pin_assertion. Without it, the forward-direction
        // guard could over-relax: genuinely misapplied CREATE on a non-FILE control
        // MUST still fire. CREATE has applicableTo:["FILE"]; BUTTON is in
        // VALIDATABLE_CONTROLS but doesn't match FILE — diagnostic should fire.
        test('negative regression sentinel — genuinely misapplied CREATE on BUTTON still fires', () => {
            const doc = makeDoc([
                'MyWin WINDOW',
                "  BUTTON('OK'),CREATE",
                'END',
            ]);
            const tokens = tokenize(doc);
            const diagnostics = validateAttributeApplicability(tokens, doc);
            const attrDiags = diagnostics.filter(d => d.code === 'invalid-attribute-context');
            assert.ok(attrDiags.length > 0,
                'Expected diagnostic for misapplied CREATE on BUTTON (scope-fence — forward-direction guard must NOT over-relax)');
            assert.ok(attrDiags.some(d => d.message.toUpperCase().includes('CREATE')),
                `Diagnostic message must reference CREATE; got: ${attrDiags.map(d => d.message).join(' | ')}`);
        });

        // #175 regression check — the suffix-direction guard from #175 should still
        // work after #177's forward-direction guard lands. If this test regresses,
        // #177's edit accidentally broke #175's coverage.
        test('#175 regression — bare-identifier :Suffix STILL suppressed (no false-positive on USE(Foo:External))', () => {
            const doc = makeDoc([
                'MyWin WINDOW',
                "  CHECK(' Filter'),AT(10,10),USE(RCFilter_SL_Clients:External)",
                'END',
            ]);
            const tokens = tokenize(doc);
            const diagnostics = validateAttributeApplicability(tokens, doc);
            const attrDiags = diagnostics.filter(d => d.code === 'invalid-attribute-context');
            assert.strictEqual(attrDiags.length, 0,
                `#175 regression: bare-identifier :External label-suffix must STILL be suppressed; got: ${JSON.stringify(attrDiags)}`);
        });

        // #174 regression check — the FieldEquateLabel-side tokenizer fix should also
        // remain undisturbed. The ?-prefixed compound case routes through a different
        // path (single-token capture at the tokenizer) but shares the no-diagnostic
        // outcome.
        test('#174 regression — ?-prefixed compound STILL suppressed (no false-positive on USE(?Foo:External))', () => {
            const doc = makeDoc([
                'MyWin WINDOW',
                "  PROGRESS,AT(10,10,200,14),USE(?Prog)",
                "  STRING('Foo'),AT(20,30,,10),USE(?SL_Clients:External)",
                'END',
            ]);
            const tokens = tokenize(doc);
            const diagnostics = validateAttributeApplicability(tokens, doc);
            const attrDiags = diagnostics.filter(d => d.code === 'invalid-attribute-context');
            assert.strictEqual(attrDiags.length, 0,
                `#174 regression: ?-prefixed :External label-suffix must STILL be suppressed; got: ${JSON.stringify(attrDiags)}`);
        });
    });

    // ─── #179 — getControlContextAt mis-infers control from a nearby CREATE:Region ─
    // Distinct bug class from #177. #177's single-line `RegionBottomRightFEQ =
    // CREATE(0,CREATE:Region)` test passes because the second CREATE (the EQUATE
    // suffix) is suppressed by the forward-direction guard and there is no OTHER
    // control nearby. But in real code (Frame_AcctsMap.clw 7772-7808) these
    // CREATE() calls appear in CONSECUTIVE blocks. The FIRST `CREATE` on each line
    // is the runtime CREATE *statement* (not the FILE attribute and not the EQUATE
    // suffix), tokenized as TokenType.Attribute. `getControlContextAt`'s multi-line
    // fallback then walks back ~10 lines, finds the `Region` WindowElement that is
    // the suffix of a PREVIOUS line's `CREATE:Region` EQUATE, and mistakes it for an
    // open REGION control declaration — so the diagnostic fires `'CREATE' is not
    // applicable to REGION`.
    //
    // Root-cause fix lives in `DocumentStructure.getControlContextAt`: a keyword
    // token that is the suffix of a `Prefix:Suffix` compound (immediately preceded
    // by `:`) is part of an EQUATE constant, never a control declaration, and must
    // not be treated as enclosing control context. Fix at the helper (not the
    // diagnostic) so every getControlContextAt consumer benefits; strictly more
    // conservative, so no risk of newly suppressing a real control context.
    //
    // Bidirectional pin per feedback_bidirectional_pin_assertion:
    //   - Positive: consecutive CREATE() calls in a code section → NO diagnostic
    //   - Negative sentinels: misapplied CREATE on a REAL BUTTON / REAL REGION
    //     declaration (control keyword NOT `:`-suffixed) STILL fires
    suite('#179 — standalone CREATE() function call near CREATE:Region EQUATE does NOT fire', () => {

        test('real-user repro — consecutive CREATE(0,CREATE:Region) blocks in a code section', () => {
            // Faithful to Frame_AcctsMap.clw 7772-7808: the multi-line fallback only
            // mis-fires when a prior CREATE:Region line is within the lookback window,
            // which a single isolated line (the #177 test) does not exercise.
            const doc = makeDoc([
                'MyProc PROCEDURE',
                '  CODE',
                '  RegionRightFEQ = CREATE(0,CREATE:Region)',
                '  IF RegionRightFEQ',
                '    UNHIDE(RegionRightFEQ)',
                '  END',
                '  RegionBottomFEQ = CREATE(0,CREATE:Region)',
                '  IF RegionBottomFEQ',
                '    UNHIDE(RegionBottomFEQ)',
                '  END',
                '  RegionTopFEQ = CREATE(0,CREATE:Region)',
                '  IF RegionTopFEQ',
                '    UNHIDE(RegionTopFEQ)',
                '  END',
                '  RETURN',
            ]);
            const tokens = tokenize(doc);
            const diagnostics = validateAttributeApplicability(tokens, doc);
            const attrDiags = diagnostics.filter(d => d.code === 'invalid-attribute-context');
            assert.strictEqual(attrDiags.length, 0,
                `Expected NO diagnostic on code-section CREATE() calls; got: ${JSON.stringify(attrDiags.map(d => d.message))}`);
        });

        test('tightest repro — two consecutive CREATE:Region lines', () => {
            const doc = makeDoc([
                'MyProc PROCEDURE',
                '  CODE',
                '  FeqA = CREATE(0,CREATE:Region)',
                '  FeqB = CREATE(0,CREATE:Region)',
                '  RETURN',
            ]);
            const tokens = tokenize(doc);
            const diagnostics = validateAttributeApplicability(tokens, doc);
            const attrDiags = diagnostics.filter(d => d.code === 'invalid-attribute-context');
            assert.strictEqual(attrDiags.length, 0,
                `Expected NO diagnostic on the second CREATE() (fallback must not pick up the prior line's :Region suffix); got: ${JSON.stringify(attrDiags.map(d => d.message))}`);
        });

        // Negative sentinel A — a misapplied CREATE on a REAL BUTTON control (the
        // control keyword is NOT `:`-suffixed) must STILL fire. Guards against the
        // fix over-relaxing into wholesale suppression.
        test('negative sentinel — misapplied CREATE on real BUTTON still fires', () => {
            const doc = makeDoc([
                'MyWin WINDOW',
                "  BUTTON('OK'),CREATE",
                'END',
            ]);
            const tokens = tokenize(doc);
            const diagnostics = validateAttributeApplicability(tokens, doc);
            const attrDiags = diagnostics.filter(d => d.code === 'invalid-attribute-context');
            assert.ok(attrDiags.length > 0,
                'misapplied CREATE on a real BUTTON must STILL fire after the getControlContextAt fix');
        });

        // Negative sentinel B — proves getControlContextAt still detects a REAL
        // REGION declaration (REGION at the start of the declaration, not `:`-suffixed).
        // A misapplied CREATE attribute on it must fire.
        test('negative sentinel — misapplied CREATE on real REGION declaration still fires', () => {
            const doc = makeDoc([
                'MyWin WINDOW',
                '  REGION,AT(0,0,100,100),CREATE',
                'END',
            ]);
            const tokens = tokenize(doc);
            const diagnostics = validateAttributeApplicability(tokens, doc);
            const attrDiags = diagnostics.filter(d => d.code === 'invalid-attribute-context');
            assert.ok(attrDiags.length > 0,
                'misapplied CREATE on a real REGION declaration must STILL fire — real control-context detection must survive the fix');
        });
    });
});
