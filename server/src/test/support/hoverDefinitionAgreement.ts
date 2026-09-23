/**
 * #609 phase 1 - does hover point where F12 goes?
 *
 * Hover and Go to Definition resolve the same word through separate pipelines (hover's
 * StructureFieldResolver/router, DefinitionProvider's own branches). This classifies one
 * position's pair of answers so drift between them shows up as data. Shared by the fixture
 * test (HoverDefinitionAgreement.test.ts) and the real-solution sweep
 * (scripts/health/hover-definition-agreement.js, which loads the compiled copy), so both
 * judge a pair by the same rule.
 */

export interface SourceLocation {
    /** Normalised file key: decoded, forward slashes, lower case, no scheme. */
    file: string;
    /** 0-based line. */
    line: number;
}

/**
 * - `agree`       F12's target is one of the locations the hover links to
 * - `mismatch`    both answer, but F12 goes somewhere the hover does not link
 * - `f12-only`    F12 resolves, hover shows nothing
 * - `hover-only`  hover links a location, F12 resolves nothing
 * - `hover-no-link` both answer, but the hover names no location to compare
 * - `no-location` neither gives a location (a keyword card, or nothing at all)
 */
export type AgreementVerdict = 'agree' | 'mismatch' | 'f12-only' | 'hover-only' | 'hover-no-link' | 'no-location';

/** Verdicts that mean the two features disagree about the same word. */
export const DISAGREEMENTS: readonly AgreementVerdict[] = ['mismatch', 'f12-only', 'hover-only'];

export function normaliseFile(uriOrPath: string): string {
    let s = uriOrPath.replace(/^file:\/*/i, '');
    try { s = decodeURIComponent(s); } catch { /* keep as is */ }
    return s.replace(/\\/g, '/').replace(/^\/+/, '').toLowerCase();
}

function hoverMarkdown(hover: any): string {
    if (!hover || !hover.contents) return '';
    const c = hover.contents;
    if (typeof c === 'string') return c;
    if (Array.isArray(c)) return c.map(x => (typeof x === 'string' ? x : x.value ?? '')).join('\n');
    return c.value ?? '';
}

/** Every location a hover links to, in order: `[name:line](file:///...#L<1-based>)`. */
export function hoverLocations(hover: any): SourceLocation[] {
    const out: SourceLocation[] = [];
    const re = /\]\((file:[^)#\s]+)#L(\d+)\)/g;
    const md = hoverMarkdown(hover);
    let m: RegExpExecArray | null;
    while ((m = re.exec(md)) !== null) out.push({ file: normaliseFile(m[1]), line: Number(m[2]) - 1 });
    return out;
}

/** Every location a definition result names (Location, Location[] or LocationLink[]). */
export function definitionLocations(def: any): SourceLocation[] {
    const arr = Array.isArray(def) ? def : (def ? [def] : []);
    return arr
        .map(l => ({ uri: l.uri ?? l.targetUri, range: l.range ?? l.targetSelectionRange ?? l.targetRange }))
        .filter(l => l.uri && l.range)
        .map(l => ({ file: normaliseFile(l.uri), line: l.range.start.line }));
}

export function classifyAgreement(hover: any, definition: any): AgreementVerdict {
    const defs = definitionLocations(definition);
    const links = hoverLocations(hover);
    const hoverShown = hoverMarkdown(hover).trim().length > 0;

    if (defs.length === 0) return links.length > 0 ? 'hover-only' : 'no-location';
    if (!hoverShown) return 'f12-only';
    if (links.length === 0) return 'hover-no-link';
    const same = (a: SourceLocation, b: SourceLocation) => a.file === b.file && a.line === b.line;
    return defs.some(d => links.some(l => same(d, l))) ? 'agree' : 'mismatch';
}

// ─── #636 - does Go to Implementation agree with Go to Definition? ─────────────────────────
//
// Ctrl+F12 answers the same question as F12 ("what does this name refer to?") through a third
// pipeline, and it drifted from the other two unseen: #627 (SELF.Method() picked another
// overload) and #635 (a local passed as an argument went to a same-named procedure's body).
// Rather than a second opinion on what the word is, this takes F12's answer as the reference
// and checks that Ctrl+F12 is consistent with it:
//
//   F12 lands on a procedure, method or routine  ->  Ctrl+F12 goes to that one's body
//   F12 lands on anything else                   ->  Ctrl+F12 goes nowhere else
//
// "That one's body" is judged from the source text: a line that opens a procedure body, with
// the same name (last dotted segment) and the same parameter types as F12's target.

/**
 * - `agree`          consistent with F12, per the two rules above
 * - `declaration`    Ctrl+F12 returned F12's own non-callable target (the deliberate fallback
 *                    for a dotted data member); reported, not a defect
 * - `no-body`        F12 names a callable and Ctrl+F12 found no body (nothing, or the
 *                    prototype itself). A real gap in a fixture; on real code the body may
 *                    simply not be in source (a DLL, a compiled library), so a sweep reports it
 *                    without calling it a disagreement
 * - `wrong-target`   F12 names a callable and Ctrl+F12 goes to something that is not its body
 * - `impl-on-data`   F12 names something that is not callable, and Ctrl+F12 goes elsewhere
 * - `impl-only`      F12 resolves nothing, and Ctrl+F12 goes somewhere
 * - `no-location`    neither resolves
 */
export type ImplementationVerdict =
    'agree' | 'declaration' | 'no-body' | 'wrong-target' | 'impl-on-data' | 'impl-only' | 'no-location';

/** Verdicts that mean Ctrl+F12 contradicts F12 about the same word. */
export const IMPLEMENTATION_DISAGREEMENTS: readonly ImplementationVerdict[] = ['wrong-target', 'impl-on-data', 'impl-only'];

/** Reads a file's lines by its normalised key (see normaliseFile); undefined when unavailable. */
export type LineReader = (file: string) => string[] | undefined;

/** A procedure, method or routine a line declares or opens. */
export interface CallableLine {
    /** Upper-cased last dotted segment of the label: `Thing.Work` -> `WORK`. */
    name: string;
    /** Upper-cased parameter types, names and defaults dropped; empty for a ROUTINE. */
    params: string[];
    isRoutine: boolean;
    /**
     * Upper-cased class (or interface) the callable belongs to: the segment before the name in
     * a dotted body label (`Thing.Work`, `Thing.IFace.Work`), or, for a member declared inside
     * a CLASS or INTERFACE, that structure's label (set by callableAt). Undefined for a MAP
     * procedure.
     */
    owner?: string;
}

// A MAP prototype may be indented; a CLASS member or a body label is at column 0.
const LABEL = /^\s*([A-Za-z_][\w:.]*)/;

/** The callable a line declares, whether a prototype or a body; null for anything else. */
export function callableOnLine(text: string | undefined): CallableLine | null {
    if (!text) return null;
    const label = LABEL.exec(text);
    if (!label) return null;
    const segments = label[1].split('.');
    const name = segments[segments.length - 1].toUpperCase();
    const owner = segments.length > 1 ? segments[segments.length - 2].toUpperCase() : undefined;
    const rest = text.substring(label[0].length);
    if (/^\s+ROUTINE\b/i.test(rest)) return { name, params: [], isRoutine: true, owner };
    // `Name PROCEDURE(...)` / `Name FUNCTION(...)`, or the MAP shorthand `Name(...)`.
    const m = /^\s+(?:PROCEDURE|FUNCTION)\b\s*(\()?/i.exec(rest) ?? /^\s*(\()/.exec(rest);
    if (!m) return null;
    return { name, params: m[1] ? parameterTypes(rest.substring(m[0].length - 1)) : [], isRoutine: false, owner };
}

/** `(LONG n, <*STRING s>, BYTE b=0)` -> `['LONG', '*STRING', 'BYTE']`; from the opening paren. */
function parameterTypes(fromParen: string): string[] {
    let depth = 0, end = -1;
    for (let i = 0; i < fromParen.length; i++) {
        if (fromParen[i] === '(') depth++;
        else if (fromParen[i] === ')' && --depth === 0) { end = i; break; }
    }
    const inner = fromParen.substring(1, end < 0 ? fromParen.length : end).trim();
    if (!inner) return [];
    return inner.split(',').map(p => {
        const words = p.replace(/=.*$/, '').replace(/[<>]/g, ' ').trim().split(/\s+/).filter(Boolean);
        // A declaration may name its parameter or not; a body always does. Keep the type only.
        return (words.length > 1 ? words.slice(0, -1) : words).join(' ').toUpperCase();
    });
}

// Structures whose END a prototype sits inside of, and local data may open and close.
// The keyword is followed by its attributes, a comment or nothing: `Toolbar  ToolbarClass` is a
// variable called Toolbar, not a TOOLBAR structure.
const OPENS = /^(?:[A-Za-z_][\w:]*\s+)?(?:MAP|MODULE|CLASS|INTERFACE|GROUP|QUEUE|RECORD|FILE|VIEW|WINDOW|REPORT|APPLICATION|SHEET|TAB|OPTION|MENU|MENUBAR|TOOLBAR|ITEMIZE|OLE|JOIN|DETAIL|HEADER|FOOTER|FORM|BREAK)(?=\s*(?:[,(!]|$))/i;
const CLOSES = /^\s*(?:END|\.)\s*(?:!.*)?$/i;
const CODE_LINE = /^\s+CODE\s*(?:!.*)?$/i;

/**
 * True when the callable on `line` opens a body rather than declaring a prototype: its CODE
 * comes before any END that closes a structure it sits inside (a MAP, MODULE or CLASS), and
 * before the next procedure label. A ROUTINE is always a body.
 */
export function opensBody(lines: string[], line: number): boolean {
    const own = callableOnLine(lines[line]);
    if (!own) return false;
    if (own.isRoutine) return true;
    let depth = 0;
    for (let i = line + 1; i < lines.length; i++) {
        const text = lines[i];
        if (CODE_LINE.test(text)) return depth === 0;
        if (CLOSES.test(text)) { if (--depth < 0) return false; continue; }
        // The next procedure's label is at column 0; an indented `omit('***',...)` is a statement.
        if (depth === 0 && /^[A-Za-z_]/.test(text) && callableOnLine(text)) return false;
        if (OPENS.test(text.trimStart())) depth++;
    }
    return false;
}

/**
 * Same parameter list, ignoring `*` and `&`: a class-typed parameter is passed by reference
 * either way, and the vendor's own sources write the same one both ways (`ProcessClass PC` in
 * the prototype, `*ProcessClass PC` in the body).
 */
function sameParameters(a: string[], b: string[]): boolean {
    const bare = (p: string[]) => p.map(t => t.replace(/[*&]\s*/g, '')).join(',');
    return bare(a) === bare(b);
}

/**
 * callableOnLine, plus the owning class of a member declared inside a CLASS or INTERFACE: the
 * label of the structure still open at that line.
 */
export function callableAt(lines: string[], line: number): CallableLine | null {
    const c = callableOnLine(lines[line]);
    if (!c || c.owner) return c;
    let depth = 0;
    for (let i = line - 1; i >= 0; i--) {
        const text = lines[i];
        if (CLOSES.test(text)) { depth++; continue; }
        if (!OPENS.test(text.trimStart())) continue;
        if (depth > 0) { depth--; continue; }
        const own = /^([A-Za-z_][\w:]*)\s+(?:CLASS|INTERFACE)\b/i.exec(text);
        return own ? { ...c, owner: own[1].toUpperCase() } : c;
    }
    return c;
}

export function classifyImplementation(
    word: string, definition: any, implementation: any, readLines: LineReader
): ImplementationVerdict {
    const defs = definitionLocations(definition);
    const impls = definitionLocations(implementation);
    if (defs.length === 0) return impls.length > 0 ? 'impl-only' : 'no-location';

    const same = (a: SourceLocation, b: SourceLocation) => a.file === b.file && a.line === b.line;
    // Only a callable of the word's own name: F12 on a parameter lands on its PROCEDURE line.
    const own = word.split('.').pop()!.toUpperCase();
    const callables = defs.map(d => { const lines = readLines(d.file); return lines ? callableAt(lines, d.line) : null; })
        .filter((c): c is CallableLine => !!c && c.name === own);

    if (callables.length === 0) {
        if (impls.length === 0) return 'agree';
        return impls.every(i => defs.some(d => same(d, i))) ? 'declaration' : 'impl-on-data';
    }

    const isBodyOf = (i: SourceLocation) => {
        const lines = readLines(i.file);
        const c = lines && callableOnLine(lines[i.line]);
        // Same name, parameters and class: `ThisWindow.Run()` declared DERIVED in the local class
        // must not open the parent's `WindowManager.Run` body. A MAP procedure has no class.
        return !!c && opensBody(lines!, i.line) && callables.some(d =>
            d.name === c.name && d.isRoutine === c.isRoutine && sameParameters(d.params, c.params) &&
            (!d.owner || d.owner === c.owner));
    };
    if (impls.length === 0) return 'no-body';
    if (impls.every(isBodyOf)) return 'agree';
    // The prototype itself: the provider's fallback when it found no body.
    if (impls.every(i => defs.some(d => same(d, i)))) return 'no-body';
    return 'wrong-target';
}
