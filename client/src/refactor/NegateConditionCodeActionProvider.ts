import {
    CodeActionProvider, CodeAction, CodeActionKind, CodeActionContext,
    TextDocument, Range, Selection, WorkspaceEdit, ProviderResult
} from 'vscode';
import { extractCondition, negateExpression } from './negateCondition';

/**
 * #279 — offers a "Negate condition" refactor code action (Ctrl+. / Refactor…) when the cursor is on
 * an IF / ELSIF / LOOP WHILE / LOOP UNTIL line. The action carries the edit directly (no command
 * round-trip and no placeholder to select), replacing just the condition span with its negation.
 */
export class NegateConditionCodeActionProvider implements CodeActionProvider {
    public static readonly providedKinds = [CodeActionKind.RefactorRewrite];

    provideCodeActions(
        document: TextDocument,
        range: Range | Selection,
        context: CodeActionContext
    ): ProviderResult<CodeAction[]> {
        if (context.only && !context.only.intersects(CodeActionKind.RefactorRewrite)) {
            return [];
        }
        const lineNumber = range.start.line;
        const span = extractCondition(document.lineAt(lineNumber).text);
        if (!span) {
            return [];
        }

        const negated = negateExpression(span.condition);
        const action = new CodeAction('Negate condition', CodeActionKind.RefactorRewrite);
        action.edit = new WorkspaceEdit();
        action.edit.replace(
            document.uri,
            new Range(lineNumber, span.start, lineNumber, span.end),
            negated
        );
        return [action];
    }
}
