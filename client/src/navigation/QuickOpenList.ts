/**
 * #532 — the list behind "Clarion: Quick Open" (Ctrl+P while a solution is open),
 * built without the vscode API so it can be tested.
 *
 * From Mark's screenshots: his workspace excludes `**\/Archive`, yet our picker listed
 * `Archive\Restored Over\...\UI_3D_Placements.clw` and hid the real `Src\UI` copy,
 * while VS Code's own picker showed the Src\UI copy under its workspace folder. Three
 * causes in the old builder: it never read `files.exclude` / `search.exclude`; it
 * deduplicated by BASE NAME, so whichever folder was scanned first won and every other
 * same-named file vanished; and in a multi-root workspace it scanned only the
 * solution's folder.
 *
 * Rules now: the .cwproj items first; then every workspace root, honouring the
 * exclude globs and labelled `<root> • <folder>` like VS Code; then the redirection
 * paths outside the roots. Deduplicated by full path only.
 */
import * as path from 'path';
import { minimatch } from 'minimatch';

export interface QuickOpenItem {
    label: string;
    description: string;
    path: string;
}

export interface DirEntry { name: string; isDirectory: boolean; }

export interface QuickOpenSources {
    /** Files the .cwproj files list, with the project name for the description. */
    projectFiles: { name: string; fullPath: string; project: string }[];
    /** Every workspace root, in workspace order. */
    roots: { name: string; path: string }[];
    /** Redirection search paths from the server; those outside every root are scanned too. */
    redirectionPaths: string[];
    /** Lower-case extensions to list, with the dot. */
    allowedExtensions: string[];
    /** `files.exclude` + `search.exclude` patterns that are on, per root path (lower-case key). */
    excludeGlobs: Map<string, string[]>;
    /** Directory reader, injected so tests can supply an in-memory tree. */
    readDir: (dir: string) => DirEntry[];
}

const ALWAYS_SKIP = new Set(['node_modules', '.git', 'bin', 'obj']);

const norm = (p: string) => path.normalize(p).replace(/[\\/]+$/, '').toLowerCase();

/** True when `relPath` (forward slashes, relative to its root) or any ancestor folder matches a glob. */
export function isExcluded(relPath: string, globs: string[]): boolean {
    if (globs.length === 0) return false;
    const rel = relPath.replace(/\\/g, '/');
    const candidates: string[] = [rel];
    const parts = rel.split('/');
    for (let i = 1; i < parts.length; i++) candidates.push(parts.slice(0, i).join('/'));
    for (const glob of globs) {
        const g = glob.replace(/\\/g, '/');
        for (const c of candidates) {
            if (minimatch(c, g, { dot: true, nocase: true })) return true;
        }
    }
    return false;
}

/** Recursive listing under `base`, pruning excluded and always-skipped folders. */
export function walk(
    base: string,
    readDir: (dir: string) => DirEntry[],
    globs: string[],
    out: string[] = [],
    rel = ''
): string[] {
    let entries: DirEntry[];
    try { entries = readDir(base); } catch { return out; }
    for (const e of entries) {
        const childRel = rel ? `${rel}/${e.name}` : e.name;
        if (e.isDirectory) {
            if (ALWAYS_SKIP.has(e.name)) continue;
            if (isExcluded(childRel, globs)) continue;
            walk(path.join(base, e.name), readDir, globs, out, childRel);
        } else if (!isExcluded(childRel, globs)) {
            out.push(path.join(base, e.name));
        }
    }
    return out;
}

export function getIconForFile(fileExt: string): string {
    const ext = path.extname(fileExt).toLowerCase();
    switch (ext) {
        case '.clw': return '$(file-code)';
        case '.inc': return '$(file-submodule)';
        case '.equ':
        case '.eq': return '$(symbol-constant)';
        case '.int': return '$(symbol-interface)';
        default: return '$(file)';
    }
}

export function buildQuickOpenItems(src: QuickOpenSources): QuickOpenItem[] {
    const allowed = new Set(src.allowedExtensions.map(e => e.toLowerCase()));
    const seen = new Set<string>();
    const items: QuickOpenItem[] = [];
    const add = (fullPath: string, description: string): void => {
        const key = norm(fullPath);
        if (seen.has(key)) return;
        seen.add(key);
        items.push({ label: `${getIconForFile(fullPath)} ${path.basename(fullPath)}`, description, path: fullPath });
    };

    // 1. The .cwproj items, always, whatever the excludes say (they are the project).
    for (const f of src.projectFiles) add(f.fullPath, f.project);

    // 2. Every workspace root, honouring its exclude globs, labelled like VS Code.
    const rootOf = (p: string) => src.roots.find(r => norm(p).startsWith(norm(r.path) + path.sep) || norm(p) === norm(r.path));
    for (const root of src.roots) {
        const globs = src.excludeGlobs.get(norm(root.path)) ?? [];
        for (const file of walk(root.path, src.readDir, globs)) {
            if (!allowed.has(path.extname(file).toLowerCase())) continue;
            const relDir = path.relative(root.path, path.dirname(file));
            add(file, relDir ? `${root.name} • ${relDir}` : root.name);
        }
    }

    // 3. Redirection paths outside the roots (inside ones were covered above).
    for (const searchPath of [...new Set(src.redirectionPaths)]) {
        if (/^[A-Za-z]:[\\/]?$/.test(searchPath)) continue;      // never a whole drive
        if (rootOf(searchPath)) continue;
        for (const file of walk(searchPath, src.readDir, [])) {
            if (!allowed.has(path.extname(file).toLowerCase())) continue;
            add(file, `Redirection: ${path.relative(searchPath, path.dirname(file)) || '.'}`);
        }
    }

    return items;
}
