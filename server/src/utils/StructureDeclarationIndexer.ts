import * as fs from 'fs';
import * as path from 'path';
import { RedirectionFileParserServer, RedirectionEntry } from '../solution/redirectionFileParserServer';
import LoggerManager from '../logger';
import { serverSettings } from '../serverSettings';

const logger = LoggerManager.getLogger('StructureDeclarationIndexer');
logger.setLevel('warn');

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

    async buildIndex(projectPath: string): Promise<StructureIndex> {
        const startTime = Date.now();
        const byName = new Map<string, StructureDeclarationInfo[]>();

        try {
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

            logger.debug(`⏱️ [SDI] Starting scan of ${searchPaths.length} search paths for ${projectPath}`);

            const allFiles: string[] = [];
            for (const dir of searchPaths) {
                if (fs.existsSync(dir)) {
                    const files = fs.readdirSync(dir)
                        .filter(f => /\.(inc|equ)$/i.test(f))
                        .map(f => path.join(dir, f));
                    allFiles.push(...files);
                }
            }

            logger.debug(`⏱️ [SDI] Scanning ${allFiles.length} files in batches`);

            const BATCH_SIZE = 20;
            let total = 0;
            for (let i = 0; i < allFiles.length; i += BATCH_SIZE) {
                const batch = allFiles.slice(i, i + BATCH_SIZE);
                const batchResults = await Promise.all(batch.map(f => this.scanFile(f)));
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

            const duration = Date.now() - startTime;
            logger.debug(`⏱️ [SDI] Built in ${duration}ms: ${total} declarations, ${byName.size} unique names`);

        } catch (err) {
            logger.error(`Error building index: ${err instanceof Error ? err.message : String(err)}`);
        }

        return { byName, lastIndexed: Date.now(), projectPath: path.normalize(projectPath) };
    }

    /** Case-insensitive name lookup across all indexed projects (or a specific one) */
    find(name: string, projectPath?: string): StructureDeclarationInfo[] {
        const key = name.toLowerCase();
        if (projectPath) {
            return this.indexes.get(this.normalizeKey(projectPath))?.byName.get(key) ?? [];
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
