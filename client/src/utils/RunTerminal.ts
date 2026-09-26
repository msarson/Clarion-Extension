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
            name: `Run: ${path.basename(exePath)}`,
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
