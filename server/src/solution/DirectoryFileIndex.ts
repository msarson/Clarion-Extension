import * as fs from 'fs';
import * as path from 'path';

/**
 * #288 — batch existence checks for solution loading.
 *
 * Resolving a project's source files runs every bare filename through the redirection search
 * paths with an `fs.existsSync` per candidate directory. On a large solution that is tens of
 * thousands of stat syscalls (3016 files × N candidate dirs × 40 projects measured ~7.9s on a
 * VM disk), even though the projects share a handful of directories. This index replaces the
 * per-candidate stat with ONE `readdir` per unique directory: the listing is cached as a
 * lowercase name set (Windows file systems are case-insensitive, as is Clarion), so every
 * subsequent existence check is an in-memory lookup.
 *
 * Scope: LOAD-TIME ONLY, by design. The index is passed explicitly down the solution-load call
 * chain and never consulted by runtime resolution (hover/F12/`clarion/findFile`), where a stale
 * listing could hide files created after the snapshot. `SolutionManager.parseSolution` clears it
 * at the start of each load, so a reload always sees fresh disk state.
 */
export class DirectoryFileIndex {
    private static instance: DirectoryFileIndex | null = null;

    /** normalized-lowercase dir → lowercase file/dir names in it (empty set = dir missing/unreadable). */
    private listings = new Map<string, Set<string>>();
    private dirsRead = 0;
    private lookups = 0;

    public static getInstance(): DirectoryFileIndex {
        if (!DirectoryFileIndex.instance) {
            DirectoryFileIndex.instance = new DirectoryFileIndex();
        }
        return DirectoryFileIndex.instance;
    }

    /** Drop all cached listings (call at the start of a solution load). */
    public clear(): void {
        this.listings.clear();
        this.dirsRead = 0;
        this.lookups = 0;
    }

    /** True when `fileName` exists directly inside `dir` (case-insensitive, one readdir per dir). */
    public exists(dir: string, fileName: string): boolean {
        this.lookups++;
        const key = path.normalize(dir).toLowerCase();
        let listing = this.listings.get(key);
        if (!listing) {
            listing = new Set<string>();
            try {
                for (const name of fs.readdirSync(dir)) {
                    listing.add(name.toLowerCase());
                }
                this.dirsRead++;
            } catch {
                // Missing/unreadable directory — cache the empty set so we don't retry it
                // for every file (one failed readdir instead of N failed stats).
            }
            this.listings.set(key, listing);
        }
        return listing.has(fileName.toLowerCase());
    }

    /** `exists` for a full path (splits into dir + basename). */
    public existsPath(fullPath: string): boolean {
        return this.exists(path.dirname(fullPath), path.basename(fullPath));
    }

    /** Load-phase metrics for the perf timeline. */
    public stats(): { dirsRead: number; dirsCached: number; lookups: number } {
        return { dirsRead: this.dirsRead, dirsCached: this.listings.size, lookups: this.lookups };
    }
}
