import * as fs from 'fs';
import * as path from 'path';
import { serverSettings } from '../serverSettings';
import { switchValue } from '../utils/ConditionalCompile';

/**
 * #812 — a COMPILE/OMIT switch can be a project define (the help's Conditional Switch). For a file
 * a project compiles, its switches are, last one winning: the .cwproj's DefineConstants for the
 * active configuration, the #pragma defines of a .prj it includes, and the file's own /define on
 * its #compile line there.
 *
 * Only for a file a project compiles (one of its sources, by full path), and only where every
 * project that compiles it agrees: a header many projects include is decided per includer by the
 * compiler, and one answer cached per file cannot be right for all of them.
 *
 * What an answer depends on is handed back with it, as #807's dependencies: the .cwproj and .prj
 * files with their modification times, the configuration, and, when no solution was loaded yet,
 * that it still is not (so the file is decided again once one is).
 */

/** A dependency on the active configuration: unchanged while it is the one named after the prefix. */
const CONFIG_PREFIX = '\0configuration:';
/** A dependency on there being no solution loaded: unchanged while there still is none. */
const NO_SOLUTION = '\0no-solution';

const mtimeOf = (file: string): number | undefined => { try { return fs.statSync(file).mtimeMs; } catch { return undefined; } };

/** A loaded solution's projects, or undefined. Lazy: the solution manager sits in import cycles with the tokenizer. */
function loadedProjects(): ProjectLike[] | undefined {
    try {
        const { SolutionManager } = require('./solutionManager');
        const projects = SolutionManager.getInstance()?.solution?.projects as ProjectLike[] | undefined;
        return projects && projects.length > 0 ? projects : undefined;
    } catch {
        return undefined;
    }
}

interface ProjectLike {
    path: string;
    filename?: string;
    name: string;
    sourceFiles: { relativePath: string }[];
    legacyProjects?: { defines: Record<string, string>; fileDefines?: Record<string, Record<string, string>>; watch: string[] }[];
}

/** Whether a dependency #812 adds still holds; false for an ordinary file path (the caller checks its time). */
export function isProjectDependency(key: string): boolean {
    return key.startsWith('\0');
}
export function projectDependencyHolds(key: string): boolean {
    if (key === NO_SOLUTION) return loadedProjects() === undefined;
    if (key.startsWith(CONFIG_PREFIX)) return key.slice(CONFIG_PREFIX.length) === serverSettings.configuration.toLowerCase();
    return false;
}

const decodeEntities = (s: string) => s
    .replace(/&gt;/gi, '>').replace(/&lt;/gi, '<').replace(/&quot;/gi, '"').replace(/&apos;/gi, "'").replace(/&amp;/gi, '&')
    .replace(/%([0-9a-f]{2})/gi, (_m, hex: string) => String.fromCharCode(parseInt(hex, 16)));

/**
 * The DefineConstants of a .cwproj (`name=>value;...`, written with &gt; and %3b) in the groups that
 * apply to `configuration`: those with no Condition on the configuration, and those naming it.
 * Names in lower case; a later group wins.
 */
export function parseDefineConstants(cwprojText: string, configuration: string): Record<string, string> {
    const defines: Record<string, string> = {};
    const wanted = configuration.toLowerCase();
    for (const group of cwprojText.matchAll(/<PropertyGroup\b([^>]*?)(?:\/>|>([\s\S]*?)<\/PropertyGroup\s*>)/gi)) {
        const body = group[2];
        if (!body) continue;
        const condition = /\bCondition\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(group[1]);
        const text = condition ? (condition[1] ?? condition[2]) : '';
        if (/\$\(Configuration\)/i.test(text)) {
            const named = /==\s*'([^'|]*)/.exec(text);
            if (!named || named[1].trim().toLowerCase() !== wanted) continue;
        }
        for (const constants of body.matchAll(/<DefineConstants>([\s\S]*?)<\/DefineConstants\s*>/gi)) {
            for (const entry of decodeEntities(constants[1]).split(';')) {
                const m = /^\s*([A-Za-z_][\w:]*)\s*=>?\s*(.*?)\s*$/.exec(entry);
                if (m) defines[m[1].toLowerCase()] = m[2];
            }
        }
    }
    return defines;
}

/** A .cwproj's DefineConstants, read again when its time or the configuration changes. */
const cwprojCache = new Map<string, { mtimeMs: number; configuration: string; defines: Record<string, string> }>();
function cwprojDefines(cwproj: string, mtimeMs: number | undefined): Record<string, string> {
    if (mtimeMs === undefined) return {};
    const configuration = serverSettings.configuration.toLowerCase();
    const cached = cwprojCache.get(cwproj.toLowerCase());
    if (cached && cached.mtimeMs === mtimeMs && cached.configuration === configuration) return cached.defines;
    let defines: Record<string, string> = {};
    try { defines = parseDefineConstants(fs.readFileSync(cwproj, 'utf8'), configuration); } catch { /* unreadable: none */ }
    cwprojCache.set(cwproj.toLowerCase(), { mtimeMs, configuration, defines });
    return defines;
}

/** Each project's sources by full path, in lower case; rebuilt when its source list is replaced. */
const ownedCache = new WeakMap<object, Set<string>>();
function owns(project: ProjectLike, file: string): boolean {
    let owned = ownedCache.get(project.sourceFiles);
    if (!owned) {
        owned = new Set(project.sourceFiles.map(f => path.resolve(project.path, f.relativePath).toLowerCase()));
        ownedCache.set(project.sourceFiles, owned);
    }
    return owned.has(file);
}

export interface ProjectSwitches {
    /** A switch's value from the projects that compile the file, when they all define it alike. */
    value: (name: string) => number | undefined;
    /** What the answer depends on, as file → modification time; #812's own keys start with \0. */
    deps: Map<string, number>;
}

export function projectSwitches(filePath: string | null): ProjectSwitches {
    const deps = new Map<string, number>();
    const none: ProjectSwitches = { value: () => undefined, deps };
    if (!filePath) return none;
    const projects = loadedProjects();
    if (!projects) {
        deps.set(NO_SOLUTION, 0);
        return none;
    }
    const file = path.resolve(filePath).toLowerCase();
    const owners = projects.filter(p => owns(p, file));
    if (owners.length === 0) return none;

    deps.set(CONFIG_PREFIX + serverSettings.configuration.toLowerCase(), 0);
    const baseName = path.win32.basename(file);
    const switches = owners.map(project => {
        const cwproj = path.join(project.path, project.filename ?? `${project.name}.cwproj`);
        const mtimeMs = mtimeOf(cwproj);
        deps.set(cwproj, mtimeMs ?? -1);
        const merged: Record<string, string> = { ...cwprojDefines(cwproj, mtimeMs) };
        for (const legacy of project.legacyProjects ?? []) {
            for (const watched of legacy.watch) deps.set(watched, mtimeOf(watched) ?? -1);
            Object.assign(merged, legacy.defines, legacy.fileDefines?.[baseName] ?? {});
        }
        return merged;
    });
    return {
        value: name => {
            const key = name.toLowerCase();
            let agreed: number | undefined;
            for (const merged of switches) {
                const v = merged[key] === undefined ? undefined : switchValue(merged[key]);
                if (v === undefined || (agreed !== undefined && v !== agreed)) return undefined;
                agreed = v;
            }
            return agreed;
        },
        deps,
    };
}
