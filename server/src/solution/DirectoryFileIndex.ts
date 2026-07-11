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
 * Two instances exist (#288, #289):
 *   - `getInstance()` — the LOAD index. No TTL; passed explicitly down the solution-load call
 *     chain and cleared by `SolutionManager.parseSolution` at the start of each load, so a
 *     reload always sees fresh disk state.
 *   - `getRuntime()` — the RUNTIME index (#289), consulted by `findFile`/`findFileAsync` by
 *     default. Cross-file validators (missing-includes BFS, discarded-return member resolution,
 *     MAP declaration checks) resolve hundreds of unique include names, each walking every
 *     project's redirection entries — measured 10–20s PER FILE on a 40-project solution. The
 *     runtime index absorbs that with a short TTL (listings re-read after {@link RUNTIME_TTL_MS}),
 *     so a newly created file is visible within seconds while a validation burst runs entirely
 *     from memory.
 */
export class DirectoryFileIndex {
    private static instance: DirectoryFileIndex | null = null;
    private static runtimeInstance: DirectoryFileIndex | null = null;

    /** How long a runtime listing stays fresh. Diagnostics re-run per edit, so staleness self-heals. */
    public static readonly RUNTIME_TTL_MS = 10_000;

    /** normalized-lowercase dir → lowercase file/dir names in it (empty set = dir missing/unreadable). */
    private listings = new Map<string, { names: Set<string>; readAt: number }>();
    private dirsRead = 0;
    private lookups = 0;

    private constructor(private readonly ttlMs: number | null = null) {}

    public static getInstance(): DirectoryFileIndex {
        if (!DirectoryFileIndex.instance) {
            DirectoryFileIndex.instance = new DirectoryFileIndex(null);
        }
        return DirectoryFileIndex.instance;
    }

    /** The shared TTL'd index used by runtime `findFile` resolution (#289). */
    public static getRuntime(): DirectoryFileIndex {
        if (!DirectoryFileIndex.runtimeInstance) {
            DirectoryFileIndex.runtimeInstance = new DirectoryFileIndex(DirectoryFileIndex.RUNTIME_TTL_MS);
        }
        return DirectoryFileIndex.runtimeInstance;
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
        if (!listing || (this.ttlMs !== null && Date.now() - listing.readAt > this.ttlMs)) {
            const names = new Set<string>();
            try {
                for (const name of fs.readdirSync(dir)) {
                    names.add(name.toLowerCase());
                }
                this.dirsRead++;
            } catch {
                // Missing/unreadable directory — cache the empty set so we don't retry it
                // for every file (one failed readdir instead of N failed stats).
            }
            listing = { names, readAt: Date.now() };
            this.listings.set(key, listing);
        }
        return listing.names.has(fileName.toLowerCase());
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
