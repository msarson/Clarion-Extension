import { projectsInSln } from './SolutionPage';

/**
 * #795 — adding a project to a .sln as the Clarion IDE would: a Project block after the others,
 * and for every configuration the solution declares the entries that build the project. Every
 * other line is left as it is (BOM, line endings, the IDE's own sections). No vscode here.
 */

/** The project-type GUID the Clarion IDE writes for a .cwproj. */
export const CLARION_PROJECT_TYPE = '{12B76EC0-1D7B-4FA7-A7D0-C524288B48A1}';

export interface SlnProjectEntry {
    name: string;
    /** The .cwproj, relative to the .sln's folder. */
    path: string;
    guid: string;
}

const samePath = (a: string, b: string) => a.replace(/\//g, '\\').toLowerCase() === b.replace(/\//g, '\\').toLowerCase();

/** A section's lines between `GlobalSection(name)` and its `EndGlobalSection`; undefined when absent. */
function section(text: string, name: string): { start: number; bodyStart: number; end: number } | undefined {
    const m = new RegExp(`^[ \\t]*GlobalSection\\(${name}\\)[^\\r\\n]*\\r?\\n`, 'm').exec(text);
    if (!m) return undefined;
    const bodyStart = m.index + m[0].length;
    const close = /^[ \t]*EndGlobalSection[ \t]*$/m.exec(text.slice(bodyStart));
    if (!close) return undefined;
    return { start: m.index, bodyStart, end: bodyStart + close.index };
}

/** The configurations the solution declares (`Debug|Win32`), Debug and Release when it declares none. */
function solutionConfigurations(text: string): string[] {
    const s = section(text, 'SolutionConfigurationPlatforms');
    const names = s ? text.slice(s.bodyStart, s.end).split(/\r?\n/).map(l => l.split('=')[0].trim()).filter(Boolean) : [];
    return names.length ? names : ['Debug|Win32', 'Release|Win32'];
}

/** The offset just past the line holding `index`. */
function lineEnd(text: string, index: number): number {
    const nl = text.indexOf('\n', index);
    return nl < 0 ? text.length : nl + 1;
}

export function addProjectToSln(text: string, project: SlnProjectEntry): string {
    const eol = text.includes('\r\n') ? '\r\n' : '\n';
    for (const p of projectsInSln(text)) {
        if (p.guid.toLowerCase() === project.guid.toLowerCase()) throw new Error(`The solution already has a project with the GUID ${project.guid} (${p.name}).`);
        if (samePath(p.path, project.path)) throw new Error(`The solution already has ${project.path}.`);
    }
    const global = /^Global[ \t]*$/m.exec(text);
    if (!global) throw new Error('This is not a solution file: it has no Global section.');

    // The configuration entries, then the Project block: inserting the later text first keeps the earlier offsets.
    const entries = solutionConfigurations(text)
        .flatMap(c => [`\t\t${project.guid}.${c}.Build.0 = ${c}`, `\t\t${project.guid}.${c}.ActiveCfg = ${c}`])
        .map(l => l + eol).join('');
    const platforms = section(text, 'ProjectConfigurationPlatforms');
    if (platforms) {
        text = text.slice(0, platforms.end) + entries + text.slice(platforms.end);
    } else {
        const solutionConfigs = section(text, 'SolutionConfigurationPlatforms');
        const at = solutionConfigs ? lineEnd(text, solutionConfigs.end) : lineEnd(text, global.index);
        text = text.slice(0, at) + `\tGlobalSection(ProjectConfigurationPlatforms) = postSolution${eol}${entries}\tEndGlobalSection${eol}` + text.slice(at);
    }

    const block = `Project("${CLARION_PROJECT_TYPE}") = "${project.name}", "${project.path}", "${project.guid}"${eol}EndProject${eol}`;
    const ends = [...text.slice(0, global.index).matchAll(/^EndProject[ \t]*$/gm)];
    const at = ends.length ? lineEnd(text, ends[ends.length - 1].index!) : global.index;
    return text.slice(0, at) + block + text.slice(at);
}

/** An existing .cwproj's own GUID, as the .sln must name it; undefined when it has none. */
export function projectGuidOf(cwproj: string): string | undefined {
    return /<ProjectGuid>\s*(\{[0-9A-Fa-f-]+\})\s*<\/ProjectGuid>/.exec(cwproj.replace(/<!--[\s\S]*?-->/g, ''))?.[1];
}
