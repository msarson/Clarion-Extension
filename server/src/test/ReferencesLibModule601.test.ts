/**
 * #601 — does Find All References reach a program's MEMBER modules for a procedure declared in
 * `MODULE('x.lib')`?
 *
 * A MAP `MODULE(...)` need not name a project source or a project DLL. Generated apps routinely name
 * a static library, or a module with no extension at all:
 *
 *     MODULE('ViewWizard.lib')
 *       vwLstMove(LONG,LONG),BYTE,PROC
 *     END
 *     MODULE('ReportWizard')
 *       UrPost(LONG),LONG
 *     END
 *
 * Neither resolves to a source file, so `getFilesToSearch` has no MODULE edges to follow, and
 * `resolveDllDefiningProject` keys off a DLL so the #330 tier-2 family cannot fire either. The
 * question is whether the search set then collapses to the declaring file, leaving calls in the
 * program's own MEMBER modules unfound.
 *
 * On ap1.sln this could not be answered: each of the 79 programs declaring `vwLstMove` calls it from
 * nowhere, so a single-file answer is correct there and proves nothing. That is the same corpus blind
 * spot #597 and #599 both hit — the shape we need is absent from everything we own. Hence a fixture.
 *
 * Raised from Mark's observation while triaging #600: "module can also define procedures that are
 * linked in through libs (non project dll's)".
 */
import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { TokenCache } from '../TokenCache';
import { setServerInitialized } from '../serverState';
import { FileRelationshipGraph } from '../FileRelationshipGraph';
import { ReferenceCountIndex } from '../services/ReferenceCountIndex';
import { ReferencesProvider } from '../providers/ReferencesProvider';
import { ClarionProjectServer } from '../solution/clarionProjectServer';
import { ClarionSourcerFileServer } from '../solution/clarionSourceFileServer';
import { SolutionManager } from '../solution/solutionManager';
import { StructureDeclarationIndexer } from '../utils/StructureDeclarationIndexer';
import { serverSettings } from '../serverSettings';

suite('FAR for a procedure declared in MODULE(x.lib) (#601)', () => {
    let dir: string;
    let savedSm: SolutionManager | null;
    let savedLibsrc: string[] = [];
    let savedRed: string;
    const docs = new Map<string, TextDocument>();

    const files: { [rel: string]: string } = {
        // The PROGRAM declares two library imports and one ordinary MODULE for its member.
        'parent.clw': [
            '  PROGRAM',                              // 0
            '  MAP',                                  // 1
            "    MODULE('ViewWizard.lib')",           // 2
            '      vwLstMove(LONG,LONG),BYTE,PROC',   // 3  static library
            '    END',                                // 4
            "    MODULE('ReportWizard')",             // 5
            '      UrPost(LONG),LONG',                // 6  no extension at all
            '    END',                                // 7
            "    MODULE('member.clw')",               // 8
            '      DoThing PROCEDURE()',              // 9  ordinary source MODULE — the control
            '    END',                                // 10
            '  END',                                  // 11
            '  CODE',                                 // 12
            '  DoThing()',                            // 13
            '  RETURN',                               // 14
        ].join('\r\n'),
        // A MEMBER module of that program, calling both library imports.
        'member.clw': [
            "  MEMBER('parent.clw')",                 // 0
            'DoThing PROCEDURE()',                    // 1
            '  CODE',                                 // 2
            '  vwLstMove(1,2)',                       // 3  call into the .lib import
            '  UrPost(7)',                            // 4  call into the extensionless import
            '  RETURN',                               // 5
        ].join('\r\n'),
        // A SECOND program declaring the same library import, with its own member calling it. This
        // is what makes the suite discriminating: in a two-file fixture "reaches the right member"
        // and "searches everything" are indistinguishable. On ap1.sln this is the real shape —
        // vwLstMove is declared independently in 79 programs, each resolving its own calls — so a
        // result that crossed into another program's member would be wrong, not generous.
        'other.clw': [
            '  PROGRAM',                              // 0
            '  MAP',                                  // 1
            "    MODULE('ViewWizard.lib')",           // 2
            '      vwLstMove(LONG,LONG),BYTE,PROC',   // 3  the SAME name, a different declaration
            '    END',                                // 4
            "    MODULE('othermember.clw')",          // 5
            '      OtherThing PROCEDURE()',           // 6
            '    END',                                // 7
            '  END',                                  // 8
            '  CODE',                                 // 9
            '  OtherThing()',                         // 10
            '  RETURN',                               // 11
        ].join('\r\n'),
        'othermember.clw': [
            "  MEMBER('other.clw')",                  // 0
            'OtherThing PROCEDURE()',                 // 1
            '  CODE',                                 // 2
            '  vwLstMove(9,9)',                       // 3  belongs to other.clw's declaration
            '  RETURN',                               // 4
        ].join('\r\n'),
    };

    setup(async () => {
        setServerInitialized(true);
        savedSm = (SolutionManager as unknown as { instance: SolutionManager | null }).instance;
        savedLibsrc = serverSettings.libsrcPaths;
        savedRed = serverSettings.redirectionFile;
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'far601-'));
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
        // TWO projects, because a Clarion project builds ONE program. Putting both PROGRAMs in one
        // project would be a configuration that cannot exist, and it is what the solution looks like
        // that decides whether another program's member is in scope — on ap1.sln the 79 programs
        // declaring vwLstMove are 79 separate projects.
        const projectA = new ClarionProjectServer('parent', 'app', dir, '{LIB-601-A}');
        for (const rel of ['parent.clw', 'member.clw']) projectA.sourceFiles.push(new ClarionSourcerFileServer(rel, rel, projectA));
        const projectB = new ClarionProjectServer('other', 'app', dir, '{LIB-601-B}');
        for (const rel of ['other.clw', 'othermember.clw']) projectB.sourceFiles.push(new ClarionSourcerFileServer(rel, rel, projectB));
        const projectOf = (file: string) => /other/i.test(path.basename(file)) ? projectB : projectA;
        (SolutionManager as unknown as { instance: SolutionManager | null }).instance = {
            solution: { projects: [projectA, projectB] },
            findProjectForFile: (file: string) => projectOf(file ?? ''),
            getProjectPathForFile: () => dir,
            getEquatesTokens: () => [],
            getEquatesPath: () => undefined,
            findFileWithExtension: () => null,
        } as unknown as SolutionManager;
        const seedPaths = Object.keys(files).map(rel => path.join(dir, rel));
        FileRelationshipGraph.getInstance().reset();
        await FileRelationshipGraph.getInstance().buildInBackground(seedPaths);
        ReferenceCountIndex.getInstance().reset();
        await ReferenceCountIndex.getInstance().buildInBackground(seedPaths);
        serverSettings.libsrcPaths = [dir];
        StructureDeclarationIndexer.getInstance().clearCache();
        await StructureDeclarationIndexer.getInstance().buildIndex(dir);
    });

    teardown(() => {
        (SolutionManager as unknown as { instance: SolutionManager | null }).instance = savedSm;
        FileRelationshipGraph.getInstance().reset();
        ReferenceCountIndex.getInstance().reset();
        StructureDeclarationIndexer.getInstance().clearCache();
        serverSettings.libsrcPaths = savedLibsrc;
        serverSettings.redirectionFile = savedRed;
        TokenCache.getInstance().clearAllTokens();
        try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best-effort */ }
    });

    /** "basename:line" for each reference, so a cross-file result is visible at a glance. */
    const keyed = (refs: { uri: string; range: { start: { line: number } } }[] | null | undefined): string[] =>
        (refs ?? []).map(r => `${path.basename(decodeURIComponent(r.uri)).toLowerCase()}:${r.range.start.line}`).sort();

    async function far(rel: string, line: number, character: number) {
        return new ReferencesProvider().provideReferences(docs.get(rel)!, { line, character }, { includeDeclaration: true });
    }

    test('the control: an ordinary source MODULE reaches the member', async () => {
        // DoThing is declared in MODULE('member.clw') and implemented there. If this failed, the
        // fixture would be wrong rather than the behaviour.
        const refs = keyed(await far('parent.clw', 9, 8));
        assert.ok(refs.some(r => r.startsWith('member.clw:')),
            `a source MODULE should reach its member, got ${JSON.stringify(refs)}`);
    });

    test("a .lib import's call in a MEMBER module is found", async () => {
        const refs = keyed(await far('parent.clw', 3, 8));
        assert.ok(refs.includes('member.clw:3'),
            `expected the call in member.clw:3, got ${JSON.stringify(refs)}`);
    });

    test('an extensionless MODULE import behaves the same as a .lib one', async () => {
        const refs = keyed(await far('parent.clw', 6, 8));
        assert.ok(refs.includes('member.clw:4'),
            `expected the call in member.clw:4, got ${JSON.stringify(refs)}`);
    });

    test('and from the call site, the declaration is reached', async () => {
        const refs = keyed(await far('member.clw', 3, 4));
        assert.ok(refs.includes('parent.clw:3'),
            `expected the declaration in parent.clw:3, got ${JSON.stringify(refs)}`);
    });

    test('but NOT another program\'s member — this is what makes the suite discriminating', async () => {
        // othermember.clw calls the same NAME, resolving against other.clw's own declaration of it.
        // Returning it would be wrong rather than generous: a library import is per-program, which
        // is exactly why FAR on ap1.sln correctly answers "one" for a program that declares
        // vwLstMove and never calls it. Without this assertion the three above would pass in a
        // fixture small enough that searching everything looks like searching correctly.
        const refs = keyed(await far('parent.clw', 3, 8));
        assert.ok(!refs.some(r => r.startsWith('othermember.clw:')),
            `another program's member must not be reported, got ${JSON.stringify(refs)}`);
    });
});
