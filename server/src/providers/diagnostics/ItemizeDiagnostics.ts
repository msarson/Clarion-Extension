import { Diagnostic, DiagnosticSeverity } from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Token, TokenType } from '../../ClarionTokenizer';
import { TokenCache } from '../../TokenCache';

/**
 * Warns when an ITEMIZE block contains a column-0 declaration that is NOT an
 * EQUATE — Clarion's ITEMIZE structure only permits EQUATE members. Anything
 * else (a `MyVar LONG`, a `MyClass CLASS`, a nested `ITEMIZE`, etc.) is a
 * malformed ITEMIZE entry and the compiler will reject it.
 *
 * Comments, blank lines, and the ITEMIZE's own END terminator are fine — only
 * column-0 Label declarations are inspected.
 *
 * Nested ITEMIZE handling: the OUTER block flags the inner ITEMIZE's keyword
 * line as a non-EQUATE member. The inner pass (driven independently by
 * `getItemizeBlocks()`) then validates the inner block's own children. This
 * gives "warning fires per-level on offending children" without double-flagging.
 *
 * Reads `Token.dataType` populated by `ClarionTokenizer.populateDeclaredValues()`
 * (Gap D). Consumes Alice's `DocumentStructure.getItemizeBlocks()` (Gap B) for
 * the candidate list.
 */
export function validateItemizeBlocks(tokens: Token[], document: TextDocument): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    const structure = TokenCache.getInstance().getStructure(document);
    const itemizes = structure.getItemizeBlocks();
    if (itemizes.length === 0) return diagnostics;

    for (const itemize of itemizes) {
        if (itemize.finishesAt === undefined) continue;

        // Inner ITEMIZE blocks fully nested inside this one. Their members are
        // the inner pass's responsibility; the outer pass should only flag the
        // inner ITEMIZE keyword line itself.
        const innerItemizes = itemizes.filter(other =>
            other !== itemize &&
            other.finishesAt !== undefined &&
            other.line > itemize.line &&
            other.finishesAt < itemize.finishesAt!
        );

        for (const tok of tokens) {
            if (tok.type !== TokenType.Label) continue;
            if (tok.start !== 0) continue;
            if (tok.isStructureField) continue;

            // Strictly-inside check (excludes ITEMIZE's own opening label and END line).
            if (tok.line <= itemize.line) continue;
            if (tok.line >= itemize.finishesAt) continue;

            // Skip labels whose line falls inside a nested ITEMIZE — that pass
            // will handle them. We DO want to inspect the nested ITEMIZE's
            // *opening* line (where its label sits), so the test compares
            // strictly with the inner ITEMIZE's own line range.
            const inNested = innerItemizes.some(inner =>
                tok.line > inner.line && tok.line < inner.finishesAt!
            );
            if (inNested) continue;

            // EQUATE members are valid; anything else is an error.
            if (tok.dataType?.toUpperCase() === 'EQUATE') continue;

            diagnostics.push({
                severity: DiagnosticSeverity.Warning,
                code: 'itemize-non-equate',
                source: 'clarion',
                range: {
                    start: { line: tok.line, character: tok.start },
                    end:   { line: tok.line, character: tok.start + tok.value.length },
                },
                message: `Only EQUATE declarations are allowed inside an ITEMIZE block. '${tok.value}' is not a valid ITEMIZE member.`,
            });
        }
    }

    return diagnostics;
}
