/**
 * #624 (#609 phase 3 step B2) — the upward inheritance walk must resolve each ancestor
 * in the asking file's project.
 *
 * `MemberLocatorService.accessFilter` decides whether the caller is a subclass of
 * the class being enumerated, and it is the ONE ascent that looked the caller up
 * with an unscoped `sdi.find(name)`. Every other ascent uses
 * `sdi.findFor(name, fromFile)` (#571), which consults the index of the project
 * that compiles the asking file first.
 *
 * `find(name)` with no project iterates the project indexes and returns the first
 * that carries the name — i.e. whichever project index happened to be built first.
 * So when two projects in one solution each declare a class of the same name, the
 * access decision can be taken against the OTHER project's class.
 *
 * Shape here (a generated multi-app solution: several apps, same class names,
 * different hierarchies):
 *   project B, indexed first:  Worker CLASS            — no parent
 *   project A, indexed second: Worker CLASS(BaseThing) — derives from BaseThing
 *
 * Asking from a file in A, "is Worker a subclass of BaseThing?" must be yes.
 * With the unscoped lookup it is answered against B's Worker, which has no parent,
 * so the answer is no and every inherited PROTECTED member is filtered out of
 * completion, signature help and the discarded-return check.
 */

import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { TokenCache } from '../TokenCache';
import { setServerInitialized } from '../serverState';
import { MemberLocatorService } from '../services/MemberLocatorService';
import { ClarionProjectServer } from '../solution/clarionProjectServer';
import { ClarionSourcerFileServer } from '../solution/clarionSourceFileServer';
import { SolutionManager } from '../solution/solutionManager';
import { StructureDeclarationIndexer } from '../utils/StructureDeclarationIndexer';
import { serverSettings } from '../serverSettings';

suite('accessFilter resolves the caller in the asking file\'s project (#624)', () => {
    let root: string;
    let aDir: string;
    let bDir: string;
    let savedSm: SolutionManager | null;
    let savedLibsrc: string[] = [];
    let savedRed = '';
    let docA: TextDocument;
    let svc: MemberLocatorService;

    // Project B — indexed FIRST. Its Worker has no parent.
    const bFiles: { [rel: string]: string } = {
        'bshared.inc': [
            'Worker              CLASS,TYPE',
            'RunB                  PROCEDURE()',
            '                    END',
        ].join('\r\n'),
    };

    // Project A — indexed second. Its Worker DOES derive from BaseThing.
    const aFiles: { [rel: string]: string } = {
        'ashared.inc': [
            'BaseThing           CLASS,TYPE',
            'PubMethod             PROCEDURE()',
            'ProtMethod            PROCEDURE(),PROTECTED',
            '                    END',
            '',
            'Worker              CLASS(BaseThing),TYPE',
            'Go                    PROCEDURE()',
            '                    END',
        ].join('\r\n'),
        'a.clw': [
            '  PROGRAM',
            "  INCLUDE('ashared.inc'),ONCE",
            '  MAP',
            '  END',
            '  CODE',
            '  RETURN',
        ].join('\r\n'),
    };

    setup(async () => {
        setServerInitialized(true);
        savedSm = (SolutionManager as unknown as { instance: SolutionManager | null }).instance;
        root = fs.mkdtempSync(path.join(os.tmpdir(), 'accfilter609-'));
        aDir = path.join(root, 'A');
        bDir = path.join(root, 'B');
        fs.mkdirSync(aDir, { recursive: true });
        fs.mkdirSync(bDir, { recursive: true });

        const tc = TokenCache.getInstance();
        tc.clearAllTokens();
        const write = (baseDir: string, map: { [rel: string]: string }) => {
            for (const [rel, content] of Object.entries(map)) {
                const p = path.join(baseDir, rel);
                fs.writeFileSync(p, content);
                const doc = TextDocument.create(`file:///${p.replace(/\\/g, '/')}`, 'clarion', 1, content);
                tc.getTokens(doc);
                if (rel === 'a.clw') docA = doc;
            }
        };
        write(bDir, bFiles);
        write(aDir, aFiles);

        const pB = new ClarionProjectServer('B', 'app', bDir, '{B-609B2}');
        for (const rel of Object.keys(bFiles)) pB.sourceFiles.push(new ClarionSourcerFileServer(rel, rel, pB));
        const pA = new ClarionProjectServer('A', 'app', aDir, '{A-609B2}');
        for (const rel of Object.keys(aFiles)) pA.sourceFiles.push(new ClarionSourcerFileServer(rel, rel, pA));
        const projects = [pB, pA];
        const findProjectForFile = (fp: string) => {
            const norm = path.normalize(fp).toLowerCase();
            return projects.find(p => norm.startsWith(path.normalize(p.path).toLowerCase() + path.sep));
        };
        (SolutionManager as unknown as { instance: SolutionManager | null }).instance = {
            solution: { projects },
            findProjectForFile,
            getProjectPathForFile: (fp: string) => findProjectForFile(fp)?.path ?? path.dirname(fp),
            getEquatesTokens: () => [],
            getEquatesPath: () => undefined,
            findFileWithExtension: () => null,
        } as unknown as SolutionManager;

        savedLibsrc = serverSettings.libsrcPaths;
        savedRed = serverSettings.redirectionFile;
        // getOrBuildIndex short-circuits to an empty UNCACHED index without one.
        serverSettings.redirectionFile = 'test.red';
        StructureDeclarationIndexer.getInstance().clearCache();
        // Each project resolves only its own copy — the #571 shape: two projects whose
        // redirection points at different folders. B is built FIRST, so an unscoped
        // find() (which returns the first index carrying the name) answers with B's.
        // getOrBuildIndex, not buildIndex: only the former registers the result in the
        // project-index map that find()/findFor() read.
        serverSettings.libsrcPaths = [bDir];
        await StructureDeclarationIndexer.getInstance().getOrBuildIndex(bDir);
        serverSettings.libsrcPaths = [aDir];
        await StructureDeclarationIndexer.getInstance().getOrBuildIndex(aDir);

        svc = new MemberLocatorService();
    });

    teardown(() => {
        (SolutionManager as unknown as { instance: SolutionManager | null }).instance = savedSm;
        serverSettings.libsrcPaths = savedLibsrc;
        serverSettings.redirectionFile = savedRed;
        StructureDeclarationIndexer.getInstance().clearCache();
        TokenCache.getInstance().clearAllTokens();
        try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* ignore */ }
    });

    test('the collision is real: an unscoped lookup answers with the other project', () => {
        const sdi = StructureDeclarationIndexer.getInstance();
        const unscoped = sdi.find('Worker');
        const scoped = sdi.findFor('Worker', docA.uri);
        assert.ok(unscoped.length > 0, 'Worker must be indexed at all');
        assert.strictEqual(
            (unscoped.find(d => !d.isType) || unscoped[0]).parentName, undefined,
            'precondition: the unscoped lookup lands on B\'s parentless Worker'
        );
        assert.strictEqual(
            (scoped.find(d => !d.isType) || scoped[0]).parentName, 'BaseThing',
            'precondition: the file-scoped lookup lands on A\'s Worker(BaseThing)'
        );
    });

    test('a subclass caller sees inherited PROTECTED members', async function () {
        this.timeout(10000);
        const members = await svc.enumerateMembersInClass('BaseThing', docA, 'Worker');
        const names = members.map(m => m.name.toUpperCase());
        assert.ok(names.includes('PUBMETHOD'), `public member missing entirely: [${names.join(', ')}]`);
        assert.ok(
            names.includes('PROTMETHOD'),
            `PROTECTED member hidden from a subclass caller — accessFilter resolved "Worker" ` +
            `in the wrong project: [${names.join(', ')}]`
        );
    });

    test('an unrelated caller still does NOT see PROTECTED members', async function () {
        this.timeout(10000);
        const members = await svc.enumerateMembersInClass('BaseThing', docA, 'Stranger');
        const names = members.map(m => m.name.toUpperCase());
        assert.ok(names.includes('PUBMETHOD'), `public member missing: [${names.join(', ')}]`);
        assert.ok(!names.includes('PROTMETHOD'), `PROTECTED must stay hidden from a non-subclass: [${names.join(', ')}]`);
    });
});

