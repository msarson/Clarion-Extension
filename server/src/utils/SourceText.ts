import * as fs from 'fs';
import { isUtf8 } from 'buffer';
import * as iconv from 'iconv-lite';

/**
 * #879 — the text of a Clarion source the server reads from disk, decoded as the editor decodes it.
 *
 * VS Code decodes an open file with `files.encoding`. The server reads a closed file itself, and
 * it read every one as UTF-8: a Windows-1251 INCLUDE's Cyrillic came out as U+FFFD in hovers and
 * cards, and each replacement could shift a column. The rule:
 *   - a UTF-8 BOM, or bytes that are valid UTF-8, are UTF-8 (so a UTF-8 source is never misread,
 *     whatever the setting; plain ASCII is valid UTF-8 and reads the same under any encoding);
 *   - a UTF-16 LE BOM is UTF-16 LE;
 *   - anything else is ANSI text, decoded with the encoding VS Code uses for Clarion files
 *     (`files.encoding` for the clarion language, which the client sends), or Windows-1252 while
 *     that setting is a UTF encoding - which is what the editor shows for such a file too.
 *
 * Every reader of Clarion source goes through here; XML and JSON (.cwproj, .sln, caches) are UTF-8
 * by definition and keep their own reads (SourceEncodingReaders879.test.ts holds the list).
 */
const FALLBACK = 'windows1252';
let ansiEncoding = FALLBACK;

/** The client's `files.encoding` for Clarion files; VS Code's encoding ids are iconv-lite names. */
export function setSourceEncoding(vscodeEncoding: string | undefined): void {
    const id = (vscodeEncoding ?? '').trim().toLowerCase();
    ansiEncoding = id && !id.startsWith('utf') && iconv.encodingExists(id) ? id : FALLBACK;
}

/** The ANSI encoding in use (for logs and tests). */
export function sourceEncoding(): string {
    return ansiEncoding;
}

export function decodeSource(buf: Buffer): string {
    if (buf.length >= 3 && buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF) return buf.toString('utf8');
    if (buf.length >= 2 && buf[0] === 0xFF && buf[1] === 0xFE) return buf.toString('utf16le');
    if (buf.length >= 2 && buf[0] === 0xFE && buf[1] === 0xFF) return iconv.decode(buf, 'utf16be');
    if (isUtf8(buf)) return buf.toString('utf8');
    return iconv.decode(buf, ansiEncoding);
}

/** A Clarion source's text, read from disk (see decodeSource). */
export function readSourceText(filePath: string): string {
    return decodeSource(fs.readFileSync(filePath));
}

/**
 * The persisted caches built from source text: names, line content and include targets decoded
 * with one encoding are wrong under another, and their mtime checks cannot tell (the files did not
 * change). The same families `lsp-driver.js --cold` clears; they rebuild by themselves.
 */
const SOURCE_DERIVED_CACHES = ['sdi', 'frg', 'chainindex', 'siblingindex', 'refindex', 'reachableset', 'iv'];
const ENCODING_MARKER = 'clarion-extension-source-encoding.txt';

/**
 * #879 — clears the source-derived caches in `tempDir` when the sources were last read with another
 * encoding, then records this one. The first run only records it: this release's cache versions
 * already rebuilt those caches. Returns whether anything was cleared.
 */
export function invalidateCachesOnEncodingChange(tempDir: string, encoding = ansiEncoding): boolean {
    const marker = `${tempDir}/${ENCODING_MARKER}`;
    let last: string | undefined;
    try { last = fs.readFileSync(marker, 'utf8').trim(); } catch { /* first run */ }
    if (last === encoding) return false;
    if (last !== undefined) {
        for (const family of SOURCE_DERIVED_CACHES) {
            try { fs.rmSync(`${tempDir}/clarion-extension-${family}`, { recursive: true, force: true }); } catch { /* rebuilt as needed */ }
        }
    }
    try { fs.writeFileSync(marker, encoding, 'utf8'); } catch { /* checked again next start */ }
    return last !== undefined;
}

/**
 * #879 — after a live encoding change: the running server still holds indexes read with the old
 * encoding and may save them, so the next start must clear the caches whatever they say. The
 * marker is set to a value no encoding has.
 */
export function markCachesStale(tempDir: string): void {
    try { fs.writeFileSync(`${tempDir}/${ENCODING_MARKER}`, '(changed while running)', 'utf8'); } catch { /* best effort */ }
}

/** The async form of readSourceText. */
export async function readSourceTextAsync(filePath: string): Promise<string> {
    return decodeSource(await fs.promises.readFile(filePath));
}
