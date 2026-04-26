import { CompletionItem, CompletionItemKind } from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Position } from 'vscode-languageserver';
import { TokenCache } from '../TokenCache';
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
    provide(document: TextDocument, position: Position, partial: string): CompletionItem[] {
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

            const add = (label: string, kind: CompletionItemKind, detail?: string) => {
                const key = label.toUpperCase();
                if (!seen.has(key)) {
                    seen.set(key, { label, kind, detail });
                } else if (detail && !seen.get(key)!.detail) {
                    // Upgrade with detail if not set
                    seen.get(key)!.detail = detail;
                }
            };

            // ----------------------------------------------------------------
            // A. Callable procedures
            // ----------------------------------------------------------------
            this.collectProcedures(tokens, document, scope?.containingProcedure, scope?.containingRoutine, add);

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

    private collectProcedures(
        tokens: Token[],
        document: TextDocument,
        containingProc: Token | undefined,
        containingRoutine: Token | undefined,
        add: (label: string, kind: CompletionItemKind, detail?: string) => void
    ): void {
        this.collectProceduresFromTokens(tokens, document, containingProc, add);

        // If this is a MEMBER file, also collect procedures from the PROGRAM file's MAP
        const memberToken = tokens.find(t =>
            t.type === TokenType.ClarionDocument && t.value.toUpperCase() === 'MEMBER' && t.referencedFile
        );
        if (memberToken?.referencedFile) {
            const programUri = 'file:///' + memberToken.referencedFile.replace(/\\/g, '/');
            const programTokens = this.tokenCache.getTokensByUri(programUri) ??
                this.tokenCache.getTokensByUri(programUri.toLowerCase());
            if (programTokens && programTokens.length > 0) {
                this.collectProceduresFromTokens(programTokens, document, undefined, add);
            }
        }
    }

    private collectProceduresFromTokens(
        tokens: Token[],
        document: TextDocument,
        containingProc: Token | undefined,
        add: (label: string, kind: CompletionItemKind, detail?: string) => void
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
            const mapContent = this.scopeAnalyzer.getMapTokensWithIncludes(mapToken, document, tokens);
            for (const t of mapContent) {
                if (t.subType === TokenType.MapProcedure && t.label) {
                    add(t.label, CompletionItemKind.Function, this.procedureDetail(t));
                }
            }
        }

        // GlobalProcedure labels in the same file
        for (const t of tokens) {
            if (t.subType === TokenType.GlobalProcedure && t.label) {
                add(t.label, CompletionItemKind.Function, 'PROCEDURE');
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

    private procedureDetail(t: Token): string {
        return t.label ? `PROCEDURE` : 'MAP PROCEDURE';
    }
}
