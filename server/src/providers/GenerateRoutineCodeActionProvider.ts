import {
    TextDocument, Range, Position, CodeAction, CodeActionKind, TextEdit, WorkspaceEdit
} from 'vscode-languageserver/node';
import { TokenCache } from '../TokenCache';
import { TokenType } from '../tokenizer/TokenTypes';
import { TokenHelper } from '../utils/TokenHelper';
import LoggerManager from '../logger';

const logger = LoggerManager.getLogger('GenerateRoutineCodeActionProvider');
logger.setLevel('error');

/**
 * A `DO <name>` statement occupying its whole line (optionally with a trailing `!` comment).
 * Group 1 = leading indent, group 2 = the routine name. Restricted to a plain label (no `::`
 * namespace) — the generator only scaffolds a simple local routine.
 */
const DO_STATEMENT = /^(\s*)DO\s+([A-Za-z_]\w*)\s*(?:!.*)?$/i;

/**
 * Build the routine skeleton text. The label sits at column 0 (Clarion convention), the body is
 * indented one level with a `! TODO` placeholder. Pure — exported for unit testing.
 */
export function buildRoutineSkeleton(name: string, bodyIndent: string, eol: string): string {
    return `${name} ROUTINE${eol}${bodyIndent}! TODO`;
}

/**
 * #280 — offers a "Create routine 'X'" quick fix when the cursor is on a `DO X` whose target does
 * not resolve to a ROUTINE in the enclosing procedure. A ROUTINE is procedure-local (DO can only
 * call a routine in the same CODE section — see the DO docs), and routine labels legally repeat
 * across procedures (#211/#264), so resolution is scoped to the enclosing procedure and the new
 * routine is placed at the end of that procedure's span (keeping it procedure-local).
 *
 * Lightweight sibling of #271: a routine has no parameters and no return type, so there is nothing
 * to infer — just scaffold a labelled skeleton. The action carries the insertion edit plus a
 * command that drops the cursor into the new body.
 */
export class GenerateRoutineCodeActionProvider {

    provideCodeActions(document: TextDocument, range: Range): CodeAction[] {
        const text = document.getText();
        const lines = text.split(/\r?\n/);
        const cursorLine = range.start.line;
        if (cursorLine < 0 || cursorLine >= lines.length) return [];

        const m = DO_STATEMENT.exec(lines[cursorLine]);
        if (!m) return [];
        const doIndent = m[1];
        const name = m[2];

        const structure = TokenCache.getInstance().getStructure(document);

        // Resolve the enclosing PROCEDURE. A DO inside a routine body resolves the innermost scope
        // to that ROUTINE — step up to its parent procedure so a valid sibling routine still counts
        // as resolved (otherwise we'd offer to create one that already exists).
        const scope = TokenHelper.getInnermostScopeAtLine(structure, cursorLine);
        if (!scope) return []; // program/module scope — program-level routines are deferred
        const proc = scope.subType === TokenType.Routine
            ? TokenHelper.getParentScopeOfRoutine(structure, scope)
            : scope;
        if (!proc || !TokenHelper.isProcedureOrFunction(proc)) return [];

        // Already defined in THIS procedure? Then nothing to create.
        const resolved = structure.findRoutines(name).some(rt => {
            const parent = TokenHelper.getParentScopeOfRoutine(structure, rt);
            return parent?.line === proc.line &&
                   parent?.value.toUpperCase() === proc.value.toUpperCase();
        });
        if (resolved) return [];

        // Insertion point: after the last non-blank line of the procedure's span (finishesAt runs to
        // the end of the procedure, past its existing routines). Trimming trailing blanks keeps the
        // new routine snug against the previous content rather than after a run of empty lines.
        const procEnd = proc.finishesAt ?? (lines.length - 1);
        let anchor = Math.min(procEnd, lines.length - 1);
        while (anchor > proc.line && lines[anchor].trim() === '') anchor--;

        const eol = text.includes('\r\n') ? '\r\n' : '\n';
        const bodyIndent = doIndent.includes('\t') ? '\t' : '  ';
        const skeleton = buildRoutineSkeleton(name, bodyIndent, eol);
        const insertText = `${eol}${eol}${skeleton}`;

        const edit: WorkspaceEdit = {
            changes: {
                [document.uri]: [
                    TextEdit.insert(Position.create(anchor, lines[anchor].length), insertText)
                ]
            }
        };

        // After the edit, the body line is anchor + 3 (blank, ROUTINE header, body). Drop the cursor
        // at the end of the `! TODO` line so the user can start typing the routine.
        const bodyLine = anchor + 3;
        const bodyChar = bodyIndent.length + '! TODO'.length;

        logger.info(`💡 Offering create-routine '${name}' in ${proc.value} → insert after line ${anchor}`);

        return [{
            title: `Create routine '${name}'`,
            kind: CodeActionKind.QuickFix,
            isPreferred: true,
            edit,
            command: {
                title: 'Position cursor in new routine',
                command: 'clarion.placeCursor',
                arguments: [document.uri, bodyLine, bodyChar]
            }
        }];
    }
}
