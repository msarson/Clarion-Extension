// Imported from the leaf module, not the re-export in ClarionTokenizer: that one
// pulls in DocumentStructure, which imports this file, and the cycle would leave
// TokenType undefined while CHAIN_LINK is being built at module load.
import { Token, TokenType } from '../tokenizer/TokenTypes';

/**
 * A Clarion label may carry a `PRE:FIX:` chain — `GLO:Name`, `reg:WIN:ShowExits`,
 * a generated `Module::Name`. The tokenizer's PREFIX:Field pattern captures
 * **exactly one colon**, so how such a name arrives depends on how many colons it
 * carries and how long the prefix is:
 *
 *   GLO:Name          -> StructurePrefix("GLO:Name")                          one token
 *   reg:WIN:Show      -> StructurePrefix("reg:WIN") ':' Function("Show")      three
 *   a:b:c:d           -> StructurePrefix("a:b")     ':' StructurePrefix("c:d")  three
 *   LONGPREFIX:Name   -> Variable("LONGPREFIX")     ':' Attribute("Name")     three
 *
 * A consumer that compares a call-site word (which keeps its colons, see
 * `TokenHelper.getWordRangeAtPosition`) against a single token therefore matches the
 * one-token shapes and misses every split one. That is one bug wearing several hats:
 * #597 in the MAP prototype classifier, #596 in the references provider, and the
 * second cause of #593. #525 fixed the same thing in the reference-count index by
 * teaching its word regex about colons — but only for a single colon, which is why
 * `GLO:Plain` worked afterwards and `reg:ITEM:CashOutExists` still did not.
 *
 * This is the one place that knows how to put such a name back together.
 */

export interface PrefixedName {
    /** The whole colon-joined name ending at the requested token. */
    name: string;
    /** Index of the first token of the name — equal to the requested index when there is no chain. */
    startIndex: number;
    /** Character offset of that first token, for callers that report a range. */
    start: number;
}

/**
 * Token types that can be a link in a prefix chain. The tokenizer classifies the
 * same identifier differently depending on where the one-colon cap fell and on
 * whether the word collides with a keyword, so this is deliberately broad: what
 * makes a token part of a name here is the `:` welded to it, not its type.
 */
const CHAIN_LINK = new Set<TokenType>([
    TokenType.StructurePrefix,
    TokenType.Label,
    TokenType.Variable,
    TokenType.Function,
    TokenType.Attribute,
]);

/**
 * The whole colon-qualified name **ending at** `tokens[index]`.
 *
 * Walks backwards over `<link> ':'` pairs on the same line and joins them. A token
 * with nothing of the sort in front of it resolves to itself, so callers can use
 * this unconditionally rather than branching on whether a name looks prefixed.
 *
 * Only a chain welded together on one line counts — a `:` that ends a line does not
 * reach across to the next one.
 */
export function resolvePrefixedName(tokens: Token[], index: number): PrefixedName {
    const token = tokens[index];
    let name = token.value;
    let startIndex = index;

    for (let j = index - 1; j >= 1; j -= 2) {
        const separator = tokens[j];
        const link = tokens[j - 1];
        if (separator.value !== ':' || separator.line !== token.line) break;
        if (link.line !== token.line || !CHAIN_LINK.has(link.type)) break;
        name = link.value + ':' + name;
        startIndex = j - 1;
    }

    return { name, startIndex, start: tokens[startIndex].start };
}

/**
 * Whether the name ending at `tokens[index]` — prefix chain included — is the first
 * token on its line.
 *
 * Inside a MAP this is what separates a prototype from a parameter, a type argument
 * or a continuation: `GROUP(CFG:Type)` carries a prefixed name that is emphatically
 * not a declaration, and it is never first on its line.
 */
export function prefixedNameStartsLine(tokens: Token[], index: number): boolean {
    const { startIndex } = resolvePrefixedName(tokens, index);
    const previous = tokens[startIndex - 1];
    return previous === undefined || previous.line !== tokens[index].line;
}
