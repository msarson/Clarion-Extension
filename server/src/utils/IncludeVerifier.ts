import { TextDocument } from 'vscode-languageserver-textdocument';
import { Token, TokenType } from '../ClarionTokenizer';
import { TokenCache } from '../TokenCache';
import { TokenHelper } from './TokenHelper';
import { SolutionManager } from '../solution/solutionManager';
import { resolveViaProjectRedirection } from './RedirectionResolution';
import { pathToCanonicalUri } from './UriUtils';
import { makeTimeSlicer } from './cooperativeScan';
import { loadIncludeIndex, saveIncludeIndex, includeIndexFresh } from '../services/IncludeIndexDiskCache'; // #366
import LoggerManager from '../logger';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const logger = LoggerManager.getLogger('IncludeVerifier');
logger.setLevel('error');
// #366 follow-up: name the residual ~467ms/check cost in isClassIncluded — the
// getMemberParentDocument memo was only part of it. Fires per slow check only.
const perfLogger = LoggerManager.getLogger('IncludeVerifier.Perf', 'perf');

/**
 * Represents a parsed INCLUDE statement
 */
interface IncludeStatement {
    fileName: string;      // e.g., "StringTheory.inc"
    hasOnce: boolean;      // Whether it has ,ONCE modifier
    lineNumber: number;    // Line where INCLUDE was found
}

/**
 * Cache entry for a file's includes
 */
interface IncludeCache {
    includes: IncludeStatement[];
    timestamp: number;
}

/**
 * Cache entry for a resolved file path (by filename)
 */
interface PathCache {
    resolvedPath: string | null;
    timestamp: number;
}

/**
 * Verifies if a class definition file is accessible via INCLUDE statements
 * in the current file or its MEMBER parent
 */
export class IncludeVerifier {
    private static instance: IncludeVerifier | undefined;
    private includeCache = new Map<string, IncludeCache>(); // URI -> IncludeCache
    // #344: memoized owner-project key per from-file (findProjectForFile walks
    // projects x sourceFiles - too hot to run per resolveIncludePath call).
    private ownerKeyCache = new Map<string, { key: string; at: number }>();
    // #345: reachable-include-name set per host file (fingerprint-verified + TTL).
    // #366 follow-up: store the in-flight PROMISE, not the resolved set, so two
    // validation passes that overlap (member + parent, the #359 shape) share one
    // ~4.3s BFS build instead of each starting its own (a cache stampede).
    private reachableSetCache = new Map<string, { at: number; fingerprint: string; promise: Promise<Set<string>> }>();
    // #366: resolved MEMBER('...') parent document per host file (uri+version, TTL).
    // getMemberParentDocument runs once per include-check (6x per pass on a generated
    // module) with the SAME document, each re-reading + re-tokenizing the large parent
    // from disk (~660ms x 6 = ~4s, diag_count=0). The parent depends only on the host's
    // MEMBER line, so memoize it — backed by the same TTL + #340 watcher clear.
    private memberParentCache = new Map<string, { at: number; version: number; parent: TextDocument | null }>();
    private pathCache = new Map<string, PathCache>();       // filename.lower -> PathCache
    // #345 phase 4: 60s expired between validation passes on a slow pass — the
    // reachable-set BFS (reads hundreds of libsrc files) rebuilt per restart
    // AND per minute. The #340 watcher clears these caches on any workspace
    // change; the TTL only backstops out-of-workspace libsrc edits.
    private static readonly CACHE_DURATION = 600000; // 10 minutes
    // #345 phase 4: disk-persisted per-file include lists (mtime-guarded) so a
    // restart's first BFS reads one JSON instead of the include universe.
    private diskIncludeLists: Map<string, { mtime: number; includes: IncludeStatement[] }> | null = null;
    private diskListsDirty = false;
    private diskSaveTimer: ReturnType<typeof setTimeout> | undefined;

    private constructor() {}

    public static getInstance(): IncludeVerifier {
        if (!IncludeVerifier.instance) {
            IncludeVerifier.instance = new IncludeVerifier();
        }
        return IncludeVerifier.instance;
    }

    private tokenCache = TokenCache.getInstance();

    /**
     * Verifies if a class file is included and accessible in the given document
     * @param classFileName The class definition filename (e.g., "StringTheory.inc")
     * @param document The document to check
     * @returns true if the class file is included, false otherwise
     */
    async isClassIncluded(classFileName: string, document: TextDocument): Promise<boolean> {
        // #366 follow-up: per-step timing to name the residual ~467ms/check cost.
        const startedAt = Date.now();
        const step = { currentInc: 0, currentTrans: 0, parentDoc: 0, parentInc: 0, parentTrans: 0, companion: 0 };
        let foundAt = 'none';
        try {
            logger.debug(`⏱️ [IV] isClassIncluded start: "${classFileName}" in ${document.uri.split('/').pop()}`);

            // Get includes from current file
            const t0 = Date.now();
            const currentIncludes = await this.getIncludesForFile(document);
            step.currentInc = Date.now() - t0;
            logger.debug(`⏱️ [IV] getIncludesForFile (current) took ${step.currentInc}ms → ${currentIncludes.length} includes`);

            // Check if class file is in current file's direct includes
            if (this.hasInclude(classFileName, currentIncludes)) {
                foundAt = 'current-direct';
                return true;
            }

            // Check one level of transitive includes (e.g. MSSQL2DriverClass.Inc → DriverClass.Inc)
            const fromPath = decodeURIComponent(document.uri.replace(/^file:\/\/\/?/i, '')).replace(/\//g, '\\');
            const tCt = Date.now();
            const currentHit = await this.hasTransitiveInclude(classFileName, currentIncludes, fromPath);
            step.currentTrans = Date.now() - tCt;
            if (currentHit) {
                foundAt = 'current-transitive';
                return true;
            }

            // Not found - check MEMBER parent
            const t1 = Date.now();
            const memberParent = await this.getMemberParentDocument(document);
            step.parentDoc = Date.now() - t1;

            if (memberParent) {
                const t2 = Date.now();
                const parentIncludes = await this.getIncludesForFile(memberParent);
                step.parentInc = Date.now() - t2;

                if (this.hasInclude(classFileName, parentIncludes)) {
                    foundAt = 'parent-direct';
                    return true;
                }

                // Check transitive includes of MEMBER parent
                const parentPath = decodeURIComponent(memberParent.uri.replace(/^file:\/\/\/?/i, '')).replace(/\//g, '\\');
                const tPt = Date.now();
                const parentHit = await this.hasTransitiveInclude(classFileName, parentIncludes, parentPath);
                step.parentTrans = Date.now() - tPt;
                if (parentHit) {
                    foundAt = 'parent-transitive';
                    return true;
                }
            }

            // #191 — A definition `.inc` has no MEMBER parent, but it is never
            // compiled alone: it is included into the implementation module(s)
            // that implement its classes. Consult the companion `.clw` named by
            // each CLASS's MODULE() attribute (with same-basename fallback) and
            // check its include chain — the include legitimately lives there in
            // the standard Clarion split-class layout.
            const tCo = Date.now();
            const companionPaths = await this.getCompanionImplementationPaths(document, fromPath);
            for (const clwPath of companionPaths) {
                const clwIncludes = await this.parseIncludesFromFilePath(clwPath);
                if (this.hasInclude(classFileName, clwIncludes)) {
                    foundAt = 'companion-direct';
                    step.companion = Date.now() - tCo;
                    return true;
                }
                if (await this.hasTransitiveInclude(classFileName, clwIncludes, clwPath)) {
                    foundAt = 'companion-transitive';
                    step.companion = Date.now() - tCo;
                    return true;
                }
            }
            step.companion = Date.now() - tCo;

            logger.debug(`⏱️ [IV] ❌ "${classFileName}" not found in any accessible scope`);
            return false;

        } catch (error) {
            logger.error(`Error verifying include: ${error instanceof Error ? error.message : String(error)}`);
            return false; // Fail safe - don't show hover if we can't verify
        } finally {
            const total = Date.now() - startedAt;
            if (total >= 150) {
                perfLogger.perf("isClassIncluded slow", {
                    class: classFileName,
                    ms: total,
                    found_at: foundAt,
                    currentInc_ms: step.currentInc,
                    currentTrans_ms: step.currentTrans,
                    parentDoc_ms: step.parentDoc,
                    parentInc_ms: step.parentInc,
                    parentTrans_ms: step.parentTrans,
                    companion_ms: step.companion,
                    uri: document.uri.split('/').pop() ?? ''
                });
            }
        }
    }

    /**
     * #191 — Resolves the implementation module(s) for a definition `.inc`.
     *
     * A `.inc` is never compiled standalone; it is included into a `.clw` MODULE
     * that implements its classes, and the dependency includes a class member
     * needs legitimately live in that `.clw`. Each `CLASS,...,MODULE('impl.clw')`
     * declaration names that module; a same-basename `.clw` is tried as a
     * fallback. The returned modules' include chains form part of the `.inc`'s
     * effective include scope.
     *
     * Only applies to `.inc` documents (a `.clw` already has its own includes
     * checked directly). Never returns the document itself.
     */
    private async getCompanionImplementationPaths(document: TextDocument, fromPath: string): Promise<string[]> {
        if (!/\.inc$/i.test(fromPath)) return [];

        const baseDir = path.dirname(fromPath);
        const fromLower = fromPath.toLowerCase();
        const paths = new Set<string>();

        // 1. MODULE('...clw') attributes on this file's CLASS declarations.
        const tokens = this.tokenCache.getTokens(document);
        for (const t of tokens) {
            if (t.referencedFile &&
                t.value?.toUpperCase() === 'MODULE' &&
                /\.clw$/i.test(t.referencedFile)) {
                const resolved = await this.resolveIncludePath(t.referencedFile, baseDir, fromPath);
                if (resolved && resolved.toLowerCase() !== fromLower) paths.add(resolved);
            }
        }

        // 2. Same-basename .clw fallback (e.g. StringTheory.inc -> StringTheory.clw).
        const sameBaseName = path.basename(fromPath).replace(/\.inc$/i, '.clw');
        const resolvedSame = await this.resolveIncludePath(sameBaseName, baseDir, fromPath);
        if (resolvedSame && resolvedSame.toLowerCase() !== fromLower) paths.add(resolvedSame);

        return [...paths];
    }

    /**
     * Checks if a class file is reachable via any transitive include chain.
     *
     * #345: the BFS previously ran PER CLASS CHECKED — a validation pass with
     * six class-typed variables paid six full walks of the include universe
     * (6 × 5.2s measured on the real 40-project solution), and the class-
     * constants code action paid another. The reachable-include-name SET is
     * now computed ONCE per host file and answered by membership; identity is
     * the host's direct-include fingerprint (same discipline as #344's chain
     * index — a path alone is not identity), TTL-bounded for chain-file edits.
     */
    private async hasTransitiveInclude(classFileName: string, directIncludes: IncludeStatement[], baseFilePath: string): Promise<boolean> {
        const set = await this.getReachableIncludeNameSet(directIncludes, baseFilePath);
        return set.has(path.basename(classFileName).toLowerCase());
    }

    /** #345 — every include NAME reachable from the host (direct + transitive), cached. */
    private getReachableIncludeNameSet(directIncludes: IncludeStatement[], baseFilePath: string): Promise<Set<string>> {
        const key = baseFilePath.toLowerCase();
        const fingerprint = directIncludes.map(i => i.fileName.toLowerCase()).sort().join(';');
        const cached = this.reachableSetCache.get(key);
        const now = Date.now();
        if (cached && cached.fingerprint === fingerprint && (now - cached.at) < IncludeVerifier.CACHE_DURATION) {
            return cached.promise;
        }

        // #366: publish the promise SYNCHRONOUSLY (before the first await inside the
        // build) so a concurrent second pass finds it and awaits the same walk.
        const promise = this.loadOrBuildReachableSet(directIncludes, baseFilePath, fingerprint);
        this.reachableSetCache.set(key, { at: now, fingerprint, promise });
        // A rejected build must not be cached as a poisoned entry — drop it so the
        // next call rebuilds (matches the fail-safe posture of isClassIncluded).
        promise.catch(() => {
            const current = this.reachableSetCache.get(key);
            if (current && current.promise === promise) this.reachableSetCache.delete(key);
        });
        return promise;
    }

    // #366 test observability — number of reachable-set BFS builds since process
    // start. A stampede (two concurrent passes) would bump this by 2 for one host.
    private reachableSetBuildCount = 0;
    getReachableSetBuildCount(): number { return this.reachableSetBuildCount; }
    // #366 — number of reachable sets served from the persisted disk cache.
    private reachableSetDiskReuseCount = 0;
    getReachableSetDiskReuseCount(): number { return this.reachableSetDiskReuseCount; }

    /**
     * #366: the reachable-set BFS costs ~2.6s cold and REBUILT every session (in-memory
     * cache only). Persist it to disk (mtime-validated, the #295 IncludeIndexDiskCache
     * pattern): a warm start reuses the derived name set and skips the whole walk.
     * Reuse is gated on the direct-include fingerprint (signature) + every contributing
     * file's mtime. Known limitation (shared with the #295 chain/sibling indexes): a
     * redirection RE-POINT — same include name resolving to a different file with both
     * files' mtimes unchanged — is not detected here; the #340 watcher clears the
     * in-memory cache on any workspace change, and a `.red`/settings edit changes mtimes.
     */
    private async loadOrBuildReachableSet(
        directIncludes: IncludeStatement[],
        baseFilePath: string,
        fingerprint: string
    ): Promise<Set<string>> {
        const disk = loadIncludeIndex<string[]>('reachableset', baseFilePath.toLowerCase());
        if (disk && await includeIndexFresh(disk, fingerprint)) {
            this.reachableSetDiskReuseCount++;
            return new Set(disk.payload);
        }
        return this.buildReachableIncludeNameSet(directIncludes, baseFilePath, fingerprint);
    }

    private async buildReachableIncludeNameSet(
        directIncludes: IncludeStatement[],
        baseFilePath: string,
        fingerprint: string
    ): Promise<Set<string>> {
        this.reachableSetBuildCount++;
        const set = new Set<string>();
        // #366: every chain file walked + its mtime, so a warm start can validate and
        // reuse the persisted set instead of re-walking the include universe.
        const contributing = new Map<string, number>();
        const baseDir = path.dirname(baseFilePath);
        const visited = new Set<string>();
        const queue: Array<{ fileName: string; baseDir: string }> = directIncludes.map(inc => ({ fileName: inc.fileName, baseDir }));
        for (const inc of directIncludes) set.add(inc.fileName.toLowerCase());

        // #366: the per-file awaits below resolve from cache synchronously, so they
        // only drain microtasks — the walk of hundreds of includes ran as one ~4.6s
        // event-loop block (max_blocked_ms=4575 measured). Yield to the loop every
        // 25ms so the walk stays in the background and the UI stays responsive.
        const timeSlice = makeTimeSlicer();

        while (queue.length > 0) {
            await timeSlice();
            const { fileName, baseDir: dir } = queue.shift()!;
            const visitKey = fileName.toLowerCase();
            if (visited.has(visitKey)) continue;
            visited.add(visitKey);

            // #329: the whole chain resolves through the ROOT file's project —
            // redirection follows the compile unit, not each intermediate file.
            const incPath = await this.resolveIncludePath(fileName, dir, baseFilePath);
            if (!incPath) continue;
            // #366: record this contributing file + mtime for the disk cache's drift check.
            try { contributing.set(incPath, (await fs.promises.stat(incPath)).mtimeMs); } catch { /* unreadable → skip */ }

            const subIncludes = await this.parseIncludesFromFilePath(incPath);
            const subDir = path.dirname(incPath);
            for (const sub of subIncludes) {
                const subKey = sub.fileName.toLowerCase();
                set.add(subKey);
                if (!visited.has(subKey)) {
                    queue.push({ fileName: sub.fileName, baseDir: subDir });
                }
            }
        }

        // #366: persist so a warm start skips this BFS entirely. Only when anchored to
        // real on-disk files (empty contributing = synthetic/unresolvable → never reused).
        if (contributing.size > 0) {
            saveIncludeIndex<string[]>('reachableset', baseFilePath.toLowerCase(), {
                signature: fingerprint,
                contributing: Object.fromEntries(contributing),
                payload: [...set],
            });
        }

        return set;
    }

    /**
     * Resolves an include filename to an absolute path using redirection or local directory.
     *
     * #329: `fromFsPath` is the source file whose include chain is being walked
     * (the compile unit) — its owning project's redirection answers FIRST, so
     * one project's answer can't poison another's (same-named per-app
     * includes, Edin's `w_[name]_rc.inc`).
     *
     * #344: the cache partition is the OWNER PROJECT, not the from-file —
     * redirection varies by project, and #329's per-file keying made every
     * document re-resolve the entire include universe from scratch
     * (include_check_avg_ms=12,888 measured on the real 43-project solution).
     */
    private async resolveIncludePath(fileName: string, baseDir: string, fromFsPath: string | null): Promise<string | null> {
        const cacheKey = `${fileName.toLowerCase()}|${this.ownerKeyFor(fromFsPath, baseDir)}`;
        const cached = this.pathCache.get(cacheKey);
        const now = Date.now();
        if (cached && (now - cached.timestamp) < IncludeVerifier.CACHE_DURATION) {
            return cached.resolvedPath;
        }

        // Owner-project-first, solution-order fallback (#328 shared util).
        let resolved: string | null = resolveViaProjectRedirection(fileName, fromFsPath);
        if (!resolved) {
            const candidate = path.resolve(baseDir, fileName);
            if (fs.existsSync(candidate)) resolved = candidate;
        }

        this.pathCache.set(cacheKey, { resolvedPath: resolved, timestamp: now });
        return resolved;
    }

    /**
     * #344 — the owning project's path for a from-file (memoized; the
     * underlying findProjectForFile walks projects × sourceFiles). Falls back
     * to the from-file's directory when no project owns it, preserving the
     * per-copy isolation the #329 pins require in no-solution layouts.
     */
    private ownerKeyFor(fromFsPath: string | null, baseDir: string): string {
        const probe = (fromFsPath ?? baseDir).toLowerCase();
        const cached = this.ownerKeyCache.get(probe);
        const now = Date.now();
        if (cached && now - cached.at < IncludeVerifier.CACHE_DURATION) return cached.key;

        const solutionManager = SolutionManager.getInstance();
        const owner = fromFsPath ? solutionManager?.findProjectForFile?.(fromFsPath) : undefined;
        const key = owner?.path
            ? path.normalize(owner.path).toLowerCase()
            : path.normalize(fromFsPath ? path.dirname(fromFsPath) : baseDir).toLowerCase();
        this.ownerKeyCache.set(probe, { key, at: now });
        return key;
    }

    /**
     * Parses INCLUDE statements directly from a file path using a regex scan.
     * Does not require a TextDocument — used for transitive include resolution.
     */
    private async parseIncludesFromFilePath(filePath: string): Promise<IncludeStatement[]> {
        const cacheKey = `path:${filePath.toLowerCase()}`;
        const cached = this.includeCache.get(cacheKey);
        const now = Date.now();
        if (cached && (now - cached.timestamp) < IncludeVerifier.CACHE_DURATION) {
            return cached.includes;
        }

        // #345 phase 4: disk-persisted include lists — an mtime-matched entry
        // answers without reading the file. On a restart this collapses the
        // reachable-set BFS from "read the include universe" to one JSON load.
        const pathKey = path.normalize(filePath).toLowerCase();
        let mtime: number | null = null;
        try {
            mtime = (await fs.promises.stat(filePath)).mtimeMs;
        } catch {
            // stat failure — fall through to the read (which will also fail
            // and cache the empty list)
        }
        if (mtime !== null) {
            const diskLists = await this.loadDiskIncludeLists();
            const diskEntry = diskLists.get(pathKey);
            if (diskEntry && diskEntry.mtime === mtime) {
                this.includeCache.set(cacheKey, { includes: diskEntry.includes, timestamp: now });
                return diskEntry.includes;
            }
        }

        const includes: IncludeStatement[] = [];
        try {
            IncludeVerifier.fileParseCount++;
            const contents = await fs.promises.readFile(filePath, 'utf-8');
            const lines = contents.split('\n');
            for (let i = 0; i < lines.length; i++) {
                const commentIdx = lines[i].indexOf('!');
                const effectiveLine = commentIdx >= 0 ? lines[i].substring(0, commentIdx) : lines[i];
                const m = effectiveLine.match(/INCLUDE\s*\(\s*['"]([^'"]+)['"]\s*\)(\s*,\s*ONCE)?/i);
                if (m) {
                    includes.push({ fileName: path.basename(m[1].trim()), hasOnce: !!m[2], lineNumber: i + 1 });
                }
            }
        } catch {
            // File unreadable — return empty
        }

        this.includeCache.set(cacheKey, { includes, timestamp: now });
        if (mtime !== null) {
            const diskLists = await this.loadDiskIncludeLists();
            diskLists.set(pathKey, { mtime, includes });
            this.scheduleDiskListsSave();
        }
        return includes;
    }

    /** #345 phase 4 — lazy one-time load of the persisted include lists. */
    private async loadDiskIncludeLists(): Promise<Map<string, { mtime: number; includes: IncludeStatement[] }>> {
        if (this.diskIncludeLists) return this.diskIncludeLists;
        this.diskIncludeLists = new Map();
        try {
            const raw = await fs.promises.readFile(IncludeVerifier.diskListsPath(), 'utf8');
            const parsed = JSON.parse(raw) as { version: number; entries: Record<string, { mtime: number; includes: IncludeStatement[] }> };
            if (parsed?.version === 1 && parsed.entries) {
                for (const [k, v] of Object.entries(parsed.entries)) {
                    this.diskIncludeLists.set(k, v);
                }
            }
        } catch {
            // No cache yet / unreadable — start empty
        }
        return this.diskIncludeLists;
    }

    private scheduleDiskListsSave(): void {
        this.diskListsDirty = true;
        if (this.diskSaveTimer !== undefined) return;
        this.diskSaveTimer = setTimeout(() => {
            this.diskSaveTimer = undefined;
            if (!this.diskListsDirty || !this.diskIncludeLists) return;
            this.diskListsDirty = false;
            const entries: Record<string, { mtime: number; includes: IncludeStatement[] }> = {};
            for (const [k, v] of this.diskIncludeLists) entries[k] = v;
            const payload = JSON.stringify({ version: 1, entries });
            const target = IncludeVerifier.diskListsPath();
            fs.promises.mkdir(path.dirname(target), { recursive: true })
                .then(() => fs.promises.writeFile(target, payload, 'utf8'))
                .catch(() => { /* best effort — rebuilt next session */ });
        }, 2000);
    }

    /** OS temp dir — same convention as the SDI disk cache (never pollutes the solution). */
    private static diskListsPath(): string {
        return path.join(os.tmpdir(), 'clarion-extension-iv', 'iv-includes.json');
    }

    // ── Test observability (#345 phase 4) ────────────────────────────────────
    private static fileParseCount = 0;
    /** Number of full file read+parse operations since process start. */
    public static getFileParseCount(): number { return IncludeVerifier.fileParseCount; }
    /** Force the debounced disk-list save to run now (tests). */
    public async flushDiskIncludeListsForTest(): Promise<void> {
        if (this.diskSaveTimer !== undefined) {
            clearTimeout(this.diskSaveTimer);
            this.diskSaveTimer = undefined;
        }
        if (!this.diskIncludeLists) return;
        this.diskListsDirty = false;
        const entries: Record<string, { mtime: number; includes: IncludeStatement[] }> = {};
        for (const [k, v] of this.diskIncludeLists) entries[k] = v;
        const target = IncludeVerifier.diskListsPath();
        await fs.promises.mkdir(path.dirname(target), { recursive: true });
        await fs.promises.writeFile(target, JSON.stringify({ version: 1, entries }), 'utf8');
    }

    /**
     * Gets all INCLUDE statements for a file (from cache or by parsing)
     * @param document The document to get includes for
     * @returns Array of include statements
     */
    private async getIncludesForFile(document: TextDocument): Promise<IncludeStatement[]> {
        const cached = this.includeCache.get(document.uri);
        const now = Date.now();

        // Return cached if still valid
        if (cached && (now - cached.timestamp) < IncludeVerifier.CACHE_DURATION) {
            logger.info(`Using cached includes for ${document.uri} (${cached.includes.length} includes)`);
            return cached.includes;
        }

        // Parse and cache
        logger.info(`Parsing includes for ${document.uri}`);
        const includes = await this.parseIncludes(document);
        
        this.includeCache.set(document.uri, {
            includes,
            timestamp: now
        });

        logger.info(`Cached ${includes.length} includes for ${document.uri}`);
        return includes;
    }

    /**
     * Parses INCLUDE statements from a document
     * Only looks in module scope (outside MAP, before first PROCEDURE)
     * @param document The document to parse
     * @returns Array of include statements
     */
    private async parseIncludes(document: TextDocument): Promise<IncludeStatement[]> {
        const includes: IncludeStatement[] = [];
        const tokens = this.tokenCache.getTokens(document);

        // Find boundaries: first MAP block and first PROCEDURE
        let mapStartLine = Number.MAX_SAFE_INTEGER;
        let mapEndLine = -1;
        let firstProcedureLine = Number.MAX_SAFE_INTEGER;

        // Find MAP block boundaries
        for (let i = 0; i < tokens.length; i++) {
            const token = tokens[i];
            
            // Find MAP keyword at column 0
            if (token.type === TokenType.Keyword && 
                token.value.toUpperCase() === 'MAP' && 
                token.start === 0) {
                mapStartLine = token.line;
                
                // Find corresponding END
                for (let j = i + 1; j < tokens.length; j++) {
                    const endToken = tokens[j];
                    if (endToken.type === TokenType.Keyword && 
                        endToken.value.toUpperCase() === 'END' && 
                        endToken.start === 0) {
                        mapEndLine = endToken.line;
                        break;
                    }
                }
                break;
            }
        }

        // Find first PROCEDURE at column 0
        for (const token of tokens) {
            if (token.type === TokenType.Label && 
                token.subType === TokenType.Procedure && 
                token.start === 0) {
                firstProcedureLine = token.line;
                break;
            }
        }

        logger.info(`Boundaries: MAP=${mapStartLine}-${mapEndLine}, FirstProc=${firstProcedureLine}`);

        // Scan for INCLUDE statements in module scope
        const lines = document.getText().split('\n');
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            
            // Stop at first PROCEDURE
            if (i >= firstProcedureLine) {
                logger.info(`Stopped at first PROCEDURE at line ${i}`);
                break;
            }

            // Skip if inside MAP block
            if (i >= mapStartLine && i <= mapEndLine) {
                continue;
            }

            // Strip Clarion line comment (!) before matching — commented INCLUDE must not count
            const commentIdx = line.indexOf('!');
            const effectiveLine = commentIdx >= 0 ? line.substring(0, commentIdx) : line;

            // Look for INCLUDE statement
            // Pattern: INCLUDE('filename.ext'),ONCE or INCLUDE('filename.ext')
            const includeMatch = effectiveLine.match(/INCLUDE\s*\(\s*['"]([^'"]+)['"]\s*\)(\s*,\s*ONCE)?/i);
            
            if (includeMatch) {
                const fileName = includeMatch[1].trim(); // Trim whitespace from filename
                const hasOnce = !!includeMatch[2];
                
                includes.push({
                    fileName: path.basename(fileName), // Just filename, ignore path
                    hasOnce,
                    lineNumber: i + 1
                });
                
                logger.info(`Found INCLUDE: ${fileName} at line ${i + 1}${hasOnce ? ' (ONCE)' : ''}`);
            }
        }

        return includes;
    }

    /**
     * Checks if a class filename is in the list of includes
     * @param classFileName The class file to look for
     * @param includes The list of includes to search
     * @returns true if found, false otherwise
     */
    private hasInclude(classFileName: string, includes: IncludeStatement[]): boolean {
        const searchName = path.basename(classFileName).toLowerCase();
        
        for (const include of includes) {
            if (include.fileName.toLowerCase() === searchName) {
                logger.info(`Matched: ${classFileName} with ${include.fileName} at line ${include.lineNumber}`);
                return true;
            }
        }
        
        return false;
    }

    /**
     * Gets the MEMBER parent document if it exists
     * @param document The current document
     * @returns The parent document or null if no MEMBER found
     */
    private async getMemberParentDocument(document: TextDocument): Promise<TextDocument | null> {
        // #366: memoize per (uri, version) — this is called once per include-check
        // (6x per pass), always with the same document, and the compute below does a
        // fresh disk read + tokenize of the (large) MEMBER parent each time.
        const key = document.uri.toLowerCase();
        const cached = this.memberParentCache.get(key);
        if (cached && cached.version === document.version &&
            Date.now() - cached.at < IncludeVerifier.CACHE_DURATION) {
            return cached.parent;
        }
        const parent = await this.computeMemberParentDocument(document);
        this.memberParentCache.set(key, { at: Date.now(), version: document.version, parent });
        return parent;
    }

    private async computeMemberParentDocument(document: TextDocument): Promise<TextDocument | null> {
        try {
            const tokens = this.tokenCache.getTokens(document);
            
            // #337: module header lookup — no line cap (comment banners are legal)
            const memberToken = TokenHelper.findMemberHeaderToken(tokens);

            if (!memberToken || !memberToken.referencedFile) {
                logger.debug(`⏱️ [IV] getMemberParentDocument: no MEMBER token in ${document.uri.split('/').pop()}`);
                return null;
            }

            logger.debug(`⏱️ [IV] getMemberParentDocument: resolving "${memberToken.referencedFile}"`);

            // Resolve path: try redirection parser first, then local directory fallback
            const currentFilePath = decodeURIComponent(document.uri.replace(/^file:\/\/\//, '')).replace(/\//g, '\\');
            const currentFileDir = path.dirname(currentFilePath);
            let resolvedPath: string | null = null;

            // #328: owner-project-first redirection
            resolvedPath = resolveViaProjectRedirection(memberToken.referencedFile, currentFilePath);
            if (!resolvedPath) {
                const candidate = path.resolve(currentFileDir, memberToken.referencedFile);
                if (fs.existsSync(candidate)) resolvedPath = candidate;
            }

            if (!resolvedPath) {
                logger.debug(`⏱️ [IV] getMemberParentDocument: MEMBER file not found: ${memberToken.referencedFile}`);
                return null;
            }

            // Read and create document
            const t0 = Date.now();
            const parentContents = await fs.promises.readFile(resolvedPath, 'utf-8');
            logger.debug(`⏱️ [IV] readFile "${path.basename(resolvedPath)}" took ${Date.now() - t0}ms (${parentContents.length} chars)`);
            const parentDoc = TextDocument.create(
                pathToCanonicalUri(resolvedPath),
                'clarion',
                1,
                parentContents
            );

            // Check for empty member (has MEMBER or CODE keyword)
            const t1 = Date.now();
            const parentTokens = this.tokenCache.getTokens(parentDoc);
            logger.debug(`⏱️ [IV] tokenize parent "${path.basename(resolvedPath)}" took ${Date.now() - t1}ms (${parentTokens.length} tokens)`);
            const hasEmptyMemberMarker = parentTokens.some(t =>
                t.start === 0 && 
                t.type === TokenType.Keyword &&
                (t.value.toUpperCase() === 'MEMBER' || t.value.toUpperCase() === 'CODE')
            );

            if (hasEmptyMemberMarker) {
                logger.debug(`⏱️ [IV] MEMBER parent has empty member marker - skipping include scan`);
                return null;
            }

            return parentDoc;

        } catch (error) {
            logger.error(`Error getting MEMBER parent: ${error instanceof Error ? error.message : String(error)}`);
            return null;
        }
    }

    /**
     * Clears the include cache for a specific document or all documents
     * @param uri Optional document URI to clear, or clears all if not provided
     */
    clearCache(uri?: string): void {
        if (uri) {
            this.includeCache.delete(uri);
            this.memberParentCache.delete(uri.toLowerCase()); // #366
            logger.info(`Cleared include cache for ${uri}`);
        } else {
            this.includeCache.clear();
            // #329: path resolutions are redirection-dependent — drop them on a
            // full clear (solution reload) alongside the include cache.
            this.pathCache.clear();
            this.ownerKeyCache.clear(); // #344
            this.reachableSetCache.clear(); // #345
            this.memberParentCache.clear(); // #366
            logger.info('Cleared all include caches');
        }
    }
}
