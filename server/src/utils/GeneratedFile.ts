import * as path from 'path';
import { SolutionManager } from '../solution/solutionManager';
import { serverSettings } from '../serverSettings';
import { onDiskSpelling } from './UriUtils';

/** #527 — structural project surface for the generated-file lookup. */
export interface ProjectLike {
    path: string;
    sourceFiles?: Array<{ relativePath?: string; generated?: boolean }>;
}

/** #527 — the project owning a path, by the solution's own lookup. */
export function projectOf(fsPath: string): ProjectLike | null {
    const sm = SolutionManager.getInstance();
    return (sm?.findProjectForFile?.(fsPath) as ProjectLike | undefined) ?? null;
}

/** #527 — true when the project's .cwproj marks this file `<Generated>true</Generated>`. */
export function isGeneratedIn(project: ProjectLike, fsPath: string): boolean {
    // fsPath may already be on-disk spelled (ReferencesProvider does that), and on-disk spelling
    // can rewrite an ancestor folder entirely — a short 8.3 alias such as a shortened %TEMP%
    // becomes its long name. Spell every side the same way, or one folder never compares equal.
    const norm = onDiskSpelling(path.normalize(fsPath)).toLowerCase();
    // #551 — the IDE flags EVERY <Compile> entry a template adds as Generated, including
    // third-party class sources it merely links (NYSTemplateHelper.CLW under
    // Accessory\libsrc\win). Generated means template OUTPUT: a file under a library
    // path is library source however the .cwproj flags it.
    for (const libDir of serverSettings.libsrcPaths ?? []) {
        if (libDir && norm.startsWith(onDiskSpelling(path.normalize(libDir)).toLowerCase().replace(/[\\/]+$/, '') + path.sep)) return false;
    }
    const base = onDiskSpelling(path.normalize(project.path));
    for (const sf of project.sourceFiles ?? []) {
        if (!sf?.relativePath) continue;
        const abs = path.isAbsolute(sf.relativePath) ? onDiskSpelling(path.normalize(sf.relativePath)) : path.join(base, sf.relativePath);
        if (path.normalize(abs).toLowerCase() === norm) return sf.generated === true;
    }
    return false;
}

/**
 * Template output (#527/#549/#551): a file its project's .cwproj marks Generated, outside the
 * library paths. Rename refuses to start there and attribute edit links (#731) are not offered:
 * the next generate rewrites the file.
 */
export function isGeneratedFile(fsPath: string): boolean {
    const project = projectOf(fsPath);
    return !!project && isGeneratedIn(project, fsPath);
}
