import * as assert from 'assert';
import * as path from 'path';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { TokenCache } from '../TokenCache';
import { ScopeAnalyzer } from '../utils/ScopeAnalyzer';
import { SolutionManager } from '../solution/solutionManager';
import { StructureDeclarationIndexer, StructureDeclarationInfo } from '../utils/StructureDeclarationIndexer';
import { SymbolFinderService } from '../services/SymbolFinderService';
import { MemberLocatorService } from '../services/MemberLocatorService';
import { FileRelationshipGraph } from '../FileRelationshipGraph';

/**
 * The project index holds every include file in the project's directories, so a stray copy of a
 * dictionary include that nothing compiles is indexed beside the real one, both declaring the
 * same FILE. findIndexedTypeDeclaration - behind type hover, Go to Definition and SELF/PARENT
 * class resolution - took the first hit, and could name the stray copy. It now prefers the
 * declaration the document can reach: from itself, or from its PROGRAM, which for an included
 * class header is the PROGRAM of the modules that include it.
 */
suite('findIndexedTypeDeclaration prefers the declaration the document can reach', () => {
    const dir = 'c:/reach';
    const at = (name: string) => `${dir}/${name}`;
    const stray = at('olddct.inc');
    const real = at('appdct.inc');

    let savedSm: unknown;
    let origFind: typeof StructureDeclarationIndexer.prototype.find;
    let origBuild: typeof StructureDeclarationIndexer.prototype.getOrBuildIndex;
    let origHasAny: typeof StructureDeclarationIndexer.prototype.hasAnyIndex;

    const decl = (filePath: string): StructureDeclarationInfo => ({
        name: 'Widget', filePath, line: 0, structureType: 'FILE', isType: false, lineContent: 'Widget FILE',
    } as StructureDeclarationInfo);

    setup(() => {
        savedSm = (SolutionManager as unknown as { instance: unknown }).instance;
        // As in a real project: the modules are source files, so they take the project-index
        // branch; an included header is listed as `None`, is no project member, and takes the
        // other branch - which consults the same, already-built index.
        (SolutionManager as unknown as { instance: unknown }).instance = {
            solution: undefined,
            findProjectForFile: (p: string) => p.toLowerCase().endsWith('.clw') ? { path: dir } : undefined,
        };
        origFind = StructureDeclarationIndexer.prototype.find;
        origBuild = StructureDeclarationIndexer.prototype.getOrBuildIndex;
        origHasAny = StructureDeclarationIndexer.prototype.hasAnyIndex;
        StructureDeclarationIndexer.prototype.getOrBuildIndex = (async () => ({})) as unknown as typeof origBuild;
        StructureDeclarationIndexer.prototype.hasAnyIndex = (() => true) as typeof origHasAny;
        // The stray copy comes FIRST, as it did for the reported hover.
        StructureDeclarationIndexer.prototype.find = ((name: string) =>
            name.toLowerCase() === 'widget' ? [decl(stray), decl(real)] : []) as typeof origFind;

        const graph = FileRelationshipGraph.getInstance();
        graph.reset();
        graph.seedEdgesForTest([
            { type: 'INCLUDE', fromFile: at('prog.clw'), toFile: real },
            { type: 'MEMBER', fromFile: at('mod.clw'), toFile: at('prog.clw') },
            { type: 'INCLUDE', fromFile: at('mod.clw'), toFile: at('classhdr.inc') },
            { type: 'MEMBER', fromFile: at('member.clw'), toFile: at('prog.clw') },
            { type: 'INCLUDE', fromFile: at('mod-shim.clw'), toFile: at('member.clw') },
            { type: 'MEMBER', fromFile: at('elsewhere.clw'), toFile: at('otherprog.clw') },
        ] as never);
    });

    teardown(() => {
        (SolutionManager as unknown as { instance: unknown }).instance = savedSm;
        StructureDeclarationIndexer.prototype.find = origFind;
        StructureDeclarationIndexer.prototype.getOrBuildIndex = origBuild;
        StructureDeclarationIndexer.prototype.hasAnyIndex = origHasAny;
        FileRelationshipGraph.getInstance().reset();
        TokenCache.getInstance().clearAllTokens();
    });

    const resolveFrom = async (file: string) => {
        const cache = TokenCache.getInstance();
        const service = new SymbolFinderService(cache, new ScopeAnalyzer(cache, SolutionManager.getInstance()));
        const doc = TextDocument.create(`file:///${at(file)}`, 'clarion', 1, '');
        const info = await service.findIndexedTypeDeclaration('Widget', doc);
        return info ? path.basename(info.filePath) : null;
    };

    test('from a MEMBER module: the include its PROGRAM compiles', async () => {
        assert.strictEqual(await resolveFrom('mod.clw'), 'appdct.inc');
    });

    test('from an included class header (no project member): through the modules that include it', async () => {
        assert.strictEqual(await resolveFrom('classhdr.inc'), 'appdct.inc');
    });

    test('from a module whose MEMBER is in a shim', async () => {
        assert.strictEqual(await resolveFrom('mod-shim.clw'), 'appdct.inc');
    });

    test('when neither copy is reachable, the first declaration answers as before', async () => {
        assert.strictEqual(await resolveFrom('elsewhere.clw'), 'olddct.inc');
    });

    // The same two copies serve a FIELD hover (`Widget.Notes`) through resolveSdiDeclaration, whose
    // own-directory tiebreak cannot separate two files that sit in the same folder.
    const sdiFrom = async (file: string) => {
        const service = new MemberLocatorService();
        // The stray copy first, both in the document's own directory.
        (service as unknown as { sdi: { findFor: () => StructureDeclarationInfo[] } }).sdi = { findFor: () => [decl(stray), decl(real)] };
        (service as unknown as { ensureIndexBuilt: () => Promise<void> }).ensureIndexBuilt = async () => { /* nothing to build */ };
        (service as unknown as { loadDocument: (p: string) => Promise<unknown> }).loadDocument = async (p: string) => ({ doc: { uri: p }, tokens: [] });
        const hit = await service.resolveSdiDeclaration('Widget', dir, at(file));
        return hit ? path.basename(hit.filePath) : null;
    };

    test('field hover: the SDI declaration is the visible copy, not the first one in the folder', async () => {
        assert.strictEqual(await sdiFrom('mod.clw'), 'appdct.inc');
        assert.strictEqual(await sdiFrom('classhdr.inc'), 'appdct.inc');
    });

    test('field hover: with nothing visible the directory tiebreak still decides', async () => {
        assert.strictEqual(await sdiFrom('elsewhere.clw'), 'olddct.inc');
    });
});
