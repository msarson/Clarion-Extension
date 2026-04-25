/**
 * FileRelationshipGraph — lightweight file-to-file relationship index.
 *
 * Nodes: source file paths (normalised, lowercase)
 * Edges: typed relationships — MODULE, INCLUDE, MEMBER
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
import LoggerManager from './logger';

const logger = LoggerManager.getLogger("FileRelationshipGraph");
logger.setLevel("error");

export type EdgeType = 'MODULE' | 'INCLUDE' | 'MEMBER';

export interface FileEdge {
    type: EdgeType;
    fromFile: string;               // normalised absolute path (lowercase, forward slashes)
    toFile: string;                 // normalised absolute path
    containingProcedure?: string;   // for MODULE edges inside a local MAP (inside a procedure)
}

export class FileRelationshipGraph {
    private static instance: FileRelationshipGraph;

    private forwardEdges = new Map<string, FileEdge[]>();  // fromFile → edges
    private reverseEdges = new Map<string, FileEdge[]>();  // toFile   → edges

    private _built = false;
    private _building = false;

    private constructor() {}

    public static getInstance(): FileRelationshipGraph {
        if (!FileRelationshipGraph.instance) {
            FileRelationshipGraph.instance = new FileRelationshipGraph();
        }
        return FileRelationshipGraph.instance;
    }

    public get isBuilt(): boolean { return this._built; }
    public get isBuilding(): boolean { return this._building; }

    // ── Build ──────────────────────────────────────────────────────────────────

    /**
     * Build the graph from all project source files.
     * Seeds from the cwproj file list, then follows INCLUDE edges recursively.
     * Runs in the background, yielding every ~10 ms to keep the event loop responsive.
     */
    public async buildInBackground(projectFiles: string[]): Promise<void> {
        if (this._building) return;
        this._building = true;
        this._built = false;
        this.forwardEdges.clear();
        this.reverseEdges.clear();

        const visited = new Set<string>();
        // Iterative traversal — avoids stack overflow on deep include chains
        const queue: string[] = projectFiles.map(f => this.normalizePath(f));

        const BATCH_BUDGET_MS = 10;

        while (queue.length > 0) {
            const batchStart = Date.now();

            while (queue.length > 0 && (Date.now() - batchStart) < BATCH_BUDGET_MS) {
                const filePath = queue.shift()!;
                if (visited.has(filePath)) continue;
                visited.add(filePath);

                const newFiles = await this.processFile(filePath);
                for (const f of newFiles) {
                    if (!visited.has(f)) queue.push(f);
                }
            }

            if (queue.length > 0) {
                // Yield back to the event loop between batches
                await new Promise<void>(resolve => setImmediate(resolve));
            }
        }

        this._built = true;
        this._building = false;
        logger.error(`✅ [FRG] FileRelationshipGraph built: ${this.forwardEdges.size} files indexed`);
    }

    /**
     * Rebuild edges for a single file after it changes.
     * Removes old edges sourced from this file and re-processes it.
     */
    public async updateFile(uri: string): Promise<void> {
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
     * Extract edges from a file using TokenCache if available, otherwise tokenize from disk.
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

        if (!tokens || tokens.length === 0) {
            // File not in cache — read from disk and tokenize
            try {
                if (!fs.existsSync(filePath)) return [];
                const content = await fs.promises.readFile(filePath, 'utf-8');
                const doc = TextDocument.create(uri, 'clarion', 0, content);
                tokens = tokenCache.getTokens(doc);
            } catch {
                return [];
            }
        }

        const newIncludes: string[] = [];

        for (const token of tokens) {
            if (!token.referencedFile) continue;

            let edgeType: EdgeType | null = null;
            let containingProcedure: string | undefined;

            if (token.type === TokenType.ClarionDocument && token.value.toUpperCase() === 'MEMBER') {
                edgeType = 'MEMBER';
            } else if (token.type === TokenType.Directive && token.value.toUpperCase() === 'INCLUDE') {
                edgeType = 'INCLUDE';
            } else if (token.type === TokenType.Structure && token.value.toUpperCase() === 'MODULE') {
                edgeType = 'MODULE';
                // Detect local MAP: parent = MAP token, grandparent = procedure
                // Structure: GlobalProcedure > MAP > MODULE
                const mapToken = token.parent;
                if (mapToken) {
                    const grandParent = mapToken.parent;
                    if (grandParent &&
                        (grandParent.subType === TokenType.GlobalProcedure ||
                         grandParent.subType === TokenType.MethodImplementation)) {
                        containingProcedure = grandParent.label;
                    }
                }
            }

            if (!edgeType) continue;

            // Resolve bare filename to absolute path via redirection parser
            const resolved = this.resolveFile(token.referencedFile, filePath);
            if (!resolved) continue;

            const toFile = this.normalizePath(resolved);
            const edge: FileEdge = { type: edgeType, fromFile: filePath, toFile, containingProcedure };

            // Forward edge
            if (!this.forwardEdges.has(filePath)) this.forwardEdges.set(filePath, []);
            this.forwardEdges.get(filePath)!.push(edge);

            // Reverse edge
            if (!this.reverseEdges.has(toFile)) this.reverseEdges.set(toFile, []);
            this.reverseEdges.get(toFile)!.push(edge);

            // INCLUDE targets are enqueued for recursive processing
            if (edgeType === 'INCLUDE') {
                newIncludes.push(toFile);
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
