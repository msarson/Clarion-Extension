import { TextDocument } from 'vscode-languageserver-textdocument';
import { Diagnostic, DiagnosticSeverity } from 'vscode-languageserver/node';
import * as iconv from 'iconv-lite';

/**
 * Warns on characters that cannot be represented in ANY Windows ANSI code page.
 *
 * Clarion source is single-byte ANSI. A character that no Windows code page can encode (pasted
 * emoji, box-drawing, other-script text, …) forces VS Code to save the file as UTF-8; the Clarion
 * IDE then adds a BOM and the compiler fails (#81 → #82). The original check used `code > 0xFF`,
 * which assumed everyone is on Windows-1252 and wrongly flagged legitimate national letters — `č`,
 * `ž`, `š` for Central-European CP-1250, the Cyrillic set for CP-1251, etc. — because those sit
 * above 0xFF in Unicode though they are valid single-byte characters in that code page (#82, Edin).
 *
 * The correct test is representability: a character is only contamination if it is valid in NO
 * Windows ANSI code page. National letters for any locale therefore pass; only genuine Unicode-only
 * characters are flagged.
 */

/**
 * The Windows single-byte ANSI code pages (Western 1252, Central-European 1250, Cyrillic 1251, Greek
 * 1253, Turkish 1254, Hebrew 1255, Arabic 1256, Baltic 1257, Vietnamese 1258). Their union covers
 * every legitimate national character a Clarion source file might contain.
 */
const WINDOWS_ANSI_CODE_PAGES = [
    'win1250', 'win1251', 'win1252', 'win1253', 'win1254',
    'win1255', 'win1256', 'win1257', 'win1258'
];

let representableCodePoints: Set<number> | null = null;

/** Every Unicode code point representable in at least one Windows ANSI code page (built once). */
function getRepresentableCodePoints(): Set<number> {
    if (representableCodePoints) return representableCodePoints;
    const set = new Set<number>();
    const byte = Buffer.alloc(1);
    for (const codePage of WINDOWS_ANSI_CODE_PAGES) {
        for (let b = 0; b <= 0xFF; b++) {
            byte[0] = b;
            const code = iconv.decode(byte, codePage).codePointAt(0);
            if (code === undefined || code === 0xFFFD) continue; // byte not mapped in this code page
            set.add(code);
        }
    }
    representableCodePoints = set;
    return set;
}

/**
 * True when `codePoint` can't be written in any Windows ANSI code page — i.e. it is Unicode-only
 * contamination that will corrupt a Clarion source file once saved. Shared by the diagnostic and
 * its quick fix so they always agree on which characters are "invalid".
 */
export function isUnrepresentableInAnsi(codePoint: number): boolean {
    return !getRepresentableCodePoints().has(codePoint);
}

export function validateUnicodeCharacters(document: TextDocument): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    const text = document.getText();

    for (let i = 0; i < text.length;) {
        const code = text.codePointAt(i)!;
        const charLen = code > 0xFFFF ? 2 : 1; // astral characters (emoji) span two UTF-16 units
        if (isUnrepresentableInAnsi(code)) {
            const hex = code.toString(16).toUpperCase().padStart(4, '0');
            diagnostics.push({
                severity: DiagnosticSeverity.Warning,
                range: { start: document.positionAt(i), end: document.positionAt(i + charLen) },
                message: `Character '${String.fromCodePoint(code)}' (U+${hex}) can't be represented in any Windows ANSI code page and will corrupt the file for the Clarion compiler.`,
                source: 'clarion',
                code: 'invalid-encoding'
            });
        }
        i += charLen;
    }

    return diagnostics;
}
