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
});
