/**
 * #364 — the #322 module-callout FAR, but in the REAL cross-project shape that
 * under-counts to 2 on Mark's solution: `AppendText` exists as a self-contained
 * module-callout family in BOTH PRVData and SQLInstallAndUpgrade. Each project
 * has its own callout INC (`APPENDTEXT_<proj>.INC` → `MODULE('APPENDTEXT_<proj>.CLW')`),
 * its own MEMBER implementation, and its own callers that `INCLUDE` the INC.
 *
 * Two real-world traits the passing #322 fixture lacks and that are reproduced
 * here verbatim from F:\TestApps\Direct10Source:
 *   1. Two independent projects carrying the same procedure name.
 *   2. The MODULE('…CLW') reference is UPPER-case while the implementation file
 *      is mixed-case (`AppendText_SQL.clw`) — a case mismatch.
 *
 * FAR from any SQL position must return the SQL callout family (INC prototype +
 * implementation + every SQL call site) and must NOT leak PRVData's same-named
 * family — and must not stop at 2.
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

suite('FAR module-callout cross-project (#364)', () => {
    let root: string;
    let savedSm: SolutionManager | null;
    let savedLibsrc: string[] = [];
    const docs = new Map<string, TextDocument>();

    // SQL project — mixed-case impl filename, UPPER-case MODULE reference.
    const sqlFiles: { [rel: string]: string } = {
        'sqlmain.clw': [
            '  PROGRAM',
            '  MAP',
            "    INCLUDE('APPENDTEXT_SQL.INC'),ONCE",
            '  END',
            '  CODE',
            '  RETURN',
        ].join('\r\n'),
        'APPENDTEXT_SQL.INC': [
            "  MODULE('APPENDTEXT_SQL.CLW')",
            'AppendText PROCEDURE(SIGNED feq, STRING txt)',
            '  END',
        ].join('\r\n'),
        'AppendText_SQL.clw': [
            "  MEMBER('sqlmain.clw')",                        // 0
            '  MAP',                                          // 1
            "    INCLUDE('APPENDTEXT_SQL.INC'),ONCE",         // 2
            '  END',                                          // 3
            'AppendText PROCEDURE(SIGNED feq, STRING txt)',   // 4 — implementation
            '  CODE',                                         // 5
            '  RETURN',                                       // 6
        ].join('\r\n'),
        'CheckDB_SQL.clw': [
            "  MEMBER('sqlmain.clw')",                        // 0
            '  MAP',                                          // 1
            "    INCLUDE('APPENDTEXT_SQL.INC'),ONCE",         // 2
            '  END',                                          // 3
            'CheckDB PROCEDURE',                              // 4
            '  CODE',                                         // 5
            "  AppendText(1, 'a')",                           // 6 — call site
            "  AppendText(2, 'b')",                           // 7 — call site
            '  RETURN',                                       // 8
        ].join('\r\n'),
    };

    // PRVData project — its own same-named callout family (must never leak in).
    const prvFiles: { [rel: string]: string } = {
        'prvmain.clw': [
            '  PROGRAM',
            '  MAP',
            "    INCLUDE('APPENDTEXT_PRV.INC'),ONCE",
            '  END',
            '  CODE',
            '  RETURN',
        ].join('\r\n'),
        'APPENDTEXT_PRV.INC': [
            "  MODULE('APPENDTEXT_PRV.CLW')",
            'AppendText PROCEDURE(SIGNED feq, STRING txt)',
            '  END',
        ].join('\r\n'),
        'AppendText_PRV.clw': [
            "  MEMBER('prvmain.clw')",
            '  MAP',
            "    INCLUDE('APPENDTEXT_PRV.INC'),ONCE",
            '  END',
            'AppendText PROCEDURE(SIGNED feq, STRING txt)',
            '  CODE',
            '  RETURN',
        ].join('\r\n'),
        'GetJob_PRV.clw': [
            "  MEMBER('prvmain.clw')",
            '  MAP',
            "    INCLUDE('APPENDTEXT_PRV.INC'),ONCE",
            '  END',
            'GetJob PROCEDURE',
            '  CODE',
            "  AppendText(9, 'prv')",                          // 6 — PRV call site (decoy)
            '  RETURN',
        ].join('\r\n'),
    };

    setup(async () => {
        setServerInitialized(true);
        savedSm = (SolutionManager as unknown as { instance: SolutionManager | null }).instance;
        root = fs.mkdtempSync(path.join(os.tmpdir(), 'far364cp-'));
        const sqlDir = path.join(root, 'SQLInstallAndUpgrade');
        const prvDir = path.join(root, 'PRVData');
        fs.mkdirSync(sqlDir, { recursive: true });
        fs.mkdirSync(prvDir, { recursive: true });

        const tc = TokenCache.getInstance();
        tc.clearAllTokens();
        docs.clear();
        const paths: string[] = [];
        const write = (baseDir: string, map: { [rel: string]: string }) => {
            for (const [rel, content] of Object.entries(map)) {
                const p = path.join(baseDir, rel);
                fs.writeFileSync(p, content);
                paths.push(p);
                const doc = TextDocument.create(`file:///${p.replace(/\\/g, '/')}`, 'clarion', 1, content);
                tc.getTokens(doc);
                docs.set(rel, doc);
            }
        };
        write(sqlDir, sqlFiles);
        write(prvDir, prvFiles);

        // Two-project solution — PRVData FIRST so any first-match hunt resolves wrong.
        const pPrv = new ClarionProjectServer('PRVData', 'app', prvDir, '{PRV-364}');
        for (const rel of Object.keys(prvFiles)) pPrv.sourceFiles.push(new ClarionSourcerFileServer(rel, rel, pPrv));
        const pSql = new ClarionProjectServer('SQLInstallAndUpgrade', 'app', sqlDir, '{SQL-364}');
        for (const rel of Object.keys(sqlFiles)) pSql.sourceFiles.push(new ClarionSourcerFileServer(rel, rel, pSql));
        const projects = [pPrv, pSql];
        const findProjectForFile = (fp: string) => {
            const norm = path.normalize(fp).toLowerCase();
            const byPath = projects.find(p => norm.startsWith(path.normalize(p.path).toLowerCase() + path.sep));
            if (byPath) return byPath;
            const base = path.basename(norm);
            return projects.find(p => p.sourceFiles.some(sf => sf.name.toLowerCase() === base));
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
        await FileRelationshipGraph.getInstance().buildInBackground(paths);
        ReferenceCountIndex.getInstance().reset();
        await ReferenceCountIndex.getInstance().buildInBackground(paths);

        // #362 — build the SDI procedure index so findProcedureViaIndex fires,
        // matching the REAL resolution path (proc index → INC) that the lens uses.
        savedLibsrc = serverSettings.libsrcPaths;
        serverSettings.libsrcPaths = [sqlDir, prvDir];
        StructureDeclarationIndexer.getInstance().clearCache();
        await StructureDeclarationIndexer.getInstance().buildIndex(sqlDir);
        await StructureDeclarationIndexer.getInstance().buildIndex(prvDir);
    });

    teardown(() => {
        (SolutionManager as unknown as { instance: SolutionManager | null }).instance = savedSm;
        FileRelationshipGraph.getInstance().reset();
        ReferenceCountIndex.getInstance().reset();
        StructureDeclarationIndexer.getInstance().clearCache();
        serverSettings.libsrcPaths = savedLibsrc;
        TokenCache.getInstance().clearAllTokens();
        try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* best-effort */ }
    });

    function keyed(refs: { uri: string; range: { start: { line: number } } }[] | null | undefined): string[] {
        return (refs ?? []).map(r =>
            `${path.basename(decodeURIComponent(r.uri)).toLowerCase()}:${r.range.start.line}`).sort();
    }

    test('FAR from the SQL implementation reaches every SQL call site, not just 2', async () => {
        const refs = await new ReferencesProvider().provideReferences(
            docs.get('AppendText_SQL.clw')!, { line: 4, character: 2 }, { includeDeclaration: true });
        const got = keyed(refs);

        assert.ok(got.includes('checkdb_sql.clw:6') && got.includes('checkdb_sql.clw:7'),
            `SQL call sites must be found (the "only 2" bug); got [${got.join(', ')}]`);
        assert.ok(got.includes('appendtext_sql.clw:4'), `SQL implementation label; got [${got.join(', ')}]`);
        assert.ok(!got.some(k => k.includes('_prv')),
            `PRVData's same-named family must NOT leak in; got [${got.join(', ')}]`);
    });

    test('FAR from a SQL call site returns the SQL family, not PRVData', async () => {
        const refs = await new ReferencesProvider().provideReferences(
            docs.get('CheckDB_SQL.clw')!, { line: 6, character: 4 }, { includeDeclaration: true });
        const got = keyed(refs);

        assert.ok(got.includes('checkdb_sql.clw:6') && got.includes('checkdb_sql.clw:7'),
            `both SQL call sites; got [${got.join(', ')}]`);
        assert.ok(got.includes('appendtext_sql.clw:4'), `SQL implementation reachable; got [${got.join(', ')}]`);
        assert.ok(!got.some(k => k.includes('_prv')),
            `no PRVData leak; got [${got.join(', ')}]`);
    });
});
