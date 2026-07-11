/**
 * #277 — "Surround With / Embedding" (CodeRush-style): wrap selected Clarion statement lines in a
 * structure (IF / LOOP / CASE / BEGIN …), indenting the wrapped content and, where relevant,
 * exposing a placeholder (condition / expression) for the caller to select.
 *
 * This module is intentionally free of the `vscode` API so the wrapping + indentation + placeholder
 * geometry can be unit-tested directly; the command layer handles editor I/O and applies the edit.
 */

export interface SurroundStructure {
    /** Stable id passed to {@link buildSurround}. */
    id: string;
    /** Human-readable label for the picker. */
    label: string;
}

/**
 * The structures offered by the "Surround With" picker, in menu order.
 *
 * Deliberately only the general control structures. `BEGIN` is excluded: it is a compiler directive
 * that groups statements into one structure, meaningful essentially only inside `EXECUTE` (whose
 * cases must each be a single statement) — a standalone `BEGIN…END` surround around arbitrary code
 * would be legal but pointless. `EXECUTE` itself isn't a surround target either (its body is a list
 * of single statements selected by value, not a wrapped block).
 */
export const SURROUND_STRUCTURES: SurroundStructure[] = [
    { id: 'IF',         label: 'IF … END' },
    { id: 'LOOP',       label: 'LOOP … END' },
    { id: 'LOOP_WHILE', label: 'LOOP WHILE … END' },
    { id: 'LOOP_UNTIL', label: 'LOOP UNTIL … END' },
    { id: 'CASE',       label: 'CASE … OF … END' },
];

export interface SurroundResult {
    /** The full replacement lines (column-0 based, already indented). */
    lines: string[];
    /** When present, the range (within `lines`) of the placeholder token to select after applying. */
    placeholder?: { line: number; startChar: number; endChar: number };
}

/**
 * Build the replacement for wrapping `selectedLines` in the given structure.
 *
 * @param selectedLines The selected lines' text (no line terminators), each still carrying its own
 *   leading whitespace. The wrapper keywords are placed at `baseIndent` and every content line is
 *   shifted one (or, for CASE, two) `indentUnit`(s) deeper, preserving relative indentation. Blank
 *   lines are left empty.
 * @param structureId One of {@link SURROUND_STRUCTURES}' ids.
 * @param opts `baseIndent` = the leading whitespace of the first selected line (where the wrapper
 *   keywords sit); `indentUnit` = one indent level (spaces or a tab).
 */
export function buildSurround(
    selectedLines: string[],
    structureId: string,
    opts: { baseIndent: string; indentUnit: string }
): SurroundResult {
    const { baseIndent, indentUnit } = opts;
    const lines: string[] = [];
    let placeholder: SurroundResult['placeholder'];

    const header = (text: string, placeholderToken?: string): void => {
        const full = baseIndent + text;
        if (placeholderToken) {
            const idx = full.indexOf(placeholderToken);
            if (idx >= 0) {
                placeholder = { line: lines.length, startChar: idx, endChar: idx + placeholderToken.length };
            }
        }
        lines.push(full);
    };
    const content = (levels: number): void => {
        const pad = indentUnit.repeat(levels);
        for (const l of selectedLines) {
            lines.push(l.length === 0 ? '' : pad + l);
        }
    };
    const end = (): void => { lines.push(baseIndent + 'END'); };

    switch (structureId) {
        case 'IF':
            header('IF condition', 'condition'); content(1); end();
            break;
        case 'LOOP':
            header('LOOP'); content(1); end();
            break;
        case 'LOOP_WHILE':
            header('LOOP WHILE condition', 'condition'); content(1); end();
            break;
        case 'LOOP_UNTIL':
            header('LOOP UNTIL condition', 'condition'); content(1); end();
            break;
        case 'CASE':
            // Clarion/ABC convention: OF aligns with CASE, statements one level in from OF.
            header('CASE expression', 'expression');
            lines.push(baseIndent + 'OF value');
            content(1);
            end();
            break;
        default:
            throw new Error(`Unknown surround structure: ${structureId}`);
    }

    return { lines, placeholder };
}
