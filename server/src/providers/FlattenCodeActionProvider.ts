import { TextDocument } from 'vscode-languageserver-textdocument';
import { CodeAction, CodeActionKind, Range, TextEdit, WorkspaceEdit } from 'vscode-languageserver/node';
import LoggerManager from '../logger';

const logger = LoggerManager.getLogger('FlattenCodeActionProvider');
logger.setLevel('error');

/**
 * Returns the 0-based index of the first `|` pipe that lies outside a Clarion
 * string literal, or -1 if no such pipe exists on the line.
 *
 * Clarion strings are single-quoted.  A doubled apostrophe `''` inside a string
 * is an escaped quote character — it does NOT end the string.
 */
export function findContinuationPipe(line: string): number {
    let inString = false;
    for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (c === "'") {
            if (inString && i + 1 < line.length && line[i + 1] === "'") {
                i++; // doubled-quote escape: skip both chars, remain inside string
            } else {
                inString = !inString;
            }
        } else if (c === '|' && !inString) {
            return i;
        }
    }
    return -1;
}

/**
 * Collapses adjacent Clarion string literals joined by `&`:
 *   `'abc' & 'def'`  →  `'abcdef'`
 * Loops until the line is stable to handle chains.
 */
function collapseStringConcatenation(line: string): string {
    let prev: string;
    do {
        prev = line;
        line = line.replace(/'\s*&\s*'/g, '');
    } while (prev !== line);
    return line;
}

/**
 * Flattens a slice of source lines by joining continuation groups.
 *
 * Each logical line is built by:
 *  1. Stripping everything from `|` to end-of-line (the continuation marker).
 *  2. Joining with the trimmed leading whitespace of the following line.
 *  3. Repeating until no `|` remains.
 *  4. Collapsing adjacent string literals produced by the join.
 *
 * Lines that are not part of a continuation group are returned unchanged.
 * Exported for unit testing.
 */
export function flattenGroup(lines: string[]): string[] {
    const result: string[] = [];
    let i = 0;
    while (i < lines.length) {
        let current = lines[i];

        while (true) {
            const pipePos = findContinuationPipe(current);
            if (pipePos < 0) break;

            const before = current.substring(0, pipePos).trimEnd();

            if (i + 1 >= lines.length) {
                // Dangling continuation at end of input — strip pipe
                current = before;
                break;
            }

            i++;
            const next = lines[i].trimStart();
            current = before.length > 0 && next.length > 0
                ? before + ' ' + next
                : before + next;
        }

        result.push(collapseStringConcatenation(current));
        i++;
    }
    return result;
}

/**
 * Finds the 0-based start and end line indices of the continuation group that
 * contains `cursorLine`.
 *
 * Walk backwards while the preceding line has a `|`, then forward while the
 * current line has a `|`.
 * Exported for unit testing.
 */
export function findGroupRange(
    lines: string[],
    cursorLine: number
): { start: number; end: number } {
    let start = cursorLine;
    while (start > 0 && findContinuationPipe(lines[start - 1]) >= 0) {
        start--;
    }
    let end = start;
    while (end < lines.length - 1 && findContinuationPipe(lines[end]) >= 0) {
        end++;
    }
    return { start, end };
}

/**
 * Provides a "Flatten continuation lines" Code Action when the cursor (or
 * selection) is on a Clarion line that is part of a `|` continuation group.
 *
 * - **Selection active** → flatten only the selected lines.
 * - **No selection** → find the full continuation group around the cursor and
 *   flatten it.
 *
 * Closes #70
 */
export class FlattenCodeActionProvider {

    provideCodeActions(document: TextDocument, range: Range): CodeAction[] {
        const text = document.getText();
        const lines = text.split(/\r?\n/);
        const cursorLine = range.start.line;

        if (cursorLine >= lines.length) return [];

        const hasSelection =
            range.start.line !== range.end.line ||
            range.start.character !== range.end.character;

        let startLine: number;
        let endLine: number;

        if (hasSelection) {
            startLine = range.start.line;
            endLine = Math.min(range.end.line, lines.length - 1);
            const selectedLines = lines.slice(startLine, endLine + 1);
            // Offer action only if selection contains at least one continuation
            const hasContinuation = selectedLines.some(l => findContinuationPipe(l) >= 0);
            if (!hasContinuation) return [];
        } else {
            // Offer action only if cursor is in a continuation group
            const onPipe = findContinuationPipe(lines[cursorLine]) >= 0;
            const prevHasPipe = cursorLine > 0 && findContinuationPipe(lines[cursorLine - 1]) >= 0;
            if (!onPipe && !prevHasPipe) return [];

            const group = findGroupRange(lines, cursorLine);
            startLine = group.start;
            endLine = group.end;
        }

        const linesToFlatten = lines.slice(startLine, endLine + 1);
        const flattened = flattenGroup(linesToFlatten);
        const lineEnding = text.includes('\r\n') ? '\r\n' : '\n';
        const newText = flattened.join(lineEnding);

        const replaceRange = Range.create(startLine, 0, endLine, lines[endLine].length);

        const edit: WorkspaceEdit = {
            changes: {
                [document.uri]: [TextEdit.replace(replaceRange, newText)],
            },
        };

        logger.info(`💡 Offering flatten action for lines ${startLine}–${endLine} in ${document.uri}`);

        return [{
            title: 'Flatten continuation lines',
            kind: CodeActionKind.RefactorRewrite,
            edit,
        }];
    }
}
