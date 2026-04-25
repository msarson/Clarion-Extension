/**
 * LocalMapScopeHelper
 * Queries the FileRelationshipGraph to determine whether a given implementation
 * file is the target of a procedure-local MODULE declaration (local MAP scope).
 *
 * Usage: providers call getLocalMapScope(fileUri) before calling resolvers.
 * If the result is non-null, pass result.containingProcedure to resolvers so
 * they filter to the correct MAP block.
 */

import { FileRelationshipGraph } from '../FileRelationshipGraph';
import LoggerManager from '../logger';

const logger = LoggerManager.getLogger("LocalMapScopeHelper");
logger.setLevel("error");

export interface LocalMapScope {
    /** The procedure whose data-section MAP declares the MODULE pointing at this file */
    containingProcedure: string;
    /** The file (lowercase forward-slash) that contains the declaring MAP/MODULE */
    declaringFile: string;
}

/**
 * Returns local-MAP scope info for an implementation file, or null if the file
 * is reached via a global MAP (or the graph has no data yet).
 *
 * @param fileUri  URI string (file:///...) or absolute path of the implementation file
 */
export function getLocalMapScope(fileUri: string): LocalMapScope | null {
    const graph = FileRelationshipGraph.getInstance();
    if (!graph.isBuilt) return null;

    // Normalise to lowercase forward-slash path (graph storage format)
    const filePath = decodeURIComponent(fileUri.replace(/^file:\/\/\//i, ''))
        .replace(/\\/g, '/')
        .toLowerCase();

    const edges = graph.getModuleDeclarants(filePath);
    // A local-MAP edge has containingProcedure set; a global-MAP edge does not.
    const localEdge = edges.find(e => !!e.containingProcedure);
    if (!localEdge) return null;

    logger.info(`✅ [LocalMapScope] ${filePath} is local-MAP inside '${localEdge.containingProcedure}' declared in ${localEdge.fromFile}`);
    return {
        containingProcedure: localEdge.containingProcedure!,
        declaringFile: localEdge.fromFile
    };
}
