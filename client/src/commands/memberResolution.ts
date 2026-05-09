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
 * Resolution chain (audit follow-up B from
 * `docs/audits/file-finding-audit-2026-05-09.md`):
 *
 *   1. If LSP is ready, send `clarion/findFile` and use its `path` on hit.
 *      LSP errors are swallowed (transport failures fall through to sibling).
 *   2. Sibling fallback: `path.dirname(currentFileFsPath) / targetFile`.
 *      Preserves single-file editing without a loaded solution.
 *   3. null if both miss.
 */
export async function resolveMemberFile(
    targetFile: string,
    currentFileFsPath: string,
    deps: ResolveMemberFileDeps
): Promise<string | null> {
    if (deps.lspIsReady()) {
        try {
            const result = await deps.lspSendRequest('clarion/findFile', { filename: targetFile });
            if (result?.path) {
                return result.path;
            }
        } catch {
            // Transport failure — fall through to sibling probe.
        }
    }
    const sibling = path.join(path.dirname(currentFileFsPath), targetFile);
    return fs.existsSync(sibling) ? sibling : null;
}
