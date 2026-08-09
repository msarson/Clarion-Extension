import { createHash } from 'crypto';

/**
 * #359 — decides whether a document event carries content that actually differs
 * from the last content the change-pipeline accepted.
 *
 * The vscode-languageserver TextDocuments manager fires onDidChangeContent for
 * BOTH didOpen and didChange, and clients can emit no-op didChange events (tab
 * activation). Each echo previously ran the full change pipeline — cache
 * evictions, a second self-validation of a just-validated document, and
 * `revalidateRelatedDocuments`, which re-validated the (68k-token) parent
 * PROGRAM of a MEMBER file the user merely opened. This guard lets the
 * pipeline skip identical-content events entirely: snapshot on open, compare
 * on change, re-snapshot when a change is accepted.
 *
 * Comparison is length-first (a real edit almost always changes length — no
 * hash paid), then sha1 (same length ⇒ ~2ms on an 856K file, well under the
 * pipeline's existing per-event line-diff cost).
 */
export class ContentChangeGuard {
    private snapshots = new Map<string, { length: number; hash: string }>();

    private static hash(text: string): string {
        return createHash('sha1').update(text).digest('hex');
    }

    /** Record the content the pipeline has accepted for this uri (open or accepted change). */
    snapshot(uri: string, text: string): void {
        this.snapshots.set(uri, { length: text.length, hash: ContentChangeGuard.hash(text) });
    }

    /**
     * True when `text` differs from the last snapshot for this uri — the event
     * is a genuine change and the pipeline should run (callers should then
     * `snapshot()` the new content). Also true when no snapshot exists (never
     * seen — treat as changed, defensively).
     */
    hasChanged(uri: string, text: string): boolean {
        const snap = this.snapshots.get(uri);
        if (!snap) return true;
        if (snap.length !== text.length) return true;
        return snap.hash !== ContentChangeGuard.hash(text);
    }

    /** Drop the snapshot when the document closes. */
    clear(uri: string): void {
        this.snapshots.delete(uri);
    }
}
