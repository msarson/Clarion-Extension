import { serverSettings } from '../serverSettings';
import { SolutionManager } from './solutionManager';
import { IncludeVerifier } from '../utils/IncludeVerifier';
import { evictIncludeChainIndexes } from '../services/SymbolFinderService';
import { bumpCrossFileEpoch } from '../utils/crossFileEpoch';

/** `Debug|Win32` → `debug`: configurations compare by name, case-insensitively. */
function configurationName(value: string): string {
    return value.split('|')[0].trim().toLowerCase();
}

/**
 * #564 — apply a build configuration change sent by the client (`clarion/updateConfiguration`).
 *
 * The redirection lookup already filters `[Debug]`/`[Release]`/custom sections by
 * `serverSettings.configuration` at lookup time, and a project's search paths are cached per
 * configuration. What outlived a switch were the results keyed by file name alone: the solution
 * manager's resolved-path and negative caches, the include verifier's path caches and the
 * include-chain indexes, and every cross-file memo built on them. Those are dropped here.
 *
 * The file relationship graph and the structure declaration index are rebuilt by the
 * notification handler in server.ts; the graph's disk cache signature carries the configuration
 * name, so the rebuild re-resolves instead of replaying the old configuration's edges.
 *
 * Returns false when `next` names the configuration already active (in either spelling).
 */
export function applyConfigurationChange(next: string): boolean {
    if (!next || configurationName(next) === configurationName(serverSettings.configuration || '')) {
        return false;
    }
    serverSettings.configuration = next;
    SolutionManager.getInstance()?.clearResolvedFileCaches();
    IncludeVerifier.getInstance().clearCache();
    evictIncludeChainIndexes();
    bumpCrossFileEpoch();
    return true;
}
