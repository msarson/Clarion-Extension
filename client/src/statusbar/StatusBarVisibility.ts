/**
 * #675 — when the Clarion workspace items (configuration, version, initialisation, build) show in
 * the status bar. vscode-free for tests.
 */
export function showClarionWorkspaceItems(p: { clarionEditorActive: boolean; solutionOpen: boolean }): boolean {
    // A Clarion file in focus (a lone .clw, no solution), or a Clarion solution open (any file, or
    // none, in focus). #273's case - a non-Clarion workspace - is neither, so it shows nothing.
    return p.clarionEditorActive || p.solutionOpen;
}
