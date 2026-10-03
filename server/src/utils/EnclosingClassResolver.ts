import { TextDocument } from 'vscode-languageserver-textdocument';
import { Token, TokenType } from '../ClarionTokenizer';
import { DocumentStructure } from '../DocumentStructure';
import { TokenHelper } from './TokenHelper';
import { TokenCache } from '../TokenCache';

/**
 * #622 (#609 phase 3, step A) — the one implementation of "which class does the method at this
 * line belong to".
 *
 * Six copies of this walk existed, in four files, and they had drifted: three carried a 2-part
 * regex that misses the 3-part `Class.Iface.Method` form, one hopped out of its scope on any
 * `subType` rather than only a ROUTINE, and the colon-label fix (#247) had to be applied to each
 * copy separately. #608 was three of them taking the first same-named local class.
 *
 * The rule, as the Language Reference has it: a method's implementation prepends the label of the
 * CLASS to the label of the PROCEDURE, so the class is the part before the first dot — of the
 * scope's own label where the tokenizer captured it, otherwise of the scope's source line. A
 * ROUTINE is not a scope that can own a method, so a routine-body line asks its parent procedure.
 *
 * Clarion labels may contain ':' (`MyOwn:CLASS.My:My:Method`), which is why every pattern here
 * uses `[\w:]` and not `\w` — with `\w` the match fails and every SELF.member lookup inside such
 * a method dies (#247).
 */

/** `Class.Method` or `Class.Interface.Method` at the start of a line, colon-labels included. */
const METHOD_IMPLEMENTATION_LINE = /^([\w:]+)\.(?:[\w:]+\.)?([\w:]+)\s+(?:PROCEDURE|FUNCTION)/i;

/**
 * The scope that can own a method implementation at `line`: the innermost scope there, or, when
 * that is a ROUTINE, the procedure the routine belongs to.
 *
 * Returns undefined when there is no scope, and — deliberately — when a ROUTINE has no parent
 * scope, since a routine cannot itself own a method.
 */
export function resolveMethodScopeAtLine(structure: DocumentStructure, line: number): Token | undefined {
    const scope = TokenHelper.getInnermostScopeAtLine(structure, line);
    if (!scope) return undefined;
    if (scope.subType !== TokenType.Routine) return scope;
    return TokenHelper.getParentScopeOfRoutine(structure, scope) ?? undefined;
}

/**
 * The class name the method at `line` implements, or null when that line is not inside one.
 *
 * `structure` is optional only so callers that already hold one avoid re-deriving it; the cached
 * structure is used otherwise.
 */
export function resolveEnclosingClassName(
    document: TextDocument,
    line: number,
    structure?: DocumentStructure
): string | null {
    const struct = structure ?? TokenCache.getInstance().getStructure(document);
    const scope = resolveMethodScopeAtLine(struct, line);
    if (!scope) return null;

    // The tokenizer carries the full dotted label on a method implementation token, which is both
    // cheaper and more reliable than re-reading the line (#308: a column-0 label scan-back failed
    // silently where this does not).
    if (scope.value.includes('.')) return scope.value.split('.')[0];

    const scopeLine = document.getText().split(/\r?\n/)[scope.line];
    if (!scopeLine) return null;
    const m = scopeLine.match(METHOD_IMPLEMENTATION_LINE);
    return m ? m[1] : null;
}

/**
 * The CLASS *token* whose body encloses `line` — used where a caller needs the declaration token
 * itself (its label, its MODULE()/LINK() attributes) rather than just the name.
 *
 * #622: MethodHoverResolver.findClassTokenForMethodDeclaration and
 * ImplementationProvider.findClassTokenForMethod were byte-identical, comments included.
 *
 * Containment uses the tokenizer's own nesting-aware `finishesAt` (stack-based, END-marker driven
 * — not indentation) rather than hand-scanning for a column-0 END: a local or anonymous CLASS
 * declared inside a procedure's DATA section is closed by an INDENTED END, which a column-0 scan
 * would skip straight past.
 */
export function findEnclosingClassToken(tokens: Token[], line: number): Token | null {
    for (let i = tokens.length - 1; i >= 0; i--) {
        const token = tokens[i];
        if (token.line > line) continue;
        if (token.type !== TokenType.Structure || token.value.toUpperCase() !== 'CLASS') continue;
        if (token.finishesAt === undefined || line <= token.finishesAt) return token;
    }
    return null;
}

/** Whether a procedure label is a method implementation — i.e. it is `Class.Method`. */
export function isMethodImplementationLabel(label: string): boolean {
    return label.includes('.');
}

/** The class part of a method implementation label, or null when the label carries no class. */
export function classNameFromMethodLabel(label: string): string | null {
    const dot = label.indexOf('.');
    return dot > 0 ? label.substring(0, dot) : null;
}
