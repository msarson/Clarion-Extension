/**
 * #654 (#638 step 4) — `obj.` completion reads the receiver the way hover and Go to Definition
 * read it, through MemberLocatorService.resolveReceiverAt (#651).
 *
 * Completion's plain-word branch asked resolveVariableType first. That reads a local
 * `ThisWindow CLASS(BaseAlpha)` as a variable of type BaseAlpha (the #642 shape), so
 * `ThisWindow.` offered the parent's members and none of the local class's own.
 */
import * as assert from 'assert';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { CompletionProvider } from '../providers/CompletionProvider';
import { TokenCache } from '../TokenCache';
import { setServerInitialized } from '../serverState';
import { createDiskSolution, DiskSolution } from './support/diskSolutionFixture';

const INC = [
    'BaseAlpha  CLASS,TYPE',      // 0
    'AlphaOnly    PROCEDURE()',   // 1
    '           END',             // 2
];

const CLW = [
    '  MEMBER()',                       // 0
    "  INCLUDE('classes.inc')",        // 1
    '  MAP',                            // 2
    '  END',                            // 3
    'FirstProc PROCEDURE',              // 4
    'ThisWindow   CLASS(BaseAlpha)',    // 5
    'LocalOnly      PROCEDURE()',       // 6
    '             END',                 // 7
    'Plain      BaseAlpha',             // 8
    '  CODE',                           // 9
    '  ThisWindow.',                    // 10 -> LocalOnly and AlphaOnly
    '  Plain.',                         // 11 -> AlphaOnly only (control)
];

suite('obj. completion reads the receiver as hover and F12 do (#654)', () => {
    let fx: DiskSolution;
    let doc: TextDocument;

    suiteSetup(() => {
        setServerInitialized(true);
        fx = createDiskSolution({ 'classes.inc': INC, 'caller.clw': CLW });
        doc = fx.open('caller.clw');
        TokenCache.getInstance().getTokens(doc);
    });
    suiteTeardown(() => fx.dispose());

    async function membersAt(line: number) {
        const params = {
            textDocument: { uri: doc.uri },
            position: { line, character: CLW[line].length },
            context: { triggerKind: 2, triggerCharacter: '.' },
        } as never;
        const items = await new CompletionProvider().onCompletion(params, doc);
        return items.map(i => String(i.label).toUpperCase());
    }

    test('CONTROL: a variable of the class type offers the class members', async function () {
        this.timeout(10000);
        const names = await membersAt(11);
        assert.ok(names.some(n => n.startsWith('ALPHAONLY')), `expected AlphaOnly in [${names.join(', ')}]`);
        assert.ok(!names.some(n => n.startsWith('LOCALONLY')), `LocalOnly must not appear in [${names.join(', ')}]`);
    });

    test('a local CLASS(Parent) offers its own members as well as the parent\'s', async function () {
        this.timeout(10000);
        const names = await membersAt(10);
        assert.ok(names.some(n => n.startsWith('LOCALONLY')), `ThisWindow. must offer LocalOnly - got [${names.join(', ')}]`);
        assert.ok(names.some(n => n.startsWith('ALPHAONLY')), `ThisWindow. must offer inherited AlphaOnly - got [${names.join(', ')}]`);
    });
});
