/**
 * #189 — Precomputed reference index (Phase 1: data structure only).
 *
 * Maps a normalized symbol key → every reference site across the solution, so a
 * reference COUNT (CodeLens) or Find-All-References becomes an O(refs) lookup
 * instead of a per-request file scan. Built once at solution-load and maintained
 * incrementally per file (see the `byFile` reverse map, which lets a single
 * changed file drop + replace exactly its own contributions).
 *
 * This file is the pure substrate — it has NO resolution logic and is not wired
 * to any provider yet (Phase 2 builds + queries it). Keeping it dependency-free
 * (no vscode / server imports) makes it trivially unit-testable.
 *
 * Symbol-key convention (mirrors how references resolve; see #189):
 *   - global procedure:      `proc:<name>`
 *   - class method:          `method:<class>.<method>`
 *   - interface method impl: `method:<class>.<iface>.<method>`
 *   - class type:            `type:<name>`
 * All lowercased by the producer. This module treats keys as opaque strings.
 */

export interface ReferenceSite {
    uri: string;
    line: number;
    character: number;
}

export class ReferenceIndex {
    /** symbolKey → reference sites across the whole solution. */
    private bySymbol = new Map<string, ReferenceSite[]>();
    /** file uri (lowercased) → the symbolKeys that file contributes sites to. */
    private byFile = new Map<string, Set<string>>();
    private ready = false;

    private fileKey(uri: string): string {
        return uri.toLowerCase();
    }

    /** Record a single reference site for `symbolKey`. */
    add(symbolKey: string, site: ReferenceSite): void {
        let sites = this.bySymbol.get(symbolKey);
        if (!sites) { sites = []; this.bySymbol.set(symbolKey, sites); }
        sites.push(site);

        const fk = this.fileKey(site.uri);
        let keys = this.byFile.get(fk);
        if (!keys) { keys = new Set<string>(); this.byFile.set(fk, keys); }
        keys.add(symbolKey);
    }

    /**
     * Replace all of a file's contributions: drop the file's existing sites, then
     * add the freshly-extracted ones. Used for incremental updates on edit so a
     * single changed file never forces a full rebuild.
     */
    reindexFile(uri: string, sites: ReadonlyArray<{ symbolKey: string; site: ReferenceSite }>): void {
        this.removeFile(uri);
        for (const { symbolKey, site } of sites) this.add(symbolKey, site);
    }

    /** Remove every reference site that originates from `uri`. */
    removeFile(uri: string): void {
        const fk = this.fileKey(uri);
        const keys = this.byFile.get(fk);
        if (!keys) return;
        for (const symbolKey of keys) {
            const sites = this.bySymbol.get(symbolKey);
            if (!sites) continue;
            const remaining = sites.filter(s => this.fileKey(s.uri) !== fk);
            if (remaining.length > 0) this.bySymbol.set(symbolKey, remaining);
            else this.bySymbol.delete(symbolKey);
        }
        this.byFile.delete(fk);
    }

    /** O(1) reference count for a symbol key (0 if unknown). */
    count(symbolKey: string): number {
        return this.bySymbol.get(symbolKey)?.length ?? 0;
    }

    /** All reference sites for a symbol key (empty if unknown). */
    references(symbolKey: string): ReferenceSite[] {
        const sites = this.bySymbol.get(symbolKey);
        return sites ? sites.slice() : [];
    }

    /** True once the initial solution-wide build has completed (Phase 2). */
    isReady(): boolean {
        return this.ready;
    }

    setReady(ready: boolean): void {
        this.ready = ready;
    }

    clear(): void {
        this.bySymbol.clear();
        this.byFile.clear();
        this.ready = false;
    }
}
