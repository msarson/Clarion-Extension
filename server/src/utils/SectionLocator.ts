import * as fs from 'fs';
import * as path from 'path';
import { resolveViaProjectRedirectionFromUri } from './RedirectionResolution';

/**
 * #343 — locate a `SECTION('name')` line inside an INCLUDE target.
 *
 * Resolves the include file owner-project-first (the #328 shared path), with
 * the same-directory fallback every other file-ref resolver uses, then scans
 * for the SECTION directive with the matching (case-insensitive) name.
 * Returns null when the file doesn't resolve OR the section isn't in it —
 * navigating to the file top for a missing section would be misleading; the
 * filename argument already offers whole-file navigation.
 */
export function findSectionLocation(
    includeFileName: string,
    sectionName: string,
    fromDocUri: string
): { path: string; line: number; character: number } | null {
    let resolved = resolveViaProjectRedirectionFromUri(includeFileName, fromDocUri);
    if (!resolved) {
        const fromPath = decodeURIComponent(fromDocUri.replace(/^file:\/\/\/?/i, '')).replace(/\//g, '\\');
        const candidate = path.resolve(path.dirname(fromPath), includeFileName);
        if (fs.existsSync(candidate)) resolved = candidate;
    }
    if (!resolved) return null;

    let content: string;
    try {
        content = fs.readFileSync(resolved, 'utf8');
    } catch {
        return null;
    }

    const escaped = sectionName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`^\\s*SECTION\\s*\\(\\s*'${escaped}'\\s*\\)`, 'i');
    const lines = content.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
        if (re.test(lines[i])) {
            return { path: resolved, line: i, character: lines[i].toUpperCase().indexOf('SECTION') };
        }
    }
    return null;
}
