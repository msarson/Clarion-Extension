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
 *     post-bd7e4a29 build-config-aware)
 *   - Layer 3 (`serverSettings.libsrcPaths`)
 *
 * Lowercase normalization preserved for case-insensitive Windows dedup.
 *
 * STUB IMPLEMENTATION (8f1965c3 RED phase): currently mirrors the
 * pre-existing inline scope at `ReferencesProvider.ts:355-358` —
 * sibling + libsrc only, no project search paths. Alice replaces with
 * the full chain above. Tests 1 + 4 RED on stub; tests 2/3/5/6 GREEN
 * on stub.
 */
export function buildIncDirsToScan(
    currentFilePath: string,
    _solutionManager: SolutionManager | null
): Set<string> {
    const dirs = new Set<string>([path.dirname(currentFilePath).toLowerCase()]);
    for (const lp of (serverSettings.libsrcPaths ?? [])) {
        if (lp) { dirs.add(lp.toLowerCase()); }
    }
    return dirs;
}
