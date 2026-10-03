/**
 * #625 (#609 phase 3 step C) — the shared member-scanning layer.
 *
 * These primitives were declared inside ClassMemberResolver.ts, so MemberLocatorService —
 * the implementation that survives step C — imported its core scan, its types and its
 * overload selection from the file named after the class being retired. Every consumer moved
 * off ClassMemberResolver still had to import from it. They live here instead; the
 * implementations are unchanged.
 *
 * Nothing in here knows about a document, a solution or an index: give it a file path (or the
 * text of one) and a structure name and it reads the body. Anything needing more than that
 * belongs in MemberLocatorService.
 */
import * as fs from 'fs';
import * as path from 'path';
import { ClarionPatterns } from './ClarionPatterns';
import { ProcedureUtils } from './ProcedureUtils';
import { pathToCanonicalUri } from './UriUtils';

/**
 * The kind of structure a member was found in. Carried on MemberInfo so a
 * consumer can describe the member accurately: a QUEUE/GROUP member is a field,
 * not a "Class Property". Optional because not every producer of a MemberInfo
 * knows the kind, and consumers keep their previous CLASS/INTERFACE assumption
 * when it is absent.
 */
export type MemberOwnerKind = 'CLASS' | 'GROUP' | 'QUEUE' | 'INTERFACE';

export type MemberInfo = { type: string; className: string; line: number; file: string; signature?: string; isInterface?: boolean; structureType?: MemberOwnerKind;
    /** #611: no overload here takes the call's argument count - the pick was only the closest. */
    arityMismatch?: boolean };

/** Access level for a class member. */
export type MemberAccess = 'public' | 'protected' | 'private';

/** A single class member returned by the enumeration API. */
export interface MemberEnumItem {
    name: string;
    kind: 'method' | 'property';
    signature: string;       // full declaration line (trimmed)
    type: string;            // return type (methods) or data type (properties)
    access: MemberAccess;
    fromClass: string;       // class that declared this member (for inherited items)
    line: number;            // 0-based line in the file
    file: string;            // absolute file path
}

/**
 * Detects the access modifier in a Clarion member declaration line.
 * Looks for PRIVATE or PROTECTED in the comma-separated attribute list.
 */
export function detectMemberAccess(line: string): MemberAccess {
    const stripped = line.replace(/!.*$/, '');
    if (/\bPRIVATE\b/i.test(stripped)) return 'private';
    if (/\bPROTECTED\b/i.test(stripped)) return 'protected';
    return 'public';
}

/**
 * Scans the body of a named CLASS/QUEUE/GROUP in a file and returns ALL members.
 * Handles nested GROUP/QUEUE/RECORD blocks so their END keywords do not
 * prematurely terminate the scan.
 *
 * @param filePath      Absolute path to the file to scan
 * @param className     Name of the structure to find (e.g. "ThisWindow")
 * @param structureType Structure keyword to match — CLASS | QUEUE | GROUP (default CLASS)
 * @returns Array of MemberEnumItem, or empty array if class not found
 */
export function scanClassBodyForAllMembers(
    filePath: string,
    className: string,
    structureType: 'CLASS' | 'QUEUE' | 'GROUP' | 'INTERFACE' = 'CLASS',
    contentOverride?: string
): MemberEnumItem[] {
    const results: MemberEnumItem[] = [];
    try {
        const content = contentOverride ?? fs.readFileSync(filePath, 'utf8');
        const lines = content.split(/\r?\n/);
        const headerPattern = new RegExp(`^${className}\\s+(CLASS|QUEUE|GROUP|INTERFACE)`, 'i');

        for (let j = 0; j < lines.length; j++) {
            if (!headerPattern.test(lines[j])) continue;

            let nestDepth = 0;

            for (let k = j + 1; k < lines.length; k++) {
                const raw = lines[k];
                const stripped = raw.replace(/!.*$/, '').trim();

                if (/^(GROUP|QUEUE|RECORD)\b/i.test(stripped) ||
                    /^\w+\s+(GROUP|QUEUE|RECORD)\b/i.test(stripped)) {
                    // Self-closing single-line form (e.g. "Foo GROUP(Type),DIM(2) END" or the
                    // period form "...,DIM(2).") is a net no-op. Checking end-of-line independently
                    // of the opening match — rather than one regex trying to capture attributes and
                    // terminator together — avoids the attrs-swallow-terminator failure mode; "."
                    // is fully interchangeable with END for closing any Clarion structure.
                    if (!/(\bEND|\.)\s*$/i.test(stripped)) {
                        nestDepth++;
                    }
                    continue;
                }
                if (/^(END|\.)\s*$/i.test(stripped)) {
                    if (nestDepth > 0) { nestDepth--; continue; }
                    break;
                }
                if (nestDepth > 0) continue;
                if (!stripped || /^(INCLUDE|MODULE|SECTION)\b/i.test(stripped)) continue;

                // A member line: Label <whitespace> Type...
                const memberMatch = raw.match(/^(\w+)\s+(.+?)(\s*!.*)?$/);
                if (!memberMatch) continue;

                const name = memberMatch[1];
                const typeStr = (memberMatch[2] || '').replace(/!.*$/, '').trim();
                const access = detectMemberAccess(raw);
                // #247: PROCEDURE ≡ FUNCTION — both declare methods.
                const kind: 'method' | 'property' = ProcedureUtils.startsWithProcedureKeyword(typeStr) ? 'method' : 'property';

                results.push({
                    name,
                    kind,
                    signature: raw.trim(),
                    type: typeStr,
                    access,
                    fromClass: className,
                    line: k,
                    file: filePath
                });
            }
            // Only scan the first matching class definition
            break;
        }
    } catch {
        // Caller handles logging
    }
    return results;
}

/**
 * Scans the body of a named CLASS/QUEUE/GROUP in a file for a specific member.
 * Handles nested GROUP/QUEUE/RECORD blocks (nestDepth tracking) so their END
 * keywords do not prematurely terminate the scan of the parent structure.
 *
 * This is the canonical implementation shared by ClassMemberResolver and
 * MemberLocatorService — keep both in sync if the algorithm changes.
 *
 * @param filePath   Absolute path to the file to scan
 * @param className  Name of the structure to find (e.g. "UltimateDebug")
 * @param memberName Name of the member to find inside the structure
 * @param paramCount Optional call-site parameter count for overload selection
 * @param structureType  Structure keyword to match — CLASS | QUEUE | GROUP (default CLASS)
 * @param countParamsInDecl  Callback that counts parameters in a declaration line
 * @param selectBestOverload Callback that picks the best candidate by paramCount
 * @returns MemberInfo with the file URI, or null if not found
 */
export function scanClassBodyForMember(
    filePath: string,
    className: string,
    memberName: string,
    paramCount: number | undefined,
    structureType: 'CLASS' | 'QUEUE' | 'GROUP' | 'INTERFACE' = 'CLASS',
    countParamsInDecl: (line: string) => number,
    selectBestOverload: (candidates: { type: string; line: number; paramCount: number; signature?: string }[], paramCount: number | undefined) => { type: string; line: number; paramCount: number; signature?: string } | null,
    contentOverride?: string
): MemberInfo | null {
    try {
        const content = contentOverride ?? fs.readFileSync(filePath, 'utf8');
        const lines = content.split(/\r?\n/);
        const headerPattern = new RegExp(`^${className}\\s+(CLASS|QUEUE|GROUP|INTERFACE)`, 'i');

        for (let j = 0; j < lines.length; j++) {
            const headerMatch = lines[j].match(headerPattern);
            if (!headerMatch) continue;
            // The keyword on the declaration itself, not the caller's hint: the
            // header pattern accepts all four kinds, so a caller passing the
            // default 'CLASS' can still land on a QUEUE/GROUP body.
            const ownerKind = headerMatch[1].toUpperCase() as MemberOwnerKind;

            const candidates: { type: string; line: number; paramCount: number; signature?: string }[] = [];
            let nestDepth = 0;

            for (let k = j + 1; k < lines.length; k++) {
                const memberLine = lines[k];
                const stripped = memberLine.replace(/!.*$/, '').trim();

                if (/^(GROUP|QUEUE|RECORD)\b/i.test(stripped) ||
                    /^\w+\s+(GROUP|QUEUE|RECORD)\b/i.test(stripped)) {
                    // Self-closing single-line form is a net no-op (see scanClassBodyForAllMembers
                    // for the full rationale — same attrs-swallow-terminator hazard, same fix).
                    if (!/(\bEND|\.)\s*$/i.test(stripped)) {
                        nestDepth++;
                    }
                } else if (/^(END|\.)\s*$/i.test(stripped)) {
                    if (nestDepth > 0) { nestDepth--; continue; }
                    break;
                }

                if (nestDepth > 0) continue;

                const memberMatch = memberLine.match(new RegExp(`^\\s*(${memberName})\\s+`, 'i'));
                if (memberMatch) {
                    const afterMember = memberLine.substring(memberMatch[0].length).trim();
                    const type = (afterMember.split(/\s*!/).shift() || afterMember).trim() || 'Unknown';
                    let declParamCount = 0;
                    if (ProcedureUtils.startsWithProcedureKeyword(type)) { // #247: PROCEDURE ≡ FUNCTION
                        declParamCount = countParamsInDecl(memberLine);
                    }
                    candidates.push({ type, line: k, paramCount: declParamCount, signature: memberLine.trim() });
                }
            }

            const bestMatch = selectBestOverload(candidates, paramCount);
            if (bestMatch) {
                const fileUri = pathToCanonicalUri(filePath); // #251
                return { type: bestMatch.type, className, line: bestMatch.line, file: fileUri, signature: bestMatch.signature, structureType: ownerKind,
                    arityMismatch: !overloadAcceptsArgs(bestMatch, paramCount) };
            }
        }
    } catch (error) {
        // Caller handles logging
    }
    return null;
}

export type OverloadCandidate = { type: string; line: number; paramCount: number; signature?: string };

/**
 * Picks the best overload candidate given the call-site parameter count.
 * Exported so MemberLocatorService can share the same selection logic.
 */
/**
 * #611: whether a call with `paramCount` arguments can bind to this overload - an exact count,
 * or one that leaves only defaulted/omittable parameters out. Undefined (no call) always fits.
 */
export function overloadAcceptsArgs(c: OverloadCandidate, paramCount: number | undefined): boolean {
    if (paramCount === undefined || c.paramCount === paramCount) return true;
    const defaults = ClarionPatterns.countDefaultParams(c.signature ?? '');
    return paramCount >= c.paramCount - defaults && paramCount <= c.paramCount;
}

export function selectBestMemberOverload(
    candidates: OverloadCandidate[],
    paramCount: number | undefined
): OverloadCandidate | null {
    if (candidates.length === 0) return null;
    if (paramCount === undefined) return candidates[0];

    const exact = candidates.find(c => c.paramCount === paramCount);
    if (exact) return exact;

    const compatible = candidates
        .filter(c => {
            const defaults = ClarionPatterns.countDefaultParams(c.signature ?? '');
            return paramCount >= (c.paramCount - defaults) && paramCount <= c.paramCount;
        })
        .sort((a, b) => (a.paramCount - paramCount) - (b.paramCount - paramCount));
    if (compatible.length > 0) return compatible[0];

    return candidates.reduce((best, curr) => {
        const bd = Math.abs(best.paramCount - paramCount);
        const cd = Math.abs(curr.paramCount - paramCount);
        if (cd === bd) return curr.paramCount > best.paramCount ? curr : best;
        return cd < bd ? curr : best;
    });
}

/**
 * Counts the parameters in a method declaration line.
 *
 * #625 — there were two of these, one on ClassMemberResolver and one on
 * MemberLocatorService, injected into the same `scanClassBodyForMember` as its
 * `countParamsInDecl` callback. They were the same algorithm written twice (same #247
 * regex, same depth-aware comma count); checked differentially over 220,016 inputs with
 * no disagreement before being collapsed into this one.
 */
export function countParametersInDeclaration(line: string): number {
    const match = line.match(/(?:PROCEDURE|FUNCTION)\s*\(([^)]*)\)/i); // #247
    if (!match) return 0;

    const paramList = match[1].trim();
    if (paramList === '') return 0;

    let depth = 0;
    let commaCount = 0;
    for (const char of paramList) {
        if (char === '(') depth++;
        else if (char === ')') depth--;
        else if (char === ',' && depth === 0) commaCount++;
    }
    return commaCount + 1;
}

/**
 * Counts the arguments of the call to `methodName` on `line`: commas at parenthesis depth 0.
 * #637: moved verbatim from ClassMemberResolver.countParametersInCall.
 */
export function countParametersInCall(line: string, methodName: string): number {
    // #249: anchor by WORD BOUNDARY — a bare substring indexOf locked onto a longer
    // identifier containing the name (resolving `SetValue` on a line with
    // `SetValueEx(1,2)` counted SetValueEx's args). Prefer a direct call shape
    // `name(`; fall back to a standalone `name` followed later by '(' (covers
    // declaration lines like `SetValue PROCEDURE(STRING)`, whose param count the
    // decl-cursor anchor relies on).
    const escaped = methodName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const callMatch = new RegExp(`\\b${escaped}\\s*\\(`, 'i').exec(line);
    let paramList: string;
    if (callMatch) {
        paramList = line.substring(callMatch.index + callMatch[0].length);
    } else {
        const wordMatch = new RegExp(`\\b${escaped}\\b`, 'i').exec(line);
        if (!wordMatch) return 0;
        const afterMethod = line.substring(wordMatch.index + methodName.length);
        const parenIndex = afterMethod.indexOf('(');
        if (parenIndex === -1) return 0;
        paramList = afterMethod.substring(parenIndex + 1);
    }

    let depth = 0;
    let commaCount = 0;
    let hasContent = false;

    for (let i = 0; i < paramList.length; i++) {
        const char = paramList[i];

        if (char === '(') {
            depth++;
        } else if (char === ')') {
            if (depth === 0) {
                // End of parameter list
                return hasContent ? commaCount + 1 : 0;
            }
            depth--;
        } else if (char === ',' && depth === 0) {
            commaCount++;
        } else if (char.trim() !== '' && depth === 0) {
            hasContent = true;
        }
    }

    return hasContent ? commaCount + 1 : 0;
}

/**
 * Returns the raw text of a specific line from a file given its URI and line number.
 * Used to retrieve the declaration signature for overload resolution.
 * #637: moved verbatim from ClassMemberResolver.getDeclarationLineText. It reads the file from
 * disk, so a declaration edited since the last save reads stale here (compare #640).
 */
export function getDeclarationLineText(fileUri: string, line: number): string | null {
    try {
        let filePath = fileUri;
        if (filePath.startsWith('file:///')) {
            filePath = decodeURIComponent(filePath.replace(/^file:\/\/\//, '')).replace(/\//g, '\\');
        }
        const content = fs.readFileSync(filePath, 'utf8');
        const lines = content.split(/\r?\n/);
        return lines[line] ?? null;
    } catch {
        return null;
    }
}
