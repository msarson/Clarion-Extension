import { TextDocument } from 'vscode-languageserver-textdocument';
import { Diagnostic, DiagnosticSeverity } from 'vscode-languageserver/node';
import { Token, TokenType } from '../../ClarionTokenizer';
import { extractReturnType } from '../../utils/AttributeKeywords';
import { ProcedureSignatureUtils } from '../../utils/ProcedureSignatureUtils';
import { MemberLocatorService } from '../../services/MemberLocatorService';
import { TokenCache } from '../../TokenCache';
import LoggerManager from '../../logger';

const logger = LoggerManager.getLogger("ReturnValueDiagnostics");
logger.setLevel("error");

// ─── Private helpers ─────────────────────────────────────────────────────────

function getCodeBlockRanges(
    tokens: Token[]
): { start: number; end: number; selfClassName: string | null }[] {
    const ranges: { start: number; end: number; selfClassName: string | null }[] = [];

    for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i];
        if (t.type !== TokenType.Procedure && t.type !== TokenType.Routine) continue;
        if (!t.executionMarker) continue;

        const sub = t.subType;
        if (sub === TokenType.MethodDeclaration || sub === TokenType.InterfaceMethod) continue;

        const codeStart = t.executionMarker.line + 1;
        const procEnd = t.finishesAt ?? tokens[tokens.length - 1].line;

        let selfClassName: string | null = null;
        for (let k = i - 1; k >= 0; k--) {
            if (tokens[k].line < t.line) break;
            if (tokens[k].type === TokenType.Label && tokens[k].start === 0) {
                const parts = tokens[k].value.split('.');
                selfClassName = parts.length >= 2 ? parts[0] : null;
                break;
            }
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

function validateCrossFilePlainCalls(
    currentTokens: Token[],
    document: TextDocument,
    docLines: string[],
    codeRanges: { start: number; end: number }[]
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

    for (const uri of cache.getAllCachedUris()) {
        if (uri === currentUri) continue;
        const otherTokens = cache.getTokensByUri(uri);
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
            if (t.type === TokenType.Procedure) {
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

export function validateReturnStatements(tokens: Token[], document: TextDocument): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    const docLines = document.getText().split('\n');

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
                if ((tokens[j].type === TokenType.Procedure || tokens[j].type === TokenType.Routine) &&
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
                if ((tokens[j].type === TokenType.Procedure || tokens[j].type === TokenType.Routine) &&
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
        let inMapOrClass = false;
        let mapClassDepth = 0;

        for (let i = 0; i < tokens.length; i++) {
            const token = tokens[i];

            if (token.type === TokenType.Structure &&
                (token.value.toUpperCase() === 'MAP' || token.value.toUpperCase() === 'CLASS')) {
                inMapOrClass = true;
                mapClassDepth++;
            }

            if (token.value.toUpperCase() === 'END' && token.type === TokenType.EndStatement) {
                if (mapClassDepth > 0) {
                    mapClassDepth--;
                    if (mapClassDepth === 0) inMapOrClass = false;
                }
            }

            if (inMapOrClass) continue;

            if ((token.type === TokenType.Procedure || token.type === TokenType.Routine) &&
                (token.value.toUpperCase() === 'PROCEDURE' || token.value.toUpperCase() === 'FUNCTION')) {

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
                        if ((tokens[j].type === TokenType.Procedure || tokens[j].type === TokenType.Routine) &&
                            (tokens[j].value.toUpperCase() === 'PROCEDURE' || tokens[j].value.toUpperCase() === 'FUNCTION')) {
                            break;
                        }
                    }

                    if (codeLineStart === -1) continue;

                    let procedureEndLine = tokens[tokens.length - 1].line;
                    for (let j = i + 1; j < tokens.length; j++) {
                        if (j !== i && tokens[j].type === TokenType.Label) {
                            if (j + 1 < tokens.length &&
                                (tokens[j + 1].type === TokenType.Procedure || tokens[j + 1].type === TokenType.Routine) &&
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
            if (t.type === TokenType.Procedure) {
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
    } else {
        let mapClassDepth = 0;
        for (let i = 0; i < tokens.length; i++) {
            const t = tokens[i];
            const val = t.value.toUpperCase();

            if (t.type === TokenType.Structure && (val === 'MAP' || val === 'CLASS')) mapClassDepth++;
            if (t.type === TokenType.EndStatement && mapClassDepth > 0) mapClassDepth--;

            if (mapClassDepth === 0) continue;
            if (t.type !== TokenType.Procedure && t.type !== TokenType.Routine) continue;
            if (val !== 'PROCEDURE' && val !== 'FUNCTION') continue;

            const nameToken = tokens.find(n =>
                n.line === t.line && n.start === 0 && n.type === TokenType.Label
            );
            if (!nameToken) continue;

            const name = nameToken.value.toUpperCase();
            if (excluded.has(name)) continue;

            const lineTokens = tokens.filter(tok => tok.line === t.line);
            if (lineTokens.some(tok => ['PROC', 'DERIVED'].includes(tok.value.toUpperCase()))) {
                excluded.add(name);
                warnableProcs.delete(name);
                continue;
            }

            let depth = 0, afterIdx = -1;
            for (let k = i; k < tokens.length && tokens[k].line === t.line; k++) {
                if (tokens[k].value === '(') depth++;
                else if (tokens[k].value === ')') {
                    depth--;
                    if (depth === 0) { afterIdx = k + 1; break; }
                }
            }
            if (afterIdx === -1) continue;

            // Guard: afterIdx must still be on the same declaration line.
            if (afterIdx >= tokens.length || tokens[afterIdx].line !== t.line) {
                excluded.add(name);
                warnableProcs.delete(name);
                continue;
            }

            const returnType = extractReturnType(tokens, afterIdx, true);
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
        if (t.type !== TokenType.Procedure || t.subType !== TokenType.GlobalProcedure) continue;

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
                (t.type === TokenType.Procedure || t.type === TokenType.Routine) &&
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
    memberLocator: MemberLocatorService
): Promise<Diagnostic[]> {
    const diagnostics: Diagnostic[] = [];
    const docLines = document.getText().split('\n');
    const codeRanges = getCodeBlockRanges(tokens);
    if (codeRanges.length === 0) return diagnostics;

    const DOTCALL_PREFIX = /^([A-Za-z_][A-Za-z0-9_]*)\.([A-Za-z_][A-Za-z0-9_]*)/;

    for (let lineIdx = 0; lineIdx < docLines.length; lineIdx++) {
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

        let memberInfo;
        const objUpper = objectName.toUpperCase();
        if (objUpper === 'SELF' || objUpper === 'PARENT') {
            if (!range.selfClassName) continue;
            memberInfo = await memberLocator.findMemberInClass(range.selfClassName, methodName, document, paramCount);
        } else {
            memberInfo = await memberLocator.resolveDotAccess(objectName, methodName, document, paramCount);
        }

        if (!memberInfo) {
            logger.debug(`🔍 Line ${lineIdx + 1}: no memberInfo resolved for ${objectName}.${methodName}`);
            continue;
        }
        logger.debug(`🔍 Line ${lineIdx + 1}: ${objectName}.${methodName} → type="${memberInfo.type}" isNonProc=${isNonProcReturnMethod(memberInfo.type ?? '')}`);
        if (!isNonProcReturnMethod(memberInfo.type ?? '')) continue;

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

    const crossFileDiags = validateCrossFilePlainCalls(tokens, document, docLines, codeRanges);
    diagnostics.push(...crossFileDiags);

    return diagnostics;
}
