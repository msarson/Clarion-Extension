import * as fs from 'fs';
import { decodeSource } from './SourceText';

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
 * The file's text as the editor would show it: the rule every file read from disk follows
 * (#879, SourceText.decodeSource). An ANSI file is never read as UTF-8 here, or each high-bit
 * byte would become U+FFFD and the #629 check would report a wrongly decoded file the user never
 * opened.
 */
export function decodeSourceBytes(bytes: Uint8Array): string {
    return decodeSource(Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength));
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
