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

const lines = (text: string) => text.split(/\r?\n/).map(stripComment);
const baseName = (p: string) => p.replace(/^.*[\\/]/, '');
const dirName = (p: string) => /[\\/]/.test(p) ? p.replace(/[\\/][^\\/]*$/, '').toLowerCase() : '';
const stem = (p: string) => baseName(p).replace(/\.[^.]*$/, '').toLowerCase();
const isClw = (p: string) => /\.clw$/i.test(p);
const normalize = (p: string) => p.replace(/\//g, '\\').toLowerCase();

/** The first statement, read only as far as it takes. */
function firstStatement(text: string): string {
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

/** The main CODE of a program is empty when the next statement is a label in column 0. */
function programKind(ls: string[]): 'exe' | 'dll' {
    const code = ls.findIndex(l => /^\s+CODE\s*$/i.test(l));
    if (code < 0) return 'exe';
    const next = ls.slice(code + 1).find(l => l.trim());
    return next === undefined || /^\S/.test(next) ? 'dll' : 'exe';
}

/** A project name nothing can misread: MSBuild expands $( @( %( and ; ' " or control characters break the files. */
const safeName = (name: string) => name.replace(/[$@%;'"\x00-\x1f]/g, '_');

export function inferProjects(files: SourceFile[]): FolderInference {
    const byName = new Map<string, SourceFile>();
    for (const f of files) if (!byName.has(baseName(f.relPath).toLowerCase())) byName.set(baseName(f.relPath).toLowerCase(), f);
    // Shared INCLUDE trees are walked once per program: split and strip each file once.
    const lineCache = new Map<SourceFile, string[]>();
    const linesOf = (f: SourceFile) => {
        let ls = lineCache.get(f);
        if (!ls) lineCache.set(f, ls = lines(f.text));
        return ls;
    };

    /** Every file name a MODULE('x') reaches from the program, following INCLUDEs and the reached members. */
    const reachedModules = (program: SourceFile): Set<string> => {
        const seen = new Set<string>(), reached = new Set<string>();
        const stack = [baseName(program.relPath).toLowerCase()];
        // #449: a directive's target without an extension means .clw.
        const targets = (raw: string) => clarionSourceCandidates(baseName(raw).toLowerCase());
        while (stack.length) {
            const name = stack.pop()!;
            const file = byName.get(name);
            if (!file || seen.has(name)) continue;
            seen.add(name);
            for (const line of linesOf(file)) {
                for (const m of line.matchAll(/\bINCLUDE\s*\(\s*'([^']+)'/gi)) stack.push(...targets(m[1]));
                for (const m of line.matchAll(/\bMODULE\s*\(\s*'([^']+)'/gi)) {
                    for (const target of targets(m[1])) {
                        reached.add(target);
                        stack.push(target);
                    }
                }
            }
        }
        return reached;
    };

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

    const unassigned: string[] = [], missingProgram: string[] = [], ambiguous: FolderInference['ambiguous'] = [];
    /** Adds the module to its program; between programs of one name, the path a MEMBER names, then the module's own folder decides. */
    const assign = (f: SourceFile, candidates: SourceFile[], target = '') => {
        const owner = candidates.length === 1 ? candidates[0]
            : candidates.find(c => /[\\/]/.test(target) && clarionSourceCandidates(target).some(t => normalize(c.relPath).endsWith(t)))
            ?? candidates.find(c => dirName(c.relPath) === dirName(f.relPath));
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
            else unassigned.push(f.relPath);
        }
    }

    for (const program of programs) {
        const project = projectOf.get(program)!;
        const reached = reachedModules(program);
        project.unreferenced = project.compile.slice(1).filter(m => !reached.has(baseName(m).toLowerCase()));
    }
    return { projects, unassigned, missingProgram, ambiguous };
}
