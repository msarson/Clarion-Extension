import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { TokenCache } from '../TokenCache';
import { setServerInitialized } from '../serverState';
import { FileRelationshipGraph } from '../FileRelationshipGraph';
import { DiagnosticProvider } from '../providers/DiagnosticProvider';
import { ReferencesProvider } from '../providers/ReferencesProvider';
import { ReferenceCountIndex } from '../services/ReferenceCountIndex';
import { ClarionProjectServer } from '../solution/clarionProjectServer';
import { ClarionSourcerFileServer } from '../solution/clarionSourceFileServer';
import { SolutionManager } from '../solution/solutionManager';
import { StructureDeclarationIndexer } from '../utils/StructureDeclarationIndexer';
import { IncludeVerifier } from '../utils/IncludeVerifier';
import { serverSettings } from '../serverSettings';

/**
 * Mark's real layout, second report. The flagged line is a FIELD of a class declared in a
 * class .inc, typed with a class that reaches global scope three includes deep from the
 * PROGRAM. The class's implementation module gets its MEMBER('B4') through
 * INCLUDE('member.inc').
 *
 *   B4.clw ─INCLUDE─▶ GlobalData.inc ─INCLUDE─▶ ViewMetric.inc ─(OMIT block)─▶ ctOneViewMetric.inc
 *   ctQ_UI_Walls.inc   ctQ_UI_Walls CLASS(ctQueue),TYPE,MODULE('ctQ_UI_Walls.clw')
 *                        ViewMetric  &ctViewMetric   ← warned "not included"
 *   ctQ_UI_Walls.clw   INCLUDE('member.inc') ─▶ MEMBER('B4');  INCLUDE('ctQ_UI_Walls.inc')
 *
 * "flat" lists every file as a project source. "real" is what a .cwproj holds: modules
 * only, with the shared class in its own folder reached through the .red. #559: in the
 * real layout References on a class never searched include files, so the global instance
 * in ViewMetric.inc and the field in ctQ_UI_Walls.inc were missed. The diagnostic cases
 * pin #558 on this layout.
 */
suite('Class field typed with a global class, module MEMBER via shim (Mark, second report)', () => {
    let dir: string;
    let savedSm: SolutionManager | null;
    let savedRed: string;
    let savedLibsrc: string[];
    const docs = new Map<string, TextDocument>();

    const FIELD_LINE = 3;
    const files = (programIncludesChain: boolean): { [rel: string]: string[] } => ({
        'B4.clw': ['  PROGRAM', '  MAP', '  END', programIncludesChain ? "  INCLUDE('GlobalData.inc'),ONCE" : "  INCLUDE('Nothing.inc'),ONCE", '  CODE', '  RETURN'],
        'Nothing.inc': ['! empty'],
        'GlobalData.inc': ["  INCLUDE('ctQueue.inc'),ONCE", "  INCLUDE('ViewMetric.inc'),ONCE ! moved to an include", "  INCLUDE('VendorThing.inc'),ONCE"],
        'VendorThing.inc': ['VendorUse   ctOneViewMetric   ! lives under a libsrc path in the real layout'],
        'ctQueue.inc': ["ctQueue   CLASS,TYPE,MODULE('ctQueue.clw'),LINK('ctQueue.clw')", 'Init        PROCEDURE()', '          END'],
        'ViewMetric.inc': [
            "  COMPILE('*** VIEWMETRIC ****',ViewMetricByThread)",
            "  INCLUDE('ctViewMetric.inc'),ONCE",
            'ViewData              ctThreadData_ViewMetricGlobal',
            "  !END-COMPILE('*** VIEWMETRIC ****',ViewMetricByThread)",
            "  OMIT('*** VIEWMETRIC ****',ViewMetricByThread)",
            "  INCLUDE('ctOneViewMetric.inc'),ONCE",
            'ViewData              ctOneViewMetric',
            "  !END-OMIT('*** VIEWMETRIC ****',ViewMetricByThread)",
        ],
        'ctViewMetric.inc': ["ctThreadData_ViewMetricGlobal CLASS,TYPE,MODULE('ctViewMetric.clw')", '         END'],
        'ctOneViewMetric.inc': [
            "  OMIT('*** IFDEF ****',IFDEF_ctOneViewMetric)",
            'IFDEF_ctOneViewMetric EQUATE(1)',
            "ctOneViewMetric   CLASS,TYPE,MODULE('ctOneViewMetric.clw'),LINK('ctOneViewMetric.clw')",
            '                  END',
            "ctViewMetric      CLASS,TYPE,MODULE('ctOneViewMetric.clw'),LINK('ctOneViewMetric.clw')",
            'GetMetric           PROCEDURE(),LONG',
            '                  END',
            "  !END-OMIT('*** IFDEF ****',IFDEF_ctOneViewMetric)",
        ],
        'member.inc': [" MEMBER('B4')", ''],
        'ctOneViewMetric.clw': [
            "  INCLUDE('member.inc')",
            "  INCLUDE('ctOneViewMetric.inc'),ONCE",
            '  MAP',
            '  END',
            'ctViewMetric.GetMetric PROCEDURE()',
            '  CODE',
            '  RETURN 0',
        ],
        'ctQ_UI_Walls.inc': [
            "ctQ_UI_Walls      CLASS(ctQueue),TYPE,MODULE('ctQ_UI_Walls.clw'),LINK('ctQ_UI_Walls.clw')",
            'Metric              LONG',
            'ImpScale            LONG',
            'ViewMetric          &ctViewMetric !<-- injected',              // FIELD_LINE
            'Init                PROCEDURE()',
            '                  END',
        ],
        'ctQ_UI_Walls.clw': [
            "  INCLUDE('member.inc')",
            "  INCLUDE('ctQ_UI_Walls.inc'),ONCE",
            '  MAP',
            '  END',
            'ctQ_UI_Walls.Init PROCEDURE()',
            '  CODE',
            '  RETURN',
        ],
        'GEN_ADJ.clw': [
            "  MEMBER('B4')",
            '  MAP',
            '  END',
            'GenAdj PROCEDURE()',
            'VM   ctViewMetric',
            '  CODE',
            '  RETURN',
        ],
    });

    let layout: 'flat' | 'real' = 'flat';
    const SHARED = /^ctOneViewMetric\./i;
    const build = async (programIncludesChain = true) => {
        const projectDir = layout === 'real' ? path.join(dir, 'TSI-Est') : dir;
        const sharedDir = layout === 'real' ? path.join(dir, 'Shared-Src') : dir;
        const libsrcDir = layout === 'real' ? path.join(dir, 'libsrc') : dir;
        fs.mkdirSync(projectDir, { recursive: true });
        fs.mkdirSync(sharedDir, { recursive: true });
        fs.mkdirSync(libsrcDir, { recursive: true });
        serverSettings.libsrcPaths = layout === 'real' ? [libsrcDir] : [];
        fs.writeFileSync(path.join(projectDir, 'Clarion110.red'),
            layout === 'real'
                ? `[Common]\r\n*.clw = .;${sharedDir};${libsrcDir}\r\n*.inc = .;${sharedDir};${libsrcDir}\r\n`
                : '[Common]\r\n*.clw = .\r\n*.inc = .\r\n');
        const project = new ClarionProjectServer('B4', 'app', projectDir, '{B4-559}');
        const seeds: string[] = [];
        const tc = TokenCache.getInstance();
        tc.clearAllTokens();
        docs.clear();
        for (const [rel, lines] of Object.entries(files(programIncludesChain))) {
            const p = path.join(SHARED.test(rel) ? sharedDir : rel === 'VendorThing.inc' ? libsrcDir : projectDir, rel);
            const text = lines.join('\r\n');
            fs.writeFileSync(p, text);
            // A .cwproj compiles modules only; includes are reached through the graph's closure.
            if (layout === 'flat' || /\.clw$/i.test(rel)) {
                project.sourceFiles.push(new ClarionSourcerFileServer(rel, path.relative(projectDir, p), project));
                seeds.push(p);
            }
            const doc = TextDocument.create(`file:///${p.replace(/\\/g, '/')}`, 'clarion', 1, text);
            tc.getTokens(doc);
            docs.set(rel, doc);
        }
        (SolutionManager as unknown as { instance: SolutionManager | null }).instance = {
            solution: { projects: [project] },
            findProjectForFile: () => project,
            getProjectPathForFile: () => projectDir,
            getProjectCwprojForFile: () => null,
            getEquatesTokens: () => [],
            getEquatesPath: () => undefined,
            findFileWithExtension: () => null,
        } as unknown as SolutionManager;
        FileRelationshipGraph.getInstance().reset();
        await FileRelationshipGraph.getInstance().buildInBackground(seeds);
        ReferenceCountIndex.getInstance().reset();
        await ReferenceCountIndex.getInstance().buildInBackground(seeds);
        StructureDeclarationIndexer.getInstance().clearCache();
        await StructureDeclarationIndexer.getInstance().getOrBuildIndex(projectDir);
        IncludeVerifier.getInstance().clearCache();
        sdiKey = projectDir;
    };
    let sdiKey = '';

    setup(() => {
        setServerInitialized(true);
        savedSm = (SolutionManager as unknown as { instance: SolutionManager | null }).instance;
        savedRed = serverSettings.redirectionFile;
        savedLibsrc = serverSettings.libsrcPaths;
        serverSettings.redirectionFile = 'Clarion110.red';
        serverSettings.libsrcPaths = [];
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mark559-'));
    });
    teardown(async () => {
        const sdi = StructureDeclarationIndexer.getInstance();
        await (sdi as unknown as { runDeferredValidations(): Promise<void> }).runDeferredValidations();
        (SolutionManager as unknown as { instance: SolutionManager | null }).instance = savedSm;
        FileRelationshipGraph.getInstance().reset();
        ReferenceCountIndex.getInstance().reset();
        sdi.clearCache();
        serverSettings.redirectionFile = savedRed;
        serverSettings.libsrcPaths = savedLibsrc;
        TokenCache.getInstance().clearAllTokens();
        IncludeVerifier.getInstance().clearCache();
        try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
    });

    const missingOnWalls = async () => {
        const doc = docs.get('ctQ_UI_Walls.inc')!;
        const defs = StructureDeclarationIndexer.getInstance().find('ctViewMetric', sdiKey).map(d => path.basename(d.filePath).toLowerCase());
        assert.ok(defs.includes('ctoneviewmetric.inc'), `precondition: index knows ctViewMetric: ${JSON.stringify(defs)}`);
        const d = await DiagnosticProvider.validateMissingIncludes(TokenCache.getInstance().getTokens(doc), doc);
        return d.map(x => String(x.message));
    };

    const refs = async (file: string, line: number, word: string) => {
        const doc = docs.get(file)!;
        const character = doc.getText().split(/\r?\n/)[line].indexOf(word) + 1;
        const locs = await new ReferencesProvider().provideReferences(doc, { line, character }, { includeDeclaration: true });
        return (locs ?? []).map(l => `${path.basename(decodeURIComponent(l.uri)).toLowerCase()}:${l.range.start.line}`).sort();
    };

    for (const L of ['flat', 'real'] as const) {
        test(`${L}: diagnostic: the field type is not reported missing`, async () => {
            layout = L; await build();
            assert.deepStrictEqual(await missingOnWalls(), []);
        });

        test(`${L}: control: the diagnostic fires when the PROGRAM lacks the chain`, async () => {
            layout = L; await build(false);
            assert.strictEqual((await missingOnWalls()).length, 1);
        });

        test(`${L}: references from the class declaration include the field typed with it`, async () => {
            layout = L; await build();
            const hits = await refs('ctOneViewMetric.inc', 4, 'ctViewMetric');
            assert.ok(hits.includes('gen_adj.clw:4'), `baseline hit in a named MEMBER module: ${JSON.stringify(hits)}`);
            assert.ok(hits.includes(`ctq_ui_walls.inc:${FIELD_LINE}`), JSON.stringify(hits));
        });

        test(`${L}: references on a class include its global instance in a data include inside an OMIT block`, async () => {
            layout = L; await build();
            const hits = await refs('ctOneViewMetric.inc', 2, 'ctOneViewMetric');
            assert.ok(hits.includes('viewmetric.inc:6'), JSON.stringify(hits));
            if (L === 'real') {
                assert.ok(!hits.some(h => h.startsWith('vendorthing.inc')), `an include under a libsrc path is not searched: ${JSON.stringify(hits)}`);
            }
        });

        test(`${L}: isolate: references on a class include its global instance in a data include, no conditional block`, async () => {
            layout = L; await build();
            const hits = await refs('ctViewMetric.inc', 0, 'ctThreadData_ViewMetricGlobal');
            assert.ok(hits.includes('viewmetric.inc:2'), JSON.stringify(hits));
        });
    }
});
