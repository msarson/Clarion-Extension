import {
    CodeActionProvider, CodeAction, CodeActionKind, CodeActionContext,
    TextDocument, Range, Selection, WorkspaceEdit, EndOfLine, ProviderResult
} from 'vscode';
import { flipIfElse } from './flipIfElse';

/**
 * #278 — offers a "Flip IF/ELSE" refactor code action (Ctrl+. / Refactor…) when the cursor is on a
 * block-form `IF … ELSE … END`. The action negates the condition and swaps the branches, carrying
 * the edit directly. When the shape is not a clean two-branch flip (no ELSE, an ELSIF, a single-line
 * IF, …) nothing is offered — the Negate-condition action still covers the bare IF line.
 */
export class FlipIfElseCodeActionProvider implements CodeActionProvider {
    public static readonly providedKinds = [CodeActionKind.RefactorRewrite];

    provideCodeActions(
        document: TextDocument,
        range: Range | Selection,
        context: CodeActionContext
    ): ProviderResult<CodeAction[]> {
        if (context.only && !context.only.intersects(CodeActionKind.RefactorRewrite)) {
            return [];
        }
        const lines: string[] = [];
        for (let i = 0; i < document.lineCount; i++) {
            lines.push(document.lineAt(i).text);
        }
        const result = flipIfElse(lines, range.start.line);
        if (!result) {
            return [];
        }

        const eol = document.eol === EndOfLine.CRLF ? '\r\n' : '\n';
        const action = new CodeAction('Flip IF/ELSE', CodeActionKind.RefactorRewrite);
        action.edit = new WorkspaceEdit();
        action.edit.replace(
            document.uri,
            new Range(result.startLine, 0, result.endLine, document.lineAt(result.endLine).text.length),
            result.newLines.join(eol)
        );
        return [action];
    }
}
