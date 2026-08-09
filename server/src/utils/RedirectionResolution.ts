import * as fs from 'fs';

/**
 * #328 — shared owner-project-first redirection resolution.
 *
 * In a multi-project solution several projects can redirect the same
 * filename to different physical copies. The compiler building the FROM
 * file's project uses THAT project's redirection, so every resolver acting
 * on behalf of a specific source file must consult the owning project's
 * parser FIRST; the solution-order walk is only the fallback for files no
 * project owns (loose files, redirection-discovered files). This is the
 * same rule FileRelationshipGraph.resolveFile adopted at #315.
 *
 * Returns the fs-verified resolved path, or null.
 */
export function resolveViaProjectRedirection(fileName: string, fromFsPath: string | null): string | null {
    // Lazy require — several utils/providers sit in import cycles with the
    // solution module (FileDefinitionResolver used the same pattern).
    const SolutionManager = require('../solution/solutionManager').SolutionManager;
    const solutionManager = SolutionManager.getInstance();
    if (!solutionManager?.solution) return null;

    if (fromFsPath) {
        const owner = solutionManager.findProjectForFile?.(fromFsPath);
        // #233 Stage 2: a project may have no redirection parser (test shims,
        // degraded loads) — guard before use, here and in the loop below.
        const ownerParser = owner?.getRedirectionParser?.();
        if (ownerParser) {
            const resolved = ownerParser.findFile(fileName);
            if (resolved?.path && fs.existsSync(resolved.path)) {
                return resolved.path;
            }
        }
    }

    for (const project of solutionManager.solution.projects) {
        const parser = project.getRedirectionParser?.();
        if (!parser) continue;
        const resolved = parser.findFile(fileName);
        if (resolved?.path && fs.existsSync(resolved.path)) {
            return resolved.path;
        }
    }
    return null;
}

/** Convenience overload for callers holding a file:// URI instead of a path. */
export function resolveViaProjectRedirectionFromUri(fileName: string, fromUri: string): string | null {
    const fsPath = decodeURIComponent(fromUri.replace(/^file:\/\/\/?/i, '')).replace(/\//g, '\\');
    return resolveViaProjectRedirection(fileName, fsPath);
}

/**
 * #328 — the solution's projects reordered with the FROM file's owning
 * project first. For resolution loops that carry per-project logic beyond
 * findFile (implementation-presence checks, DLL→source rerouting) this
 * preserves the loop's retry semantics while fixing the ordering: the
 * owner's redirection answer is tried before other projects can shadow it.
 * Returns [] when no solution is loaded.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function projectsOwnerFirst(fromFsPath: string | null): any[] {
    const SolutionManager = require('../solution/solutionManager').SolutionManager;
    const solutionManager = SolutionManager.getInstance();
    if (!solutionManager?.solution) return [];

    const projects = [...solutionManager.solution.projects];
    if (!fromFsPath) return projects;
    const owner = solutionManager.findProjectForFile?.(fromFsPath);
    if (!owner) return projects;
    return [owner, ...projects.filter((p: unknown) => p !== owner)];
}
