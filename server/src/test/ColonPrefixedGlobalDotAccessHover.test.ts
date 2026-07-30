/**
 * Clarion allows a literal colon inside an identifier (e.g. GLOB:Thing), a common
 * naming convention for globals that is unrelated to GROUP/QUEUE PRE(...) prefixing.
 *
 * Two independent spots stripped that colon-prefixed segment when hovering a
 * property/method reached via dot access on such a variable:
 *   - TokenHelper.getWordRangeAtPosition's backward scan (building the hover "word")
 *   - StructureFieldResolver.resolveFieldAccess's structureNameMatch regex (extracting
 *     the receiver name to type-resolve)
 *
 * Either bug alone drops the "GLOB:" prefix down to "Thing", which then fails to
 * match the actual declared variable "GLOB:Thing" — so the receiver's type never
 * resolves and the member lookup silently returns no hover. A property access can
 * accidentally still show *something* via an unrelated bare-name fallback elsewhere
 * in the resolution ladder, which is why this went unnoticed for properties but not
 * for method calls (which have no such fallback).
 */
import * as assert from 'assert';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { HoverProvider } from '../providers/HoverProvider';
import { setServerInitialized } from '../serverState';

const CODE = `
   PROGRAM

HelperClass   CLASS
Prop            LONG
DoWork            PROCEDURE(LONG p1, LONG p2),LONG
              END

HelperClass.DoWork PROCEDURE(LONG p1, LONG p2)
  CODE
  RETURN p1 + p2

GLOB:Helper   &HelperClass

  CODE
  GLOB:Helper.Prop = 1
  GLOB:Helper.DoWork(1, 2)
`;

suite('Colon-prefixed global variable — dot-access hover', () => {
    setup(() => {
        setServerInitialized(true);
    });

    function lineOf(needle: string): number {
        return CODE.split('\n').findIndex(l => l.includes(needle));
    }

    test('hovering a METHOD reached via GLOB:Prefixed.Method(...) resolves the class member', async () => {
        const uri = 'test://ColonPrefixMethod.clw';
        const document = TextDocument.create(uri, 'clarion', 1, CODE);
        const provider = new HoverProvider();

        const line = lineOf('GLOB:Helper.DoWork(1, 2)');
        const character = CODE.split('\n')[line].indexOf('DoWork');

        const hover = await provider.provideHover(document, { line, character });

        assert.ok(hover, 'Hover should resolve for GLOB:Helper.DoWork(...)');
        const value = (hover!.contents as any).value as string;
        assert.ok(value.includes('DoWork'), `Hover should mention DoWork (got: ${value})`);
        assert.ok(value.includes('HelperClass'), `Hover should attribute the method to HelperClass (got: ${value})`);
    });

    test('hovering a PROPERTY reached via GLOB:Prefixed.Property resolves via the real class-member path', async () => {
        const uri = 'test://ColonPrefixProperty.clw';
        const document = TextDocument.create(uri, 'clarion', 1, CODE);
        const provider = new HoverProvider();

        const line = lineOf('GLOB:Helper.Prop = 1');
        const character = CODE.split('\n')[line].indexOf('Prop');

        const hover = await provider.provideHover(document, { line, character });

        assert.ok(hover, 'Hover should resolve for GLOB:Helper.Prop');
        const value = (hover!.contents as any).value as string;
        assert.ok(value.includes('Prop'), `Hover should mention Prop (got: ${value})`);
        assert.ok(value.includes('HelperClass'), `Hover should attribute the property to HelperClass (got: ${value})`);
    });
});
