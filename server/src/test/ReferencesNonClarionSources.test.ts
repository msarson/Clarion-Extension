/**
 * Find All References never lists lines of a file that is not Clarion source.
 *
 * A MAP or CLASS MODULE may name an assembler source (`MODULE('helpers.a')`,
 * `CLASS,MODULE('asmhelp.a'),LINK('asmhelp.a')`), and a project may compile a C++ module
 * (a .cwproj Compile item, named by `MODULE('helper.cpp')`). The file graph keeps those
 * targets (their names are document links), and the search adds MODULE targets and project
 * items to its file set, so the assembler or C++ text was tokenized as Clarion and a word in
 * it was listed as a reference (`segment _TEXT(CODE, ...)` for a variable named Code). The
 * #484 guard that gives a DLL no tokens now covers these extensions too.
 */
import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { FileRelationshipGraph } from '../FileRelationshipGraph';
import { TokenCache } from '../TokenCache';
import { ReferencesProvider } from '../providers/ReferencesProvider';
import { SolutionManager } from '../solution/solutionManager';
import { serverSettings } from '../serverSettings';
import { setServerInitialized } from '../serverState';

suite('Find All References - no hits in assembler or C++ sources', () => {
    let projDir: string;
    let savedSm: SolutionManager | null;
    let savedRed: string;
    let savedLibsrc: string[];
    const f = (name: string) => path.join(projDir, name);
    const uriOf = (name: string) => 'file:///' + f(name).replace(/\\/g, '/');
    const write = (name: string, lines: string[]) => fs.writeFileSync(f(name), lines.join('\r\n') + '\r\n');

    const MAIN = [
        '  PROGRAM',                                   // 0
        "  INCLUDE('asmlib.inc'),ONCE",                // 1
        "  INCLUDE('globals.inc'),ONCE",               // 2
        '  MAP',                                       // 3
        "    MODULE('helpers.a')",                     // 4
        '      FastFill(LONG,LONG)',                   // 5
        '    END',                                     // 6
        "    MODULE('helper.cpp')",                    // 7
        '      CalcSum(LONG),LONG,C',                  // 8
        '    END',                                     // 9
        '  END',                                       // 10
        'Info       LIKE(InfoType)',                   // 11
        '  CODE',                                      // 12
        '  Info.Counter = CalcSum(Info.Counter)',      // 13 two uses
    ];
    // A field of a TYPE structure declared in an include that is no project item, as a class's
    // or a library's declarations are: the search then takes every project item and every
    // MODULE target.
    const GLOBALS = [
        'InfoType   GROUP,TYPE',                       // 0
        'Counter      LONG',                           // 1 declaration
        '           END',                              // 2
    ];

    setup(() => {
        setServerInitialized(true);
        savedSm = (SolutionManager as unknown as { instance: SolutionManager | null }).instance;
        savedRed = serverSettings.redirectionFile;
        savedLibsrc = serverSettings.libsrcPaths;
        serverSettings.redirectionFile = 'Clarion110.red';
        serverSettings.libsrcPaths = [];
        projDir = fs.mkdtempSync(path.join(os.tmpdir(), 'far-nonclarion-'));
        write('Clarion110.red', ['[Common]', '*.inc = .', '*.clw = .', '*.a = .', '*.cpp = .']);
        write('main.clw', MAIN);
        write('globals.inc', GLOBALS);
        write('asmlib.inc', [
            "AsmHelper CLASS,TYPE,MODULE('asmhelp.a'),LINK('asmhelp.a')",
            'Init       PROCEDURE()',
            '         END',
        ]);
        // Each one mentions Counter, as text a Clarion tokenizer would take for a name.
        write('helpers.a', ['  module helpers', '  segment _TEXT(CODE, USE32)', 'Counter dd 0', '  end']);
        write('asmhelp.a', ['  module asmhelp', '  segment _TEXT(CODE, USE32)', 'Counter dd 0', '  end']);
        write('helper.cpp', ['extern long Counter;', 'long CalcSum(long Counter) { return Counter + 1; }']);
        // The .cpp is a project Compile item, as a .cwproj lists one.
        const project = {
            name: 'NonClarionTest',
            path: projDir,
            sourceFiles: ['main.clw', 'helper.cpp'].map(n => ({ relativePath: n, getAbsolutePath: () => f(n) })),
            getRedirectionParser: () => ({ findFile: (name: string) => fs.existsSync(f(name)) ? { path: f(name), source: 'fixture' } : null }),
        };
        (SolutionManager as unknown as { instance: SolutionManager | null }).instance = {
            solution: { projects: [project] },
            findProjectForFile: (name: string) =>
                project.sourceFiles.some(s => s.relativePath.toLowerCase() === path.basename(name).toLowerCase()) ? project : undefined,
            getProjectPathForFile: () => projDir,
            getEquatesTokens: () => null,
            getEquatesPath: () => null,
        } as unknown as SolutionManager;
        TokenCache.getInstance().clearAllTokens();
        FileRelationshipGraph.getInstance().reset();
    });

    teardown(() => {
        (SolutionManager as unknown as { instance: SolutionManager | null }).instance = savedSm;
        serverSettings.redirectionFile = savedRed;
        serverSettings.libsrcPaths = savedLibsrc;
        TokenCache.getInstance().clearAllTokens();
        FileRelationshipGraph.getInstance().reset();
        try { fs.rmSync(projDir, { recursive: true, force: true }); } catch { /* best-effort */ }
    });

    test('a field named in assembler and C++ text: only its Clarion declaration and uses', async function () {
        this.timeout(20000);
        await FileRelationshipGraph.getInstance().buildInBackground([f('main.clw')]);
        const doc = TextDocument.create(uriOf('globals.inc'), 'clarion', 1, fs.readFileSync(f('globals.inc'), 'utf-8'));
        TokenCache.getInstance().getTokens(doc);

        const refs = await new ReferencesProvider().provideReferences(doc, { line: 1, character: 1 }, { includeDeclaration: true });
        const hits = [...new Set((refs ?? []).map(r => `${path.basename(decodeURIComponent(r.uri))}:${r.range.start.line}`))].sort();
        const nonClarion = hits.filter(h => /\.(a|cpp):/i.test(h));
        assert.deepStrictEqual(nonClarion, [], `no hit may be in an assembler or C++ file; got [${hits.join(' ')}]`);
        assert.deepStrictEqual(hits, ['globals.inc:1', 'main.clw:13'], `the Clarion declaration and uses stay; got [${hits.join(' ')}]`);
    });

    test('the file graph keeps the assembler MODULE targets (their names stay document links)', async function () {
        this.timeout(20000);
        const frg = FileRelationshipGraph.getInstance();
        await frg.buildInBackground([f('main.clw')]);
        const asm = frg.getModuleImplementationFiles().filter(p => /\.a$/i.test(p)).map(p => path.basename(p)).sort();
        assert.deepStrictEqual(asm, ['asmhelp.a', 'helpers.a']);
    });
});
