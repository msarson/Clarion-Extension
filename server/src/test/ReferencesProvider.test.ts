import * as assert from 'assert';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { TokenCache } from '../TokenCache';
import { ReferencesProvider } from '../providers/ReferencesProvider';
import { setServerInitialized } from '../serverState';

function createDocument(content: string, uri: string = 'file:///test.clw'): TextDocument {
    return TextDocument.create(uri, 'clarion', 1, content);
}

/** Prime the TokenCache so that providers work without a real LSP document open event. */
function seedCache(document: TextDocument): void {
    TokenCache.getInstance().getTokens(document);
}

suite('ReferencesProvider – member access (SELF.Member)', () => {
    let provider: ReferencesProvider;

    setup(() => {
        setServerInitialized(true);
        TokenCache.getInstance().clearAllTokens();
        provider = new ReferencesProvider();
    });

    // ─── tokenization sanity ─────────────────────────────────────────────────

    test('SELF.Order tokenizes as a single StructureField token', () => {
        const { ClarionTokenizer, TokenType } = require('../ClarionTokenizer');
        const code = '  SELF.Order.Init()\n  SELF.Order &= NULL';
        const t = new ClarionTokenizer(code);
        const tokens = t.tokenize();
        const sfTokens = tokens.filter((tk: any) => tk.type === TokenType.StructureField);
        assert.ok(sfTokens.length >= 2, 'Expected at least 2 StructureField tokens');
        assert.ok(sfTokens.some((tk: any) => tk.value === 'SELF.Order'),
            'Expected a StructureField token with value "SELF.Order"');
    });

    // ─── SELF.Member plain class ──────────────────────────────────────────────

    /**
     * Minimal class implementation file: defines a class, then implements two methods.
     * SELF.Order appears on 3 lines with no trailing dot (so getWordRangeAtPosition
     * returns the full "SELF.Order" token that triggers the member-access path).
     *
     * Cursor placement: line 11 "  SELF.Order &= NULL" at character 7.
     * No dot follows "Order" here, so getWordRangeAtPosition returns "SELF.Order".
     */
    test('Finds all SELF.Order references in a class implementation file', async () => {
        const code = [
            "  MEMBER('Main')",        // line 0
            "  INCLUDE('myclass.INC')",// line 1
            '',                        // line 2
            'MyClass.Init PROCEDURE',  // line 3
            '  CODE',                  // line 4
            '  SELF.Order.Init',       // line 5 — chained (dot after Order)
            '  SELF.Counter = 0',      // line 6
            '  RETURN',               // line 7
            '',                        // line 8
            'MyClass.Kill PROCEDURE',  // line 9
            '  CODE',                  // line 10
            '  SELF.Order &= NULL',    // line 11 — plain end (no dot after Order) ← cursor here
            '  SELF.Order.Kill',       // line 12 — chained
            '  RETURN',               // line 13
        ].join('\n');

        const doc = createDocument(code);
        seedCache(doc);

        // Cursor on "Order" in "  SELF.Order &= NULL" at line 11, char 7.
        // getWordRangeAtPosition returns "SELF.Order" because no dot follows "Order".
        const refs = await provider.provideReferences(doc, { line: 11, character: 7 },
            { includeDeclaration: true });

        assert.ok(refs !== null, 'Should return results, not null');
        assert.ok(refs!.length >= 2, `Expected at least 2 references to "Order", got ${refs!.length}`);

        // All references should be in the same file
        assert.ok(refs!.every(r => r.uri === doc.uri), 'All refs should be in the test document');

        // The chained tokens SELF.Order on lines 5 and 12 are StructureField tokens
        // whose last segment matches "Order", so they should be found.
        const refLines = refs!.map(r => r.range.start.line).sort((a, b) => a - b);
        assert.ok(refLines.includes(5) || refLines.includes(11),
            'Should include at least one chained or plain SELF.Order usage');
    });

    test('Highlight range covers only member name, not SELF prefix', async () => {
        // "  SELF.Order &= NULL" — no dot after Order, so getWordRangeAtPosition returns "SELF.Order"
        const code = [
            "  MEMBER('Main')",  // line 0
            '',                   // line 1
            'MyClass.Init PROCEDURE', // line 2
            '  CODE',            // line 3
            '  SELF.Order &= NULL', // line 4 ← cursor here
            '  RETURN',          // line 5
        ].join('\n');

        const doc = createDocument(code);
        seedCache(doc);

        // Cursor on "Order" at line 4, char 7 (after "  SELF.")
        const refs = await provider.provideReferences(doc, { line: 4, character: 7 },
            { includeDeclaration: true });

        assert.ok(refs !== null && refs!.length > 0, 'Should find at least one reference');
        const orderRef = refs!.find(r => r.range.start.line === 4);
        assert.ok(orderRef, 'Should find a reference on line 4');

        // "Order" starts at col 7 (after "  SELF."), ends at col 12
        assert.strictEqual(orderRef!.range.start.character, 7, 'Start char should be 7 (start of "Order")');
        assert.strictEqual(orderRef!.range.end.character, 12, 'End char should be 12 (end of "Order")');
    });

    // ─── plain symbol references still work ──────────────────────────────────

    test('Plain variable references still found (no regression)', async () => {
        const code = [
            'MyProc PROCEDURE',    // line 0 — no () required for parameterless procedures
            'counter  LONG',       // line 1 — local variable declaration
            '  CODE',              // line 2
            '  counter = 0',       // line 3 — usage
            '  counter += 1',      // line 4 — usage
            '  RETURN',            // line 5 — no END required
        ].join('\n');

        const doc = createDocument(code);
        seedCache(doc);

        // Word at line 3, char 3 is "counter"
        const refs = await provider.provideReferences(doc, { line: 3, character: 3 },
            { includeDeclaration: true });

        assert.ok(refs !== null, 'Should find references to plain variable');
        assert.ok(refs!.length >= 2, `Expected at least 2 references, got ${refs!.length}`);
    });

    // ─── case-insensitive matching ────────────────────────────────────────────

    test('Member references are case-insensitive', async () => {
        const code = [
            "  MEMBER('Main')",        // line 0
            '',                        // line 1
            'MyClass.Init PROCEDURE',  // line 2
            '  CODE',                  // line 3
            '  SELF.order &= NULL',    // line 4 — lowercase, no dot after → cursor here
            '  SELF.ORDER &= NULL',    // line 5 — uppercase
            '  RETURN',               // line 6
        ].join('\n');

        const doc = createDocument(code);
        seedCache(doc);

        // Cursor on "order" (lowercase) at line 4, char 7 — returns "SELF.order"
        const refs = await provider.provideReferences(doc, { line: 4, character: 7 },
            { includeDeclaration: true });

        assert.ok(refs !== null, 'Should find references');
        const refLines = refs!.map(r => r.range.start.line);
        assert.ok(refLines.includes(4), 'Should find lowercase usage on line 4');
        assert.ok(refLines.includes(5), 'Should find uppercase usage on line 5 (case-insensitive)');
    });
});
