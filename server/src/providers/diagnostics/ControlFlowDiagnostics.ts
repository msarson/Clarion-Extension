import { TextDocument } from 'vscode-languageserver-textdocument';
import { Diagnostic, DiagnosticSeverity } from 'vscode-languageserver/node';
import { Token, TokenType } from '../../ClarionTokenizer';

/**
 * Warns when BREAK or CYCLE appears outside a LOOP or ACCEPT structure.
 *
 * Both LOOP and ACCEPT are valid loop constructs in Clarion:
 *   - LOOP … END  (or LOOP WHILE/UNTIL)
 *   - ACCEPT … END
 *
 * BREAK and CYCLE are valid anywhere inside either construct.
 * Labeled forms (BREAK Loop1 / CYCLE Loop1) target a specific outer loop and
 * are also valid — they are skipped here since the label itself is issue #65.
 *
 * Closes #64
 */
export function validateCycleBreakOutsideLoop(tokens: Token[], document: TextDocument): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];

    // Collect all LOOP and ACCEPT tokens that have a known end line (finishesAt).
    // finishesAt is set by DocumentStructure when available, or may be undefined
    // for raw tokenizer output (test path). When undefined we fall back to a
    // manual stack scan below.
    const loopRanges: { start: number; end: number }[] = [];

    const hasFinishesAt = tokens.some(
        t => t.type === TokenType.Structure &&
             (t.value.toUpperCase() === 'LOOP' || t.value.toUpperCase() === 'ACCEPT') &&
             t.finishesAt !== undefined
    );

    if (hasFinishesAt) {
        for (const t of tokens) {
            if (t.type !== TokenType.Structure) continue;
            const val = t.value.toUpperCase();
            if ((val === 'LOOP' || val === 'ACCEPT') && t.finishesAt !== undefined) {
                loopRanges.push({ start: t.line, end: t.finishesAt });
            }
        }
    } else {
        // Raw-token fallback: manually track LOOP/ACCEPT…END nesting.
        const stack: number[] = []; // start lines of open LOOP/ACCEPT blocks
        for (const t of tokens) {
            if (t.type === TokenType.Structure) {
                const val = t.value.toUpperCase();
                if (val === 'LOOP' || val === 'ACCEPT') {
                    stack.push(t.line);
                }
            }
            if (t.type === TokenType.EndStatement && t.value.toUpperCase() === 'END') {
                // Only pop if there's a LOOP/ACCEPT on the stack — other ENDs (CLASS, GROUP,
                // etc.) are handled by the full structure-terminator logic elsewhere.
                // Without finishesAt we can't distinguish, so we pop unconditionally when
                // the stack is non-empty.
                if (stack.length > 0) {
                    const start = stack.pop()!;
                    loopRanges.push({ start, end: t.line });
                }
            }
            // WHILE/UNTIL close a LOOP without an explicit END
            if (t.type === TokenType.Keyword) {
                const val = t.value.toUpperCase();
                if ((val === 'WHILE' || val === 'UNTIL') && stack.length > 0) {
                    const start = stack.pop()!;
                    loopRanges.push({ start, end: t.line });
                }
            }
        }
        // Any unclosed blocks at EOF — assume they end at last token line
        const lastLine = tokens.length > 0 ? tokens[tokens.length - 1].line : 0;
        for (const start of stack) {
            loopRanges.push({ start, end: lastLine });
        }
    }

    const isInsideLoop = (line: number): boolean =>
        loopRanges.some(r => line >= r.start && line <= r.end);

    for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i];
        if (t.type !== TokenType.Keyword) continue;

        const val = t.value.toUpperCase();
        if (val !== 'BREAK' && val !== 'CYCLE') continue;

        // Skip labeled forms: `BREAK Label` / `CYCLE Label`.
        // If the next token on the same line is a Variable or Label token it is the
        // target label — these are covered by issue #65 and skipped here.
        const next = tokens[i + 1];
        if (next && next.line === t.line &&
            (next.type === TokenType.Variable || next.type === TokenType.Label)) {
            continue;
        }

        if (!isInsideLoop(t.line)) {
            diagnostics.push({
                severity: DiagnosticSeverity.Warning,
                range: {
                    start: { line: t.line, character: t.start },
                    end: { line: t.line, character: t.start + t.value.length }
                },
                message: `'${val}' used outside of a LOOP or ACCEPT structure.`,
                source: 'clarion'
            });
        }
    }

    return diagnostics;
}
