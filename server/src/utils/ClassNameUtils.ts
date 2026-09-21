/**
 * #625 (#609 phase 3 step C) — naming utilities for Clarion class references.
 *
 * Both were static methods on `ClassMemberResolver`. Neither has anything to do with that
 * class's member-lookup algorithm, and neither has a counterpart on MemberLocatorService —
 * they are utility, not a competing implementation. They lived there only by accident of
 * history, and that accident was the last reason MemberLocatorService, ArgumentTypeResolver,
 * ChainedPropertyResolver and SelfParentClassResolver had to import the implementation
 * step C retires.
 *
 * Moved verbatim.
 */

import { Token, TokenType } from '../ClarionTokenizer';
import { TokenHelper } from './TokenHelper';

/**
 * #608 — the declaration label for `className` nearest above `atLine`.
 *
 * A module may declare the same local class label in more than one procedure (every
 * generated procedure has its own `ThisWindow`), so "the class at this line" is the closest
 * declaration above it, not the first one in the file.
 */
export function nearestClassLabel(tokens: Token[], className: string, atLine: number): Token | null {
    const wanted = className.toLowerCase();
    let best: Token | null = null;
    for (const classToken of TokenHelper.findClassStructures(tokens)) {
        const label = tokens.find(t =>
            t.type === TokenType.Label && t.line === classToken.line && t.value.toLowerCase() === wanted);
        if (!label) continue;
        if (!best || (label.line <= atLine && (best.line > atLine || label.line > best.line))) best = label;
    }
    return best;
}

/**
 * Extracts the navigable class/type name from a declared type, or null when the type is a
 * Clarion primitive and there is nothing to navigate to.
 */
export function extractClassName(typeStr: string): string | null {
    const CLARION_PRIMITIVES = new Set([
        'PROCEDURE', 'ROUTINE',
        'STRING', 'CSTRING', 'PSTRING', 'USTRING',
        'LONG', 'ULONG', 'SHORT', 'USHORT', 'BYTE', 'SBYTE',
        'REAL', 'SREAL', 'BFLOAT4', 'BFLOAT8',
        'DECIMAL', 'PDECIMAL',
        'DATE', 'TIME', 'CLOCK',
        'BOOL', 'ANY', 'ASTRING', 'MEMO', 'BLOB', 'BFILE',
        'SIGNED', 'UNSIGNED', 'VARIANT', 'LIKE',
        'FILE', 'VIEW', 'REPORT', 'WINDOW', 'APPLICATION',
        'QUEUE', 'GROUP', 'RECORD', 'KEY', 'INDEX',
        'THREAD', 'MODULE', 'EQUATE',
    ]);

    // Strip leading & (reference prefix)
    let name = typeStr.trim().replace(/^&/, '').trim();

    // LIKE(TypeName) or LIKE(PREFIX:TypeName) — inherited type: resolve to the referenced name
    const likeMatch = name.match(/^LIKE\s*\(\s*([\w:]+)\s*\)/i);
    if (likeMatch) return likeMatch[1];

    // GROUP(TypeName) / QUEUE(TypeName) / RECORD(TypeName) — structured-type property
    // (e.g. "Settings GROUP(ConnectionSettingsType) END"): resolve to the referenced
    // type name, same treatment as LIKE(TypeName) above. Without this, the comma/paren
    // split below strips down to the bare keyword ("GROUP"), which then matches
    // CLARION_PRIMITIVES and gets rejected as "not navigable" — breaking chained
    // hover/member resolution (e.g. SELF.Settings.Address) one level too early.
    const structRefMatch = name.match(/^(?:GROUP|QUEUE|RECORD)\s*\(\s*([\w:]+)\s*\)/i);
    if (structRefMatch) return structRefMatch[1];

    // Take only the part before comma or parenthesis (attributes/dimensions)
    name = name.split(/[,(]/)[0].trim();

    if (!name || CLARION_PRIMITIVES.has(name.toUpperCase())) {
        return null;
    }
    return name;
}
