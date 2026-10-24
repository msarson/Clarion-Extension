import * as path from 'path';

/**
 * #449 — the one rule the Language Reference gives for every directive that names
 * a source file: an omitted extension means `.CLW`.
 *
 *   MEMBER  — "A string constant containing the filename (without extension) of a
 *              PROGRAM source file." Extension-less is the DOCUMENTED form.
 *   INCLUDE — "If the extension is omitted, .CLW is assumed."
 *   MODULE  — from the help's own example:
 *                MODULE('Loadit')     ! source module loadit.clw
 *
 * Kept in one place because the same defect has now been fixed four times in four
 * files (#395 IncludeVerifier, #447 CrossFileResolver, and the two sites in #449).
 * Every one of them was reported separately as a user-visible bug. New code that
 * resolves or compares a directive's file target should reach for this rather than
 * re-deriving it.
 *
 * Note redirection cannot compensate for a missing extension: its masks are
 * extension-based, so `*.clw` can never match a bare name.
 */

/**
 * The names to try for a directive target, in order.
 *
 * The name AS GIVEN always comes first, so nothing that resolves today changes and
 * a file genuinely named `parent` still wins over `parent.clw`. The `.clw` retry is
 * appended only when the name carries no extension at all.
 */
export function clarionSourceCandidates(filename: string): string[] {
    return path.extname(filename) ? [filename] : [filename, filename + '.clw'];
}

/**
 * True when a `MODULE('target')` names the given file.
 *
 * `currentBasename` is expected lower-cased and WITH its extension (`member.clw`),
 * which is why a bare `MODULE('member')` needs the inference to match at all.
 *
 * MODULE also names external libraries — `MODULE('Win32')`, `MODULE('KERNEL32')` —
 * where the help says the string may be "any unique identifier" rather than a file.
 * Those simply fail to match any real source file, which is the behaviour wanted.
 */
export function moduleTargetMatchesFile(target: string, currentBasename: string): boolean {
    const targetBase = path.basename(target).toLowerCase();
    return clarionSourceCandidates(targetBase).includes(currentBasename.toLowerCase());
}
