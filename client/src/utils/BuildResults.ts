/**
 * #670 — the extension's build results (Problems from its build, and a build outcome in the status
 * bar) and when to clear them. vscode-API-free so it can be tested without the editor: the caller
 * registers its diagnostic collections and supplies the status-bar hide.
 */

/** The part of a DiagnosticCollection this needs. */
export interface Clearable {
    clear(): void;
}

/** What a started task looks like, for the clear-on-start decision. */
export interface StartedTask {
    name: string;
    source: string;
    /** The task group's id when it has one ('build', 'test', ...). */
    groupId?: string;
}

/** The extension's own build task, created in buildTasks.createBuildTask. */
export const OWN_BUILD_TASK = { name: 'Clarion Build', source: 'msbuild' };

/** Clear our build results when this task starts: a build-group task that is not our own. */
export function shouldClearForTask(task: StartedTask): boolean {
    if (task.groupId !== 'build') return false;
    return !(task.name === OWN_BUILD_TASK.name && task.source === OWN_BUILD_TASK.source);
}

export class BuildResults {
    private readonly collections = new Set<Clearable>();

    constructor(private readonly hideBuildStatus: () => void) {}

    /** Every diagnostic collection a build writes to. */
    register<T extends Clearable>(collection: T): T {
        this.collections.add(collection);
        return collection;
    }

    /** Empty every build diagnostic collection and hide a build outcome in the status bar. */
    clear(): void {
        for (const c of this.collections) c.clear();
        this.hideBuildStatus();
    }
}
