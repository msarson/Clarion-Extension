import * as fs from 'fs';
import * as path from 'path';
import { scanConditionalCompile } from './ConditionalCompile';
import { resolveViaProjectRedirection } from './RedirectionResolution';

/**
 * #807 — the INCLUDE lines of a file that sit in a COMPILE/OMIT block decided not to compile, for
 * the code that follows INCLUDEs (the token path, the file graph, the include checks and the
 * text scans). A file with no OMIT or COMPILE returns at once.
 *
 * A switch is often an EQUATE from an earlier INCLUDE (a one-line version file choosing between
 * version-specific declarations), so an INCLUDE that is followed has its own EQUATEs read: it is
 * resolved through the owning project's redirection, else beside the including file, and read
 * the same way, its own INCLUDEs too. Those reads are cached by path and modification time.
 */
const DIRECTIVE_HINT = /\b(?:OMIT|COMPILE)\s*\(/i;
const MAX_DEPTH = 8;

/** A file's EQUATEs, valid while it and every file it read keep their modification times. */
const equatesCache = new Map<string, { deps: Map<string, number>; equates: Map<string, number> }>();
const mtimeOf = (file: string): number | undefined => { try { return fs.statSync(file).mtimeMs; } catch { return undefined; } };

/** The declaration index, once built (it holds every EQUATE by name and file); else undefined. */
function builtIndex(): { find(name: string): { structureType?: string; filePath: string }[] } | undefined {
    try {
        // Lazy: the index sits in import cycles with the tokenizer.
        const { StructureDeclarationIndexer } = require('./StructureDeclarationIndexer');
        const sdi = StructureDeclarationIndexer.getInstance();
        return sdi.hasAnyIndex() ? sdi : undefined;
    } catch {
        return undefined;
    }
}

/**
 * For a name not known yet, which INCLUDEs to read: those of the files the declaration index says
 * define it as an EQUATE (by file name), and not their own INCLUDEs. A switch only a project
 * defines (`_ABCDllMode_` in thousands of generated modules) reads nothing. Reading every earlier
 * INCLUDE, and theirs, to look for a name blocked the server for seconds on a large solution.
 * With no index (no solution, or not built yet): undefined, read them all.
 */
function includesDefining(name: string): ((file: string) => boolean) | undefined {
    const sdi = builtIndex();
    if (!sdi) return undefined;
    const files = new Set(sdi.find(name)
        .filter(d => d.structureType === 'EQUATE')
        .map(d => path.win32.basename(d.filePath).toLowerCase()));
    return file => files.has(path.win32.basename(file).toLowerCase());
}

/** Where an INCLUDE written in `fromFile` resolves: the project's redirection, else beside it. */
function resolveInclude(name: string, fromFile: string | null): string | null {
    let resolved: string | null = null;
    try { resolved = resolveViaProjectRedirection(name, fromFile); } catch { resolved = null; }
    if (resolved) return resolved;
    if (!fromFile) return null;
    const beside = path.join(path.dirname(fromFile), name);
    return fs.existsSync(beside) ? beside : null;
}

/**
 * The integer EQUATEs a file defines in lines that compile; with `deep`, its INCLUDEs' as well. With
 * the declaration index built the file read is the one that defines the name, so not deep.
 */
function equatesOfFile(file: string, visiting: Set<string>, depth: number, deep: boolean, deps?: Map<string, number>): Map<string, number> | undefined {
    const key = `${file.toLowerCase()}|${deep ? 'deep' : 'own'}`;
    if (visiting.has(file.toLowerCase()) || depth > MAX_DEPTH) return undefined;
    const cached = equatesCache.get(key);
    if (cached && [...cached.deps].every(([f, m]) => mtimeOf(f) === m)) {
        for (const [f, m] of cached.deps) deps?.set(f, m);
        return cached.equates;
    }
    const mtimeMs = mtimeOf(file);
    if (mtimeMs === undefined) return undefined;
    let text: string;
    try { text = fs.readFileSync(file, 'latin1'); } catch { return undefined; }
    const own = new Map<string, number>([[file, mtimeMs]]);
    visiting.add(file.toLowerCase());
    const scan = scanConditionalCompile(text.split(/\r?\n/), deep ? {
        includesDefining,
        equatesOfInclude: name => {
            const resolved = resolveInclude(name, file);
            return resolved ? equatesOfFile(resolved, visiting, depth + 1, deep, own) : undefined;
        },
    } : {});
    visiting.delete(file.toLowerCase());
    equatesCache.set(key, { deps: own, equates: scan.equates });
    for (const [f, m] of own) deps?.set(f, m);
    return scan.equates;
}

/**
 * For a walker that finds INCLUDEs in a file's text by pattern: whether the INCLUDE on a line, or
 * at a character offset, sits in a block that compiles. Always true, at no cost, for a file with
 * no OMIT or COMPILE.
 */
export function compiledIncludeTest(filePath: string | null, text: string): { atLine(line: number): boolean; atOffset(offset: number): boolean } {
    const inactive = inactiveIncludeLines(filePath, text);
    if (inactive.size === 0) return { atLine: () => true, atOffset: () => true };
    const lineStarts = [0];
    for (let i = text.indexOf('\n'); i !== -1; i = text.indexOf('\n', i + 1)) lineStarts.push(i + 1);
    const lineOf = (offset: number): number => {
        let lo = 0, hi = lineStarts.length - 1;
        while (lo < hi) {
            const mid = (lo + hi + 1) >> 1;
            if (lineStarts[mid] <= offset) lo = mid; else hi = mid - 1;
        }
        return lo;
    };
    return { atLine: line => !inactive.has(line), atOffset: offset => !inactive.has(lineOf(offset)) };
}

/**
 * One answer per file and content: the token path, the file graph, the label scan and the include
 * checks all ask for the same file. Valid while the text is the same and every INCLUDEd file read
 * for it keeps its modification time.
 */
const resultCache = new Map<string, { text: string; deps: Map<string, number>; lines: Set<number> }>();
const RESULT_CACHE_MAX = 2000;

export function inactiveIncludeLines(filePath: string | null, text: string): Set<number> {
    if (!DIRECTIVE_HINT.test(text)) return new Set();
    const key = filePath?.toLowerCase();
    const cached = key !== undefined ? resultCache.get(key) : undefined;
    if (cached && cached.text === text && [...cached.deps].every(([f, m]) => mtimeOf(f) === m)) return cached.lines;

    const visiting = new Set<string>(key ? [key] : []);
    const deps = new Map<string, number>();
    // With the index built, read only the INCLUDEs that define a name, and only them.
    const deep = builtIndex() === undefined;
    const scan = scanConditionalCompile(text.split(/\r?\n/), {
        includesDefining,
        equatesOfInclude: name => {
            const resolved = resolveInclude(name, filePath);
            return resolved ? equatesOfFile(resolved, visiting, 1, deep, deps) : undefined;
        },
    });
    const lines = new Set(scan.includes.filter(i => !i.active).map(i => i.line));
    if (key !== undefined) {
        resultCache.delete(key);
        resultCache.set(key, { text, deps, lines });
        if (resultCache.size > RESULT_CACHE_MAX) resultCache.delete(resultCache.keys().next().value!);
    }
    return lines;
}
