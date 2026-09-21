/**
 * #628 (#609 phase 3 step C2) — `PARENT.` completion must use the parent of the local class the
 * method belongs to.
 *
 * A module may declare the same local class label in more than one procedure — every
 * generated procedure has its own `ThisWindow` — so "the parent of ThisWindow" depends on
 * which procedure the cursor is in. #608 established that for hover and Go to Definition,
 * which resolve it through `ClassMemberResolver.getParentClassInfo`: that reads the
 * declaration NEAREST ABOVE the cursor.
 *
 * Completion resolves it through `MemberLocatorService.resolveParentName`, which reads the
 * FIRST matching declaration in the document and knows nothing about the cursor line. So in
 * the second procedure it offers the first procedure's parent's members.
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
    'BaseBeta   CLASS,TYPE',      // 3
    'BetaOnly     PROCEDURE()',   // 4
    '           END',             // 5
];

const CLW = [
    '  MEMBER()',                       // 0
    "  INCLUDE('classes.inc')",        // 1
    '  MAP',                            // 2
    '  END',                            // 3
    'FirstProc PROCEDURE',              // 4
    'ThisWindow   CLASS(BaseAlpha)',    // 5
    'Init           PROCEDURE()',       // 6
    '             END',                 // 7
    '  CODE',                           // 8
    'ThisWindow.Init PROCEDURE',        // 9
    '  CODE',                           // 10
    '  PARENT.',                        // 11  -> must offer AlphaOnly
    'SecondProc PROCEDURE',             // 12
    'ThisWindow   CLASS(BaseBeta)',     // 13
    'Init           PROCEDURE()',       // 14
    '             END',                 // 15
    '  CODE',                           // 16
    'ThisWindow.Init PROCEDURE',        // 17
    '  CODE',                           // 18
    '  PARENT.',                        // 19  -> must offer BetaOnly
];

suite('PARENT. completion uses the nearest local class (#628)', () => {
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

    test('CONTROL: in the first procedure PARENT. offers the first parent', async function () {
        this.timeout(10000);
        const names = await membersAt(11);
        assert.ok(names.some(n => n.startsWith('ALPHAONLY')), `expected AlphaOnly in [${names.join(', ')}]`);
        assert.ok(!names.some(n => n.startsWith('BETAONLY')), `BetaOnly must not appear in [${names.join(', ')}]`);
    });

    test('in the second procedure PARENT. offers the second parent', async function () {
        this.timeout(10000);
        const names = await membersAt(19);
        assert.ok(
            names.some(n => n.startsWith('BETAONLY')),
            `PARENT. in SecondProc must offer BaseBeta's members — got [${names.join(', ')}]`
        );
        assert.ok(
            !names.some(n => n.startsWith('ALPHAONLY')),
            `PARENT. in SecondProc must NOT offer BaseAlpha's members — got [${names.join(', ')}]`
        );
    });
});
