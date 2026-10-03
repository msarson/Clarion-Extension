import * as fs from 'fs';

/**
 * #681 — the build log most recently kept (`clarion.build.preserveLogFile`), for the Clarion Tools
 * pane to open. Offered only while the file still exists. vscode-free.
 */
let last: string | undefined;

export function recordBuildLog(logPath: string): void {
    last = logPath;
}

export function lastBuildLog(): string | undefined {
    return last && fs.existsSync(last) ? last : undefined;
}
