import { TextDocument } from 'vscode-languageserver-textdocument';
import { Diagnostic, DiagnosticSeverity, Range } from 'vscode-languageserver/node';
import { Token, TokenType } from '../../ClarionTokenizer';
import { CrossFileResolver } from '../../utils/CrossFileResolver';
import { TokenHelper } from '../../utils/TokenHelper';
import { ProcedureSignatureUtils } from '../../utils/ProcedureSignatureUtils';
import { TokenCache } from '../../TokenCache';
import { projectsOwnerFirst } from '../../utils/RedirectionResolution';
import { SolutionManager } from '../../solution/solutionManager';
import LoggerManager from '../../logger';
import { getLocalMapScope } from '../../utils/LocalMapScopeHelper';
import { pathToCanonicalUri } from '../../utils/UriUtils';
import { makeTimeSlicer } from '../../utils/cooperativeScan';
import * as fs from 'fs';
import * as nodePath from 'path';

const logger = LoggerManager.getLogger('MapDeclarationDiagnostics');
logger.setLevel('error');

/** Resolve a bare CLW filename (as stored in MODULE token.referencedFile) to an
 *  absolute path using the solution's redirection parser.  Returns null if it
 *  cannot be resolved or does not exist on disk. */
function resolveClwPath(bareFilename: string, fromFsPath: string | null = null): string | null {
    const solutionManager = SolutionManager.getInstance();
    if (solutionManager?.solution) {
        for (const proj of projectsOwnerFirst(fromFsPath)) { // #328 owner-first
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
    document: TextDocument,
    getOpenDocumentContent?: (absPath: string) => string | null
): Promise<Diagnostic[]> {
    // Only relevant for MEMBER files
    const memberToken = TokenHelper.findMemberHeaderToken(tokens);

    if (!memberToken?.referencedFile) {
        return [];
    }

    const tokenCache = TokenCache.getInstance();

    // Collect GlobalProcedure tokens only — MethodImplementation (dotted names)
    // are declared in CLASS blocks, not MAP, so they are excluded by subtype.
    const implementations = tokens.filter(t =>
        TokenHelper.isProcedureOrFunction(t) &&
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

    // Case 2c (#338): BARE prototypes in this file's MODULE-LEVEL MAP. The
    // Language Reference's own MAP example is exactly this shape — a MEMBER
    // module declaring `ComputeIt PROCEDURE` bare in its MAP and implementing
    // it in the same file — so a bare entry with a same-file implementation is
    // a self-declaration (the canonical hand-written member-module pattern),
    // not merely a forward declaration for an external procedure. Signatures
    // still compared. Bare entries WITHOUT a same-file implementation keep
    // their forward-declaration role — nothing else changes for them.
    const bareModuleMapDeclaredTokens = new Map<string, Token>(
        tokens
            .filter(t => {
                if (t.subType !== TokenType.MapProcedure || !t.label) return false;
                const parent = t.parent;
                if (!parent || parent.type !== TokenType.Structure) return false;
                if (parent.value.toUpperCase() !== 'MAP') return false;
                const grandParent = parent.parent;
                return grandParent === undefined ||
                    (grandParent.subType !== TokenType.GlobalProcedure &&
                     grandParent.subType !== TokenType.MethodImplementation);
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
            // ─── Sibling-dir fallback (cluster site 3 of 4, task 6253f9d5) ─────
            // Try same directory as current CLW first (most common), then redirection.
            // Load-bearing for no-solution-open mode + cross-directory siblings
            // outside the project's .red search paths. Move in unison with the
            // cluster-canonical site at `ClassMemberResolver.ts:~1041` +
            // `ImplementationProvider.ts:867` + `MapDeclarationCodeActionProvider.ts:resolveClwPath`.
            // Phase A audit: `docs/audits/classmemberresolver-sibling-dir-investigation-6253f9d5.md`.
            const sameDirPath = nodePath.join(currentClwDir, inclToken.referencedFile!);
            const incPath = fs.existsSync(sameDirPath)
                ? sameDirPath
                : resolveClwPath(inclToken.referencedFile!, nodePath.join(currentClwDir, currentClwBasename));
            if (!incPath) continue;
            try {
                const incUri = pathToCanonicalUri(incPath);
                // #117 B1: shared cache-first/disk-fallback content load. Downstream
                // unchanged — TextDocument + cached async getTokens. undefined => skip
                // this include (matches the prior readFileSync-throws -> catch path).
                const incContent = CrossFileResolver.loadExternalFileContent(tokenCache, incUri, incPath, getOpenDocumentContent);
                if (incContent === undefined) continue;
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

    // #297: measured 1.9s on a generated module during the startup revalidation — yield on a
    // time budget so interactive requests interleave with the per-procedure resolution.
    const timeSlice = makeTimeSlicer();

    for (const proc of implementations) {
        await timeSlice();
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

        // Case 2c (#338): bare prototype in this file's own module-level MAP —
        // self-declaration per the Language Reference's MAP example; compare
        // signatures locally like Cases 1/2.
        const bareModuleDecl = bareModuleMapDeclaredTokens.get(procName.toUpperCase());
        if (bareModuleDecl) {
            const declLine = docLines[bareModuleDecl.line] ?? '';
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
                        declLine: bareModuleDecl.line,
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
                const resolvedParent = resolveClwPath(memberToken.referencedFile!, decodeURIComponent(document.uri.replace(/^file:\/\/\//i, '')));
                diagnostics.push({
                    severity: DiagnosticSeverity.Warning,
                    range,
                    message: `Procedure '${procName}' has no matching declaration in the MAP.`,
                    source: 'clarion',
                    code: 'missing-map-declaration',
                    data: {
                        procName,
                        parentFileUri: resolvedParent
                            ? pathToCanonicalUri(resolvedParent) // #251
                            : pathToCanonicalUri(memberToken.referencedFile!),
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
                    // #117 B1: shared cache-first/disk-fallback content load (V2b is a
                    // TEXT/line read, not a tokenize). undefined => skip this proc's
                    // signature check (the prior readFileSync-throws was caught below).
                    const parentText = CrossFileResolver.loadExternalFileContent(tokenCache, resultLiveUri, result.file, getOpenDocumentContent);
                    if (parentText === undefined) continue;
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
                                parentFileUri: pathToCanonicalUri(result.file), // #251
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
    const clarionDoc = TokenHelper.findDocumentHeaderToken(tokens);

    if (!clarionDoc) {
        return [];
    }

    const tokenCache = TokenCache.getInstance();
    const docLines = document.getText().split('\n');
    const diagnostics: Diagnostic[] = [];

    // Same-dir resolution context for MODULE filename lookup (mirrors the
    // INCLUDE pattern at validateMissingMapDeclarations:128-148).
    const currentClwDir = nodePath.dirname(
        decodeURIComponent(document.uri.replace(/^file:\/\/\//i, ''))
    );

    // Find all MODULE tokens that reference a file
    const moduleTokens = tokens.filter(t =>
        t.type === TokenType.Structure &&
        t.value.toUpperCase() === 'MODULE' &&
        t.referencedFile &&
        t.finishesAt !== undefined
    );

    // #297: an app-main CLW (gl1.clw) declares one MODULE per generated file (~178) and each
    // iteration LOADS AND TOKENIZES that file on cache miss — measured 37s+ of near-continuous
    // loop occupancy at startup on Mark's VM, starving even in-memory requests. Yield on a time
    // budget between modules (effective now that the sdiReady pass runs validators sequentially).
    const timeSliceModules = makeTimeSlicer();

    // #292: a MODULE naming anything other than a Clarion source file is an external-library
    // reference — per the docs (MODULE, "specify MEMBER source file"): "If the sourcefile is an
    // external library, this string may contain any unique identifier". Its procedures are
    // implemented in another binary (typically another project in the solution, prototyped with
    // the DLL attribute), so "no implementation in 'x.dll'" is a false positive by construction —
    // and when redirection FOUND the physical .dll, the loader tokenized the binary as text.
    // Extensionless names are skipped too: they are legal external-library identifiers and
    // indistinguishable from implicit-.clw source names, and this diagnostic stays conservative.
    const CLARION_SOURCE_EXTS = new Set(['.clw', '.inc', '.equ', '.eq', '.int']);

    for (const moduleToken of moduleTokens) {
        await timeSliceModules();
        const moduleExt = nodePath.extname(moduleToken.referencedFile!).toLowerCase();
        if (!CLARION_SOURCE_EXTS.has(moduleExt)) {
            continue;
        }
        // MODULE filenames are stored unresolved on the token
        // (DocumentStructure.resolveFileReferences:1915 — "We're storing
        // unresolved filenames"). Resolve to an absolute path before any URI
        // construction, otherwise bare filenames leak into the cache as
        // `file:///MyOther.clw` URIs (task d2fadc09). Same-dir first (most
        // common in practice), redirection fallback — same shape as the
        // INCLUDE handler at line 145-148.
        const bareName = moduleToken.referencedFile!;
        const sameDirPath = nodePath.join(currentClwDir, bareName);
        const clwPath = fs.existsSync(sameDirPath) ? sameDirPath : resolveClwPath(bareName, decodeURIComponent(document.uri.replace(/^file:\/\/\//i, '')));
        if (!clwPath) {
            continue;
        }

        // #162 B1 — shared cross-file token loader (live buffer -> cache -> disk).
        let implTokens: Token[];
        let implFileContent: string;
        try {
            const normalizedClwPath = clwPath.toLowerCase().replace(/\\/g, '/');
            const liveUri = tokenCache.getAllCachedUris().find(uri => {
                const uriPath = decodeURIComponent(uri.replace(/^file:\/\/\//i, '')).toLowerCase().replace(/\\/g, '/');
                return uriPath === normalizedClwPath;
            });
            const loaded = CrossFileResolver.loadExternalFileTokens(
                tokenCache,
                liveUri ?? pathToCanonicalUri(clwPath),
                clwPath,
                getOpenDocumentContent
            );
            if (!loaded) {
                throw new Error('unable to load external file tokens');
            }
            implTokens = loaded.tokens;
            implFileContent = loaded.content;
        } catch (err) {
            logger.error(`Error loading implementation file '${clwPath}': ${err instanceof Error ? err.message : String(err)}`);
            continue;
        }

        // Build a map of implemented procedure names → their line numbers
        const implemented = new Map<string, number>();
        for (const t of implTokens) {
            if (TokenHelper.isProcedureOrFunction(t) &&
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

            // #292: the DLL prototype attribute means "defined externally in a .DLL" (docs) —
            // no source implementation exists anywhere in this solution's files by contract.
            // Belt-and-braces alongside the module-extension gate above: catches a DLL-attributed
            // prototype even inside a source-named MODULE. Note the docs allow the flag to be an
            // undefined label (still active), so any DLL(...) or bare DLL counts.
            const declLineText = docLines[decl.line] ?? '';
            if (/,\s*DLL\b/i.test(declLineText.replace(/!.*$/, ''))) {
                continue;
            }

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
                        clwFileUri: pathToCanonicalUri(clwPath),
                        declLine: decl.line,
                        currentFileUri: document.uri
                    }
                });
                logger.info(`⚠️ No implementation for MAP declaration '${procName}' in ${clwPath}`);
            } else {
                // Implementation exists — compare signatures
                try {
                    const implLine = implTokens.find(t =>
                        TokenHelper.isProcedureOrFunction(t) &&
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
                                    clwFileUri: pathToCanonicalUri(clwPath),
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
