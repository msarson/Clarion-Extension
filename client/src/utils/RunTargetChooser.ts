/**
 * #666 — which project Run Without Debugging (Ctrl+F5) and Debug (F5) start.
 * vscode-API-free so it can be tested without the editor; the caller supplies the lookup of the
 * projects a file belongs to (a server round trip per project, so it is only made when needed)
 * and whether a project can be started at all (a library with no StartProgram cannot).
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
    /** Builds a program (EXE), or a library whose project names a StartProgram to host it. */
    isRunnable: (project: P) => boolean;
}): Promise<RunTarget<P>> {
    const { projects, startupGuid, activeFile, isRunnable } = options;
    if (projects.length === 0) {
        return { kind: 'error', message: 'The solution has no projects to run.' };
    }

    // 1. The startup project. A setting that names a project the solution no longer has, or one
    // that has become a library, is reported rather than guessed around: the user chose it.
    if (startupGuid) {
        const found = projects.find(p => sameGuid(p.guid, startupGuid));
        if (!found) {
            return { kind: 'error', message: 'Configured startup project not found. Please set a valid startup project.' };
        }
        return isRunnable(found)
            ? { kind: 'project', project: found, source: 'startup' }
            : { kind: 'error', message: `The startup project "${found.name}" ${NOT_RUNNABLE}` };
    }

    // From here only projects that can be started count: a program, or a library that names the
    // program hosting it. A library alone has nothing to run.
    const runnable = projects.filter(isRunnable);
    if (runnable.length === 0) {
        return {
            kind: 'error',
            message: projects.length === 1
                ? `"${projects[0].name}" ${NOT_RUNNABLE}`
                : `No project in this solution can be run: each ${NOT_RUNNABLE}`,
        };
    }

    // 2. The only runnable project.
    if (runnable.length === 1) {
        return { kind: 'project', project: runnable[0], source: 'only' };
    }

    // 3. The open file's project, when it can be run; several, a choice among them.
    if (activeFile) {
        const containing = (await options.projectsContaining(activeFile)).filter(isRunnable);
        if (containing.length === 1) return { kind: 'project', project: containing[0], source: 'file' };
        if (containing.length > 1) return { kind: 'pick', projects: containing };
    }

    // 4. No file, or a file outside every runnable project: a choice among the runnable ones.
    return { kind: 'pick', projects: runnable };
}

const NOT_RUNNABLE = 'builds a library, not a program, and names no StartProgram to run it in, so there is nothing to start.';

function sameGuid(a: string, b: string): boolean {
    const norm = (g: string) => g.replace(/[{}]/g, '').toLowerCase();
    return norm(a) === norm(b);
}
