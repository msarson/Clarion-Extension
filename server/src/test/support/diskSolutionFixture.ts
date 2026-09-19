/**
 * A throwaway one-project "solution" on disk, so the StructureDeclarationIndexer (SDI) indexes
 * real files and cross-file tiers (parent-class chains, include files) run as they do in the
 * product. Mirrors the setup ChainedOverloadResolution.DiskFixture.test.ts pioneered.
 *
 *   const fx = createDiskSolution({ 'classes.inc': [...], 'caller.clw': [...] });
 *   const doc = fx.open('caller.clw');
 *   ...
 *   fx.dispose();
 *
 * Only one may be active at a time: it swaps the SolutionManager singleton and serverSettings.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { TokenCache } from '../../TokenCache';
import { SolutionManager } from '../../solution/solutionManager';
import { StructureDeclarationIndexer } from '../../utils/StructureDeclarationIndexer';
import { serverSettings } from '../../serverSettings';

export interface DiskSolution {
    root: string;
    uriOf(file: string): string;
    /** Opens (tokenises) a fixture file as a TextDocument. */
    open(file: string): TextDocument;
    dispose(): void;
}

let active = false;

export function createDiskSolution(files: Record<string, string[]>): DiskSolution {
    if (active) throw new Error('disk solution fixture already active - dispose() the previous one');
    active = true;

    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'clarion-fixture-'));
    for (const [name, lines] of Object.entries(files)) fs.writeFileSync(path.join(root, name), lines.join('\r\n'));
    // Must exist and parse for the SDI gate; the scan dir itself comes from libsrcPaths.
    fs.writeFileSync(path.join(root, 'test.red'), '[Copy]\n*.* = .\n');

    const savedRed = serverSettings.redirectionFile;
    const savedLibsrc = serverSettings.libsrcPaths;
    serverSettings.redirectionFile = 'test.red';
    serverSettings.libsrcPaths = [root];

    const sources = Object.keys(files).filter(f => /\.clw$/i.test(f));
    const project = {
        name: 'FixtureProj',
        path: root,
        sourceFiles: sources.map(f => ({ relativePath: f, getAbsolutePath: () => path.join(root, f) })),
        getRedirectionParser: () => ({ findFile: (name: string) => {
            const p = path.join(root, name);
            return fs.existsSync(p) ? { path: p, source: 'fixture' } : null;
        } }),
    };
    const fake = {
        solution: { projects: [project] },
        findProjectForFile: () => project,
        getProjectPathForFile: () => root,
        getEquatesTokens: () => null,
        getEquatesPath: () => null,
    } as unknown as SolutionManager;
    const holder = SolutionManager as unknown as { instance: SolutionManager | null };
    const savedSm = holder.instance;
    holder.instance = fake;
    StructureDeclarationIndexer.getInstance().clearCache();

    const uriOf = (file: string) => `file:///${path.join(root, file).replace(/\\/g, '/')}`;
    const opened: string[] = [];

    return {
        root,
        uriOf,
        open(file: string) {
            const doc = TextDocument.create(uriOf(file), 'clarion', 1, files[file].join('\r\n'));
            TokenCache.getInstance().getTokens(doc);
            opened.push(doc.uri);
            return doc;
        },
        dispose() {
            holder.instance = savedSm;
            serverSettings.redirectionFile = savedRed;
            serverSettings.libsrcPaths = savedLibsrc;
            StructureDeclarationIndexer.getInstance().clearCache();
            for (const u of opened) TokenCache.getInstance().clearTokens(u);
            try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* best effort */ }
            active = false;
        },
    };
}
