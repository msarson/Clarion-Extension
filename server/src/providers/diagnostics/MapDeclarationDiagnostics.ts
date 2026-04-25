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

    const locallyDeclared = new Set<string>(
        tokens
            .filter(t => {
                if (t.subType !== TokenType.MapProcedure || !t.label) return false;
                // Must be inside a MODULE block that references this file
                const moduleParent = t.parent;
                if (!moduleParent ||
                    moduleParent.type !== TokenType.Structure ||
                    moduleParent.value.toUpperCase() !== 'MODULE' ||
                    !moduleParent.referencedFile) return false;
                return nodePath.basename(moduleParent.referencedFile).toLowerCase() === currentBasename;
            })
            .map(t => t.label!.toUpperCase())
    );

    const resolver = new CrossFileResolver(TokenCache.getInstance());
    const diagnostics: Diagnostic[] = [];

    for (const proc of implementations) {
        const procName = proc.label!;

        // Skip procedures declared in this file's own MAP block
        if (locallyDeclared.has(procName.toUpperCase())) {
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
                    const docLines = document.getText().split('\n');
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
 * Warns when a procedure declared inside a MAP/MODULE block in a PROGRAM file
 * has no matching implementation (GlobalProcedure) in the referenced CLW file.
 */
export async function validateMissingImplementations(
    tokens: Token[],
    document: TextDocument,
    getOpenDocumentContent?: (absPath: string) => string | null
): Promise<Diagnostic[]> {
    // Only relevant for PROGRAM files
    const programToken = tokens.find(t =>
        t.type === TokenType.ClarionDocument &&
        t.value.toUpperCase() === 'PROGRAM' &&
        t.line < 5
    );

    if (!programToken) {
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
        const clwPath = resolveClwPath(moduleToken.referencedFile!);

        if (!clwPath) {
            logger.debug(`⚠️ Could not resolve MODULE file: ${moduleToken.referencedFile}`);
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
