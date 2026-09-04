import * as assert from 'assert';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { HoverProvider } from '../providers/HoverProvider';
import { DefinitionProvider } from '../providers/DefinitionProvider';
import { CompletionProvider } from '../providers/CompletionProvider';
import { SignatureHelpProvider } from '../providers/SignatureHelpProvider';
import { setServerInitialized } from '../serverState';
import { TokenCache } from '../TokenCache';

/**
 * Clarion allows a literal ':' inside an identifier (MyOwn:CLASS, My:My:Method — a
 * common naming convention). A whole family of hand-rolled `\w`-only regexes across
 * this codebase assumed identifiers never contain one, and silently truncate at the
 * colon whenever they parse:
 *   (a) the ENCLOSING PROCEDURE's own declaration line, to learn what class SELF/
 *       PARENT means inside it ("ClassName.MethodName PROCEDURE") — breaks EVERY
 *       SELF./PARENT. access inside such a method, regardless of what's accessed;
 *   (b) the ACCESSED member name itself, after the dot (SELF.My:Value) — fixed for
 *       hover in HoverProvider.SelfColonPropertyAccess.test.ts; this file covers the
 *       sibling occurrences in F12, completion, and signature help.
 *
 * Real repro (found live, verified in the real IDE 2026-09-04):
 *   MyOwn:CLASS   CLASS
 *   my:Value        ULONG
 *   MyValue         LONG
 *   My:My:Method    PROCEDURE(),LONG
 *                 END
 *
 *   MyOwn:CLASS.My:My:Method PROCEDURE()
 *     CODE
 *        SELF.My:Value = 1        ! F12 jumped to an unrelated StringTheory.inc symbol
 *        SELF.MyValue  = 1        ! (colon-free control — proves it's the SCOPE line's
 *                                 !  colons at fault, not the accessed member's)
 *        SELF.My:My:Method()
 *        SELF.My                 ! completion suggested only the method, not either property
 *     RETURN(1)
 *
 * Fixed by widening every `\w` to `[\w:]` in the affected regexes (mechanical, no
 * control-flow change):
 *   - ClassMemberResolver.ts:300,619,683 (className-from-scope-line, 3 call sites)
 *   - ChainedPropertyResolver.ts:185 (same, backs SELF./PARENT. completion)
 *   - DefinitionProvider.ts:164 (methodMatch after dot, gates the whole F12 dot-access
 *     block — this is what actually caused the StringTheory.inc jump: it isn't the
 *     scope-line regex, it's this one truncating "My:Value" to "My" before the
 *     className lookup is even reached)
 *   - DefinitionProvider.ts:822 (structureMatch/fieldMatch, plain variable.field F12)
 *   - DefinitionProvider.ts:1271 (className-from-scope-line, F12's own copy)
 *   - SignatureHelpProvider.ts:318 (className-from-scope-line) and :199
 *     ([prefix.]methodName immediately before '(' — a different shape, same defect:
 *     "SELF.My:My:Method(" resolved methodName to "Method" only)
 *   - ImplementationProvider.ts:438,472 (methodMatch after dot, chained/self impl jump)
 *   - DefinitionProvider.ts:389, HoverProvider.ts:209, ReferencesProvider.ts:344
 *     (3-part Class.Interface.Method line — same shape, 3 call sites)
 *   - ClarionPatterns.ts METHOD_IMPLEMENTATION / _STRICT / _LEGACY (the shared
 *     constants backing DefinitionProvider/MethodHoverResolver/ImplementationProvider/
 *     ClassMemberResolver's OTHER, already-correct call sites)
 *
 * NOT covered here — PARENT.member resolution. `ClassMemberResolver
 * .findMemberInParentChain` resolves the parent class via `StructureDeclarationIndexer`,
 * a project-wide index that a lone in-memory test document is never registered into;
 * a colon-free PARENT.member control hits the identical "not found in index" path and
 * only succeeds by chance via an unrelated same-file bare-word fallback that a
 * colon-named member doesn't reach either. That's indistinguishable from a real
 * regression using only this harness — needs a live check in an actual indexed
 * solution, not a synthetic unit test.
 *
 * ALSO not covered — chained access (SELF.Something.member). Verified this returns
 * null on this branch's base REGARDLESS of colons (a colon-free control on the exact
 * same chain shape fails identically), so it isn't part of this defect family at all
 * — some other, not-yet-upstream fix apparently covers chained hover, unrelated to
 * anything touched here. Dropped the test rather than assert on a fix this PR doesn't
 * provide.
 */

let docCounter = 0;
function makeDoc(lines: string[]): TextDocument {
    const doc = TextDocument.create(`test://colon-scope-line-${++docCounter}.clw`, 'clarion', 1, lines.join('\n'));
    // SignatureHelpProvider (and others) read from TokenCache's cache directly and
    // do NOT lazily tokenize on a miss — prime it here so every test in this file
    // doesn't have to remember to.
    TokenCache.getInstance().getTokens(doc);
    return doc;
}

function lineOf(lines: string[], needle: string): number {
    return lines.findIndex(l => l.includes(needle));
}

suite('Colon in the enclosing scope line breaks SELF./PARENT. resolution family', () => {
    setup(() => {
        setServerInitialized(true);
        TokenCache.getInstance().clearAllTokens();
    });

    const CODE = [
        'MyOwn:CLASS   CLASS',
        'my:Value        ULONG',
        'MyValue         LONG',
        'My:My:Method    PROCEDURE(),LONG',
        '              END',
        '',
        'MyOwn:CLASS.My:My:Method PROCEDURE()',
        '  CODE',
        '     SELF.My:Value = 1',
        '     SELF.MyValue = 1',
        '     SELF.My:My:Method()',
        '  RETURN(1)',
    ];

    suite('F12 / Go to Definition', () => {
        test('SELF.My:Value (colon-named property) resolves to its own declaration, not an unrelated symbol', async () => {
            const doc = makeDoc(CODE);
            const lines = CODE;
            const line = lineOf(lines, 'SELF.My:Value = 1');
            const ch = lines[line].indexOf('My:Value');

            const def = await new DefinitionProvider().provideDefinition(doc, { line, character: ch });
            assert.ok(def, 'Expected a definition location for SELF.My:Value');
            const loc = Array.isArray(def) ? def[0] : def;
            assert.strictEqual(loc.range.start.line, 1, // "my:Value        ULONG"
                `Expected the property's own declaration line (1); got line ${loc.range.start.line}`);
        });

        // NOTE: this is a plain correctness check, not a fail-then-pass proof — in a
        // tiny single-symbol file, DefinitionProvider's bare-word-label fallback
        // (unrelated to the scope-line regex) happens to find "MyValue" correctly
        // even with the bug present, so this test passes either way. The claim that
        // the scope-line's OWN colons (not the accessed member's) are what break
        // resolution is proven for hover in HoverProvider.SelfColonPropertyAccess
        // .test.ts, where no such rescue path exists.
        test('SELF.MyValue (colon-free property, colon-named enclosing method) resolves correctly', async () => {
            const doc = makeDoc(CODE);
            const lines = CODE;
            const line = lineOf(lines, 'SELF.MyValue = 1');
            const ch = lines[line].indexOf('MyValue');

            const def = await new DefinitionProvider().provideDefinition(doc, { line, character: ch });
            assert.ok(def, 'Expected a definition location for SELF.MyValue');
            const loc = Array.isArray(def) ? def[0] : def;
            assert.strictEqual(loc.range.start.line, 2, // "MyValue         LONG"
                `Expected the property's own declaration line (2); got line ${loc.range.start.line}`);
        });

        test('SELF.My:My:Method() (colon-named method call) resolves to its own declaration', async () => {
            const doc = makeDoc(CODE);
            const lines = CODE;
            const line = lineOf(lines, 'SELF.My:My:Method()');
            const ch = lines[line].indexOf('My:My:Method');

            const def = await new DefinitionProvider().provideDefinition(doc, { line, character: ch });
            assert.ok(def, 'Expected a definition location for SELF.My:My:Method()');
            const loc = Array.isArray(def) ? def[0] : def;
            assert.strictEqual(loc.range.start.line, 3, // "My:My:Method    PROCEDURE(),LONG"
                `Expected the method's own declaration line (3); got line ${loc.range.start.line}`);
        });
    });

    suite('Completion after SELF.', () => {
        test('SELF.My lists all three colon-aware members, not just the one bare-word completion happens to see', async () => {
            const lines = [...CODE.slice(0, -1), '     SELF.My', 'RETURN(1)'];
            const doc = makeDoc(lines);
            // Exact match, not lineOf's `.includes()` — "     SELF.My" is a substring
            // of "     SELF.MyValue = 1" earlier in this same fixture.
            const line = lines.indexOf('     SELF.My');

            const items = await new CompletionProvider().onCompletion(
                { textDocument: { uri: doc.uri }, position: { line, character: lines[line].length } } as any,
                doc
            );
            const labels = items.map(i => i.label.toLowerCase());
            assert.ok(labels.some(l => l.startsWith('my:value')), `Expected my:Value in completions; got: ${items.map(i => i.label)}`);
            assert.ok(labels.some(l => l.startsWith('myvalue')), `Expected MyValue in completions; got: ${items.map(i => i.label)}`);
            assert.ok(labels.some(l => l.startsWith('my:my:method')), `Expected My:My:Method in completions; got: ${items.map(i => i.label)}`);

            // Discriminates real class-member completion from the bare-word-completion
            // fallback CompletionProvider silently drops to when chain resolution fails
            // (per its own doc comment at completeMemberAccess). The fallback ALSO
            // happens to surface the three names above in this tiny fixture — labels
            // alone don't prove which path answered — but only real member completion
            // sets insertText, and only the fallback would additionally list the CLASS
            // itself ("MyOwn:CLASS") as if it were one of its own members.
            assert.ok(items.every(i => typeof i.insertText === 'string' && i.insertText.length > 0),
                `Expected every item to carry insertText (real member completion); got: ${JSON.stringify(items)}`);
            assert.ok(!labels.includes('myown:class'.toLowerCase()) && !items.some(i => i.label.toLowerCase() === 'myown:class'),
                `Bare-word fallback would list the CLASS itself as a candidate; got: ${items.map(i => i.label)}`);
        });
    });

    suite('Signature help', () => {
        test('SELF.My:My:Method( shows the colon-named method\'s own parameters', async () => {
            const lines = [
                'MyOwn:CLASS   CLASS',
                'My:My:Method    PROCEDURE(LONG p1, STRING p2),LONG',
                '              END',
                '',
                'MyOwn:CLASS.My:My:Method PROCEDURE(LONG p1, STRING p2)',
                '  CODE',
                '     SELF.My:My:Method(',
                '  RETURN(1)',
            ];
            const doc = makeDoc(lines);
            const line = lineOf(lines, 'SELF.My:My:Method(');

            const sig = await new SignatureHelpProvider().provideSignatureHelp(doc, { line, character: lines[line].length });
            assert.ok(sig, 'Expected signature help for SELF.My:My:Method(');
            assert.ok(sig!.signatures[0].label.includes('My:My:Method'),
                `Expected the signature label to name the method; got: ${sig!.signatures[0].label}`);
            assert.strictEqual(sig!.signatures[0].parameters?.length, 2,
                `Expected both parameters; got: ${JSON.stringify(sig!.signatures[0].parameters)}`);
        });
    });

    suite('3-part interface implementation (Class.Interface.Method), colon-heavy names', () => {
        const IFACE_CODE = [
            'My:IFace   INTERFACE,TYPE',
            'My:Method    PROCEDURE',
            '           END',
            '',
            'My:Impl:CLASS   CLASS,IMPLEMENTS(My:IFace)',
            '              END',
            '',
            '  CODE',
            '',
            'My:Impl:CLASS.My:IFace.My:Method PROCEDURE',
            '  CODE',
            '  RETURN',
        ];

        test('hovering the interface segment shows the INTERFACE declaration', async () => {
            const doc = makeDoc(IFACE_CODE);
            const line = lineOf(IFACE_CODE, 'My:Impl:CLASS.My:IFace.My:Method');
            const ch = IFACE_CODE[line].indexOf('My:IFace');

            const hover = await new HoverProvider().provideHover(doc, { line, character: ch });
            assert.ok(hover, 'Expected hover on the 3-part line\'s interface segment');
            const text = (hover!.contents as any).value as string;
            assert.ok(text.includes('My:IFace') && /interface/i.test(text),
                `Expected the INTERFACE card for My:IFace; got: ${text}`);
        });

        test('F12 on the interface segment navigates to the INTERFACE declaration', async () => {
            const doc = makeDoc(IFACE_CODE);
            const line = lineOf(IFACE_CODE, 'My:Impl:CLASS.My:IFace.My:Method');
            const ch = IFACE_CODE[line].indexOf('My:IFace');

            const def = await new DefinitionProvider().provideDefinition(doc, { line, character: ch });
            assert.ok(def, 'Expected a definition for the 3-part line\'s interface segment');
            const loc = Array.isArray(def) ? def[0] : def;
            assert.strictEqual(loc.range.start.line, 0, // "My:IFace   INTERFACE,TYPE"
                `Expected the INTERFACE's own declaration line (0); got line ${loc.range.start.line}`);
        });
    });

    suite('Regression sentinel — ordinary colon-free classes are unaffected', () => {
        const PLAIN_CODE = [
            'PlainClass   CLASS',
            'PlainValue     ULONG',
            '             END',
            '',
            'PlainClass.DoWork PROCEDURE()',
            '  CODE',
            '     SELF.PlainValue = 1',
            '  RETURN',
        ];

        test('hover and F12 on a plain SELF.member still resolve correctly', async () => {
            const doc = makeDoc(PLAIN_CODE);
            const line = lineOf(PLAIN_CODE, 'SELF.PlainValue');
            const ch = PLAIN_CODE[line].indexOf('PlainValue');

            const hover = await new HoverProvider().provideHover(doc, { line, character: ch });
            assert.ok(hover, 'Expected hover on the plain SELF.member');
            assert.ok((hover!.contents as any).value.includes('PlainClass'));

            const def = await new DefinitionProvider().provideDefinition(doc, { line, character: ch });
            assert.ok(def, 'Expected a definition for the plain SELF.member');
            const loc = Array.isArray(def) ? def[0] : def;
            assert.strictEqual(loc.range.start.line, 1);
        });
    });
});
