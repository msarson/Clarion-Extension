import { TextDocument } from 'vscode-languageserver-textdocument';
import { Token, TokenType } from '../ClarionTokenizer';
import { TokenCache } from '../TokenCache';
import { TokenHelper } from './TokenHelper';
import { SolutionManager } from '../solution/solutionManager';
import { resolveViaProjectRedirection } from './RedirectionResolution';
import { pathToCanonicalUri } from './UriUtils';
import LoggerManager from '../logger';
import * as fs from 'fs';
import * as path from 'path';

const logger = LoggerManager.getLogger('IncludeVerifier');
logger.setLevel('error');

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
    private pathCache = new Map<string, PathCache>();       // filename.lower -> PathCache
    private static readonly CACHE_DURATION = 60000; // 60 seconds

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
        try {
            logger.debug(`⏱️ [IV] isClassIncluded start: "${classFileName}" in ${document.uri.split('/').pop()}`);

            // Get includes from current file
            const t0 = Date.now();
            const currentIncludes = await this.getIncludesForFile(document);
            logger.debug(`⏱️ [IV] getIncludesForFile (current) took ${Date.now() - t0}ms → ${currentIncludes.length} includes`);
            
            // Check if class file is in current file's direct includes
            if (this.hasInclude(classFileName, currentIncludes)) {
                logger.debug(`⏱️ [IV] ✅ Found "${classFileName}" in current file`);
                return true;
            }

            // Check one level of transitive includes (e.g. MSSQL2DriverClass.Inc → DriverClass.Inc)
            const fromPath = decodeURIComponent(document.uri.replace(/^file:\/\/\/?/i, '')).replace(/\//g, '\\');
            if (await this.hasTransitiveInclude(classFileName, currentIncludes, fromPath)) {
                logger.debug(`⏱️ [IV] ✅ Found "${classFileName}" via transitive include`);
                return true;
            }

            // Not found - check MEMBER parent
            const t1 = Date.now();
            logger.debug(`⏱️ [IV] "${classFileName}" not in current file — checking MEMBER parent...`);
            const memberParent = await this.getMemberParentDocument(document);
            logger.debug(`⏱️ [IV] getMemberParentDocument took ${Date.now() - t1}ms → ${memberParent ? memberParent.uri.split('/').pop() : 'null'}`);
            
            if (memberParent) {
                const t2 = Date.now();
                const parentIncludes = await this.getIncludesForFile(memberParent);
                logger.debug(`⏱️ [IV] getIncludesForFile (parent) took ${Date.now() - t2}ms → ${parentIncludes.length} includes`);
                
                if (this.hasInclude(classFileName, parentIncludes)) {
                    logger.debug(`⏱️ [IV] ✅ Found "${classFileName}" in MEMBER parent`);
                    return true;
                }

                // Check transitive includes of MEMBER parent
                const parentPath = decodeURIComponent(memberParent.uri.replace(/^file:\/\/\/?/i, '')).replace(/\//g, '\\');
                if (await this.hasTransitiveInclude(classFileName, parentIncludes, parentPath)) {
                    logger.debug(`⏱️ [IV] ✅ Found "${classFileName}" via MEMBER parent transitive include`);
                    return true;
                }
            }

            // #191 — A definition `.inc` has no MEMBER parent, but it is never
            // compiled alone: it is included into the implementation module(s)
            // that implement its classes. Consult the companion `.clw` named by
            // each CLASS's MODULE() attribute (with same-basename fallback) and
            // check its include chain — the include legitimately lives there in
            // the standard Clarion split-class layout.
            const companionPaths = await this.getCompanionImplementationPaths(document, fromPath);
            for (const clwPath of companionPaths) {
                const clwIncludes = await this.parseIncludesFromFilePath(clwPath);
                if (this.hasInclude(classFileName, clwIncludes)) {
                    logger.debug(`⏱️ [IV] ✅ Found "${classFileName}" in companion module ${path.basename(clwPath)}`);
                    return true;
                }
                if (await this.hasTransitiveInclude(classFileName, clwIncludes, clwPath)) {
                    logger.debug(`⏱️ [IV] ✅ Found "${classFileName}" via companion module ${path.basename(clwPath)} transitive include`);
                    return true;
                }
            }

            logger.debug(`⏱️ [IV] ❌ "${classFileName}" not found in any accessible scope`);
            return false;

        } catch (error) {
            logger.error(`Error verifying include: ${error instanceof Error ? error.message : String(error)}`);
            return false; // Fail safe - don't show hover if we can't verify
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
     * Checks if a class file is reachable via any transitive include chain (BFS, cycle-safe).
     */
    private async hasTransitiveInclude(classFileName: string, directIncludes: IncludeStatement[], baseFilePath: string): Promise<boolean> {
        const baseDir = path.dirname(baseFilePath);
        const visited = new Set<string>();
        const queue: Array<{ fileName: string; baseDir: string }> = directIncludes.map(inc => ({ fileName: inc.fileName, baseDir }));

        while (queue.length > 0) {
            const { fileName, baseDir: dir } = queue.shift()!;
            const key = fileName.toLowerCase();
            if (visited.has(key)) continue;
            visited.add(key);

            // #329: the whole chain resolves through the ROOT file's project —
            // redirection follows the compile unit, not each intermediate file.
            const incPath = await this.resolveIncludePath(fileName, dir, baseFilePath);
            if (!incPath) continue;

            const subIncludes = await this.parseIncludesFromFilePath(incPath);
            if (this.hasInclude(classFileName, subIncludes)) return true;

            const subDir = path.dirname(incPath);
            for (const sub of subIncludes) {
                if (!visited.has(sub.fileName.toLowerCase())) {
                    queue.push({ fileName: sub.fileName, baseDir: subDir });
                }
            }
        }
        return false;
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

        const includes: IncludeStatement[] = [];
        try {
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
        return includes;
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
            logger.info(`Cleared include cache for ${uri}`);
        } else {
            this.includeCache.clear();
            // #329: path resolutions are redirection-dependent — drop them on a
            // full clear (solution reload) alongside the include cache.
            this.pathCache.clear();
            this.ownerKeyCache.clear(); // #344
            logger.info('Cleared all include caches');
        }
    }
}
