import { Token, TokenType } from '../tokenizer/TokenTypes';
import { TokenHelper } from './TokenHelper';

/**
 * #711 — the global-scope labels of one token array, found in one pass and kept as long as the
 * array lives. Hover asks "is this word a global of this file?" on most words, and each asking
 * walked every token in the document whenever the answer was no (the usual case in a large
 * generated module). Each map holds the FIRST token, in array order, that the original `find`
 * predicate accepted, so a lookup returns exactly what that `find` returned.
 */
export interface GlobalScopeIndex {
    /** First CODE keyword line, if any. */
    readonly firstCodeLine: number | undefined;
    /**
     * SymbolFinderService.findGlobalVariableInCurrentFile: a column-0 Label with no parent, before
     * the first CODE (else the first PROCEDURE, else anywhere).
     */
    readonly plainLabels: Map<string, Token>;
    /**
     * VariableHoverResolver.findGlobalVariableHover: a column-0 Structure or procedure/function
     * whose `label` names it, before the first CODE (else anywhere).
     */
    readonly structureOrProcedureLabels: Map<string, Token>;
}

const indexes = new WeakMap<Token[], { length: number; index: GlobalScopeIndex }>();

export function globalScopeIndex(tokens: Token[]): GlobalScopeIndex {
    const hit = indexes.get(tokens);
    if (hit && hit.length === tokens.length) return hit.index;

    const firstCode = tokens.find(t => t.type === TokenType.Keyword && t.value.toUpperCase() === 'CODE');
    const firstProcedure = tokens.find(t => t.subType === TokenType.Procedure || t.subType === TokenType.GlobalProcedure);
    const plainEnd = firstCode ? firstCode.line : firstProcedure ? firstProcedure.line : Number.MAX_SAFE_INTEGER;
    const structEnd = firstCode ? firstCode.line : Number.MAX_SAFE_INTEGER;

    const plainLabels = new Map<string, Token>();
    const structureOrProcedureLabels = new Map<string, Token>();
    for (const t of tokens) {
        if (t.start !== 0) continue;
        if (t.type === TokenType.Label && t.parent === undefined && t.line < plainEnd) {
            const k = t.value.toLowerCase();
            if (!plainLabels.has(k)) plainLabels.set(k, t);
        }
        if (t.line < structEnd && t.label && (t.type === TokenType.Structure || TokenHelper.isProcedureOrFunction(t))) {
            const k = t.label.toLowerCase();
            if (!structureOrProcedureLabels.has(k)) structureOrProcedureLabels.set(k, t);
        }
    }
    const index: GlobalScopeIndex = { firstCodeLine: firstCode?.line, plainLabels, structureOrProcedureLabels };
    indexes.set(tokens, { length: tokens.length, index });
    return index;
}
