import * as fs from 'fs';
import * as path from 'path';

/**
 * Dependency-injected LSP surface used by `resolveMemberFile`.
 *
 * `IncludeStatementCommands.ts` supplies real implementations sourced from
 * `LanguageClientManager`; tests pass fakes. The shape stays narrow so this
 * module never has to import `vscode` or `LanguageClientManager` — keeps it
 * runnable under plain mocha.
 */
export interface ResolveMemberFileDeps {
    lspIsReady: () => boolean;
    lspSendRequest: (method: string, params: unknown) => Promise<any>;
}

/**
 * Resolves a MEMBER('parent.clw') target filename to an absolute path.
 *
 * STUB IMPLEMENTATION (task 7cbf07f7 — RED phase): currently mimics the
 * pre-existing inline behavior in `IncludeStatementCommands.ts:85-101` —
 * sibling-dir-only check. Alice replaces with the full resolution chain:
 *
 *   1. If LSP is ready, send `clarion/findFile` and use its path on hit.
 *   2. Sibling fallback: `path.dirname(currentFileFsPath) / targetFile`.
 *   3. null if both miss.
 *
 * Audit follow-up B from `docs/audits/file-finding-audit-2026-05-09.md`.
 */
export async function resolveMemberFile(
    targetFile: string,
    currentFileFsPath: string,
    _deps: ResolveMemberFileDeps
): Promise<string | null> {
    // Stub: mimics current sibling-only behavior. Tests 2-5 pass against this
    // shape; test 1 (LSP routing) fails because deps are intentionally ignored.
    const sibling = path.join(path.dirname(currentFileFsPath), targetFile);
    return fs.existsSync(sibling) ? sibling : null;
}
