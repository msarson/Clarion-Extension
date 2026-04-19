import { CodeLens, Range } from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Token, TokenType } from '../tokenizer/TokenTypes';
import { TokenCache } from '../TokenCache';
import LoggerManager from '../logger';

const logger = LoggerManager.getLogger('ClarionCodeLensProvider');
logger.setLevel('error');

/** The subset of procedure/class token subtypes that should display a lens. */
const LENS_SUBTYPES = new Set([
    TokenType.GlobalProcedure,
    TokenType.MethodImplementation,
    TokenType.Class,
]);

/** Data stored on an unresolved CodeLens so the resolve phase can count references. */
export interface CodeLensData {
    uri: string;
    line: number;
    character: number;
    symbolName: string;
}

/**
 * Returns the singular/plural reference count label.
 * Exported for unit testing.
 */
export function formatReferenceCount(count: number): string {
    return count === 1 ? '1 reference' : `${count} references`;
}

/**
 * Scans `tokens` and returns one unresolved `CodeLens` (no command yet) for
 * each GlobalProcedure, MethodImplementation, or CLASS declaration.
 *
 * The `data` field carries the URI + position needed by the resolve phase.
 * Exported for unit testing.
 */
export function buildCodeLenses(uri: string, tokens: Token[]): CodeLens[] {
    const lenses: CodeLens[] = [];

    for (const token of tokens) {
        if (!LENS_SUBTYPES.has(token.subType as TokenType)) continue;

        // Use token.label for the symbol name (full dotted name for MethodImplementation)
        const symbolName = token.label ?? token.value;
        const line = token.line;

        // For dotted labels (e.g. "Kanban.Init"), position on the method name part
        // so getWordRangeAtPosition returns "Init" and the dot-chain reconstruction
        // in ReferencesProvider reconstructs the full "Kanban.Init" expression.
        // For plain labels there is no dot so we use column 0.
        const dotIndex = symbolName.lastIndexOf('.');
        const character = dotIndex >= 0 ? dotIndex + 1 : 0;

        const data: CodeLensData = { uri, line, character, symbolName };

        lenses.push({
            range: Range.create(line, 0, line, 0),
            data,
        });
    }

    return lenses;
}

/**
 * LSP CodeLensProvider.
 *
 * - `provideCodeLenses` returns unresolved lenses (fast: token scan only).
 * - `resolveCodeLens` counts references via the ReferencesProvider and fills
 *   in the title + click command (called lazily per visible lens by VS Code).
 *
 * Closes #72
 */
export class ClarionCodeLensProvider {

    provideCodeLenses(document: TextDocument): CodeLens[] {
        const tokens = TokenCache.getInstance().getTokens(document);
        const lenses = buildCodeLenses(document.uri, tokens);
        logger.debug(`🔍 [CodeLens] ${lenses.length} lenses for ${document.uri}`);
        return lenses;
    }
}
