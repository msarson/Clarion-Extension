/**
 * #687 (experimental) — the file references in the graph's files that do not resolve. The
 * FileRelationshipGraph drops an unresolved INCLUDE / MEMBER / MODULE target silently (and its disk
 * cache stores only the edges that did resolve), so the report rescans the files on demand with the
 * same resolver. Text-based, like the graph's cold scan. vscode-free for tests.
 */
export interface FileReference {
    kind: 'INCLUDE' | 'MODULE' | 'MEMBER';
    target: string;
    /** 0-based. */
    line: number;
    /** Inside an OMIT or COMPILE block: compiled only under some condition, if at all. */
    conditional: boolean;
    /** MODULE as a CLASS attribute (the class's implementation file), not in a MAP. */
    classModule: boolean;
}

export interface UnresolvedEntry extends FileReference {
    file: string;
    /**
     * missing: names a file that cannot be found. library: a MODULE name with no extension, which
     * can be a .clw file, the label of an external library or a description - informational. conditional: inside an
     * OMIT or COMPILE block.
     */
    category: 'missing' | 'library' | 'conditional';
}

const INCLUDE_RE = /\bINCLUDE\s*\(\s*'([^']+)'/ig;
const MODULE_RE = /\bMODULE\s*\(\s*'([^']+)'/ig;
const MEMBER_RE = /^\s*MEMBER\s*\(\s*'([^']+)'/i;
const CLASS_RE = /\bCLASS\b/i;
const CONDITIONAL_RE = /\b(?:OMIT|COMPILE)\s*\(\s*'([^']+)'/i;
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

export function scanReferences(content: string): FileReference[] {
    const refs: FileReference[] = [];
    const lines = content.split(/\r?\n/);
    let firstStatement = true;
    let terminator: string | undefined;
    for (let line = 0; line < lines.length; line++) {
        const raw = lines[line];
        if (terminator !== undefined && raw.includes(terminator)) {
            terminator = undefined; // the terminator line ends the block
            continue;
        }
        const code = withoutComment(raw);
        if (code.trim() === '') continue;
        const conditional = terminator !== undefined;

        if (firstStatement) {
            firstStatement = false;
            const member = MEMBER_RE.exec(code);
            if (member) {
                refs.push({ kind: 'MEMBER', target: member[1], line, conditional, classModule: false });
                continue;
            }
        }
        if (!conditional) {
            const block = CONDITIONAL_RE.exec(code);
            if (block) {
                terminator = block[1];
                continue;
            }
        }
        for (const m of code.matchAll(INCLUDE_RE)) {
            refs.push({ kind: 'INCLUDE', target: m[1], line, conditional, classModule: false });
        }
        for (const m of code.matchAll(MODULE_RE)) {
            refs.push({ kind: 'MODULE', target: m[1], line, conditional, classModule: CLASS_RE.test(code) });
        }
    }
    return refs;
}

function categoryOf(ref: FileReference): UnresolvedEntry['category'] {
    if (ref.conditional) return 'conditional';
    // A MODULE name with no extension (in a MAP or on a CLASS) is often a library label or a
    // description, not a file.
    if (ref.kind === 'MODULE' && !/\.[A-Za-z0-9]+$/.test(ref.target.trim())) return 'library';
    return 'missing';
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
