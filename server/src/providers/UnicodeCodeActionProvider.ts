import { TextDocument } from 'vscode-languageserver-textdocument';
import { CodeAction, CodeActionKind, CodeActionContext, Range, TextEdit, WorkspaceEdit } from 'vscode-languageserver/node';
import LoggerManager from '../logger';

const logger = LoggerManager.getLogger("UnicodeCodeActionProvider");
logger.setLevel("error");

/** Common Unicode → ASCII replacements for accidental insertions. */
const REPLACEMENTS: ReadonlyMap<string, string> = new Map([
    ['\u2018', "'"],   // ' LEFT SINGLE QUOTATION MARK
    ['\u2019', "'"],   // ' RIGHT SINGLE QUOTATION MARK
    ['\u201C', '"'],   // " LEFT DOUBLE QUOTATION MARK
    ['\u201D', '"'],   // " RIGHT DOUBLE QUOTATION MARK
    ['\u2014', '-'],   // — EM DASH
    ['\u2013', '-'],   // – EN DASH
    ['\u2026', '...'], // … HORIZONTAL ELLIPSIS
    ['\u00AB', '"'],   // « LEFT-POINTING DOUBLE ANGLE QUOTATION MARK
    ['\u00BB', '"'],   // » RIGHT-POINTING DOUBLE ANGLE QUOTATION MARK
]);

export class UnicodeCodeActionProvider {
    public provideCodeActions(
        document: TextDocument,
        _range: Range,
        context: CodeActionContext
    ): CodeAction[] {
        const invalidEncodingDiags = context.diagnostics.filter(d => d.code === 'invalid-encoding');
        if (invalidEncodingDiags.length === 0) return [];

        const actions: CodeAction[] = [];

        for (const diag of invalidEncodingDiags) {
            const char = document.getText(diag.range);
            const replacement = REPLACEMENTS.get(char);

            if (replacement) {
                const edit: WorkspaceEdit = {
                    changes: { [document.uri]: [TextEdit.replace(diag.range, replacement)] }
                };
                actions.push({
                    title: `Replace '${char}' with '${replacement}'`,
                    kind: CodeActionKind.QuickFix,
                    diagnostics: [diag],
                    edit,
                    isPreferred: true
                });
            }

            // Always offer "Delete character" as a fallback
            const deleteEdit: WorkspaceEdit = {
                changes: { [document.uri]: [TextEdit.del(diag.range)] }
            };
            actions.push({
                title: `Delete invalid character '${char}'`,
                kind: CodeActionKind.QuickFix,
                diagnostics: [diag],
                edit: deleteEdit
            });
        }

        // "Fix all" — scan the whole document for every invalid char, not just the current position
        const allEdits: TextEdit[] = [];
        const text = document.getText();
        for (let i = 0; i < text.length; i++) {
            const code = text.charCodeAt(i);
            if (code > 0xFF) {
                const pos = document.positionAt(i);
                const range: Range = { start: pos, end: { line: pos.line, character: pos.character + 1 } };
                const char = text[i];
                const replacement = REPLACEMENTS.get(char);
                allEdits.push(replacement ? TextEdit.replace(range, replacement) : TextEdit.del(range));
            }
        }
        if (allEdits.length > 1) {
            actions.push({
                title: `Fix all ${allEdits.length} invalid characters in file`,
                kind: CodeActionKind.QuickFix,
                edit: { changes: { [document.uri]: allEdits } }
            });
        }

        return actions;
    }
}
