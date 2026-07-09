import {
    commands, languages, window, Range, Selection, EndOfLine, Disposable, ExtensionContext, QuickPickItem
} from 'vscode';
import { buildSurround, SURROUND_STRUCTURES } from '../refactor/surroundWith';
import { SurroundWithCodeActionProvider } from '../refactor/SurroundWithCodeActionProvider';
import { extractCondition, negateExpression } from '../refactor/negateCondition';
import { NegateConditionCodeActionProvider } from '../refactor/NegateConditionCodeActionProvider';
import { flipIfElse } from '../refactor/flipIfElse';
import { FlipIfElseCodeActionProvider } from '../refactor/FlipIfElseCodeActionProvider';
import LoggerManager from '../utils/LoggerManager';

const logger = LoggerManager.getLogger("RefactorCommands");
logger.setLevel("error");

interface StructurePick extends QuickPickItem { id: string; }

/**
 * #277 — "Surround With / Embedding": wrap the selected line(s) in a Clarion structure.
 *
 * Exposed two ways, both without a dedicated keybinding (to avoid per-refactor shortcut sprawl —
 * the generic Ctrl+. / Refactor affordances surface it):
 *   - a `SurroundWithCodeActionProvider` (refactor code actions, one per structure), and
 *   - the `clarion.surroundWith` command for the palette, which prompts with a quick pick when no
 *     structure id is passed. A code action invokes the same command with the chosen id.
 */
export function registerRefactorCommands(context: ExtensionContext): Disposable[] {
    const surroundWith = commands.registerCommand('clarion.surroundWith', async (structureId?: string) => {
        const editor = window.activeTextEditor;
        if (!editor) {
            return;
        }
        const doc = editor.document;
        const selection = editor.selection;

        // Operate on whole lines. A selection whose end sits at column 0 of a later line does not
        // include that line (VS Code's trailing-line convention).
        const startLine = selection.start.line;
        let endLine = selection.end.line;
        if (endLine > startLine && selection.end.character === 0) {
            endLine--;
        }

        const selectedLines: string[] = [];
        for (let l = startLine; l <= endLine; l++) {
            selectedLines.push(doc.lineAt(l).text);
        }

        // A code action passes the chosen structure id directly; the palette prompts.
        let id = structureId;
        if (!id) {
            const pick = await window.showQuickPick<StructurePick>(
                SURROUND_STRUCTURES.map(s => ({ label: s.label, id: s.id })),
                { placeHolder: 'Surround with…', matchOnDescription: true }
            );
            if (!pick) {
                return;
            }
            id = pick.id;
        }

        const baseIndent = /^\s*/.exec(doc.lineAt(startLine).text)?.[0] ?? '';
        const tabSize = typeof editor.options.tabSize === 'number' ? editor.options.tabSize : 2;
        const indentUnit = editor.options.insertSpaces === false ? '\t' : ' '.repeat(tabSize);

        let result;
        try {
            result = buildSurround(selectedLines, id, { baseIndent, indentUnit });
        } catch (err) {
            logger.error(`Surround With failed: ${err instanceof Error ? err.message : String(err)}`);
            return;
        }

        const eol = doc.eol === EndOfLine.CRLF ? '\r\n' : '\n';
        const newText = result.lines.join(eol);
        const replaceRange = new Range(startLine, 0, endLine, doc.lineAt(endLine).text.length);

        const applied = await editor.edit(eb => eb.replace(replaceRange, newText));
        if (!applied) {
            return;
        }

        // Select the placeholder (condition/expression) so the user can type over it; otherwise
        // drop the cursor at the start of the wrapped content.
        if (result.placeholder) {
            const p = result.placeholder;
            editor.selection = new Selection(startLine + p.line, p.startChar, startLine + p.line, p.endChar);
        } else {
            editor.selection = new Selection(startLine + 1, 0, startLine + 1, 0);
        }
        editor.revealRange(editor.selection);
    });

    // #279 — Negate condition: palette command mirroring the code action; operates on the cursor
    // line when it is an IF / ELSIF / LOOP WHILE / LOOP UNTIL.
    const negateCondition = commands.registerCommand('clarion.negateCondition', async () => {
        const editor = window.activeTextEditor;
        if (!editor) {
            return;
        }
        const lineNumber = editor.selection.active.line;
        const span = extractCondition(editor.document.lineAt(lineNumber).text);
        if (!span) {
            return;
        }
        const negated = negateExpression(span.condition);
        await editor.edit(eb => eb.replace(new Range(lineNumber, span.start, lineNumber, span.end), negated));
    });

    // #278 — Flip IF/ELSE: palette command mirroring the code action; negates the condition and
    // swaps the branches when the cursor sits on a block-form IF … ELSE … END.
    const flipIfElseCmd = commands.registerCommand('clarion.flipIfElse', async () => {
        const editor = window.activeTextEditor;
        if (!editor) {
            return;
        }
        const doc = editor.document;
        const lines: string[] = [];
        for (let i = 0; i < doc.lineCount; i++) {
            lines.push(doc.lineAt(i).text);
        }
        const result = flipIfElse(lines, editor.selection.active.line);
        if (!result) {
            return;
        }
        const eol = doc.eol === EndOfLine.CRLF ? '\r\n' : '\n';
        const replaceRange = new Range(
            result.startLine, 0, result.endLine, doc.lineAt(result.endLine).text.length
        );
        await editor.edit(eb => eb.replace(replaceRange, result.newLines.join(eol)));
    });

    // Refactor code actions (Ctrl+. / Refactor…) — no keybinding needed.
    const surroundProvider = languages.registerCodeActionsProvider(
        { language: 'clarion' },
        new SurroundWithCodeActionProvider(),
        { providedCodeActionKinds: SurroundWithCodeActionProvider.providedKinds }
    );
    const negateProvider = languages.registerCodeActionsProvider(
        { language: 'clarion' },
        new NegateConditionCodeActionProvider(),
        { providedCodeActionKinds: NegateConditionCodeActionProvider.providedKinds }
    );
    const flipProvider = languages.registerCodeActionsProvider(
        { language: 'clarion' },
        new FlipIfElseCodeActionProvider(),
        { providedCodeActionKinds: FlipIfElseCodeActionProvider.providedKinds }
    );

    return [surroundWith, negateCondition, flipIfElseCmd, surroundProvider, negateProvider, flipProvider];
}
