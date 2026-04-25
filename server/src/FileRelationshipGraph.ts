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
import { TokenType } from './ClarionTokenizer';
import { TokenCache } from './TokenCache';
import { SolutionManager } from './solution/solutionManager';
import LoggerManager from './logger';

const logger = LoggerManager.getLogger("FileRelationshipGraph");
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

    private forwardEdges = new Map<string, FileEdge[]>();  // fromFile → edges
    private reverseEdges = new Map<string, FileEdge[]>();  // toFile   → edges

    private _built = false;
    private _building = false;
    private _buildDurationMs: number | undefined;

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
        this.forwardEdges.clear();
        this.reverseEdges.clear();

        const buildStart = Date.now();
        const visited = new Set<string>();
        const queue: string[] = projectFiles.map(f => this.normalizePath(f));

        const PARALLEL_BATCH = 20;

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

            // Process the batch concurrently
            const results = await Promise.all(batch.map(f => this.processFile(f)));
            for (const newFiles of results) {
                for (const f of newFiles) {
                    if (!visited.has(f)) queue.push(f);
                }
            }

            // Yield back to the event loop between batches
            await new Promise<void>(resolve => setImmediate(resolve));
        }

        this._buildDurationMs = Date.now() - buildStart;
        this._built = true;
        this._building = false;
        const edgeCount = this.getAllEdges().length;
        logger.error(`✅ [FRG] FileRelationshipGraph built: ${this.forwardEdges.size} files, ${edgeCount} edges in ${this._buildDurationMs}ms`);
    }

    /**
     * Rebuild edges for a single file after it changes.
     * Removes old edges sourced from this file and re-processes it.
     * No-op while the background build is running — the build will capture the latest state.
     */
    public async updateFile(uri: string): Promise<void> {
        if (this._building) return;
        const filePath = this.normalizePath(this.uriToPath(uri));

        // Remove old forward edges from this file and their reverse counterparts
        const oldEdges = this.forwardEdges.get(filePath) ?? [];
        this.forwardEdges.delete(filePath);
        for (const edge of oldEdges) {
            const rev = this.reverseEdges.get(edge.toFile);
            if (rev) {
                const filtered = rev.filter(e => e.fromFile !== filePath);
                if (filtered.length === 0) this.reverseEdges.delete(edge.toFile);
                else this.reverseEdges.set(edge.toFile, filtered);
            }
        }

        await this.processFile(filePath);
    }

    /**
     * Clear the graph. Called when the solution/project changes so it can be rebuilt.
     */
    public reset(): void {
        this.forwardEdges.clear();
        this.reverseEdges.clear();
        this._built = false;
        this._building = false;
        logger.error(`🔄 [FRG] FileRelationshipGraph reset`);
    }

    // ── Core processor ─────────────────────────────────────────────────────────

    /**
     * Extract edges from a file using TokenCache if available, otherwise use a fast
     * regex scan (avoids full tokenization for cold files — critical for large solutions).
     * Returns newly-discovered file paths to enqueue (INCLUDE targets).
     */
    private async processFile(filePath: string): Promise<string[]> {
        const tokenCache = TokenCache.getInstance();

        // Reconstruct URI in the same format VS Code uses so TokenCache hits
        const uri = this.pathToUri(filePath);

        let tokens = tokenCache.getTokensByUri(uri);

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
                    edgeType = 'CLASS_MODULE';
                    const classToken = tokens.find(t =>
                        t.line === token.line &&
                        t.type === TokenType.Structure &&
                        t.value.toUpperCase() === 'CLASS'
                    );
                    containingClass = classToken?.label;
                } else {
                    edgeType = 'MODULE';
                    const grandParent = parentToken.parent;
                    if (grandParent &&
                        (grandParent.subType === TokenType.GlobalProcedure ||
                         grandParent.subType === TokenType.MethodImplementation)) {
                        containingProcedure = grandParent.label;
                    }
                }
            }

            if (!edgeType) continue;

            const resolved = this.resolveFile(token.referencedFile, filePath);
            if (!resolved) continue;

            const toFile = this.normalizePath(resolved);
            const edge: FileEdge = { type: edgeType, fromFile: filePath, toFile, fromLine: token.line, containingProcedure, containingClass };

            if (!this.forwardEdges.has(filePath)) this.forwardEdges.set(filePath, []);
            this.forwardEdges.get(filePath)!.push(edge);
            if (!this.reverseEdges.has(toFile)) this.reverseEdges.set(toFile, []);
            this.reverseEdges.get(toFile)!.push(edge);

            if (edgeType === 'INCLUDE') newIncludes.push(toFile);
        }

        if (isProgramFile) {
            for (const implicitFile of ['BUILTINS.CLW', 'EQUATES.CLW']) {
                const resolved = this.resolveFile(implicitFile, filePath);
                if (!resolved) continue;
                const toFile = this.normalizePath(resolved);
                const edge: FileEdge = { type: 'IMPLICIT_INCLUDE', fromFile: filePath, toFile };
                if (!this.forwardEdges.has(filePath)) this.forwardEdges.set(filePath, []);
                this.forwardEdges.get(filePath)!.push(edge);
                if (!this.reverseEdges.has(toFile)) this.reverseEdges.set(toFile, []);
                this.reverseEdges.get(toFile)!.push(edge);
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
        const classRe    = /\bCLASS\s*\(/i;
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
                        const edge: FileEdge = { type: 'MEMBER', fromFile: filePath, toFile, fromLine: lineNum };
                        if (!this.forwardEdges.has(filePath)) this.forwardEdges.set(filePath, []);
                        this.forwardEdges.get(filePath)!.push(edge);
                        if (!this.reverseEdges.has(toFile)) this.reverseEdges.set(toFile, []);
                        this.reverseEdges.get(toFile)!.push(edge);
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
                const edge: FileEdge = { type: 'INCLUDE', fromFile: filePath, toFile, fromLine: lineNum };
                if (!this.forwardEdges.has(filePath)) this.forwardEdges.set(filePath, []);
                this.forwardEdges.get(filePath)!.push(edge);
                if (!this.reverseEdges.has(toFile)) this.reverseEdges.set(toFile, []);
                this.reverseEdges.get(toFile)!.push(edge);
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
                let containingClass: string | undefined;
                if (isClassAttr) {
                    // Extract class label — word before CLASS keyword
                    const labelMatch = /^([A-Za-z_][A-Za-z0-9_]*)\s+CLASS\b/i.exec(stripped.trim());
                    containingClass = labelMatch?.[1];
                }
                const edge: FileEdge = { type: edgeType, fromFile: filePath, toFile, fromLine: lineNum, containingClass };
                if (!this.forwardEdges.has(filePath)) this.forwardEdges.set(filePath, []);
                this.forwardEdges.get(filePath)!.push(edge);
                if (!this.reverseEdges.has(toFile)) this.reverseEdges.set(toFile, []);
                this.reverseEdges.get(toFile)!.push(edge);
            }
        }

        if (isProgramFile) {
            for (const implicitFile of ['BUILTINS.CLW', 'EQUATES.CLW']) {
                const resolved = this.resolveFile(implicitFile, filePath);
                if (!resolved) continue;
                const toFile = this.normalizePath(resolved);
                const edge: FileEdge = { type: 'IMPLICIT_INCLUDE', fromFile: filePath, toFile };
                if (!this.forwardEdges.has(filePath)) this.forwardEdges.set(filePath, []);
                this.forwardEdges.get(filePath)!.push(edge);
                if (!this.reverseEdges.has(toFile)) this.reverseEdges.set(toFile, []);
                this.reverseEdges.get(toFile)!.push(edge);
            }
        }

        return newIncludes;
    }

    // ── Query API ──────────────────────────────────────────────────────────────

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

    /** Normalise a path for use as a map key: lowercase, backslashes → forward slashes. */
    private normalizePath(filePath: string): string {
        return filePath.toLowerCase().replace(/\\/g, '/');
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
     * Uses the solution's redirection parser, falls back to relative-to-source.
     */
    private resolveFile(filename: string, fromFile: string): string | null {
        // Already absolute
        if (path.isAbsolute(filename) && fs.existsSync(filename)) return filename;

        const solutionManager = SolutionManager.getInstance();
        if (solutionManager?.solution) {
            for (const project of solutionManager.solution.projects) {
                const resolved = project.getRedirectionParser().findFile(filename);
                if (resolved?.path && fs.existsSync(resolved.path)) {
                    return resolved.path;
                }
                // Fallback: project directory
                const projPath = path.join(project.path, filename);
                if (fs.existsSync(projPath)) return projPath;
            }
        }

        // Fallback: relative to the source file
        const rel = path.join(path.dirname(fromFile), filename);
        if (fs.existsSync(rel)) return path.resolve(rel);

        return null;
    }
}
