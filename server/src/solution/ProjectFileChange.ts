import { ClarionProjectServer } from './clarionProjectServer';
import { DirectoryFileIndex } from './DirectoryFileIndex';
import type { FileRelationshipGraph } from '../FileRelationshipGraph';

/** The `clarion/graphStatus` payload: the Tools pane's Graph row (#434, #694). */
export interface GraphStatus {
    status: 'building' | 'built';
    fileCount: number;
    edgeCount?: number;
    durationMs?: number;
    sourceFileCount: number;
    unresolvedCount: number;
}

/**
 * Rebuild the file relationship graph from the projects' sources: the .cwproj pass (#317, with
 * `reloadProjects` since #692) and a build configuration change (#564). Returns the seed files.
 */
export async function rebuildGraph(
    graph: FileRelationshipGraph,
    projects: ClarionProjectServer[],
    options: { reloadProjects?: boolean; onStatus?: (status: GraphStatus) => void; onError?: (err: unknown) => void } = {}
): Promise<string[]> {
    if (options.reloadProjects && projects.length) await reloadProjectSourceFiles(projects);
    graph.reset();
    const { files, unresolved } = graphSeeds(projects);
    graph.unresolvedProjectSources = unresolved; // #687 — the report lists them
    // #694 — the same status the startup build sends, so the Graph row follows the rebuild.
    const sourceFileCount = files.length + unresolved.length;
    options.onStatus?.({ status: 'building', fileCount: files.length, sourceFileCount, unresolvedCount: unresolved.length });
    if (files.length) {
        await graph.buildInBackground(files).catch(err => options.onError?.(err));
    }
    options.onStatus?.({
        status: 'built',
        fileCount: graph.fileCount,
        edgeCount: graph.edgeCount,
        durationMs: graph.buildDurationMs,
        sourceFileCount,
        unresolvedCount: unresolved.length,
    });
    return files;
}

/**
 * #692 — a .cwproj changed while the solution is open. The graph rebuild (#317) seeds from each
 * project's `sourceFiles`, which were read once, when the solution loaded, so a source added to
 * the project never reached the graph and a removed one stayed in it. Re-read every project (the
 * client's notification does not say which one changed; a regeneration touches them all).
 *
 * The load directory index keeps its listings until cleared, so a file created since the load
 * would not resolve: clear it first, as `parseSolution` does.
 */
export async function reloadProjectSourceFiles(projects: ClarionProjectServer[]): Promise<void> {
    DirectoryFileIndex.getInstance().clear();
    await Promise.all(projects.map(project => project.reloadSourceFiles()));
}

/**
 * The graph's seed files: each project source's absolute path, and the ones that did not resolve
 * to a file on disk (`Project/relative path`, listed by the unresolved references report, #687).
 */
export function graphSeeds(projects: ClarionProjectServer[]): { files: string[]; unresolved: string[] } {
    const files: string[] = [];
    const unresolved: string[] = [];
    for (const project of projects) {
        for (const sourceFile of project.sourceFiles) {
            const absPath = sourceFile.getAbsolutePath();
            if (absPath) files.push(absPath);
            else unresolved.push(`${project.name}/${sourceFile.relativePath || sourceFile.name}`);
        }
    }
    return { files, unresolved };
}
