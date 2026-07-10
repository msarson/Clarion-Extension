/**
 * ReferenceCountIndex — #294: one-pass inverted identifier-occurrence index.
 *
 * Answers "how many times does name X appear across the solution" in O(1),
 * replacing the per-lens Find-All-References scans that cost O(lenses × files)
 * (measured: never completed at true solution scale; single scans up to 106s).
 *
 * Deliberately APPROXIMATE: counts comment/string-stripped identifier
 * occurrences by lowercased name via a regex word scan — no tokenization, no
 * scope resolution. The CodeLens displays this count; clicking the lens runs
 * the real (scoped, exact) Find-All-References. Same trade the issue ratified.
 *
 * Persistence mirrors the SDI (#290) / FRG (#307) pattern: per-file counts
 * keyed by mtime in an OS-temp JSON; warm starts are stat-only. Built in the
 * background AFTER the startup chain completes, batched + yielding. Open
 * documents are scanned from disk like everything else — a dirty buffer skews
 * an approximate count by design, and the live updateFile hook re-syncs on
 * edit.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as crypto from 'crypto';
import LoggerManager from '../logger';

const logger = LoggerManager.getLogger("ReferenceCountIndex");
logger.setLevel("error");
const perfLogger = LoggerManager.getLogger("ReferenceCountIndex.Perf", "perf");

const DISK_CACHE_VERSION = 1;

interface RefIndexDiskEntry { mtimeMs: number; counts: Record<string, number>; }
interface RefIndexDiskFile {
    version: number;
    files: Record<string, RefIndexDiskEntry>;
}

export interface RefIndexBuildStats { files: number; scanned: number; reusedFromDisk: number; ms: number; uniqueNames: number; }

// Structural keywords that can never be a lens symbol — skipping them keeps the
// map (and its disk cache) small. Conservative: only unambiguous structure /
// flow words; data types are NOT excluded (a class could shadow one in theory).
const STOPLIST = new Set([
    'if', 'then', 'else', 'elsif', 'end', 'of', 'do', 'loop', 'while', 'until', 'times',
    'case', 'orof', 'to', 'by', 'cycle', 'break', 'return', 'exit', 'goto', 'execute',
    'accept', 'begin', 'code', 'data', 'map', 'module', 'member', 'program', 'include',
    'procedure', 'function', 'routine', 'class', 'interface', 'queue', 'group', 'file',
    'record', 'view', 'window', 'report', 'application', 'and', 'or', 'not', 'xor',
    'true', 'false', 'null', 'self', 'parent', 'omit', 'compile', 'section', 'equate',
    'once', 'name', 'type', 'proc', 'raw', 'pascal', 'c', 'dll', 'link', 'external',
    'static', 'thread', 'private', 'protected', 'virtual', 'derived', 'implements',
]);

const WORD_RE = /[A-Za-z_][A-Za-z0-9_]*/g;
// Clarion string literal: single quotes, '' escapes inside.
const STRING_RE = /'(?:[^']|'')*'/g;

export class ReferenceCountIndex {
    private static instance: ReferenceCountIndex;

    /** normalized path (lowercase, forward slashes) → nameLower → occurrence count */
    private perFile = new Map<string, Map<string, number>>();
    private totals = new Map<string, number>();
    /** on-disk mtime each file's counts were scanned at — #315 stale-prune guard */
    private fileMtimes = new Map<string, number>();

    private _built = false;
    private _building = false;
    private _lastBuildStats: RefIndexBuildStats | undefined;

    private constructor() { /* singleton */ }

    public static getInstance(): ReferenceCountIndex {
        if (!ReferenceCountIndex.instance) {
            ReferenceCountIndex.instance = new ReferenceCountIndex();
        }
        return ReferenceCountIndex.instance;
    }

    public get isBuilt(): boolean { return this._built; }
    public get isBuilding(): boolean { return this._building; }
    public get lastBuildStats(): RefIndexBuildStats | undefined { return this._lastBuildStats; }

    /**
     * O(1)-ish approximate occurrence count for a symbol name. Returns
     * undefined when the index isn't built (callers fall back to the scan path).
     *
     * Plain names count solution-wide. Dotted lens symbols (`ThisGPF.Initialize`)
     * count their LAST segment only in files where the QUALIFIER also occurs —
     * #315: the solution-wide bare-name total answered "3372 references" for a
     * ubiquitous member name like `initialize`; qualifier co-occurrence keeps
     * the estimate anchored to files that actually deal with that class.
     */
    public getCount(symbolName: string): number | undefined {
        if (!this._built) return undefined;
        const parts = symbolName.toLowerCase().split('.').filter(Boolean);
        const short = parts.pop();
        if (!short) return undefined;
        const qualifier = parts.pop();
        if (!qualifier) return this.totals.get(short) ?? 0;

        let sum = 0;
        for (const counts of this.perFile.values()) {
            if ((counts.get(qualifier) ?? 0) === 0) continue;
            sum += counts.get(short) ?? 0;
        }
        return sum;
    }

    /**
     * #315 follow-up — occurrence count of a symbol's last segment within ONE
     * file. Used for lenses on locally-declared classes (module/procedure
     * scope): the class is invisible outside its declaring file, so counting
     * anywhere else (CapeSoft GPF Reporter generates an identical ThisGPF into
     * every app) inflates the estimate across applications. Returns undefined
     * when unbuilt or the file isn't indexed (caller may sync the live buffer
     * via updateFile and retry).
     */
    public getCountInFile(symbolName: string, fsPathOrUri: string): number | undefined {
        if (!this._built) return undefined;
        const short = symbolName.split('.').pop()?.toLowerCase() ?? '';
        if (!short) return undefined;
        const counts = this.perFile.get(this.toIndexPath(fsPathOrUri));
        if (!counts) return undefined;
        return counts.get(short) ?? 0;
    }

    /**
     * #315 follow-up — occurrence count of a symbol's last segment across a
     * SET of files, deduplicated. Used for lenses on classes declared at
     * global scope in a PROGRAM CLW: visible app-wide, so the estimate covers
     * the program file + its MEMBER modules (per the file-relationship graph)
     * while still excluding other applications. Returns undefined when
     * unbuilt or when NONE of the listed files is indexed.
     */
    public getCountInFiles(symbolName: string, fsPathsOrUris: string[]): number | undefined {
        if (!this._built) return undefined;
        const short = symbolName.split('.').pop()?.toLowerCase() ?? '';
        if (!short) return undefined;
        let sum = 0;
        let anyKnown = false;
        const seen = new Set<string>();
        for (const f of fsPathsOrUris) {
            const p = this.toIndexPath(f);
            if (seen.has(p)) continue;
            seen.add(p);
            const counts = this.perFile.get(p);
            if (!counts) continue;
            anyKnown = true;
            sum += counts.get(short) ?? 0;
        }
        return anyKnown ? sum : undefined;
    }

    /**
     * #315 — safe-prune probe for FAR candidate files: false ONLY when the file
     * is indexed and provably contains zero occurrences of `name`. Unknown
     * files, stoplist names (never counted), and the unbuilt state answer true.
     * The word scan is a superset of tokenized identifiers (both strip strings
     * and ! comments), so a zero here means no reference can match in the file.
     */
    public mayContain(fsPathOrUri: string, name: string): boolean {
        if (!this._built) return true;
        const nameLower = name.toLowerCase();
        if (STOPLIST.has(nameLower)) return true;
        const filePath = this.toIndexPath(fsPathOrUri);
        const counts = this.perFile.get(filePath);
        if (!counts) return true;
        if ((counts.get(nameLower) ?? 0) > 0) return true;

        // Zero count → prune ONLY if the on-disk file still matches the scan.
        // Clarion app generation rewrites CLW files with no editor event; a
        // stale entry must not silently drop references from FAR results.
        const recorded = this.fileMtimes.get(filePath);
        if (recorded === undefined) return true;
        try {
            const mtimeMs = fs.statSync(filePath).mtimeMs;
            if (mtimeMs === recorded) return false;
            // Regenerated since the scan — self-heal the entry, answer fresh.
            this.setFileCounts(filePath, ReferenceCountIndex.scanContent(fs.readFileSync(filePath, 'utf8')));
            this.fileMtimes.set(filePath, mtimeMs);
            return (this.perFile.get(filePath)?.get(nameLower) ?? 0) > 0;
        } catch {
            return true; // can't verify — never prune blind
        }
    }

    /** Build (or rebuild) over the given project files. Batched + yielding. */
    public async buildInBackground(projectFiles: string[]): Promise<void> {
        if (this._building) return;
        this._building = true;
        const buildStart = Date.now();
        this.perFile.clear();
        this.totals.clear();
        this.fileMtimes.clear();

        const diskCache = this.loadDiskCache(projectFiles);
        const freshEntries: Record<string, RefIndexDiskEntry> = {};
        let scanned = 0;
        let reusedFromDisk = 0;

        const BATCH = 32;
        const files = projectFiles.map(f => this.normalizePath(f));
        for (let i = 0; i < files.length; i += BATCH) {
            const batch = files.slice(i, i + BATCH);
            await Promise.all(batch.map(async filePath => {
                let mtimeMs: number | undefined;
                try { mtimeMs = (await fs.promises.stat(filePath)).mtimeMs; } catch { return; }

                const cached = diskCache?.files[filePath];
                if (cached && cached.mtimeMs === mtimeMs) {
                    reusedFromDisk++;
                    freshEntries[filePath] = cached;
                    this.setFileCounts(filePath, new Map(Object.entries(cached.counts)));
                    this.fileMtimes.set(filePath, mtimeMs);
                    return;
                }

                try {
                    const content = await fs.promises.readFile(filePath, 'utf8');
                    const counts = ReferenceCountIndex.scanContent(content);
                    scanned++;
                    freshEntries[filePath] = { mtimeMs, counts: Object.fromEntries(counts) };
                    this.setFileCounts(filePath, counts);
                    this.fileMtimes.set(filePath, mtimeMs);
                } catch { /* unreadable — skip */ }
            }));
            // Yield between batches so this never competes with interactive work.
            await new Promise<void>(resolve => setImmediate(resolve));
        }

        this._built = true;
        this._building = false;
        this._lastBuildStats = {
            files: files.length,
            scanned,
            reusedFromDisk,
            ms: Date.now() - buildStart,
            uniqueNames: this.totals.size
        };
        await this.saveDiskCache(projectFiles, freshEntries);
        perfLogger.perf("RefIndex build complete", {
            ms: this._lastBuildStats.ms,
            files: files.length,
            scanned,
            reused_from_disk: reusedFromDisk,
            unique_names: this.totals.size
        });
    }

    /** Re-scan one file's content (live buffer) and adjust totals incrementally. */
    public updateFile(fsPathOrUri: string, content: string): void {
        if (!this._built && !this._building) return; // nothing to keep in sync yet
        this.setFileCounts(this.toIndexPath(fsPathOrUri), ReferenceCountIndex.scanContent(content));
    }

    /** Accepts a file:/// URI (incl. %3A drive-colon encodings) or an fs path. */
    private toIndexPath(fsPathOrUri: string): string {
        return this.normalizePath(
            fsPathOrUri.startsWith('file:')
                ? decodeURIComponent(fsPathOrUri.replace(/^file:\/\/\/?/i, ''))
                : fsPathOrUri
        );
    }

    public reset(): void {
        this.perFile.clear();
        this.totals.clear();
        this.fileMtimes.clear();
        this._built = false;
        this._building = false;
        this._lastBuildStats = undefined;
    }

    /** Replace a file's counts, adjusting the global totals by the delta. */
    private setFileCounts(filePath: string, counts: Map<string, number>): void {
        const old = this.perFile.get(filePath);
        if (old) {
            for (const [name, n] of old) {
                const t = (this.totals.get(name) ?? 0) - n;
                if (t <= 0) this.totals.delete(name); else this.totals.set(name, t);
            }
        }
        this.perFile.set(filePath, counts);
        for (const [name, n] of counts) {
            this.totals.set(name, (this.totals.get(name) ?? 0) + n);
        }
    }

    /** Comment/string-stripped identifier occurrence scan. Exported for tests. */
    public static scanContent(content: string): Map<string, number> {
        const counts = new Map<string, number>();
        for (let line of content.split(/\r?\n/)) {
            // Strings first ('' escapes handled by the regex), then line comments.
            line = line.replace(STRING_RE, ' ');
            const bang = line.indexOf('!');
            if (bang !== -1) line = line.substring(0, bang);

            WORD_RE.lastIndex = 0;
            let m: RegExpExecArray | null;
            while ((m = WORD_RE.exec(line)) !== null) {
                const word = m[0].toLowerCase();
                if (STOPLIST.has(word)) continue;
                counts.set(word, (counts.get(word) ?? 0) + 1);
            }
        }
        return counts;
    }

    // ── Persistence (SDI/#290 pattern) ─────────────────────────────────────────

    private normalizePath(p: string): string {
        return p.toLowerCase().replace(/\\/g, '/');
    }

    private diskCachePath(projectFiles: string[]): string {
        const key = projectFiles.map(f => this.normalizePath(f)).sort().join(';');
        const hash = crypto.createHash('md5').update(key).digest('hex').slice(0, 16);
        return path.join(os.tmpdir(), 'clarion-extension-refindex', `refidx-${hash}.json`);
    }

    private loadDiskCache(projectFiles: string[]): RefIndexDiskFile | null {
        try {
            const raw = fs.readFileSync(this.diskCachePath(projectFiles), 'utf8');
            const parsed = JSON.parse(raw) as RefIndexDiskFile;
            if (parsed?.version !== DISK_CACHE_VERSION || typeof parsed.files !== 'object') return null;
            return parsed;
        } catch {
            return null;
        }
    }

    private async saveDiskCache(projectFiles: string[], files: Record<string, RefIndexDiskEntry>): Promise<void> {
        try {
            const file = this.diskCachePath(projectFiles);
            fs.mkdirSync(path.dirname(file), { recursive: true });
            await fs.promises.writeFile(file, JSON.stringify({ version: DISK_CACHE_VERSION, files } satisfies RefIndexDiskFile));
        } catch (err) {
            logger.debug(`[RefIndex] disk cache save failed (non-fatal): ${err instanceof Error ? err.message : String(err)}`);
        }
    }
}
