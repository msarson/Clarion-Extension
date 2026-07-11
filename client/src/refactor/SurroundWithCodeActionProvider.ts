import {
    CodeActionProvider, CodeAction, CodeActionKind, CodeActionContext,
    TextDocument, Range, Selection, ProviderResult
} from 'vscode';

/**
 * #277 — surfaces "Surround With" as a single refactor code action (Ctrl+. and the Refactor… menu),
 * so no dedicated keybinding is needed. The VS Code code-action widget renders a flat list with no
 * submenus, so exposing one action per structure would clutter it; instead — mirroring VS Code's own
 * built-in "Surround With Snippet" — a single action opens the quick pick (the effective submenu),
 * driven by the `clarion.surroundWith` command with no id.
 */
export class SurroundWithCodeActionProvider implements CodeActionProvider {
    public static readonly providedKinds = [CodeActionKind.RefactorRewrite];

    provideCodeActions(
        _document: TextDocument,
        range: Range | Selection,
        context: CodeActionContext
    ): ProviderResult<CodeAction[]> {
        // Only meaningful when there is something selected to wrap.
        if (range.isEmpty) {
            return [];
        }
        // Respect an explicit kind request (e.g. a Quick-Fix-only invocation): surround is a refactor.
        if (context.only && !context.only.intersects(CodeActionKind.RefactorRewrite)) {
            return [];
        }

        const action = new CodeAction('Surround With…', CodeActionKind.RefactorRewrite);
        // No structure id → the command prompts with the quick pick.
        action.command = { title: action.title, command: 'clarion.surroundWith' };
        return [action];
    }
}
