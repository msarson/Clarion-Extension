import { DocumentHighlight, DocumentHighlightKind } from 'vscode-languageserver-protocol';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { ReferencesProvider } from './ReferencesProvider';
import LoggerManager from '../logger';

const logger = LoggerManager.getLogger("DocumentHighlightProvider");
logger.setLevel("error");

/**
 * Provides Document Highlight — highlights all occurrences of the symbol under
 * the cursor within the current file.  Delegates to ReferencesProvider for
 * location discovery and converts the same-file results to DocumentHighlight[].
 *
 * Highlight kinds:
 *   Write (3) — declaration line (lowest line number in results)
 *   Read  (2) — all other usages
 */
export class DocumentHighlightProvider {
    private referencesProvider: ReferencesProvider;

    constructor() {
        this.referencesProvider = new ReferencesProvider();
    }

    public async provideDocumentHighlights(
        document: TextDocument,
        position: { line: number; character: number }
    ): Promise<DocumentHighlight[] | null> {
        const locations = await this.referencesProvider.provideReferences(
            document,
            position,
            { includeDeclaration: true }
        );

        if (!locations || locations.length === 0) return null;

        // Filter to current file only
        const sameFile = locations.filter(loc => loc.uri === document.uri);
        if (sameFile.length === 0) return null;

        // Treat the earliest line as the declaration → Write kind
        const declarationLine = Math.min(...sameFile.map(loc => loc.range.start.line));

        return sameFile.map(loc => {
            const kind = loc.range.start.line === declarationLine
                ? DocumentHighlightKind.Write
                : DocumentHighlightKind.Read;
            return DocumentHighlight.create(loc.range, kind);
        });
    }
}
