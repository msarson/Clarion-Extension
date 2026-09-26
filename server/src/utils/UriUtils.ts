/**
 * Canonical URI utilities — match VS Code's `file:///` URI form so cache keys
 * agree across construction sites.
 *
 * Background (task `5b42b29b`): VS Code's TextDocument layer hands the LSP
 * percent-encoded URIs with a lowercase drive letter — e.g.
 * `file:///c%3A/Users/.../Foo.clw`. Server-side cross-file code historically
 * built URIs by concatenating `'file:///' + path.replace(/\\/g, '/')`, which
 * on Windows produces `file:///C:/Users/.../Foo.clw` (uppercase drive,
 * unencoded colon). Both URIs reference the same physical file, but the
 * `TokenCache` keys them as different entries — duplicating cache state and
 * forcing redundant tokenization. The post-edit dedupe sweep at
 * `server.ts:728-739` (commit `f347767`) catches these on the next edit, but
 * the open→first-edit window leaves both forms live simultaneously.
 *
 * Use `pathToCanonicalUri(absPath)` at every site that constructs a URI from
 * a local OS absolute path and then passes it to `TextDocument.create` /
 * `tokenCache.getTokens`. URIs that come directly from `document.uri` (VS
 * Code's TextDocument layer) are already canonical — no helper needed.
 */

import * as fs from 'fs';
import * as path from 'path';

/** Convert a local OS absolute path to a canonical `file:///` URI matching
 *  VS Code's form (lowercase drive letter, percent-encoded colon, forward
 *  slashes). Idempotent on its own output. POSIX paths and bare filenames
 *  pass through with a `file:///` prefix only — no encoding is added beyond
 *  the Windows drive-letter colon. */
export function pathToCanonicalUri(absPath: string): string {
    let p = absPath.replace(/\\/g, '/');
    p = p.replace(/^([A-Za-z]):/, (_match, drive: string) => drive.toLowerCase() + '%3A');
    return 'file:///' + p;
}

/** #690 — pathToCanonicalUri for a value that may already be a `file:///` URI in any spelling. */
export function toCanonicalUri(pathOrUri: string): string {
    return /^file:\/\//i.test(pathOrUri)
        ? pathToCanonicalUri(decodeURIComponent(pathOrUri.replace(/^file:\/\/\/?/i, '')))
        : pathToCanonicalUri(pathOrUri);
}

/** Directory → (lower-cased entry name → entry name as listed). */
const listingCache = new Map<string, Map<string, string>>();

/**
 * #655 — `absPath` with each segment spelled as the directory lists it. For a path that went
 * through a lower-cased map key (the file graph's) on its way to a location the user sees.
 * Segment by segment rather than `fs.realpathSync.native`, which would also swap a subst or
 * mapped drive for its target. A segment that does not exist leaves the path as given.
 * Listings are cached for the session and re-read on a miss: a rename in a library folder is
 * rare, and a stale spelling is still the same file.
 */
export function onDiskSpelling(absPath: string): string {
    const parts = path.normalize(absPath).split(path.sep);
    if (parts.length < 2) return absPath;
    let current = /^[A-Za-z]:$/.test(parts[0]) ? parts[0].toUpperCase() + path.sep : parts[0] + path.sep;
    for (let i = 1; i < parts.length; i++) {
        if (!parts[i]) continue;
        const wanted = parts[i].toLowerCase();
        let listing = listingCache.get(current.toLowerCase());
        // A miss in a cached listing may be an entry created since: read the directory again.
        if (!listing?.has(wanted)) {
            try {
                listing = new Map(fs.readdirSync(current).map(name => [name.toLowerCase(), name]));
            } catch {
                return absPath;
            }
            listingCache.set(current.toLowerCase(), listing);
        }
        const actual = listing.get(wanted);
        if (!actual) return absPath;
        current = path.join(current, actual);
    }
    return current;
}
