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
    // #320 — routines are first-class navigation symbols; their reference count
    // is procedure-scoped and same-file (label + DO sites), so the lens resolve
    // runs the exact scan directly (no approximate index involved).
    TokenType.Routine,
]);

/** Data stored on an unresolved CodeLens so the resolve phase can count references. */
export interface CodeLensData {
    uri: string;
    line: number;
    character: number;
    symbolName: string;
    /**
     * #315 — true when the lens symbol's class is declared in this same CLW.
     * The class is then invisible to other applications, so resolve scopes the
     * approximate count to this file — widened to the program's MEMBER family
     * when this CLW is a PROGRAM file (global-scope classes are app-visible).
     */
    fileScoped?: boolean;
    /**
     * #320 — true for a lens on a ROUTINE label. Resolve skips the approximate
     * index AND the index-building gate entirely: the exact count is a
     * same-file procedure-scoped scan (Route R), always fast, always exact.
     */
    routine?: boolean;
}

/**
 * Returns the singular/plural reference count label.
 * Exported for unit testing.
 */
export function formatReferenceCount(count: number): string {
    return count === 1 ? '1 reference' : `${count} references`;
}

/**
 * #315 — label for counts derived from the approximate ReferenceCountIndex
 * (word-occurrence scan, no scope resolution). The `~` tells the user this is
 * an estimate; clicking the lens runs the exact Find-All-References.
 */
export function formatApproximateReferenceCount(count: number): string {
    return `~${formatReferenceCount(count)}`;
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

    // #315 — classes DECLARED in this file. In a CLW the class belongs to this
    // application only (module/procedure scope → this file; global scope in a
    // PROGRAM file → this app's family, widened at resolve time), so lenses on
    // it and its method implementations get scoped approximate counts.
    // INC-declared classes are shared through INCLUDE — their usages live in
    // the includers, so INC lenses keep the solution-scoped estimate.
    const isClw = /\.clw$/i.test(uri);
    const localClasses = new Set<string>();
    if (isClw) {
        for (const token of tokens) {
            if (token.subType === TokenType.Class && token.label) {
                localClasses.add(token.label.toLowerCase());
            }
        }
    }

    for (const token of tokens) {
        if (!LENS_SUBTYPES.has(token.subType as TokenType)) continue;

        // Use token.label for the symbol name (full dotted name for MethodImplementation)
        const symbolName = token.label ?? token.value;
        const line = token.line;

        // For dotted labels (e.g. "Kanban.Init"), position on the method name part
        // so getWordRangeAtPosition returns "Init" and the dot-chain reconstruction
        // in ReferencesProvider reconstructs the full "Kanban.Init" expression.
        // For plain labels there is no dot so we use column 0. Routine labels may
        // contain '::' but never '.', so they anchor at column 0 — on the label.
        const dotIndex = symbolName.lastIndexOf('.');
        const character = dotIndex >= 0 ? dotIndex + 1 : 0;

        const data: CodeLensData = { uri, line, character, symbolName };

        // Class lens: the declaration is HERE by definition. Method impl lens:
        // scope by the dotted qualifier. Procedure lenses are never file-scoped.
        if (token.subType === TokenType.Class) {
            if (isClw) data.fileScoped = true;
        } else if (token.subType === TokenType.Routine) {
            data.routine = true;
        } else if (dotIndex >= 0 && localClasses.has(symbolName.slice(0, dotIndex).toLowerCase())) {
            data.fileScoped = true;
        }

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
