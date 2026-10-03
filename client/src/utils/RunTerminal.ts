import * as path from 'path';

/**
 * #676 — the terminal Run Without Debugging opens and the line it sends. The line uses PowerShell's
 * `&` call operator (so arguments such as /debug are not misparsed), so the terminal must be a
 * PowerShell terminal whatever the user's default profile is. vscode-free for tests.
 *
 * #679 — `custom` is `clarion.run.command`: when it is set, Run sends it instead of the exe, with
 * ${exe}, ${projectDir} and ${args} substituted, from the project folder (or the project's own
 * working directory).
 */
export function runTerminalPlan(exePath: string, workingDir?: string, args?: string, custom?: { command: string; projectDir: string }): {
    name: string;
    cwd: string;
    shellPath?: string;
    command: string;
} {
    const customCommand = custom?.command.trim();
    if (custom && customCommand) {
        const vars: Record<string, string> = { exe: exePath, projectDir: custom.projectDir, args: args?.trim() ?? '' };
        return {
            // #684: the custom command runs, not the exe, so the name must not say the exe runs.
            name: `Run (custom): ${path.basename(exePath, path.extname(exePath))}`,
            cwd: workingDir ?? custom.projectDir,
            shellPath: 'powershell.exe',
            command: customCommand.replace(/\$\{(exe|projectDir|args)\}/g, (_m, name: string) => vars[name]),
        };
    }
    return {
        name: `Run: ${path.basename(exePath)}`,
        cwd: workingDir ?? path.dirname(exePath),
        // Windows PowerShell ships with every Windows install; the extension runs Clarion programs,
        // which are Windows-only.
        shellPath: 'powershell.exe',
        command: args?.trim() ? `& "${exePath}" ${args.trim()}` : `& "${exePath}"`,
    };
}

/**
 * #684 — the Run terminals, one per program: a Run closes the previous Run terminal of the same
 * program before opening its own, so they no longer pile up. Closing rather than reusing, since the
 * old one may still be busy; a GUI program started from it keeps running. vscode-free for tests.
 */
export class RunTerminals<T extends { dispose(): void }> {
    private readonly byProgram = new Map<string, T>();

    open(exePath: string, create: () => T): T {
        const key = exePath.toLowerCase();
        this.byProgram.get(key)?.dispose();
        const terminal = create();
        this.byProgram.set(key, terminal);
        return terminal;
    }

    /** The user (or VS Code) closed a terminal: forget it, so it is never disposed again. */
    closed(terminal: T): void {
        for (const [key, t] of this.byProgram) {
            if (t === terminal) this.byProgram.delete(key);
        }
    }
}
