import * as fs from 'fs';
import * as os from 'os';
import * as crypto from 'crypto';
import * as path from 'path';
import { RedirectionFileParserServer, RedirectionEntry } from '../solution/redirectionFileParserServer';
import { SolutionManager } from '../solution/solutionManager';
import LoggerManager from '../logger';
import { serverSettings } from '../serverSettings';

const logger = LoggerManager.getLogger('StructureDeclarationIndexer');
logger.setLevel('error');
// Always-on build timing (#290) — the SDI build is the dominant background cost on large
// installations; its duration/reuse stats must be visible in a release VSIX.
const perfLogger = LoggerManager.getLogger('StructureDeclarationIndexer.Perf', 'perf');

/**
 * #290 — on-disk declaration cache, keyed by file mtime.
 *
 * The index scan itself is a light regex pass, but on a large installation it still reads
 * thousands of libsrc `.inc`/`.equ` files (~27s measured on a VM). Library files essentially
 * never change, so the scan results are persisted to a per-project JSON in the OS temp dir;
 * a rebuild stats each file and reuses the cached declarations when the mtime is unchanged —
 * warm builds then cost one stat per file instead of a read + scan.
 * Bump DISK_CACHE_VERSION whenever StructureDeclarationInfo or the scanner semantics change.
 */
const DISK_CACHE_VERSION = 1;

interface SdiDiskCacheEntry {
    mtimeMs: number;
    decls: StructureDeclarationInfo[];
}

interface SdiDiskCacheFile {
    version: number;
    projectPath: string;
    files: Record<string, SdiDiskCacheEntry>;
}

/**
 * All declaration types that the indexer recognises.
 * ITEMIZE_EQUATE = an EQUATE inside an ITEMIZE block (name is already PRE-expanded).
 */
export type StructureType =
    | 'CLASS'
    | 'INTERFACE'
    | 'QUEUE'
    | 'GROUP'
    | 'RECORD'
    | 'FILE'
    | 'VIEW'
    | 'EQUATE'
    | 'ITEMIZE'
    | 'ITEMIZE_EQUATE';

/** A single declaration found during a file scan */
export interface StructureDeclarationInfo {
    /** Original-case label as it appears in source (ITEMIZE_EQUATE names are PRE:Name expanded) */
    name: string;
    filePath: string;
    /** 0-based line number */
    line: number;
    structureType: StructureType;
    /** Inheritance / parent type, e.g. CLASS(Base) → "Base" */
    parentName?: string;
    /** MODULE attribute value, e.g. CLASS,MODULE('x.clw') → "x.clw" */
    moduleName?: string;
    isType: boolean;
    lineContent: string;
}

/** Per-project index */
export interface StructureIndex {
    /** name (lowercase) → all declarations with that name across all scanned files */
    byName: Map<string, StructureDeclarationInfo[]>;
    lastIndexed: number;
    projectPath: string;
}

/** Minimal interface consumed by providers — allows easy substitution/testing */
export interface IStructureDeclarationIndex {
    find(name: string, projectPath?: string): StructureDeclarationInfo[];
    findInFile(fileName: string, projectPath?: string): StructureDeclarationInfo[];
    getOrBuildIndex(projectPath: string): Promise<StructureIndex>;
    buildIndex(projectPath: string): Promise<StructureIndex>;
    clearCache(): void;
    clearProjectCache(projectPath: string): void;
}

// ---------------------------------------------------------------------------
// Regex patterns — all require label to start at column 0
// ---------------------------------------------------------------------------
const TYPE_PATTERN =
    /^([A-Za-z_]\w*)\s+(CLASS|INTERFACE|QUEUE|GROUP|RECORD|FILE|VIEW)\b/i;
const ITEMIZE_PATTERN =
    /^([A-Za-z_]\w*)\s+ITEMIZE\b/i;
/** Blank-label ITEMIZE: indented keyword with no label at col 0, e.g. "          ITEMIZE,PRE(CLType)" */
const ITEMIZE_BLANK_PATTERN =
    /^\s+ITEMIZE\b/i;
// #298: Clarion ships a handful of DECLARATION-ONLY .clw files (equates/property/keycode
// constants — no implementations). The .inc/.equ-only scan filter skipped them, so names like
// CtrlShiftP (KEYCODES.CLW) were invisible to every SDI consumer — hover resolved them via the
// include chain while the undeclared-variable diagnostic flagged them. Whitelisted by basename
// rather than widening to *.clw: scanning thousands of implementation modules would bloat the
// index with module-local equates that aren't in scope elsewhere.
const DECLARATION_CLW_FILES = new Set([
    'equates.clw',
    'keycodes.clw',
    'property.clw',
    'errors.clw',
    'printer.clw',
    'tplequ.clw',
]);

const EQUATE_PATTERN =
    /^([A-Za-z_][\w:]*)\s+EQUATE\b/i;
const END_PATTERN =
    /^END\b/i;

/** Extract the PRE attribute value from an ITEMIZE line, e.g. "Color ITEMIZE(0),PRE(Clr)" → "Clr" */
function extractPre(line: string): string {
    const m = /,\s*PRE\s*\(\s*([A-Za-z_]\w*)\s*\)/i.exec(line);
    return m ? m[1] : '';
}

/** Extract parent name from TYPE(...) clause */
function extractParent(keyword: string, line: string): string | undefined {
    const m = new RegExp(keyword + '\\s*\\(\\s*([A-Za-z_]\\w*)\\s*\\)', 'i').exec(line);
    return m ? m[1] : undefined;
}

/** Extract MODULE('...') attribute */
function extractModule(line: string): string | undefined {
    const m = /,\s*MODULE\s*\(\s*['"]?([^'")\s]+)['"]?\s*\)/i.exec(line);
    return m ? m[1] : undefined;
}

/**
 * Scan raw source text for all indexable declarations.
 * All Clarion labels are at column 0, so regex anchoring to ^ is correct.
 * EQUATEs inside ITEMIZE blocks are emitted with PRE-expanded names.
 */
export function scanSourceForDeclarations(
    source: string,
    filePath: string
): StructureDeclarationInfo[] {
    const results: StructureDeclarationInfo[] = [];
    const lines = source.split(/\r?\n/);

    // ITEMIZE context: when inside an ITEMIZE block, EQUATEs get the PRE prefix
    let inItemize = false;
    let itemizePre = '';
    let itemizeLine = 0;

    for (let i = 0; i < lines.length; i++) {
        const rawLine = lines[i];

        // Strip inline comment so it doesn't confuse patterns
        const commentIdx = rawLine.indexOf('!');
        const line = commentIdx >= 0 ? rawLine.substring(0, commentIdx) : rawLine;
        const trimmed = line.trimEnd();

        if (!trimmed) continue;

        // Exit ITEMIZE on END
        if (inItemize && END_PATTERN.test(trimmed)) {
            inItemize = false;
            itemizePre = '';
            continue;
        }

        // ITEMIZE block start (labeled or blank-label)
        let m: RegExpExecArray | null;
        if ((m = ITEMIZE_PATTERN.exec(trimmed))) {
            const name = m[1];
            const pre = extractPre(trimmed);
            results.push({
                name,
                filePath,
                line: i,
                structureType: 'ITEMIZE',
                parentName: undefined,
                moduleName: undefined,
                isType: false,
                lineContent: trimmed
            });
            inItemize = true;
            itemizePre = pre;
            itemizeLine = i;
            continue;
        }

        // Blank-label ITEMIZE: no name to emit, but we must enter ITEMIZE state
        // so that member EQUATEs get the correct PRE-prefixed names (e.g. CLType:BYTE)
        if (ITEMIZE_BLANK_PATTERN.test(trimmed)) {
            inItemize = true;
            itemizePre = extractPre(trimmed);
            itemizeLine = i;
            continue;
        }

        // EQUATE
        if ((m = EQUATE_PATTERN.exec(trimmed))) {
            const rawName = m[1];
            if (inItemize) {
                // PRE-expand: "Red" → "Color:Red"
                const expandedName = itemizePre ? `${itemizePre}:${rawName}` : rawName;
                results.push({
                    name: expandedName,
                    filePath,
                    line: i,
                    structureType: 'ITEMIZE_EQUATE',
                    parentName: undefined,
                    moduleName: undefined,
                    isType: false,
                    lineContent: trimmed
                });
            } else {
                results.push({
                    name: rawName,
                    filePath,
                    line: i,
                    structureType: 'EQUATE',
                    parentName: undefined,
                    moduleName: undefined,
                    isType: false,
                    lineContent: trimmed
                });
            }
            continue;
        }

        // Type-like structures (CLASS, INTERFACE, QUEUE, GROUP, RECORD, FILE, VIEW)
        if ((m = TYPE_PATTERN.exec(trimmed))) {
            const name = m[1];
            const keyword = m[2].toUpperCase() as StructureType;
            const remainder = trimmed.substring(m[0].length);
            const isType = /,\s*TYPE\b/i.test(remainder) || /\bTYPE\b/i.test(remainder);
            results.push({
                name,
                filePath,
                line: i,
                structureType: keyword,
                parentName: extractParent(keyword, trimmed),
                moduleName: keyword === 'CLASS' ? extractModule(trimmed) : undefined,
                isType,
                lineContent: trimmed
            });
            continue;
        }
    }

    return results;
}

/**
 * Singleton indexer — scans .inc files via redirection paths for each project.
 * Partitioned by project path so same-name symbols from different projects don't collide.
 */
export class StructureDeclarationIndexer implements IStructureDeclarationIndex {
    private static instance: StructureDeclarationIndexer;
    private indexes: Map<string, StructureIndex> = new Map();
    /** In-flight build promises — prevents duplicate parallel builds for the same project */
    private pendingBuilds: Map<string, Promise<StructureIndex>> = new Map();

    private constructor() {}

    public static getInstance(): StructureDeclarationIndexer {
        if (!StructureDeclarationIndexer.instance) {
            StructureDeclarationIndexer.instance = new StructureDeclarationIndexer();
        }
        return StructureDeclarationIndexer.instance;
    }

    /** Normalise a project path that may arrive URI-encoded (e.g. c%3A → c:) or as a file:// URI */
    private normalizeKey(projectPath: string): string {
        let p = projectPath;
        try { p = decodeURIComponent(p); } catch { /* leave as-is if malformed */ }
        p = p.replace(/^file:\/\/\/?/i, '');
        return path.normalize(p);
    }

    /** Returns true if the index for this project path is already built and cached */
    isIndexed(projectPath: string): boolean {
        return this.indexes.has(this.normalizeKey(projectPath));
    }

    /** Returns true if ANY project index is built (e.g. a solution is loaded). */
    hasAnyIndex(): boolean {
        return this.indexes.size > 0;
    }

    async getOrBuildIndex(projectPath: string): Promise<StructureIndex> {
        // Without a redirection file we cannot meaningfully scan anything.
        // Return an empty uncached index so the first real call after solution
        // load builds and caches correctly (cache is also cleared on solution load).
        if (!serverSettings.redirectionFile) {
            return { byName: new Map(), lastIndexed: 0, projectPath };
        }
        const key = this.normalizeKey(projectPath);
        if (this.indexes.has(key)) {
            return this.indexes.get(key)!;
        }
        // Coalesce concurrent callers onto the same in-flight build
        if (this.pendingBuilds.has(key)) {
            return this.pendingBuilds.get(key)!;
        }

        // #290: with a solution loaded, never spawn a NEW scan keyed on an arbitrary directory.
        // Several callers fall back to `path.dirname(file)` for files that aren't project members
        // (shared .inc directories, generated-source subdirs); those requests were launching full
        // directory scans (17–60s measured) that raced the real per-project build and starved
        // concurrent validators. Redirect them to an existing / in-flight / first-project index —
        // its scan already covers the RED search paths + libsrc where such files live. Genuine
        // no-solution mode (no SolutionManager) keeps the #184 last-resort dir-keyed build.
        const sm = SolutionManager.getInstance();
        if (sm) {
            // Solution still parsing (projects not yet populated): a request in this window would
            // otherwise launch a dir-keyed scan that races the whole load (measured: a 'src' build
            // firing the same millisecond parseSolution started, starving project parsing).
            // Return an empty UNCACHED index — validators are deferred anyway, interactive callers
            // degrade for a few seconds, and the real per-project prebuild follows solutionReady.
            if (sm.solution.projects.length === 0) {
                return { byName: new Map(), lastIndexed: 0, projectPath };
            }
            const isProjectKey = sm.solution.projects.some(p => this.normalizeKey(p.path) === key);
            if (!isProjectKey) {
                const existing = this.indexes.values().next();
                if (!existing.done) return existing.value;
                const pending = this.pendingBuilds.values().next();
                if (!pending.done) return pending.value;
                return this.getOrBuildIndex(sm.solution.projects[0].path);
            }
        }
        const buildPromise = this.buildIndex(key).then(index => {
            this.indexes.set(key, index);
            this.pendingBuilds.delete(key);
            return index;
        }).catch(err => {
            this.pendingBuilds.delete(key);
            throw err;
        });
        this.pendingBuilds.set(key, buildPromise);
        return buildPromise;
    }

    /** Stats of the most recent buildIndex call (exposed for perf lines and tests). */
    public lastBuildStats: { files: number; scanned: number; reusedFromDisk: number; ms: number } | null = null;

    async buildIndex(projectPath: string): Promise<StructureIndex> {
        const startTime = Date.now();
        const byName = new Map<string, StructureDeclarationInfo[]>();
        let total = 0;
        let scanned = 0;
        let reusedFromDisk = 0;
        let fileCount = 0;

        try {
            const redStart = Date.now();
            const redirectionParser = new RedirectionFileParserServer();
            const entries = await redirectionParser.parseRedFileAsync(projectPath);
            const searchPaths = this.extractSearchPaths(entries);

            if (serverSettings.libsrcPaths?.length) {
                for (const p of serverSettings.libsrcPaths) {
                    if (fs.existsSync(p) && fs.statSync(p).isDirectory()) {
                        searchPaths.push(p);
                    }
                }
            }
            const redMs = Date.now() - redStart;

            logger.debug(`⏱️ [SDI] Starting scan of ${searchPaths.length} search paths for ${projectPath}`);

            const dirScanStart = Date.now();
            const allFiles: string[] = [];
            for (const dir of searchPaths) {
                if (fs.existsSync(dir)) {
                    const files = fs.readdirSync(dir)
                        .filter(f => /\.(inc|equ)$/i.test(f) || DECLARATION_CLW_FILES.has(f.toLowerCase()))
                        .map(f => path.join(dir, f));
                    allFiles.push(...files);
                }
            }
            fileCount = allFiles.length;
            const dirScanMs = Date.now() - dirScanStart;

            // #290: mtime-keyed disk cache — reuse prior scan results for unchanged files.
            // #311: async load + per-phase attribution — the one aggregate number couldn't
            // distinguish cache read (I/O), cache parse (CPU block), the stat/scan loop
            // (yielding — its wall-clock absorbs interleaved interactive work), and save.
            const { cache: diskCache, readMs: cacheReadMs, parseMs: cacheParseMs } = await this.loadDiskCache(projectPath);
            const freshEntries: Record<string, SdiDiskCacheEntry> = {};

            logger.debug(`⏱️ [SDI] Scanning ${allFiles.length} files in batches (disk cache: ${diskCache ? Object.keys(diskCache.files).length : 0} entries)`);

            // #311: 20 → 64. The attributed trace put the warm path's cost in the stat
            // loop (4,104 stats / 205 batches / a setImmediate round-trip each ≈ 4.2s
            // wall). Stats are tiny I/O ops — 64-wide keeps chunks small while cutting
            // the yield rounds ~3×. Cold scans (reads + parses) ride the same batches;
            // 64 concurrent reads is well within Node's comfort.
            const BATCH_SIZE = 64;
            const statLoopStart = Date.now();
            for (let i = 0; i < allFiles.length; i += BATCH_SIZE) {
                const batch = allFiles.slice(i, i + BATCH_SIZE);
                const batchResults = await Promise.all(batch.map(async f => {
                    const stat = await fs.promises.stat(f).catch(() => null);
                    if (!stat) return [] as StructureDeclarationInfo[];
                    const key = f.toLowerCase();
                    const cached = diskCache?.files[key];
                    if (cached && cached.mtimeMs === stat.mtimeMs) {
                        reusedFromDisk++;
                        freshEntries[key] = cached;
                        return cached.decls;
                    }
                    const decls = await this.scanFile(f);
                    scanned++;
                    freshEntries[key] = { mtimeMs: stat.mtimeMs, decls };
                    return decls;
                }));
                for (const decls of batchResults) {
                    total += decls.length;
                    for (const d of decls) {
                        const key = d.name.toLowerCase();
                        if (!byName.has(key)) byName.set(key, []);
                        byName.get(key)!.push(d);
                    }
                }
                // Yield between batches to keep the event loop responsive
                await new Promise<void>(resolve => setImmediate(resolve));
            }

            const statLoopMs = Date.now() - statLoopStart;

            // Only rewrite the disk cache when something actually changed — a fully-warm build
            // (everything reused) would otherwise re-stringify ~70k declarations for nothing.
            const saveStart = Date.now();
            const cacheDirty = scanned > 0
                || !diskCache
                || Object.keys(freshEntries).length !== Object.keys(diskCache.files).length;
            if (cacheDirty) {
                await this.saveDiskCache(projectPath, freshEntries);
            }
            const saveMs = Date.now() - saveStart;

            const duration = Date.now() - startTime;
            logger.debug(`⏱️ [SDI] Built in ${duration}ms: ${total} declarations, ${byName.size} unique names`);
            this.lastBuildStats = { files: fileCount, scanned, reusedFromDisk, ms: duration };
            // #311: phase attribution. stat_loop_ms yields between batches, so its
            // wall-clock absorbs interleaved interactive work (contention, not cost);
            // cache_parse_ms is the only unavoidable single block.
            perfLogger.perf("SDI buildIndex complete", {
                ms: duration,
                red_ms: redMs,
                dir_scan_ms: dirScanMs,
                cache_read_ms: cacheReadMs,
                cache_parse_ms: cacheParseMs,
                stat_loop_ms: statLoopMs,
                save_ms: saveMs,
                files: fileCount,
                scanned,
                reused_from_disk: reusedFromDisk,
                declarations: total,
                project: path.basename(projectPath) || projectPath
            });

        } catch (err) {
            logger.error(`Error building index: ${err instanceof Error ? err.message : String(err)}`);
        }

        return { byName, lastIndexed: Date.now(), projectPath: path.normalize(projectPath) };
    }

    /** Location of the per-project disk cache (OS temp dir — never pollutes the user's solution). */
    private diskCachePath(projectPath: string): string {
        const hash = crypto.createHash('md5').update(this.normalizeKey(projectPath).toLowerCase()).digest('hex').slice(0, 16);
        return path.join(os.tmpdir(), 'clarion-extension-sdi', `sdi-${hash}.json`);
    }

    // #311: async read — the cache is tens of MB for a large installation and a SYNC
    // read on a cold disk blocked the loop for seconds (the 354ms→6.5s buildIndex
    // variance). The JSON.parse block remains (real CPU, reported separately).
    private async loadDiskCache(projectPath: string): Promise<{ cache: SdiDiskCacheFile | null; readMs: number; parseMs: number }> {
        const readStart = Date.now();
        try {
            const raw = await fs.promises.readFile(this.diskCachePath(projectPath), 'utf8');
            const parseStart = Date.now();
            const parsed = JSON.parse(raw) as SdiDiskCacheFile;
            const parseMs = Date.now() - parseStart;
            const readMs = parseStart - readStart;
            if (parsed?.version !== DISK_CACHE_VERSION || typeof parsed.files !== 'object') {
                return { cache: null, readMs, parseMs };
            }
            return { cache: parsed, readMs, parseMs };
        } catch {
            // missing / corrupt / stale-format → full scan
            return { cache: null, readMs: Date.now() - readStart, parseMs: 0 };
        }
    }

    private async saveDiskCache(projectPath: string, files: Record<string, SdiDiskCacheEntry>): Promise<void> {
        try {
            const file = this.diskCachePath(projectPath);
            fs.mkdirSync(path.dirname(file), { recursive: true });
            const payload: SdiDiskCacheFile = {
                version: DISK_CACHE_VERSION,
                projectPath: this.normalizeKey(projectPath),
                files
            };
            // Async write — the payload can be tens of MB on a big installation; a sync write
            // on top of the (already sync) stringify would block the loop. A failed save just
            // means the next start scans cold.
            await fs.promises.writeFile(file, JSON.stringify(payload));
        } catch (err) {
            logger.debug(`[SDI] disk cache save failed (non-fatal): ${err instanceof Error ? err.message : String(err)}`);
        }
    }

    /** Case-insensitive name lookup across all indexed projects (or a specific one) */
    find(name: string, projectPath?: string): StructureDeclarationInfo[] {
        const key = name.toLowerCase();
        if (projectPath) {
            const idx = this.indexes.get(this.normalizeKey(projectPath));
            if (idx) {
                return idx.byName.get(key) ?? [];
            }
            // #290: no index under this key (typically a caller's `path.dirname(file)` fallback
            // for a non-member file — getOrBuildIndex no longer builds dir-keyed indexes when a
            // solution is loaded). Fall through to the cross-index search instead of silently
            // returning nothing.
        }
        for (const idx of this.indexes.values()) {
            const hit = idx.byName.get(key);
            if (hit?.length) return hit;
        }
        return [];
    }

    /** Find all declarations in a given file (by base filename, case-insensitive) */
    findInFile(fileName: string, projectPath?: string): StructureDeclarationInfo[] {
        const nameLower = fileName.toLowerCase();
        const results: StructureDeclarationInfo[] = [];

        const search = (idx: StructureIndex) => {
            for (const decls of idx.byName.values()) {
                for (const d of decls) {
                    if (path.basename(d.filePath).toLowerCase() === nameLower) {
                        results.push(d);
                    }
                }
            }
        };

        if (projectPath) {
            const idx = this.indexes.get(this.normalizeKey(projectPath));
            if (idx) search(idx);
        } else {
            for (const idx of this.indexes.values()) search(idx);
        }

        return results;
    }

    clearCache(): void {
        this.indexes.clear();
    }

    clearProjectCache(projectPath: string): void {
        this.indexes.delete(this.normalizeKey(projectPath));
    }

    private async scanFile(filePath: string): Promise<StructureDeclarationInfo[]> {
        try {
            const source = await fs.promises.readFile(filePath, 'utf-8');
            return scanSourceForDeclarations(source, filePath);
        } catch {
            return [];
        }
    }

    private extractSearchPaths(entries: RedirectionEntry[]): string[] {
        const paths = new Set<string>();
        for (const entry of entries ?? []) {
            for (const dirPath of entry?.paths ?? []) {
                let resolved = dirPath;
                if (!path.isAbsolute(dirPath)) {
                    resolved = path.resolve(path.dirname(entry.redFile), dirPath);
                }
                resolved = path.normalize(resolved);
                try {
                    if (fs.existsSync(resolved) && fs.statSync(resolved).isDirectory()) {
                        paths.add(resolved);
                    }
                } catch { /* skip inaccessible paths */ }
            }
        }
        return Array.from(paths);
    }
}
