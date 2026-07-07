import { DocumentHighlight, DocumentHighlightKind, Range } from 'vscode-languageserver-protocol';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { TokenCache } from '../TokenCache';
import { Token, TokenType } from '../ClarionTokenizer';
import { TokenHelper } from '../utils/TokenHelper';
import { ScopeTypeIndexService, FileVarTypeIndex } from '../services/ScopeTypeIndexService';
import LoggerManager from '../logger';

const logger = LoggerManager.getLogger("DocumentHighlightProvider");
logger.setLevel("error");

/**
 * Provides Document Highlight — highlights all occurrences of the symbol under
 * the cursor within the current file only.
 *
 * Uses a fast local token scan (no cross-file work) so it never blocks F12 or hover.
 *
 * #254 rewrite:
 *   - Variable names are SCOPE-FILTERED through the shared ScopeTypeIndexService
 *     tier index (two unrelated procedure-locals named `Counter` no longer
 *     co-highlight; a shadowing local splits from the module variable it shadows).
 *   - Call sites (TokenType.Function, matched by VALUE) now highlight as Read —
 *     the old label-based extraction skipped them entirely.
 *   - Declaration lines emit exactly one Write at the label: the label-carrying
 *     Structure/Procedure token is suppressed when the same-line col-0 Label
 *     token already emits (its range started at the PROCEDURE keyword — a
 *     phantom highlight over the wrong columns).
 *
 * Highlight kinds:
 *   Write (3) — declaration tokens (col-0 Labels, structure/procedure headers)
 *   Read  (2) — all other usages
 */
export class DocumentHighlightProvider {
    private tokenCache: TokenCache;
    private scopeTypeIndex: ScopeTypeIndexService;

    constructor() {
        this.tokenCache = TokenCache.getInstance();
        this.scopeTypeIndex = new ScopeTypeIndexService(this.tokenCache);
    }

    public provideDocumentHighlights(
        document: TextDocument,
        position: { line: number; character: number }
    ): DocumentHighlight[] | null {
        const wordRange = TokenHelper.getWordRangeAtPosition(document, position);
        if (!wordRange) return null;

        const word = document.getText(wordRange);
        if (!word) return null;

        const wordUpper = word.toUpperCase();
        const tokens = this.tokenCache.getTokensByUri(document.uri);
        if (!tokens || tokens.length === 0) return null;

        // #254 — scope-aware line ranges for variable names (null = whole file,
        // e.g. procedure/class/type names the var index doesn't key).
        const index = this.scopeTypeIndex.buildFileVarTypeIndex(tokens);
        const allowedRanges = this.computeScopeRanges(index, position.line, word.toLowerCase());
        const inScope = (line: number): boolean =>
            allowedRanges === null || allowedRanges.some(([s, e]) => line >= s && line <= e);

        // Lines whose col-0 Label token matches the word — used to suppress the
        // duplicate emission from same-line label-carrying Structure/Procedure
        // tokens (whose token.start points at the keyword, not the name).
        const labelLines = new Set<number>();
        for (const t of tokens) {
            if (t.type === TokenType.Label && t.value.toUpperCase() === wordUpper) {
                labelLines.add(t.line);
            }
        }

        const procDeclSubtypes = new Set<TokenType>([
            TokenType.GlobalProcedure,
            TokenType.MethodImplementation,
            TokenType.MapProcedure,
            TokenType.MethodDeclaration,
            TokenType.InterfaceMethod,
        ]);

        const highlights: DocumentHighlight[] = [];

        for (const t of tokens) {
            // Skip comment, string, and directive tokens — they don't represent symbol usages
            if (t.type === TokenType.Comment || t.type === TokenType.String || t.type === TokenType.Directive) continue;

            let matchStart = t.start;
            let isDeclaration: boolean;

            if (t.type === TokenType.Label) {
                if (t.value.toUpperCase() !== wordUpper) continue;
                isDeclaration = true;
            } else if (t.type === TokenType.Variable ||
                       t.type === TokenType.Function ||
                       t.type === TokenType.ImplicitVariable) {
                // Usages and call sites — matched by VALUE (call tokens carry no label).
                if (t.value.toUpperCase() !== wordUpper) continue;
                isDeclaration = false;
            } else if (t.type === TokenType.ReferenceVariable) {
                // `&TypeName` reference declaration — highlight the name after `&`.
                if (t.value.toUpperCase() !== '&' + wordUpper) continue;
                matchStart = t.start + 1;
                isDeclaration = false;
            } else if (t.type === TokenType.Structure || TokenHelper.isProcedureOrFunction(t)) {
                // Label-carrying header tokens. The same-line col-0 Label token emits
                // the (correctly-positioned) highlight — suppress the duplicate whose
                // range would start at the STRUCTURE/PROCEDURE keyword.
                if (!t.label || t.label.toUpperCase() !== wordUpper) continue;
                if (labelLines.has(t.line)) continue;
                isDeclaration = t.type === TokenType.Structure ||
                    (t.subType !== undefined && procDeclSubtypes.has(t.subType));
            } else {
                continue;
            }

            if (!inScope(t.line)) continue;

            const range = Range.create(t.line, matchStart, t.line, matchStart + word.length);
            highlights.push(DocumentHighlight.create(range, isDeclaration
                ? DocumentHighlightKind.Write
                : DocumentHighlightKind.Read));
        }

        return highlights.length > 0 ? highlights : null;
    }

    /**
     * #254 — resolve which line ranges the word is visible in, per Clarion's
     * scope model (via the shared tier index):
     *   - routine-local at the cursor → that routine's range only
     *   - procedure-local/parameter  → the procedure's range minus any routine
     *     sub-ranges that shadow the name
     *   - module-scope               → the whole file minus procedure ranges
     *     that declare their own `word` (and routine sub-ranges that shadow it)
     *   - not a keyed variable        → null (no filtering — procedure/class/
     *     type names highlight file-wide)
     */
    private computeScopeRanges(
        index: FileVarTypeIndex,
        cursorLine: number,
        wordLower: string
    ): Array<[number, number]> | null {
        const proc = index.procScopes.find(s => cursorLine >= s.startLine && cursorLine <= s.endLine);
        const routine = proc?.routineScopes?.find(r => cursorLine >= r.startLine && cursorLine <= r.endLine);

        if (routine?.varTypes.has(wordLower)) {
            return [[routine.startLine, routine.endLine]];
        }
        if (proc?.varTypes.has(wordLower)) {
            const shadows = (proc.routineScopes ?? [])
                .filter(r => r.varTypes.has(wordLower))
                .map(r => [r.startLine, r.endLine] as [number, number]);
            return this.subtractRanges([proc.startLine, proc.endLine], shadows);
        }
        if (index.moduleScope.has(wordLower)) {
            const shadows: Array<[number, number]> = [];
            for (const s of index.procScopes) {
                if (s.varTypes.has(wordLower)) {
                    shadows.push([s.startLine, s.endLine]);
                } else {
                    for (const r of s.routineScopes ?? []) {
                        if (r.varTypes.has(wordLower)) shadows.push([r.startLine, r.endLine]);
                    }
                }
            }
            return this.subtractRanges([0, Number.MAX_SAFE_INTEGER], shadows);
        }
        return null;
    }

    /** Subtract each hole from the base range, returning the surviving sub-ranges. */
    private subtractRanges(
        base: [number, number],
        holes: Array<[number, number]>
    ): Array<[number, number]> {
        let ranges: Array<[number, number]> = [base];
        for (const [hs, he] of holes) {
            const next: Array<[number, number]> = [];
            for (const [s, e] of ranges) {
                if (he < s || hs > e) { next.push([s, e]); continue; }
                if (hs > s) next.push([s, hs - 1]);
                if (he < e) next.push([he + 1, e]);
            }
            ranges = next;
        }
        return ranges;
    }
}
