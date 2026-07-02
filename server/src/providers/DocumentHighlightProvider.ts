import { DocumentHighlight, DocumentHighlightKind, Range } from 'vscode-languageserver-protocol';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { TokenCache } from '../TokenCache';
import { TokenType } from '../ClarionTokenizer';
import { TokenHelper } from '../utils/TokenHelper';
import LoggerManager from '../logger';

const logger = LoggerManager.getLogger("DocumentHighlightProvider");
logger.setLevel("error");

/**
 * Provides Document Highlight — highlights all occurrences of the symbol under
 * the cursor within the current file only.
 *
 * Uses a fast local token scan (no cross-file work) so it never blocks F12 or hover.
 *
 * Highlight kinds:
 *   Write (3) — declaration/label tokens
 *   Read  (2) — all other usages
 */
export class DocumentHighlightProvider {
    private tokenCache: TokenCache;

    constructor() {
        this.tokenCache = TokenCache.getInstance();
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

        const highlights: DocumentHighlight[] = [];

        for (const t of tokens) {
            // Skip comment, string, and directive tokens — they don't represent symbol usages
            if (t.type === TokenType.Comment || t.type === TokenType.String || t.type === TokenType.Directive) continue;

            // For Structure/Procedure tokens the symbol name is in t.label; for all others it's t.value
            const tokenName = (t.type === TokenType.Structure || TokenHelper.isProcedureOrFunction(t))
                ? t.label
                : t.value;

            if (!tokenName || tokenName.toUpperCase() !== wordUpper) continue;

            const col = t.start;
            const len = tokenName.length;
            const range = Range.create(t.line, col, t.line, col + len);

            // Declaration tokens get Write kind; references get Read kind
            const isDeclaration = t.type === TokenType.Label
                || t.type === TokenType.Structure
                || (TokenHelper.isProcedureOrFunction(t) && t.subType !== TokenType.Procedure);

            highlights.push(DocumentHighlight.create(range, isDeclaration
                ? DocumentHighlightKind.Write
                : DocumentHighlightKind.Read));
        }

        return highlights.length > 0 ? highlights : null;
    }
}
