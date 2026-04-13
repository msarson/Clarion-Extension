/**
 * MemberLocatorService — single source of truth for typed-variable dot-access resolution.
 *
 * Unifies the two-step lookup used by hover, F12, and Ctrl+F12:
 *   1. resolveVariableType  — find what class type a variable name is
 *   2. findMemberInClass    — find a named member inside that class
 *   3. resolveDotAccess     — combines 1+2 for the common case
 *
 * See GitHub issue #50 for the refactor rationale.
 */

import { TextDocument } from 'vscode-languageserver-textdocument';
import { Token, TokenType } from '../ClarionTokenizer';
import { TokenCache } from '../TokenCache';
import { ClassDefinitionIndexer } from '../utils/ClassDefinitionIndexer';
import { CrossFileCache } from '../providers/hover/CrossFileCache';
import { MemberInfo, OverloadCandidate, scanClassBodyForMember, selectBestMemberOverload } from '../utils/ClassMemberResolver';
import { SymbolFinderService } from './SymbolFinderService';
import { SolutionManager } from '../solution/solutionManager';
import * as fs from 'fs';
import * as path from 'path';
import LoggerManager from '../logger';

const logger = LoggerManager.getLogger("MemberLocatorService");
logger.setLevel("error");

export class MemberLocatorService {
    private classIndexer = ClassDefinitionIndexer.getInstance();
    private tokenCache = TokenCache.getInstance();

    constructor(private crossFileCache?: CrossFileCache) {}

    /**
     * Resolves the type of a named variable.
     * Search order: current file → MEMBER parent → INCLUDE chain.
     * Returns { typeName, isClass } or null if not found/unresolvable.
     */
    async resolveVariableType(
        varName: string,
        tokens: Token[],
        document: TextDocument
    ): Promise<{ typeName: string; isClass: boolean } | null> {
        const found = await this.findVariableTokenCrossFile(varName, tokens, document);
        if (!found) return null;
        return this.extractTypeFromToken(found.token, found.tokens);
    }

    /**
     * Finds a named member inside a class.
     * Search order: document INCLUDE chain → ClassDefinitionIndexer → parent chain.
     */
    async findMemberInClass(
        className: string,
        memberName: string,
        document: TextDocument,
        paramCount?: number
    ): Promise<MemberInfo | null> {
        const docPath = decodeURIComponent(document.uri.replace(/^file:\/\/\//, '')).replace(/\//g, '\\');
        const tokens = this.tokenCache.getTokens(document);

        // 1. Walk INCLUDE chain reachable from this document
        const fromInclude = await this.findInIncludeChain(
            className, memberName, tokens, path.dirname(docPath), paramCount,
            new Set([docPath.toLowerCase()])
        );
        if (fromInclude) return fromInclude;

        // 2. ClassDefinitionIndexer (covers libsrc / accessory paths) + parent chain
        await this.ensureIndexBuilt();
        const infos = this.classIndexer.findClass(className);
        if (infos && infos.length > 0) {
            const info = infos.find(d => !d.isType) || infos[0];
            const result = this.scanBodyForMember(info.filePath, className, memberName, paramCount, info.structureType);
            if (result) return result;
            if (info.structureType === 'CLASS' && info.parentClass) {
                return this.walkParentChain(info.parentClass, memberName, paramCount, new Set([className.toLowerCase()]));
            }
        }

        return null;
    }

    /**
     * Combined convenience: resolves variable type then finds member in that class.
     * This is the primary entry point for hover, F12, and Ctrl+F12 dot-access lookups.
     */
    async resolveDotAccess(
        objectName: string,
        memberName: string,
        document: TextDocument,
        paramCount?: number
    ): Promise<MemberInfo | null> {
        const tokens = this.tokenCache.getTokens(document);
        const typeInfo = await this.resolveVariableType(objectName, tokens, document);
        if (!typeInfo) return null;
        logger.info(`resolveDotAccess: "${objectName}" → type "${typeInfo.typeName}", looking for "${memberName}"`);
        return this.findMemberInClass(typeInfo.typeName, memberName, document, paramCount);
    }

    // -------------------------------------------------------------------------
    // Private helpers
    // -------------------------------------------------------------------------

    /** Searches current file → MEMBER parent → INCLUDE chain for a variable label. */
    private async findVariableTokenCrossFile(
        varName: string,
        tokens: Token[],
        document: TextDocument
    ): Promise<{ token: Token; tokens: Token[]; doc: TextDocument } | null> {
        // 1. Current file (column 0 label)
        const local = tokens.find(t => t.start === 0 && t.value.toLowerCase() === varName.toLowerCase());
        if (local) return { token: local, tokens, doc: document };

        const currentFilePath = decodeURIComponent(document.uri.replace(/^file:\/\/\//, '')).replace(/\//g, '\\');
        const currentDir = path.dirname(currentFilePath);

        // 2. MEMBER parent file (and its INCLUDE chain)
        const memberToken = tokens.find(t => t.value?.toUpperCase() === 'MEMBER' && t.line < 5 && t.referencedFile);
        if (memberToken?.referencedFile) {
            const parentPath = this.resolveFilePath(memberToken.referencedFile, currentDir);
            if (parentPath) {
                const parentData = await this.loadDocument(parentPath);
                if (parentData) {
                    const parentVar = parentData.tokens.find(t =>
                        t.start === 0 && t.value.toLowerCase() === varName.toLowerCase()
                    );
                    if (parentVar) return { token: parentVar, tokens: parentData.tokens, doc: parentData.doc };
                    const incResult = await this.searchIncludesForToken(
                        varName, parentData.tokens, path.dirname(parentPath), new Set([parentPath.toLowerCase()])
                    );
                    if (incResult) return incResult;
                }
            }
        }

        // 3. Current file INCLUDE chain
        return this.searchIncludesForToken(varName, tokens, currentDir, new Set());
    }

    /** Recursively searches INCLUDE files for a label token. */
    private async searchIncludesForToken(
        varName: string,
        tokens: Token[],
        fromDir: string,
        visited: Set<string>
    ): Promise<{ token: Token; tokens: Token[]; doc: TextDocument } | null> {
        const includeTokens = tokens.filter(t => t.value?.toUpperCase() === 'INCLUDE' && t.referencedFile);
        for (const inc of includeTokens) {
            const resolvedPath = this.resolveFilePath(inc.referencedFile!, fromDir);
            if (!resolvedPath || visited.has(resolvedPath.toLowerCase())) continue;
            visited.add(resolvedPath.toLowerCase());

            const data = await this.loadDocument(resolvedPath);
            if (!data) continue;

            const found = data.tokens.find(t =>
                t.type === TokenType.Label &&
                t.start === 0 &&
                t.value.toLowerCase() === varName.toLowerCase()
            );
            if (found) return { token: found, tokens: data.tokens, doc: data.doc };

            const nested = await this.searchIncludesForToken(varName, data.tokens, path.dirname(resolvedPath), visited);
            if (nested) return nested;
        }
        return null;
    }

    /** Walks the INCLUDE chain of a document searching for className.memberName. */
    private async findInIncludeChain(
        className: string,
        memberName: string,
        tokens: Token[],
        fromDir: string,
        paramCount: number | undefined,
        visited: Set<string>
    ): Promise<MemberInfo | null> {
        const includeTokens = tokens.filter(t => t.value?.toUpperCase() === 'INCLUDE' && t.referencedFile);
        for (const inc of includeTokens) {
            const resolvedPath = this.resolveFilePath(inc.referencedFile!, fromDir);
            if (!resolvedPath || visited.has(resolvedPath.toLowerCase())) continue;
            visited.add(resolvedPath.toLowerCase());

            const result = this.scanBodyForMember(resolvedPath, className, memberName, paramCount);
            if (result) return result;

            // Recurse into nested INCLUDEs within this file
            const data = await this.loadDocument(resolvedPath);
            if (data) {
                const nested = await this.findInIncludeChain(
                    className, memberName, data.tokens, path.dirname(resolvedPath), paramCount, visited
                );
                if (nested) return nested;
            }
        }
        return null;
    }

    /** Walks the CLASS(Parent) inheritance chain via the class index. */
    private walkParentChain(
        className: string,
        memberName: string,
        paramCount: number | undefined,
        visited: Set<string>
    ): MemberInfo | null {
        if (visited.has(className.toLowerCase())) return null;
        visited.add(className.toLowerCase());

        const classInfos = this.classIndexer.findClass(className);
        if (!classInfos || classInfos.length === 0) return null;

        const classInfo = classInfos.find(d => !d.isType) || classInfos[0];
        const result = this.scanBodyForMember(classInfo.filePath, className, memberName, paramCount, classInfo.structureType);
        if (result) return result;

        if (classInfo.parentClass) {
            return this.walkParentChain(classInfo.parentClass, memberName, paramCount, visited);
        }
        return null;
    }

    /** Thin wrapper around scanClassBodyForMember using the shared overload selector. */
    private scanBodyForMember(
        filePath: string,
        className: string,
        memberName: string,
        paramCount: number | undefined,
        structureType: 'CLASS' | 'QUEUE' | 'GROUP' = 'CLASS'
    ): MemberInfo | null {
        return scanClassBodyForMember(
            filePath, className, memberName, paramCount, structureType,
            (line) => this.countParamsInDecl(line),
            (candidates: OverloadCandidate[], pc) => selectBestMemberOverload(candidates, pc)
        );
    }

    private countParamsInDecl(line: string): number {
        const match = line.match(/PROCEDURE\s*\(([^)]*)\)/i);
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
    }

    /**
     * Extracts { typeName, isClass } from a token using the same logic as
     * StructureFieldResolver.resolveVariableClassType.
     */
    private extractTypeFromToken(token: Token, tokens: Token[]): { typeName: string; isClass: boolean } | null {
        const typeStr = SymbolFinderService.extractTypeInfo(token, tokens);
        if (!typeStr || typeStr === 'UNKNOWN') return null;

        // CLASS(TypeName), QUEUE(TypeName), GROUP(TypeName), FILE(TypeName)
        const structMatch = typeStr.match(/^(CLASS|QUEUE|GROUP|FILE)\((\w+)\)$/i);
        if (structMatch) {
            return { typeName: structMatch[2], isClass: structMatch[1].toUpperCase() === 'CLASS' };
        }

        // LIKE(TypeName)
        const likeMatch = typeStr.match(/^LIKE\((\w+)\)$/i);
        if (likeMatch) return { typeName: likeMatch[1], isClass: false };

        // Bare structure keywords — can't resolve members
        const bareStructures = new Set(['CLASS', 'QUEUE', 'GROUP', 'FILE', 'RECORD', 'WINDOW', 'VIEW', 'REPORT', 'LIKE', 'PROCEDURE']);
        if (bareStructures.has(typeStr.toUpperCase())) return null;

        // Plain user-defined type name (assumed to be a CLASS for member access)
        return { typeName: typeStr, isClass: true };
    }

    /** Resolves a filename using SolutionManager redirection, then relative path fallback. */
    private resolveFilePath(filename: string, fromDir: string): string | null {
        const sm = SolutionManager.getInstance();
        if (sm?.solution) {
            for (const project of sm.solution.projects) {
                const resolved = project.getRedirectionParser().findFile(filename);
                if (resolved?.path && fs.existsSync(resolved.path)) return resolved.path;
            }
        }
        const relative = path.join(fromDir, filename);
        return fs.existsSync(relative) ? relative : null;
    }

    /** Loads a TextDocument and its tokens, using CrossFileCache if available. */
    private async loadDocument(filePath: string): Promise<{ doc: TextDocument; tokens: Token[] } | null> {
        if (this.crossFileCache) {
            const cached = await this.crossFileCache.getOrLoadDocument(filePath);
            if (cached) return { doc: cached.document, tokens: cached.tokens };
        }
        if (!fs.existsSync(filePath)) return null;
        try {
            const content = await fs.promises.readFile(filePath, 'utf-8');
            const doc = TextDocument.create(`file:///${filePath.replace(/\\/g, '/')}`, 'clarion', 1, content);
            const tokens = this.tokenCache.getTokens(doc);
            return { doc, tokens };
        } catch {
            return null;
        }
    }

    private async ensureIndexBuilt(): Promise<void> {
        const sm = SolutionManager.getInstance();
        if (!sm?.solution) return;
        for (const project of sm.solution.projects) {
            await this.classIndexer.getOrBuildIndex(project.path);
        }
    }
}
