/**
 * Adversarial regression check for the colon-prefix dot-access fix: makes sure
 * widening the backward word-scan / structureNameMatch regex to accept ':' does
 * NOT change behavior for the pre-existing, already-working colon scenario —
 * GROUP PRE(...) prefixed field access via dot notation — when it coexists in
 * the same file as the colon-prefixed global dot-access chain this PR fixes.
 *
 * Note: GROUP PRE(...) field access is unaffected by either change in this PR.
 * The dot-chain form (Config.Nested.Setting) is a plain Label/'.'/Label sequence
 * with no ':' anywhere in it, so the widened regexes never come into play.
 */
import * as assert from 'assert';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { HoverProvider } from '../providers/HoverProvider';
import { setServerInitialized } from '../serverState';

const CODE = `
   PROGRAM

HelperClass   CLASS
DoWork          PROCEDURE(LONG p1),LONG
              END

GLOB:Helper   &HelperClass

HelperClass.DoWork PROCEDURE(LONG p1)
  CODE
  RETURN p1
  END

MyProc PROCEDURE()
Config      GROUP,PRE(CFG)
Nested        GROUP,PRE(NST)
Setting         LONG
              END
            END
  CODE
  GLOB:Helper.DoWork(1)
  Config.Nested.Setting = 5
  END
`;

suite('Colon-prefix fix does not regress PRE() prefix / nested-group dot access', () => {
    setup(() => {
        setServerInitialized(true);
    });

    function lineOf(needle: string): number {
        return CODE.split('\n').findIndex(l => l.includes(needle));
    }

    test('nested PRE()\'d group field via full dot chain still resolves', async () => {
        const uri = 'test://NestedPreDotChain.clw';
        const document = TextDocument.create(uri, 'clarion', 1, CODE);
        const provider = new HoverProvider();

        const line = lineOf('Config.Nested.Setting = 5');
        const character = CODE.split('\n')[line].lastIndexOf('Setting');

        const hover = await provider.provideHover(document, { line, character });

        assert.ok(hover, 'Hover should resolve for Config.Nested.Setting');
        const value = (hover!.contents as any).value as string;
        assert.ok(value.includes('Setting'), `Hover should mention Setting (got: ${value})`);
    });

    test('colon-prefixed global method call in the same file still resolves (no crosstalk with PRE groups)', async () => {
        const uri = 'test://AdjacentColonGlobal.clw';
        const document = TextDocument.create(uri, 'clarion', 1, CODE);
        const provider = new HoverProvider();

        const line = lineOf('GLOB:Helper.DoWork(1)');
        const character = CODE.split('\n')[line].indexOf('DoWork');

        const hover = await provider.provideHover(document, { line, character });

        assert.ok(hover, 'Hover should resolve for GLOB:Helper.DoWork(1)');
        const value = (hover!.contents as any).value as string;
        assert.ok(value.includes('HelperClass'), `Hover should attribute to HelperClass (got: ${value})`);
    });
});
