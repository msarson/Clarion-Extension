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

/** Where an INCLUDE written in `fromFile` resolves: the project's redirection, else beside it. */
function resolveInclude(name: string, fromFile: string | null): string | null {
    let resolved: string | null = null;
    try { resolved = resolveViaProjectRedirection(name, fromFile); } catch { resolved = null; }
    if (resolved) return resolved;
    if (!fromFile) return null;
    const beside = path.join(path.dirname(fromFile), name);
    return fs.existsSync(beside) ? beside : null;
}

/** The integer EQUATEs a file defines in lines that compile, its INCLUDEs' included. */
function equatesOfFile(file: string, visiting: Set<string>, depth: number, deps?: Map<string, number>): Map<string, number> | undefined {
    const key = file.toLowerCase();
    if (visiting.has(key) || depth > MAX_DEPTH) return undefined;
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
    visiting.add(key);
    const scan = scanConditionalCompile(text.split(/\r?\n/), {
        equatesOfInclude: name => {
            const resolved = resolveInclude(name, file);
            return resolved ? equatesOfFile(resolved, visiting, depth + 1, own) : undefined;
        },
    });
    visiting.delete(key);
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

/** The EQUATEs of an INCLUDE written in `fromFile` (null: the path is not known), if it can be found. */
export function equatesOfIncludeName(name: string, fromFile: string | null): Map<string, number> | undefined {
    const resolved = resolveInclude(name, fromFile);
    return resolved ? equatesOfFile(resolved, new Set(fromFile ? [fromFile.toLowerCase()] : []), 1) : undefined;
}

export function inactiveIncludeLines(filePath: string | null, text: string): Set<number> {
    if (!DIRECTIVE_HINT.test(text)) return new Set();
    const visiting = new Set<string>(filePath ? [filePath.toLowerCase()] : []);
    const scan = scanConditionalCompile(text.split(/\r?\n/), {
        equatesOfInclude: name => {
            const resolved = resolveInclude(name, filePath);
            return resolved ? equatesOfFile(resolved, visiting, 1) : undefined;
        },
    });
    return new Set(scan.includes.filter(i => !i.active).map(i => i.line));
}
