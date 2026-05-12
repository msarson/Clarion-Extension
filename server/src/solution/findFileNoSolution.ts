import * as fs from 'fs';
import * as path from 'path';
import { serverSettings } from '../serverSettings';

/**
 * No-solution-mode file resolution (#113 / 403afd0e item [1]).
 *
 * Walks the same tier chain the redirection parser uses, but without a
 * SolutionManager:
 *   1. localDir derived from `sourceUri` (sibling of the source file)
 *   2. `serverSettings.libsrcPaths` in declared order — version-bound per
 *      dd87633f B1.
 *   3. `serverSettings.defaultLookupExtensions` retry if filename has no
 *      extension (re-walks both tiers above with each candidate extension).
 *
 * Returns `null` on miss. The caller (the `clarion/findFile` handler at
 * `server.ts`) is responsible for the silent-miss diagnostic warn when
 * `libsrcPaths` is empty.
 *
 * Reads from the global `serverSettings` to match the rest of the server
 * module's convention. Tests monkey-patch `serverSettings.libsrcPaths` +
 * `SolutionManager.instance` via `NoSolutionFixture` (see
 * `server/src/test/helpers/NoSolutionFixture.ts`).
 *
 * URI→path conversion uses the project's established inline pattern
 * (`decodeURIComponent(uri.replace('file:///',''))`), cf. `server.ts:704`,
 * `CrossFileResolver.ts:70`, `MethodOverloadResolver.ts:181`. `vscode-uri`
 * is not a server dependency; flagged as a deferred follow-up to extract
 * a shared `UriUtils.uriToPath` companion to `pathToCanonicalUri`.
 */
export function resolveFileInNoSolutionMode(
    filename: string,
    sourceUri: string | undefined
): { path: string, source: string } | null {
    const candidates: { path: string, source: string }[] = [];

    let localDir: string | null = null;
    if (sourceUri) {
        const sourcePath = decodeURIComponent(sourceUri.replace('file:///', ''));
        localDir = path.dirname(sourcePath);
        candidates.push({ path: path.join(localDir, filename), source: "local" });
    }
    for (const libDir of (serverSettings.libsrcPaths ?? [])) {
        if (libDir) candidates.push({ path: path.join(libDir, filename), source: "libsrc" });
    }
    if (!path.extname(filename)) {
        for (const ext of serverSettings.defaultLookupExtensions) {
            const filenameWithExt = `${filename}${ext}`;
            if (localDir) {
                candidates.push({ path: path.join(localDir, filenameWithExt), source: "local" });
            }
            for (const libDir of (serverSettings.libsrcPaths ?? [])) {
                if (libDir) candidates.push({ path: path.join(libDir, filenameWithExt), source: "libsrc" });
            }
        }
    }

    for (const c of candidates) {
        const normalized = path.normalize(c.path);
        if (fs.existsSync(normalized)) {
            return { path: normalized, source: c.source };
        }
    }

    return null;
}
