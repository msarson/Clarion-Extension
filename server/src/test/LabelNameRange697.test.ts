/**
 * #697 (follows #689/#690) — Go to Definition to a label answered with an empty range at column 0:
 * the caret landed on the right line but nothing was selected, where a procedure (#689) and a
 * method (#690) select their name. Labels start in column 0, so the name's length is the whole
 * answer (the LSP's targetSelectionRange: "the range that should be selected and revealed ...
 * e.g the name of a function").
 */
import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Location } from 'vscode-languageserver-protocol';
import { TokenCache } from '../TokenCache';
import { setServerInitialized } from '../serverState';
import { FileRelationshipGraph } from '../FileRelationshipGraph';
import { DefinitionProvider } from '../providers/DefinitionProvider';
import { ClarionProjectServer } from '../solution/clarionProjectServer';
import { ClarionSourcerFileServer } from '../solution/clarionSourceFileServer';
import { SolutionManager } from '../solution/solutionManager';
import { serverSettings } from '../serverSettings';

suite('Go to Definition to a label selects its name (#697)', () => {
    let dir: string;
    let savedSm: SolutionManager | null;
    let savedRed: string;
    let savedLibsrc: string[];
    const docs = new Map<string, TextDocument>();

    const files: { [rel: string]: string } = {
        'Types.inc': [
            'IncEquate        EQUATE(5)',              // 0
            'RowQueueType     QUEUE,TYPE',             // 1
            'Field              LONG',                 // 2
            '                 END',                    // 3
            'Printable        INTERFACE',              // 4
            'Print              PROCEDURE',            // 5
            '                 END',                    // 6
        ].join('\r\n'),
        'prog.clw': [
            '  PROGRAM',                               // 0
            "  INCLUDE('Types.inc'),ONCE",             // 1
            '  MAP',                                   // 2
            'Worker PROCEDURE',                        // 3
            '  END',                                   // 4
            'MaxRows          EQUATE(100)',            // 5
            'GlobalCount      LONG',                   // 6
            'Rows             RowQueueType',           // 7
            'Shape            INTERFACE',              // 8
            'Draw               PROCEDURE',            // 9
            '                 END',                    // 10
            'Pen              &Shape',                 // 11
            'Doc              &Printable',             // 12
            '  CODE',                                  // 13
            '  GlobalCount = MaxRows + IncEquate',     // 14
            '  DO CountUp',                            // 15
            'CountUp          ROUTINE',                // 16
            '  GlobalCount += 1',                      // 17
            'Worker PROCEDURE',                        // 18
            'LocalTotal       LONG',                   // 19
            '  CODE',                                  // 20
            '  LocalTotal = GlobalCount',              // 21
        ].join('\r\n'),
        'Pens.clw': [
            '  MEMBER()',                                              // 0
            "  INCLUDE('Types.inc'),ONCE",                             // 1
            '  MAP',                                                   // 2
            '  END',                                                   // 3
            'BasePen          CLASS,TYPE',                             // 4
            'Init               PROCEDURE',                            // 5
            '                 END',                                    // 6
            'FancyPen         CLASS(BasePen),IMPLEMENTS(Printable)',   // 7
            'Init               PROCEDURE',                            // 8
            'Printable.Print    PROCEDURE',                            // 9
            '                 END',                                    // 10
            'BasePen.Init     PROCEDURE',                              // 11
            '  CODE',                                                  // 12
            'FancyPen.Init    PROCEDURE',                              // 13
            '  CODE',                                                  // 14
            '  PARENT.Init()',                                         // 15
            '  SELF.Init()',                                           // 16
            'FancyPen.Printable.Print PROCEDURE',                      // 17
            '  CODE',                                                  // 18
        ].join('\r\n'),
    };

    setup(async () => {
        setServerInitialized(true);
        savedSm = (SolutionManager as unknown as { instance: SolutionManager | null }).instance;
        savedRed = serverSettings.redirectionFile;
        savedLibsrc = serverSettings.libsrcPaths;
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'labelrange-'));
        fs.writeFileSync(path.join(dir, 'Clarion110.red'), '[Common]\r\n*.inc = .\r\n*.clw = .\r\n');
        serverSettings.redirectionFile = 'Clarion110.red';
        serverSettings.libsrcPaths = [];
        const tc = TokenCache.getInstance();
        tc.clearAllTokens();
        docs.clear();
        for (const [rel, content] of Object.entries(files)) {
            const full = path.join(dir, rel);
            fs.writeFileSync(full, content);
            const doc = TextDocument.create('file:///' + full.split(path.sep).join('/'), 'clarion', 1, content);
            tc.getTokens(doc);
            docs.set(rel, doc);
        }
        const project = new ClarionProjectServer('prog', 'app', dir, '{LABEL-RANGE}');
        for (const rel of Object.keys(files)) project.sourceFiles.push(new ClarionSourcerFileServer(rel, rel, project));
        (SolutionManager as unknown as { instance: SolutionManager | null }).instance = {
            solution: { projects: [project] },
            findProjectForFile: () => project,
            getProjectPathForFile: () => dir,
            getEquatesTokens: () => [],
            getEquatesPath: () => undefined,
            findFileWithExtension: () => null,
        } as unknown as SolutionManager;
        FileRelationshipGraph.getInstance().reset();
        await FileRelationshipGraph.getInstance().buildInBackground(Object.keys(files).map(rel => path.join(dir, rel)));
    });

    teardown(() => {
        (SolutionManager as unknown as { instance: SolutionManager | null }).instance = savedSm;
        FileRelationshipGraph.getInstance().reset();
        serverSettings.redirectionFile = savedRed;
        serverSettings.libsrcPaths = savedLibsrc;
        TokenCache.getInstance().clearAllTokens();
        try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best-effort */ }
    });

    const f12 = async (line: number, character: number, rel = 'prog.clw'): Promise<string> => {
        const r = await new DefinitionProvider().provideDefinition(docs.get(rel)!, { line, character });
        const loc = (Array.isArray(r) ? r[0] : r) as Location | null;
        if (!loc) return 'none';
        return `${path.basename(decodeURIComponent(loc.uri)).toLowerCase()}:${loc.range.start.line}:${loc.range.start.character}-${loc.range.end.character}`;
    };
    const at = (file: string, line: number, name: string) => `${file}:${line}:0-${name.length}`;

    test('bug-pin: an equate in the same file', async () => {
        assert.strictEqual(await f12(14, 17), at('prog.clw', 5, 'MaxRows'));
    });
    test('bug-pin: an equate in an included file', async () => {
        assert.strictEqual(await f12(14, 29), at('types.inc', 0, 'IncEquate'));
    });
    test('bug-pin: a global variable', async () => {
        assert.strictEqual(await f12(14, 4), at('prog.clw', 6, 'GlobalCount'));
    });
    test('bug-pin: a local variable', async () => {
        assert.strictEqual(await f12(21, 4), at('prog.clw', 19, 'LocalTotal'));
    });
    test('bug-pin: a ROUTINE label', async () => {
        assert.strictEqual(await f12(15, 6), at('prog.clw', 16, 'CountUp'));
    });
    test('bug-pin: a QUEUE type in an included file', async () => {
        assert.strictEqual(await f12(7, 20), at('types.inc', 1, 'RowQueueType'));
    });
    test('bug-pin: an INTERFACE in the same file', async () => {
        assert.strictEqual(await f12(11, 19), at('prog.clw', 8, 'Shape'));
    });
    test('bug-pin: an INTERFACE in an included file', async () => {
        assert.strictEqual(await f12(12, 19), at('types.inc', 4, 'Printable'));
    });
    test('bug-pin: a bare SELF is its class', async () => {
        assert.strictEqual(await f12(16, 3, 'Pens.clw'), at('pens.clw', 7, 'FancyPen'));
    });
    test('bug-pin: a bare PARENT is the parent class', async () => {
        assert.strictEqual(await f12(15, 3, 'Pens.clw'), at('pens.clw', 4, 'BasePen'));
    });
    test('bug-pin: the INTERFACE named by IMPLEMENTS', async () => {
        assert.strictEqual(await f12(7, 45, 'Pens.clw'), at('types.inc', 4, 'Printable'));
    });
});
