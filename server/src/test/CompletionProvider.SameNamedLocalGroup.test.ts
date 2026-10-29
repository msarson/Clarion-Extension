/**
 * `Request.` and `Request.Payload.` completion read the GROUP the cursor's code sees, when other
 * procedures of the same module declare a GROUP with the same label.
 *
 * Member enumeration took the FIRST `Request GROUP` in the document, so in every procedure but
 * the first, `Request.` offered the first procedure's fields and `Request.Payload.` (a field the
 * first one does not have) offered nothing at all. A procedure's own local declaration answers,
 * in its ROUTINEs too; a procedure without one sees the module-level declaration, not another
 * procedure's local.
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
    'Request      GROUP',                   // 4  module-level
    'ModuleOnly     LONG',                  // 5
    '             END',                     // 6
    'FirstProc PROCEDURE',                  // 7
    'Request      GROUP',                   // 8
    'FirstOnly      LONG',                  // 9
    '             END',                     // 10
    '  CODE',                               // 11
    '  Request.',                           // 12 -> FirstOnly
    'SecondProc PROCEDURE',                 // 13
    'Request      GROUP',                   // 14
    'Kind           STRING(16)',            // 15
    'Payload        &TextClass',            // 16
    '             END',                     // 17
    '  CODE',                               // 18
    '  LOOP 1 TIMES',                       // 19
    '    Request.Payload.',                 // 20 -> GetValue
    '  END',                                // 21
    '  Request.',                           // 22 -> Kind, Payload
    '  DO Check',                           // 23
    'Check ROUTINE',                        // 24
    '  Request.',                           // 25 -> Kind, Payload (the procedure's local)
    'ThirdProc PROCEDURE',                  // 26
    '  CODE',                               // 27
    '  Request.',                           // 28 -> ModuleOnly
];

suite('obj. completion reads the same-named GROUP the cursor\'s code sees', () => {
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
        const names = await labelsAt(12);
        assert.ok(names.includes('FIRSTONLY'), `expected FirstOnly in [${names.join(', ')}]`);
        assert.ok(!names.includes('PAYLOAD') && !names.includes('MODULEONLY'), `only FirstOnly expected in [${names.join(', ')}]`);
    });

    test('a later procedure offers its own GROUP fields, not the first one\'s', async function () {
        this.timeout(10000);
        const names = await labelsAt(22);
        assert.ok(names.includes('PAYLOAD') && names.includes('KIND'), `expected Kind and Payload in [${names.join(', ')}]`);
        assert.ok(!names.includes('FIRSTONLY') && !names.includes('MODULEONLY'), `only Kind and Payload expected in [${names.join(', ')}]`);
    });

    test('a reference field of that GROUP offers its class members', async function () {
        this.timeout(10000);
        const names = await labelsAt(20);
        assert.ok(names.some(n => n.startsWith('GETVALUE')), `Request.Payload. must offer GetValue - got [${names.join(', ')}]`);
    });

    test('a ROUTINE offers its procedure\'s local GROUP fields', async function () {
        this.timeout(10000);
        const names = await labelsAt(25);
        assert.ok(names.includes('PAYLOAD') && names.includes('KIND'), `expected Kind and Payload in [${names.join(', ')}]`);
    });

    test('a procedure without its own GROUP offers the module-level one, not another procedure\'s', async function () {
        this.timeout(10000);
        const names = await labelsAt(28);
        assert.ok(names.includes('MODULEONLY'), `expected ModuleOnly in [${names.join(', ')}]`);
        assert.ok(!names.includes('KIND') && !names.includes('FIRSTONLY'), `another procedure's fields must not appear in [${names.join(', ')}]`);
    });
});
