import { workspace } from 'vscode';

/**
 * #879 — the encoding VS Code decodes Clarion files with: `files.encoding` as it applies to the
 * clarion language (a `[clarion]` override first, then the user's or workspace's setting). The
 * server decodes the sources it reads from disk the same way; see server/src/utils/SourceText.ts.
 */
export function clarionFilesEncoding(): string {
    return workspace.getConfiguration('files', { languageId: 'clarion' }).get<string>('encoding', 'utf8');
}

/** Whether a configuration change can change clarionFilesEncoding(). */
export function affectsClarionFilesEncoding(affects: (section: string, scope?: { languageId: string }) => boolean): boolean {
    return affects('files.encoding', { languageId: 'clarion' });
}
