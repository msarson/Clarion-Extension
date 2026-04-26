import {
    TextDocument,
    Range,
    CodeAction,
    CodeActionKind,
    WorkspaceEdit,
    TextEdit,
    Position,
    CodeActionContext
} from 'vscode-languageserver/node';
import { TokenCache } from '../TokenCache';
import { TokenType } from '../tokenizer/TokenTypes';
import { ProcedureSignatureUtils } from '../utils/ProcedureSignatureUtils';
import { SolutionManager } from '../solution/solutionManager';
import { FileRelationshipGraph } from '../FileRelationshipGraph';
import * as fs from 'fs';
import * as path from 'path';
import LoggerManager from '../logger';

const logger = LoggerManager.getLogger('MapDeclarationCodeActionProvider');
logger.setLevel('error');

// ─── helpers ─────────────────────────────────────────────────────────────────

function uriToPath(uri: string): string {
    return decodeURIComponent(uri.replace(/^file:\/\/\//i, '')).replace(/\//g, '\\');
}

function pathToUri(absPath: string): string {
    return 'file:///' + absPath.replace(/\\/g, '/');
}

/**
 * Resolve a bare CLW filename to an absolute path using the redirection parser,
 * falling back to resolving relative to a sibling file's directory.
 */
function resolveClwPath(bareOrAbsolute: string, siblingFilePath?: string): string | null {
    if (path.isAbsolute(bareOrAbsolute) && fs.existsSync(bareOrAbsolute)) {
        return bareOrAbsolute;
    }

    // Try redirection parser first (same as compiler)
    const solutionManager = SolutionManager.getInstance();
    if (solutionManager?.solution) {
        for (const proj of solutionManager.solution.projects) {
            const resolved = proj.getRedirectionParser().findFile(bareOrAbsolute);
            logger.debug(`🔍 [resolveClwPath] resolved=${JSON.stringify(resolved)}`);
            if (resolved?.path && fs.existsSync(resolved.path)) {
                return resolved.path;
            }
        }
    } else {
        logger.debug(`⚠️ [resolveClwPath] SolutionManager has no solution loaded`);
    }

    // Fall back: try same directory as sibling file
    if (siblingFilePath) {
        const candidate = path.join(path.dirname(siblingFilePath), path.basename(bareOrAbsolute));
        logger.debug(`🔍 [resolveClwPath] sibling fallback: ${candidate}`);
        if (fs.existsSync(candidate)) return candidate;
    }

    return null;
}

/** Return the leading whitespace of a line. */
function lineIndent(line: string): string {
    return line.match(/^(\s*)/)?.[1] ?? '';
}

/** Detect indentation used by declarations inside a MODULE block. */
function detectModuleBodyIndent(lines: string[], modLine: number, modEndLine: number, fallback: string): string {
    for (let i = modLine + 1; i < modEndLine; i++) {
        const l = lines[i];
        if (l.trim()) return lineIndent(l);
    }
    return fallback;
}

/**
 * Provides Ctrl+. quick-fix code actions for MAP declaration / implementation diagnostics.
 * Diagnostic codes handled: missing-map-declaration, map-signature-mismatch,
 *                           missing-map-implementation, map-impl-signature-mismatch
 */
export class MapDeclarationCodeActionProvider {

    provideCodeActions(document: TextDocument, _range: Range, context: CodeActionContext): CodeAction[] {
        const actions: CodeAction[] = [];

        for (const diag of context.diagnostics) {
            if (diag.source !== 'clarion') continue;

            try {
                switch (diag.code) {
                    case 'missing-map-declaration':
                        actions.push(...this.fixMissingDeclaration(document, diag.data as MissingDeclData));
                        break;
                    case 'map-signature-mismatch':
                        actions.push(...this.fixSignatureMismatchMemberSide(document, diag.data as SigMismatchMemberData));
                        break;
                    case 'missing-map-implementation':
                        actions.push(...this.fixMissingImplementation(document, diag.data as MissingImplData));
                        break;
                    case 'map-impl-signature-mismatch':
                        actions.push(...this.fixSignatureMismatchProgramSide(document, diag.data as SigMismatchProgramData));
                        break;
                }
            } catch (err) {
                logger.error(`Error building code action for '${diag.code}': ${err instanceof Error ? err.message : String(err)}`);
            }
        }

        return actions;
    }

    // ─── missing-map-declaration ────────────────────────────────────────────

    private fixMissingDeclaration(document: TextDocument, data: MissingDeclData): CodeAction[] {
        if (!data?.procName || !data.parentFileUri) return [];

        const parentPath = uriToPath(data.parentFileUri);
        if (!fs.existsSync(parentPath)) return [];

        // Extract the raw parameter list from the implementation line
        const docLines = document.getText().split('\n');
        const implLineText = docLines[data.implLine] ?? '';
        const rawParams = ProcedureSignatureUtils.extractRawParameterList(implLineText);

        // Tokenize parent file to find MODULE blocks
        const parentContent = fs.readFileSync(parentPath, 'utf8');
        const parentLines = parentContent.split('\n');
        const parentDoc = TextDocument.create(pathToUri(parentPath), 'clarion', 1, parentContent);
        const tokenCache = TokenCache.getInstance();
        const parentTokens = tokenCache.getTokens(parentDoc);

        // Current file basename for matching MODULE.referencedFile
        const currentPath = uriToPath(data.currentFileUri);
        const currentBasename = path.basename(currentPath).toLowerCase();

        // Find MODULE token that references the current CLW
        const matchingModule = parentTokens.find(t =>
            t.type === TokenType.Structure &&
            t.value.toUpperCase() === 'MODULE' &&
            t.referencedFile &&
            path.basename(t.referencedFile).toLowerCase() === currentBasename &&
            t.finishesAt !== undefined
        );

        let insertLine: number;
        let insertText: string;

        if (matchingModule) {
            // Insert before the MODULE's END
            const indent = detectModuleBodyIndent(
                parentLines,
                matchingModule.line,
                matchingModule.finishesAt!,
                ' '.repeat(matchingModule.start + 2)
            );
            insertLine = matchingModule.finishesAt!;
            insertText = `${indent}${data.procName} PROCEDURE${rawParams}\n`;
        } else {
            // No matching MODULE — find the global MAP and add a new MODULE block
            const globalMap = parentTokens.find(t =>
                t.type === TokenType.Structure &&
                t.value.toUpperCase() === 'MAP' &&
                t.finishesAt !== undefined &&
                // Global MAP: not nested inside a procedure (parent is not a Procedure token)
                (t.parent === undefined || t.parent.type !== TokenType.Procedure)
            );

            if (!globalMap) return [];

            const mapIndent = lineIndent(parentLines[globalMap.line] ?? '');
            const modIndent = mapIndent + '  ';
            const declIndent = modIndent + '  ';
            insertLine = globalMap.finishesAt!;
            insertText = `${modIndent}MODULE('${path.basename(currentPath)}')\n${declIndent}${data.procName} PROCEDURE${rawParams}\n${modIndent}END\n`;
        }

        const edit: WorkspaceEdit = {
            changes: {
                [pathToUri(parentPath)]: [
                    TextEdit.insert(Position.create(insertLine, 0), insertText)
                ]
            }
        };

        return [{
            title: `Add '${data.procName}' declaration to MAP in '${path.basename(parentPath)}'`,
            kind: CodeActionKind.QuickFix,
            isPreferred: true,
            edit
        }];
    }

    // ─── map-signature-mismatch (MEMBER file side) ──────────────────────────

    private fixSignatureMismatchMemberSide(document: TextDocument, data: SigMismatchMemberData): CodeAction[] {
        if (!data?.procName || !data.parentFileUri) return [];

        const parentPath = uriToPath(data.parentFileUri);
        if (!fs.existsSync(parentPath)) return [];

        const docLines = document.getText().split('\n');
        const implLineText = docLines[data.implLine] ?? '';
        const implSpan = ProcedureSignatureUtils.findParameterListSpan(implLineText);

        // For same-file declarations (Cases 1 & 2) use the live document text; otherwise read disk
        const isSameFile = data.parentFileUri.toLowerCase() === data.currentFileUri.toLowerCase();
        const parentContent = isSameFile ? document.getText() : fs.readFileSync(parentPath, 'utf8');
        const parentLines = parentContent.split('\n');
        const declLineText = parentLines[data.declLine] ?? '';
        const declSpan = ProcedureSignatureUtils.findParameterListSpan(declLineText);

        if (!implSpan || !declSpan) return [];

        const implParams = implLineText.slice(implSpan.start, implSpan.end);
        const declParams = declLineText.slice(declSpan.start, declSpan.end);
        const implFilePath = uriToPath(document.uri);
        const actions: CodeAction[] = [];

        // Action 1: update ALL declarations to match implementation
        const allDeclChanges = this.collectAllDeclarationEdits(data.procName, implFilePath, implParams);
        // Ensure the diagnostic's own decl site is included (covers proc-level MAP, not in FRG)
        const diagDeclUri = isSameFile ? document.uri : pathToUri(parentPath);
        if (!(allDeclChanges[diagDeclUri] ?? []).some(e => e.range.start.line === data.declLine)) {
            if (!allDeclChanges[diagDeclUri]) allDeclChanges[diagDeclUri] = [];
            allDeclChanges[diagDeclUri].push(
                TextEdit.replace(Range.create(data.declLine, declSpan.start, data.declLine, declSpan.end), implParams)
            );
        }
        const declFileCount = Object.keys(allDeclChanges).length;
        actions.push({
            title: declFileCount > 1
                ? `Update all declarations of '${data.procName}' to match implementation (${declFileCount} files)`
                : `Update declaration of '${data.procName}' to match implementation`,
            kind: CodeActionKind.QuickFix,
            isPreferred: true,
            edit: { changes: allDeclChanges }
        });

        // Action 2: update implementation params to match declaration
        actions.push({
            title: `Update implementation of '${data.procName}' to match MAP declaration`,
            kind: CodeActionKind.QuickFix,
            edit: {
                changes: {
                    [document.uri]: [
                        TextEdit.replace(
                            Range.create(data.implLine, implSpan.start, data.implLine, implSpan.end),
                            declParams
                        )
                    ]
                }
            }
        });

        return actions;
    }

    // ─── missing-map-implementation (PROGRAM file side) ─────────────────────

    private fixMissingImplementation(document: TextDocument, data: MissingImplData): CodeAction[] {
        if (!data?.procName || !data.clwFileUri) return [];

        const docPath = uriToPath(document.uri);
        const clwPath = resolveClwPath(uriToPath(data.clwFileUri), docPath);
        if (!clwPath) return [];

        const docLines = document.getText().split('\n');
        const declLineText = docLines[data.declLine] ?? '';
        const rawParams = ProcedureSignatureUtils.extractRawParameterList(declLineText);

        const clwContent = fs.readFileSync(clwPath, 'utf8');

        const eol = clwContent.includes('\r\n') ? '\r\n' : '\n';
        const endsWithNewline = clwContent.endsWith('\n');
        const prefix = clwContent.length > 0 && !endsWithNewline ? eol : '';

        const implText = `${prefix}${data.procName} PROCEDURE${rawParams}${eol}CODE${eol}RETURN${eol}`;

        const clwLines = clwContent.split('\n');
        const lastLine = clwLines.length;

        const clwUri = pathToUri(clwPath);
        const insertPos = Position.create(lastLine, 0);

        return [{
            title: `Add '${data.procName}' implementation to '${path.basename(clwPath)}'`,
            kind: CodeActionKind.QuickFix,
            isPreferred: true,
            edit: {
                changes: {
                    [clwUri]: [TextEdit.insert(insertPos, implText)]
                }
            }
        }];
    }

    // ─── map-impl-signature-mismatch (PROGRAM/MEMBER file side) ────────────────────

    private fixSignatureMismatchProgramSide(document: TextDocument, data: SigMismatchProgramData): CodeAction[] {
        if (!data?.procName || !data.clwFileUri) return [];

        const docPath = uriToPath(document.uri);
        const clwPath = resolveClwPath(uriToPath(data.clwFileUri), docPath);
        if (!clwPath) return [];

        const docLines = document.getText().split('\n');
        const declLineText = docLines[data.declLine] ?? '';
        const declSpan = ProcedureSignatureUtils.findParameterListSpan(declLineText);

        const clwContent = fs.readFileSync(clwPath, 'utf8');
        const clwLines = clwContent.split('\n');
        const implLineText = clwLines[data.implLine] ?? '';
        const implSpan = ProcedureSignatureUtils.findParameterListSpan(implLineText);

        if (!implSpan || !declSpan) return [];

        const declParams = declLineText.slice(declSpan.start, declSpan.end);
        const implParams = implLineText.slice(implSpan.start, implSpan.end);
        const actions: CodeAction[] = [];

        // Action 1: update implementation to match declaration
        actions.push({
            title: `Update implementation of '${data.procName}' to match declaration`,
            kind: CodeActionKind.QuickFix,
            isPreferred: true,
            edit: {
                changes: {
                    [pathToUri(clwPath)]: [
                        TextEdit.replace(
                            Range.create(data.implLine, implSpan.start, data.implLine, implSpan.end),
                            declParams
                        )
                    ]
                }
            }
        });

        // Action 2: update ALL declarations to match implementation
        const allDeclChanges = this.collectAllDeclarationEdits(data.procName, clwPath, implParams);
        // Ensure the current document's decl site is included (handles self-loop and proc-level MAP)
        if (!(allDeclChanges[document.uri] ?? []).some(e => e.range.start.line === data.declLine)) {
            if (!allDeclChanges[document.uri]) allDeclChanges[document.uri] = [];
            allDeclChanges[document.uri].push(
                TextEdit.replace(Range.create(data.declLine, declSpan.start, data.declLine, declSpan.end), implParams)
            );
        }
        const declFileCount = Object.keys(allDeclChanges).length;
        actions.push({
            title: declFileCount > 1
                ? `Update all declarations of '${data.procName}' to match implementation (${declFileCount} files)`
                : `Update declaration of '${data.procName}' to match implementation`,
            kind: CodeActionKind.QuickFix,
            edit: { changes: allDeclChanges }
        });

        return actions;
    }

    // ─── helper: find all declaration sites across the project ──────────────

    /**
     * Uses the FRG to find every file that has a MODULE block referencing
     * `implFilePath`, then for each file finds the MapProcedure declaration for
     * `procName` and builds a TextEdit replacing its parameter list with `newParams`.
     * Also checks the impl file itself for self-declaration MODULE blocks (those are
     * filtered from the FRG to prevent self-loops).
     */
    private collectAllDeclarationEdits(
        procName: string,
        implFilePath: string,
        newParams: string
    ): { [uri: string]: TextEdit[] } {
        const changes: { [uri: string]: TextEdit[] } = {};
        const frg = FileRelationshipGraph.getInstance();
        const implBasename = path.basename(implFilePath).toLowerCase();
        const tokenCache = TokenCache.getInstance();

        const filesToCheck = new Set<string>([
            ...frg.getModuleDeclarants(implFilePath).map(e => e.fromFile),
            implFilePath  // impl file may have its own self-declaration MODULE block
        ]);

        for (const filePath of filesToCheck) {
            try {
                const normalizedPath = filePath.toLowerCase().replace(/\\/g, '/');
                const liveUri = tokenCache.getAllCachedUris().find(uri =>
                    decodeURIComponent(uri.replace(/^file:\/\/\//i, '')).toLowerCase().replace(/\\/g, '/') === normalizedPath
                );
                const fileUri = liveUri ?? pathToUri(filePath);
                const fileContent = (liveUri && tokenCache.getDocumentText(liveUri))
                    ?? fs.readFileSync(filePath, 'utf8');
                const fileDoc = TextDocument.create(fileUri, 'clarion', 1, fileContent);
                const fileTokens = liveUri
                    ? (tokenCache.getTokensByUri(liveUri) ?? tokenCache.getTokens(fileDoc))
                    : tokenCache.getTokens(fileDoc);
                const fileLines = fileContent.split('\n');

                const moduleTokens = fileTokens.filter(t =>
                    t.type === TokenType.Structure &&
                    t.value.toUpperCase() === 'MODULE' &&
                    t.referencedFile &&
                    path.basename(t.referencedFile).toLowerCase() === implBasename &&
                    t.finishesAt !== undefined
                );

                for (const moduleToken of moduleTokens) {
                    const declToken = fileTokens.find(t =>
                        t.subType === TokenType.MapProcedure &&
                        t.label?.toUpperCase() === procName.toUpperCase() &&
                        t.line > moduleToken.line &&
                        t.line < moduleToken.finishesAt!
                    );
                    if (!declToken) continue;

                    const declLineText = fileLines[declToken.line] ?? '';
                    const declSpan = ProcedureSignatureUtils.findParameterListSpan(declLineText);
                    if (!declSpan) continue;

                    if (!changes[fileUri]) changes[fileUri] = [];
                    changes[fileUri].push(
                        TextEdit.replace(
                            Range.create(declToken.line, declSpan.start, declToken.line, declSpan.end),
                            newParams
                        )
                    );
                }
            } catch (err) {
                logger.error(`collectAllDeclarationEdits error for '${procName}' in '${filePath}': ${err instanceof Error ? err.message : String(err)}`);
            }
        }

        return changes;
    }
}

// ─── diagnostic data shapes ───────────────────────────────────────────────────

interface MissingDeclData {
    procName: string;
    parentFileUri: string;
    implLine: number;
    currentFileUri: string;
}

interface SigMismatchMemberData {
    procName: string;
    parentFileUri: string;
    declLine: number;
    implLine: number;
    currentFileUri: string;
}

interface MissingImplData {
    procName: string;
    clwFileUri: string;
    declLine: number;
    currentFileUri: string;
}

interface SigMismatchProgramData {
    procName: string;
    clwFileUri: string;
    implLine: number;
    declLine: number;
    currentFileUri: string;
}
