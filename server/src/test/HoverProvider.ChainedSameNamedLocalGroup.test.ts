/**
 * Hover on a method reached through a field of a local GROUP - `Request.Payload.KeepOnly(...)`
 * where `Payload &TextClass` - when another procedure of the module declares a GROUP with the
 * same label.
 *
 * The chain walk (ChainedPropertyResolver.resolveFinalOwner) handed its first lookup the line only
 * for a CLASS root. A GROUP root went without one, so `Payload` was looked up in the module's
 * FIRST `Request GROUP`, which has no such field, and the hover was empty. A single-level
 * `Request.Payload` already read the GROUP the line sees (#830).
 */
import * as assert from 'assert';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Position } from 'vscode-languageserver-protocol';
import { HoverProvider } from '../providers/HoverProvider';
import { TokenCache } from '../TokenCache';
import { setServerInitialized } from '../serverState';
import { createDiskSolution, DiskSolution } from './support/diskSolutionFixture';

const INC = [
    "TextClass  CLASS,TYPE,MODULE('TextClass.clw')", // 0
    'KeepOnly     PROCEDURE(STRING pChars)',         // 1
    'Count        PROCEDURE(),LONG',                 // 2
    '           END',                                // 3
];

const CLW = [
    '  MEMBER()',                           // 0
    "  INCLUDE('classes.inc')",            // 1
    '  MAP',                                // 2
    '  END',                                // 3
    'FirstProc PROCEDURE',                  // 4
    'Request      GROUP',                   // 5
    'FirstOnly      LONG',                  // 6
    '             END',                     // 7
    '  CODE',                               // 8
    'SecondProc PROCEDURE',                 // 9
    'Request      GROUP',                   // 10
    'Payload        &TextClass',            // 11
    '             END',                     // 12
    'Direct     &TextClass',                // 13
    '  CODE',                               // 14
    "  Request.Payload.KeepOnly(',0123')",  // 15
    '  IF Request.Payload.Count() = 0',     // 16
    '  END',                                // 17
    "  Direct.KeepOnly(',0123')",           // 18
];

suite('Group.Field.Method hover reads the same-named GROUP the line sees', () => {
    let fx: DiskSolution;
    let doc: TextDocument;

    suiteSetup(() => {
        setServerInitialized(true);
        fx = createDiskSolution({ 'classes.inc': INC, 'caller.clw': CLW });
        doc = fx.open('caller.clw');
        TokenCache.getInstance().getTokens(doc);
    });
    suiteTeardown(() => fx.dispose());

    async function hoverAt(line: number, word: string, nth = 0): Promise<string> {
        let at = -1;
        for (let i = 0; i <= nth; i++) at = CLW[line].indexOf(word, at + 1);
        const h = await new HoverProvider().provideHover(doc, Position.create(line, at + 1));
        const c = h?.contents as { value?: string } | undefined;
        return c?.value ?? '';
    }

    test('CONTROL: a method of a plain reference variable has its card', async function () {
        this.timeout(10000);
        const card = await hoverAt(18, 'KeepOnly');
        assert.ok(card.includes('**KeepOnly**'), card);
    });

    test('a method reached through the field has its card', async function () {
        this.timeout(10000);
        const card = await hoverAt(15, 'KeepOnly');
        assert.ok(card.includes('**KeepOnly**') && card.includes('TextClass'), `KeepOnly: ${card}`);
    });

    test('a function reached through the field, inside an IF, has its card', async function () {
        this.timeout(10000);
        const card = await hoverAt(16, 'Count');
        assert.ok(card.includes('**Count**') && card.includes('TextClass'), `Count: ${card}`);
    });

    test('the field itself keeps its card', async function () {
        this.timeout(10000);
        const card = await hoverAt(15, 'Payload');
        assert.ok(card.includes('**Request.Payload**'), card);
    });
});
