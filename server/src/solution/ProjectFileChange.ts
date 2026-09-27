import { ClarionProjectServer } from './clarionProjectServer';
import { DirectoryFileIndex } from './DirectoryFileIndex';

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
