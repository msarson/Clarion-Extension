import * as fs from 'fs';
import * as path from 'path';
import { serverSettings } from '../serverSettings';
import { RedirectionFileParserServer } from './redirectionFileParserServer';

/**
 * No-solution-mode file resolution (#113 / 403afd0e item [1]; extended in #156).
 *
 * Walks a 3-tier chain WITHOUT a SolutionManager:
 *   - **Tier 0 (localDir):** sibling of the source file derived from
 *     `sourceUri`. Matches "this INCLUDE refers to a file next to me" — the
 *     user mental model for siblings. Walked first.
 *   - **Tier 1+ (delegate to `RedirectionFileParserServer.findFile`):** the
 *     existing solution-mode parser walks `.red` entries (pattern-matched +
 *     config-filtered) → project-root → `serverSettings.libsrcPaths`.
 *     Reading from globals (`serverSettings.redirectionFile`, macros,
 *     libsrcPaths) — no `SolutionManager` dep. **#156 — this delegation
 *     is the load-bearing addition**: pre-#156 we walked only flat
 *     `libsrcPaths`, missing files routed through `.red` patterns like
 *     `*.equ = .;equates;libsrc\win` (the `equates\` subdir isn't in
 *     `libsrcPaths`). Post-#156, version `.red` redirection participates
 *     in no-solution resolution.
 *   - **Fallback path (no `.red` configured):** walk `libsrcPaths` directly
 *     (mirrors pre-#156 behavior when no Clarion version is selected).
 *
 * **Extension retry — extension-major shape:** if the input filename has no
 * extension, retry the full 3-tier chain with each
 * `serverSettings.defaultLookupExtensions` entry. Matches solution-mode's
 * `clarion/findFile` handler (server.ts:1370+) precedence: try the bare name
 * through the chain first, then each extension. Within a single
 * filename-plus-ext invocation, tier order is localDir → .red → libsrcs.
 *
 * **Domain context (Mark's IDE precedence note for #156):** Clarion IDE
 * behavior — solution-not-open → uses version `.red`; solution-open → uses
 * local `.red`; solution-closes → sticky local `.red` (doesn't revert to
 * version). This function scopes ONLY to the first state. Local `.red`
 * sticky-on-close is deferred.
 *
 * Returns `null` on miss. Caller (the `clarion/findFile` handler at
 * `server.ts`) is responsible for the silent-miss diagnostic warn when
 * `libsrcPaths` is empty.
 *
 * URI→path conversion uses the project's established inline pattern
 * (`decodeURIComponent(uri.replace('file:///',''))`).
 */
export function resolveFileInNoSolutionMode(
    filename: string,
    sourceUri: string | undefined
): { path: string, source: string } | null {
    const hit = tryFullChain(filename, sourceUri);
    if (hit) return hit;

    // Extension retry: walk full chain again for each default extension if
    // filename has no extension. Extension-major shape matches solution-mode.
    if (!path.extname(filename)) {
        for (const ext of serverSettings.defaultLookupExtensions) {
            const retry = tryFullChain(`${filename}${ext}`, sourceUri);
            if (retry) return retry;
        }
    }

    return null;
}

function tryFullChain(
    filename: string,
    sourceUri: string | undefined
): { path: string, source: string } | null {
    // Tier 0: localDir from sourceUri (sibling of source file).
    if (sourceUri) {
        const sourcePath = decodeURIComponent(sourceUri.replace('file:///', ''));
        const localDir = path.dirname(sourcePath);
        const candidate = path.normalize(path.join(localDir, filename));
        if (fs.existsSync(candidate)) {
            return { path: candidate, source: 'local' };
        }
    }

    // Tier 1+: delegate to RedirectionFileParserServer.findFile() when a
    // `.red` file is configured. It walks .red entries → project-root →
    // libsrcs internally.
    if (serverSettings.redirectionFile) {
        const parser = new RedirectionFileParserServer();
        // projectPath anchor for `.` and relative entries — use the .red's
        // own directory in no-solution mode (the parser's existing fallback
        // semantics when projectPath is unset). Explicit-pass keeps
        // resolution deterministic + traceable.
        parser.parseRedFile(path.dirname(serverSettings.redirectionFile));
        const redHit = parser.findFile(filename);
        if (redHit) {
            // FilePathSource enum's string values ('redirected' / 'project' /
            // 'libsrc') pass through as our informal source labels.
            return { path: redHit.path, source: redHit.source };
        }
        return null;
    }

    // Fallback: no `.red` configured → walk libsrcPaths directly. Preserves
    // pre-#156 behavior when no Clarion version is selected.
    for (const libDir of (serverSettings.libsrcPaths ?? [])) {
        if (!libDir) continue;
        const candidate = path.normalize(path.join(libDir, filename));
        if (fs.existsSync(candidate)) {
            return { path: candidate, source: 'libsrc' };
        }
    }

    return null;
}
