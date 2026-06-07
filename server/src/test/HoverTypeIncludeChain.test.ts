import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { TokenCache } from '../TokenCache';
import { ScopeAnalyzer } from '../utils/ScopeAnalyzer';
import { SolutionManager } from '../solution/solutionManager';
import { StructureDeclarationIndexer } from '../utils/StructureDeclarationIndexer';
import { SymbolFinderService } from '../services/SymbolFinderService';

/**
 * Issue #184 — type resolution (hover/F12) must NOT rebuild the whole libsrc
 * StructureDeclarationIndexer for a file that isn't a solution member. Instead it
 * resolves via the file's own INCLUDE chain (the Clarion compilation model) —
 * fast, bounded, solution-independent.
 *
 * Repro shape: a loose `.clw` (no solution loaded) that INCLUDEs a `.inc`
 * declaring a TYPE. `findIndexedTypeDeclaration` is the shared chokepoint behind
 * `HoverProvider.checkClassTypeHover` and `DefinitionProvider.findClassTypeDefinition`.
 *
 * Key guarantees:
 *   - the type resolves via the INCLUDE chain, and
 *   - NO directory-keyed SDI index is built (that's the libsrc-wide rescan that
 *     was blowing the 10s hover/F12 timeout).
 */

let tmpRoot = '';
let savedSm: SolutionManager | null = null;

function makeService(): SymbolFinderService {
    const tokenCache = TokenCache.getInstance();
    const scopeAnalyzer = new ScopeAnalyzer(tokenCache, SolutionManager.getInstance());
    return new SymbolFinderService(tokenCache, scopeAnalyzer);
}

suite('Issue #184 — type resolution via INCLUDE chain (no libsrc-wide rebuild)', () => {

    setup(() => {
        tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), '184-inc-chain-'));
        // Force no-solution mode so a cache miss would otherwise trigger the
        // dir-keyed fallback build — the path this fix must avoid.
        savedSm = (SolutionManager as unknown as { instance: SolutionManager | null }).instance;
        (SolutionManager as unknown as { instance: SolutionManager | null }).instance = null;
        StructureDeclarationIndexer.getInstance().clearCache();

        fs.writeFileSync(path.join(tmpRoot, 'types.inc'), [
            'LinesGroupType  CLASS,TYPE',
            'line              STRING(255)',
            'count             LONG',
            '                END',
            '',
        ].join('\n'));
    });

    teardown(() => {
        (SolutionManager as unknown as { instance: SolutionManager | null }).instance = savedSm;
        savedSm = null;
        StructureDeclarationIndexer.getInstance().clearCache();
        try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch { /* best-effort */ }
    });

    function consumerDoc(): TextDocument {
        const p = path.join(tmpRoot, 'consumer.clw');
        const content = [
            '  MEMBER()',
            "  INCLUDE('types.inc'),ONCE",
            '',
        ].join('\n');
        fs.writeFileSync(p, content);
        return TextDocument.create(`file:///${p.replace(/\\/g, '/')}`, 'clarion', 1, content);
    }

    test('resolves an INCLUDEd type and does NOT build a directory-keyed index', async () => {
        const doc = consumerDoc();
        const service = makeService();

        const info = await service.findIndexedTypeDeclaration('LinesGroupType', doc);

        assert.ok(info !== null, 'expected LinesGroupType to resolve via the INCLUDE chain');
        assert.strictEqual(info!.name, 'LinesGroupType');
        assert.strictEqual(info!.structureType, 'CLASS');
        assert.strictEqual(path.basename(info!.filePath).toLowerCase(), 'types.inc');

        // The fix's whole point: no libsrc-wide / dir-keyed SDI build was triggered.
        const sdi = StructureDeclarationIndexer.getInstance();
        assert.strictEqual(sdi.isIndexed(tmpRoot), false,
            'must NOT have built a directory-keyed index for the loose file');
        assert.strictEqual(sdi.hasAnyIndex(), false,
            'no SDI index should have been built at all — resolution came from the INCLUDE chain');
    });

    test('unknown type resolves to null without hanging (no index built)', async () => {
        const doc = consumerDoc();
        const service = makeService();

        const info = await service.findIndexedTypeDeclaration('NoSuchType', doc);
        assert.strictEqual(info, null, 'unknown type must resolve to null');
    });
});
