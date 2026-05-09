import * as path from 'path';
import { SolutionManager } from '../solution/solutionManager';
import { serverSettings } from '../serverSettings';

/**
 * Build the directory set scanned for `.inc` files by FAR's interface-method
 * branch (`ReferencesProvider.findReferences`).
 *
 * Canonical 3-layer chain (audit follow-up Q1 from 8c874d32, task 8f1965c3):
 *   - Layer 2 (sibling of currently-open file)
 *   - Layer 1 (RED-derived `.inc` directories via `project.getSearchPaths('.inc')`,
 *     post-bd7e4a29 build-config-aware — only entries for `Common` or the
 *     active `serverSettings.configuration` are returned)
 *   - Layer 3 (`serverSettings.libsrcPaths`)
 *
 * Lowercase normalization preserved for case-insensitive Windows dedup;
 * Set guarantees a directory reachable via multiple sources is enumerated once.
 *
 * Note: relative paths in RED entries are resolved by `getSearchPaths` against
 * `path.dirname(entry.redFile)` (latent bug tracked as task ff28f45f, parallel
 * to 01d635ef + cfaa7584 in the parser side). Project-local reds are unaffected.
 */
export function buildIncDirsToScan(
    currentFilePath: string,
    solutionManager: SolutionManager | null
): Set<string> {
    const dirs = new Set<string>([path.dirname(currentFilePath).toLowerCase()]);
    const projectSearchDirs = solutionManager?.solution
        ? solutionManager.solution.projects.flatMap(p => p.getSearchPaths('.inc'))
        : [];
    for (const d of projectSearchDirs) {
        dirs.add(d.toLowerCase());
    }
    for (const lp of (serverSettings.libsrcPaths ?? [])) {
        if (lp) { dirs.add(lp.toLowerCase()); }
    }
    return dirs;
}
