/**
 * #689 / #690 — hover on a procedure whose MAP declaration is in the member's PROGRAM file (the
 * shape of #688). The card is built from the locations #689 and #690 changed (ranges, and the
 * canonical URI from CrossFileResolver.findMapDeclarationInMemberFile), so this pins what the
 * user sees: the declaration line in the card, and footer links that open the right file at the
 * right line. It passes on the code before #689 as well - that is the evidence hover was not
 * affected. (A link's URI spelling can differ within one card: HoverFormatter.toFileUri writes a
 * plain path as file:///c:/..., #389, while a canonical Location stays file:///c%3A/..., #251.
 * Both open the file; the spelling is not pinned here.)
 */
import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { TokenCache } from '../TokenCache';
import { setServerInitialized } from '../serverState';
import { FileRelationshipGraph } from '../FileRelationshipGraph';
import { HoverProvider } from '../providers/HoverProvider';
import { ClarionProjectServer } from '../solution/clarionProjectServer';
import { ClarionSourcerFileServer } from '../solution/clarionSourceFileServer';
import { SolutionManager } from '../solution/solutionManager';
import { serverSettings } from '../serverSettings';

suite('Procedure hover links to a declaration in the PROGRAM MAP (#689)', () => {
    let dir: string;
    let savedSm: SolutionManager | null;
    let savedRed: string;
    const docs = new Map<string, TextDocument>();

    const files: { [rel: string]: string } = {
        'prog.clw': [
            '   PROGRAM',                        // 0
            '',                                  // 1
            '   MAP',                            // 2
            "     MODULE('caller.clw')",         // 3
            '       Main',                       // 4
            '     END',                          // 5
            "     MODULE('impl.clw')",           // 6
            '       TargetLongProcName(LONG a)', // 7
            '     END',                          // 8
            '   END',                            // 9
            '',                                  // 10
            '  CODE',                            // 11
            '  Main()',                          // 12
        ].join('\r\n'),
        'caller.clw': [
            "   MEMBER('prog.clw')",             // 0
            '',                                  // 1
            'Main PROCEDURE',                    // 2
            '  CODE',                            // 3
            '  TargetLongProcName(1)',           // 4
        ].join('\r\n'),
        'impl.clw': [
            "   MEMBER('prog.clw')",             // 0
            '',                                  // 1
            'TargetLongProcName PROCEDURE(LONG a)', // 2
            '  CODE',                            // 3
            '  RETURN',                          // 4
        ].join('\r\n'),
    };

    setup(async () => {
        setServerInitialized(true);
        savedSm = (SolutionManager as unknown as { instance: SolutionManager | null }).instance;
        savedRed = serverSettings.redirectionFile;
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'prochover-'));
        fs.writeFileSync(path.join(dir, 'Clarion110.red'), '[Common]\r\n*.inc = .\r\n*.clw = .\r\n');
        serverSettings.redirectionFile = 'Clarion110.red';
        const tc = TokenCache.getInstance();
        tc.clearAllTokens();
        docs.clear();
        for (const [rel, content] of Object.entries(files)) {
            const full = path.join(dir, rel);
            fs.writeFileSync(full, content);
            // As VS Code sends them: lower-case drive, encoded colon.
            const uri = 'file:///' + full.split(path.sep).join('/').replace(/^([A-Za-z]):/, (_m, d: string) => `${d.toLowerCase()}%3A`);
            const doc = TextDocument.create(uri, 'clarion', 1, content);
            tc.getTokens(doc);
            docs.set(rel, doc);
        }
        const project = new ClarionProjectServer('prog', 'app', dir, '{PROC-HOVER}');
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

    async function card(rel: string, line: number, character: number): Promise<string> {
        const hover = await new HoverProvider().provideHover(docs.get(rel)!, { line, character });
        assert.ok(hover, `a hover at ${rel}:${line}:${character}`);
        const c = hover!.contents as { value?: string } | string;
        return typeof c === 'string' ? c : c.value ?? '';
    }
    /** Every markdown link in the card: [label](target). */
    const links = (md: string) => [...md.matchAll(/\[([^\]]+)\]\((file:[^)]+)\)/g)].map(m => ({ label: m[1], target: m[2] }));
    /** The link opens `rel` at 1-based `line`, whatever the URI's spelling. */
    const opens = (target: string, rel: string, line: number) => {
        const [uri, anchor] = target.split('#');
        const p = decodeURIComponent(uri.replace(/^file:\/\/\//i, '')).replace(/\//g, '\\').toLowerCase();
        assert.strictEqual(p, path.join(dir, rel).toLowerCase(), `${target} opens ${rel}`);
        assert.strictEqual(anchor, `L${line}`, `${target} opens line ${line}`);
    };

    test('hover on the implementation label shows the MAP line and links to it', async () => {
        const md = await card('impl.clw', 2, 3);
        assert.match(md, /TargetLongProcName\(LONG a\)/, 'the MAP declaration line is shown');
        const found = links(md);
        assert.deepStrictEqual(found.map(l => l.label.toLowerCase()), ['prog.clw:8'], 'only the declaration: the cursor is on the body');
        opens(found[0].target, 'prog.clw', 8);
    });

    test('hover on a call shows the MAP line and links the declaration and the body', async () => {
        const md = await card('caller.clw', 4, 5);
        assert.match(md, /TargetLongProcName\(LONG a\)/, 'the MAP declaration line is shown');
        const found = links(md);
        assert.deepStrictEqual(found.map(l => l.label.toLowerCase()), ['prog.clw:8', 'impl.clw:3'], md);
        opens(found[0].target, 'prog.clw', 8);
        opens(found[1].target, 'impl.clw', 3);
    });
});
