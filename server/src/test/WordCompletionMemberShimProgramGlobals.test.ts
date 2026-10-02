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
 * A MEMBER module can take its MEMBER('program') from a shim it INCLUDEs as its first statement
 * (`INCLUDE('member.clw')`), so one source tree can belong to different PROGRAMs by swapping the
 * shim. Hover and go-to-definition follow that shim; word completion did not, so in such a module
 * it offered none of the PROGRAM's globals — the graph records the MEMBER edge on the shim, and
 * the module's own tokens carry no MEMBER.
 */
suite('Word completion finds the PROGRAM through a MEMBER-via-INCLUDE shim', () => {
    let dir = '';
    let savedSm: unknown;
    let provider: WordCompletionProvider;

    const body = [
        '  MAP',
        '  END',
        'Work PROCEDURE()',
        '  CODE',
        '  Glob:',
        '',
    ];
    const moduleText = (header: string) => [header, ...body].join('\r\n');

    suiteSetup(() => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wcshim-'));
        const write = (name: string, text: string) => fs.writeFileSync(path.join(dir, name), text);
        write('prog.clw', ['  PROGRAM', '  MAP', '  END', 'Glob:Own            LONG', '  CODE', ''].join('\r\n'));
        write('member.clw', "  MEMBER('prog.clw')\r\n");
        write('member-noext.clw', "  MEMBER('prog')\r\n");
        write('member-outer.clw', "  INCLUDE('member.clw')\r\n");
        write('member-cycle.clw', "  INCLUDE('member-cycle.clw')\r\n");

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

    const labelsFor = async (fileName: string, header: string) => {
        const text = moduleText(header);
        fs.writeFileSync(path.join(dir, fileName), text);
        const doc = TextDocument.create(`file:///${path.join(dir, fileName).replace(/\\/g, '/')}`, 'clarion', 1, text);
        TokenCache.getInstance().getTokens(doc);
        return (await provider.provide(doc, { line: 5, character: 7 }, 'Glob:'))
            .map(i => String(i.label).toLowerCase());
    };

    test('a literal MEMBER still finds the PROGRAM (unchanged path)', async () => {
        const got = await labelsFor('literal.clw', "  MEMBER('prog.clw')");
        assert.ok(got.includes('own'), got.slice(0, 20).join(', '));
    });

    test('a module whose MEMBER is in an INCLUDEd shim gets the PROGRAM\'s globals', async () => {
        const got = await labelsFor('shimmed.clw', "  INCLUDE('member.clw')");
        assert.ok(got.includes('own'), `PROGRAM global missing: ${got.slice(0, 20).join(', ')}`);
    });

    test('a shim that INCLUDEs another shim is followed (bounded hops)', async () => {
        const got = await labelsFor('chained.clw', "  INCLUDE('member-outer.clw')");
        assert.ok(got.includes('own'), got.slice(0, 20).join(', '));
    });

    test('an extension-less MEMBER target in the shim resolves as .clw', async () => {
        const got = await labelsFor('noext.clw', "  INCLUDE('member-noext.clw')");
        assert.ok(got.includes('own'), got.slice(0, 20).join(', '));
    });

    test('a shim that INCLUDEs itself ends the walk instead of looping', async () => {
        const got = await labelsFor('cycle.clw', "  INCLUDE('member-cycle.clw')");
        assert.ok(!got.includes('own'), got.slice(0, 20).join(', '));
    });
});
