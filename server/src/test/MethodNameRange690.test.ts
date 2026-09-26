/**
 * #690 (follows #689) — Go to Implementation (Ctrl+F12) to a method body selected something
 * different on each path: the whole signature line when the body was in the same file or read
 * from disk, nothing at all (0..0) when the body's file was already tokenised, and the cross-file
 * paths answered with a hand-built `file:///C:/` URI instead of the canonical form (#251).
 * A method body now selects its label, `Class.Method`, on every path, as a procedure's body does
 * since #689; and Go to Definition to the CLASS entry covers the member's name.
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
import { ImplementationProvider } from '../providers/ImplementationProvider';
import { ClarionProjectServer } from '../solution/clarionProjectServer';
import { ClarionSourcerFileServer } from '../solution/clarionSourceFileServer';
import { SolutionManager } from '../solution/solutionManager';
import { serverSettings } from '../serverSettings';

suite('Method locations cover the method name (#690)', () => {
    let dir: string;
    let savedSm: SolutionManager | null;
    let savedRed: string;
    let savedLibsrc: string[];
    const docs = new Map<string, TextDocument>();

    const files: { [rel: string]: string } = {
        'MyLongClass.inc': [
            "MyLongClass          CLASS,TYPE,MODULE('MyLongClass.clw'),LINK('MyLongClass.clw')", // 0
            'LongMethodName         PROCEDURE(LONG a)',                                           // 1
            'OtherLongMethod        PROCEDURE',                                                   // 2
            '                     END',                                                           // 3
        ].join('\r\n'),
        'MyLongClass.clw': [
            '  MEMBER()',                                   // 0
            "  INCLUDE('MyLongClass.inc'),ONCE",            // 1
            '  MAP',                                        // 2
            '  END',                                        // 3
            'MyLongClass.LongMethodName PROCEDURE(LONG a)', // 4
            '  CODE',                                       // 5
            '  SELF.OtherLongMethod()',                     // 6
            'MyLongClass.OtherLongMethod PROCEDURE',        // 7
            '  CODE',                                       // 8
        ].join('\r\n'),
        'prog.clw': [
            '  PROGRAM',                                    // 0
            "  INCLUDE('MyLongClass.inc'),ONCE",            // 1
            '  MAP',                                        // 2
            '  END',                                        // 3
            'Obj   MyLongClass',                            // 4
            '  CODE',                                       // 5
            '  Obj.LongMethodName(1)',                      // 6
        ].join('\r\n'),
    };

    setup(async () => {
        setServerInitialized(true);
        savedSm = (SolutionManager as unknown as { instance: SolutionManager | null }).instance;
        savedRed = serverSettings.redirectionFile;
        savedLibsrc = serverSettings.libsrcPaths;
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'methrange-'));
        fs.writeFileSync(path.join(dir, 'Clarion110.red'), '[Common]\r\n*.inc = .\r\n*.clw = .\r\n');
        serverSettings.redirectionFile = 'Clarion110.red';
        serverSettings.libsrcPaths = [dir];
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
        const project = new ClarionProjectServer('prog', 'app', dir, '{METH-RANGE}');
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

    const first = (r: unknown): Location => {
        const loc = (Array.isArray(r) ? r[0] : r) as Location | null;
        assert.ok(loc, 'a location');
        return loc!;
    };
    const where = (loc: Location) =>
        `${path.basename(decodeURIComponent(loc.uri)).toLowerCase()}:${loc.range.start.line}:${loc.range.start.character}-${loc.range.end.character}`;
    const ctrlF12 = async (rel: string, line: number, character: number) =>
        first(await new ImplementationProvider().provideImplementation(docs.get(rel)!, { line, character }));
    const f12 = async (rel: string, line: number, character: number) =>
        first(await new DefinitionProvider().provideDefinition(docs.get(rel)!, { line, character }));
    const BODY = 'MyLongClass.LongMethodName'.length;
    const OTHER_BODY = 'MyLongClass.OtherLongMethod'.length;

    test('bug-pin: Implementation to a body in another, tokenised file selects the label', async () => {
        assert.strictEqual(where(await ctrlF12('prog.clw', 6, 8)), `mylongclass.clw:4:0-${BODY}`);
    });

    test('bug-pin: Implementation to a body read from disk selects the label', async () => {
        TokenCache.getInstance().clearTokens(docs.get('MyLongClass.clw')!.uri);
        assert.strictEqual(where(await ctrlF12('prog.clw', 6, 8)), `mylongclass.clw:4:0-${BODY}`);
    });

    test('bug-pin: Implementation to a body in the same file selects the label', async () => {
        assert.strictEqual(where(await ctrlF12('MyLongClass.clw', 6, 9)), `mylongclass.clw:7:0-${OTHER_BODY}`);
    });

    test('bug-pin: Implementation to a body in another file answers with the canonical URI', async () => {
        const loc = await ctrlF12('prog.clw', 6, 8);
        assert.match(loc.uri, /^file:\/\/\/[a-z]%3A\//, `canonical (#251), got ${loc.uri}`);
    });

    test('Definition from a call to the CLASS entry covers the member name', async () => {
        assert.strictEqual(where(await f12('prog.clw', 6, 8)), `mylongclass.inc:1:0-${'LongMethodName'.length}`);
    });

    test('Definition from a body label to the CLASS entry covers the member name', async () => {
        assert.strictEqual(where(await f12('MyLongClass.clw', 4, 16)), `mylongclass.inc:1:0-${'LongMethodName'.length}`);
    });

    test('Definition from SELF.Method() to the CLASS entry covers the member name', async () => {
        assert.strictEqual(where(await f12('MyLongClass.clw', 6, 9)), `mylongclass.inc:2:0-${'OtherLongMethod'.length}`);
    });

    test('Definition to the CLASS entry answers with the canonical URI', async () => {
        const loc = await f12('prog.clw', 6, 8);
        assert.match(loc.uri, /^file:\/\/\/[a-z]%3A\//, `canonical (#251), got ${loc.uri}`);
    });
});
