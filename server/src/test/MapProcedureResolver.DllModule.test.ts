import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { ClarionTokenizer } from '../ClarionTokenizer';
import { DocumentStructure } from '../DocumentStructure';
import { MapProcedureResolver } from '../utils/MapProcedureResolver';
import { SolutionManager } from '../solution/solutionManager';

/**
 * #299 — F12 on a MAP declaration inside MODULE('*.dll') must navigate to the
 * cross-project implementation (Mark's repro: InitializeProgram declared in the
 * main app under MODULE('IBSUTILS.DLL'),DLL — implemented in the IBSUtils
 * project of the same solution; hover degraded gracefully, F12 did nothing).
 *
 * Root cause: findImplementationInModuleFile required redirection to resolve
 * the PHYSICAL .dll binary before it would even try the source-project
 * fallback (find the library's main CLW → walk its MAP → follow the real
 * MODULE('x.clw')). A DLL that isn't built — or whose output dir isn't in the
 * RED paths — dead-ended the whole chain, even though every source file
 * needed is right there in the solution.
 *
 * The fake SolutionManager models exactly that world: redirection resolves
 * source files in the fixture dir but NOT the .dll (it doesn't exist).
 */
suite('MapProcedureResolver — MODULE(*.dll) cross-project implementation (#299)', () => {

    let tmpDir: string;
    let savedInstance: unknown;

    suiteSetup(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'issue299-'));

        // The DLL app's main source: its MAP says where InitializeProgram really lives
        fs.writeFileSync(path.join(tmpDir, 'ibsutils.clw'), [
            '  PROGRAM',
            '',
            '  MAP',
            "    MODULE('IBSUTILS001.CLW')",
            'InitializeProgram      FUNCTION(*iniclass exeIni),BYTE',
            '    END',
            '  END',
            '  CODE',
            '  RETURN',
        ].join('\n'), 'utf8');

        // The generated module holding the implementation
        fs.writeFileSync(path.join(tmpDir, 'ibsutils001.clw'), [
            "  MEMBER('ibsutils.clw')",
            '',
            '  MAP',
            '  END',
            'InitializeProgram      FUNCTION(*iniclass exeIni),BYTE',
            '  CODE',
            '  RETURN 1',
        ].join('\n'), 'utf8');

        // Fake solution: one library project. Redirection resolves fixture source
        // files by basename but NOT the .dll — it was never built.
        const fakeRedParser = {
            findFile: (filename: string) => {
                const candidate = path.join(tmpDir, filename.toLowerCase());
                return fs.existsSync(candidate) ? { path: candidate, source: 'test' } : null;
            }
        };
        const fakeSolution = {
            projects: [{
                name: 'IBSUtils',
                path: tmpDir,
                sourceFiles: [
                    { name: 'ibsutils.clw', relativePath: 'ibsutils.clw' },
                    { name: 'ibsutils001.clw', relativePath: 'ibsutils001.clw' },
                ],
                getRedirectionParser: () => fakeRedParser,
            }]
        };
        savedInstance = (SolutionManager as any).instance;
        (SolutionManager as any).instance = { solution: fakeSolution };
    });

    suiteTeardown(() => {
        (SolutionManager as any).instance = savedInstance;
        try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
    });

    test("F12 on the MAP declaration under MODULE('IBSUTILS.DLL') lands on the implementation in ibsutils001.clw", async function () {
        this.timeout(10000);

        const mainCode = [
            '  PROGRAM',                                                        // 0
            '',                                                                  // 1
            '  MAP',                                                             // 2
            "    MODULE('IBSUTILS.DLL')",                                       // 3
            'InitializeProgram      FUNCTION(*iniclass exeIni),BYTE,DLL',       // 4 — F12 here
            '    END',                                                           // 5
            '  END',                                                             // 6
            '  CODE',
            '  RETURN',
        ].join('\n');
        const mainDoc = TextDocument.create('file:///test-299-main.clw', 'clarion', 1, mainCode);
        const tokens = new ClarionTokenizer(mainCode).tokenize();
        const docStructure = new DocumentStructure(tokens);
        docStructure.process();

        const resolver = new MapProcedureResolver();
        const result = await resolver.findProcedureImplementation(
            'InitializeProgram',
            tokens,
            mainDoc,
            { line: 4, character: 2 },
            mainCode.split('\n')[4],
            docStructure
        );

        assert.ok(result,
            "expected F12 on InitializeProgram (declared under MODULE('IBSUTILS.DLL')) to resolve the " +
            'cross-project implementation — the physical DLL does not exist, so the resolver must go ' +
            "via the library's main source, not the binary");
        assert.ok(result!.uri.toLowerCase().includes('ibsutils001.clw'),
            `expected the implementation location in ibsutils001.clw; got: ${result!.uri}`);
        // Implementation line: 'InitializeProgram FUNCTION(...)' at line 4 of ibsutils001.clw
        assert.strictEqual(result!.range.start.line, 4,
            `expected the implementation line (4) in ibsutils001.clw; got line ${result!.range.start.line}`);
    });
});
