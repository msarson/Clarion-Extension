import * as fs from 'fs';
import * as path from 'path';
import LoggerManager from '../logger';

const logger = LoggerManager.getLogger('ExpExportIndex');
logger.setLevel('error');

/**
 * #330 tier 2 — lazy, per-project index of PROCEDURES exported from a
 * project's .exp file (the compiler-truth export list).
 *
 * Perf contract (Mark, explicit on #330): NO work at solution load. The .exp
 * is located and parsed on the FIRST cross-project FAR request that asks, and
 * the parse is mtime-validated so an app regeneration self-heals. Files are
 * millisecond-scale (largest real-substrate .exp is ~18k lines).
 *
 * Location: `<project.name>.exp` through the OWNING project's redirection
 * parser (the real generated reds put `*.exp = .\genFiles\exp` in
 * [Debug]/[Release] — verified on the Direct10 substrate), with the project
 * directory as the vanilla-red fallback (no red → .exp lands at the project
 * root; the parser's projectPath probe usually covers this, the explicit
 * fallback keeps headless/test layouts working).
 *
 * Format (verified against 43 real .exp files, banked on #330):
 *   - EXE apps: `NAME 'AP1' GUI`, no EXPORTS → exports nothing.
 *   - DLLs: `LIBRARY 'X' GUI` + EXPORTS, one decorated symbol per line:
 *       PROCNAME@F<argcodes>            → plain procedure  (what we index)
 *       METHOD@F<digits><CLASS><args>   → class method     (digit after @F — excluded)
 *       $NAME / FILE$PRE:KEY / ...      → data/file exports (excluded)
 */

interface ExpCacheEntry {
    exports: Set<string> | null;   // null = no .exp resolvable (EXE / not built)
    expPath: string | null;
    mtimeMs: number;
    checkedAt: number;
}

/** Minimal project surface this service needs (keeps tests light). */
export interface ExpProjectLike {
    name: string;
    path: string;
    getRedirectionParser?: () => { findFile: (name: string) => { path: string } | null } | undefined;
}

const NEGATIVE_TTL_MS = 30_000;

// Plain-procedure export line: NAME@F followed by a NON-digit (a digit right
// after @F is the class-name length prefix of a method export).
const PROC_EXPORT_RE = /^\s*([A-Za-z_][A-Za-z0-9_]*)@F(?![0-9])/;

export class ExpExportIndex {
    private static instance: ExpExportIndex | undefined;
    private cache = new Map<string, ExpCacheEntry>();

    public static getInstance(): ExpExportIndex {
        if (!ExpExportIndex.instance) ExpExportIndex.instance = new ExpExportIndex();
        return ExpExportIndex.instance;
    }

    /** Test hook — drop all cached parses. */
    public reset(): void {
        this.cache.clear();
    }

    /** True when `project`'s .exp exports a plain procedure named `name`. */
    public isExportedProcedure(project: ExpProjectLike, name: string): boolean {
        const exports = this.getExportedProcedures(project);
        return exports !== null && exports.has(name.toUpperCase());
    }

    /**
     * The project's exported procedure names (uppercased), or null when no
     * .exp resolves (EXE apps, unbuilt projects). Lazy + mtime-validated.
     */
    public getExportedProcedures(project: ExpProjectLike): Set<string> | null {
        const key = path.normalize(project.path).toLowerCase();
        const cached = this.cache.get(key);
        const now = Date.now();

        if (cached) {
            if (cached.expPath === null) {
                if (now - cached.checkedAt < NEGATIVE_TTL_MS) return null;
            } else {
                try {
                    const mtimeMs = fs.statSync(cached.expPath).mtimeMs;
                    if (mtimeMs === cached.mtimeMs) return cached.exports;
                } catch { /* fall through to re-locate */ }
            }
        }

        const expPath = this.locateExp(project);
        if (!expPath) {
            this.cache.set(key, { exports: null, expPath: null, mtimeMs: 0, checkedAt: now });
            return null;
        }

        try {
            const stat = fs.statSync(expPath);
            const exports = ExpExportIndex.parseExports(fs.readFileSync(expPath, 'utf8'));
            this.cache.set(key, { exports, expPath, mtimeMs: stat.mtimeMs, checkedAt: now });
            logger.info(`📦 [#330] Parsed ${exports.size} exported procedure(s) from ${expPath}`);
            return exports;
        } catch (err) {
            logger.info(`[#330] .exp read failed for ${expPath}: ${err instanceof Error ? err.message : String(err)}`);
            this.cache.set(key, { exports: null, expPath: null, mtimeMs: 0, checkedAt: now });
            return null;
        }
    }

    private locateExp(project: ExpProjectLike): string | null {
        const expName = `${project.name}.exp`;
        try {
            // #233 Stage 2: a project may have no redirection parser — guard.
            const parser = project.getRedirectionParser?.();
            const viaRed = parser?.findFile(expName);
            if (viaRed?.path && fs.existsSync(viaRed.path)) return viaRed.path;
        } catch { /* fall through */ }
        const local = path.join(project.path, expName);
        return fs.existsSync(local) ? local : null;
    }

    /** Parse EXPORTS lines for plain-procedure symbols. Exported for tests. */
    public static parseExports(content: string): Set<string> {
        const out = new Set<string>();
        for (const rawLine of content.split(/\r?\n/)) {
            const m = rawLine.match(PROC_EXPORT_RE);
            if (m) out.add(m[1].toUpperCase());
        }
        return out;
    }
}
