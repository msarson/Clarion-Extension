/**
 * FileRelationshipGraph — lightweight file-to-file relationship index.
 *
 * Nodes: source file paths (normalised, lowercase)
 * Edges: typed relationships — MODULE, CLASS_MODULE, INCLUDE, MEMBER, IMPLICIT_INCLUDE
 *
 * Built once in the background after solution load; updated incrementally on file change.
 * Enables O(1) reverse lookups needed by providers (e.g. "which file declared a MODULE
 * pointing at me, and inside which procedure?" — required for local MAP scope, issue #91).
 *
 * See: https://github.com/msarson/Clarion-Extension/issues/52
 */

import * as path from 'path';
import * as fs from 'fs';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { TokenType } from './ClarionTokenizer';
import { TokenCache } from './TokenCache';
import { SolutionManager } from './solution/solutionManager';
import { serverSettings } from './serverSettings';
import { resolveFileInNoSolutionMode } from './solution/findFileNoSolution';
import LoggerManager from './logger';

const logger = LoggerManager.getLogger("FileRelationshipGraph");
// #294/#295 diagnostics: always-on build progress — at real solution scale (3,016 files) the
// build's true cost was invisible because it never completed within any captured window.
const perfLogger = LoggerManager.getLogger("FileRelationshipGraph.Perf", "perf");
logger.setLevel("error");

/**
 * Edge types:
 *  MODULE           — MODULE('file.clw') inside a MAP block (procedures declared here, implemented there)
 *  CLASS_MODULE     — MODULE('file.clw') attribute on a CLASS declaration (class methods implemented there)
 *  INCLUDE          — INCLUDE('file.inc') explicit source inclusion
 *  MEMBER           — MEMBER('program.clw') — file belongs to this program
 *  IMPLICIT_INCLUDE — compiler-injected include (BUILTINS.CLW / EQUATES.CLW in every PROGRAM MAP)
 */
export type EdgeType = 'MODULE' | 'CLASS_MODULE' | 'INCLUDE' | 'MEMBER' | 'IMPLICIT_INCLUDE';

export interface FileEdge {
    type: EdgeType;
    fromFile: string;               // normalised absolute path (lowercase, forward slashes)
    toFile: string;                 // normalised absolute path
    fromLine?: number;              // 0-based line of the token that created this edge
    containingProcedure?: string;   // for MODULE edges inside a local MAP (inside a procedure)
    containingClass?: string;       // for CLASS_MODULE edges: the class label declaring this implementation
}

export class FileRelationshipGraph {
    private static instance: FileRelationshipGraph;

    private forwardEdges = new Map<string, FileEdge[]>();      // fromFile → edges
    private reverseEdges = new Map<string, FileEdge[]>();      // toFile   → edges
    private classModuleIndex = new Map<string, FileEdge[]>(); // className (upper) → CLASS_MODULE edges

    private _built = false;
    private _building = false;
    private _buildDurationMs: number | undefined;
    private _buildStartTime: Date | undefined;
    private _buildEndTime: Date | undefined;
    private _buildMode: 'solution' | 'no-solution' | null = null;
    private _noSolutionSignature: string | undefined;
    private _noSolutionSourceFile: string | undefined;
    private _noSolutionSourceUri: string | undefined;

    private constructor() {}

    public static getInstance(): FileRelationshipGraph {
        if (!FileRelationshipGraph.instance) {
            FileRelationshipGraph.instance = new FileRelationshipGraph();
        }
        return FileRelationshipGraph.instance;
    }

    public get isBuilt(): boolean { return this._built; }
    public get isBuilding(): boolean { return this._building; }
    public get buildDurationMs(): number | undefined { return this._buildDurationMs; }
    public get buildStartTime(): Date | undefined { return this._buildStartTime; }
    public get buildEndTime(): Date | undefined { return this._buildEndTime; }
    public get fileCount(): number { return this.forwardEdges.size; }
    public get edgeCount(): number { return this.getAllEdges().length; }

    // ── Build ──────────────────────────────────────────────────────────────────

    /**
     * Build the graph from all project source files.
     * Seeds from the cwproj file list, then follows INCLUDE edges recursively.
     * Processes files in parallel batches to maximise I/O throughput.
     * Yields between batches to keep the event loop responsive.
     */
    public async buildInBackground(projectFiles: string[]): Promise<void> {
        if (this._building) return;
        this._building = true;
        this._built = false;
        this._buildDurationMs = undefined;
        this._buildStartTime = new Date();
        this._buildEndTime = undefined;
        this.forwardEdges.clear();
        this.reverseEdges.clear();
        this.classModuleIndex.clear();
        this._buildMode = 'solution';
        this._noSolutionSignature = undefined;
        this._noSolutionSourceFile = undefined;
        this._noSolutionSourceUri = undefined;

        const buildStart = Date.now();
        const visited = new Set<string>();
        const queue: string[] = projectFiles.map(f => this.normalizePath(f));
        const totalSeeds = queue.length;
        let processed = 0;
        let nextProgressAt = 500;

        // #295: smaller batches — 20 concurrently-completing regex scans between yields produced
        // multi-second event-loop blocks on large generated modules; 10 halves the worst chunk.
        const PARALLEL_BATCH = 10;

        while (queue.length > 0) {
            // Dequeue up to PARALLEL_BATCH unvisited files
            const batch: string[] = [];
            while (queue.length > 0 && batch.length < PARALLEL_BATCH) {
                const filePath = queue.shift()!;
                if (visited.has(filePath)) continue;
                if (this.forwardEdges.has(filePath)) { visited.add(filePath); continue; }
                visited.add(filePath);
                batch.push(filePath);
            }

            if (batch.length === 0) continue;

            // Process the batch concurrently.
            // We intentionally do NOT enqueue the returned INCLUDE targets — recursively
            // following include chains into library directories (libsrc etc.) can add
            // thousands of files and make startup unresponsive on large solutions.
            // PROJECT files are the only seeds; their INCLUDE edges are still recorded so
            // reverse-include lookups work for files directly referenced by project files.
            await Promise.all(batch.map(f => this.processFile(f)));
            processed += batch.length;
            if (processed >= nextProgressAt) {
                nextProgressAt += 500;
                perfLogger.perf("FRG build progress", {
                    files_done: processed,
                    total_seeds: totalSeeds,
                    elapsed_ms: Date.now() - buildStart
                });
            }

            // Yield back to the event loop between batches
            await new Promise<void>(resolve => setImmediate(resolve));
        }

        this._buildDurationMs = Date.now() - buildStart;
        this._buildEndTime = new Date();
        this._built = true;
        this._building = false;
        const edgeCount = this.getAllEdges().length;
        logger.debug(`✅ [FRG] FileRelationshipGraph built: ${this.forwardEdges.size} files, ${edgeCount} edges in ${this._buildDurationMs}ms`);
    }

    /**
     * Rebuild edges for a single file after it changes.
     * Removes old edges sourced from this file and re-processes it.
     * No-op while the background build is running — the build will capture the latest state.
     */
    public async updateFile(uri: string): Promise<void> {
        if (this._buildMode === 'no-solution' && this._noSolutionSourceFile && this._noSolutionSourceUri) {
            const tokenCache = TokenCache.getInstance();
            const sourceText = tokenCache.getDocumentText(this._noSolutionSourceUri)
                ?? tokenCache.getDocumentText(this.pathToUri(this.denormalizePath(this._noSolutionSourceFile)))
                ?? (fs.existsSync(this.denormalizePath(this._noSolutionSourceFile))
                    ? fs.readFileSync(this.denormalizePath(this._noSolutionSourceFile), 'utf-8')
                    : '');
            const sourceDoc = TextDocument.create(this._noSolutionSourceUri, 'clarion', 1, sourceText);
            this.buildNoSolutionGraph(this._noSolutionSourceFile, sourceDoc);
            return;
        }

        if (this._building) return;
        const filePath = this.normalizePath(this.uriToPath(uri));

        // Remove old forward edges from this file and their reverse/index counterparts
        const oldEdges = this.forwardEdges.get(filePath) ?? [];
        this.forwardEdges.delete(filePath);
        for (const edge of oldEdges) {
            const rev = this.reverseEdges.get(edge.toFile);
            if (rev) {
                const filtered = rev.filter(e => e.fromFile !== filePath);
                if (filtered.length === 0) this.reverseEdges.delete(edge.toFile);
                else this.reverseEdges.set(edge.toFile, filtered);
            }
            if (edge.type === 'CLASS_MODULE' && edge.containingClass) {
                const key = edge.containingClass.toUpperCase();
                const idx = this.classModuleIndex.get(key);
                if (idx) {
                    const filtered = idx.filter(e => e.fromFile !== filePath);
                    if (filtered.length === 0) this.classModuleIndex.delete(key);
                    else this.classModuleIndex.set(key, filtered);
                }
            }
        }

        await this.processFile(filePath, uri);
    }

    /**
     * Clear the graph. Called when the solution/project changes so it can be rebuilt.
     */
    public reset(): void {
        this.forwardEdges.clear();
        this.reverseEdges.clear();
        this.classModuleIndex.clear();
        this._built = false;
        this._building = false;
        this._buildDurationMs = undefined;
        this._buildStartTime = undefined;
        this._buildEndTime = undefined;
        this._buildMode = null;
        this._noSolutionSignature = undefined;
        this._noSolutionSourceFile = undefined;
        this._noSolutionSourceUri = undefined;
        logger.debug(`🔄 [FRG] FileRelationshipGraph reset`);
    }

    /**
     * Lazily builds a bounded FRG for no-solution mode around the active document.
     *
     * The build is intentionally narrower than the full solution walk: it seeds
     * from the active document, follows resolved INCLUDE/MEMBER/MODULE targets,
     * and non-recursively scans the active/source/libsrc directories so reverse
     * INCLUDE and sibling MEMBER edges exist for nearby cross-file features.
     */
    public ensureNoSolutionGraphForDocument(document: TextDocument): void {
        if (SolutionManager.getInstance()?.solution) return;

        const sourcePath = this.normalizePath(this.uriToPath(document.uri));
        if (this._built && this.forwardEdges.has(sourcePath)) {
            return;
        }
        const signature = this.getNoSolutionSignature(sourcePath);
        if (
            this._built &&
            this._buildMode === 'no-solution' &&
            this._noSolutionSignature === signature
        ) {
            return;
        }

        this.buildNoSolutionGraph(sourcePath, document);
    }

    /**
     * Test-only — seed the graph with hand-built edges and mark it as built.
     * Used by `MultiFileFARFixture` (task `671d7cd8`) to enable cross-file Tier 6
     * (PROGRAM-scope global receiver) test coverage without driving the full
     * project-scan build pipeline. Each input edge's `fromFile` / `toFile` are
     * normalised via the same `normalizePath` rule used by the production walk
     * so test seeding produces identical key shapes.
     *
     * Callers should pair this with `reset()` in test teardown to restore the
     * singleton's pre-test state.
     */
    public seedEdgesForTest(edges: FileEdge[]): void {
        for (const e of edges) {
            this.addEdge({
                ...e,
                fromFile: this.normalizePath(e.fromFile),
                toFile: this.normalizePath(e.toFile)
            });
        }
        this._built = true;
    }

    private buildNoSolutionGraph(sourcePath: string, sourceDocument?: TextDocument): void {
        this._building = true;
        this._built = false;
        this._buildDurationMs = undefined;
        this._buildStartTime = new Date();
        this._buildEndTime = undefined;
        this.forwardEdges.clear();
        this.reverseEdges.clear();
        this.classModuleIndex.clear();
        this._buildMode = 'no-solution';
        this._noSolutionSignature = this.getNoSolutionSignature(sourcePath);
        this._noSolutionSourceFile = sourcePath;
        this._noSolutionSourceUri = sourceDocument?.uri ?? this.pathToUri(this.denormalizePath(sourcePath));

        const buildStart = Date.now();
        const visitedFiles = new Set<string>();
        const queuedFiles = new Set<string>();
        const scannedDirs = new Set<string>();
        const queue: string[] = [];

        const enqueueFile = (filePath: string | undefined | null) => {
            if (!filePath) return;
            const norm = this.normalizePath(filePath);
            if (visitedFiles.has(norm) || queuedFiles.has(norm)) return;
            queuedFiles.add(norm);
            queue.push(norm);
        };

        enqueueFile(sourcePath);
        this.enqueueDirectoryFiles(path.dirname(this.denormalizePath(sourcePath)), enqueueFile, scannedDirs);
        for (const libsrcDir of serverSettings.libsrcPaths ?? []) {
            this.enqueueDirectoryFiles(libsrcDir, enqueueFile, scannedDirs);
        }

        while (queue.length > 0) {
            const filePath = queue.shift()!;
            queuedFiles.delete(filePath);
            if (visitedFiles.has(filePath)) continue;
            visitedFiles.add(filePath);

            this.enqueueDirectoryFiles(path.dirname(this.denormalizePath(filePath)), enqueueFile, scannedDirs);

            const discovered = (
                sourceDocument &&
                filePath === sourcePath
            )
                ? this.processOpenDocument(sourcePath, sourceDocument)
                : this.processFileSync(filePath);

            for (const target of discovered) {
                enqueueFile(target);
                this.enqueueDirectoryFiles(path.dirname(this.denormalizePath(target)), enqueueFile, scannedDirs);
            }
        }

        this._buildDurationMs = Date.now() - buildStart;
        this._buildEndTime = new Date();
        this._built = true;
        this._building = false;
    }

    // ── Core processor ─────────────────────────────────────────────────────────

    /**
     * Extract edges from a file using TokenCache if available, otherwise use a fast
     * regex scan (avoids full tokenization for cold files — critical for large solutions).
     * Returns newly-discovered file paths to enqueue (INCLUDE targets).
     */
    private async processFile(filePath: string, originalUri?: string): Promise<string[]> {
        const tokenCache = TokenCache.getInstance();

        // Try the original URI first (exact key from VS Code, preserves casing)
        let tokens = originalUri ? tokenCache.getTokensByUri(originalUri) : null;

        if (!tokens || tokens.length === 0) {
            // Reconstruct URI in the same format VS Code uses so TokenCache hits
            const uri = this.pathToUri(filePath);
            tokens = tokenCache.getTokensByUri(uri);
        }

        if (!tokens || tokens.length === 0) {
            // Try alternate URI encoding (unencoded path variant)
            const uriAlt = 'file:///' + filePath.replace(/\\/g, '/');
            tokens = tokenCache.getTokensByUri(uriAlt) ?? null;
        }

        if (tokens && tokens.length > 0) {
            // File is in the token cache (open in editor) — use rich token data
            return this.processFileFromTokens(filePath, tokens);
        }

        // File not in cache — use fast regex scan instead of full tokenization
        try {
            if (!fs.existsSync(filePath)) return [];
            const content = await fs.promises.readFile(filePath, 'utf-8');
            return this.processFileFromText(filePath, content);
        } catch {
            return [];
        }
    }

    private processFileSync(filePath: string, originalUri?: string): string[] {
        const tokenCache = TokenCache.getInstance();

        let tokens = originalUri ? tokenCache.getTokensByUri(originalUri) : null;
        if (!tokens || tokens.length === 0) {
            const uri = this.pathToUri(this.denormalizePath(filePath));
            tokens = tokenCache.getTokensByUri(uri);
        }
        if (!tokens || tokens.length === 0) {
            const uriAlt = 'file:///' + this.denormalizePath(filePath).replace(/\\/g, '/');
            tokens = tokenCache.getTokensByUri(uriAlt) ?? null;
        }
        if (tokens && tokens.length > 0) {
            return this.processFileFromTokens(filePath, tokens);
        }

        try {
            const actualPath = this.denormalizePath(filePath);
            if (!fs.existsSync(actualPath)) return [];
            const content = fs.readFileSync(actualPath, 'utf-8');
            return this.processFileFromText(filePath, content);
        } catch {
            return [];
        }
    }

    private processOpenDocument(filePath: string, document: TextDocument): string[] {
        const tokenCache = TokenCache.getInstance();
        const tokens = tokenCache.getTokensByUri(document.uri);
        if (tokens && tokens.length > 0) {
            return this.processFileFromTokens(filePath, tokens);
        }
        return this.processFileFromText(filePath, document.getText());
    }

    /**
     * Extract edges from already-tokenized content (warm cache path).
     * Has full type/parent information for precise CLASS_MODULE detection.
     */
    private processFileFromTokens(filePath: string, tokens: import('./ClarionTokenizer').Token[]): string[] {
        const newIncludes: string[] = [];
        let isProgramFile = false;

        for (const token of tokens) {
            if (token.type === TokenType.ClarionDocument && token.value.toUpperCase() === 'PROGRAM') {
                isProgramFile = true;
            }

            if (!token.referencedFile) continue;

            let edgeType: EdgeType | null = null;
            let containingProcedure: string | undefined;
            let containingClass: string | undefined;

            if (token.type === TokenType.ClarionDocument && token.value.toUpperCase() === 'MEMBER') {
                edgeType = 'MEMBER';
            } else if (token.type === TokenType.Directive && token.value.toUpperCase() === 'INCLUDE') {
                edgeType = 'INCLUDE';
            } else if (token.type === TokenType.Structure && token.value.toUpperCase() === 'MODULE') {
                const parentToken = token.parent;
                const parentIsMap = parentToken &&
                    parentToken.type === TokenType.Structure &&
                    parentToken.value.toUpperCase() === 'MAP';

                if (!parentIsMap) {
                    const classToken = tokens.find(t =>
                        t.line === token.line &&
                        t.type === TokenType.Structure &&
                        t.value.toUpperCase() === 'CLASS'
                    );
                    if (classToken) {
                        edgeType = 'CLASS_MODULE';
                        containingClass = classToken.label;
                    } else {
                        // Root-level MODULE with no MAP parent — e.g., SV-generated INC file
                        // where the MODULE block is not wrapped in a MAP structure.
                        edgeType = 'MODULE';
                    }
                } else {
                    edgeType = 'MODULE';
                    const grandParent = parentToken.parent;
                    if (grandParent &&
                        (grandParent.subType === TokenType.GlobalProcedure ||
                         grandParent.subType === TokenType.MethodImplementation)) {
                        containingProcedure = grandParent.label;
                    }
                }
            } else if (token.referencedFile && token.value.toUpperCase() === 'MODULE') {
                // #198: On a CLASS declaration line MODULE tokenizes as an Attribute (and
                // LINK as a Function) — NOT a Structure — so the MODULE-Structure branch
                // above misses them, yet the tokenizer DID resolve their referencedFile.
                // Emit a CLASS_MODULE edge so the relationship (and its document link)
                // exists when the file is OPEN, matching the cold/regex path. A LINK to the
                // same file is surfaced as a link via DocumentLinkProvider's per-line
                // basename match against this edge, so it needs no separate edge.
                const classToken = tokens.find(t =>
                    t.line === token.line &&
                    t.type === TokenType.Structure &&
                    t.value.toUpperCase() === 'CLASS'
                );
                if (classToken) {
                    edgeType = 'CLASS_MODULE';
                    containingClass = classToken.label;
                }
            }

            if (!edgeType) continue;

            const resolved = this.resolveFile(token.referencedFile, filePath);
            if (!resolved) continue;

            const toFile = this.normalizePath(resolved);
            // Skip self-referencing MODULE edges — they add no topological information
            if (edgeType === 'MODULE' && toFile === filePath) continue;

            const edge: FileEdge = { type: edgeType, fromFile: filePath, toFile, fromLine: token.line, containingProcedure, containingClass };

            this.addEdge(edge);

            if (edgeType === 'INCLUDE') newIncludes.push(toFile);
        }

        if (isProgramFile) {
            for (const implicitFile of ['BUILTINS.CLW', 'EQUATES.CLW']) {
                const resolved = this.resolveFile(implicitFile, filePath);
                if (!resolved) continue;
                const toFile = this.normalizePath(resolved);
                const edge: FileEdge = { type: 'IMPLICIT_INCLUDE', fromFile: filePath, toFile };
                this.addEdge(edge);
            }
        }

        return newIncludes;
    }

    /**
     * Extract edges from raw source text using fast regex (cold file path).
     * Avoids full tokenization — order of magnitude faster for large solutions.
     * CLASS_MODULE detection uses line-context heuristic (CLASS keyword on same line).
     */
    private processFileFromText(filePath: string, content: string): string[] {
        const newIncludes: string[] = [];
        const lines = content.split(/\r?\n/);

        // Patterns for file-reference keywords
        const memberRe   = /^\s*MEMBER\s*\(\s*'([^']+)'\s*\)/i;
        const programRe  = /^\s*PROGRAM\b/i;
        const includeRe  = /\bINCLUDE\s*\(\s*'([^']+)'\s*(?:,\s*'[^']*'\s*)?\)/ig;
        const moduleRe   = /\bMODULE\s*\(\s*'([^']+)'\s*\)/ig;
        // #198: a CLASS attribute may be `CLASS,TYPE,MODULE(...)` (no paren after CLASS)
        // as well as `CLASS('Parent')`. Match CLASS as a word so a MODULE on a CLASS line
        // is typed CLASS_MODULE in the cold path too (parity with the warm/token path).
        const classRe    = /\bCLASS\b/i;
        // MAP context: track whether we are inside a MAP block
        const mapOpenRe  = /\bMAP\b/i;
        const mapCloseRe = /\bEND\b/i;

        let isProgramFile = false;
        let mapDepth = 0;

        for (let lineNum = 0; lineNum < lines.length; lineNum++) {
            const line = lines[lineNum];
            const stripped = line.replace(/!.*$/, ''); // strip comments

            if (programRe.test(stripped)) isProgramFile = true;

            // Track MAP depth (crude but sufficient — CLW files rarely nest MAP in non-MAP contexts)
            if (mapOpenRe.test(stripped)) mapDepth++;
            if (mapCloseRe.test(stripped) && mapDepth > 0) mapDepth--;

            // MEMBER('file') — only valid on line 0 or 1
            if (lineNum <= 1) {
                const m = memberRe.exec(stripped);
                if (m) {
                    const resolved = this.resolveFile(m[1], filePath);
                    if (resolved) {
                        const toFile = this.normalizePath(resolved);
                        this.addEdge({ type: 'MEMBER', fromFile: filePath, toFile, fromLine: lineNum });
                    }
                }
            }

            // INCLUDE('file')
            let m: RegExpExecArray | null;
            includeRe.lastIndex = 0;
            while ((m = includeRe.exec(stripped)) !== null) {
                const resolved = this.resolveFile(m[1], filePath);
                if (!resolved) continue;
                const toFile = this.normalizePath(resolved);
                this.addEdge({ type: 'INCLUDE', fromFile: filePath, toFile, fromLine: lineNum });
                newIncludes.push(toFile);
            }

            // MODULE('file') — class attribute if CLASS keyword on same line, else MAP block
            moduleRe.lastIndex = 0;
            while ((m = moduleRe.exec(stripped)) !== null) {
                const resolved = this.resolveFile(m[1], filePath);
                if (!resolved) continue;
                const toFile = this.normalizePath(resolved);
                const isClassAttr = classRe.test(stripped);
                const edgeType: EdgeType = isClassAttr ? 'CLASS_MODULE' : 'MODULE';
                // Skip self-referencing MODULE edges — they add no topological information
                if (edgeType === 'MODULE' && toFile === filePath) continue;
                let containingClass: string | undefined;
                if (isClassAttr) {
                    const labelMatch = /^([A-Za-z_][A-Za-z0-9_]*)\s+CLASS\b/i.exec(stripped.trim());
                    containingClass = labelMatch?.[1];
                }
                this.addEdge({ type: edgeType, fromFile: filePath, toFile, fromLine: lineNum, containingClass });
            }
        }

        if (isProgramFile) {
            for (const implicitFile of ['BUILTINS.CLW', 'EQUATES.CLW']) {
                const resolved = this.resolveFile(implicitFile, filePath);
                if (!resolved) continue;
                const toFile = this.normalizePath(resolved);
                this.addEdge({ type: 'IMPLICIT_INCLUDE', fromFile: filePath, toFile });
            }
        }

        return newIncludes;
    }

    // ── Query API──────────────────────────────────────────────────────────────

    /**
     * Returns all CLASS_MODULE edges for a given class name (case-insensitive).
     * O(1) lookup via the classModuleIndex — used by ImplementationProvider to
     * find the CLW file that implements a class without scanning all solution files.
     */
    public getEdgesForClass(className: string): FileEdge[] {
        return this.classModuleIndex.get(className.toUpperCase()) ?? [];
    }

    /**
     * Given an implementation file path, find the MODULE edge(s) declaring it.
     * Returns the first match (most common case: one procedure declares the MODULE).
     * Used for local MAP reverse lookup (issue #91).
     */
    public getModuleDeclarant(filePath: string): FileEdge | undefined {
        return this.reverseEdges.get(this.normalizePath(filePath))
            ?.find(e => e.type === 'MODULE');
    }

    /** Returns all MODULE edges pointing to a file (supports multiple declarants). */
    public getModuleDeclarants(filePath: string): FileEdge[] {
        return this.reverseEdges.get(this.normalizePath(filePath))
            ?.filter(e => e.type === 'MODULE') ?? [];
    }

    /** Returns the PROGRAM file path that a MEMBER file belongs to. */
    public getProgramFile(memberFilePath: string): string | undefined {
        return this.forwardEdges.get(this.normalizePath(memberFilePath))
            ?.find(e => e.type === 'MEMBER')?.toFile;
    }

    /**
     * Returns all MEMBER file paths belonging to the given PROGRAM file.
     * Used by FAR to widen `filesToSearch` for local classes — sibling MEMBER
     * files of the cursor's file may contain cross-procedure callers (P2b,
     * task 10ea5a80 track-(a) widening).
     */
    public getMemberFiles(programFilePath: string): string[] {
        return this.reverseEdges.get(this.normalizePath(programFilePath))
            ?.filter(e => e.type === 'MEMBER')
            .map(e => e.fromFile) ?? [];
    }

    /** Returns all files that include the given file (reverse INCLUDE). */
    public getReverseIncludes(filePath: string): FileEdge[] {
        return this.reverseEdges.get(this.normalizePath(filePath))
            ?.filter(e => e.type === 'INCLUDE') ?? [];
    }

    /** Returns all outgoing edges from a file. */
    public getForwardEdges(filePath: string): FileEdge[] {
        return this.forwardEdges.get(this.normalizePath(filePath)) ?? [];
    }

    /** Returns all edges in the graph (for debugging/diagnostics). */
    public getAllEdges(): FileEdge[] {
        const result: FileEdge[] = [];
        for (const edges of this.forwardEdges.values()) {
            result.push(...edges);
        }
        return result;
    }

    // ── Helpers ────────────────────────────────────────────────────────────────

    /** Register a single edge in all three indexes. */
    private addEdge(edge: FileEdge): void {
        if (!this.forwardEdges.has(edge.fromFile)) this.forwardEdges.set(edge.fromFile, []);
        this.forwardEdges.get(edge.fromFile)!.push(edge);
        if (!this.reverseEdges.has(edge.toFile)) this.reverseEdges.set(edge.toFile, []);
        this.reverseEdges.get(edge.toFile)!.push(edge);
        if (edge.type === 'CLASS_MODULE' && edge.containingClass) {
            const key = edge.containingClass.toUpperCase();
            if (!this.classModuleIndex.has(key)) this.classModuleIndex.set(key, []);
            this.classModuleIndex.get(key)!.push(edge);
        }
    }

    /** Normalise a path for use as a map key: lowercase, backslashes → forward slashes. */
    private normalizePath(filePath: string): string {
        return filePath.toLowerCase().replace(/\\/g, '/');
    }

    private denormalizePath(filePath: string): string {
        return filePath.replace(/\//g, '\\');
    }

    private getNoSolutionSignature(sourcePath: string): string {
        const libs = [...(serverSettings.libsrcPaths ?? [])]
            .map(p => this.normalizePath(p))
            .sort()
            .join(';');
        const exts = [...(serverSettings.defaultLookupExtensions ?? [])]
            .map(ext => ext.toLowerCase())
            .sort()
            .join(';');
        return [
            sourcePath,
            this.normalizePath(serverSettings.redirectionFile || ''),
            libs,
            exts
        ].join('|');
    }

    private enqueueDirectoryFiles(
        dirPath: string,
        enqueueFile: (filePath: string) => void,
        scannedDirs: Set<string>
    ): void {
        if (!dirPath) return;
        const normalizedDir = this.normalizePath(dirPath);
        if (scannedDirs.has(normalizedDir)) return;
        scannedDirs.add(normalizedDir);

        try {
            const clarionExts = new Set(
                ['.clw', '.inc', ...(serverSettings.defaultLookupExtensions ?? [])]
                    .map(ext => ext.toLowerCase())
            );
            for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
                if (!entry.isFile()) continue;
                const ext = path.extname(entry.name).toLowerCase();
                if (!clarionExts.has(ext)) continue;
                enqueueFile(path.join(dirPath, entry.name));
            }
        } catch {
            // best-effort directory widening only
        }
    }

    private pathToUri(filePath: string): string {
        // Percent-encode the drive colon to match VS Code's URI format
        const encoded = filePath.replace(/\\/g, '/').replace(/^([a-zA-Z]):/, (_, d) => d + '%3A');
        return 'file:///' + encoded;
    }

    private uriToPath(uri: string): string {
        return decodeURIComponent(uri.replace(/^file:\/\/\//i, '')).replace(/\//g, '\\');
    }

    /**
     * Resolve a bare filename (from token.referencedFile) to an absolute path.
     * Delegates entirely to the redirection parser's canonical chain
     * (3161ea89 + 2a2656b1): parser Tier 2 (project-root probe) covers the
     * case the old per-project safety net used to handle.
     *
     * `fromFile` is preserved on the signature for the 6 token-walk callers
     * but is no longer threaded into the parser call.
     */
    private resolveFile(filename: string, _fromFile: string): string | null {
        // Already absolute
        if (path.isAbsolute(filename) && fs.existsSync(filename)) return filename;

        const solutionManager = SolutionManager.getInstance();
        if (solutionManager?.solution) {
            for (const project of solutionManager.solution.projects) {
                const resolved = project.getRedirectionParser().findFile(filename);
                if (resolved?.path && fs.existsSync(resolved.path)) {
                    return resolved.path;
                }
            }
        }

        const sourceUri = this.pathToUri(this.denormalizePath(this.normalizePath(_fromFile)));
        const noSolutionHit = resolveFileInNoSolutionMode(filename, sourceUri);
        if (noSolutionHit?.path && fs.existsSync(noSolutionHit.path)) {
            return noSolutionHit.path;
        }

        return null;
    }
}
