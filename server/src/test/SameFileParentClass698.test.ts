/**
 * #698 — Go to Definition and hover on the parent's name in `Derived CLASS(Parent)` answered
 * nothing when Parent was declared in the same file; a parent declared in an included file worked.
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
import { HoverProvider } from '../providers/HoverProvider';
import { ClarionProjectServer } from '../solution/clarionProjectServer';
import { ClarionSourcerFileServer } from '../solution/clarionSourceFileServer';
import { SolutionManager } from '../solution/solutionManager';
import { serverSettings } from '../serverSettings';

suite('A parent CLASS declared in the same file (#698)', () => {
    let dir: string;
    let savedSm: SolutionManager | null;
    let savedRed: string;
    let savedLibsrc: string[];
    const docs = new Map<string, TextDocument>();

    const files: { [rel: string]: string } = {
        'Base.inc': [
            'IncBase          CLASS,TYPE',          // 0
            'Init               PROCEDURE',         // 1
            '                 END',                 // 2
        ].join('\r\n'),
        'Pens.clw': [
            '  MEMBER()',                           // 0
            "  INCLUDE('Base.inc'),ONCE",           // 1
            '  MAP',                                // 2
            '  END',                                // 3
            'BasePen          CLASS,TYPE',          // 4
            'Init               PROCEDURE',         // 5
            '                 END',                 // 6
            'FancyPen         CLASS(BasePen)',      // 7
            'Init               PROCEDURE',         // 8
            '                 END',                 // 9
            'IncPen           CLASS(IncBase)',      // 10
            'Init               PROCEDURE',         // 11
            '                 END',                 // 12
            'PlainBase        CLASS',               // 13
            'Run                PROCEDURE',         // 14
            '                 END',                 // 15
            'PlainKid         CLASS(PlainBase)',    // 16
            'Run                PROCEDURE',         // 17
            '                 END',                 // 18
            'Spare            BasePen',             // 19
            'RowGroup         GROUP,TYPE',          // 20
            'Id                 LONG',              // 21
            '                 END',                 // 22
            'Copy             LIKE(RowGroup)',      // 23
        ].join('\r\n'),
    };

    setup(async () => {
        setServerInitialized(true);
        savedSm = (SolutionManager as unknown as { instance: SolutionManager | null }).instance;
        savedRed = serverSettings.redirectionFile;
        savedLibsrc = serverSettings.libsrcPaths;
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'parent698-'));
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
        const project = new ClarionProjectServer('p', 'app', dir, '{PARENT-698}');
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

    const f12 = async (line: number, character: number): Promise<string> => {
        const r = await new DefinitionProvider().provideDefinition(docs.get('Pens.clw')!, { line, character });
        const loc = (Array.isArray(r) ? r[0] : r) as Location | null;
        if (!loc) return 'none';
        return `${path.basename(decodeURIComponent(loc.uri)).toLowerCase()}:${loc.range.start.line}:${loc.range.start.character}-${loc.range.end.character}`;
    };
    const hover = async (line: number, character: number): Promise<string> => {
        const h = await new HoverProvider().provideHover(docs.get('Pens.clw')!, { line, character });
        if (!h) return 'none';
        const c = h.contents as { value?: string } | string;
        return typeof c === 'string' ? c : (c.value ?? JSON.stringify(c));
    };

    test('precondition: an included parent answers', async () => {
        assert.strictEqual(await f12(10, 26), 'base.inc:0:0-7');
        assert.match(await hover(10, 26), /IncBase/);
    });

    test('bug-pin: F12 on a same-file CLASS,TYPE parent lands on its declaration', async () => {
        assert.strictEqual(await f12(7, 26), 'pens.clw:4:0-7');
    });

    test('bug-pin: hover on a same-file CLASS,TYPE parent shows its card', async () => {
        const text = await hover(7, 26);
        assert.match(text, /BasePen/, text);
        assert.match(text, /CLASS/, text);
    });

    test('bug-pin: a same-file parent that is not a TYPE answers too', async () => {
        assert.strictEqual(await f12(16, 26), 'pens.clw:13:0-9');
        assert.match(await hover(16, 26), /PlainBase/);
    });

    test('bug-pin: LIKE(Type) with the type in the same file, the same fast path', async () => {
        assert.strictEqual(await f12(23, 24), 'pens.clw:20:0-8');
    });

    test('a variable typed as a same-file class still answers', async () => {
        assert.strictEqual(await f12(19, 20), 'pens.clw:4:0-7');
    });
});
