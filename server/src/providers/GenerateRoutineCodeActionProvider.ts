import {
    TextDocument, Range, Position, CodeAction, CodeActionKind, TextEdit, WorkspaceEdit
} from 'vscode-languageserver/node';
import { TokenCache } from '../TokenCache';
import { Token } from '../tokenizer/TokenTypes';
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
 * not resolve to a ROUTINE in scope. A ROUTINE is procedure-local (DO can only call a routine in the
 * same CODE section — see the DO docs), and routine labels legally repeat across procedures
 * (#211/#264), so resolution is scoped to the enclosing procedure.
 *
 * The subtlety this handles (the ABC/NetTalk shape): a **local derived method** — one whose CLASS is
 * declared in a procedure's local data — shares that procedure's scope (Rule 4), so a routine at the
 * enclosing procedure's level is visible to ALL of the class's methods. Therefore, for a `DO` inside
 * such a method we:
 *   - treat the target as already defined if the routine exists in the method OR in the declaring
 *     procedure (otherwise we'd offer to create one that already exists and works); and
 *   - offer TWO placements — one local to the method, one at the procedure level shared by every
 *     method. For a plain procedure (or a module/global-class method) there is only one scope.
 *
 * A routine has no parameters and no return type, so — unlike #271 — there is nothing to infer; just
 * scaffold a labelled skeleton, dropping the cursor into the new body.
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

        // The routine-holding scopes visible from the DO, innermost first. For a local derived method
        // this is [method, declaringProcedure]; for a plain procedure it is [proc]; a DO inside a
        // routine climbs to that routine's owning procedure/method chain. Shared with the routine
        // navigation resolver (#285) so generation and F12 agree on scope.
        const candidates = TokenHelper.getRoutineHostingScopes(structure, cursorLine);
        if (candidates.length === 0) return []; // program/module scope — deferred

        // Already defined in ANY visible scope? Then nothing to create — this is what stops a false
        // offer for a procedure-level routine `DO`ed from one of the class's methods.
        const defined = candidates.some(scope => this.routineDefinedIn(structure, name, scope));
        if (defined) return [];

        const eol = text.includes('\r\n') ? '\r\n' : '\n';
        const bodyIndent = doIndent.includes('\t') ? '\t' : '  ';
        const build = (scope: Token, title: string): CodeAction =>
            this.buildAction(document, lines, name, scope, eol, bodyIndent, title);

        // One scope → the plain action. Two (local derived method) → let the user choose the scope.
        if (candidates.length === 1) {
            return [build(candidates[0], `Create routine '${name}'`)];
        }
        const [method, proc] = candidates;
        return [
            build(method, `Create routine '${name}' (local to this method)`),
            build(proc, `Create routine '${name}' (procedure-level — shared by all methods)`),
        ];
    }

    /** True when a ROUTINE named `name` is declared directly inside the given procedure/method scope. */
    private routineDefinedIn(structure: ReturnType<TokenCache['getStructure']>, name: string, scope: Token): boolean {
        return structure.findRoutines(name).some(rt => {
            const parent = TokenHelper.getParentScopeOfRoutine(structure, rt);
            return parent?.line === scope.line &&
                   parent?.value.toUpperCase() === scope.value.toUpperCase();
        });
    }

    private buildAction(
        document: TextDocument,
        lines: string[],
        name: string,
        scope: Token,
        eol: string,
        bodyIndent: string,
        title: string
    ): CodeAction {
        // Insert after the last non-blank line of the scope's span (finishesAt runs to the end of the
        // procedure/method, past its existing routines). Trimming trailing blanks keeps the new
        // routine snug against the previous content rather than after a run of empty lines.
        const scopeEnd = scope.finishesAt ?? (lines.length - 1);
        let anchor = Math.min(scopeEnd, lines.length - 1);
        while (anchor > scope.line && lines[anchor].trim() === '') anchor--;

        const skeleton = buildRoutineSkeleton(name, bodyIndent, eol);
        const insertText = `${eol}${eol}${skeleton}`;

        const edit: WorkspaceEdit = {
            changes: {
                [document.uri]: [
                    TextEdit.insert(Position.create(anchor, lines[anchor].length), insertText)
                ]
            }
        };

        // After the edit the body line is anchor + 3 (blank, ROUTINE header, body). Drop the cursor
        // at the end of the `! TODO` line so the user can start typing the routine.
        const bodyLine = anchor + 3;
        const bodyChar = bodyIndent.length + '! TODO'.length;

        logger.info(`💡 Offering "${title}" → insert after line ${anchor} (scope ${scope.value})`);

        return {
            title,
            kind: CodeActionKind.QuickFix,
            isPreferred: true,
            edit,
            command: {
                title: 'Position cursor in new routine',
                command: 'clarion.placeCursor',
                arguments: [document.uri, bodyLine, bodyChar]
            }
        };
    }
}
