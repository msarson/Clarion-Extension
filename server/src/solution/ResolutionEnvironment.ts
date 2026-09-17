import { serverSettings } from '../serverSettings';
import { SolutionManager } from './solutionManager';
import { RedirectionFileParserServer } from './redirectionFileParserServer';
import { IncludeVerifier } from '../utils/IncludeVerifier';
import { StructureDeclarationIndexer } from '../utils/StructureDeclarationIndexer';
import { FileRelationshipGraph } from '../FileRelationshipGraph';
import { evictIncludeChainIndexes } from '../services/SymbolFinderService';
import { bumpCrossFileEpoch } from '../utils/crossFileEpoch';
import { resolutionEnvironmentKey } from './resolutionEnvironmentKey';

export { resolutionEnvironmentKey };

/** The settings of the Clarion install that file resolution runs under, as `clarion/updatePaths` sends them. */
export interface ResolutionEnvironmentParams {
    clarionVersion?: string;
    redirectionFile?: string;
    redirectionPaths?: string[];
    macros?: Record<string, string>;
    libsrcPaths?: string[];
}

/**
 * #568 — apply the install settings from `clarion/updatePaths`. Returns true when they differ from
 * the environment already in force, and then drops everything resolved under the old one, so the
 * load that follows rebuilds as on a cold start:
 *
 * - the solution manager: `create()` reuses the instance for the same .sln, and its projects keep a
 *   redirection parser with the old macros and search paths cached per configuration only; the
 *   solution cache holds those projects too
 * - the redirection parser's parse caches (entries are stored with macros already expanded)
 * - the include verifier, the include-chain indexes and every cross-file memo
 * - the declaration index and the file relationship graph
 *
 * The disk caches need no clearing: their identity carries `resolutionEnvironmentKey()`, so another
 * install reads and writes its own entries and switching back stays warm.
 */
export function applyResolutionEnvironment(params: ResolutionEnvironmentParams): boolean {
    const previous = resolutionEnvironmentKey();
    serverSettings.redirectionPaths = params.redirectionPaths || [];
    serverSettings.clarionVersion = params.clarionVersion || "";
    serverSettings.macros = params.macros || {};
    serverSettings.libsrcPaths = params.libsrcPaths || [];
    serverSettings.redirectionFile = params.redirectionFile || "";
    if (resolutionEnvironmentKey() === previous) return false;

    SolutionManager.discardInstance();
    SolutionManager.clearAllCaches();
    RedirectionFileParserServer.clearParseCaches();
    IncludeVerifier.getInstance().clearCache();
    evictIncludeChainIndexes();
    bumpCrossFileEpoch();
    StructureDeclarationIndexer.getInstance().clearCache();
    FileRelationshipGraph.getInstance().reset();
    return true;
}
