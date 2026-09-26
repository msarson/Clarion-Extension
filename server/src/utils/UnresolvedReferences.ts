/**
 * #687 (experimental) — the file references in the graph's files that do not resolve. The
 * FileRelationshipGraph drops an unresolved INCLUDE / MEMBER / MODULE target silently (and its disk
 * cache stores only the edges that did resolve), so the report rescans the files on demand with the
 * same resolver. Text-based, like the graph's cold scan. vscode-free for tests.
 *
 * Only an INCLUDE that does not resolve is "missing". The Language Reference says of MODULE, in a
 * MAP and as a CLASS attribute alike: "If the sourcefile is an external library, this string may
 * contain any unique identifier" - so a MODULE name with no file behind it, even one ending .clw,
 * may be a library's label. Those are informational, with the LINK and DLL attributes found as
 * evidence. MEMBER names the PROGRAM source file; what a missing one does is not documented, so it
 * is its own category.
 */
export interface FileReference {
    kind: 'INCLUDE' | 'MODULE' | 'MEMBER';
    target: string;
    /** 0-based line of the reference itself. */
    line: number;
    /** Inside an OMIT or COMPILE block: compiled only under some condition, if at all. */
    conditional: boolean;
    /** MODULE as a CLASS attribute (the class's implementation), not a MODULE structure in a MAP. */
    classModule: boolean;
    /** MODULE: the class's LINK attribute, naming what is linked in. */
    link?: string;
    /** MODULE: a DLL attribute on the class, or on a prototype in the MAP's MODULE structure. */
    dll: boolean;
}

export interface UnresolvedEntry extends FileReference {
    file: string;
    /**
     * missing: an INCLUDE whose file cannot be found. member: a MEMBER whose PROGRAM file cannot be
     * found. module: a MODULE name with no file behind it - possibly an external library's label.
     * conditional: any of these inside an OMIT or COMPILE block.
     */
    category: 'missing' | 'member' | 'module' | 'conditional';
}

const INCLUDE_RE = /\bINCLUDE\s*\(\s*'([^']+)'/ig;
const MODULE_RE = /\bMODULE\s*\(\s*'([^']+)'/ig;
const MEMBER_RE = /^\s*MEMBER\s*\(\s*'([^']+)'/i;
const CLASS_RE = /\bCLASS\b/i;
const LINK_RE = /\bLINK\s*\(\s*'([^']+)'/i;
const DLL_RE = /,\s*DLL\b/i;
const CONDITIONAL_RE = /\b(?:OMIT|COMPILE)\s*\(\s*'([^']+)'/i;
const STRUCTURE_END_RE = /^\s*(?:END\b|\.\s*$)/i;
/** MODULE('x.dll') and the like name a binary, not a source module (#484). */
const BINARY_RE = /\.(dll|lib|exe|obj|res)$/i;

/** The line without its `!` comment; a `!` inside a string literal is kept. */
function withoutComment(line: string): string {
    let inString = false;
    for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (c === "'") inString = !inString;
        else if (c === '!' && !inString) return line.slice(0, i);
    }
    return line;
}

interface CodeLine { line: number; code: string; conditional: boolean; }

/** A statement: its physical lines, joined across `|` continuations. */
interface Statement { parts: CodeLine[]; text: string; }

/** Code lines without comments, blank lines, OMIT/COMPILE markers and terminator lines. */
function codeLines(content: string): CodeLine[] {
    const out: CodeLine[] = [];
    const lines = content.split(/\r?\n/);
    let terminator: string | undefined;
    for (let line = 0; line < lines.length; line++) {
        const raw = lines[line];
        if (terminator !== undefined && raw.includes(terminator)) {
            terminator = undefined; // the terminator line ends the block
            continue;
        }
        const code = withoutComment(raw);
        if (code.trim() === '') continue;
        if (terminator === undefined) {
            const block = CONDITIONAL_RE.exec(code);
            if (block) {
                terminator = block[1];
                continue;
            }
        }
        out.push({ line, code, conditional: terminator !== undefined });
    }
    return out;
}

function statements(lines: CodeLine[]): Statement[] {
    const out: Statement[] = [];
    let parts: CodeLine[] = [];
    for (const l of lines) {
        parts.push(l);
        if (!/\|\s*$/.test(l.code)) {
            out.push({ parts, text: parts.map(p => p.code.replace(/\|\s*$/, '')).join(' ') });
            parts = [];
        }
    }
    if (parts.length) out.push({ parts, text: parts.map(p => p.code.replace(/\|\s*$/, '')).join(' ') });
    return out;
}

/** Whether a prototype in the MODULE structure opened by statement `index` carries DLL. */
function moduleStructureHasDll(all: Statement[], index: number): boolean {
    for (let i = index + 1; i < all.length; i++) {
        if (STRUCTURE_END_RE.test(all[i].text)) return false;
        if (DLL_RE.test(all[i].text)) return true;
    }
    return false;
}

export function scanReferences(content: string): FileReference[] {
    const refs: FileReference[] = [];
    const all = statements(codeLines(content));
    all.forEach((statement, index) => {
        const conditional = statement.parts[0].conditional;
        if (index === 0) {
            const member = MEMBER_RE.exec(statement.text);
            if (member) {
                refs.push({ kind: 'MEMBER', target: member[1], line: statement.parts[0].line, conditional, classModule: false, dll: false });
                return;
            }
        }
        const classModule = CLASS_RE.test(statement.text);
        for (const part of statement.parts) {
            for (const m of part.code.matchAll(INCLUDE_RE)) {
                refs.push({ kind: 'INCLUDE', target: m[1], line: part.line, conditional, classModule: false, dll: false });
            }
            for (const m of part.code.matchAll(MODULE_RE)) {
                refs.push({
                    kind: 'MODULE', target: m[1], line: part.line, conditional, classModule,
                    link: classModule ? LINK_RE.exec(statement.text)?.[1] : undefined,
                    dll: classModule ? DLL_RE.test(statement.text) : moduleStructureHasDll(all, index),
                });
            }
        }
    });
    return refs;
}

function categoryOf(ref: FileReference): UnresolvedEntry['category'] {
    if (ref.conditional) return 'conditional';
    if (ref.kind === 'INCLUDE') return 'missing';
    if (ref.kind === 'MEMBER') return 'member';
    return 'module';
}

/** Every reference in `files` that `resolve` cannot find, in file order. */
export function unresolvedReferences(
    files: readonly string[],
    read: (file: string) => string | null,
    resolve: (target: string, fromFile: string) => string | null,
): UnresolvedEntry[] {
    const out: UnresolvedEntry[] = [];
    for (const file of files) {
        const content = read(file);
        if (content === null) continue;
        for (const ref of scanReferences(content)) {
            if (ref.kind === 'MODULE' && BINARY_RE.test(ref.target.trim())) continue;
            if (resolve(ref.target, file)) continue;
            out.push({ ...ref, file, category: categoryOf(ref) });
        }
    }
    return out;
}
