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

/** U+FFFD REPLACEMENT CHARACTER. */
const REPLACEMENT_CHAR = 0xFFFD;

/**
 * #629 — true for the one code point that is never file content.
 *
 * A decoder emits U+FFFD when it meets a byte it cannot read. Seeing it in the document text
 * tells us the file was decoded with the wrong encoding; it says nothing about the character
 * actually stored on disk, which we cannot see from here. Generated Clarion is full of the
 * shape that triggers it: template field-descriptor strings separate their fields with the
 * high-bit bytes 0xA6 and 0xAB, `¦` and `«` in Windows-1252 and perfectly representable in
 * ANSI, so an ANSI file read as UTF-8 turns every delimiter into U+FFFD.
 *
 * Treating that as contamination is wrong twice over: the finding is about a character that
 * is not there, and the quick fix offers to delete it — which would strip the delimiters out
 * of the strings and break the application at runtime with nothing to point at.
 */
export function isDecodeArtifact(codePoint: number): boolean {
    return codePoint === REPLACEMENT_CHAR;
}

/**
 * True when the file opens with the Clarion 12 `!UTF8` directive.
 *
 * Per the Unicode Tester Guide a source file declares its encoding one of three
 * ways — a UTF-8/UTF-16 LE BOM, a first-line `!UTF8`, or `module(encoding=>utf8)`
 * — and *"Files with none of these stay ANSI — existing sources compile
 * byte-identically."* So an undecorated file is ANSI even on Clarion 12, which is
 * why the contamination warning is correct by default and only a declared file
 * should silence it.
 *
 * `!UTF8` is itself a Clarion comment, so it is inert on a pre-Unicode compiler —
 * SoftVelocity chose a marker old compilers ignore rather than syntax that would
 * break them.
 *
 * Matched strictly: the whole of the first line, bar surrounding whitespace. A
 * looser test would swallow ordinary prose (`! UTF8 support added today`) and
 * silence a genuine problem. Erring strict means an unrecognised variant still
 * warns, which is the safe direction.
 */
export function declaresUtf8Directive(document: TextDocument): boolean {
    // Bounded read — the directive is line 1 and short; never pull the whole file.
    const firstLine = document.getText({
        start: { line: 0, character: 0 },
        end: { line: 0, character: 64 }
    });
    return /^\s*!UTF8\s*$/i.test(firstLine);
}

export function validateUnicodeCharacters(document: TextDocument): Diagnostic[] {
    // #403 — the file has declared itself UTF-8, so its non-ANSI characters are
    // deliberate. Checked before the scan: one short line beats walking the text.
    //
    // KNOWN GAP: this trusts the declaration without asking whether the selected
    // compiler can honour it. A pre-Unicode Clarion reads the bytes as ANSI
    // regardless of the directive, so a `!UTF8` file on Clarion 10 will now stay
    // silent where a warning would have been right. Accepted deliberately: the
    // directive is an explicit statement of intent by the author, and second-
    // guessing it is worse than trusting it. Closing the gap needs the
    // compiler-capability probe tracked in #402.
    if (declaresUtf8Directive(document)) {
        return [];
    }

    // #556 — line by line: a comment's bytes never reach the compiler, so everything
    // after an unquoted `!` (or `|`, whose trailing text is a comment too) is exempt —
    // an ASCII-art banner is not a problem. Outside comments the finding stays, ONE
    // warning per line spanning the first to the last offending character, rather than
    // one per character (a pasted banner in a string is one squiggle, not fifty).
    const diagnostics: Diagnostic[] = [];
    const artifacts: { line: number; character: number }[] = [];
    const lines = document.getText().split(/\r?\n/);
    for (let lineNo = 0; lineNo < lines.length; lineNo++) {
        const line = lines[lineNo];
        const codeEnd = commentStart(line);
        let first = -1, lastEnd = -1, count = 0, firstCode = 0;
        for (let i = 0; i < codeEnd;) {
            const code = line.codePointAt(i)!;
            const charLen = code > 0xFFFF ? 2 : 1; // astral characters (emoji) span two UTF-16 units
            // #629 — U+FFFD is unrepresentable in ANSI, but it is the decoder's marker for a
            // byte it could not read, not something the author wrote. Reported separately below,
            // and collected here so it inherits this loop's comment exemption.
            if (isDecodeArtifact(code)) {
                artifacts.push({ line: lineNo, character: i });
            } else if (isUnrepresentableInAnsi(code)) {
                if (first < 0) { first = i; firstCode = code; }
                lastEnd = i + charLen;
                count++;
            }
            i += charLen;
        }
        if (first < 0) continue;
        const hex = firstCode.toString(16).toUpperCase().padStart(4, '0');
        const which = count > 1 ? ` and ${count - 1} more (${count} characters on this line)` : '';
        diagnostics.push({
            severity: DiagnosticSeverity.Warning,
            range: { start: { line: lineNo, character: first }, end: { line: lineNo, character: lastEnd } },
            // Wording settled by compiling on Clarion 10 (#556): the compiler takes the raw
            // UTF-8 bytes — the file builds, in a comment or a string — but a UTF-8 BOM
            // added on save fails it with "Illegal character", and a string will not
            // display as written on an ANSI build.
            message: `Character '${String.fromCodePoint(firstCode)}' (U+${hex})${which} has no encoding in any Windows ANSI code page. The Clarion compiler takes the raw UTF-8 bytes, so a string will not display as written, and a UTF-8 BOM added on save breaks the compile.`,
            source: 'clarion',
            code: 'invalid-encoding'
        });
    }

    // #629 — one report per file, not one per line. Every U+FFFD came from the same cause (the
    // whole file was decoded with the wrong encoding), so a finding per line is one fact
    // repeated. Anchored on the first so the entry still navigates somewhere useful.
    //
    // Comments are exempt, the same rule the scan above follows for #556. The first cut of
    // this check scanned them too, arguing that a byte the decoder could not read is a fact
    // about the file wherever it sits. True, but the consequence it warns about — a save
    // overwriting the original byte — only matters where the byte carries meaning. Measured on
    // a Clarion 12 install: 49 replacement characters across 8 shipped library files, 45 of
    // them typographic quotes, en-dashes and copyright symbols in comments, in files nobody
    // edits (builtins.clw among them). Warning there is noise; the four that sat in string
    // data are the ones worth a word.
    //
    // The message does not name a cause. The byte is unrecoverable from here, so which
    // character it was — a delimiter, a dash, a copyright sign — is exactly what we cannot say.
    if (artifacts.length > 0) {
        const total = artifacts.length;
        const at = artifacts[0];
        diagnostics.push({
            severity: DiagnosticSeverity.Warning,
            range: {
                start: { line: at.line, character: at.character },
                end: { line: at.line, character: at.character + 1 }
            },
            message: `This file is not valid UTF-8: ${total} byte${total === 1 ? '' : 's'} could not be decoded and ${total === 1 ? 'was' : 'were'} replaced with U+FFFD. `
                + `It is most likely ANSI. Reopen it with the encoding it was written in `
                + `(Reopen with Encoding — Windows 1252 for most Clarion source), or set it for good with `
                + `"[clarion]": { "files.encoding": "windows1252" } in settings. `
                + `Do not use Save with Encoding while it reads like this: that writes the replacement character over the original bytes permanently.`,
            source: 'clarion',
            code: 'utf8-decode-artifact'
        });
    }

    return diagnostics;
}

/**
 * The index where the line's comment starts — the first `!` or `|` outside a string
 * literal ('' is an escaped quote, not a terminator) — or the line length when there
 * is none. Text from there on never reaches the compiler.
 */
function commentStart(line: string): number {
    let inString = false;
    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === "'") {
            if (inString && line[i + 1] === "'") { i++; continue; } // '' inside a string
            inString = !inString;
        } else if (!inString && (ch === '!' || ch === '|')) {
            return i;
        }
    }
    return line.length;
}
