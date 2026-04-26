import { TextDocument } from 'vscode-languageserver-textdocument';
import { Diagnostic, DiagnosticSeverity, Range } from 'vscode-languageserver/node';
import { Token, TokenType } from '../../ClarionTokenizer';
import { CrossFileResolver } from '../../utils/CrossFileResolver';
import { ProcedureSignatureUtils } from '../../utils/ProcedureSignatureUtils';
import { TokenCache } from '../../TokenCache';
import { SolutionManager } from '../../solution/solutionManager';
import LoggerManager from '../../logger';
import { getLocalMapScope } from '../../utils/LocalMapScopeHelper';
import * as fs from 'fs';
import * as nodePath from 'path';

const logger = LoggerManager.getLogger('MapDeclarationDiagnostics');
logger.setLevel('error');

/** Resolve a bare CLW filename (as stored in MODULE token.referencedFile) to an
 *  absolute path using the solution's redirection parser.  Returns null if it
 *  cannot be resolved or does not exist on disk. */
function resolveClwPath(bareFilename: string): string | null {
    const solutionManager = SolutionManager.getInstance();
    if (solutionManager?.solution) {
        for (const proj of solutionManager.solution.projects) {
            // Try redirection parser first
            const resolved = proj.getRedirectionParser().findFile(bareFilename);
            if (resolved?.path && fs.existsSync(resolved.path)) {
                return resolved.path;
            }
            // Fall back to project directory
            const projDirPath = nodePath.join(proj.path, bareFilename);
            if (fs.existsSync(projDirPath)) {
                return projDirPath;
            }
        }
    }
    // Already absolute
    if (nodePath.isAbsolute(bareFilename) && fs.existsSync(bareFilename)) return bareFilename;
    // Relative to CWD — resolve to absolute so path comparisons work
    const cwdResolved = nodePath.resolve(bareFilename);
    if (fs.existsSync(cwdResolved)) return cwdResolved;
    return null;
}

/**
 * Warns when a GlobalProcedure implementation in a MEMBER file has no matching
 * declaration inside a MAP/MODULE block in the parent PROGRAM file. (closes #89)
 */
export async function validateMissingMapDeclarations(
    tokens: Token[],
    document: TextDocument
): Promise<Diagnostic[]> {
    // Only relevant for MEMBER files
    const memberToken = tokens.find(t =>
        t.type === TokenType.ClarionDocument &&
        t.value.toUpperCase() === 'MEMBER' &&
        t.line < 5 &&
        t.referencedFile
    );

    if (!memberToken?.referencedFile) {
        return [];
    }

    const tokenCache = TokenCache.getInstance();

    // Collect GlobalProcedure tokens only — MethodImplementation (dotted names)
    // are declared in CLASS blocks, not MAP, so they are excluded by subtype.
    const implementations = tokens.filter(t =>
        t.type === TokenType.Procedure &&
        t.subType === TokenType.GlobalProcedure &&
        t.label
    );

    if (implementations.length === 0) {
        return [];
    }

    // Build a set of procedure names declared in a MODULE('thisfile.clw') block
    // within this file's own MAP. Only these count as true self-declarations — bare
    // MAP entries with no MODULE wrapper are forward-declarations for calling external
    // procedures and must not suppress the missing-declaration check.
    const currentBasename = nodePath.basename(
        decodeURIComponent(document.uri.replace(/^file:\/\/\//i, ''))
    ).toLowerCase();

    // Case 1: inside MODULE('thisfile.clw') — self-declaration in the same file's
    // MODULE block; no cross-file resolver needed, but signatures still need to match.
    const selfModuleDeclaredTokens = new Map<string, Token>(
        tokens
            .filter(t => {
                if (t.subType !== TokenType.MapProcedure || !t.label) return false;
                const parent = t.parent;
                if (!parent || parent.type !== TokenType.Structure) return false;
                if (parent.value.toUpperCase() !== 'MODULE' || !parent.referencedFile) return false;
                return nodePath.basename(parent.referencedFile).toLowerCase() === currentBasename;
            })
            .map(t => [t.label!.toUpperCase(), t] as [string, Token])
    );

    // Case 2: inside a local MAP whose parent is a procedure body — declared and
    // implemented in the same file; no cross-file resolver needed, but signatures
    // still need to match.
    const procLevelDeclaredTokens = new Map<string, Token>(
        tokens
            .filter(t => {
                if (t.subType !== TokenType.MapProcedure || !t.label) return false;
                const parent = t.parent;
                if (!parent || parent.type !== TokenType.Structure) return false;
                if (parent.value.toUpperCase() !== 'MAP') return false;
                const grandParent = parent.parent;
                return grandParent !== undefined &&
                    (grandParent.subType === TokenType.GlobalProcedure ||
                     grandParent.subType === TokenType.MethodImplementation);
            })
            .map(t => [t.label!.toUpperCase(), t] as [string, Token])
    );

    // Case 1b: MAP contains INCLUDE directives — collect procedure declarations
    // from included INC files (app-generated code puts declarations in _GL1.INC etc.).
    // Clarion's preprocessor inlines INC content at the INCLUDE position, so a
    // MODULE('thisfile.clw') block inside the INC effectively declares procedures for
    // this CLW. We only accept declarations inside a MODULE whose referenced file
    // matches the current CLW basename to avoid false-positives from unrelated INC files.
    const incDeclaredTokens = new Map<string, Token>();
    const currentClwBasename = nodePath.basename(
        decodeURIComponent(document.uri.replace(/^file:\/\/\//i, ''))
    ).toLowerCase();
    const currentClwDir = nodePath.dirname(
        decodeURIComponent(document.uri.replace(/^file:\/\/\//i, ''))
    );
    const mapStructureTokens = tokens.filter(t =>
        t.type === TokenType.Structure && t.value.toUpperCase() === 'MAP'
    );
    for (const mapToken of mapStructureTokens) {
        const mapEnd = mapToken.finishesAt;
        const includesInMap = tokens.filter(t =>
            t.type === TokenType.Directive &&
            t.value.toUpperCase() === 'INCLUDE' &&
            t.referencedFile &&
            t.line > mapToken.line &&
            (mapEnd === undefined || t.line <= mapEnd)
        );
        for (const inclToken of includesInMap) {
            // Try same directory as current CLW first (most common), then redirection
            const sameDirPath = nodePath.join(currentClwDir, inclToken.referencedFile!);
            const incPath = fs.existsSync(sameDirPath)
                ? sameDirPath
                : resolveClwPath(inclToken.referencedFile!);
            if (!incPath) continue;
            try {
                const incUri = 'file:///' + incPath.replace(/\\/g, '/');
                const incContent = tokenCache.getDocumentText(incUri) ?? fs.readFileSync(incPath, 'utf8');
                const incDoc = TextDocument.create(incUri, 'clarion', 1, incContent);
                const incTokens = await tokenCache.getTokens(incDoc);

                // Only accept procedures inside MODULE('thisfile.clw') blocks
                for (const t of incTokens) {
                    if (t.subType === TokenType.MapProcedure && t.label && t.parent) {
                        const moduleRef = t.parent.referencedFile;
                        if (moduleRef && nodePath.basename(moduleRef).toLowerCase() === currentClwBasename) {
                            incDeclaredTokens.set(t.label.toUpperCase(), t);
                        }
                    }
                }
            } catch { /* skip unreadable INC files */ }
        }
    }

    const resolver = new CrossFileResolver(TokenCache.getInstance());
    const diagnostics: Diagnostic[] = [];
    const docLines = document.getText().split('\n');

    for (const proc of implementations) {
        const procName = proc.label!;

        // Case 1: self-declared via MODULE('thisfile.clw') — compare signatures locally
        const selfModuleDecl = selfModuleDeclaredTokens.get(procName.toUpperCase());
        if (selfModuleDecl) {
            const declLine = docLines[selfModuleDecl.line] ?? '';
            const implLine = docLines[proc.line] ?? '';
            const declParams = ProcedureSignatureUtils.extractParameterTypes(declLine);
            const implParams = ProcedureSignatureUtils.extractParameterTypes(implLine);
            if (!ProcedureSignatureUtils.parametersMatch(implParams, declParams)) {
                diagnostics.push({
                    severity: DiagnosticSeverity.Warning,
                    range: { start: { line: proc.line, character: 0 }, end: { line: proc.line, character: procName.length } },
                    message: `Procedure '${procName}' signature does not match its local MAP declaration.`,
                    source: 'clarion',
                    code: 'map-signature-mismatch',
                    data: {
                        procName,
                        parentFileUri: document.uri,
                        declLine: selfModuleDecl.line,
                        implLine: proc.line,
                        currentFileUri: document.uri
                    }
                });
            }
            continue;
        }

        // Case 2: procedure-level MAP declaration — compare signatures locally
        const procLevelDecl = procLevelDeclaredTokens.get(procName.toUpperCase());
        if (procLevelDecl) {
            const declLine = docLines[procLevelDecl.line] ?? '';
            const implLine = docLines[proc.line] ?? '';
            const declParams = ProcedureSignatureUtils.extractParameterTypes(declLine);
            const implParams = ProcedureSignatureUtils.extractParameterTypes(implLine);
            if (!ProcedureSignatureUtils.parametersMatch(implParams, declParams)) {
                diagnostics.push({
                    severity: DiagnosticSeverity.Warning,
                    range: { start: { line: proc.line, character: 0 }, end: { line: proc.line, character: procName.length } },
                    message: `Procedure '${procName}' signature does not match its local MAP declaration.`,
                    source: 'clarion',
                    code: 'map-signature-mismatch',
                    data: {
                        procName,
                        parentFileUri: document.uri,
                        declLine: procLevelDecl.line,
                        implLine: proc.line,
                        currentFileUri: document.uri
                    }
                });
            }
            continue;
        }

        // Case 1b: declared in an INC file included by a MAP block in this file
        if (incDeclaredTokens.has(procName.toUpperCase())) {
            continue;
        }

        try {
            const localScope = getLocalMapScope(document.uri);
            const result = await resolver.findMapDeclarationInMemberFile(
                procName,
                memberToken.referencedFile,
                document,
                undefined,
                localScope?.containingProcedure
            );

            const range: Range = {
                start: { line: proc.line, character: 0 },
                end:   { line: proc.line, character: procName.length }
            };

            if (!result) {
                const resolvedParent = resolveClwPath(memberToken.referencedFile!);
                diagnostics.push({
                    severity: DiagnosticSeverity.Warning,
                    range,
                    message: `Procedure '${procName}' has no matching declaration in the MAP.`,
                    source: 'clarion',
                    code: 'missing-map-declaration',
                    data: {
                        procName,
                        parentFileUri: resolvedParent
                            ? 'file:///' + resolvedParent.replace(/\\/g, '/')
                            : 'file:///' + memberToken.referencedFile!.replace(/\\/g, '/'),
                        implLine: proc.line,
                        currentFileUri: document.uri
                    }
                });
                logger.info(`⚠️ No MAP declaration for '${procName}' in ${memberToken.referencedFile}`);
            } else {
                // Declaration found — compare signatures to catch parameter mismatches
                try {
                    const implLine = docLines[proc.line] ?? '';
                    const implParams = ProcedureSignatureUtils.extractParameterTypes(implLine);

                    const normalizedResultPath = result.file.toLowerCase().replace(/\\/g, '/');
                    const resultLiveUri = tokenCache.getAllCachedUris().find(uri => {
                        const uriPath = decodeURIComponent(uri.replace(/^file:\/\/\//i, '')).toLowerCase().replace(/\\/g, '/');
                        return uriPath === normalizedResultPath;
                    });
                    const parentText = (resultLiveUri && tokenCache.getDocumentText(resultLiveUri))
                        ?? fs.readFileSync(result.file, 'utf8');
                    const parentLines = parentText.split('\n');
                    const declLine = parentLines[result.line] ?? '';
                    const declParams = ProcedureSignatureUtils.extractParameterTypes(declLine);

                    if (!ProcedureSignatureUtils.parametersMatch(implParams, declParams)) {
                        diagnostics.push({
                            severity: DiagnosticSeverity.Warning,
                            range,
                            message: `Procedure '${procName}' signature does not match its MAP declaration.`,
                            source: 'clarion',
                            code: 'map-signature-mismatch',
                            data: {
                                procName,
                                parentFileUri: 'file:///' + result.file.replace(/\\/g, '/'),
                                declLine: result.line,
                                implLine: proc.line,
                                currentFileUri: document.uri
                            }
                        });
                        logger.info(`⚠️ Signature mismatch for '${procName}': impl=(${implParams.join(',')}) decl=(${declParams.join(',')})`);
                    }
                } catch (sigErr) {
                    logger.error(`Error comparing signatures for '${procName}': ${sigErr instanceof Error ? sigErr.message : String(sigErr)}`);
                }
            }
        } catch (err) {
            logger.error(`Error checking MAP declaration for '${procName}': ${err instanceof Error ? err.message : String(err)}`);
        }
    }

    return diagnostics;
}

/**
 * Warns when a procedure declared inside a MAP/MODULE block
 * has no matching implementation (GlobalProcedure) in the referenced CLW file.
 * Applies to both PROGRAM and MEMBER files that contain MODULE declarations.
 */
export async function validateMissingImplementations(
    tokens: Token[],
    document: TextDocument,
    getOpenDocumentContent?: (absPath: string) => string | null
): Promise<Diagnostic[]> {
    // Must be a Clarion source file (PROGRAM or MEMBER)
    const clarionDoc = tokens.find(t =>
        t.type === TokenType.ClarionDocument &&
        (t.value.toUpperCase() === 'PROGRAM' || t.value.toUpperCase() === 'MEMBER') &&
        t.line < 5
    );

    if (!clarionDoc) {
        return [];
    }

    const tokenCache = TokenCache.getInstance();
    const docLines = document.getText().split('\n');
    const diagnostics: Diagnostic[] = [];

    // Find all MODULE tokens that reference a file
    const moduleTokens = tokens.filter(t =>
        t.type === TokenType.Structure &&
        t.value.toUpperCase() === 'MODULE' &&
        t.referencedFile &&
        t.finishesAt !== undefined
    );

    for (const moduleToken of moduleTokens) {
        const clwPath = moduleToken.referencedFile!;

        if (!fs.existsSync(clwPath)) {
            continue;
        }

        // Get tokens for the implementation file.
        // Priority order:
        //   1. VS Code's live document buffer (always up-to-date, even for unsaved WorkspaceEdits)
        //   2. TokenCache (may be stale if cache wasn't cleared after a non-structural edit)
        //   3. Disk (fallback for files not open in editor)
        let implTokens: Token[];
        let implFileContent: string;
        try {
            const openText = getOpenDocumentContent?.(clwPath) ?? null;
            if (openText !== null) {
                // File is open in VS Code — use the live buffer content directly.
                implFileContent = openText;
                const implUri = 'file:///' + clwPath.replace(/\\/g, '/');
                const implDoc = TextDocument.create(implUri, 'clarion', 1, openText);
                implTokens = tokenCache.getTokens(implDoc);
            } else {
                // File not open in editor — try TokenCache, then fall back to disk.
                const normalizedClwPath = clwPath.toLowerCase().replace(/\\/g, '/');
                const liveUri = tokenCache.getAllCachedUris().find(uri => {
                    const uriPath = decodeURIComponent(uri.replace(/^file:\/\/\//i, '')).toLowerCase().replace(/\\/g, '/');
                    return uriPath === normalizedClwPath;
                });
                if (liveUri) {
                    const liveText = tokenCache.getDocumentText(liveUri);
                    const liveCachedTokens = tokenCache.getTokensByUri(liveUri);
                    if (liveText && liveCachedTokens) {
                        implTokens = liveCachedTokens;
                        implFileContent = liveText;
                    } else if (liveText) {
                        const implDoc = TextDocument.create(liveUri, 'clarion', 1, liveText);
                        implTokens = tokenCache.getTokens(implDoc);
                        implFileContent = liveText;
                    } else {
                        throw new Error('no live text in cache');
                    }
                } else {
                    implFileContent = fs.readFileSync(clwPath, 'utf8');
                    const implDoc = TextDocument.create('file:///' + clwPath.replace(/\\/g, '/'), 'clarion', 1, implFileContent);
                    implTokens = tokenCache.getTokens(implDoc);
                }
            }
        } catch (err) {
            logger.error(`Error loading implementation file '${clwPath}': ${err instanceof Error ? err.message : String(err)}`);
            continue;
        }

        // Build a map of implemented procedure names → their line numbers
        const implemented = new Map<string, number>();
        for (const t of implTokens) {
            if (t.type === TokenType.Procedure &&
                t.subType === TokenType.GlobalProcedure &&
                t.label) {
                implemented.set(t.label.toUpperCase(), t.line);
            }
        }

        // Check each MapProcedure declaration inside this MODULE block
        const moduleDecls = tokens.filter(t =>
            t.subType === TokenType.MapProcedure &&
            t.label &&
            t.line > moduleToken.line &&
            t.line < moduleToken.finishesAt!
        );

        for (const decl of moduleDecls) {
            const procName = decl.label!;
            const range: Range = {
                start: { line: decl.line, character: 0 },
                end:   { line: decl.line, character: procName.length }
            };

            if (!implemented.has(procName.toUpperCase())) {
                diagnostics.push({
                    severity: DiagnosticSeverity.Warning,
                    range,
                    message: `Procedure '${procName}' is declared in the MAP but has no implementation in '${require('path').basename(clwPath)}'.`,
                    source: 'clarion',
                    code: 'missing-map-implementation',
                    data: {
                        procName,
                        clwFileUri: 'file:///' + clwPath.replace(/\\/g, '/'),
                        declLine: decl.line,
                        currentFileUri: document.uri
                    }
                });
                logger.info(`⚠️ No implementation for MAP declaration '${procName}' in ${clwPath}`);
            } else {
                // Implementation exists — compare signatures
                try {
                    const implLine = implTokens.find(t =>
                        t.type === TokenType.Procedure &&
                        t.subType === TokenType.GlobalProcedure &&
                        t.label?.toUpperCase() === procName.toUpperCase()
                    );

                    if (implLine !== undefined) {
                        const implFileLines = implFileContent.split('\n');
                        const implSig = implFileLines[implLine.line] ?? '';
                        const implParams = ProcedureSignatureUtils.extractParameterTypes(implSig);
                        const declSig = docLines[decl.line] ?? '';
                        const declParams = ProcedureSignatureUtils.extractParameterTypes(declSig);
                        const matched = ProcedureSignatureUtils.parametersMatch(implParams, declParams);
                        if (!matched) {
                            diagnostics.push({
                                severity: DiagnosticSeverity.Warning,
                                range,
                                message: `Procedure '${procName}' signature does not match its implementation in '${require('path').basename(clwPath)}'.`,
                                source: 'clarion',
                                code: 'map-impl-signature-mismatch',
                                data: {
                                    procName,
                                    clwFileUri: 'file:///' + clwPath.replace(/\\/g, '/'),
                                    implLine: implLine.line,
                                    declLine: decl.line,
                                    currentFileUri: document.uri
                                }
                            });
                        }
                    }
                } catch (sigErr) {
                    logger.error(`Error comparing signatures for '${procName}': ${sigErr instanceof Error ? sigErr.message : String(sigErr)}`);
                }
            }
        }
    }

    return diagnostics;
}
