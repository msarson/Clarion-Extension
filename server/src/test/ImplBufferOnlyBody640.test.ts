/**
 * #640 - Go to Implementation, and hover's link to the body, find a method body that exists only
 * in the editor buffer: a body typed since the last save, or a file never saved.
 *
 * The typed-variable branch of Ctrl+F12 and hover's chained path hunted the body with
 * ClassMemberResolver.findImplementationCrossFile, which reads the current file from DISK. When
 * the body was only in the open document it found nothing, and Ctrl+F12 fell back to the
 * declaration. The SELF branch searches the open document and had no such gap.
 */
import * as assert from 'assert';
import { Location } from 'vscode-languageserver-protocol';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { TokenCache } from '../TokenCache';
import { ImplementationProvider } from '../providers/ImplementationProvider';
import { HoverProvider } from '../providers/HoverProvider';
import { setServerInitialized } from '../serverState';
import { createDiskSolution, DiskSolution } from './support/diskSolutionFixture';
import { hoverLocations } from './support/hoverDefinitionAgreement';

// What is saved on disk: the class, its callers, no bodies yet.
const SAVED = [
    '  MEMBER()',                                    // 0
    '  MAP',                                         // 1
    '  END',                                         // 2
    'Thing                CLASS,TYPE',               // 3
    'Show                   PROCEDURE()',            // 4
    'Pal                    &Thing',                 // 5
    '                     END',                      // 6
    'Browse PROCEDURE',                              // 7
    'Obj                  Thing',                    // 8
    'Holder               CLASS',                    // 9
    'Inner                  &Thing',                 // 10
    'Go                     PROCEDURE()',            // 11
    '                     END',                      // 12
    '  CODE',                                        // 13
    '  Obj.Show()',                                  // 14  typed variable
    'Holder.Go PROCEDURE()',                         // 15
    '  CODE',                                        // 16
    '  SELF.Inner.Show()',                           // 17  chained
];
// What is in the editor: the same, plus the body typed since the save.
const BUFFER = [
    ...SAVED,
    'Thing.Show PROCEDURE()',                        // 18  only in the buffer
    '  CODE',                                        // 19
];

suite('Go to Implementation finds a body that is only in the editor buffer (#640)', () => {
    let fx: DiskSolution;
    let doc: TextDocument;

    suiteSetup(() => {
        setServerInitialized(true);
        fx = createDiskSolution({ 'caller.clw': SAVED });
    });
    suiteTeardown(() => fx.dispose());
    setup(() => {
        doc = TextDocument.create(fx.uriOf('caller.clw'), 'clarion', 2, BUFFER.join('\r\n'));
        TokenCache.getInstance().clearTokens(doc.uri);
        TokenCache.getInstance().getTokens(doc);
    });

    const at = (line: number) => ({ line, character: BUFFER[line].indexOf('Show') + 1 });
    async function impl(line: number): Promise<number[]> {
        const res = await new ImplementationProvider().provideImplementation(doc, at(line));
        const list: Location[] = !res ? [] : Array.isArray(res) ? res : [res];
        return list.map(l => l.range.start.line);
    }
    async function hoverLines(line: number): Promise<number[]> {
        return hoverLocations(await new HoverProvider().provideHover(doc, at(line))).map(l => l.line);
    }

    test('Ctrl+F12 on Obj.Show() opens the body in the buffer', async () => {
        assert.deepStrictEqual(await impl(14), [18]);
    });
    test('Ctrl+F12 on SELF.Inner.Show() opens the body in the buffer', async () => {
        assert.deepStrictEqual(await impl(17), [18]);
    });
    test('hover on SELF.Inner.Show() links the declaration and the body in the buffer', async () => {
        assert.deepStrictEqual(await hoverLines(17), [4, 18]);
    });
});
