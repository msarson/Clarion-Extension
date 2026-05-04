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
