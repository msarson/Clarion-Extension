/**
 * #483 follow-up — index the MAP prototypes of PROGRAM files.
 *
 * The structure-declaration index scanned .inc/.equ (plus a whitelist of
 * declaration-only .clw) and nothing else, so a procedure prototyped in a
 * PROGRAM's own MAP — every `MODULE('x.clw')` block a generated app emits — was
 * never indexed. Every hover / F12 / FAR on such a procedure therefore missed
 * the #362 index tier and paid the cross-file walk instead (~1.6s true-cold on
 * the 40-project rig, for `Main` and for anything else declared that way).
 *
 * PROGRAM files are identified from the solution's project source lists by
 * reading each file's head once (verdict cached with the index), and only their
 * PROCEDURE prototypes are indexed — their data declarations stay out, so
 * consumers of the structure index (missing-include checks, type lookups) are
 * unchanged. MEMBER modules are still not scanned.
 */

import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { TokenCache } from '../TokenCache';
import { setServerInitialized } from '../serverState';
import { FileRelationshipGraph } from '../FileRelationshipGraph';
import { ClarionProjectServer } from '../solution/clarionProjectServer';
import { ClarionSourcerFileServer } from '../solution/clarionSourceFileServer';
import { SolutionManager } from '../solution/solutionManager';
import { StructureDeclarationIndexer } from '../utils/StructureDeclarationIndexer';
import { serverSettings } from '../serverSettings';

suite('SDI indexes PROGRAM-file MAP prototypes (#483 follow-up)', () => {
    let root: string;
    let aDir: string;
    let bDir: string;
    let savedSm: SolutionManager | null;
    let savedLibsrc: string[] = [];

    const aFiles: { [rel: string]: string } = {
        'a.clw': [
            '  PROGRAM',                                      // 0
            '  MAP',                                          // 1
            "    MODULE('caller_a.clw')",                     // 2
            'CallerA PROCEDURE',                              // 3
            '    END',                                        // 4
            "    MODULE('forms_a.clw')",                      // 5
            'Forms1099Misc PROCEDURE',                        // 6 — PROGRAM-MAP prototype
            '    END',                                        // 7
            'BareProto PROCEDURE(LONG x),LONG',               // 8 — prototype directly in MAP, no MODULE
            '  END',                                          // 9
            'GlobQ QUEUE,PRE(GQ)',                            // 10 — global DATA: must NOT enter the structure index
            'Name STRING(20)',                                // 11
            '  END',                                          // 12
            '  CODE',                                         // 13
            '  CallerA',                                      // 14
        ].join('\r\n'),
        'caller_a.clw': [
            "  MEMBER('a.clw')",                              // 0
            '  MAP',                                          // 1
            '  END',                                          // 2
            'CallerA PROCEDURE',                              // 3 — implementation in a MEMBER: must NOT be indexed
            '  CODE',                                         // 4
            '  START(Forms1099Misc, 25000)',                  // 5
            '  RETURN',                                       // 6
        ].join('\r\n'),
        'forms_a.clw': [
            "  MEMBER('a.clw')",
            '  MAP',
            '  END',
            'Forms1099Misc PROCEDURE',
            '  CODE',
            '  RETURN',
        ].join('\r\n'),
    };

    const bFiles: { [rel: string]: string } = {
        'b.clw': [
            '  PROGRAM',
            '  MAP',
            "    INCLUDE('FORMS_B.INC'),ONCE",
            '  END',
            '  CODE',
        ].join('\r\n'),
        'FORMS_B.INC': [
            "  MODULE('FORMS_B.CLW')",
            'Forms1099Misc PROCEDURE',                        // 1 — the INC prototype (was the only indexed one)
            '  END',
        ].join('\r\n'),
        'forms_b.clw': [
            "  MEMBER('b.clw')",
            '  MAP',
            "    INCLUDE('FORMS_B.INC'),ONCE",
            '  END',
            'Forms1099Misc PROCEDURE',
            '  CODE',
            '  RETURN',
        ].join('\r\n'),
    };

    setup(async () => {
        setServerInitialized(true);
        savedSm = (SolutionManager as unknown as { instance: SolutionManager | null }).instance;
        root = fs.mkdtempSync(path.join(os.tmpdir(), 'sdiprog483-'));
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
                tc.getTokens(TextDocument.create(`file:///${p.replace(/\\/g, '/')}`, 'clarion', 1, content));
            }
        };
        write(bDir, bFiles);
        write(aDir, aFiles);

        const pB = new ClarionProjectServer('B', 'app', bDir, '{B-483p}');
        for (const rel of Object.keys(bFiles)) pB.sourceFiles.push(new ClarionSourcerFileServer(rel, rel, pB));
        const pA = new ClarionProjectServer('A', 'app', aDir, '{A-483p}');
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

        FileRelationshipGraph.getInstance().reset();
        savedLibsrc = serverSettings.libsrcPaths;
        serverSettings.libsrcPaths = [bDir, aDir];
        StructureDeclarationIndexer.getInstance().clearCache();
        await StructureDeclarationIndexer.getInstance().buildIndex(bDir);
        await StructureDeclarationIndexer.getInstance().buildIndex(aDir);
    });

    teardown(() => {
        (SolutionManager as unknown as { instance: SolutionManager | null }).instance = savedSm;
        StructureDeclarationIndexer.getInstance().clearCache();
        serverSettings.libsrcPaths = savedLibsrc;
        TokenCache.getInstance().clearAllTokens();
        try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* best-effort */ }
    });

    const hitsOf = (name: string) => StructureDeclarationIndexer.getInstance().findProcedure(name)
        .map(h => `${path.basename(h.filePath).toLowerCase()}:${h.line}`).sort();

    test('a prototype inside MODULE() in a PROGRAM\'s MAP is indexed alongside the INC one', () => {
        const got = hitsOf('Forms1099Misc');
        assert.ok(got.includes('a.clw:6'), `A's PROGRAM-MAP prototype must be indexed; got [${got.join(', ')}]`);
        assert.ok(got.includes('forms_b.inc:1'), `B's INC prototype still indexed; got [${got.join(', ')}]`);
    });

    test('a prototype directly in the PROGRAM\'s MAP (no MODULE) is indexed too', () => {
        const got = hitsOf('BareProto');
        assert.deepStrictEqual(got, ['a.clw:8'], `got [${got.join(', ')}]`);
    });

    test('a PROGRAM file\'s data declarations do NOT enter the structure index', () => {
        const decls = StructureDeclarationIndexer.getInstance().find('GlobQ');
        assert.strictEqual(decls.length, 0, `GlobQ must stay out of the structure index; got ${decls.length}`);
    });

    test('a MEMBER module\'s implementation is still not indexed — only the PROGRAM prototype', () => {
        const got = hitsOf('CallerA');
        assert.deepStrictEqual(got, ['a.clw:3'], `only the PROGRAM-MAP prototype; got [${got.join(', ')}]`);
    });

    test('the PROGRAM verdict and its prototypes survive a rebuild from the disk cache', async () => {
        const sdi = StructureDeclarationIndexer.getInstance();
        sdi.clearCache();                       // in-memory only — the disk cache stays
        await sdi.buildIndex(bDir);
        await sdi.buildIndex(aDir);
        const got = hitsOf('Forms1099Misc');
        assert.ok(got.includes('a.clw:6'), `cached rebuild must still carry A's prototype; got [${got.join(', ')}]`);
    });
});
