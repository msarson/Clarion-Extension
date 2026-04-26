import { TextDocument } from 'vscode-languageserver-textdocument';
import { Diagnostic, DiagnosticSeverity } from 'vscode-languageserver/node';

/**
 * Warns on any character with code point > 0xFF in Clarion source files.
 *
 * Characters ≤ 0xFF cover the full Windows-1252 range (all Latin-extended
 * accented characters). Characters > 0xFF are Unicode-only and cannot be
 * represented in Windows-1252 — they cause the Clarion compiler to fail
 * after VS Code saves the file as UTF-8 and the Clarion IDE adds a BOM.
 *
 * Closes #82.
 */
export function validateUnicodeCharacters(document: TextDocument): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    const text = document.getText();

    for (let i = 0; i < text.length; i++) {
        const code = text.charCodeAt(i);
        if (code > 0xFF) {
            const pos = document.positionAt(i);
            const char = text[i];
            const hex = code.toString(16).toUpperCase().padStart(4, '0');
            diagnostics.push({
                severity: DiagnosticSeverity.Warning,
                range: { start: pos, end: { line: pos.line, character: pos.character + 1 } },
                message: `Character '${char}' (U+${hex}) is not valid in Clarion source files (Windows-1252 encoding only).`,
                source: 'clarion',
                code: 'invalid-encoding'
            });
        }
    }

    return diagnostics;
}
