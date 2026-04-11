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

    /**
     * Middle-segment cursor: cursor on "Order" in SELF.Order.MainKey.
     * getWordRangeAtPosition returns just "Order" (dot after → no prefix included).
     * ReferencesProvider must detect the preceding dot and reconstruct "SELF.Order".
     */
    test('Finds SELF.Member references when cursor is on middle segment of chained expression', async () => {
        const code = [
            "  MEMBER('Main')",            // line 0
            '',                             // line 1
            'MyClass.Init PROCEDURE',       // line 2
            '  CODE',                       // line 3
            '  SELF.Order.MainKey &= K',   // line 4 — cursor on "Order" here
            '  SELF.Order &= NULL',         // line 5 — plain (no trailing dot)
            '  RETURN',                     // line 6
        ].join('\n');

        const doc = createDocument(code, 'file:///middle-segment.clw');
        seedCache(doc);

        // Cursor on "Order" (col 7) in "  SELF.Order.MainKey &= K" — dot follows Order
        const refs = await provider.provideReferences(doc, { line: 4, character: 7 },
            { includeDeclaration: true });

        assert.ok(refs !== null, 'Should find references even with dot after cursor word');
        assert.ok(refs!.length >= 1, `Expected at least 1 reference, got ${refs?.length ?? 0}`);
        const refLines = refs!.map(r => r.range.start.line);
        assert.ok(refLines.includes(4) || refLines.includes(5),
            'Should find SELF.Order usage on line 4 or 5');
    });

    /**
     * Last-segment cursor on a 3-level chain: cursor on "Thumb" in SELF.Sort.Thumb.
     * getWordRangeAtPosition returns "Sort.Thumb" (dot before Sort).
     * ReferencesProvider must detect the preceding dot, reconstruct "SELF.Sort.Thumb",
     * and route to chained member resolution with beforeDot="SELF.Sort", member="Thumb".
     */
    test('Reconstructs SELF prefix for last segment of 3-level chain (SELF.Sort.Thumb)', async () => {
        const code = [
            "  MEMBER('Main')",              // line 0
            '',                               // line 1
            'MyClass.Init PROCEDURE',         // line 2
            '  CODE',                         // line 3
            '  SELF.Sort.Thumb &= NULL',     // line 4 — cursor on "Thumb"
            '  SELF.Sort.Thumb = 0',         // line 5 — another usage
            '  RETURN',                       // line 6
        ].join('\n');

        const doc = createDocument(code, 'file:///three-level.clw');
        seedCache(doc);

        // Cursor on "Thumb" at line 4, col 12 (after "  SELF.Sort.")
        const refs = await provider.provideReferences(doc, { line: 4, character: 12 },
            { includeDeclaration: true });

        // Even without class resolution, the word should be reconstructed to SELF.Sort.Thumb
        // and a best-effort search should find SELF.Sort.Thumb usages
        assert.ok(refs !== null, 'Should find SELF.Sort.Thumb usages via 3-level chain matching');
        const refLines = refs!.map(r => r.range.start.line);
        assert.ok(refLines.includes(4) || refLines.includes(5),
            `Should find SELF.Sort.Thumb usages on line 4 or 5, got lines: ${refLines.join(',')}`);
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

    // ─── class inheritance scoping ───────────────────────────────────────────

    test('SELF.Order in ClassB implementation is found when searching ClassA.Order (inheritance)', async () => {
        // All in one file: ClassA declares Order, ClassB inherits ClassA,
        // both implementations use SELF.Order — searching from ClassA.Order label
        // must find the usage in ClassB.Init as well.
        const code = [
            'ClassA CLASS,TYPE',         // line 0
            'Order    BYTE',             // line 1
            '         END',             // line 2
            'ClassB CLASS(ClassA),TYPE', // line 3
            '         END',             // line 4
            '',                          // line 5
            'ClassA.Init PROCEDURE',     // line 6
            '  CODE',                    // line 7
            '  SELF.Order = 1',          // line 8 — ClassA.Init usage
            '',                          // line 9
            'ClassB.Init PROCEDURE',     // line 10
            '  CODE',                    // line 11
            '  SELF.Order = 2',          // line 12 — ClassB.Init usage (inherited)
        ].join('\n');

        const doc = createDocument(code);
        seedCache(doc);

        // Cursor on "Order" declaration in ClassA body (line 1, col 0)
        const refs = await provider.provideReferences(doc, { line: 1, character: 0 },
            { includeDeclaration: true });

        assert.ok(refs !== null, 'Should find references for inherited member');
        const refLines = refs!.map(r => r.range.start.line);
        assert.ok(refLines.includes(8), 'Should find usage in ClassA.Init (line 8)');
        assert.ok(refLines.includes(12),
            `Should find usage in ClassB.Init (line 12) via inheritance — got lines: ${refLines.join(',')}`);
    });

    test('SELF.Order in ClassB.Init is NOT found when searching ClassA.Order if ClassB does not inherit ClassA', async () => {
        // ClassA and ClassB are unrelated; only ClassA.Init usage should match
        const code = [
            'ClassA CLASS,TYPE',     // line 0
            'Order    BYTE',         // line 1
            '         END',         // line 2
            'ClassB CLASS,TYPE',     // line 3  — no inheritance from ClassA
            'Order    BYTE',         // line 4
            '         END',         // line 5
            '',                      // line 6
            'ClassA.Init PROCEDURE', // line 7
            '  CODE',                // line 8
            '  SELF.Order = 1',      // line 9  — should match
            '',                      // line 10
            'ClassB.Init PROCEDURE', // line 11
            '  CODE',                // line 12
            '  SELF.Order = 2',      // line 13 — should NOT match
        ].join('\n');

        const doc = createDocument(code);
        seedCache(doc);

        // Cursor on "Order" declaration in ClassA body (line 1, col 0)
        const refs = await provider.provideReferences(doc, { line: 1, character: 0 },
            { includeDeclaration: true });

        assert.ok(refs !== null, 'Should find at least the ClassA.Init usage');
        const refLines = refs!.map(r => r.range.start.line);
        assert.ok(refLines.includes(9), 'Should find ClassA.Init usage on line 9');
        assert.ok(!refLines.includes(13),
            `ClassB.Init usage (line 13) should NOT appear when ClassB doesn't inherit ClassA — got lines: ${refLines.join(',')}`);
    });

    // ─── procedure implementation finding ───────────────────────────────────

    test('Find All References includes procedure implementations (ClassName.Method PROCEDURE)', async () => {
        // Searching for AddRelation should find:
        //   line 1  — declaration in CLASS body
        //   line 5  — first overload implementation  (AddRelation(RM))
        //   line 9  — second overload implementation (AddRelation(RM,UpdateMode,...))
        //   line 12 — SELF.AddRelation call site
        const code = [
            'MyClass CLASS,TYPE',                          // line 0
            'AddRelation  PROCEDURE(BYTE X),PROTECTED',   // line 1  — declaration
            '             PROCEDURE(BYTE X,BYTE Y)',      // line 2  — second overload declaration
            '             END',                           // line 3
            '',                                           // line 4
            'MyClass.AddRelation PROCEDURE(BYTE X)',      // line 5  — impl 1
            '  CODE',                                     // line 6
            '  RETURN',                                   // line 7
            '',                                           // line 8
            'MyClass.AddRelation PROCEDURE(BYTE X,BYTE Y)', // line 9  — impl 2 (overload)
            '  CODE',                                     // line 10
            '  RETURN',                                   // line 11
        ].join('\n');

        const doc = createDocument(code);
        seedCache(doc);

        // Cursor on "AddRelation" in CLASS body, line 1, col 0
        const refs = await provider.provideReferences(doc, { line: 1, character: 0 },
            { includeDeclaration: true });

        assert.ok(refs !== null, 'Should find references to AddRelation');
        const refLines = refs!.map(r => r.range.start.line);
        assert.ok(refLines.includes(1), 'Should find CLASS declaration (line 1)');
        assert.ok(refLines.includes(5), 'Should find first implementation (line 5)');
        assert.ok(refLines.includes(9), 'Should find second overload implementation (line 9)');
    });
});

// ---------------------------------------------------------------------------
// ReferencesProvider — QUEUE field dot-notation references
// ---------------------------------------------------------------------------

suite('ReferencesProvider – QUEUE field dot-notation', () => {
    let provider: ReferencesProvider;

    setup(() => {
        setServerInitialized(true);
        TokenCache.getInstance().clearAllTokens();
        provider = new ReferencesProvider();
    });

    test('Finds field references via dot notation (QZipF.ZipFileName)', async () => {
        // ZipQueueType is declared in an INC; here we inline it directly
        // to test the dot-notation reference scan in a single file
        const code = [
            'ZipQueueType    QUEUE,TYPE',   // line 0 — structure type
            'ZipFileName       CSTRING(256)',// line 1 — field
            'END',                           // line 2
            'MyProc  PROCEDURE()',           // line 3
            'QZipF     QUEUE(ZipQueueType)', // line 4 — local queue var
            'CODE',                          // line 5
            '  x = QZipF.ZipFileName',       // line 6 — reference
            '  QZipF.ZipFileName = "test"',  // line 7 — reference
            'END',                           // line 8
        ].join('\n');

        const doc = createDocument(code);
        seedCache(doc);

        // Position on "ZipFileName" in line 1 (the declaration, col 0)
        const refs = await provider.provideReferences(doc, { line: 1, character: 2 }, { includeDeclaration: true });
        assert.ok(refs !== null && refs.length >= 1, `Expected references, got ${refs?.length ?? 0}`);
        const refLines = refs!.map(r => r.range.start.line);
        assert.ok(refLines.includes(1), 'Should include declaration line');
        assert.ok(refLines.some(l => l === 6 || l === 7), 'Should find dot-notation references on lines 6 and 7');
    });

    test('Finds field reference in dot-notation from usage site', async () => {
        const code = [
            'ZipQueueType    QUEUE,TYPE',   // line 0
            'ZipFileName       CSTRING(256)',// line 1
            'END',                           // line 2
            'MyProc  PROCEDURE()',           // line 3
            'QZipF     QUEUE(ZipQueueType)', // line 4
            'CODE',                          // line 5
            '  x = QZipF.ZipFileName',       // line 6
            '  QZipF.ZipFileName = "test"',  // line 7
            'END',                           // line 8
        ].join('\n');

        const doc = createDocument(code);
        seedCache(doc);

        // Position on "ZipFileName" in the declaration (line 1, col 2) — field scope search
        const refs = await provider.provideReferences(doc, { line: 1, character: 2 }, { includeDeclaration: true });
        assert.ok(refs !== null && refs.length >= 2, `Expected >= 2 references, got ${refs?.length ?? 0}`);
        const refLines = refs!.map(r => r.range.start.line);
        assert.ok(refLines.includes(6) || refLines.includes(7), 'Should find dot-notation references on lines 6 or 7');
    });
});

// ---------------------------------------------------------------------------
// ReferencesProvider — LIKE typed variable
// ---------------------------------------------------------------------------

suite('ReferencesProvider – LIKE typed variable', () => {
    let provider: ReferencesProvider;

    setup(() => {
        setServerInitialized(true);
        TokenCache.getInstance().clearAllTokens();
        provider = new ReferencesProvider();
    });

    test('Finds references to variable declared with LIKE', async () => {
        const code = [
            'MyGroup GROUP,TYPE',        // line 0
            'Name      CSTRING(64)',     // line 1
            'END',                       // line 2
            'MyProc  PROCEDURE()',       // line 3
            'myVar   LIKE(MyGroup)',     // line 4 — LIKE declaration
            'CODE',                      // line 5
            '  myVar.Name = "hi"',       // line 6 — usage
            'END',                       // line 7
        ].join('\n');

        const doc = createDocument(code);
        seedCache(doc);

        // Position on "myVar" on line 4 (declaration)
        const refs = await provider.provideReferences(doc, { line: 4, character: 2 }, { includeDeclaration: true });
        assert.ok(refs !== null && refs.length >= 1, `Expected references for LIKE variable, got ${refs?.length ?? 0}`);
        const refLines = refs!.map(r => r.range.start.line);
        assert.ok(refLines.includes(4), 'Should include declaration');
        assert.ok(refLines.includes(6), 'Should find usage on line 6');
    });
});

// ---------------------------------------------------------------------------
// ReferencesProvider — local CLASS declaration label
// ---------------------------------------------------------------------------

suite('ReferencesProvider – local CLASS label references', () => {
    let provider: ReferencesProvider;

    setup(() => {
        setServerInitialized(true);
        TokenCache.getInstance().clearAllTokens();
        provider = new ReferencesProvider();
    });

    /**
     * When cursor is on the label of a local CLASS declaration (e.g. "ThisWindow"
     * in "ThisWindow  CLASS(BaseClass)"), FAR must find:
     *   - the label declaration itself (col 0)
     *   - method implementation headers  (ThisWindow.Init PROCEDURE …)
     *   - call/usage sites               (result = ThisWindow.Run())
     * It must NOT return the CLASS keyword position (col N > 0).
     */
    test('Cursor on local CLASS label finds method implementations and usages, not CLASS keyword', async () => {
        const code = [
            "  MEMBER('Main')",                       // line 0
            'Main PROCEDURE',                          // line 1
            'ThisWindow      CLASS(BaseClass)',         // line 2 — declaration  col 0
            'Init              PROCEDURE',              // line 3
            'Run               PROCEDURE,VIRTUAL',      // line 4
            'END',                                      // line 5
            'CODE',                                     // line 6
            '  result = ThisWindow.Run()',               // line 7 — usage
            'END',                                      // line 8
            '',                                         // line 9
            'ThisWindow.Init PROCEDURE',               // line 10 — implementation
            'CODE',                                     // line 11
            '  RETURN',                                 // line 12
            '',                                         // line 13
            'ThisWindow.Run PROCEDURE',                // line 14 — implementation
            'CODE',                                     // line 15
            '  RETURN',                                 // line 16
        ].join('\n');

        const doc = createDocument(code);
        seedCache(doc);

        // Cursor on "ThisWindow" at line 2, col 2 (inside the label)
        const refs = await provider.provideReferences(doc, { line: 2, character: 2 }, { includeDeclaration: true });

        assert.ok(refs !== null, 'Should return results, not null');
        assert.ok(refs!.length >= 1, `Expected at least 1 reference, got ${refs!.length}`);

        // All declaration/usage positions must be at col 0, NOT the CLASS keyword column
        const wrongColRefs = refs!.filter(r => r.range.start.character > 0 && r.range.start.line === 2);
        assert.strictEqual(wrongColRefs.length, 0,
            `References on declaration line should be at col 0, not CLASS keyword position. Got: ${JSON.stringify(wrongColRefs)}`);

        const refLines = refs!.map(r => r.range.start.line);
        assert.ok(refLines.includes(2), 'Should include the declaration line (col 0, not CLASS keyword col)');
        // line 7 is ThisWindow.Run() usage inside Main scope
        assert.ok(refLines.includes(7), `Should find usage on line 7. Lines found: ${refLines}`);
        // lines 10 and 14 are method implementation headers outside the procedure scope
        assert.ok(refLines.includes(10) && refLines.includes(14),
            `Should find method implementation headers at lines 10 and 14. Lines found: ${refLines}`);
    });
});
