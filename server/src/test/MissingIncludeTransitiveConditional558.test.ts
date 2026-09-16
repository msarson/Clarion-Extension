import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { TokenCache } from '../TokenCache';
import { setServerInitialized } from '../serverState';
import { FileRelationshipGraph } from '../FileRelationshipGraph';
import { DiagnosticProvider } from '../providers/DiagnosticProvider';
import { ClarionProjectServer } from '../solution/clarionProjectServer';
import { ClarionSourcerFileServer } from '../solution/clarionSourceFileServer';
import { SolutionManager } from '../solution/solutionManager';
import { StructureDeclarationIndexer } from '../utils/StructureDeclarationIndexer';
import { serverSettings } from '../serverSettings';
import { IncludeVerifier } from '../utils/IncludeVerifier';

/**
 * Mark's chain (#558): the type IS in global scope, three includes deep from the
 * PROGRAM, the last hop inside a conditional OMIT block, and the module reaches the
 * program through INCLUDE('member.inc') rather than a MEMBER line of its own. The
 * missing-include check still reported "'ctViewMetric' is defined in
 * 'ctOneViewMetric.inc' which is not included" on code that compiles.
 *
 *   prog.clw ─INCLUDE─▶ GlobalData.inc ─INCLUDE─▶ ViewMetric.inc
 *                                                   COMPILE(flag) INCLUDE('ctViewMetric.inc')
 *                                                   OMIT(flag)    INCLUDE('ctOneViewMetric.inc')  ← declares ctViewMetric
 *   mod.clw  ─INCLUDE('member.inc')─▶ MEMBER('prog.clw')
 *
 * Every hop of that chain already passed. The gap was the "injected" line sitting in a
 * data include that the module INCLUDEs: the verifier looked down (own includes) and
 * sideways (#191 companions) but never up to the including module and its program.
 *
 * The bare MEMBER() rule is compiler-verified on Clarion 10.0.12567: `Ref &ctThing` in a
 * `MEMBER()` module fails with "Illegal data type" unless the module includes the .inc
 * itself, while `MEMBER('main')` compiles. The warning is correct there.
 */
type Variant = 'mark' | 'literal-member' | 'unconditional' | 'not-included' | 'bare-shim' | 'bare-literal'
    | 'own-module' | 'lib-folder' | 'injected-inc' | 'injected-not-included' | 'injected-bare-shim';

suite('Missing-include check follows the PROGRAM\'s transitive and conditional includes (#558)', () => {
    let dir: string;
    let savedSm: SolutionManager | null;
    let savedRed: string;
    let savedLibsrc: string[];

    let libRel = '';
    const write = (rel: string, lines: string[]) => {
        const inLib = libRel && /^(ct|ViewMetric)/i.test(rel); // member.inc stays beside the program that it names
        const full = path.join(dir, inLib ? libRel : '', rel);
        fs.mkdirSync(path.dirname(full), { recursive: true });
        fs.writeFileSync(full, lines.join('\r\n'));
    };

    const buildSolution = async (variant: Variant) => {
        libRel = variant === 'lib-folder' ? 'lib' : '';
        const programLacksChain = variant === 'not-included' || variant === 'injected-not-included';
        const injected = variant.startsWith('injected');
        const bareShim = variant === 'bare-shim' || variant === 'injected-bare-shim';
        write('prog.clw', ['  PROGRAM', '  MAP', '  END', programLacksChain ? "  INCLUDE('Nothing.inc'),ONCE" : "  INCLUDE('GlobalData.inc'),ONCE", '  CODE']);
        write('Nothing.inc', ['! empty']);
        write('GlobalData.inc', ["  INCLUDE('ViewMetric.inc'),ONCE ! moved to an include"]);
        write('ViewMetric.inc', variant === 'unconditional'
            ? ["  INCLUDE('ctOneViewMetric.inc'),ONCE", 'ViewData  ctOneViewMetric']
            : [
                "  COMPILE('*** VIEWMETRIC ****',ViewMetricByThread)",
                "  INCLUDE('ctViewMetric.inc'),ONCE",
                'ViewData  ctThreadData_ViewMetricGlobal',
                "  !END-COMPILE('*** VIEWMETRIC ****',ViewMetricByThread)",
                "  OMIT('*** VIEWMETRIC ****',ViewMetricByThread)",
                "  INCLUDE('ctOneViewMetric.inc'),ONCE",
                'ViewData  ctOneViewMetric',
                "  !END-OMIT('*** VIEWMETRIC ****',ViewMetricByThread)",
            ]);
        write('ctViewMetric.inc', ["ctThreadData_ViewMetricGlobal CLASS,TYPE,MODULE('ctViewMetric.clw')", '         END']);
        write('ctOneViewMetric.inc', [
            "ctOneViewMetric   CLASS,TYPE,MODULE('ctOneViewMetric.clw'),LINK('ctOneViewMetric.clw')",
            '                  END',
            "ctViewMetric      CLASS,TYPE,MODULE('ctOneViewMetric.clw'),LINK('ctOneViewMetric.clw')",
            'Kick                PROCEDURE()',
            '                  END',
        ]);
        write('member.inc', [bareShim ? '  MEMBER()' : "  MEMBER('prog.clw')"]);
        write('ctOneViewMetric.clw', [
            "  INCLUDE('member.inc')",
            '  MAP',
            '  END',
            ...(variant === 'own-module' || variant === 'lib-folder' ? ['ViewMetric  &ctViewMetric   ! <-- injected'] : []),
            'ctViewMetric.Kick PROCEDURE()',
            '  CODE',
            '  RETURN',
        ]);
        write('Injected.inc', ['ViewMetric  &ctViewMetric   ! <-- injected by a template into a data include']);
        write('mod.clw', [
            variant === 'literal-member' ? "  MEMBER('prog.clw')" : variant === 'bare-literal' ? '  MEMBER()' : "  INCLUDE('member.inc')",
            '  MAP',
            '  END',
            injected ? "  INCLUDE('Injected.inc'),ONCE" : 'ViewMetric  &ctViewMetric   ! <-- injected',
            'Copy PROCEDURE()',
            '  CODE',
            '  RETURN',
        ]);
        const project = new ClarionProjectServer('prog', 'app', dir, '{PROG-558}');
        const seeds: string[] = [];
        const walk = (sub: string) => {
            for (const rel of fs.readdirSync(path.join(dir, sub))) {
                const full = path.join(dir, sub, rel);
                if (fs.statSync(full).isDirectory()) { walk(path.join(sub, rel)); continue; }
                if (!/\.(clw|inc)$/i.test(rel)) continue;
                project.sourceFiles.push(new ClarionSourcerFileServer(rel, path.join(sub, rel), project));
                seeds.push(full);
            }
        };
        walk('');
        (SolutionManager as unknown as { instance: SolutionManager | null }).instance = {
            solution: { projects: [project] },
            findProjectForFile: () => project,
            getProjectPathForFile: () => dir,
            getProjectCwprojForFile: () => null,
            getEquatesTokens: () => [],
            getEquatesPath: () => undefined,
            findFileWithExtension: () => null,
        } as unknown as SolutionManager;
        FileRelationshipGraph.getInstance().reset();
        await FileRelationshipGraph.getInstance().buildInBackground(seeds);
        StructureDeclarationIndexer.getInstance().clearCache();
        await StructureDeclarationIndexer.getInstance().getOrBuildIndex(dir);
        IncludeVerifier.getInstance().clearCache();
        const modPath = variant === 'own-module' || variant === 'lib-folder' ? path.join(dir, libRel, 'ctOneViewMetric.clw')
            : injected ? path.join(dir, 'Injected.inc')
            : path.join(dir, 'mod.clw');
        const doc = TextDocument.create(`file:///${modPath.replace(/\\/g, '/')}`, 'clarion', 1, fs.readFileSync(modPath, 'utf8'));
        return { doc, tokens: TokenCache.getInstance().getTokens(doc) };
    };

    const missing = async (variant: Variant) => {
        const { doc, tokens } = await buildSolution(variant);
        // Precondition for every variant: the check can only fire if the index knows the type,
        // so a green run with an unindexed type would prove nothing.
        const defs = StructureDeclarationIndexer.getInstance().find('ctViewMetric', dir).map(d => path.basename(d.filePath).toLowerCase());
        assert.ok(defs.includes('ctoneviewmetric.inc'), `index knows ctViewMetric in ctOneViewMetric.inc: ${JSON.stringify(defs)}`);
        const d = await DiagnosticProvider.validateMissingIncludes(tokens, doc);
        return d.map(x => String(x.message));
    };

    setup(() => {
        setServerInitialized(true);
        savedSm = (SolutionManager as unknown as { instance: SolutionManager | null }).instance;
        savedRed = serverSettings.redirectionFile;
        savedLibsrc = serverSettings.libsrcPaths;
        serverSettings.redirectionFile = 'Clarion110.red';
        serverSettings.libsrcPaths = [];
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mi558-'));
        fs.writeFileSync(path.join(dir, 'Clarion110.red'), '[Common]\r\n*.clw = .;lib\r\n*.inc = .;lib\r\n');
        TokenCache.getInstance().clearAllTokens();
    });
    teardown(async () => {
        const sdi = StructureDeclarationIndexer.getInstance();
        await (sdi as unknown as { runDeferredValidations(): Promise<void> }).runDeferredValidations();
        (SolutionManager as unknown as { instance: SolutionManager | null }).instance = savedSm;
        FileRelationshipGraph.getInstance().reset();
        sdi.clearCache();
        serverSettings.redirectionFile = savedRed;
        serverSettings.libsrcPaths = savedLibsrc;
        TokenCache.getInstance().clearAllTokens();
        IncludeVerifier.getInstance().clearCache();
        try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
    });

    test('bug-pin: Mark\'s chain — three hops, last inside OMIT, MEMBER via member.inc — is not reported', async () => {
        assert.deepStrictEqual(await missing('mark'), []);
    });

    test('control: with the PROGRAM not including the chain at all, the check does fire', async () => {
        const msgs = await missing('not-included');
        assert.strictEqual(msgs.length, 1, JSON.stringify(msgs));
        assert.ok(/ctViewMetric.*ctOneViewMetric.inc/i.test(msgs[0]), msgs[0]);
    });

    // Language Reference, MEMBER: with the program omitted "the module is a 'universal member
    // module'" and "you also need to INCLUDE any standard EQUATEs files" — it sees no global scope.
    test('rule: a bare MEMBER() in the shim has no global scope, so the warning stands', async () => {
        assert.strictEqual((await missing('bare-shim')).length, 1);
    });

    test('rule: a literal bare MEMBER() in the module — the warning stands', async () => {
        assert.strictEqual((await missing('bare-literal')).length, 1);
    });

    test('bug-pin: the class own implementation module, relying on the shim for its declaration', async () => {
        assert.deepStrictEqual(await missing('own-module'), []);
    });

    test('bug-pin: library files in a separate folder reached through the redirection file', async () => {
        assert.deepStrictEqual(await missing('lib-folder'), []);
    });

    test('bug-pin: the injected line sits in a data include that the module INCLUDEs', async () => {
        assert.deepStrictEqual(await missing('injected-inc'), []);
    });

    test('control: the same data include still warns when the including module\'s PROGRAM lacks the chain', async () => {
        assert.strictEqual((await missing('injected-not-included')).length, 1);
    });

    test('control: the same data include still warns when the including module is a bare MEMBER()', async () => {
        assert.strictEqual((await missing('injected-bare-shim')).length, 1);
    });

    test('isolate: the same chain with a literal MEMBER line in the module', async () => {
        assert.deepStrictEqual(await missing('literal-member'), []);
    });

    test('isolate: the same chain with the last include outside any conditional block', async () => {
        assert.deepStrictEqual(await missing('unconditional'), []);
    });
});
