/**
 * `Request.` and `Request.Payload.` completion read the local GROUP the cursor's procedure
 * declares, when other procedures of the same module declare a GROUP with the same label.
 *
 * Member enumeration took the FIRST `Request GROUP` in the document, so in every procedure but
 * the first, `Request.` offered the first procedure's fields and `Request.Payload.` (a field the
 * first one does not have) offered nothing at all. The declaration a line sees is the nearest
 * one above it, as for a local CLASS (#608, #650).
 */
import * as assert from 'assert';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { CompletionProvider } from '../providers/CompletionProvider';
import { TokenCache } from '../TokenCache';
import { setServerInitialized } from '../serverState';
import { createDiskSolution, DiskSolution } from './support/diskSolutionFixture';

const INC = [
    "TextClass  CLASS,TYPE,MODULE('TextClass.clw')", // 0
    'GetValue     PROCEDURE(),STRING',              // 1
    '           END',                               // 2
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
    '  Request.',                           // 9  -> FirstOnly
    'SecondProc PROCEDURE',                 // 10
    'Request      GROUP',                   // 11
    'Kind           STRING(16)',            // 12
    'Payload        &TextClass',            // 13
    '             END',                     // 14
    '  CODE',                               // 15
    '  LOOP 1 TIMES',                       // 16
    '    Request.Payload.',                 // 17 -> GetValue
    '  END',                                // 18
    '  Request.',                           // 19 -> Kind, Payload
    'ThirdProc PROCEDURE',                  // 20
    'Request      GROUP',                   // 21
    'ThirdOnly      LONG',                  // 22
    '             END',                     // 23
    '  CODE',                               // 24
    '  RETURN',                             // 25
];

suite('obj. completion reads the same-named local GROUP of the procedure asking', () => {
    let fx: DiskSolution;
    let doc: TextDocument;

    suiteSetup(() => {
        setServerInitialized(true);
        fx = createDiskSolution({ 'classes.inc': INC, 'caller.clw': CLW });
        doc = fx.open('caller.clw');
        TokenCache.getInstance().getTokens(doc);
    });
    suiteTeardown(() => fx.dispose());

    async function labelsAt(line: number) {
        const params = {
            textDocument: { uri: doc.uri },
            position: { line, character: CLW[line].length },
            context: { triggerKind: 2, triggerCharacter: '.' },
        } as never;
        const items = await new CompletionProvider().onCompletion(params, doc);
        // A label carries the member's type after its name (`Kind STRING(16)`); compare names.
        return items.map(i => String(i.label).split(/\s+/)[0].toUpperCase());
    }

    test('CONTROL: the first procedure offers its own GROUP fields', async function () {
        this.timeout(10000);
        const names = await labelsAt(9);
        assert.ok(names.includes('FIRSTONLY'), `expected FirstOnly in [${names.join(', ')}]`);
        assert.ok(!names.includes('PAYLOAD'), `Payload must not appear in [${names.join(', ')}]`);
    });

    test('a later procedure offers its own GROUP fields, not the first one\'s', async function () {
        this.timeout(10000);
        const names = await labelsAt(19);
        assert.ok(names.includes('PAYLOAD') && names.includes('KIND'), `expected Kind and Payload in [${names.join(', ')}]`);
        assert.ok(!names.includes('FIRSTONLY'), `FirstOnly must not appear in [${names.join(', ')}]`);
    });

    test('a reference field of that GROUP offers its class members', async function () {
        this.timeout(10000);
        const names = await labelsAt(17);
        assert.ok(names.some(n => n.startsWith('GETVALUE')), `Request.Payload. must offer GetValue - got [${names.join(', ')}]`);
    });
});
