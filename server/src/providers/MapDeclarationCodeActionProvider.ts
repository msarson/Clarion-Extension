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
        const implParams = ProcedureSignatureUtils.extractRawParameterList(implLineText);

        const parentContent = fs.readFileSync(parentPath, 'utf8');
        const parentLines = parentContent.split('\n');
        const declLineText = parentLines[data.declLine] ?? '';
        const declParams = ProcedureSignatureUtils.extractRawParameterList(declLineText);

        const actions: CodeAction[] = [];

        // Action 1: update declaration to match implementation
        const newDeclLine = ProcedureSignatureUtils.replaceParameterList(declLineText, implParams);
        if (newDeclLine !== declLineText) {
            actions.push({
                title: `Update declaration of '${data.procName}' to match implementation`,
                kind: CodeActionKind.QuickFix,
                isPreferred: true,
                edit: {
                    changes: {
                        [pathToUri(parentPath)]: [
                            TextEdit.replace(
                                Range.create(data.declLine, 0, data.declLine, declLineText.length),
                                newDeclLine
                            )
                        ]
                    }
                }
            });
        }

        // Action 2: update implementation to match declaration
        // Implementations never have return types/attributes, so we only need the (…) part from the decl
        const newImplLine = ProcedureSignatureUtils.replaceParameterList(implLineText, declParams);
        if (newImplLine !== implLineText) {
            actions.push({
                title: `Update implementation of '${data.procName}' to match MAP declaration`,
                kind: CodeActionKind.QuickFix,
                edit: {
                    changes: {
                        [document.uri]: [
                            TextEdit.replace(
                                Range.create(data.implLine, 0, data.implLine, implLineText.length),
                                newImplLine
                            )
                        ]
                    }
                }
            });
        }

        return actions;
    }

    // ─── missing-map-implementation (PROGRAM file side) ─────────────────────

    private fixMissingImplementation(document: TextDocument, data: MissingImplData): CodeAction[] {
        if (!data?.procName || !data.clwFileUri) return [];

        const clwPath = uriToPath(data.clwFileUri);

        const docLines = document.getText().split('\n');
        const declLineText = docLines[data.declLine] ?? '';
        // Strip return types/attributes: only take the (…) from the declaration
        const rawParams = ProcedureSignatureUtils.extractRawParameterList(declLineText);

        // Build implementation text (no return type or attributes)
        let clwContent = '';
        if (fs.existsSync(clwPath)) {
            clwContent = fs.readFileSync(clwPath, 'utf8');
        }

        // Detect EOL style
        const eol = clwContent.includes('\r\n') ? '\r\n' : '\n';
        const endsWithNewline = clwContent.endsWith('\n');
        const prefix = clwContent.length > 0 && !endsWithNewline ? eol : '';

        const implText = `${prefix}${data.procName} PROCEDURE${rawParams}${eol}CODE${eol}RETURN${eol}`;

        // Count lines so we know the insert position
        const clwLines = clwContent.split('\n');
        const lastLine = clwLines.length; // insert after the last line

        const clwUri = pathToUri(clwPath);
        const insertPos = Position.create(lastLine, 0);

        // For new files: write with document creation
        if (!fs.existsSync(clwPath)) {
            // Can't use WorkspaceEdit to create files in LSP without workspace resource operations.
            // Since this is an edge case (CLW was declared but never created), skip.
            return [];
        }

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

    // ─── map-impl-signature-mismatch (PROGRAM file side) ────────────────────

    private fixSignatureMismatchProgramSide(document: TextDocument, data: SigMismatchProgramData): CodeAction[] {
        if (!data?.procName || !data.clwFileUri) return [];

        const clwPath = uriToPath(data.clwFileUri);
        if (!fs.existsSync(clwPath)) return [];

        const docLines = document.getText().split('\n');
        const declLineText = docLines[data.declLine] ?? '';
        const declParams = ProcedureSignatureUtils.extractRawParameterList(declLineText);

        const clwContent = fs.readFileSync(clwPath, 'utf8');
        const clwLines = clwContent.split('\n');
        const implLineText = clwLines[data.implLine] ?? '';
        const implParams = ProcedureSignatureUtils.extractRawParameterList(implLineText);

        const actions: CodeAction[] = [];

        // Action 1: update implementation to match declaration
        const newImplLine = ProcedureSignatureUtils.replaceParameterList(implLineText, declParams);
        if (newImplLine !== implLineText) {
            actions.push({
                title: `Update implementation of '${data.procName}' to match declaration`,
                kind: CodeActionKind.QuickFix,
                isPreferred: true,
                edit: {
                    changes: {
                        [pathToUri(clwPath)]: [
                            TextEdit.replace(
                                Range.create(data.implLine, 0, data.implLine, implLineText.length),
                                newImplLine
                            )
                        ]
                    }
                }
            });
        }

        // Action 2: update declaration to match implementation
        // Keep return type/attributes in the declaration — only replace (…)
        const newDeclLine = ProcedureSignatureUtils.replaceParameterList(declLineText, implParams);
        if (newDeclLine !== declLineText) {
            actions.push({
                title: `Update declaration of '${data.procName}' to match implementation`,
                kind: CodeActionKind.QuickFix,
                edit: {
                    changes: {
                        [document.uri]: [
                            TextEdit.replace(
                                Range.create(data.declLine, 0, data.declLine, declLineText.length),
                                newDeclLine
                            )
                        ]
                    }
                }
            });
        }

        return actions;
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
