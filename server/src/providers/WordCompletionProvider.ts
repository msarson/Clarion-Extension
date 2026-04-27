import { CompletionItem, CompletionItemKind, InsertTextFormat } from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Position } from 'vscode-languageserver';
import * as fs from 'fs';
import { TokenCache } from '../TokenCache';
import { FileRelationshipGraph } from '../FileRelationshipGraph';
import { ScopeAnalyzer } from '../utils/ScopeAnalyzer';
import { Token, TokenType } from '../tokenizer/TokenTypes';
import LoggerManager from '../logger';

const logger = LoggerManager.getLogger("WordCompletionProvider");
logger.setLevel("error");

/**
 * Provides general word/identifier completion for Clarion.
 *
 * Called when the user types a partial identifier (no dot trigger).
 * Surfaces in-scope symbols at the cursor position:
 *   - Callable procedures: local MAP, module-level MAP, PROGRAM-file MAP, file GlobalProcedures
 *   - Variables/Labels: procedure-local data section, routine sees parent procedure data section,
 *     MethodImplementation sees enclosing GlobalProcedure data section, global labels
 *   - Parameters: parsed from the PROCEDURE(...) signature
 *   - Constants/equates
 *
 * MAP INCLUDE file procedures are resolved via ScopeAnalyzer.getMapTokensWithIncludes.
 */
export class WordCompletionProvider {
    private tokenCache: TokenCache;
    private scopeAnalyzer: ScopeAnalyzer;

    constructor(tokenCache: TokenCache, scopeAnalyzer: ScopeAnalyzer) {
        this.tokenCache = tokenCache;
        this.scopeAnalyzer = scopeAnalyzer;
    }

    /**
     * Returns completion candidates for the word prefix at the cursor position.
     * @param document The active document
     * @param position Cursor position (post-character)
     * @param partial Word fragment already typed (empty = show all)
     */
    async provide(document: TextDocument, position: Position, partial: string): Promise<CompletionItem[]> {
        try {
            const tokens = this.tokenCache.getTokens(document);
            if (!tokens || tokens.length === 0) return [];

            const scope = this.scopeAnalyzer.getTokenScope(document, position);

            // Build a set of lines that have a PROCEDURE or ROUTINE keyword on them.
            // Label tokens on these lines are the procedure/routine *names*, not variables.
            const procDeclLines = new Set<number>();
            for (const t of tokens) {
                if (t.type === TokenType.Procedure || t.type === TokenType.Routine) {
                    procDeclLines.add(t.line);
                }
            }

            // Accumulated candidates: key = uppercase label, value = CompletionItem.
            // Keeping one item per label; for overloaded procedures the first found wins.
            const seen = new Map<string, CompletionItem>();

            const add = (label: string, kind: CompletionItemKind, detail?: string, documentation?: string) => {
                const key = label.toUpperCase();
                if (!seen.has(key)) {
                    const item: CompletionItem = { label, kind };
                    if (detail) item.detail = detail;
                    if (documentation) item.documentation = documentation;
                    seen.set(key, item);
                } else {
                    const existing = seen.get(key)!;
                    if (detail && !existing.detail) existing.detail = detail;
                    if (documentation && !existing.documentation) existing.documentation = documentation;
                }
            };

            // ----------------------------------------------------------------
            // A. Callable procedures
            // ----------------------------------------------------------------
            await this.collectProcedures(tokens, document, scope?.containingProcedure, scope?.containingRoutine, add);

            // ----------------------------------------------------------------
            // B. Variables / Labels
            // ----------------------------------------------------------------
            this.collectVariables(tokens, scope, procDeclLines, add);

            // ----------------------------------------------------------------
            // C. Parameters from PROCEDURE(...) signature
            // ----------------------------------------------------------------
            if (scope?.containingProcedure) {
                this.collectParameters(document, scope.containingProcedure, add);
            }
            // If inside a routine, also collect parent procedure parameters
            if (scope?.containingRoutine && scope.containingProcedure) {
                this.collectParameters(document, scope.containingProcedure, add);
            }

            // ----------------------------------------------------------------
            // D. Constants / equates
            // ----------------------------------------------------------------
            this.collectConstants(tokens, add);

            // ----------------------------------------------------------------
            // E. Language keywords
            // ----------------------------------------------------------------
            this.collectKeywords(seen);

            // ----------------------------------------------------------------
            // Filter by prefix
            // ----------------------------------------------------------------
            if (!partial) return Array.from(seen.values());
            const up = partial.toUpperCase();
            return Array.from(seen.values()).filter(c => (c.label as string).toUpperCase().startsWith(up));

        } catch (err) {
            logger.error(`WordCompletionProvider error: ${err instanceof Error ? err.message : String(err)}`);
            return [];
        }
    }

    // -------------------------------------------------------------------------
    // A. Procedures
    // -------------------------------------------------------------------------

    private async collectProcedures(
        tokens: Token[],
        document: TextDocument,
        containingProc: Token | undefined,
        containingRoutine: Token | undefined,
        add: (label: string, kind: CompletionItemKind, detail?: string, documentation?: string) => void
    ): Promise<void> {
        this.collectProceduresFromTokens(tokens, document, document, containingProc, add);

        // Use FileRelationshipGraph to find the PROGRAM file for this MEMBER file.
        // All procedures declared in ANY MODULE in the program's MAP are globally
        // accessible — the module/DLL name is irrelevant for completion purposes.
        const graph = FileRelationshipGraph.getInstance();
        const currentPath = decodeURIComponent(document.uri.replace(/^file:\/\/\//i, '')).replace(/\//g, '\\');
        const programPath = graph.isBuilt
            ? graph.getProgramFile(currentPath)
            : this.getProgramFileFromTokens(tokens);  // fallback while graph is building

        if (programPath) {
            const result = this.getTokensForFile(programPath);
            if (result && result.tokens.length > 0) {
                this.collectProceduresFromTokens(result.tokens, result.doc, document, undefined, add);
            }
        }
    }

    /**
     * Fallback: find program file path by scanning MEMBER token in current file tokens.
     * Used only while the FileRelationshipGraph is still building.
     */
    private getProgramFileFromTokens(tokens: Token[]): string | undefined {
        return tokens.find(t =>
            t.type === TokenType.ClarionDocument && t.value.toUpperCase() === 'MEMBER' && t.referencedFile
        )?.referencedFile;
    }

    /**
     * Get tokens for a file path — from TokenCache if available, otherwise read from disk.
     */
    private getTokensForFile(filePath: string): { tokens: Token[], doc: TextDocument } | null {
        const uri = 'file:///' + filePath.replace(/\\/g, '/');
        const cached = this.tokenCache.getTokensByUri(uri) ?? this.tokenCache.getTokensByUri(uri.toLowerCase());
        if (cached && cached.length > 0) {
            // Build a minimal doc just for line-text lookups (text comes from cache)
            const text = this.tokenCache.getDocumentText(uri) ?? this.tokenCache.getDocumentText(uri.toLowerCase()) ?? '';
            const doc = TextDocument.create(uri, 'clarion', 1, text);
            return { tokens: cached, doc };
        }

        try {
            if (!fs.existsSync(filePath)) return null;
            const content = fs.readFileSync(filePath, 'utf-8');
            const doc = TextDocument.create(uri, 'clarion', 1, content);
            return { tokens: this.tokenCache.getTokens(doc), doc };
        } catch {
            return null;
        }
    }

    private collectProceduresFromTokens(
        tokens: Token[],
        sourceDoc: TextDocument,
        currentDoc: TextDocument,
        containingProc: Token | undefined,
        add: (label: string, kind: CompletionItemKind, detail?: string, documentation?: string) => void
    ): void {
        // Find all MAP tokens
        const mapTokens = tokens.filter(t =>
            t.type === TokenType.Structure && t.value.toUpperCase() === 'MAP'
        );

        for (const mapToken of mapTokens) {
            const isLocalMap = mapToken.parent?.type === TokenType.Procedure &&
                (mapToken.parent.subType === TokenType.GlobalProcedure ||
                 mapToken.parent.subType === TokenType.MethodImplementation);

            if (isLocalMap) {
                // Only include local MAP procedures if cursor is inside the owning procedure
                if (!containingProc || mapToken.parent!.line !== containingProc.line) continue;
            }

            // Collect MapProcedure tokens from this MAP (including INCLUDE'd MAPs)
            const mapContent = this.scopeAnalyzer.getMapTokensWithIncludes(mapToken, currentDoc, tokens);
            for (const t of mapContent) {
                if (t.subType === TokenType.MapProcedure && t.label) {
                    const info = this.extractProcedureInfo(t, sourceDoc);
                    add(t.label, CompletionItemKind.Function, info.detail, info.documentation);
                }
            }
        }

        // GlobalProcedure labels in the same file
        for (const t of tokens) {
            if (t.subType === TokenType.GlobalProcedure && t.label) {
                const info = this.extractProcedureInfo(t, sourceDoc);
                add(t.label, CompletionItemKind.Function, info.detail, info.documentation);
            }
        }
    }

    // -------------------------------------------------------------------------
    // B. Variables / Labels
    // -------------------------------------------------------------------------

    private collectVariables(
        tokens: Token[],
        scope: ReturnType<ScopeAnalyzer['getTokenScope']>,
        procDeclLines: Set<number>,
        add: (label: string, kind: CompletionItemKind, detail?: string) => void
    ): void {
        const isLabel = (t: Token) =>
            (t.type === TokenType.Label || t.type === TokenType.Variable) &&
            t.start === 0 &&
            !t.isStructureField &&
            (!t.parent || t.parent.type !== TokenType.Structure) &&
            !procDeclLines.has(t.line);

        if (!scope) return;

        const containingProc = scope.containingProcedure;
        const containingRoutine = scope.containingRoutine;

        if (containingRoutine) {
            // Routine-local data section
            const routineEnd = containingRoutine.executionMarker?.line ?? containingRoutine.finishesAt ?? Number.MAX_SAFE_INTEGER;
            for (const t of tokens) {
                if (isLabel(t) && t.line > containingRoutine.line && t.line < routineEnd) {
                    add(t.value, CompletionItemKind.Variable, t.type === TokenType.Variable ? 'variable' : undefined);
                }
            }

            // Routines also see parent procedure locals (Clarion scope rule)
            if (containingProc) {
                this.collectProcLocals(tokens, containingProc, procDeclLines, add);
            }
            // And file-level globals/equates
            this.collectGlobalLabels(tokens, procDeclLines, isLabel, add);
            return;
        }

        if (containingProc) {
            // Determine if cursor is inside a local MethodImplementation
            const isInMethodImpl = scope.containingProcedure?.subType === TokenType.MethodImplementation;

            this.collectProcLocals(tokens, containingProc, procDeclLines, add);

            // MethodImplementation shares the enclosing GlobalProcedure's locals
            if (isInMethodImpl) {
                for (const t of tokens) {
                    if (
                        t.subType === TokenType.GlobalProcedure &&
                        t.finishesAt !== undefined &&
                        containingProc.line >= t.line &&
                        containingProc.line <= t.finishesAt
                    ) {
                        this.collectProcLocals(tokens, t, procDeclLines, add);
                        break;
                    }
                }
            }

            // Also collect file-level labels (global equates, constants declared before first proc)
            this.collectGlobalLabels(tokens, procDeclLines, isLabel, add);
            return;
        }

        // Global scope: collect Label tokens before the first procedure
        this.collectGlobalLabels(tokens, procDeclLines, isLabel, add);
    }

    /** Collect Label tokens before the first procedure (file-level equates, constants, globals). */
    private collectGlobalLabels(
        tokens: Token[],
        procDeclLines: Set<number>,
        isLabel: (t: Token) => boolean,
        add: (label: string, kind: CompletionItemKind, detail?: string) => void
    ): void {
        const firstProcLine = tokens.find(t =>
            t.type === TokenType.Procedure &&
            (t.subType === TokenType.GlobalProcedure || t.subType === TokenType.MethodImplementation)
        )?.line ?? Number.MAX_SAFE_INTEGER;

        for (const t of tokens) {
            if (isLabel(t) && t.line < firstProcLine) {
                add(t.value, CompletionItemKind.Variable);
            }
        }
    }

    /** Collect Label tokens in a procedure's data section (between PROCEDURE line and CODE). */
    private collectProcLocals(
        tokens: Token[],
        proc: Token,
        procDeclLines: Set<number>,
        add: (label: string, kind: CompletionItemKind, detail?: string) => void
    ): void {
        const codeMarkerLine = proc.executionMarker?.line ?? proc.finishesAt ?? Number.MAX_SAFE_INTEGER;

        for (const t of tokens) {
            if (
                (t.type === TokenType.Label || t.type === TokenType.Variable) &&
                t.start === 0 &&
                !t.isStructureField &&
                (!t.parent || t.parent.type !== TokenType.Structure) &&
                !procDeclLines.has(t.line) &&
                t.line > proc.line &&
                t.line < codeMarkerLine
            ) {
                add(t.value, CompletionItemKind.Variable);
            }
        }
    }

    // -------------------------------------------------------------------------
    // C. Parameters
    // -------------------------------------------------------------------------

    private collectParameters(
        document: TextDocument,
        proc: Token,
        add: (label: string, kind: CompletionItemKind, detail?: string) => void
    ): void {
        const procLineText = document.getText({
            start: { line: proc.line, character: 0 },
            end: { line: proc.line, character: 2000 }
        });

        // Handle multi-line signatures: look for PROCEDURE( and collect until )
        const parenOpen = procLineText.indexOf('(');
        const parenClose = procLineText.indexOf(')', parenOpen);
        if (parenOpen === -1 || parenClose === -1) return;

        const paramString = procLineText.slice(parenOpen + 1, parenClose);
        if (!paramString.trim()) return;

        for (const param of paramString.split(',')) {
            const stripped = param.trim().replace(/^<(.*)>$/, '$1').trim();
            // Match: [*&]? TYPE NAME [= default]
            const m = stripped.match(/([*&]?\s*\w+)\s+([A-Za-z_][A-Za-z0-9_]*(?::[A-Za-z_][A-Za-z0-9_]*)?)(?:\s*=.*)?$/i);
            if (m) {
                const paramName = m[2];
                const paramType = m[1].trim();
                add(paramName, CompletionItemKind.Variable, `parameter: ${paramType}`);
            }
        }
    }

    // -------------------------------------------------------------------------
    // E. Language keywords
    // -------------------------------------------------------------------------

    /**
     * Block-structure keywords that always require a matching END.
     * These get a snippet that places END on the next line so the user
     * doesn't have to type it — but nothing else is presumed.
     */
    private static readonly BLOCK_STRUCTURES = new Set([
        'ACCEPT', 'APPLICATION', 'BEGIN', 'CASE', 'CLASS', 'DETAIL',
        'EXECUTE', 'FILE', 'FOOTER', 'FORM', 'GROUP', 'HEADER',
        'IF', 'INTERFACE', 'ITEMIZE', 'JOIN', 'LOOP', 'MAP',
        'MENU', 'MENUBAR', 'MODULE', 'OLE', 'OPTION', 'QUEUE',
        'RECORD', 'REPORT', 'SECTION', 'SHEET', 'TAB', 'TOOLBAR',
        'VIEW', 'WINDOW',
    ]);

    /** Single-line keywords — no auto-insertion beyond the word itself. */
    private static readonly PLAIN_KEYWORDS = [
        'BREAK', 'CYCLE', 'EXIT', 'RETURN',
        'CODE', 'DATA',
        'ELSE', 'ELSIF', 'OF', 'OROF', 'THEN', 'TIMES',
        'UNTIL', 'WHILE',
        'AND', 'NOT', 'OR', 'XOR',
        'NEW', 'PARENT', 'SELF',
    ];

    private collectKeywords(seen: Map<string, CompletionItem>): void {
        for (const kw of WordCompletionProvider.BLOCK_STRUCTURES) {
            if (!seen.has(kw)) {
                seen.set(kw, {
                    label: kw,
                    kind: CompletionItemKind.Keyword,
                    insertText: `${kw}\n$0\nEND`,
                    insertTextFormat: InsertTextFormat.Snippet,
                });
            }
        }
        for (const kw of WordCompletionProvider.PLAIN_KEYWORDS) {
            if (!seen.has(kw)) {
                seen.set(kw, {
                    label: kw,
                    kind: CompletionItemKind.Keyword,
                });
            }
        }
    }

    // -------------------------------------------------------------------------
    // D. Constants / equates
    // -------------------------------------------------------------------------

    private collectConstants(
        tokens: Token[],
        add: (label: string, kind: CompletionItemKind, detail?: string) => void
    ): void {
        for (const t of tokens) {
            if (t.type === TokenType.Constant && t.value) {
                add(t.value, CompletionItemKind.Constant);
            }
        }
    }

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------

    /**
     * Extract the prototype signature and optional inline comment from the token's source line.
     * e.g. `CalculatePercentage    FUNCTION(REAL,REAL),REAL,DLL  ! Calculate Percentage`
     *   → { detail: 'FUNCTION(REAL,REAL),REAL,DLL', documentation: 'Calculate Percentage' }
     */
    private extractProcedureInfo(t: Token, sourceDoc: TextDocument): { detail: string; documentation?: string } {
        try {
            const lineText = sourceDoc.getText({
                start: { line: t.line, character: 0 },
                end: { line: t.line, character: 4000 }
            });
            const keyword = t.value.toUpperCase();  // 'PROCEDURE' or 'FUNCTION'
            const kwIdx = lineText.toUpperCase().indexOf(keyword);
            if (kwIdx === -1) return { detail: keyword };

            const fromKw = lineText.slice(kwIdx);
            const commentIdx = fromKw.indexOf('!');
            const signature = (commentIdx !== -1 ? fromKw.slice(0, commentIdx) : fromKw).trimEnd();
            const comment = commentIdx !== -1 ? fromKw.slice(commentIdx + 1).trim() : undefined;
            return { detail: signature || keyword, documentation: comment || undefined };
        } catch {
            return { detail: t.value };
        }
    }
}
