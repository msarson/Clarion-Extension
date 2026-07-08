import {
    commands, window, Range, Selection, EndOfLine, Disposable, ExtensionContext, QuickPickItem
} from 'vscode';
import { buildSurround, SURROUND_STRUCTURES } from '../refactor/surroundWith';
import LoggerManager from '../utils/LoggerManager';

const logger = LoggerManager.getLogger("RefactorCommands");
logger.setLevel("error");

interface StructurePick extends QuickPickItem { id: string; }

/**
 * #277 — "Surround With / Embedding": wrap the selected line(s) (or the current line) in a Clarion
 * structure chosen from a quick pick, indenting the content and selecting the condition placeholder.
 */
export function registerRefactorCommands(context: ExtensionContext): Disposable[] {
    const surroundWith = commands.registerCommand('clarion.surroundWith', async () => {
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

        const pick = await window.showQuickPick<StructurePick>(
            SURROUND_STRUCTURES.map(s => ({ label: s.label, id: s.id })),
            { placeHolder: 'Surround with…', matchOnDescription: true }
        );
        if (!pick) {
            return;
        }

        const baseIndent = /^\s*/.exec(doc.lineAt(startLine).text)?.[0] ?? '';
        const tabSize = typeof editor.options.tabSize === 'number' ? editor.options.tabSize : 2;
        const indentUnit = editor.options.insertSpaces === false ? '\t' : ' '.repeat(tabSize);

        let result;
        try {
            result = buildSurround(selectedLines, pick.id, { baseIndent, indentUnit });
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

    return [surroundWith];
}
