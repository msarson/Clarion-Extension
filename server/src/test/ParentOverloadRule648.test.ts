/**
 * #648 - hover and Go to Definition on `PARENT.Method()` apply #611's overload rule: an
 * inherited overload the call fits is not hidden by a closer one it does not fit.
 *
 * The vendor's `ReportManager` declares only `Init(ProcessClass PC,<REPORT R>,<PrintPreviewClass
 * PV>)`, `PC` required, and every generated report's `ThisWindow.Init` calls `PARENT.Init()` with
 * no arguments. That compiles and runs the inherited `WindowManager.Init()`. `obj.Method()` and
 * `SELF.Method()` already honoured the rule (#611, #626); hover and F12 on `PARENT` did not, and
 * showed `ReportManager.Init`.
 */
import * as assert from 'assert';
import { Location } from 'vscode-languageserver-protocol';
import { HoverProvider } from '../providers/HoverProvider';
import { DefinitionProvider } from '../providers/DefinitionProvider';
import { ImplementationProvider } from '../providers/ImplementationProvider';
import { setServerInitialized } from '../serverState';
import { createDiskSolution, DiskSolution } from './support/diskSolutionFixture';
import { hoverLocations, definitionLocations } from './support/hoverDefinitionAgreement';

const INC = [
    "Base       CLASS,TYPE,MODULE('base.clw')",      // 0
    'Init         PROCEDURE(),BYTE,VIRTUAL',         // 1
    'Kill         PROCEDURE(),BYTE,VIRTUAL',         // 2
    '           END',                                // 3
    "Mid        CLASS(Base),TYPE,MODULE('base.clw')", // 4
    'Init         PROCEDURE(LONG a)',                // 5  does not fit a no-argument call
    'Kill         PROCEDURE(),BYTE,DERIVED',         // 6  fits
    '           END',                                // 7
];
const BASE = [
    '  MEMBER()',                                    // 0
    "  INCLUDE('base.inc')",                         // 1
    'Base.Init PROCEDURE()',                         // 2
    '  CODE',                                        // 3
    'Base.Kill PROCEDURE()',                         // 4
    '  CODE',                                        // 5
    'Mid.Init PROCEDURE(LONG a)',                    // 6
    '  CODE',                                        // 7
    'Mid.Kill PROCEDURE()',                          // 8
    '  CODE',                                        // 9
];
const CLW = [
    '  MEMBER()',                                    // 0
    "  INCLUDE('base.inc')",                         // 1
    '  MAP',                                         // 2
    '  END',                                         // 3
    'Browse PROCEDURE',                              // 4
    'ThisWindow           CLASS(Mid)',               // 5
    'Init                   PROCEDURE(),BYTE,DERIVED', // 6
    'Kill                   PROCEDURE(),BYTE,DERIVED', // 7
    '                     END',                      // 8
    '  CODE',                                        // 9
    'ThisWindow.Init PROCEDURE()',                   // 10
    '  CODE',                                        // 11
    '  RETURN PARENT.Init()',                        // 12  binds to Base.Init()
    'ThisWindow.Kill PROCEDURE()',                   // 13
    '  CODE',                                        // 14
    '  RETURN PARENT.Kill()',                        // 15  binds to Mid.Kill()
    '  PARENT.Init(1)',                              // 16  binds to Mid.Init(LONG a)
];

suite('Hover and F12 on PARENT.Method() apply the #611 overload rule (#648)', () => {
    let fx: DiskSolution;

    suiteSetup(() => {
        setServerInitialized(true);
        fx = createDiskSolution({ 'base.inc': INC, 'base.clw': BASE, 'caller.clw': CLW });
    });
    suiteTeardown(() => fx.dispose());

    const show = (l: { file: string; line: number }[]) => l.map(x => `${x.file.split('/').pop()}:${x.line}`);

    async function at(line: number, word: string) {
        const doc = fx.open('caller.clw');
        const col = CLW[line].lastIndexOf(word);
        assert.strictEqual(CLW[line].substr(col, word.length), word, 'fixture: cursor on the word');
        const position = { line, character: col + 1 };
        return {
            hover: show(hoverLocations(await new HoverProvider().provideHover(doc, position))),
            f12: show(definitionLocations(await new DefinitionProvider().provideDefinition(doc, position))),
            impl: show(definitionLocations(await new ImplementationProvider().provideImplementation(doc, position) as Location | null)),
        };
    }

    test('PARENT.Init() with no arguments: F12 goes to the inherited Base.Init()', async () => {
        assert.deepStrictEqual((await at(12, 'Init')).f12, ['base.inc:1']);
    });
    test('PARENT.Init() with no arguments: hover shows Base.Init() and its body', async () => {
        assert.deepStrictEqual((await at(12, 'Init')).hover, ['base.inc:1', 'base.clw:2']);
    });
    test('CONTROL: PARENT.Init() with no arguments: Ctrl+F12 opens Base.Init (since #643)', async () => {
        assert.deepStrictEqual((await at(12, 'Init')).impl, ['base.clw:2']);
    });
    test('CONTROL: PARENT.Kill(): the direct parent\'s fitting override, on all three', async () => {
        assert.deepStrictEqual(await at(15, 'Kill'), { hover: ['base.inc:6', 'base.clw:8'], f12: ['base.inc:6'], impl: ['base.clw:8'] });
    });
    test('CONTROL: PARENT.Init(1): the direct parent\'s Init(LONG a), on all three', async () => {
        assert.deepStrictEqual(await at(16, 'Init'), { hover: ['base.inc:5', 'base.clw:6'], f12: ['base.inc:5'], impl: ['base.clw:6'] });
    });
});
