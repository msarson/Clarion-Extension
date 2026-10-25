import * as path from 'path';
import { addItem, includeFor, ItemKind, listItems } from '../project/CwprojItems';

/**
 * #803 — a project in the Solution View as the Clarion IDE's Solution Explorer shows it: four
 * folders, always there, empty or not, then the sources. Each lists the .cwproj's items of its
 * kind; "Projects to include" are `<Include>` items, legacy TopSpeed projects pulled into the
 * build. No vscode here.
 */
export interface ProjectFolderEntry {
    label: string;
    /** The item's path as the .cwproj holds it, when it says more than the label. */
    description?: string;
    include: string;
}

export interface ProjectFolder {
    section: 'fileDrivers' | 'libraries' | 'includes' | 'projectReferences';
    label: string;
    kind: ItemKind;
    entries: ProjectFolderEntry[];
}

/** The IDE's folders, in its order and words. */
export const PROJECT_FOLDERS: Omit<ProjectFolder, 'entries'>[] = [
    { section: 'fileDrivers', label: 'File Drivers', kind: 'FileDriver' },
    { section: 'libraries', label: 'Libraries, Objects and Resource Files', kind: 'Library' },
    { section: 'includes', label: 'Projects to include', kind: 'Include' },
    { section: 'projectReferences', label: 'Referenced Projects', kind: 'ProjectReference' },
];

/** A file-like item: its name, and its path beside it when that is more than the name. */
function fileEntry(include: string): ProjectFolderEntry {
    const label = path.win32.basename(include);
    return label === include ? { label, include } : { label, description: include, include };
}

/** The folders of the project whose .cwproj this is. */
export function projectFolders(cwprojText: string): ProjectFolder[] {
    const items = listItems(cwprojText);
    const entries: Record<ProjectFolder['section'], ProjectFolderEntry[]> = {
        fileDrivers: items.fileDrivers.map(i => ({ label: i.include, include: i.include })),
        libraries: items.libraries.map(i => fileEntry(i.include)),
        includes: items.includes.map(i => fileEntry(i.include)),
        // A reference by its Name; with none, named from its path as the .sln names it (#802).
        projectReferences: items.projectReferences.map(i => ({
            label: i.name || path.win32.basename(i.include).replace(/\.cwproj$/i, ''),
            description: i.include,
            include: i.include,
        })),
    };
    // An item a hand-edited .cwproj lists twice is shown once: two tree items must not share an id.
    const once = (list: ProjectFolderEntry[]) => list.filter((e, i) => list.findIndex(x => x.include.toLowerCase() === e.include.toLowerCase()) === i);
    return PROJECT_FOLDERS.map(f => ({ ...f, entries: once(entries[f.section]) }));
}

/**
 * A project node of the Solution View, by its data: `kind: 'project'`, or the older form, the
 * project info alone (a GUID and a .cwproj). Not by `type`: a project's info carries the .sln's
 * project-type GUID there, so a node with a `type` may still be a project.
 */
export function isProjectNodeData(data: unknown): boolean {
    if (!data || typeof data !== 'object') return false;
    const d = data as { kind?: unknown; guid?: unknown; filename?: unknown };
    return d.kind === 'project' || (typeof d.guid === 'string' && typeof d.filename === 'string' && /\.cwproj$/i.test(d.filename));
}

/** Add on a folder: each pick as an item of its kind; a reference with its `<Project>` GUID and `<Name>`, as the IDE writes it. */
export function folderAddition(text: string, kind: ItemKind, picks: { include: string; guid?: string; name?: string }[]): string {
    return picks.reduce((current, pick) => addItem(current, kind, pick.include,
        kind === 'ProjectReference' && pick.guid ? [['Project', pick.guid], ['Name', pick.name ?? pick.include]] : []), text);
}

const bareGuid = (guid: string) => guid.replace(/[{}]/g, '').toLowerCase();

/**
 * The solution's projects this one can still reference: not itself, and not one it already
 * references (by GUID), each by its path from this project's folder.
 */
export function referenceCandidates(
    cwprojText: string,
    cwprojPath: string,
    solution: { name: string; guid: string; cwproj: string }[]
): { name: string; guid: string; include: string }[] {
    const own = /<ProjectGuid>\s*([^<]+?)\s*<\/ProjectGuid>/i.exec(cwprojText)?.[1];
    const referenced = new Set(
        [...cwprojText.matchAll(/<ProjectReference\b[^>]*>[\s\S]*?<Project>\s*([^<]+?)\s*<\/Project>/gi)].map(m => bareGuid(m[1])));
    const folder = path.win32.dirname(cwprojPath);
    return solution
        .filter(p => p.cwproj.toLowerCase() !== cwprojPath.toLowerCase() && (!own || bareGuid(p.guid) !== bareGuid(own)))
        .filter(p => !referenced.has(bareGuid(p.guid)))
        .map(p => ({ name: p.name, guid: p.guid, include: includeFor(folder, p.cwproj) }));
}

/**
 * #810 — a project's sources as the Solution View lists them: its Compile items, by name and the
 * path the .cwproj holds. A project with none has none: an empty list is not a reason to ask the
 * server, whose parse is the one made when the solution loaded.
 */
export function projectSourceFiles(cwprojText: string): { name: string; relativePath: string }[] {
    const files: { name: string; relativePath: string }[] = [];
    const compileRe = /<Compile\s+Include\s*=\s*"([^"]+)"/gi;
    let m: RegExpExecArray | null;
    while ((m = compileRe.exec(cwprojText)) !== null) {
        files.push({ name: path.win32.basename(m[1]), relativePath: m[1] });
    }
    return files;
}

/**
 * #810 — the .cwproj text each project's source nodes were built from. The tree keeps those nodes
 * across redraws and refreshes (#296, #297), so a source added or removed (on the Project
 * Properties page, in the Clarion IDE, by hand) never showed until the solution was reloaded.
 * Keyed without case: Windows paths may arrive spelled either way.
 */
export class ProjectSourceStamps {
    private readonly texts = new Map<string, string>();

    record(cwproj: string, text: string): void {
        this.texts.set(cwproj.toLowerCase(), text);
    }

    /**
     * True when the file now holds other text than the sources shown were built from, or they were
     * never built from it (the server's list). A file that cannot be read keeps what is shown.
     */
    stale(cwproj: string, text: string | null): boolean {
        if (text === null) return false;
        return this.texts.get(cwproj.toLowerCase()) !== text;
    }
}

/** #810: the file is the .cwproj of one of the solution's projects. */
export function isSolutionProjectFile(file: string, projects: { path?: string; filename?: string }[]): boolean {
    if (!/\.cwproj$/i.test(file)) return false;
    const target = path.win32.normalize(file).toLowerCase();
    return projects.some(p => !!p?.path && !!p.filename && path.win32.normalize(path.win32.join(p.path, p.filename)).toLowerCase() === target);
}
