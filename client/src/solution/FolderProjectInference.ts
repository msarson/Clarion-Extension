/**
 * #763 — infer the projects of a folder that already holds Clarion sources: one project per
 * PROGRAM. No vscode here, so the rules are unit-tested on their own.
 *
 * A generated multi-DLL app keeps every program's sources side by side, so each .clw is assigned
 * by its first statement:
 * - MEMBER('x') belongs to program x; when several folders hold a program x, to the one the
 *   MEMBER's path names, else the one in the member's own folder, else the user picks;
 * - a bare MEMBER() named after a program (<Prog>_FC0, <Prog>_BC1) belongs to that program;
 * - any other bare MEMBER() is left for the user (generators write special modules too);
 * - anything else (an INCLUDE fragment) is not compiled.
 * A member that nothing reaches through MODULE('x') from its program is flagged as a possible
 * leftover: the generator stops writing a module but the old file stays. The source cannot tell a
 * leftover from a real module nobody calls, so the user decides.
 */
import { clarionSourceCandidates } from '../../../common/ClarionSourceNaming';

export interface SourceFile { relPath: string; text: string }
export type SourceKind = { kind: 'program' } | { kind: 'member'; program: string } | { kind: 'bareMember' } | { kind: 'other' };
export interface InferredProject {
    /** Names <name>.cwproj and the build output, so it is unique and holds nothing MSBuild expands. */
    name: string;
    programFile: string;
    /** Relative paths, the program first. */
    compile: string[];
    /** A DLL's main CODE is empty. A guess for hand-written code: the user confirms it. */
    kind: 'exe' | 'dll';
    /** Members no MODULE reaches from the program: possible leftovers (a subset of compile). */
    unreferenced: string[];
}
export interface FolderInference {
    projects: InferredProject[];
    /** Bare MEMBER() modules named after no program. */
    unassigned: string[];
    /** MEMBER('x') modules whose program x is not in the folder. */
    missingProgram: string[];
    /** MEMBER('x') modules naming a program more than one folder holds: the user picks. */
    ambiguous: { file: string; candidates: string[] }[];
    /** Bare MEMBER() modules a CLASS's MODULE names: LINK builds them, so they are not listed. */
    classImplementations: string[];
}

/** Drops a ! comment, leaving ! inside a quoted string alone. */
function stripComment(line: string): string {
    let quoted = false;
    for (let i = 0; i < line.length; i++) {
        if (line[i] === "'") quoted = !quoted;
        else if (line[i] === '!' && !quoted) return line.slice(0, i);
    }
    return line;
}

/** A UTF-8 byte-order mark, as decoded text or as the three characters a latin1 read gives. */
const dropBom = (text: string) => text.replace(/^(﻿|ï»¿)/, '');
const lines = (text: string) => dropBom(text).split(/\r?\n/).map(stripComment);
const baseName = (p: string) => p.replace(/^.*[\\/]/, '');
const dirName = (p: string) => /[\\/]/.test(p) ? p.replace(/[\\/][^\\/]*$/, '').toLowerCase() : '';
const stem = (p: string) => baseName(p).replace(/\.[^.]*$/, '').toLowerCase();
const isClw = (p: string) => /\.clw$/i.test(p);
const normalize = (p: string) => p.replace(/\//g, '\\').toLowerCase();
/** The relative path is the target, or ends with it at a folder boundary (`a\x` is not `ba\x`). */
const pathMatches = (relPath: string, target: string) => {
    const p = normalize(relPath);
    return p === target || p.endsWith('\\' + target);
};

/** The first statement, read only as far as it takes. */
function firstStatement(text: string): string {
    text = dropBom(text);
    let start = 0;
    while (start <= text.length) {
        const end = text.indexOf('\n', start);
        const line = stripComment(text.slice(start, end < 0 ? undefined : end)).trim();
        if (line) return line;
        if (end < 0) break;
        start = end + 1;
    }
    return '';
}

const MEMBER_NAMED = /^MEMBER\s*\(\s*'([^']+)'\s*\)/i;

export function classifySource(text: string): SourceKind {
    const first = firstStatement(text);
    if (/^PROGRAM\b/i.test(first)) return { kind: 'program' };
    const named = MEMBER_NAMED.exec(first);
    if (named) return { kind: 'member', program: stem(named[1]) };
    if (/^MEMBER\s*(\(\s*\))?$/i.test(first)) return { kind: 'bareMember' };
    return { kind: 'other' };
}

/**
 * A DLL's main CODE is empty: the next statement is a label in column 0, or nothing at all (a
 * DLL whose procedures all live in its members). An EXE that does nothing yet looks the same;
 * on a real app that was one stub test program against one such DLL, so the user confirms.
 */
function programKind(ls: string[]): 'exe' | 'dll' {
    const code = ls.findIndex(l => /^\s+CODE\s*$/i.test(l));
    if (code < 0) return 'exe';
    const next = ls.slice(code + 1).find(l => l.trim());
    return next === undefined || /^\S/.test(next) ? 'dll' : 'exe';
}

/**
 * The procedures a MAP MODULE block declares, from the MODULE line at `at` (comments stripped) to
 * its END: each prototype's name, the first word of its line.
 */
function moduleBlockNames(ls: string[], at: number): string[] {
    const names: string[] = [];
    for (let i = at + 1; i < ls.length; i++) {
        const line = ls[i].trim();
        if (/^(END\b|\.$)/i.test(line)) break;
        const m = /^([A-Za-z_][\w:]*)\s*(?:\(|,|$|PROCEDURE\b|FUNCTION\b)/i.exec(line);
        // Compiler directives sit in MODULE blocks too (CWUTIL.INC links its .lib with PRAGMA).
        if (m && !/^(MODULE|END|COMPILE|OMIT|INCLUDE|PRAGMA|SECTION|ITEMIZE|EQUATE|ONCE)$/i.test(m[1])) names.push(m[1]);
    }
    return names;
}

/** The file names a source's INCLUDE and MODULE directives use; without an extension, .clw (#449). */
function directiveNames(text: string): string[] {
    const names: string[] = [];
    for (const raw of text.split(/\r?\n/)) {
        if (!/INCLUDE|MODULE/i.test(raw)) continue;
        for (const m of stripComment(raw).matchAll(/\b(?:INCLUDE|MODULE)\s*\(\s*'([^']+)'/gi)) {
            const name = baseName(m[1]);
            names.push(/\.[^.\\/]*$/.test(name) ? name : name + '.clw');
        }
    }
    return names;
}

/** Library rounds before the search gives up: includes of includes rarely go three deep. */
const MAX_LIBRARY_ROUNDS = 8;

/**
 * #763 — the library sources a folder's directives reach outside it: round by round, the names
 * not in the folder go to `lookup` (redirection, on the server), the files it finds are read, and
 * the names those use go next. A failed lookup ends the search with what was found.
 */
export async function findLibraryFiles(
    files: SourceFile[],
    lookup: (names: string[]) => Promise<Record<string, string>>,
    read: (filePath: string) => Promise<string | undefined>,
): Promise<SourceFile[]> {
    const known = new Set(files.map(f => baseName(f.relPath).toLowerCase()));
    const libraries: SourceFile[] = [];
    let sources = files;
    for (let round = 0; round < MAX_LIBRARY_ROUNDS && sources.length > 0; round++) {
        const wanted = new Map<string, string>();
        for (const source of sources) {
            for (const name of directiveNames(source.text)) {
                const key = name.toLowerCase();
                if (!known.has(key) && !wanted.has(key)) wanted.set(key, name);
            }
        }
        if (wanted.size === 0) break;
        wanted.forEach((_name, key) => known.add(key));
        let found: Record<string, string>;
        try {
            found = await lookup([...wanted.values()]);
        } catch {
            break;
        }
        sources = [];
        for (const filePath of Object.values(found)) {
            const text = await read(filePath);
            if (text === undefined) continue;
            const file = { relPath: filePath, text };
            libraries.push(file);
            sources.push(file);
        }
    }
    return libraries;
}

/** A LINK('x', flag) builds x unless its flag is 0; an omitted flag builds it (compiler-verified, #763). */
const isLinkOff = (flag: string | undefined) => flag !== undefined && flag.trim() === '0';

/** A project name nothing can misread: MSBuild expands $( @( %( and ; ' " or control characters break the files. */
const safeName = (name: string) => name.replace(/[$@%;'"\x00-\x1f]/g, '_');

/**
 * `libraryFiles` are sources outside the folder that redirection finds for the names the folder's
 * directives use (Clarion's libsrc, accessories), with their full paths as relPath. The folder's
 * own files win over a library file of the same name, as `.` comes first in a redirection file.
 */
export function inferProjects(files: SourceFile[], libraryFiles: SourceFile[] = []): FolderInference {
    // Directives name a file without its folder: when several folders hold that name, the one
    // beside the program it is read for is meant.
    const byName = new Map<string, SourceFile[]>();
    for (const f of files) {
        const key = baseName(f.relPath).toLowerCase();
        byName.set(key, [...(byName.get(key) ?? []), f]);
    }
    const library = new Set(libraryFiles);
    for (const f of libraryFiles) {
        const key = baseName(f.relPath).toLowerCase();
        if (!byName.has(key)) byName.set(key, [f]);
    }
    /**
     * The file a directive names, read for `near`: a target with a folder is that file (whole
     * folder names: `a\x` is not `ba\x`); a bare name is the one beside `near`, else the first.
     * #449: a target without an extension means .clw.
     */
    const resolved = new Map<string, SourceFile | undefined>();
    const resolve = (raw: string, near: SourceFile): SourceFile | undefined => {
        // Every project's closure resolves the same directives: the answer depends only on the
        // target and the folder it is read from.
        const key = dirName(near.relPath) + '|' + raw;
        if (resolved.has(key)) return resolved.get(key);
        const file = resolveUncached(raw, near);
        resolved.set(key, file);
        return file;
    };
    const resolveUncached = (raw: string, near: SourceFile): SourceFile | undefined => {
        for (const target of clarionSourceCandidates(normalize(raw).replace(/^\.\\/, ''))) {
            const found = byName.get(baseName(target));
            if (!found) continue;
            if (/\\/.test(target)) {
                const named = found.find(f => pathMatches(f.relPath, target));
                if (named) return named;
            }
            return found.find(f => dirName(f.relPath) === dirName(near.relPath)) ?? found[0];
        }
        return undefined;
    };
    // Shared INCLUDE trees are walked once per program: split and strip each file once.
    const lineCache = new Map<SourceFile, string[]>();
    const linesOf = (f: SourceFile) => {
        let ls = lineCache.get(f);
        if (!ls) lineCache.set(f, ls = lines(f.text));
        return ls;
    };

    /**
     * Every file a MODULE('x') reaches from the program, following INCLUDEs and the reached
     * members, with the procedure names each MODULE block declares (used for library modules).
     */
    const reachedModules = (program: SourceFile): Map<SourceFile, Set<string>> => {
        const seen = new Set<SourceFile>(), reached = new Map<SourceFile, Set<string>>();
        const stack: SourceFile[] = [program];
        while (stack.length) {
            const file = stack.pop()!;
            if (seen.has(file)) continue;
            seen.add(file);
            for (const d of directivesOf(file)) {
                if (d.kind === 'LINK') continue;
                const target = resolve(d.target, program);
                if (!target) continue;
                if (d.kind === 'MODULE') {
                    const declared = reached.get(target) ?? new Set<string>();
                    d.declares.forEach(n => declared.add(n));
                    reached.set(target, declared);
                }
                stack.push(target);
            }
        }
        return reached;
    };

    // A bare MEMBER() that a CLASS's active LINK names is the class's implementation: the LINK
    // adds it to the build (compiler-verified, #763), so it is neither listed nor asked about. A
    // CLASS statement may run over several lines joined with `|`.
    const classModules = new Set<string>();
    for (const f of [...files, ...libraryFiles]) {
        if (!/CLASS/i.test(f.text)) continue;
        // Only lines that say CLASS, and the lines they continue onto, are stripped of comments.
        const raw = f.text.split(/\r?\n/);
        for (let i = 0; i < raw.length; i++) {
            if (!/\bCLASS\b/i.test(raw[i])) continue;
            let line = stripComment(raw[i]);
            if (!/\bCLASS\b/i.test(line)) continue;
            let statement = line;
            while (/\|\s*$/.test(line) && i + 1 < raw.length) {
                line = stripComment(raw[++i]);
                statement = statement.replace(/\|\s*$/, ' ') + line;
            }
            // A LINK is active unless its flag is 0 (compiler-verified on Clarion 10: LINK('x') and
            // LINK('x',1) build x unlisted, LINK('x',0) does not; the help says an omitted flag is
            // inactive, the compiler does not). A define (_ABCLinkMode_) counts as active too: ABC
            // classes build that way with no defines set.
            for (const m of statement.matchAll(/\bLINK\s*\(\s*'([^']+)'\s*(?:,\s*([^)]*?))?\s*\)/gi)) {
                if (isLinkOff(m[2])) continue;
                clarionSourceCandidates(baseName(m[1]).toLowerCase()).forEach(n => classModules.add(n));
            }
        }
    }

    const clw = files.filter(f => isClw(f.relPath));
    const kinds = new Map(clw.map(f => [f, classifySource(f.text)]));
    const programs = clw.filter(f => kinds.get(f)!.kind === 'program');

    // Each project writes <name>.cwproj beside the .sln: a second program of the same name takes
    // its folder into its name, and a number when even that is taken.
    const names = new Set<string>();
    const unique = (wanted: string[]) => {
        let name = wanted.find(n => !names.has(n.toLowerCase()));
        const last = wanted[wanted.length - 1];
        for (let i = 2; !name; i++) if (!names.has(`${last}_${i}`.toLowerCase())) name = `${last}_${i}`;
        names.add(name.toLowerCase());
        return name;
    };
    const projectOf = new Map<SourceFile, InferredProject>();
    const byStem = new Map<string, SourceFile[]>();
    const projects = programs.map(p => {
        const project: InferredProject = {
            name: unique([safeName(baseName(p.relPath).replace(/\.[^.]*$/, '')), safeName(p.relPath.replace(/\.[^.]*$/, '').replace(/[\\/]/g, '_'))]),
            programFile: p.relPath,
            compile: [p.relPath],
            kind: programKind(linesOf(p)),
            unreferenced: [],
        };
        projectOf.set(p, project);
        byStem.set(stem(p.relPath), [...(byStem.get(stem(p.relPath)) ?? []), p]);
        return project;
    });
    // Longest first, so <Prog>_Tools_BC0 goes to Prog_Tools rather than Prog.
    const prefixes = [...byStem.keys()].sort((a, b) => b.length - a.length);

    const unassigned: string[] = [], missingProgram: string[] = [], ambiguous: FolderInference['ambiguous'] = [], classImplementations: string[] = [];
    /** Adds the module to its program; between programs of one name, the path a MEMBER names, then the module's own folder decides. */
    const assign = (f: SourceFile, candidates: SourceFile[], target = '') => {
        if (candidates.length > 1 && /\\/.test(target)) {
            const named = candidates.filter(c => clarionSourceCandidates(target).some(t => pathMatches(c.relPath, t)));
            if (named.length > 0) candidates = named;
        }
        const owner = candidates.length === 1 ? candidates[0] : candidates.find(c => dirName(c.relPath) === dirName(f.relPath));
        if (owner) projectOf.get(owner)!.compile.push(f.relPath);
        else ambiguous.push({ file: f.relPath, candidates: candidates.map(c => projectOf.get(c)!.name) });
    };
    for (const f of clw) {
        const k = kinds.get(f)!;
        if (k.kind === 'member') {
            const candidates = byStem.get(k.program);
            if (candidates) assign(f, candidates, normalize(MEMBER_NAMED.exec(firstStatement(f.text))![1]));
            else missingProgram.push(f.relPath);
        } else if (k.kind === 'bareMember') {
            const s = stem(f.relPath);
            const prefix = prefixes.find(p => s.startsWith(p + '_'));
            if (prefix) assign(f, byStem.get(prefix)!);
            else if (classModules.has(baseName(f.relPath).toLowerCase())) classImplementations.push(f.relPath);
            else unassigned.push(f.relPath);
        }
    }

    const fileAt = new Map(clw.map(f => [f.relPath, f]));

    /**
     * Each line's MAP depth: inside a MAP (or a MODULE block in it) a line declares, it does not
     * call. A MODULE block in a file included inside a MAP starts at depth 0 in that file.
     */
    const mapDepths = (ls: string[]): number[] => {
        let depth = 0;
        return ls.map(line => {
            const t = line.trim();
            const at = depth;
            if (depth > 0) {
                if (/^(END\b|\.$)/i.test(t)) depth--;
                else if (/^MODULE\s*\(/i.test(t)) depth++;
            } else if (/^MAP\b/i.test(t)) depth = 1;
            return at > 0 || depth > 0 ? 1 : 0;
        });
    };

    /** The words a file's code uses: MAP blocks (declarations), strings and member access left out. */
    const wordCache = new Map<SourceFile, Set<string>>();
    const codeWordsOf = (f: SourceFile): Set<string> => {
        let words = wordCache.get(f);
        if (words) return words;
        words = new Set<string>();
        const ls = linesOf(f), depths = mapDepths(ls);
        ls.forEach((line, i) => {
            if (depths[i]) return;
            for (const m of line.replace(/'(?:[^']|'')*'/g, "''").matchAll(/(?<![\w:.])[A-Za-z_]\w*/g)) words.add(m[0].toLowerCase());
        });
        wordCache.set(f, words);
        return words;
    };

    /**
     * What a project compiles, from `start`: the files, what they INCLUDE and the class
     * implementations their active LINKs build; with the procedures each MAP MODULE block in
     * them declares, by the file the MODULE names.
     */
    /** The files whose code uses a word, found once per word across the folder and its libraries. */
    const callerCache = new Map<string, SourceFile[]>();
    const callersOf = (word: string): SourceFile[] => {
        const key = word.toLowerCase();
        let found = callerCache.get(key);
        if (!found) callerCache.set(key, found = [...files, ...libraryFiles].filter(f => codeWordsOf(f).has(key)));
        return found;
    };

    /** Each file's INCLUDE, MODULE and LINK directives, parsed once: every project's closure reads them. */
    interface Directive { kind: 'INCLUDE' | 'MODULE' | 'LINK'; target: string; inMap: boolean; declares: string[]; linkOff: boolean }
    const directiveCache = new Map<SourceFile, Directive[]>();
    const directivesOf = (file: SourceFile): Directive[] => {
        let found = directiveCache.get(file);
        if (found) return found;
        found = [];
        if (/INCLUDE|MODULE|LINK/i.test(file.text)) {
            const ls = linesOf(file), depths = mapDepths(ls);
            ls.forEach((line, i) => {
                for (const m of line.matchAll(/\b(INCLUDE|MODULE|LINK)\s*\(\s*'([^']+)'\s*(?:,\s*([^)]*?))?\s*\)?/gi)) {
                    const kind = m[1].toUpperCase() as Directive['kind'];
                    found!.push({ kind, target: m[2], inMap: depths[i] > 0, declares: kind === 'MODULE' ? moduleBlockNames(ls, i) : [], linkOff: isLinkOff(m[3]) });
                }
            });
        }
        directiveCache.set(file, found);
        return found;
    };

    const buildClosure = (start: SourceFile[], near: SourceFile) => {
        const built = new Set<SourceFile>(), modules = new Map<SourceFile, Set<string>>();
        // Files included inside a MAP hold MAP lines: declarations only, never code.
        const declarations = new Set<SourceFile>();
        const stack = [...start];
        while (stack.length) {
            const file = stack.pop()!;
            if (built.has(file)) continue;
            built.add(file);
            const inDeclarations = declarations.has(file);
            for (const d of directivesOf(file)) {
                const target = resolve(d.target, near);
                if (!target) continue;
                if (d.kind === 'INCLUDE') {
                    if (d.inMap || inDeclarations) declarations.add(target);
                    stack.push(target);
                } else if (d.kind === 'LINK') {
                    if (!d.linkOff) stack.push(target);
                } else {
                    const declared = modules.get(target) ?? new Set<string>();
                    d.declares.forEach(n => declared.add(n));
                    modules.set(target, declared);
                }
            }
        }
        return { files: [...built].filter(f => !declarations.has(f)), modules };
    };
    for (const program of programs) {
        const project = projectOf.get(program)!;
        const reached = reachedModules(program);
        project.unreferenced = project.compile.slice(1).filter(m => !reached.has(fileAt.get(m)!));
        // A library source a MAP MODULE reaches has no LINK to build it (compiler-verified, #763):
        // the project lists it by bare name, as a generated project does, and redirection finds
        // it. Only a MEMBER module (a .clw of MAP lines named by MODULE('CLib') is no source),
        // only when the project's code calls a procedure the block declares (an unused prototype
        // needs nothing linked), and never one a CLASS's active LINK builds. The code is all the
        // project compiles: its files, what they INCLUDE, the class implementations their LINKs
        // build, and the libraries already listed, whose own calls can need another library.
        const listed: SourceFile[] = [];
        const compiled = project.compile.map(m => fileAt.get(m)).filter((f): f is SourceFile => !!f);
        for (let grew = true; grew;) {
            grew = false;
            const { files: built, modules } = buildClosure([...compiled, ...listed], program);
            const inBuild = new Set(built);
            for (const [file, declared] of modules) {
                const name = baseName(file.relPath);
                if (!library.has(file) || !isClw(name) || classModules.has(name.toLowerCase()) || listed.includes(file)) continue;
                const kind = classifySource(file.text).kind;
                if (kind !== 'member' && kind !== 'bareMember') continue;
                if (![...declared].some(n => callersOf(n).some(f => inBuild.has(f)))) continue;
                listed.push(file);
                if (!project.compile.includes(name)) project.compile.push(name);
                grew = true;
            }
        }
    }
    return { projects, unassigned, missingProgram, ambiguous, classImplementations };
}
