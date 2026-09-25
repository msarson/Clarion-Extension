/**
 * #666 — which project Run Without Debugging (Ctrl+F5) and Debug (F5) start.
 * vscode-API-free so it can be tested without the editor; the caller supplies the lookup of the
 * projects a file belongs to (a server round trip per project, so it is only made when needed).
 */
export interface RunProjectInfo {
    guid: string;
    name: string;
}

export type RunTarget<P extends RunProjectInfo> =
    | { kind: 'project'; project: P; source: 'startup' | 'only' | 'file' }
    | { kind: 'pick'; projects: P[] }
    | { kind: 'error'; message: string };

export async function chooseRunProject<P extends RunProjectInfo>(options: {
    projects: P[];
    startupGuid: string | undefined;
    activeFile: string | undefined;
    projectsContaining: (file: string) => Promise<P[]>;
}): Promise<RunTarget<P>> {
    const { projects, startupGuid, activeFile } = options;
    if (projects.length === 0) {
        return { kind: 'error', message: 'The solution has no projects to run.' };
    }

    // 1. The startup project. A setting that names a project the solution no longer has is
    // reported rather than guessed around: the user chose it.
    if (startupGuid) {
        const found = projects.find(p => sameGuid(p.guid, startupGuid));
        return found
            ? { kind: 'project', project: found, source: 'startup' }
            : { kind: 'error', message: 'Configured startup project not found. Please set a valid startup project.' };
    }

    // 2. The only project.
    if (projects.length === 1) {
        return { kind: 'project', project: projects[0], source: 'only' };
    }

    // 3. The open file's project; several, a choice among them.
    if (activeFile) {
        const containing = await options.projectsContaining(activeFile);
        if (containing.length === 1) return { kind: 'project', project: containing[0], source: 'file' };
        if (containing.length > 1) return { kind: 'pick', projects: containing };
    }

    // 4. No file, or a file outside every project: a choice among them all.
    return { kind: 'pick', projects };
}

function sameGuid(a: string, b: string): boolean {
    const norm = (g: string) => g.replace(/[{}]/g, '').toLowerCase();
    return norm(a) === norm(b);
}
