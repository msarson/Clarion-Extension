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
    // Directives name a file without its folder: when several folders hold that name, the one
    // beside the program it is read for is meant.
    const byName = new Map<string, SourceFile[]>();
    for (const f of files) {
        const key = baseName(f.relPath).toLowerCase();
        byName.set(key, [...(byName.get(key) ?? []), f]);
    }
    /**
     * The file a directive names, read for `near`: a target with a folder is that file (whole
     * folder names: `a\x` is not `ba\x`); a bare name is the one beside `near`, else the first.
     * #449: a target without an extension means .clw.
     */
    const resolve = (raw: string, near: SourceFile): SourceFile | undefined => {
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

    /** Every file a MODULE('x') reaches from the program, following INCLUDEs and the reached members. */
    const reachedModules = (program: SourceFile): Set<SourceFile> => {
        const seen = new Set<SourceFile>(), reached = new Set<SourceFile>();
        const stack: SourceFile[] = [program];
        while (stack.length) {
            const file = stack.pop()!;
            if (seen.has(file)) continue;
            seen.add(file);
            for (const line of linesOf(file)) {
                for (const m of line.matchAll(/\b(INCLUDE|MODULE)\s*\(\s*'([^']+)'/gi)) {
                    const target = resolve(m[2], program);
                    if (!target) continue;
                    if (m[1].toUpperCase() === 'MODULE') reached.add(target);
                    stack.push(target);
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
            else unassigned.push(f.relPath);
        }
    }

    const fileAt = new Map(clw.map(f => [f.relPath, f]));
    for (const program of programs) {
        const project = projectOf.get(program)!;
        const reached = reachedModules(program);
        project.unreferenced = project.compile.slice(1).filter(m => !reached.has(fileAt.get(m)!));
    }
    return { projects, unassigned, missingProgram, ambiguous };
}
