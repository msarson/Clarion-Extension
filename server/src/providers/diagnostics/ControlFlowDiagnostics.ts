import { TextDocument } from 'vscode-languageserver-textdocument';
import { Diagnostic, DiagnosticSeverity } from 'vscode-languageserver/node';
import { Token, TokenType } from '../../ClarionTokenizer';

/**
 * Warns when BREAK or CYCLE appears outside a LOOP or ACCEPT structure, and
 * when `BREAK <Label>` / `CYCLE <Label>` targets a label that is not on an
 * enclosing labelled LOOP/ACCEPT.
 *
 * Both LOOP and ACCEPT are valid loop constructs in Clarion:
 *   - LOOP … END  (or LOOP WHILE/UNTIL)
 *   - ACCEPT … END
 *
 * Labelled targets are resolved via the labelledRanges collected from
 * structure tokens whose `label` was set by DocumentStructure (#65).
 *
 * Closes #64; extended for the #65 label-target follow-up.
 */
export function validateCycleBreakOutsideLoop(tokens: Token[], document: TextDocument): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];

    // Collect all LOOP and ACCEPT tokens that have a known end line (finishesAt).
    // finishesAt is set by DocumentStructure when available, or may be undefined
    // for raw tokenizer output (test path). When undefined we fall back to a
    // manual stack scan below.
    const loopRanges: { start: number; end: number }[] = [];
    // Labelled subset — only populated when DocumentStructure has run, since
    // token.label depends on its handleStructureToken pass.
    const labelledRanges: { name: string; start: number; end: number }[] = [];

    const hasFinishesAt = tokens.some(
        t => t.type === TokenType.Structure &&
             (t.value.toUpperCase() === 'LOOP' || t.value.toUpperCase() === 'ACCEPT') &&
             t.finishesAt !== undefined
    );

    // Broader signal: did DocumentStructure run at all? Any structure or
    // procedure with finishesAt confirms it. Used to decide whether labelled
    // BREAK/CYCLE can be validated even in files with no LOOP/ACCEPT at all.
    const documentStructureRan = hasFinishesAt || tokens.some(t => t.finishesAt !== undefined);

    if (hasFinishesAt) {
        for (const t of tokens) {
            if (t.type !== TokenType.Structure) continue;
            const val = t.value.toUpperCase();
            if ((val === 'LOOP' || val === 'ACCEPT') && t.finishesAt !== undefined) {
                loopRanges.push({ start: t.line, end: t.finishesAt });
                if (t.label) {
                    labelledRanges.push({
                        name: t.label.toUpperCase(),
                        start: t.line,
                        end: t.finishesAt
                    });
                }
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

        // Labelled form: `BREAK Label` / `CYCLE Label`. The next token on the
        // same line is the target label (Variable when indented per the #65
        // promotion path, Label when at column 0). Validate that the label
        // resolves to an enclosing labelled LOOP/ACCEPT — otherwise warn on
        // the label token itself.
        const next = tokens[i + 1];
        const isLabelled = next && next.line === t.line &&
            (next.type === TokenType.Variable || next.type === TokenType.Label);

        if (isLabelled) {
            // Without DocumentStructure we have no reliable way to validate a
            // label target — preserve the prior "skip" behaviour for the raw
            // token fallback path.
            if (!documentStructureRan) continue;

            const target = next.value.toUpperCase();
            const matched = labelledRanges.some(r =>
                r.name === target && t.line >= r.start && t.line <= r.end
            );
            if (!matched) {
                diagnostics.push({
                    severity: DiagnosticSeverity.Warning,
                    range: {
                        start: { line: next.line, character: next.start },
                        end: { line: next.line, character: next.start + next.value.length }
                    },
                    message: `Label '${next.value}' does not refer to an enclosing LOOP or ACCEPT.`,
                    source: 'clarion'
                });
            }
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
