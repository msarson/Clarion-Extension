/**
 * #807 — COMPILE and OMIT blocks decided from their conditions, so the extension follows only the
 * INCLUDEs the compiler reads (a version EQUATE choosing between `LibXL.411.INT` and
 * `LibXL.520.INT`, each pulled in with ,ONCE, used to resolve to whichever came first).
 *
 * From the help (Language Reference > 2 - Program Source Code Format > Compiler Directives):
 * - `COMPILE(terminator [,expression])` keeps its lines when the expression is true, `OMIT(...)`
 *   when it is false; without an expression COMPILE keeps and OMIT drops.
 * - The block runs to the line that contains the terminator, and that line is part of it.
 * - expression: `<equate>`, or `<equate>` with `= <> > < >= <=` and an integer constant.
 * - A switch is an EQUATE, a project define (Conditional Switch) or a PRAGMA define.
 * - Blocks nest; inside a block that omits, nothing further is read until its terminator.
 *
 * Ours, for safety: a condition naming anything whose value is not known is not decided, and the
 * block is treated as compiled. The compiler reads an undefined name as 0, but the extension may
 * simply not see where a name is defined (a project switch, a file it cannot find).
 *
 * No vscode, no file system: the caller supplies switches it knows (`lookup`) and, for an INCLUDE
 * that is followed, the EQUATEs that file defines (`equatesOfInclude`), so an EQUATE from an
 * earlier INCLUDE decides a later block, as it does for the compiler.
 */
export interface ConditionalContext {
    /** A switch's value from outside the file: a project define, a program-wide PRAGMA define. */
    lookup?: (name: string) => number | undefined;
    /** The integer EQUATEs an INCLUDEd file defines, for the lines after its INCLUDE. */
    equatesOfInclude?: (file: string) => Map<string, number> | undefined;
    /**
     * For a name not known yet, which INCLUDEs could define it: only those are read. Rejecting all
     * spares reading anything for a switch only a project defines. Absent, or returning undefined:
     * read every INCLUDE so far.
     */
    includesDefining?: (name: string) => ((file: string) => boolean) | undefined;
}

export interface ConditionalScan {
    /** Every INCLUDE, in order; `active` false when it sits in a block that will not compile. */
    includes: { file: string; line: number; active: boolean }[];
    /** The integer EQUATEs the file defines in lines that compile (keys in lower case). */
    equates: Map<string, number>;
    /** Whether a line is in a block decided not to compile. */
    isInactive(line: number): boolean;
}

const NAME = '[A-Za-z_][A-Za-z0-9_:]*';
const DIRECTIVE = new RegExp(`^\\s*(?:${NAME}\\s+)?(OMIT|COMPILE)\\s*\\(\\s*'((?:[^']|'')*)'\\s*(?:,\\s*([^)]*?))?\\s*\\)`, 'i');
const CONDITION = new RegExp(`^(${NAME})\\s*(?:(=|<>|>=|<=|>|<)\\s*([+-]?\\d+))?$`);
const INCLUDE = new RegExp(`^(?:${NAME})?\\s+INCLUDE\\s*\\(\\s*'([^']+)'`, 'i');
const EQUATE = new RegExp(`^(${NAME})\\s+EQUATE\\s*\\(\\s*([+-]?\\d+)\\s*\\)`, 'i');
const PRAGMA_DEFINE = new RegExp(`\\bPRAGMA\\s*\\(\\s*'[^']*?\\bdefine\\s*\\(\\s*(${NAME})\\s*=>\\s*(\\w+)\\s*\\)`, 'i');

/** A switch value as a define writes it: an integer, or on/off. */
export function switchValue(text: string): number | undefined {
    const t = text.trim().toLowerCase();
    if (t === 'on') return 1;
    if (t === 'off') return 0;
    return /^[+-]?\d+$/.test(t) ? parseInt(t, 10) : undefined;
}

/** True or false when every name in it has a value; undefined when not decided. */
export function evaluateCondition(expression: string, value: (name: string) => number | undefined): boolean | undefined {
    const m = CONDITION.exec(expression.trim());
    if (!m) return undefined;
    const v = value(m[1]);
    if (v === undefined) return undefined;
    if (!m[2]) return v !== 0;
    const n = parseInt(m[3], 10);
    switch (m[2]) {
        case '=': return v === n;
        case '<>': return v !== n;
        case '>': return v > n;
        case '<': return v < n;
        case '>=': return v >= n;
        case '<=': return v <= n;
    }
    return undefined;
}

/** A line without its comment (a `!` outside a string). */
function code(line: string): string {
    let inString = false;
    for (let i = 0; i < line.length; i++) {
        if (line[i] === "'") inString = !inString;
        else if (line[i] === '!' && !inString) return line.slice(0, i);
    }
    return line;
}

export function scanConditionalCompile(lines: string[], context: ConditionalContext = {}): ConditionalScan {
    const equates = new Map<string, number>();
    const pragmas = new Map<string, number>();
    // INCLUDEs followed so far whose EQUATEs have not been read: read only when a condition needs a
    // name not known yet (most conditions are decided without, or name a project switch no file
    // defines). Read in order; an EQUATE the file itself defines after an INCLUDE keeps its value.
    let pending: string[] = [];
    const readPending = (only?: (file: string) => boolean) => {
        const files = only ? pending.filter(only) : pending;
        pending = only ? pending.filter(f => !only(f)) : [];
        for (const file of files) {
            for (const [k, v] of context.equatesOfInclude?.(file) ?? []) {
                const key = k.toLowerCase();
                if (!equates.has(key)) equates.set(key, v);
            }
        }
    };
    const value = (name: string): number | undefined => {
        const key = name.toLowerCase();
        const known = equates.get(key) ?? pragmas.get(key) ?? context.lookup?.(name);
        if (known !== undefined || pending.length === 0) return known;
        readPending(context.includesDefining?.(name));
        return equates.get(key);
    };
    const includes: ConditionalScan['includes'] = [];
    const inactive = new Uint8Array(lines.length);
    // Open blocks, innermost last; `omits` when decided not to compile.
    const stack: { terminator: string; omits: boolean }[] = [];
    const omitting = () => stack.length > 0 && stack[stack.length - 1].omits;

    for (let line = 0; line < lines.length; line++) {
        const text = lines[line];
        if (omitting()) {
            // Nothing is read inside an omitted block but its own terminator.
            inactive[line] = 1;
            const top = stack[stack.length - 1];
            if (text.includes(top.terminator)) stack.pop();
            const m = INCLUDE.exec(code(text));
            if (m) includes.push({ file: m[1], line, active: false });
            continue;
        }

        // A block still open closes on the line holding its terminator (not the directive's own).
        const open = stack[stack.length - 1];
        const live = code(text);
        const directive = DIRECTIVE.exec(live);
        if (directive) {
            const isCompile = directive[1].toUpperCase() === 'COMPILE';
            const terminator = directive[2].replace(/''/g, "'");
            const condition = directive[3]?.trim();
            const holds = condition ? evaluateCondition(condition, value) : true;
            // Undecided: compiled, as before. Otherwise COMPILE omits when false, OMIT when true.
            const omits = holds === undefined ? false : isCompile ? !holds : holds;
            stack.push({ terminator, omits });
            if (omits) inactive[line] = 1;
            continue;
        }
        if (open && text.includes(open.terminator)) {
            stack.pop();
            continue;
        }

        const include = INCLUDE.exec(live);
        if (include) {
            includes.push({ file: include[1], line, active: true });
            if (context.equatesOfInclude) pending.push(include[1]);
            continue;
        }
        const equate = EQUATE.exec(live);
        if (equate) {
            equates.set(equate[1].toLowerCase(), parseInt(equate[2], 10));
            continue;
        }
        const pragma = PRAGMA_DEFINE.exec(text);
        if (pragma) {
            const v = switchValue(pragma[2]);
            if (v !== undefined) pragmas.set(pragma[1].toLowerCase(), v);
        }
    }
    // What the file exports to an includer: its INCLUDEs' EQUATEs too (read now, only if asked for).
    if (context.equatesOfInclude && pending.length > 0) {
        let read = false;
        return {
            includes,
            get equates() { if (!read) { read = true; readPending(); } return equates; },
            isInactive: line => inactive[line] === 1,
        };
    }
    return { includes, equates, isInactive: line => inactive[line] === 1 };
}
