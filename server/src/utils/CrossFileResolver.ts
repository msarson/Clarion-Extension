/**
 * CrossFileResolver - Handles cross-file lookups and resolution
 * Centralizes logic for finding declarations/implementations in parent files
 * Eliminates ~180-500 lines of duplication across providers
 */

import { Location } from 'vscode-languageserver-protocol';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Token, TokenType } from '../ClarionTokenizer';
import { SolutionManager } from '../solution/solutionManager';
import { DocumentStructure } from '../DocumentStructure';
import { ProcedureSignatureUtils } from './ProcedureSignatureUtils';
import { TokenCache } from '../TokenCache';
import LoggerManager from '../logger';
import * as fs from 'fs';
import * as path from 'path';

const logger = LoggerManager.getLogger("CrossFileResolver");

export interface MapDeclarationResult {
    token: Token;
    file: string;
    line: number;
    location: Location;
}

export interface GlobalVariableResult {
    token: Token;
    file: string;
    line: number;
    location: Location;
}

export class CrossFileResolver {
    private solutionManager: SolutionManager | null;
    private tokenCache: TokenCache;

    constructor(tokenCache: TokenCache) {
        this.solutionManager = SolutionManager.getInstance();
        this.tokenCache = tokenCache;
    }

    /**
     * Resolves a filename to an absolute path using RedirectionParser
     * Tries solution-wide redirection first, then falls back to relative path
     * @param filename Unresolved filename (from MEMBER, MODULE, INCLUDE, etc.)
     * @param currentDocumentUri URI of the current document (for relative path fallback)
     * @returns Resolved absolute path or null
     */
    public async resolveFile(filename: string, currentDocumentUri: string): Promise<string | null> {
        logger.info(`Resolving file: ${filename}`);

        // Try solution-wide redirection first
        if (this.solutionManager && this.solutionManager.solution) {
            for (const project of this.solutionManager.solution.projects) {
                const redirectionParser = project.getRedirectionParser();
                const resolved = redirectionParser.findFile(filename);
                if (resolved && resolved.path && fs.existsSync(resolved.path)) {
                    logger.info(`✅ Resolved via redirection: ${resolved.path}`);
                    return resolved.path;
                }
            }
        }

        // Fallback to relative path
        const currentDir = path.dirname(
            decodeURIComponent(currentDocumentUri.replace('file:///', '')).replace(/\//g, '\\')
        );
        const relativePath = path.join(currentDir, filename);
        if (fs.existsSync(relativePath)) {
            const resolvedPath = path.resolve(relativePath);
            logger.info(`✅ Resolved via relative path: ${resolvedPath}`);
            return resolvedPath;
        }

        logger.info(`❌ Could not resolve file: ${filename}`);
        return null;
    }

    /**
     * Finds MAP declaration in MEMBER parent file
     * Searches parent file for MAP block with MODULE pointing back to current file
     * @param procName Procedure name to find
     * @param memberFile Parent file from MEMBER('filename')
     * @param currentDocument Current document (implementation file)
     * @param signature Optional signature for overload matching
     * @returns MAP declaration result or null
     */
    public async findMapDeclarationInMemberFile(
        procName: string,
        memberFile: string,
        currentDocument: TextDocument,
        signature?: string
    ): Promise<MapDeclarationResult | null> {
        try {
            logger.info(`Finding MAP declaration for ${procName} in MEMBER file ${memberFile}`);

            // Resolve MEMBER file path
            const resolvedPath = await this.resolveFile(memberFile, currentDocument.uri);
            if (!resolvedPath) {
                return null;
            }

            // Get current filename for reverse lookup
            const currentFileName = path.basename(currentDocument.uri);
            logger.info(`Searching for MAP MODULE('${currentFileName}') in ${resolvedPath}`);

            // Read parent file and get cached tokens/structure
            const content = fs.readFileSync(resolvedPath, 'utf8');
            const parentDoc = TextDocument.create(resolvedPath, 'clarion', 1, content);
            const parentTokens = await this.tokenCache.getTokens(parentDoc);

            // Use cached DocumentStructure to find MAP blocks
            const documentStructure = this.tokenCache.getStructure(parentDoc);
            const mapBlocks = documentStructure.getMapBlocks();

            if (mapBlocks.length === 0) {
                logger.info(`No MAP blocks found in ${memberFile}`);
                return null;
            }

            // Search each MAP for MODULE pointing to current file
            for (const mapBlock of mapBlocks) {
                const mapStart = mapBlock.line;
                const mapEnd = mapBlock.finishesAt;

                if (mapEnd === undefined) continue;

                // Find MODULE blocks in this MAP
                const moduleBlocks = parentTokens.filter(t =>
                    t.type === TokenType.Structure &&
                    t.value.toUpperCase() === 'MODULE' &&
                    t.line > mapStart &&
                    t.line < mapEnd
                );

                for (const moduleBlock of moduleBlocks) {
                    // Find MODULE token with referencedFile on same line
                    const moduleToken = parentTokens.find(t =>
                        t.line === moduleBlock.line &&
                        t.value.toUpperCase() === 'MODULE' &&
                        t.referencedFile
                    );

                    // Check if this MODULE points to our current file
                    if (moduleToken?.referencedFile &&
                        path.basename(moduleToken.referencedFile).toLowerCase() === currentFileName.toLowerCase()) {
                        logger.info(`✅ Found MODULE('${moduleToken.referencedFile}') pointing to current file`);

                        // Find procedure declaration in this MODULE block
                        const moduleStart = moduleBlock.line;
                        const moduleEnd = moduleBlock.finishesAt;

                        if (moduleEnd === undefined) continue;

                        // Look for MapProcedure tokens matching procName
                        const procedureDecls = parentTokens.filter(t =>
                            t.line > moduleStart &&
                            t.line < moduleEnd &&
                            (t.subType === TokenType.MapProcedure || t.type === TokenType.Function) &&
                            (t.label?.toLowerCase() === procName.toLowerCase() ||
                                t.value.toLowerCase() === procName.toLowerCase())
                        );

                        if (procedureDecls.length === 0) {
                            logger.info(`Procedure ${procName} not found in this MODULE block`);
                            continue;
                        }

                        // If only one, return it
                        if (procedureDecls.length === 1) {
                            const decl = procedureDecls[0];
                            logger.info(`✅ Found MAP declaration at line ${decl.line}`);
                            const location = Location.create(`file:///${resolvedPath.replace(/\\/g, '/')}`, {
                                start: { line: decl.line, character: 0 },
                                end: { line: decl.line, character: decl.value.length }
                            });
                            return {
                                token: decl,
                                file: resolvedPath,
                                line: decl.line,
                                location
                            };
                        }

                        // Multiple declarations - use overload resolution
                        if (signature) {
                            logger.info(`Found ${procedureDecls.length} overloaded declarations, using signature matching`);
                            const lines = content.split('\n');
                            const implParams = ProcedureSignatureUtils.extractParameterTypes(signature);

                            for (const decl of procedureDecls) {
                                const declSignature = lines[decl.line].trim();
                                const declParams = ProcedureSignatureUtils.extractParameterTypes(declSignature);

                                if (ProcedureSignatureUtils.parametersMatch(implParams, declParams)) {
                                    logger.info(`✅ Found matching overload at line ${decl.line}`);
                                    const location = Location.create(`file:///${resolvedPath.replace(/\\/g, '/')}`, {
                                        start: { line: decl.line, character: 0 },
                                        end: { line: decl.line, character: decl.value.length }
                                    });
                                    return {
                                        token: decl,
                                        file: resolvedPath,
                                        line: decl.line,
                                        location
                                    };
                                }
                            }
                        }

                        // Fallback to first declaration
                        const decl = procedureDecls[0];
                        logger.info(`Returning first declaration at line ${decl.line}`);
                        const location = Location.create(`file:///${resolvedPath.replace(/\\/g, '/')}`, {
                            start: { line: decl.line, character: 0 },
                            end: { line: decl.line, character: decl.value.length }
                        });
                        return {
                            token: decl,
                            file: resolvedPath,
                            line: decl.line,
                            location
                        };
                    }
                }
            }

            logger.info(`❌ No MAP MODULE('${currentFileName}') found in ${memberFile}`);
            return null;

        } catch (error) {
            logger.error(`Error searching MEMBER file: ${error}`);
            return null;
        }
    }

    /**
     * Finds a global variable in the MEMBER parent file
     * Searches parent file for global variable (label at column 0, before first CODE)
     * @param variableName Variable name to find
     * @param memberFile Parent file from MEMBER('filename')
     * @param currentDocument Current document
     * @returns Global variable result or null
     */
    public async findGlobalVariableInMemberFile(
        variableName: string,
        memberFile: string,
        currentDocument: TextDocument
    ): Promise<GlobalVariableResult | null> {
        try {
            logger.info(`Finding global variable ${variableName} in MEMBER file ${memberFile}`);

            // Resolve MEMBER file path
            const resolvedPath = await this.resolveFile(memberFile, currentDocument.uri);
            if (!resolvedPath) {
                return null;
            }

            // Read parent file and get cached tokens/structure
            const content = fs.readFileSync(resolvedPath, 'utf8');
            const parentDoc = TextDocument.create(resolvedPath, 'clarion', 1, content);
            const parentTokens = await this.tokenCache.getTokens(parentDoc);

            // Use cached DocumentStructure to find global variables
            const documentStructure = this.tokenCache.getStructure(parentDoc);
            const firstCodeMarker = documentStructure.getFirstCodeMarker();
            const globalScopeEndLine = firstCodeMarker ? firstCodeMarker.line : Number.MAX_SAFE_INTEGER;

            // Search for global variable
            const globalVar = parentTokens.find(t =>
                t.type === TokenType.Label &&
                t.start === 0 &&
                t.line < globalScopeEndLine &&
                t.value.toLowerCase() === variableName.toLowerCase()
            );

            if (globalVar) {
                logger.info(`✅ Found global variable ${variableName} at line ${globalVar.line}`);
                const location = Location.create(`file:///${resolvedPath.replace(/\\/g, '/')}`, {
                    start: { line: globalVar.line, character: globalVar.start },
                    end: { line: globalVar.line, character: globalVar.start + globalVar.value.length }
                });
                return {
                    token: globalVar,
                    file: resolvedPath,
                    line: globalVar.line,
                    location
                };
            }

            logger.info(`❌ Global variable ${variableName} not found in ${memberFile}`);
            return null;

        } catch (error) {
            logger.error(`Error searching for global variable in MEMBER file: ${error}`);
            return null;
        }
    }
}
