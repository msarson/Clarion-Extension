/**
 * #763 — infer the projects of a folder that already holds Clarion sources: one project per
 * PROGRAM. No vscode here, so the rules are unit-tested on their own.
 *
 * A generated multi-DLL app keeps every program's sources side by side, so each .clw is assigned
 * by its first statement:
 * - MEMBER('x') belongs to program x;
 * - a bare MEMBER() named after a program (<Prog>_FC0, <Prog>_BC1) belongs to that program;
 * - any other bare MEMBER() is left for the user (generators write special modules too);
 * - anything else (an INCLUDE fragment) is not compiled.
 * A member that nothing reaches through MODULE('x') from its program is flagged as a possible
 * leftover: the generator stops writing a module but the old file stays. The source cannot tell a
 * leftover from a real module nobody calls, so the user decides.
 */
export interface SourceFile { relPath: string; text: string }
export type SourceKind = { kind: 'program' } | { kind: 'member'; program: string } | { kind: 'bareMember' } | { kind: 'other' };
export interface InferredProject {
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
const stem = (p: string) => baseName(p).replace(/\.[^.]*$/, '').toLowerCase();
const isClw = (p: string) => /\.clw$/i.test(p);

export function classifySource(text: string): SourceKind {
    const first = lines(text).map(l => l.trim()).find(Boolean) ?? '';
    if (/^PROGRAM\b/i.test(first)) return { kind: 'program' };
    const named = /^MEMBER\s*\(\s*'([^']+)'\s*\)/i.exec(first);
    if (named) return { kind: 'member', program: stem(named[1]) };
    if (/^MEMBER\s*(\(\s*\))?$/i.test(first)) return { kind: 'bareMember' };
    return { kind: 'other' };
}

/** The main CODE of a program is empty when the next statement is a label in column 0. */
function programKind(text: string): 'exe' | 'dll' {
    const ls = lines(text);
    const code = ls.findIndex(l => /^\s+CODE\s*$/i.test(l));
    if (code < 0) return 'exe';
    const next = ls.slice(code + 1).find(l => l.trim());
    return next === undefined || /^\S/.test(next) ? 'dll' : 'exe';
}

/** Every file name a MODULE('x') reaches from the program, following INCLUDEs and the reached members. */
function reachedModules(program: SourceFile, byName: Map<string, SourceFile>): Set<string> {
    const seen = new Set<string>(), reached = new Set<string>();
    const stack = [baseName(program.relPath).toLowerCase()];
    while (stack.length) {
        const name = stack.pop()!;
        const file = byName.get(name);
        if (!file || seen.has(name)) continue;
        seen.add(name);
        for (const line of lines(file.text)) {
            for (const m of line.matchAll(/\bINCLUDE\s*\(\s*'([^']+)'/gi)) stack.push(baseName(m[1]).toLowerCase());
            for (const m of line.matchAll(/\bMODULE\s*\(\s*'([^']+)'/gi)) {
                const target = baseName(m[1]).toLowerCase();
                reached.add(target);
                stack.push(target);
            }
        }
    }
    return reached;
}

export function inferProjects(files: SourceFile[]): FolderInference {
    const byName = new Map<string, SourceFile>();
    for (const f of files) if (!byName.has(baseName(f.relPath).toLowerCase())) byName.set(baseName(f.relPath).toLowerCase(), f);

    const clw = files.filter(f => isClw(f.relPath));
    const kinds = new Map(clw.map(f => [f, classifySource(f.text)]));
    const programs = clw.filter(f => kinds.get(f)!.kind === 'program');
    const byStem = new Map<string, InferredProject>();
    const names = new Set<string>();
    const projects = programs.map(p => {
        // Each project writes <name>.cwproj beside the .sln: a second program of the same name
        // (another sub-folder) takes its folder into its name.
        let name = baseName(p.relPath).replace(/\.[^.]*$/, '');
        if (names.has(name.toLowerCase())) name = p.relPath.replace(/\.[^.]*$/, '').replace(/[\\/]/g, '_');
        names.add(name.toLowerCase());
        const project: InferredProject = {
            name,
            programFile: p.relPath,
            compile: [p.relPath],
            kind: programKind(p.text),
            unreferenced: [],
        };
        if (!byStem.has(stem(p.relPath))) byStem.set(stem(p.relPath), project);
        return project;
    });
    // Longest first, so <Prog>_Tools_BC0 goes to Prog_Tools rather than Prog.
    const prefixes = [...byStem.keys()].sort((a, b) => b.length - a.length);

    const unassigned: string[] = [], missingProgram: string[] = [];
    for (const f of clw) {
        const k = kinds.get(f)!;
        if (k.kind === 'member') {
            const owner = byStem.get(k.program);
            if (owner) owner.compile.push(f.relPath);
            else missingProgram.push(f.relPath);
        } else if (k.kind === 'bareMember') {
            const s = stem(f.relPath);
            const prefix = prefixes.find(p => s.startsWith(p + '_'));
            if (prefix) byStem.get(prefix)!.compile.push(f.relPath);
            else unassigned.push(f.relPath);
        }
    }

    for (const project of projects) {
        const program = programs.find(p => p.relPath === project.programFile)!;
        const reached = reachedModules(program, byName);
        project.unreferenced = project.compile.slice(1).filter(m => !reached.has(baseName(m).toLowerCase()));
    }
    return { projects, unassigned, missingProgram };
}
