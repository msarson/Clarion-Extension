/**
 * #345 phase 4 — shared invalidation epoch for cross-file result memos.
 *
 * Validators memoize expensive cross-file work (VIEW field resolution, RVD
 * receiver types / class enumerations) keyed by (docUri, docVersion, epoch).
 * The document version covers edits to the host file; the epoch covers
 * everything else: the #340 watched-files handler bumps it whenever ANY
 * workspace file changes, so no memo can serve a result computed against
 * files that have since changed.
 */
let epoch = 0;

export function getCrossFileEpoch(): number {
    return epoch;
}

export function bumpCrossFileEpoch(): void {
    epoch++;
}
