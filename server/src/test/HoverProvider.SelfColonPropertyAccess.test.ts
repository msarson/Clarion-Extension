/**
 * Clarion allows a literal colon inside an identifier (e.g. My:Value), a common
 * naming convention for class members. StructureFieldResolver.resolveFieldAccess
 * extracts the member name AFTER the dot with a `\w+` regex, which stops at the
 * colon — so "SELF.My:Value" truncates to "My", which then mismatches the
 * correctly-extracted "My:Value" token and the whole resolver bails to null.
 *
 * This is the mirror case of the colon-BEFORE-the-dot bug fixed for receivers
 * in ColonPrefixedGlobalDotAccessHover.test.ts (colon-prefixed GLOB:Thing) —
 * here the colon is in the member name AFTER the dot, reached via SELF.
 *
 * NOTE: the enclosing PROCEDURE's own declared name is deliberately kept
 * colon-free here (MyClass.DoWork, not e.g. MyClass.My:My:Method). A colon in
 * the enclosing procedure's OWN name trips a separate, deeper bug in
 * ClassMemberResolver.findClassMemberInfo's scope/className detection
 * ("Could not determine className") — unrelated to this fix, not addressed
 * here, and would mask/confound this regression test if mixed in.
 */
import * as assert from 'assert';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { HoverProvider } from '../providers/HoverProvider';
import { setServerInitialized } from '../serverState';

const CODE = `
   PROGRAM

MyClass   CLASS
my:Value          ULONG
DoWork            PROCEDURE(),LONG
My:My:Method      PROCEDURE(),LONG
              END

MyClass.DoWork PROCEDURE()
  CODE
  SELF.My:Value = 1
  SELF.My:My:Method()
  RETURN(1)
`;

suite('Colon-named class member — SELF. dot-access hover', () => {
    setup(() => {
        setServerInitialized(true);
    });

    function lineOf(needle: string): number {
        return CODE.split('\n').findIndex(l => l.includes(needle));
    }

    test('hovering a colon-named PROPERTY reached via SELF.My:Value resolves the class member', async () => {
        const uri = 'test://SelfColonProperty.clw';
        const document = TextDocument.create(uri, 'clarion', 1, CODE);
        const provider = new HoverProvider();

        const line = lineOf('SELF.My:Value = 1');
        const character = CODE.split('\n')[line].indexOf('My:Value');

        const hover = await provider.provideHover(document, { line, character });

        assert.ok(hover, 'Hover should resolve for SELF.My:Value');
        const value = (hover!.contents as any).value as string;
        assert.ok(value.includes('My:Value') || value.toLowerCase().includes('my:value'),
            `Hover should mention My:Value (got: ${value})`);
        assert.ok(value.includes('ULONG'), `Hover should show the ULONG type (got: ${value})`);
    });

    test('hovering a colon-named METHOD reached via SELF.My:My:Method() resolves the class member', async () => {
        const uri = 'test://SelfColonMethod.clw';
        const document = TextDocument.create(uri, 'clarion', 1, CODE);
        const provider = new HoverProvider();

        const line = lineOf('SELF.My:My:Method()');
        const character = CODE.split('\n')[line].indexOf('My:My:Method');

        const hover = await provider.provideHover(document, { line, character });

        assert.ok(hover, 'Hover should resolve for SELF.My:My:Method()');
        const value = (hover!.contents as any).value as string;
        assert.ok(value.includes('My:My:Method') || value.toLowerCase().includes('my:my:method'),
            `Hover should mention My:My:Method (got: ${value})`);
    });
});
