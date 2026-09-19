import { Token } from '../tokenizer/TokenTypes';
import { DocumentStructure } from '../DocumentStructure';
import { ScopeKind, ScopeNode } from '../scope/ScopeTypes';

/**
 * What a `?Name` field equate names - one rule for hover and Go to Definition (#614).
 *
 * - `control`: the control in a window of the enclosing procedure (`container` set), or the only
 *   declaration of that name in this file (`container` null - not this procedure's window).
 * - `candidates`: several windows in this file declare it and none is this procedure's. The same
 *   name across windows is ordinary Clarion, so picking one would be a coin toss.
 * - null: declared in another source, or nowhere. A `?Name` is never resolved by its bare text -
 *   `?LOC:X:Prompt` stripped to `Prompt` matched an unrelated EQUATE in a library include.
 */
export type FieldEquateTarget =
    | { kind: 'control'; control: Token; container: Token | null }
    | { kind: 'candidates'; controls: Array<{ control: Token; container: Token }> };

export function resolveFieldEquate(structure: DocumentStructure, name: string, line: number): FieldEquateTarget | null {
    // 1. A window declared in the enclosing procedure. The same `?Name` - `?Cancel` above all -
    //    recurs across unrelated windows, so the procedure's own window is the only certain reading.
    for (const proc of enclosingProcedures(structure, line)) {
        for (const win of structure.getContainerStructuresInProcedure(proc)) {
            const hit = structure.findControl(name, win);
            if (hit) return { kind: 'control', control: hit, container: win };
        }
    }

    // 2. A window can be declared in a class or elsewhere in the file, so absence in the
    //    procedure is not absence: a unique declaration here is offered, labelled as not this
    //    procedure's; several are listed.
    const declarations = structure.findControlDeclarations(name);
    if (declarations.length === 1) return { kind: 'control', control: declarations[0].control, container: null };
    if (declarations.length > 1) return { kind: 'candidates', controls: declarations };
    return null;
}

/**
 * Procedure/method tokens whose windows a `?Name` on `line` could refer to, innermost first.
 *
 * The scope chain matters because of the ABC shape: a generated procedure holds its WINDOW in
 * local data and its event handling in the methods of a locally declared WindowManager subclass.
 * A `?Name` inside one of those methods is outside the method's own line range, so the method
 * alone never resolves it - ScopeResolver links the method to the procedure whose local data
 * declared its CLASS, and that is the procedure holding the window.
 */
export function enclosingProcedures(structure: DocumentStructure, line: number): Token[] {
    const out: Token[] = [];
    const seen = new Set<Token>();
    const push = (t: Token | null | undefined) => {
        if (t && !seen.has(t)) { seen.add(t); out.push(t); }
    };

    let node: ScopeNode | null;
    try {
        node = structure.getScopeResolver().resolveScopeAt(line);
    } catch {
        return out;
    }
    for (let n: ScopeNode | null = node; n; n = n.parent) {
        if (n.kind === ScopeKind.Procedure || n.kind === ScopeKind.Method) {
            push(n.token);
        }
        push(n.declaringProcedure?.token);
    }
    return out;
}
