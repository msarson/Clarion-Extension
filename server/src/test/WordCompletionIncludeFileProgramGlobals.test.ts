import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { WordCompletionProvider } from '../providers/WordCompletionProvider';
import { TokenCache } from '../TokenCache';
import { ScopeAnalyzer } from '../utils/ScopeAnalyzer';
import { SolutionManager } from '../solution/solutionManager';
import { FileRelationshipGraph } from '../FileRelationshipGraph';

/**
 * An included file - a class header, a set of TYPE declarations - has no MEMBER of its own: it
 * belongs to the PROGRAM of the modules that INCLUDE it. Word completion found the PROGRAM only
 * through the document's own MEMBER (or a MEMBER-via-INCLUDE shim), so inside such a file it
 * offered none of the PROGRAM's globals: `LIKE(Wdg:` beside a dictionary FILE,PRE(Wdg) listed
 * nothing, while the same `Wdg:` in the including module listed every field.
 */
suite('Word completion finds the PROGRAM of an included file through the modules that include it', () => {
    let dir = '';
    let savedSm: unknown;
    let provider: WordCompletionProvider;

    const write = (name: string, lines: string[]) => fs.writeFileSync(path.join(dir, name), lines.join('\r\n'));

    suiteSetup(() => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wcinc-'));
        // One PROGRAM whose data section includes a dictionary with a prefixed FILE.
        write('widgetdct.inc', [
            "Widget   FILE,DRIVER('TOPSPEED'),PRE(Wdg),CREATE,THREAD",
            'Key_Id     KEY(+Wdg:Id),NOCASE,OPT,PRIMARY',
            'Record     RECORD,PRE()',
            'Id           LONG',
            'Notes        STRING(255)',
            '           END',
            '         END',
            '',
        ]);
        write('prog.clw', ['  PROGRAM', "  INCLUDE('widgetdct.inc'),ONCE", '  MAP', '  END', '  CODE', '']);
        write('mod.clw', ["  MEMBER('prog.clw')", "  INCLUDE('classhdr.inc'),ONCE", "  INCLUDE('shared.inc'),ONCE", '']);
        write('mod-b.clw', ["  MEMBER('prog.clw')", "  INCLUDE('outer.inc'),ONCE", '']);
        // A module whose MEMBER sits in a shim it INCLUDEs as its first statement.
        write('member.clw', ["  MEMBER('prog.clw')", '']);
        write('mod-shim.clw', ["  INCLUDE('member.clw')", "  INCLUDE('shimhdr.inc'),ONCE", '']);
        // An include reached only through another include.
        write('outer.inc', ["  INCLUDE('nested.inc'),ONCE", '']);
        // A second PROGRAM, whose module also includes shared.inc.
        write('prog2.clw', ['  PROGRAM', '  MAP', '  END', '  CODE', '']);
        write('mod2.clw', ["  MEMBER('prog2.clw')", "  INCLUDE('shared.inc'),ONCE", '']);

        savedSm = (SolutionManager as unknown as { instance: unknown }).instance;
        (SolutionManager as unknown as { instance: unknown }).instance = null;
        FileRelationshipGraph.getInstance().reset();

        const cache = TokenCache.getInstance();
        provider = new WordCompletionProvider(cache, new ScopeAnalyzer(cache, SolutionManager.getInstance()));
    });

    suiteTeardown(() => {
        (SolutionManager as unknown as { instance: unknown }).instance = savedSm;
        FileRelationshipGraph.getInstance().reset();
        TokenCache.getInstance().clearAllTokens();
        try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best-effort */ }
    });

    /** Completion for `Wdg:` typed in a QUEUE TYPE declared in `fileName`. */
    const labelsIn = async (fileName: string) => {
        const lines = [
            'ItemQType  QUEUE,TYPE',
            'Notes        LIKE(Wdg:',
            '           END',
            '',
        ];
        write(fileName, lines);
        const text = lines.join('\r\n');
        const doc = TextDocument.create(`file:///${path.join(dir, fileName).replace(/\\/g, '/')}`, 'clarion', 1, text);
        TokenCache.getInstance().getTokens(doc);
        FileRelationshipGraph.getInstance().reset();
        return (await provider.provide(doc, { line: 1, character: lines[1].length }, 'Wdg:'))
            .map(i => String(i.label).toLowerCase());
    };

    test('an include of a MEMBER module gets its PROGRAM\'s prefixed fields', async () => {
        const got = await labelsIn('classhdr.inc');
        assert.ok(got.includes('notes'), `PROGRAM dictionary field missing: ${got.slice(0, 20).join(', ')}`);
        assert.ok(got.includes('id'), got.slice(0, 20).join(', '));
    });

    test('an include reached through another include is followed up to the module', async () => {
        const got = await labelsIn('nested.inc');
        assert.ok(got.includes('notes'), got.slice(0, 20).join(', '));
    });

    test('an include of a module whose MEMBER is in a shim gets the PROGRAM\'s fields', async () => {
        const got = await labelsIn('shimhdr.inc');
        assert.ok(got.includes('notes'), got.slice(0, 20).join(', '));
    });

    test('an include shared by modules of two PROGRAMs offers neither (no guessing)', async () => {
        const got = await labelsIn('shared.inc');
        assert.ok(!got.includes('notes'), got.slice(0, 20).join(', '));
    });

    test('an include nobody includes still offers nothing', async () => {
        const got = await labelsIn('orphan.inc');
        assert.ok(!got.includes('notes'), got.slice(0, 20).join(', '));
    });

    test('a walk cut short by the file cap gives no PROGRAM rather than the first one found', () => {
        // 300 headers include the target, each included by a module of the same PROGRAM - except
        // the walk must stop at its cap before it has seen them all, and then not answer.
        const graph = FileRelationshipGraph.getInstance();
        graph.reset();
        const edges: { type: 'INCLUDE' | 'MEMBER'; fromFile: string; toFile: string }[] = [];
        for (let i = 0; i < 300; i++) {
            edges.push({ type: 'INCLUDE', fromFile: `c:/cap/hdr${i}.inc`, toFile: 'c:/cap/target.inc' });
            edges.push({ type: 'INCLUDE', fromFile: `c:/cap/mod${i}.clw`, toFile: `c:/cap/hdr${i}.inc` });
            edges.push({ type: 'MEMBER', fromFile: `c:/cap/mod${i}.clw`, toFile: 'c:/cap/prog.clw' });
        }
        graph.seedEdgesForTest(edges as never);
        const resolve = (provider as unknown as { resolveProgramViaIncluders(p: string, g: FileRelationshipGraph): string | undefined })
            .resolveProgramViaIncluders.bind(provider);
        assert.strictEqual(resolve('c:/cap/target.inc', graph), undefined);
        assert.strictEqual(resolve('c:/cap/hdr0.inc', graph), 'c:/cap/prog.clw', 'a short walk still answers');
        graph.reset();
    });
});
