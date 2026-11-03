import * as fs from 'fs';
import * as path from 'path';
import { serverSettings } from '../serverSettings';
import { switchValue } from '../utils/ConditionalCompile';

/**
 * #812 — a COMPILE/OMIT switch can be a project define (the help's Conditional Switch). For a file
 * a project compiles, its switches are, last one winning: the .cwproj's DefineConstants for the
 * active configuration, the #pragma defines of the .prj files it includes, and the file's own
 * defines: those on its Compile item in the .cwproj (#816), then its /define on its #compile line
 * in a .prj.
 *
 * Only for a file a project compiles (one of its sources, by full path), and only where every
 * project that compiles it agrees: a header many projects include is decided per includer by the
 * compiler, and one answer cached per file cannot be right for all of them.
 *
 * What an answer depends on is handed back with it, as #807's dependencies: the .cwproj and .prj
 * files with their modification times, the configuration, which projects compile the file, and,
 * when no solution was loaded yet, that there still is none (so it is decided again once one is).
 */

/** A dependency on the active configuration: unchanged while it is the one named after the prefix. */
const CONFIG_PREFIX = '\0configuration:';
/** A dependency on which projects compile a file: `\0owners:<file>\n<their .cwproj files>`. */
const OWNERS_PREFIX = '\0owners:';
/** A dependency on there being no solution loaded: unchanged while there still is none. */
const NO_SOLUTION = '\0no-solution';

const mtimeOf = (file: string): number | undefined => { try { return fs.statSync(file).mtimeMs; } catch { return undefined; } };

/** The configuration's name and platform, in lower case: the setting is stored as the .sln writes it, `Debug|Win32`. */
function configurationParts(configuration: string): { name: string; platform?: string } {
    const [name, platform] = configuration.split('|').map(s => s.trim().toLowerCase());
    return { name, platform: platform || undefined };
}
const activeConfiguration = () => configurationParts(serverSettings.configuration).name;

interface ProjectLike {
    path: string;
    filename?: string;
    name: string;
    sourceFiles: { relativePath: string }[];
    legacyProjects?: { defines: Record<string, string>; fileDefines?: Record<string, Record<string, string>>; watch: string[] }[];
}

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

const cwprojOf = (project: ProjectLike) => path.join(project.path, project.filename ?? `${project.name}.cwproj`);

/** Each project's sources by full path, in lower case; rebuilt when its list is replaced or changes length. */
const ownedCache = new WeakMap<object, { length: number; files: Set<string> }>();
function owns(project: ProjectLike, file: string): boolean {
    let owned = ownedCache.get(project.sourceFiles);
    if (!owned || owned.length !== project.sourceFiles.length) {
        owned = { length: project.sourceFiles.length, files: new Set(project.sourceFiles.map(f => path.resolve(project.path, f.relativePath).toLowerCase())) };
        ownedCache.set(project.sourceFiles, owned);
    }
    return owned.files.has(file);
}
const ownersOf = (projects: ProjectLike[], file: string) => projects.filter(p => owns(p, file));
const ownersKey = (file: string, owners: ProjectLike[]) =>
    OWNERS_PREFIX + file + '\n' + owners.map(p => cwprojOf(p).toLowerCase()).sort().join('|');

/** Whether a dependency key is one of #812's own (the others are file paths, checked by time). */
export function isProjectDependency(key: string): boolean {
    return key.startsWith('\0');
}
export function projectDependencyHolds(key: string): boolean {
    if (key === NO_SOLUTION) return loadedProjects() === undefined;
    if (key.startsWith(CONFIG_PREFIX)) return key.slice(CONFIG_PREFIX.length) === activeConfiguration();
    if (key.startsWith(OWNERS_PREFIX)) {
        const file = key.slice(OWNERS_PREFIX.length, key.indexOf('\n'));
        const projects = loadedProjects();
        return !!projects && ownersKey(file, ownersOf(projects, file)) === key;
    }
    return false;
}

const decodeEntities = (s: string) => s
    .replace(/&gt;/gi, '>').replace(/&lt;/gi, '<').replace(/&quot;/gi, '"').replace(/&apos;/gi, "'").replace(/&amp;/gi, '&')
    .replace(/%([0-9a-f]{2})/gi, (_m, hex: string) => String.fromCharCode(parseInt(hex, 16)));

/** Whether a PropertyGroup's Condition applies to the configuration (and platform, when both name one). */
function conditionApplies(condition: string, wanted: { name: string; platform?: string }): boolean {
    if (!/\$\(Configuration\)/i.test(condition)) return true;
    const m = /(==|!=)\s*'([^']*)'/.exec(condition);
    if (!m) return true;
    const named = configurationParts(m[2]);
    const same = named.name === wanted.name && (!named.platform || !wanted.platform || named.platform === wanted.platform);
    return m[1] === '==' ? same : !same;
}

/**
 * The DefineConstants of a .cwproj (`name=>value;...`, written with &gt; and %3b) in the groups that
 * apply to `configuration` (`Debug` or `Debug|Win32`): those with no Condition on the configuration,
 * and those naming it with == or not with !=. As MSBuild sets a property, a later group replaces
 * the list unless it names $(DefineConstants). Names in lower case. An approximation of MSBuild's
 * conditions: only the configuration and platform comparison is read.
 */
export function parseDefineConstants(cwprojText: string, configuration: string): Record<string, string> {
    let defines: Record<string, string> = {};
    const wanted = configurationParts(configuration);
    const text = cwprojText.replace(/<!--[\s\S]*?-->/g, '');
    for (const group of text.matchAll(/<PropertyGroup\b([^>]*?)(?:\/>|>([\s\S]*?)<\/PropertyGroup\s*>)/gi)) {
        const body = group[2];
        if (!body) continue;
        const condition = /\bCondition\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(group[1]);
        if (condition && !conditionApplies(condition[1] ?? condition[2], wanted)) continue;
        for (const constants of body.matchAll(/<DefineConstants>([\s\S]*?)<\/DefineConstants\s*>/gi)) {
            const value = decodeEntities(constants[1]);
            if (!/\$\(DefineConstants\)/i.test(value)) defines = {};
            readDefineEntries(value, defines);
        }
    }
    return defines;
}

/**
 * The entries of a define list into `into`, as the build task reads DefineConstants and a source's
 * `defines` alike (CW.AddPragmas): split on ';', each on '=>' only; a bare name is on, so `A=1` is
 * no define of A. Names in lower case.
 */
function readDefineEntries(value: string, into: Record<string, string>): void {
    for (const entry of value.split(';')) {
        const parts = entry.split('=>').map(p => p.trim()).filter(p => p !== '');
        if (parts.length < 1 || parts.length > 2 || !/^[A-Za-z_][\w:]*$/.test(parts[0])) continue;
        into[parts[0].toLowerCase()] = parts[1] ?? 'on';
    }
}

/**
 * #816 — a source's own defines in a .cwproj: the `defines` metadata of its Compile item, which the
 * IDE writes (`<Compile Include="x.clw"><defines>name=&gt;value;...</defines></Compile>`) and the
 * build task reads as that file's #pragma define, a bare name meaning on. Keyed by the Include as
 * written, in lower case; names in lower case. Items are not per configuration.
 */
export function parseCompileDefines(cwprojText: string): Record<string, Record<string, string>> {
    const result: Record<string, Record<string, string>> = {};
    const text = cwprojText.replace(/<!--[\s\S]*?-->/g, '');
    for (const item of text.matchAll(/<Compile\b([^>]*?)(?:\/>|>([\s\S]*?)<\/Compile\s*>)/gi)) {
        const body = item[2];
        const include = /\bInclude\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(item[1]);
        if (!body || !include) continue;
        const own: Record<string, string> = {};
        // CW.AddSources switches on the metadata name as written: `Defines` is not read.
        for (const meta of body.matchAll(/<defines\s*>([\s\S]*?)<\/defines\s*>/g)) {
            readDefineEntries(decodeEntities(meta[1]), own);
        }
        if (Object.keys(own).length) result[decodeEntities(include[1] ?? include[2]).toLowerCase()] = own;
    }
    return result;
}

/** A .cwproj's DefineConstants and its sources' own defines, read again when its time or the configuration changes. */
interface CwprojDefines { defines: Record<string, string>; fileDefines: Record<string, Record<string, string>> }
const cwprojCache = new Map<string, { mtimeMs: number; configuration: string; read: CwprojDefines }>();
function cwprojDefines(cwproj: string, mtimeMs: number | undefined): CwprojDefines {
    if (mtimeMs === undefined) return { defines: {}, fileDefines: {} };
    const configuration = serverSettings.configuration.toLowerCase();
    const cached = cwprojCache.get(cwproj.toLowerCase());
    if (cached && cached.mtimeMs === mtimeMs && cached.configuration === configuration) return cached.read;
    let read: CwprojDefines = { defines: {}, fileDefines: {} };
    try {
        const text = fs.readFileSync(cwproj, 'utf8');
        // Keyed by full path, so `sub\x.clw` and `x.clw` in two folders stay apart.
        const fileDefines: Record<string, Record<string, string>> = {};
        for (const [include, own] of Object.entries(parseCompileDefines(text))) {
            fileDefines[path.resolve(path.dirname(cwproj), include.replace(/\\/g, path.sep)).toLowerCase()] = own;
        }
        read = { defines: parseDefineConstants(text, configuration), fileDefines };
    } catch { /* unreadable: none */ }
    cwprojCache.set(cwproj.toLowerCase(), { mtimeMs, configuration, read });
    return read;
}

export interface ProjectSwitches {
    /** A switch's value from the projects that compile the file, when they all define it alike. */
    value: (name: string) => number | undefined;
    /** What the answer depends on, as file → modification time; #812's own keys start with \0. */
    deps: Map<string, number>;
}

/**
 * The project switches of a file, worked out when first asked (most conditions are decided by an
 * EQUATE and never ask). Only a .clw can be a project's source, so only a .clw depends on which
 * projects compile it: a header's answer with no dependencies keeps being persisted.
 */
export function projectSwitches(filePath: string | null): ProjectSwitches {
    const deps = new Map<string, number>();
    let switches: Record<string, string>[] | undefined;
    const load = (): Record<string, string>[] => {
        if (switches) return switches;
        switches = [];
        if (!filePath) return switches;
        const projects = loadedProjects();
        if (!projects) {
            deps.set(NO_SOLUTION, 0);
            return switches;
        }
        const file = path.resolve(filePath).toLowerCase();
        const owners = ownersOf(projects, file);
        if (owners.length === 0 && !/\.clw$/i.test(file)) return switches;
        deps.set(ownersKey(file, owners), 0);
        if (owners.length === 0) return switches;
        deps.set(CONFIG_PREFIX + activeConfiguration(), 0);
        const baseName = path.win32.basename(file);
        switches = owners.map(project => {
            const cwproj = cwprojOf(project);
            const mtimeMs = mtimeOf(cwproj);
            deps.set(cwproj, mtimeMs ?? -1);
            const read = cwprojDefines(cwproj, mtimeMs);
            const merged: Record<string, string> = { ...read.defines };
            // #816: its own defines on its Compile item, then any /define on a .prj's #compile line.
            const own: Record<string, string> = { ...(read.fileDefines[file] ?? {}) };
            for (const legacy of project.legacyProjects ?? []) {
                for (const watched of legacy.watch) deps.set(watched, mtimeOf(watched) ?? -1);
                Object.assign(merged, legacy.defines);
                Object.assign(own, legacy.fileDefines?.[baseName] ?? {});
            }
            // The file's own /define comes after every .prj's #pragma define.
            return Object.assign(merged, own);
        });
        return switches;
    };
    return {
        value: name => {
            const key = name.toLowerCase();
            let agreed: number | undefined;
            const all = load();
            if (all.length === 0) return undefined;
            for (const merged of all) {
                const v = merged[key] === undefined ? undefined : switchValue(merged[key]);
                if (v === undefined || (agreed !== undefined && v !== agreed)) return undefined;
                agreed = v;
            }
            return agreed;
        },
        deps,
    };
}
