import { TextDocument } from 'vscode-languageserver-textdocument';
import { Diagnostic, DiagnosticSeverity } from 'vscode-languageserver/node';
import { Token, TokenType } from '../../ClarionTokenizer';
import { extractReturnType } from '../../utils/AttributeKeywords';
import { ProcedureSignatureUtils } from '../../utils/ProcedureSignatureUtils';
import { MemberLocatorService } from '../../services/MemberLocatorService';
import { selectBestMemberOverload, OverloadCandidate } from '../../utils/ClassMemberResolver';
import { TokenCache } from '../../TokenCache';
import { TokenHelper } from '../../utils/TokenHelper';
import { DocumentStructure } from '../../DocumentStructure';
import { SolutionManager } from '../../solution/solutionManager';
import { CrossFileResolver } from '../../utils/CrossFileResolver';
import { getCrossFileEpoch } from '../../utils/crossFileEpoch';

// #345 phase 4 — cross-pass RVD memos (see the per-pass → module-level note
// inside validateDiscardedReturnValues). Keys carry (docUri, docVersion);
// the epoch guard clears them on any watched cross-file change.
const rvdTypeMemo = new Map<string, Promise<{ typeName: string; isClass: boolean; isReference: boolean } | null>>();
const rvdClassMembersMemo = new Map<string, Promise<Map<string, OverloadCandidate[]> | null>>();
let rvdMemoEpoch = -1;

// #358: per-entry contributing-file mtimes for rvdClassMembersMemo. On a cross-file
// epoch bump we validate each class enumeration against the mtimes of the file(s) that
// actually declared its members instead of wiping the whole map — so a warm re-validation
// no longer re-walks unchanged library classes (StringTheory 1394 members, ErrorClass 184).
// The map is keyed identically to rvdClassMembersMemo (`${rvdDocKey}|${classKey}`):
//   value = Map<lowercased fsPath, mtimeMs>  — empty means only the open doc contributed
//   value = null                              — no reusable provenance → drop on the next bump
// The open doc's own contribution is deliberately excluded: its content is already pinned by
// the rvdDocKey content-hash below, which is the dirty-doc guard (unsaved edits change the
// key, not the disk mtime).
const rvdClassMembersFiles = new Map<string, Map<string, number> | null>();

// #358: the same treatment for the receiver-TYPE memo. resolveVariableType now reports the
// file(s) whose content determined a type (declaring file + any LIKE-alias file) via an
// optional provenance Set; we mtime-validate each entry on an epoch bump instead of clearing
// wholesale — the GlobalErrors 1.3s resolution survives a warm re-validation. Keyed identically
// to rvdTypeMemo (`${rvdDocKey}|${objUpper}`); same value semantics as rvdClassMembersFiles.
const rvdTypeMemoFiles = new Map<string, Map<string, number> | null>();

import { makeTimeSlicer } from '../../utils/cooperativeScan';
import * as path from 'path';
import * as fs from 'fs';
import LoggerManager from '../../logger';

const logger = LoggerManager.getLogger("ReturnValueDiagnostics");
logger.setLevel("error");

// #158 Phase B Priority 1 — per-call-site perf instrumentation for
// validateDiscardedReturnValues. Set level to "perf" to emit; flip to
// "error" at final commit.
// #158 — level set to "error" post-investigation. Flip to "perf" for
// future investigations (single-character toggle).
// "perf" → the completion breakdown (dotcall loop vs crossfile scan, unique member resolutions)
// always emits, even in a release VSIX — one line per validation, needed to diagnose slow-solution
// reports.
const perfLogger = LoggerManager.getLogger("ReturnValueDiagnostics.Perf", "perf");

// ─── #358 RVD memo mtime validation (shared by class-members + receiver-type) ──

/** #358: cheap mtime read (ms) for a declaring file; null if unstatable. */
function rvdStatMtimeMs(fsPath: string): number | null {
    try { return fs.statSync(fsPath).mtimeMs; } catch { return null; }
}

/**
 * #358: fingerprint a set of contributing fs paths by mtime, excluding the open document
 * (already pinned by rvdDocKey — the dirty-doc guard). Returns null when any path is missing
 * or unstatable — such an entry can't be mtime-validated and is dropped on the next epoch
 * bump rather than trusted. An empty map means every contribution came from the open doc.
 */
function rvdFingerprintPaths(
    paths: Iterable<string | undefined>,
    openDocPathLower: string
): Map<string, number> | null {
    const fp = new Map<string, number>();
    for (const p of paths) {
        if (!p) return null;
        const pl = p.toLowerCase();
        if (pl === openDocPathLower) continue; // open doc → pinned by rvdDocKey
        if (!fp.has(pl)) {
            const m = rvdStatMtimeMs(p);
            if (m === null) return null;
            fp.set(pl, m);
        }
    }
    return fp;
}

/** #358: drop entries from a memo + its files map whose contributing files changed on disk. */
function rvdRevalidateMemoByMtime(
    memo: Map<string, unknown>,
    filesMap: Map<string, Map<string, number> | null>
): void {
    for (const key of [...memo.keys()]) {
        const fp = filesMap.get(key);
        let fresh = !!fp; // null / unrecorded provenance → re-resolve
        if (fp) {
            for (const [p, mtime] of fp) {
                if (rvdStatMtimeMs(p) !== mtime) { fresh = false; break; }
            }
        }
        if (!fresh) {
            memo.delete(key);
            filesMap.delete(key);
        }
    }
}

// ─── Private helpers ─────────────────────────────────────────────────────────

function getCodeBlockRanges(
    tokens: Token[]
): { start: number; end: number; selfClassName: string | null }[] {
    const ranges: { start: number; end: number; selfClassName: string | null }[] = [];

    for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i];
        if (!TokenHelper.isProcedureOrFunction(t) && t.type !== TokenType.Routine) continue;
        if (!t.executionMarker) continue;

        const sub = t.subType;
        if (sub === TokenType.MethodDeclaration || sub === TokenType.InterfaceMethod) continue;

        const codeStart = t.executionMarker.line + 1;
        const procEnd = t.finishesAt ?? tokens[tokens.length - 1].line;

        // #308: the tokenizer splits `MyClass.DoWork PROCEDURE` into
        // Label("MyClass") + Variable("DoWork"), so the old col-0 Label
        // scan-back never saw a dot and derived null — silently skipping every
        // SELF/PARENT dot-call site. The PROCEDURE token itself carries the
        // full dotted name in `label` (MethodImplementation subtype); the class
        // is its first segment (covers 3-part Class.Interface.Method too).
        let selfClassName: string | null = null;
        if (sub === TokenType.MethodImplementation && t.label) {
            const dotIdx = t.label.indexOf('.');
            if (dotIdx > 0) selfClassName = t.label.substring(0, dotIdx);
        }

        ranges.push({ start: codeStart, end: procEnd, selfClassName });
    }

    return ranges;
}

function isNonProcReturnMethod(typeStr: string): boolean {
    const upper = typeStr.toUpperCase();
    if (!upper.startsWith('PROCEDURE') && !upper.startsWith('FUNCTION')) return false;
    if (/\bPROC\b/.test(upper)) return false;

    let afterParen = upper;
    const parenIdx = upper.indexOf('(');
    if (parenIdx !== -1) {
        let depth = 0;
        for (let i = parenIdx; i < upper.length; i++) {
            if (upper[i] === '(') depth++;
            else if (upper[i] === ')') {
                depth--;
                if (depth === 0) { afterParen = upper.substring(i + 1); break; }
            }
        }
    } else {
        afterParen = upper.substring(upper.indexOf('PROCEDURE') + 9).trimStart().substring(
            upper.indexOf('FUNCTION') !== -1 ? 8 : 0
        );
    }

    return /\b(LONG|SHORT|BYTE|SIGNED|UNSIGNED|STRING|CSTRING|PSTRING|REAL|DECIMAL|DATE|TIME|SREAL|BLOB|QUEUE|GROUP|CLASS|BOOL|ANY|BFILE|FILE)\b/.test(afterParen);
}

/** #294 visibility: how many files the last cross-file plain-call scan actually covered. */
let lastCrossFileFilesScanned = 0;

function validateCrossFilePlainCalls(
    currentTokens: Token[],
    document: TextDocument,
    docLines: string[],
    codeRanges: { start: number; end: number }[],
    getOpenDocumentContent?: (absPath: string) => string | null
): Diagnostic[] {
    const cache = TokenCache.getInstance();
    const currentUri = document.uri;

    const localMapNames = new Set<string>();
    for (const t of currentTokens) {
        if (t.subType === TokenType.MapProcedure) {
            const name = (t.label ?? t.value.split('(')[0].trim()).toUpperCase();
            if (name) localMapNames.add(name);
        }
    }

    const warnableProcs = new Map<string, string>(); // nameUpper → returnType
    const excluded = new Set<string>();

    const filesToScan = new Map<string, { uri: string; fsPath?: string }>();
    for (const uri of cache.getAllCachedUris()) {
        if (uri.toLowerCase() === currentUri.toLowerCase()) continue;
        filesToScan.set(uri.toLowerCase(), { uri });
    }

    // #162 V1 included EVERY unopened project source file here. That was only ever affordable
    // because the #293 resolution bug capped "every project file" at ~41; with resolution fixed
    // (~3,016 files) this pass cold-loads and tokenizes the entire solution per validated
    // document, freezing the server for minutes. REVERTED to cached/open files (pre-#162 scope)
    // per Mark's call — identical to the behavior users actually observed. True solution-wide
    // coverage returns with the one-pass reference index (#294), which makes it O(total tokens)
    // once instead of per-document sweeps. NOTE (no silent caps): the
    // "validateDiscardedReturnValues complete" perf line carries crossfile_files_scanned so the
    // reduced scope stays visible.
    lastCrossFileFilesScanned = filesToScan.size;

    for (const { uri, fsPath } of filesToScan.values()) {
        let otherTokens = cache.getTokensByUri(uri);
        if (!otherTokens) {
            const pathFromUri = decodeURIComponent(uri.replace(/^file:\/\/\/?/i, '')).replace(/\//g, '\\');
            const loaded = CrossFileResolver.loadExternalFileTokens(
                cache,
                uri,
                fsPath ?? pathFromUri,
                getOpenDocumentContent
            );
            if (!loaded) continue;
            otherTokens = loaded.tokens;
        }
        if (!otherTokens) continue;

        for (let i = 0; i < otherTokens.length; i++) {
            const t = otherTokens[i];
            if (t.subType !== TokenType.MapProcedure) continue;

            const name = (t.label ?? t.value.split('(')[0].trim()).toUpperCase();
            if (!name || excluded.has(name) || localMapNames.has(name)) continue;

            const lineTokens = otherTokens.filter(tok => tok.line === t.line);
            if (lineTokens.some(tok => ['PROC', 'DERIVED'].includes(tok.value.toUpperCase()))) {
                excluded.add(name);
                warnableProcs.delete(name);
                continue;
            }

            let startIdx = i;
            {
                // Skip past the parameter list '(...)' regardless of whether the declaration
                // uses the explicit PROCEDURE keyword (type=Procedure) or the shorthand form
                // (type=Label, e.g. `PQClear(Long pResult),Raw,C,...`). Without this, the
                // parameter type (e.g. Long) is mistaken for a return type.
                let depth = 0;
                for (let k = i; k < otherTokens.length && otherTokens[k].line === t.line; k++) {
                    if (otherTokens[k].value === '(') depth++;
                    else if (otherTokens[k].value === ')') {
                        depth--;
                        if (depth === 0) { startIdx = k + 1; break; }
                    }
                }
            }

            // Guard: startIdx must still be on the same line as the procedure declaration.
            // If the ')' was the last token on the line, startIdx points to the next line —
            // extractReturnType would then use that next line as its anchor and falsely pick
            // up the return type of the following declaration.
            if (startIdx >= otherTokens.length || otherTokens[startIdx].line !== t.line) {
                excluded.add(name);
                warnableProcs.delete(name);
                continue;
            }

            const returnType = extractReturnType(otherTokens, startIdx, true);
            if (!returnType) {
                excluded.add(name);
                warnableProcs.delete(name);
                continue;
            }
            if (!excluded.has(name)) {
                warnableProcs.set(name, returnType);
            }
        }
    }

    if (warnableProcs.size === 0) return [];

    const diagnostics: Diagnostic[] = [];
    const ASSIGN_RE = /^[A-Za-z_][A-Za-z0-9_:]*\s*[+\-*/&|]?=/;

    for (let lineIdx = 0; lineIdx < docLines.length; lineIdx++) {
        if (!codeRanges.some(r => lineIdx >= r.start && lineIdx <= r.end)) continue;

        const rawLine = docLines[lineIdx];
        const stripped = rawLine.replace(/!.*$/, '').trim();
        if (!stripped) continue;

        if (ASSIGN_RE.test(stripped)) continue;
        if (/^[A-Za-z_][A-Za-z0-9_]*\./.test(stripped)) continue;

        const identMatch = stripped.match(/^([A-Za-z_][A-Za-z0-9_]*)/);
        if (!identMatch) continue;

        const callName = identMatch[1];
        if (!warnableProcs.has(callName.toUpperCase())) continue;

        const afterIdent = stripped.substring(callName.length).trimStart();
        if (afterIdent !== '') {
            if (!afterIdent.startsWith('(')) continue;
            let depth = 0, closeIdx = -1;
            for (let ci = 0; ci < afterIdent.length; ci++) {
                if (afterIdent[ci] === '(') depth++;
                else if (afterIdent[ci] === ')') {
                    depth--;
                    if (depth === 0) { closeIdx = ci; break; }
                }
            }
            if (closeIdx === -1) continue;
            if (afterIdent.substring(closeIdx + 1).trim()) continue;
        }

        const colStart = rawLine.search(/\S/);
        diagnostics.push({
            severity: DiagnosticSeverity.Warning,
            range: {
                start: { line: lineIdx, character: colStart >= 0 ? colStart : 0 },
                end: { line: lineIdx, character: colStart + stripped.length }
            },
            message: `Return value of '${callName}' is discarded. Capture the return value or add the PROC attribute to the declaration to suppress this warning.`,
            source: 'clarion'
        });
    }

    return diagnostics;
}

// ─── Exported validation functions ───────────────────────────────────────────

/**
 * #163 — true when `token` is nested (at any depth) inside a MAP or CLASS structure,
 * per the DocumentStructure parent index. Replaces the bespoke running
 * `inMapOrClass`/`mapClassDepth` scan that distinguished procedure DECLARATIONS
 * (inside MAP/CLASS) from IMPLEMENTATIONS (top-level / Class.Method impls, which sit
 * after the CLASS END and so have no MAP/CLASS ancestor).
 */
function isInsideMapOrClass(structure: DocumentStructure, token: Token): boolean {
    let parent = structure.getParent(token);
    while (parent) {
        if (parent.type === TokenType.Structure &&
            (parent.value.toUpperCase() === 'MAP' || parent.value.toUpperCase() === 'CLASS')) {
            return true;
        }
        parent = structure.getParent(parent);
    }
    return false;
}

export function validateReturnStatements(tokens: Token[], document: TextDocument, documentStructure?: DocumentStructure): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    const docLines = document.getText().split('\n');

    // #163 — consume the shared parent-index substrate for MAP/CLASS scope membership.
    // #258: production callers (DiagnosticProvider) pass the CACHED structure — this
    // previously re-processed the shared token array on every validation cycle. The
    // build-from-passed-tokens fallback remains for direct callers (tests).
    let structure = documentStructure;
    if (!structure) {
        structure = new DocumentStructure(tokens);
        structure.process();
    }

    const declarationsWithReturnTypes: Array<{
        name: string;
        returnType: string;
        line: number;
        signature: string;
    }> = [];

    for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i];

        if (token.type === TokenType.Structure && token.value.toUpperCase() === 'MAP') {
            let mapEndLine = -1;
            for (let j = i + 1; j < tokens.length; j++) {
                if (tokens[j].value.toUpperCase() === 'END' && tokens[j].start === 0) {
                    mapEndLine = tokens[j].line;
                    break;
                }
            }

            for (let j = i + 1; j < tokens.length && (mapEndLine === -1 || tokens[j].line < mapEndLine); j++) {
                if ((TokenHelper.isProcedureOrFunction(tokens[j]) || tokens[j].type === TokenType.Routine) &&
                    (tokens[j].value.toUpperCase() === 'PROCEDURE' || tokens[j].value.toUpperCase() === 'FUNCTION')) {

                    const procNameToken = tokens.find(t =>
                        t.line === tokens[j].line && t.start === 0 && t.type === TokenType.Label
                    );
                    if (!procNameToken) continue;

                    let parenDepth = 0;
                    for (let k = j + 1; k < tokens.length && tokens[k].line === tokens[j].line; k++) {
                        if (tokens[k].value === '(') parenDepth++;
                        else if (tokens[k].value === ')') {
                            parenDepth--;
                            if (parenDepth === 0) {
                                if (k + 1 < tokens.length && tokens[k + 1].line === tokens[j].line) {
                                    const lineTokens = tokens.filter(t => t.line === tokens[j].line);
                                    const hasProc = lineTokens.some(t => t.value.toUpperCase() === 'PROC');
                                    const hasDerived = lineTokens.some(t => t.value.toUpperCase() === 'DERIVED');
                                    if (!hasProc && !hasDerived) {
                                        const returnType = extractReturnType(tokens, k + 1, true);
                                        if (returnType) {
                                            declarationsWithReturnTypes.push({
                                                name: procNameToken.value,
                                                returnType,
                                                line: procNameToken.line,
                                                signature: docLines[tokens[j].line] || ''
                                            });
                                        }
                                    }
                                }
                                break;
                            }
                        }
                    }
                }
            }
        }

        if (token.type === TokenType.Structure && token.value.toUpperCase() === 'CLASS') {
            const classNameToken = tokens.find(t =>
                t.type === TokenType.Label && t.line === token.line
            );
            if (!classNameToken) continue;

            const className = classNameToken.value;
            let classEndLine: number = token.finishesAt ?? -1;
            if (classEndLine === -1) {
                for (let j = i + 1; j < tokens.length; j++) {
                    if (tokens[j].value.toUpperCase() === 'END' && tokens[j].start === 0) {
                        classEndLine = tokens[j].line;
                        break;
                    }
                }
            }

            for (let j = i + 1; j < tokens.length && (classEndLine === -1 || tokens[j].line < classEndLine); j++) {
                if ((TokenHelper.isProcedureOrFunction(tokens[j]) || tokens[j].type === TokenType.Routine) &&
                    (tokens[j].value.toUpperCase() === 'PROCEDURE' || tokens[j].value.toUpperCase() === 'FUNCTION')) {

                    const methodNameToken = tokens.find(t =>
                        t.line === tokens[j].line && t.start === 0 && t.type === TokenType.Label
                    );
                    if (!methodNameToken) continue;

                    let parenDepth = 0;
                    for (let k = j + 1; k < tokens.length && tokens[k].line === tokens[j].line; k++) {
                        if (tokens[k].value === '(') parenDepth++;
                        else if (tokens[k].value === ')') {
                            parenDepth--;
                            if (parenDepth === 0) {
                                if (k + 1 < tokens.length && tokens[k + 1].line === tokens[j].line) {
                                    const lineTokens = tokens.filter(t => t.line === tokens[j].line);
                                    const hasProc = lineTokens.some(t => t.value.toUpperCase() === 'PROC');
                                    const hasDerived = lineTokens.some(t => t.value.toUpperCase() === 'DERIVED');
                                    if (!hasProc && !hasDerived) {
                                        const returnType = extractReturnType(tokens, k + 1, true);
                                        if (returnType) {
                                            declarationsWithReturnTypes.push({
                                                name: className + '.' + methodNameToken.value,
                                                returnType,
                                                line: methodNameToken.line,
                                                signature: docLines[tokens[j].line] || ''
                                            });
                                        }
                                    }
                                }
                                break;
                            }
                        }
                    }
                }
            }
        }
    }

    for (const decl of declarationsWithReturnTypes) {
        for (let i = 0; i < tokens.length; i++) {
            const token = tokens[i];

            if ((TokenHelper.isProcedureOrFunction(token) || token.type === TokenType.Routine) &&
                (token.value.toUpperCase() === 'PROCEDURE' || token.value.toUpperCase() === 'FUNCTION')) {

                // #163 — skip DECLARATIONs (nested in MAP/CLASS); only IMPLEMENTATIONs
                // reach the RETURN-statement analysis below. Was: inMapOrClass/mapClassDepth.
                if (isInsideMapOrClass(structure, token)) continue;

                let fullName = '';
                if (i > 0 && (tokens[i - 1].type === TokenType.Label || tokens[i - 1].type === TokenType.Variable)) {
                    fullName = tokens[i - 1].value;
                    if (i > 2 && tokens[i - 2].value === '.' && tokens[i - 3].type === TokenType.Label) {
                        fullName = tokens[i - 3].value + '.' + fullName;
                    } else if (i > 1 && tokens[i - 2].type === TokenType.Label) {
                        const line = docLines[token.line];
                        const cName = tokens[i - 2].value;
                        const mName = tokens[i - 1].value;
                        if (line.includes(cName + '.' + mName)) {
                            fullName = cName + '.' + mName;
                        }
                    }
                }

                if (fullName.toLowerCase() === decl.name.toLowerCase()) {
                    const implLine = docLines[token.line] || '';
                    const declParams = ProcedureSignatureUtils.extractParameterTypes(decl.signature);
                    const implParams = ProcedureSignatureUtils.extractParameterTypes(implLine);
                    if (!ProcedureSignatureUtils.parametersMatch(declParams, implParams)) continue;

                    let codeLineStart = -1;
                    for (let j = i + 1; j < tokens.length; j++) {
                        if ((tokens[j].type === TokenType.Keyword ||
                             tokens[j].type === TokenType.Label ||
                             tokens[j].type === TokenType.ExecutionMarker) &&
                            tokens[j].value.toUpperCase() === 'CODE') {
                            codeLineStart = tokens[j].line;
                            break;
                        }
                        if ((TokenHelper.isProcedureOrFunction(tokens[j]) || tokens[j].type === TokenType.Routine) &&
                            (tokens[j].value.toUpperCase() === 'PROCEDURE' || tokens[j].value.toUpperCase() === 'FUNCTION')) {
                            break;
                        }
                    }

                    if (codeLineStart === -1) continue;

                    let procedureEndLine = tokens[tokens.length - 1].line;
                    for (let j = i + 1; j < tokens.length; j++) {
                        if (j !== i && tokens[j].type === TokenType.Label) {
                            if (j + 1 < tokens.length &&
                                (TokenHelper.isProcedureOrFunction(tokens[j + 1]) || tokens[j + 1].type === TokenType.Routine) &&
                                (tokens[j + 1].value.toUpperCase() === 'PROCEDURE' || tokens[j + 1].value.toUpperCase() === 'FUNCTION')) {
                                procedureEndLine = tokens[j].line - 1;
                                break;
                            }
                        }
                    }

                    const returnStatements: { line: number; hasValue: boolean }[] = [];
                    for (let j = i + 1; j < tokens.length; j++) {
                        if (tokens[j].line > procedureEndLine) break;
                        if (tokens[j].line < codeLineStart) continue;
                        if (tokens[j].type === TokenType.Keyword && tokens[j].value.toUpperCase() === 'RETURN') {
                            let hasValue = false;
                            for (let k = j + 1; k < tokens.length && tokens[k].line === tokens[j].line; k++) {
                                if (tokens[k].type !== TokenType.Operator &&
                                    tokens[k].value !== '(' &&
                                    tokens[k].value !== ')' &&
                                    tokens[k].value !== ',' &&
                                    tokens[k].value !== '.' &&
                                    tokens[k].type !== TokenType.Comment) {
                                    hasValue = true;
                                    break;
                                }
                            }
                            returnStatements.push({ line: tokens[j].line, hasValue });
                        }
                    }

                    const implToken = i > 0 ? tokens[i - 1] : token;

                    if (returnStatements.length === 0) {
                        diagnostics.push({
                            severity: DiagnosticSeverity.Error,
                            range: {
                                start: { line: implToken.line, character: implToken.start },
                                end: { line: implToken.line, character: implToken.start + implToken.value.length }
                            },
                            message: `Procedure '${decl.name}' returns ${decl.returnType} but has no RETURN statement`,
                            source: 'clarion'
                        });
                    } else if (returnStatements.every(r => !r.hasValue)) {
                        diagnostics.push({
                            severity: DiagnosticSeverity.Error,
                            range: {
                                start: { line: implToken.line, character: implToken.start },
                                end: { line: implToken.line, character: implToken.start + implToken.value.length }
                            },
                            message: `Procedure '${decl.name}' returns ${decl.returnType} but all RETURN statements are empty`,
                            source: 'clarion'
                        });
                    }

                    break;
                }
            }
        }
    }

    return diagnostics;
}

export function validateDiscardedReturnValuesForPlainCalls(
    tokens: Token[],
    document: TextDocument
): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    const docLines = document.getText().split('\n');

    const warnableProcs = new Map<string, string>();
    const excluded = new Set<string>();

    const hasSubType = tokens.some(t => t.subType === TokenType.MapProcedure);

    if (hasSubType) {
        for (let i = 0; i < tokens.length; i++) {
            const t = tokens[i];
            if (t.subType !== TokenType.MapProcedure) continue;

            const name = (t.label ?? t.value.split('(')[0].trim()).toUpperCase();
            if (!name || excluded.has(name)) continue;

            const lineTokens = tokens.filter(tok => tok.line === t.line);
            if (lineTokens.some(tok => ['PROC', 'DERIVED'].includes(tok.value.toUpperCase()))) {
                excluded.add(name);
                warnableProcs.delete(name);
                continue;
            }

            let startIdx = i;
            {
                // Skip past the parameter list '(...)' regardless of token type.
                // See the same fix in validateCrossFilePlainCalls for the rationale.
                let depth = 0;
                for (let k = i; k < tokens.length && tokens[k].line === t.line; k++) {
                    if (tokens[k].value === '(') depth++;
                    else if (tokens[k].value === ')') {
                        depth--;
                        if (depth === 0) { startIdx = k + 1; break; }
                    }
                }
            }

            // Guard: startIdx must still be on the same declaration line.
            if (startIdx >= tokens.length || tokens[startIdx].line !== t.line) {
                excluded.add(name);
                warnableProcs.delete(name);
                continue;
            }

            const returnType = extractReturnType(tokens, startIdx, true);
            if (!returnType) {
                excluded.add(name);
                warnableProcs.delete(name);
                continue;
            }
            if (!excluded.has(name)) warnableProcs.set(name, returnType);
        }
    }

    // Also collect GlobalProcedure subtypes defined in this file.
    // The MAP/CLASS passes above only find declarations; a procedure with a body
    // (GlobalProcedure) that is never declared in a MAP is missed by those paths.
    for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i];
        if (!TokenHelper.isProcedureOrFunction(t) || t.subType !== TokenType.GlobalProcedure) continue;

        const name = (t.label ?? '').toUpperCase();
        if (!name || excluded.has(name)) continue;

        const lineTokens = tokens.filter(tok => tok.line === t.line);
        if (lineTokens.some(tok => ['PROC', 'DERIVED'].includes(tok.value.toUpperCase()))) {
            excluded.add(name);
            warnableProcs.delete(name);
            continue;
        }

        // Find the closing ')' of the parameter list then check for a return type
        let afterIdx = -1;
        let depth = 0;
        for (let k = i; k < tokens.length && tokens[k].line === t.line; k++) {
            if (tokens[k].value === '(') depth++;
            else if (tokens[k].value === ')') {
                depth--;
                if (depth === 0) { afterIdx = k + 1; break; }
            }
        }
        if (afterIdx === -1 || afterIdx >= tokens.length || tokens[afterIdx].line !== t.line) continue;

        const returnType = extractReturnType(tokens, afterIdx, true);
        if (!returnType) continue;
        if (!excluded.has(name)) warnableProcs.set(name, returnType);
    }

    if (warnableProcs.size === 0) return diagnostics;

    interface PlainCodeRange { start: number; end: number; }
    const codeRanges: PlainCodeRange[] = [];

    if (tokens.some(t => t.executionMarker)) {
        for (const r of getCodeBlockRanges(tokens)) {
            codeRanges.push({ start: r.start, end: r.end });
        }
    } else {
        let nonExecDepth = 0;
        let codeStart = -1;
        for (let i = 0; i < tokens.length; i++) {
            const t = tokens[i];
            const val = t.value.toUpperCase();

            if (t.type === TokenType.Structure && (val === 'MAP' || val === 'CLASS' || val === 'INTERFACE')) {
                if (codeStart !== -1) {
                    codeRanges.push({ start: codeStart, end: t.line - 1 });
                    codeStart = -1;
                }
                nonExecDepth++;
            }
            if (t.type === TokenType.EndStatement && nonExecDepth > 0) nonExecDepth--;
            if (nonExecDepth > 0) continue;

            if (t.type === TokenType.ExecutionMarker && val === 'CODE') {
                codeStart = t.line + 1;
                continue;
            }

            if (codeStart !== -1 &&
                (TokenHelper.isProcedureOrFunction(t) || t.type === TokenType.Routine) &&
                (val === 'PROCEDURE' || val === 'FUNCTION' || val === 'ROUTINE') &&
                t.line > codeStart) {
                const labelOnLine = tokens.find(l =>
                    l.line === t.line && l.start === 0 && l.type === TokenType.Label
                );
                if (labelOnLine) {
                    codeRanges.push({ start: codeStart, end: t.line - 1 });
                    codeStart = -1;
                }
            }
        }
        if (codeStart !== -1) {
            codeRanges.push({ start: codeStart, end: tokens[tokens.length - 1]?.line ?? 0 });
        }
    }

    if (codeRanges.length === 0) return diagnostics;

    const ASSIGN_RE = /^[A-Za-z_][A-Za-z0-9_:]*\s*[+\-*/&|]?=/;

    for (let lineIdx = 0; lineIdx < docLines.length; lineIdx++) {
        if (!codeRanges.some(r => lineIdx >= r.start && lineIdx <= r.end)) continue;

        const rawLine = docLines[lineIdx];
        const stripped = rawLine.replace(/!.*$/, '').trim();
        if (!stripped) continue;

        if (ASSIGN_RE.test(stripped)) continue;
        if (/^[A-Za-z_][A-Za-z0-9_]*\./.test(stripped)) continue;

        const identMatch = stripped.match(/^([A-Za-z_][A-Za-z0-9_]*)/);
        if (!identMatch) continue;

        const callName = identMatch[1];
        if (!warnableProcs.has(callName.toUpperCase())) continue;

        const afterIdent = stripped.substring(callName.length).trimStart();
        if (afterIdent !== '') {
            if (!afterIdent.startsWith('(')) continue;
            let depth = 0, closeIdx = -1;
            for (let ci = 0; ci < afterIdent.length; ci++) {
                if (afterIdent[ci] === '(') depth++;
                else if (afterIdent[ci] === ')') {
                    depth--;
                    if (depth === 0) { closeIdx = ci; break; }
                }
            }
            if (closeIdx === -1) continue;
            if (afterIdent.substring(closeIdx + 1).trim()) continue;
        }

        const colStart = rawLine.search(/\S/);
        diagnostics.push({
            severity: DiagnosticSeverity.Warning,
            range: {
                start: { line: lineIdx, character: colStart >= 0 ? colStart : 0 },
                end: { line: lineIdx, character: colStart + stripped.length }
            },
            message: `Return value of '${callName}' is discarded. Capture the return value or add the PROC attribute to the declaration to suppress this warning.`,
            source: 'clarion'
        });
    }

    logger.info(`🔍 [RVD] validateDiscardedReturnValuesForPlainCalls produced ${diagnostics.length} diags uri=${document.uri}`);
    return diagnostics;
}

export async function validateDiscardedReturnValues(
    tokens: Token[],
    document: TextDocument,
    memberLocator: MemberLocatorService,
    getOpenDocumentContent?: (absPath: string) => string | null
): Promise<Diagnostic[]> {
    const fnStart = Date.now();
    const diagnostics: Diagnostic[] = [];
    const docLines = document.getText().split('\n');
    const codeRanges = getCodeBlockRanges(tokens);
    if (codeRanges.length === 0) {
        perfLogger.perf("validateDiscardedReturnValues early-exit (no code ranges)", {
            ms: Date.now() - fnStart,
            uri: document.uri
        });
        return diagnostics;
    }

    const DOTCALL_PREFIX = /^([A-Za-z_][A-Za-z0-9_]*)\.([A-Za-z_][A-Za-z0-9_]*)/;

    // #158 Phase B Priority 1 — per-call-site memoization. Pre-#158 this loop
    // called `memberLocator.findMemberInClass` / `resolveDotAccess` once PER
    // line for every dot-access call site. On hot files (StringTheory.clw,
    // 72k tokens, hundreds of repeated `obj.method` patterns), that meant
    // hundreds of full cross-file include-chain walks. Most call sites
    // resolve to the same (objUpper, methodName.toUpper(), paramCount,
    // selfContext) tuple — so cache the promise per tuple and reuse.
    //
    // Cache key includes `selfContext` (range.selfClassName for SELF/PARENT)
    // because the receiver-class context can differ per code-range within
    // the same file (e.g., two CLASSes each with their own SELF references).
    const memberCache = new Map<string, Promise<{ type: string } | null>>();
    let dotCallSites = 0;
    let cacheHits = 0;

    // #305 — the #158 tuple memo only collapses REPEATS of the same method; distinct
    // methods on the same receiver each still paid a full multi-tier cross-file walk
    // (16s for 22 sites / 14 unique tuples on a generated report module — inherited
    // members miss every include-chain tier before the parent-chain tier hits).
    // Receivers repeat far more than (receiver, method) tuples, so:
    //   1. resolve each receiver's TYPE once (typeMemo), and
    //   2. enumerate each unique receiver CLASS's members (incl. ancestors) once
    //      (classMembersMemo, one inheritance-chain walk), answering every method
    //      lookup from the enumeration.
    // `callerClass=className` disables the access filter — parity with
    // findMemberInClass, which never filtered. A class that can't be enumerated
    // (interface receivers, GROUP/QUEUE types, unresolvable) falls back to the
    // #158 per-site path so decisions never regress.
    //
    // #345 phase 4: the memos were per-PASS — GlobalErrors re-resolved (2.5s)
    // and ErrorClass re-enumerated (184 members) on every one of the 4 startup
    // passes (cache_hits=0 measured on every pass). Module-level now, keyed by
    // (docUri, docVersion) with the #340 watcher epoch clearing everything on
    // any cross-file change.
    const rvdEpochNow = getCrossFileEpoch();
    if (rvdEpochNow !== rvdMemoEpoch || rvdTypeMemo.size > 500 || rvdTypeMemoFiles.size > 500 ||
        rvdClassMembersMemo.size > 500 || rvdClassMembersFiles.size > 500) {
        // #358: both memos are gated by their DECLARING files (recorded as contributing-file
        // mtimes), not the open doc — on an epoch bump validate each entry against those mtimes
        // instead of wiping wholesale. Library classes (StringTheory 1394 members) and stable
        // receiver types (GlobalErrors, ~1.3s to resolve) whose files never changed survive the
        // bump — the "warm was cold in disguise" cost this issue is about. The >500 ceiling
        // hard-resets each memo+files pair together; that also reaps any fingerprint orphaned
        // when an in-flight resolution's entry was dropped mid-build below.
        if (rvdTypeMemo.size > 500 || rvdTypeMemoFiles.size > 500) {
            rvdTypeMemo.clear();
            rvdTypeMemoFiles.clear();
        } else if (rvdEpochNow !== rvdMemoEpoch) {
            rvdRevalidateMemoByMtime(rvdTypeMemo, rvdTypeMemoFiles);
        }
        if (rvdClassMembersMemo.size > 500 || rvdClassMembersFiles.size > 500) {
            rvdClassMembersMemo.clear();
            rvdClassMembersFiles.clear();
        } else if (rvdEpochNow !== rvdMemoEpoch) {
            rvdRevalidateMemoByMtime(rvdClassMembersMemo, rvdClassMembersFiles);
        }
        rvdMemoEpoch = rvdEpochNow;
    }
    // Content is part of the identity (the #340/#344 lesson) — same uri+version
    // with different text (test fixtures, unsaved flows) must never share memos.
    const rvdText = document.getText();
    let rvdHash = 5381;
    for (let i = 0; i < rvdText.length; i += 127) {
        rvdHash = ((rvdHash * 33) ^ rvdText.charCodeAt(i)) >>> 0;
    }
    const rvdDocKey = `${document.uri.toLowerCase()}|${document.version}|${rvdText.length}|${rvdHash}`;
    // #358: the open doc's own FS path, so class members enumerated from live tokens are
    // excluded from the mtime fingerprint (their validity is pinned by rvdDocKey above).
    const openDocPathLower = decodeURIComponent(document.uri.replace(/^file:\/\/\//, '')).replace(/\//g, '\\').toLowerCase();
    const typeMemo = {
        get: (k: string) => rvdTypeMemo.get(`${rvdDocKey}|${k}`),
        set: (k: string, v: Promise<{ typeName: string; isClass: boolean; isReference: boolean } | null>) =>
            rvdTypeMemo.set(`${rvdDocKey}|${k}`, v),
    };
    const classMembersMemo = {
        get: (k: string) => rvdClassMembersMemo.get(`${rvdDocKey}|${k}`),
        set: (k: string, v: Promise<Map<string, OverloadCandidate[]> | null>) =>
            rvdClassMembersMemo.set(`${rvdDocKey}|${k}`, v),
    };
    let enumResolvedSites = 0;
    let fallbackSites = 0;

    const countParamsInSignature = (line: string): number => {
        const match = line.match(/(?:PROCEDURE|FUNCTION)\s*\(([^)]*)\)/i); // #247
        if (!match) return 0;
        const paramList = match[1].trim();
        if (!paramList) return 0;
        let depth = 0, count = 0;
        for (const char of paramList) {
            if (char === '(') depth++;
            else if (char === ')') depth--;
            else if (char === ',' && depth === 0) count++;
        }
        return count + 1;
    };

    const getClassMembers = (className: string): Promise<Map<string, OverloadCandidate[]> | null> => {
        const classKey = className.toLowerCase();
        const fullKey = `${rvdDocKey}|${classKey}`; // #358: aligns with classMembersMemo's stored key
        let promise = classMembersMemo.get(classKey);
        if (!promise) {
            promise = (async () => {
                try {
                    const enumStart = Date.now();
                    const items = await memberLocator.enumerateMembersInClass(className, document, className);
                    const enumMs = Date.now() - enumStart;
                    if (enumMs >= 250) {
                        perfLogger.perf("RVD slow class enumeration", {
                            class: className, ms: enumMs, members: items?.length ?? 0
                        });
                    }
                    if (!items || items.length === 0) {
                        rvdClassMembersFiles.set(fullKey, null); // #358: no provenance → drop on next bump
                        return null;
                    }
                    // #358: record the declaring-file mtimes so this entry survives an epoch bump
                    // when those files are unchanged (excludes the open doc, pinned by rvdDocKey).
                    rvdClassMembersFiles.set(fullKey, rvdFingerprintPaths(items.map(it => it.file), openDocPathLower));
                    const byName = new Map<string, OverloadCandidate[]>();
                    for (const item of items) {
                        const nameKey = item.name.toLowerCase();
                        let list = byName.get(nameKey);
                        if (!list) { list = []; byName.set(nameKey, list); }
                        list.push({
                            type: item.type,
                            line: item.line,
                            paramCount: countParamsInSignature(item.signature),
                            signature: item.signature
                        });
                    }
                    return byName;
                } catch {
                    rvdClassMembersFiles.set(fullKey, null); // #358: enumeration failure → drop on next bump
                    return null; // enumeration failure → per-site fallback, never a dead validator
                }
            })();
            classMembersMemo.set(classKey, promise);
        }
        return promise;
    };

    // #297: this loop measured 3.9s on a 5k-token generated module (dotcall_loop_ms=3876,
    // essentially one sync stretch) and scales with document size — on the 20k-token gl1.clw
    // it pinned the LSP loop long enough to starve an in-memory tree request past its 15s
    // timeout. Yield on a time budget so interactive requests interleave.
    const timeSlice = makeTimeSlicer();

    for (let lineIdx = 0; lineIdx < docLines.length; lineIdx++) {
        await timeSlice();
        const range = codeRanges.find(r => lineIdx >= r.start && lineIdx <= r.end);
        if (!range) continue;

        const rawLine = docLines[lineIdx];
        const stripped = rawLine.replace(/!.*$/, '').trim();
        if (!stripped) continue;

        const prefixMatch = stripped.match(DOTCALL_PREFIX);
        if (!prefixMatch) continue;

        const objectName = prefixMatch[1];
        const methodName = prefixMatch[2];
        const afterMatch = stripped.substring(prefixMatch[0].length).trimStart();

        let argsStr = '';
        if (afterMatch === '') {
            // no-paren call
        } else if (afterMatch.startsWith('(')) {
            let depth = 0;
            let closeIdx = -1;
            for (let i = 0; i < afterMatch.length; i++) {
                if (afterMatch[i] === '(') depth++;
                else if (afterMatch[i] === ')') {
                    depth--;
                    if (depth === 0) { closeIdx = i; break; }
                }
            }
            if (closeIdx === -1) continue;
            const afterClose = afterMatch.substring(closeIdx + 1).trim();
            if (afterClose) continue;
            argsStr = afterMatch.substring(1, closeIdx);
        } else {
            continue;
        }

        let paramCount = 0;
        if (argsStr.trim()) {
            paramCount = 1;
            let depth = 0;
            for (const ch of argsStr) {
                if (ch === '(' || ch === '[') depth++;
                else if (ch === ')' || ch === ']') depth--;
                else if (ch === ',' && depth === 0) paramCount++;
            }
        }

        dotCallSites++;

        const objUpper = objectName.toUpperCase();
        const isSelfOrParent = objUpper === 'SELF' || objUpper === 'PARENT';
        if (isSelfOrParent && !range.selfClassName) continue;

        // #305: receiver class — from the code range for SELF/PARENT, else one
        // memoized type resolution per receiver name.
        let className: string | null;
        if (isSelfOrParent) {
            className = range.selfClassName!;
        } else {
            let typePromise = typeMemo.get(objUpper);
            if (!typePromise) {
                // #310 follow-up: name slow receiver-type resolutions — the 8.5s→6.6s
                // shortfall means the cost split (type resolution vs enumeration vs
                // guard-skipped SDI) is not what the aggregate line suggests.
                const typeStart = Date.now();
                const typeFullKey = `${rvdDocKey}|${objUpper}`; // #358: aligns with typeMemo's stored key
                // #358: capture the file(s) whose content determined this type so the memo
                // survives an unrelated epoch bump (GlobalErrors ~1.3s otherwise re-resolves).
                const typeProvenance = new Set<string>();
                typePromise = memberLocator.resolveVariableType(objectName, tokens, document, undefined, typeProvenance);
                typePromise.then((info) => {
                    rvdTypeMemoFiles.set(typeFullKey, info
                        ? rvdFingerprintPaths(typeProvenance, openDocPathLower)
                        : null); // #358: unresolved type → no provenance → drop on next bump
                    const typeMs = Date.now() - typeStart;
                    if (typeMs >= 250) {
                        perfLogger.perf("RVD slow receiver-type resolution", { object: objectName, ms: typeMs });
                    }
                }).catch(() => { rvdTypeMemoFiles.set(typeFullKey, null); });
                typeMemo.set(objUpper, typePromise);
            }
            const typeInfo = await typePromise;
            if (!typeInfo) {
                logger.debug(`🔍 Line ${lineIdx + 1}: receiver type unresolved for ${objectName}.${methodName}`);
                continue; // parity: resolveDotAccess skipped on a type miss
            }
            className = typeInfo.typeName;
        }

        let typeStr: string | null = null;
        const members = await getClassMembers(className);
        if (members) {
            enumResolvedSites++;
            const candidates = members.get(methodName.toLowerCase());
            // Class known, member absent → the tiered path also resolved null here.
            if (!candidates || candidates.length === 0) continue;
            const best = selectBestMemberOverload(candidates, paramCount);
            if (!best) continue;
            typeStr = best.type;
        } else {
            // Class not enumerable — #158 per-site tiered path (interface receivers,
            // GROUP/QUEUE types), memoized per (obj|method|paramCount|selfContext).
            fallbackSites++;
            const selfContext = isSelfOrParent ? (range.selfClassName ?? '') : '';
            const cacheKey = `${objUpper}|${methodName.toUpperCase()}|${paramCount}|${selfContext}`;

            let memberInfoPromise = memberCache.get(cacheKey);
            if (!memberInfoPromise) {
                if (isSelfOrParent) {
                    memberInfoPromise = memberLocator.findMemberInClass(range.selfClassName!, methodName, document, paramCount);
                } else {
                    memberInfoPromise = memberLocator.resolveDotAccess(objectName, methodName, document, paramCount);
                }
                memberCache.set(cacheKey, memberInfoPromise);
            } else {
                cacheHits++;
            }
            const memberInfo = await memberInfoPromise;

            if (!memberInfo) {
                logger.debug(`🔍 Line ${lineIdx + 1}: no memberInfo resolved for ${objectName}.${methodName}`);
                continue;
            }
            typeStr = memberInfo.type ?? '';
        }

        logger.debug(`🔍 Line ${lineIdx + 1}: ${objectName}.${methodName} → type="${typeStr}" isNonProc=${isNonProcReturnMethod(typeStr ?? '')}`);
        if (!isNonProcReturnMethod(typeStr ?? '')) continue;

        const colStart = rawLine.search(/\S/);
        diagnostics.push({
            severity: DiagnosticSeverity.Warning,
            range: {
                start: { line: lineIdx, character: colStart >= 0 ? colStart : 0 },
                end: { line: lineIdx, character: colStart + stripped.length }
            },
            message: `Return value of '${objectName}.${methodName}' is discarded. Capture the return value or add the PROC attribute to the declaration to suppress this warning.`,
            source: 'clarion'
        });
    }

    const dotCallMs = Date.now() - fnStart;

    const crossFileStart = Date.now();
    const crossFileDiags = validateCrossFilePlainCalls(tokens, document, docLines, codeRanges, getOpenDocumentContent);
    diagnostics.push(...crossFileDiags);
    const crossFileMs = Date.now() - crossFileStart;

    perfLogger.perf("validateDiscardedReturnValues complete", {
        total_ms: Date.now() - fnStart,
        dotcall_loop_ms: dotCallMs,
        crossfile_ms: crossFileMs,
        crossfile_files_scanned: lastCrossFileFilesScanned,
        dotcall_sites: dotCallSites,
        enum_classes: rvdClassMembersMemo.size,
        enum_resolved_sites: enumResolvedSites,
        fallback_sites: fallbackSites,
        cache_hits: cacheHits,
        cache_unique_keys: memberCache.size,
        diag_count: diagnostics.length,
        uri: document.uri
    });

    return diagnostics;
}
