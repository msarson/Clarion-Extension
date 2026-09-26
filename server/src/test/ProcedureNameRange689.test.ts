/**
 * #689 (noticed in #688) — Go to Definition between a MAP declaration and a procedure's
 * implementation returned a range that missed the name: `{ character: 0 } .. { character:
 * token.value.length }`, where the implementation's token is the PROCEDURE keyword (so a
 * 22-character label came back as 0-9), and a MAP line's range started at column 0 whatever its
 * indentation. F12 from an implementation label to the PROGRAM MAP also answered with a hand-built
 * `file:///C:/` URI instead of the canonical form every other location uses (#251).
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

suite('Go to Definition covers the procedure name (#689)', () => {
    let dir: string;
    let savedSm: SolutionManager | null;
    let savedRed: string;
    const docs = new Map<string, TextDocument>();

    const files: { [rel: string]: string } = {
        'prog.clw': [
            '   PROGRAM',                                  // 0
            '',                                            // 1
            '   MAP',                                      // 2
            "     MODULE('impl.clw')",                     // 3
            '       ShorthandLongProcName',                // 4  shorthand form, name at column 7
            '       KeywordLongProcName PROCEDURE(LONG)',  // 5  keyword form, label at column 7
            '     END',                                    // 6
            '       SameFileLongProcName',                 // 7  implemented in this file
            '   END',                                      // 8
            '',                                            // 9
            '  CODE',                                      // 10
            '  ShorthandLongProcName()',                   // 11
            '',                                            // 12
            'SameFileLongProcName PROCEDURE',              // 13
            '  CODE',                                      // 14
        ].join('\r\n'),
        'impl.clw': [
            "   MEMBER('prog.clw')",                       // 0
            '',                                            // 1
            'ShorthandLongProcName PROCEDURE',             // 2
            '  CODE',                                      // 3
            '',                                            // 4
            'KeywordLongProcName PROCEDURE(LONG a)',       // 5
            '  CODE',                                      // 6
        ].join('\r\n'),
    };

    setup(async () => {
        setServerInitialized(true);
        savedSm = (SolutionManager as unknown as { instance: SolutionManager | null }).instance;
        savedRed = serverSettings.redirectionFile;
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'procrange-'));
        fs.writeFileSync(path.join(dir, 'Clarion110.red'), '[Common]\r\n*.inc = .\r\n*.clw = .\r\n');
        serverSettings.redirectionFile = 'Clarion110.red';
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
        const project = new ClarionProjectServer('prog', 'app', dir, '{PROC-RANGE}');
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
        TokenCache.getInstance().clearAllTokens();
        try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best-effort */ }
    });

    async function f12(rel: string, line: number, character: number): Promise<Location> {
        const def = await new DefinitionProvider().provideDefinition(docs.get(rel)!, { line, character });
        const loc = (Array.isArray(def) ? def[0] : def) as Location | null;
        assert.ok(loc, `a definition from ${rel}:${line}:${character}`);
        return loc!;
    }
    const where = (loc: Location) =>
        `${path.basename(decodeURIComponent(loc.uri)).toLowerCase()}:${loc.range.start.line}:${loc.range.start.character}-${loc.range.end.character}`;
    const len = (s: string) => s.length;

    test('bug-pin: MAP shorthand line to the implementation covers the label', async () => {
        assert.strictEqual(where(await f12('prog.clw', 4, 10)), `impl.clw:2:0-${len('ShorthandLongProcName')}`);
    });

    test('bug-pin: MAP keyword-form line to the implementation covers the label', async () => {
        assert.strictEqual(where(await f12('prog.clw', 5, 10)), `impl.clw:5:0-${len('KeywordLongProcName')}`);
    });

    test('bug-pin: MAP line to an implementation in the same file covers the label', async () => {
        assert.strictEqual(where(await f12('prog.clw', 7, 10)), `prog.clw:13:0-${len('SameFileLongProcName')}`);
    });

    test('bug-pin: implementation label to a shorthand MAP line covers the name where it is', async () => {
        assert.strictEqual(where(await f12('impl.clw', 2, 3)), `prog.clw:4:7-${7 + len('ShorthandLongProcName')}`);
    });

    test('bug-pin: implementation label to a keyword-form MAP line covers the label where it is', async () => {
        assert.strictEqual(where(await f12('impl.clw', 5, 3)), `prog.clw:5:7-${7 + len('KeywordLongProcName')}`);
    });

    test('bug-pin: implementation label to the PROGRAM MAP answers with the canonical URI', async () => {
        const loc = await f12('impl.clw', 2, 3);
        assert.match(loc.uri, /^file:\/\/\/[a-z]%3A\//, `canonical (#251), got ${loc.uri}`);
    });
});
