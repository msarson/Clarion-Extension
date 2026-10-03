import * as fs from 'fs';

/**
 * #696 — a restored editor tab that VS Code has not instantiated is pulled for diagnostics by URI
 * alone (the client's `diagnosticPullOptions.onTabs`). The server has no document for it, so it
 * reads the file from disk. vscode-free for tests.
 */

/** Clarion source files the diagnostics run on (the same list validateTextDocument accepts). */
export function isClarionSourcePath(filePath: string): boolean {
    return /\.(clw|inc|equ)$/i.test(filePath);
}

/**
 * The file's text as the editor would most likely show it. Valid UTF-8 is read as UTF-8; anything
 * else as Latin-1, since generated Clarion is often ANSI and a UTF-8 read would turn each high-bit
 * byte into U+FFFD — which the #629 check then reports as a wrongly decoded file the user never
 * opened.
 */
export function decodeSourceBytes(bytes: Uint8Array): string {
    try {
        return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch {
        return Buffer.from(bytes).toString('latin1');
    }
}

/** Read an unopened source for diagnostics: its text and modification time, or null. */
export function readUnopenedSource(filePath: string): { text: string; mtimeMs: number } | null {
    if (!isClarionSourcePath(filePath)) return null;
    try {
        const mtimeMs = fs.statSync(filePath).mtimeMs;
        return { text: decodeSourceBytes(fs.readFileSync(filePath)), mtimeMs };
    } catch {
        return null;
    }
}
