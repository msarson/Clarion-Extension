import { Token, TokenType } from '../tokenizer/TokenTypes';

/**
 * #855 — a CODE or DATA statement stands alone on its line (a comment may follow).
 * Anything else after it makes the word a label (`Code  LONG`) or a variable
 * reference (`Code = 1`), and anything before it makes it a variable reference
 * too (`Temp = Code`), not the execution marker. So does a line that continues the
 * statement above it (`Temp = 1 + |` then `Code` alone on the next line).
 *
 * `tokensOnLineOf(n)` returns the tokens of line n in document order.
 * Shared by DocumentStructure (which marks the start of a procedure's code) and
 * Find All References (where the statement is never a reference to a variable
 * named Code or Data).
 */
export function isBareExecutionMarker(token: Token, tokensOnLineOf: (line: number) => Token[]): boolean {
    if (!tokensOnLineOf(token.line).every(t => t === token || t.type === TokenType.Comment)) return false;
    return !followsLineContinuation(token.line, tokensOnLineOf);
}

/**
 * Whether line `line` continues the statement above it: the last token before it, comments
 * skipped, is a `|` line continuation. The line-indexed twin of PrefixChain.continuesPreviousLine.
 */
function followsLineContinuation(line: number, tokensOnLineOf: (line: number) => Token[]): boolean {
    for (let l = line - 1; l >= 0; l--) {
        const lineTokens = tokensOnLineOf(l);
        for (let j = lineTokens.length - 1; j >= 0; j--) {
            const t = lineTokens[j];
            if (t.type === TokenType.Comment) continue;
            return t.type === TokenType.LineContinuation || t.value === '|';
        }
    }
    return false;
}
