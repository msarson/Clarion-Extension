/**
 * #758 — the legacy (TopSpeed) project language of .prj and .pr files, as the help's Advanced
 * Topics > Legacy Project System Reference describes it. A .cwproj can pull one in under "Projects
 * to include" (the MSBuild CW task's Includes, "equivalent to #include(projectFile)"), and then its
 * #compile lines are that project's sources. No fs and no vscode here: the caller reads files.
 *
 * What is read:
 * - commands start with #, and several may share a line; `--` starts a comment to the end of the
 *   line, outside a string; a string is quoted with ' or " and may run over several lines;
 * - `#compile src [#to obj] [/pragma{,pragma}] {, src ...}`, with each source's own defines;
 * - `#include file` runs the file's commands here (macros, pragmas, compiles all carry on);
 *   `#call file` builds another project, so its sources are not this one's;
 * - `#set name = value` and %name% macros: the trailing % may be left off, an unset macro is
 *   empty, `%%` is a % (so a value holding `%%x` expands x where the value is used); a macro used
 *   as a statement whose text holds commands runs them;
 * - `#if expr #then ... #elsif expr #then ... #else ... #endif`, with #or, #and, #not, = (or ==),
 *   #exists, #older and parentheses. A bare word is a literal string: `#if "%release"="on"`.
 *   A condition that cannot be decided (#older, a #pragma value, #exists without an answer)
 *   follows every branch it might take, and the result says it is uncertain;
 * - `#pragma define(x=>v)` (project-wide), `#pragma link(...)`, `#link`, `#system`, `#model` and
 *   `#file redirect`. Everything else is skipped.
 * Comparisons ignore case, as Clarion names do.
 */

export interface LegacyCompile {
    file: string;
    /** The source's own `/define(...)`, names in lower case. */
    defines: Record<string, string>;
}
export interface LegacyProject {
    compiles: LegacyCompile[];
    includes: { file: string; found: boolean }[];
    calls: string[];
    /** `#pragma define(...)` outside a #compile, names in lower case, the last value kept. */
    defines: Record<string, string>;
    /** `#pragma link(...)` entries. */
    links: string[];
    /** `#link` and `#dolink` targets. */
    linkTargets: string[];
    system?: string;
    fileType?: string;
    model?: string;
    /** `#file redirect` */
    redirect?: string;
    /** A condition could not be decided, so its every possible branch was read. */
    uncertain: boolean;
}
export interface LegacyProjectOptions {
    /** The text of a file an #include names, or undefined when it cannot be read. */
    read?: (file: string) => string | undefined;
    /** Whether a file exists, for #exists; undefined when the caller cannot tell. */
    exists?: (file: string) => boolean | undefined;
    /** Macros set before the project runs. */
    macros?: Record<string, string>;
}

type Token = { t: 'word' | 'str' | 'sym'; v: string };

const STARTERS = new Set([
    'abort', 'autocompile', 'call', 'compile', 'declare_compiler', 'dolink', 'else', 'elsif', 'endif',
    'error', 'exemod', 'expand', 'file', 'if', 'ignore', 'implib', 'include', 'link', 'message', 'model',
    'noedit', 'pragma', 'prompt', 'run', 'rundll', 'set', 'split', 'system',
].map(k => '#' + k));
const MAX_DEPTH = 16;

function tokenize(text: string): Token[] {
    const tokens: Token[] = [];
    let i = 0;
    const n = text.length;
    while (i < n) {
        const c = text[i];
        if (/\s/.test(c)) { i++; continue; }
        if (c === '-' && text[i + 1] === '-') {
            while (i < n && text[i] !== '\n') i++;
            continue;
        }
        if (c === "'" || c === '"') {
            const end = text.indexOf(c, i + 1);
            const stop = end < 0 ? n : end;
            tokens.push({ t: 'str', v: text.slice(i + 1, stop) });
            i = stop + 1;
            continue;
        }
        if (c === '=' && text[i + 1] === '>') { tokens.push({ t: 'sym', v: '=>' }); i += 2; continue; }
        if (c === '=') { tokens.push({ t: 'sym', v: '=' }); i += text[i + 1] === '=' ? 2 : 1; continue; }
        if ('(),/'.includes(c)) { tokens.push({ t: 'sym', v: c }); i++; continue; }
        let j = i;
        while (j < n && !/[\s'"=(),/]/.test(text[j]) && !(text[j] === '-' && text[j + 1] === '-')) j++;
        tokens.push({ t: 'word', v: text.slice(i, j) });
        i = j;
    }
    return tokens;
}

type Tri = boolean | null;
/** `maybe` is set once any branch was taken on a condition that could not be decided. */
interface Frame { active: boolean; parentActive: boolean; taken: 'none' | 'maybe' | 'definite'; maybe?: boolean }
/** Tokens run in one parse, across #includes and macro statements: a macro that expands itself, or #includes that fan out, stop here. */
const STEP_BUDGET = 200_000;

export function parseLegacyProject(text: string, options: LegacyProjectOptions = {}): LegacyProject {
    const result: LegacyProject = { compiles: [], includes: [], calls: [], defines: {}, links: [], linkTargets: [], uncertain: false };
    const macros = new Map<string, string>(Object.entries(options.macros ?? {}).map(([k, v]) => [k.toLowerCase(), v]));
    const frames: Frame[] = [];
    const including = new Set<string>();
    /** Macros set in a branch that might not run: a condition naming one is not decided. */
    const unsure = new Set<string>();
    let steps = 0;

    const expand = (s: string) => s.replace(/%%|%([A-Za-z0-9_]+)%?/g, (_m, name?: string) =>
        name === undefined ? '%' : macros.get(name.toLowerCase()) ?? '');
    const namesUnsure = (s: string) => [...s.replace(/%%/g, '').matchAll(/%([A-Za-z0-9_]+)/g)].some(m => unsure.has(m[1].toLowerCase()));
    const inMaybe = () => frames.some(f => f.maybe);
    const active = () => frames.length === 0 || frames[frames.length - 1].active;
    const isStarter = (tok: Token | undefined) => !!tok && tok.t === 'word' && STARTERS.has(tok.v.toLowerCase());
    const isWord = (tok: Token | undefined, v: string) => !!tok && tok.t === 'word' && tok.v.toLowerCase() === v;
    const isSym = (tok: Token | undefined, v: string) => !!tok && tok.t === 'sym' && tok.v === v;
    const isValue = (tok: Token | undefined) => !!tok && (tok.t === 'str' || (tok.t === 'word' && !tok.v.startsWith('#')));

    const run = (tokens: Token[], depth: number): void => {
        let i = 0;
        const skipToStarter = () => { while (i < tokens.length && !isStarter(tokens[i])) i++; };
        /**
         * A macro in an argument stands for text, which may be a list or a pragma: the word at i is
         * replaced by the tokens of its expansion, again while they name macros.
         */
        const expandArgument = () => {
            for (let round = 0; round < 8 && tokens[i]?.t === 'word' && tokens[i].v.includes('%'); round++) {
                const expanded = expand(tokens[i].v);
                if (expanded === tokens[i].v) break;
                tokens.splice(i, 1, ...tokenize(expanded));
            }
        };

        /** `name(args)` groups, comma-separated, from i: each with its args split on top-level commas. */
        const pragmaGroups = (): { name: string; args: Token[][] }[] => {
            const groups: { name: string; args: Token[][] }[] = [];
            while (tokens[i]?.t === 'word' && !isStarter(tokens[i]) && !tokens[i].v.startsWith('#')) {
                const name = tokens[i].v.toLowerCase();
                i++;
                const args: Token[][] = [];
                if (isSym(tokens[i], '(')) {
                    i++;
                    let part: Token[] = [];
                    let nest = 0;
                    while (i < tokens.length && !(nest === 0 && isSym(tokens[i], ')'))) {
                        if (isSym(tokens[i], '(')) nest++;
                        if (isSym(tokens[i], ')')) nest--;
                        if (nest === 0 && isSym(tokens[i], ',')) { args.push(part); part = []; }
                        else part.push(tokens[i]);
                        i++;
                    }
                    args.push(part);
                    i++; // the )
                }
                groups.push({ name, args });
                // Another pragma follows a comma only as `name(`; otherwise the comma is not ours.
                if (isSym(tokens[i], ',') && tokens[i + 1]?.t === 'word' && isSym(tokens[i + 2], '(')) { i++; continue; }
                break;
            }
            return groups;
        };
        const definesOf = (groups: { name: string; args: Token[][] }[], into: Record<string, string>) => {
            for (const g of groups) {
                if (g.name !== 'define') continue;
                for (const part of g.args) {
                    const arrow = part.findIndex(t => isSym(t, '=>'));
                    if (arrow <= 0) continue;
                    into[expand(part[0].v).toLowerCase()] = part.slice(arrow + 1).map(t => expand(t.v)).join('');
                }
            }
        };

        /** The expression from i up to #then, decided where it can be. */
        const condition = (): Tri => {
            const start = i;
            while (i < tokens.length && !isWord(tokens[i], '#then') && !isStarter(tokens[i])) i++;
            const expr = tokens.slice(start, i);
            if (isWord(tokens[i], '#then')) i++;
            let k = 0;
            const operand = (): { value: string; known: boolean } => {
                const tok = expr[k++];
                if (!isValue(tok)) return { value: '', known: true };
                // name1(name2): the setting of a #pragma, which is not tracked.
                if (tok.t === 'word' && isSym(expr[k], '(')) {
                    while (k < expr.length && !isSym(expr[k], ')')) k++;
                    k++;
                    return { value: '', known: false };
                }
                return { value: expand(tok.v), known: !namesUnsure(tok.v) };
            };
            const term = (): Tri => {
                const tok = expr[k];
                if (isWord(tok, '#not')) { k++; const r = term(); return r === null ? null : !r; }
                if (isSym(tok, '(')) {
                    k++;
                    const r = or();
                    if (isSym(expr[k], ')')) k++;
                    return r;
                }
                if (isWord(tok, '#exists')) {
                    k++;
                    const file = operand().value;
                    const r = options.exists?.(file);
                    return r === undefined ? null : r;
                }
                const a = operand();
                if (isWord(expr[k], '#older')) {
                    k++;
                    operand();
                    while (isSym(expr[k], ',')) { k++; operand(); }
                    return null;
                }
                let b: { value: string; known: boolean } = { value: 'on', known: true };
                if (isSym(expr[k], '=')) {
                    k++;
                    if (isValue(expr[k])) b = operand();
                }
                if (!a.known || !b.known) return null;
                return a.value.toLowerCase() === b.value.toLowerCase();
            };
            const and = (): Tri => {
                let r = term();
                while (isWord(expr[k], '#and')) {
                    k++;
                    const s = term();
                    r = r === false || s === false ? false : r === null || s === null ? null : true;
                }
                return r;
            };
            const or = (): Tri => {
                let r = and();
                while (isWord(expr[k], '#or')) {
                    k++;
                    const s = and();
                    r = r === true || s === true ? true : r === null || s === null ? null : false;
                }
                return r;
            };
            return or();
        };
        const enterBranch = (frame: Frame, r: Tri) => {
            if (r === true) { frame.active = true; frame.taken = 'definite'; }
            else if (r === false) frame.active = false;
            else { frame.active = true; frame.taken = 'maybe'; frame.maybe = true; result.uncertain = true; }
        };

        while (i < tokens.length) {
            if (++steps > STEP_BUDGET) { result.uncertain = true; i = tokens.length; break; }
            const tok = tokens[i];
            const kw = isStarter(tok) ? tok.v.toLowerCase() : '';

            if (kw === '#if') {
                i++;
                const frame: Frame = { active: false, parentActive: active(), taken: 'none' };
                if (frame.parentActive) enterBranch(frame, condition());
                frames.push(frame);
                continue;
            }
            if (kw === '#elsif') {
                i++;
                const frame = frames[frames.length - 1];
                if (!frame || !frame.parentActive || frame.taken === 'definite') { if (frame) frame.active = false; continue; }
                enterBranch(frame, condition());
                continue;
            }
            if (kw === '#else') {
                i++;
                const frame = frames[frames.length - 1];
                if (frame) frame.active = frame.parentActive && frame.taken !== 'definite';
                continue;
            }
            if (kw === '#endif') {
                i++;
                frames.pop();
                continue;
            }
            if (!active()) { i++; continue; }

            if (!kw) {
                // A macro used as a statement runs the commands its text holds.
                i++;
                if (depth < MAX_DEPTH && isValue(tok) && tok.v.includes('%')) {
                    const expanded = expand(tok.v);
                    if (expanded.includes('#')) run(tokenize(expanded), depth + 1);
                }
                continue;
            }
            i++;
            switch (kw) {
                case '#set': {
                    if (tokens[i]?.t !== 'word' || isStarter(tokens[i])) break;
                    const name = tokens[i++].v.toLowerCase();
                    if (isSym(tokens[i], '=')) i++;
                    let value = '';
                    if (isValue(tokens[i]) && !isStarter(tokens[i])) value = expand(tokens[i++].v);
                    macros.set(name, value);
                    if (inMaybe()) unsure.add(name); else unsure.delete(name);
                    break;
                }
                case '#compile': {
                    expandArgument();
                    while (isValue(tokens[i])) {
                        const compile: LegacyCompile = { file: expand(tokens[i++].v).trim(), defines: {} };
                        if (isWord(tokens[i], '#to')) i += 2;
                        expandArgument();
                        if (isSym(tokens[i], '/')) { i++; definesOf(pragmaGroups(), compile.defines); }
                        if (compile.file) result.compiles.push(compile);
                        if (!isSym(tokens[i], ',')) break;
                        i++;
                        expandArgument();
                    }
                    break;
                }
                case '#pragma': {
                    const groups = pragmaGroups();
                    definesOf(groups, result.defines);
                    for (const g of groups) {
                        if (g.name !== 'link' && g.name !== 'linkfirst') continue;
                        for (const part of g.args) {
                            const value = part.map(t => expand(t.v)).join('').trim();
                            if (value) result.links.push(value);
                        }
                    }
                    break;
                }
                case '#include': {
                    if (!isValue(tokens[i])) break;
                    const file = expand(tokens[i++].v).trim();
                    const key = file.toLowerCase();
                    if (including.has(key) || depth >= MAX_DEPTH) break;
                    const included = options.read?.(file);
                    result.includes.push({ file, found: included !== undefined });
                    if (included === undefined) break;
                    including.add(key);
                    run(tokenize(included), depth + 1);
                    including.delete(key);
                    break;
                }
                case '#call':
                    if (isValue(tokens[i])) result.calls.push(expand(tokens[i++].v).trim());
                    break;
                case '#link':
                case '#dolink':
                    if (isValue(tokens[i])) result.linkTargets.push(expand(tokens[i++].v).trim());
                    break;
                case '#system': {
                    const args: string[] = [];
                    while (isValue(tokens[i]) && args.length < 2) args.push(expand(tokens[i++].v));
                    result.system = args[0];
                    result.fileType = args[1];
                    macros.set('system', args[0] ?? '');
                    macros.set('filetype', args[1] ?? 'exe');
                    break;
                }
                case '#model': {
                    const args: string[] = [];
                    while (isValue(tokens[i]) && args.length < 2) args.push(expand(tokens[i++].v));
                    result.model = args[0];
                    macros.set('model', args[0] ?? '');
                    macros.set('jpicall', args[1] ?? 'dll');
                    break;
                }
                case '#file': {
                    if (isWord(tokens[i], 'redirect') && isValue(tokens[i + 1])) {
                        result.redirect = expand(tokens[i + 1].v).trim();
                        i += 2;
                    }
                    skipToStarter();
                    break;
                }
                default:
                    skipToStarter();
            }
        }
    };

    run(tokenize(text), 0);
    return result;
}
