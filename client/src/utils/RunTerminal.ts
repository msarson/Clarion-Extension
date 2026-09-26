import * as path from 'path';

/**
 * #676 — the terminal Run Without Debugging opens and the line it sends. The line uses PowerShell's
 * `&` call operator (so arguments such as /debug are not misparsed), so the terminal must be a
 * PowerShell terminal whatever the user's default profile is. vscode-free for tests.
 */
export function runTerminalPlan(exePath: string, workingDir?: string, args?: string): {
    name: string;
    cwd: string;
    shellPath?: string;
    command: string;
} {
    return {
        name: `Run: ${path.basename(exePath)}`,
        cwd: workingDir ?? path.dirname(exePath),
        // Windows PowerShell ships with every Windows install; the extension runs Clarion programs,
        // which are Windows-only.
        shellPath: 'powershell.exe',
        command: args?.trim() ? `& "${exePath}" ${args.trim()}` : `& "${exePath}"`,
    };
}
