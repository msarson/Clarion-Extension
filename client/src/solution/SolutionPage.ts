import * as path from 'path';
import { readProperty } from '../project/CwprojProperties';
import { configurationName, normalizeConfigurationTo } from '../utils/ConfigurationPrecedence';
import { describeNonDefaultConfigDir } from '../utils/ClarionConfigDir';

/**
 * #792 — the Solution page: what a solution builds with (the Clarion installation, its compiler
 * version, the configuration), its startup project and its projects. In `properties` mode it shows
 * the loaded solution and changes it in place; in `open` mode Open Solution shows it instead of a
 * run of quick picks, with what still has to be chosen marked, and opens once it is complete.
 * The webview only draws this. No vscode here.
 */

export interface InstallationOption {
    /** Its ClarionProperties.xml, which identifies it. */
    propertiesFile: string;
    ideVersion: string;
    /** The compiler versions it registers, by name. */
    compilers: string[];
}

/** A solution's selection, as far as it is known. */
export interface SolutionChoice {
    propertiesFile?: string;
    version?: string;
    /** The .sln's own entry (`Debug|Win32`), the form a solution load stores (#530, #674). */
    configuration?: string;
}

export interface SolutionPageProject {
    name: string;
    guid: string;
    /** The .cwproj's full path. */
    cwproj: string;
    kind: ProjectKind;
    /** Its OutputName, which names its export file; the project name when not set. */
    outputName?: string;
    references: string[];
    /** A DLL's export file: where redirection finds it, null when it does not, undefined until looked up. */
    exp?: string | null;
}

export type ProjectKind = 'EXE' | 'DLL' | 'LIB';

export interface SolutionPageInput {
    mode: 'open' | 'properties';
    solutionFile: string;
    installations: InstallationOption[];
    choice: SolutionChoice;
    /** The configurations the .sln declares. */
    configurations: string[];
    projects: SolutionPageProject[];
    startupGuid?: string;
    /** Why Open Solution is asking (open mode). */
    reason?: string;
    build?: { keepLog: boolean; lastLog?: string; runCommand: string };
    /** The file graph's line, once it is built (properties mode). */
    graph?: string;
    /** %APPDATA%, to tell an installation outside it (#479). */
    appData?: string;
}

export interface Option { value: string; label: string; }
export interface ChoiceField {
    value: string;
    options: Option[];
    needs: boolean;
    /** #479 — the folder of a ClarionProperties.xml outside %APPDATA% (a ConfigDir tree, #471). */
    configDir?: string;
}
export type Tone = 'good' | 'warn' | 'bad' | 'none';

export interface SolutionPageState {
    mode: 'open' | 'properties';
    title: string;
    solutionFile: string;
    reason?: string;
    installation: ChoiceField;
    version: ChoiceField;
    configuration: ChoiceField;
    startup: { value: string; options: Option[] };
    /** #800: location is the .cwproj's path from the solution's folder; the full path when outside it. */
    projects: { name: string; guid: string; cwproj: string; location: string; kind: ProjectKind; references: string; exp: { text: string; tone: Tone }; startup: boolean }[];
    build?: { log: string; keepLog: boolean; run: string };
    graph?: string;
    /** Everything is chosen, so the solution can open. */
    ready: boolean;
}

const samePath = (a: string, b: string) => a.replace(/\//g, '\\').toLowerCase() === b.replace(/\//g, '\\').toLowerCase();
const bareGuid = (g: string) => g.replace(/[{}]/g, '').toLowerCase();

/** The projects a .sln lists: Clarion projects only, not solution folders. */
export function projectsInSln(text: string): { name: string; path: string; guid: string }[] {
    const projects: { name: string; path: string; guid: string }[] = [];
    const re = /^Project\("\{[^}]*\}"\)\s*=\s*"([^"]*)",\s*"([^"]*)",\s*"(\{[^}]*\})"/gm;
    for (let m = re.exec(text); m; m = re.exec(text)) {
        if (/\.cwproj$/i.test(m[2])) projects.push({ name: m[1], path: m[2], guid: m[3] });
    }
    return projects;
}

/** What the page shows of a .cwproj: EXE, DLL or LIB by its OutputType, and the projects it references. */
export function projectSummary(text: string): { kind: ProjectKind; outputName: string; references: string[] } {
    const configuration = '';
    const outputType = readProperty(text, 'OutputType', configuration).value ?? '';
    const live = text.replace(/<!--[\s\S]*?-->/g, '');
    const references: string[] = [];
    const re = /<ProjectReference\b[^>]*\bInclude\s*=\s*"([^"]*)"[^>]*?(\/>|>([\s\S]*?)<\/ProjectReference>)/gi;
    for (let m = re.exec(live); m; m = re.exec(live)) {
        const name = /<Name>([^<]*)<\/Name>/i.exec(m[3] ?? '')?.[1].trim();
        references.push(name || path.win32.basename(m[1]).replace(/\.cwproj$/i, ''));
    }
    return {
        kind: /^library$/i.test(outputType) ? 'DLL' : /^lib$/i.test(outputType) ? 'LIB' : 'EXE',
        outputName: readProperty(text, 'OutputName', configuration).value ?? '',
        references,
    };
}

/**
 * The selection as far as it can be settled without asking: what was remembered, where it is still
 * offered, else the only option there is. `complete` when nothing is left to choose.
 */
export function settleChoice(installations: InstallationOption[], remembered: SolutionChoice, configurations: string[]):
    SolutionChoice & { complete: boolean } {
    const installation = installations.find(i => remembered.propertiesFile && samePath(i.propertiesFile, remembered.propertiesFile))
        ?? (installations.length === 1 ? installations[0] : undefined);
    const version = installation
        ? installation.compilers.find(c => c === remembered.version) ?? (installation.compilers.length === 1 ? installation.compilers[0] : undefined)
        : undefined;
    const configuration = normalizeConfigurationTo(remembered.configuration, configurations)
        ?? (configurations.length === 1 ? configurations[0] : undefined);
    return { propertiesFile: installation?.propertiesFile, version, configuration, complete: !!(installation && version && configuration) };
}

function expStatus(p: SolutionPageProject, solutionFolder: string, versionChosen: boolean): { text: string; tone: Tone } {
    if (p.kind !== 'DLL') return { text: `Not needed for ${p.kind === 'EXE' ? 'an EXE' : 'a LIB'}`, tone: 'none' };
    // Redirection depends on the compiler version: before one is chosen there is nothing to look for.
    if (p.exp === undefined) return { text: versionChosen ? 'Looking…' : 'Found once a compiler version is chosen', tone: 'none' };
    if (p.exp === null) return { text: 'Missing: generate the application in the Clarion IDE, or mark its exports with EXPORT', tone: 'bad' };
    const relative = path.win32.relative(solutionFolder, p.exp);
    return { text: `Found: ${relative && !relative.startsWith('..') ? relative : p.exp}`, tone: 'good' };
}

/** #800 — a project's path from the solution's folder; its full path when it is outside that folder or on another drive. */
function locationFrom(solutionFolder: string, cwproj: string): string {
    const relative = path.win32.relative(solutionFolder, cwproj);
    return relative && !relative.startsWith('..') && !path.win32.isAbsolute(relative) ? relative : cwproj;
}

export function buildSolutionPageState(input: SolutionPageInput): SolutionPageState {
    const settled = settleChoice(input.installations, input.choice, input.configurations);
    const installation = input.installations.find(i => settled.propertiesFile && samePath(i.propertiesFile, settled.propertiesFile));
    const startupGuid = input.startupGuid ? bareGuid(input.startupGuid) : '';
    const folder = path.win32.dirname(input.solutionFile);
    const state: SolutionPageState = {
        mode: input.mode,
        title: path.win32.basename(input.solutionFile).replace(/\.sln$/i, ''),
        solutionFile: input.solutionFile,
        reason: input.reason,
        installation: {
            value: installation?.propertiesFile ?? '',
            options: input.installations.map(i => ({ value: i.propertiesFile, label: `Clarion ${i.ideVersion}` })),
            needs: !installation,
            configDir: (installation && describeNonDefaultConfigDir(installation.propertiesFile, input.appData)) || undefined,
        },
        version: {
            value: settled.version ?? '',
            options: (installation?.compilers ?? []).map(c => ({ value: c, label: c })),
            needs: !settled.version,
        },
        configuration: {
            value: settled.configuration ?? '',
            // One per name: a configuration is chosen by name (normalizeConfigurationTo), so a second entry
            // for another platform could never be picked.
            options: input.configurations
                .filter((c, i, all) => all.findIndex(x => configurationName(x).toLowerCase() === configurationName(c).toLowerCase()) === i)
                .map(c => ({ value: c, label: configurationName(c) })),
            needs: !settled.configuration,
        },
        startup: {
            value: startupGuid,
            options: input.projects.filter(p => p.kind === 'EXE').map(p => ({ value: bareGuid(p.guid), label: p.name })),
        },
        projects: input.projects.map(p => ({
            name: p.name,
            guid: p.guid,
            cwproj: p.cwproj,
            location: locationFrom(folder, p.cwproj),
            kind: p.kind,
            references: p.references.length ? p.references.join(', ') : '—',
            exp: expStatus(p, folder, !!settled.version),
            startup: !!startupGuid && bareGuid(p.guid) === startupGuid,
        })),
        graph: input.graph,
        ready: input.mode === 'properties' || settled.complete,
    };
    if (input.build) {
        state.build = {
            keepLog: input.build.keepLog,
            log: !input.build.keepLog ? 'Not kept' : input.build.lastLog ? `Kept: ${path.win32.basename(input.build.lastLog)}` : 'Kept',
            run: input.build.runCommand.trim() ? input.build.runCommand : 'The startup project\'s program',
        };
    }
    return state;
}

/** A program's main source file name: a .clw, without characters a file name cannot hold. */
export function mainFileError(file: string): string | undefined {
    if (!file || file.trim().length === 0) return 'File name cannot be empty';
    if (!file.trim().toLowerCase().endsWith('.clw')) return 'File must have a .clw extension';
    // A slash or backslash would make it a path, written outside the folder.
    if (/[\\/:*?"<>|]/.test(file.trim())) return 'File name contains invalid characters';
    return undefined;
}

/** #795 — why a new project cannot be added as named; undefined when it can. */
/** #796 — a new project's folder as the .sln names it: below the solution's folder, backslashed; '' beside the .sln. */
export function projectFolder(folder: string): string {
    return folder.trim().split(/[\\/]+/).filter(s => s.length > 0).join('\\');
}

/** #796 — why a new project cannot go in this folder; undefined when it can. */
export function projectFolderError(folder: string): string | undefined {
    const trimmed = folder.trim();
    if (trimmed.length === 0) return undefined;
    // A drive, a root or a UNC path is not below the solution's folder.
    if (/^[\\/]/.test(trimmed) || /^[a-z]:/i.test(trimmed)) return 'The folder must be a path below the solution\'s folder';
    const segments = trimmed.split(/[\\/]+/).filter(s => s.length > 0);
    if (segments.some(s => s === '.' || s === '..')) return 'The folder must be a path below the solution\'s folder';
    // Windows drops a trailing dot or space, so the folder made would not be the one named; it refuses a
    // control character only after making the folders above it, which the add could not then remove.
    // eslint-disable-next-line no-control-regex
    if (segments.some(s => /[:*?"<>|\x00-\x1f]/.test(s) || /[. ]$/.test(s))) return 'Folder name contains invalid characters';
    if (segments.some(s => /^(con|prn|aux|nul|com\d|lpt\d)(\..*)?$/i.test(s))) return 'Folder name is reserved by Windows';
    return undefined;
}

/**
 * #796 — a project reads the .red in its own folder, then the one in bin (checked with Clarion 10
 * MSBuild; the language server looks in the same order). One beside the .sln is not read for a
 * project in a sub-folder, so the add says so. A full-path .red name is read from that path for
 * every project (#765), so nothing changes then.
 */
export function subfolderRedNote(solutionFolder: string, folder: string, redirectionFile: string, exists: (file: string) => boolean): string | undefined {
    if (!folder || !redirectionFile || path.win32.isAbsolute(redirectionFile)) return undefined;
    if (!exists(path.win32.join(solutionFolder, redirectionFile))) return undefined;
    return `The ${redirectionFile} beside the solution does not apply to ${folder}: a project reads the .red in its own folder, else the one in bin.`;
}

export function newProjectError(name: string, mainFile: string, projects: { name: string }[], folder = ''): string | undefined {
    if (!name || name.trim().length === 0) return 'Project name cannot be empty';
    // A path would write outside the folder; an apostrophe would end the name in a DLL's .exp.
    if (/[\\/:*?"<>|']/.test(name)) return 'Project name contains invalid characters';
    if (projects.some(p => p.name.toLowerCase() === name.trim().toLowerCase())) return `The solution already has a project called ${name.trim()}`;
    return projectFolderError(folder) ?? mainFileError(mainFile);
}
