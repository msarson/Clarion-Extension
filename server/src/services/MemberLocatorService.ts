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

import { Location } from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Token, TokenType } from '../ClarionTokenizer';
import { TokenCache } from '../TokenCache';
import { StructureDeclarationIndexer } from '../utils/StructureDeclarationIndexer';
import { CrossFileCache } from '../providers/hover/CrossFileCache';
import { MemberInfo, MemberEnumItem, OverloadCandidate, scanClassBodyForMember, scanClassBodyForAllMembers, selectBestMemberOverload, detectMemberAccess } from '../utils/ClassMemberResolver';
import { SymbolFinderService } from './SymbolFinderService';
import { SolutionManager } from '../solution/solutionManager';
import * as fs from 'fs';
import * as path from 'path';
import LoggerManager from '../logger';

const logger = LoggerManager.getLogger("MemberLocatorService");
logger.setLevel("error");

export class MemberLocatorService {
    private sdi = StructureDeclarationIndexer.getInstance();
    private tokenCache = TokenCache.getInstance();

    constructor(private crossFileCache?: CrossFileCache) {}

    /**
     * Finds the declaration location of a variable.
     * Search order: current file → MEMBER parent (+ its INCLUDE chain) → current INCLUDE chain.
     * Returns a Location or null.
     */
    async findVariableLocation(
        varName: string,
        document: TextDocument
    ): Promise<Location | null> {
        const tokens = this.tokenCache.getTokens(document);
        const result = await this.findVariableTokenCrossFile(varName, tokens, document);
        if (!result) return null;
        return Location.create(result.doc.uri, {
            start: { line: result.token.line, character: result.token.start },
            end: { line: result.token.line, character: result.token.start + result.token.value.length }
        });
    }

    /**
     * Searches the MEMBER parent file (+ its INCLUDE chain) and current INCLUDE chain for a variable.
     * Does NOT search the current file — use after local scope checks have already run.
     * Returns the raw token result for callers that need to build their own output (e.g. hover).
     */
    async findVariableTokenInParentChain(
        varName: string,
        document: TextDocument
    ): Promise<{ token: Token; tokens: Token[]; doc: TextDocument } | null> {
        const tokens = this.tokenCache.getTokens(document);
        const currentFilePath = decodeURIComponent(document.uri.replace(/^file:\/\/\//, '')).replace(/\//g, '\\');
        const currentDir = path.dirname(currentFilePath);

        const memberToken = tokens.find(t => t.value?.toUpperCase() === 'MEMBER' && t.line < 5 && t.referencedFile);
        if (memberToken?.referencedFile) {
            const parentPath = this.resolveFilePath(memberToken.referencedFile, currentDir);
            if (parentPath) {
                const parentData = await this.loadDocument(parentPath);
                if (parentData) {
                    const parentVar = parentData.tokens.find(t =>
                        t.start === 0 && this.tokenMatchesName(t, varName.toLowerCase())
                    );
                    if (parentVar) return { token: parentVar, tokens: parentData.tokens, doc: parentData.doc };
                    const incResult = await this.searchIncludesForToken(
                        varName, parentData.tokens, path.dirname(parentPath), new Set([parentPath.toLowerCase()])
                    );
                    if (incResult) return incResult;
                }
            }
        }

        return this.searchIncludesForToken(varName, tokens, currentDir, new Set());
    }

    /**
     * Searches the MEMBER parent file (+ its INCLUDE chain) for a variable declaration.
     * Does NOT search the current file — use this when local scope checks have already run.
     */
    async findVariableInParentChain(
        varName: string,
        document: TextDocument
    ): Promise<Location | null> {
        const result = await this.findVariableTokenInParentChain(varName, document);
        if (!result) return null;
        return Location.create(result.doc.uri, {
            start: { line: result.token.line, character: result.token.start },
            end: { line: result.token.line, character: result.token.start + result.token.value.length }
        });
    }

    /**
     * Resolves the type of a named variable.
     * Search order: current file → MEMBER parent → INCLUDE chain.
     * Returns { typeName, isClass, isReference } or null if not found/unresolvable.
     * isReference is true when the variable was declared as &TypeName (Clarion reference).
     */
    async resolveVariableType(
        varName: string,
        tokens: Token[],
        document: TextDocument
    ): Promise<{ typeName: string; isClass: boolean; isReference: boolean } | null> {
        const found = await this.findVariableTokenCrossFile(varName, tokens, document);
        if (!found) return null;
        return this.extractTypeFromToken(found.token, found.tokens);
    }

    /**
     * Finds a named member inside a class.
     * Search order: current document → INCLUDE chain → ClassDefinitionIndexer → parent chain.
     */
    async findMemberInClass(
        className: string,
        memberName: string,
        document: TextDocument,
        paramCount?: number
    ): Promise<MemberInfo | null> {
        const docPath = decodeURIComponent(document.uri.replace(/^file:\/\/\//, '')).replace(/\//g, '\\');
        const tokens = this.tokenCache.getTokensByUri(document.uri) ?? this.tokenCache.getTokens(document);

        // 0. Current document tokens (class defined in the same file)
        const fromCurrentDoc = await this.scanBodyForMember(docPath, className, memberName, paramCount, 'CLASS');
        if (fromCurrentDoc) return fromCurrentDoc;

        // 1. Walk INCLUDE chain reachable from this document
        const fromInclude = await this.findInIncludeChain(
            className, memberName, tokens, path.dirname(docPath), paramCount,
            new Set([docPath.toLowerCase()])
        );
        if (fromInclude) return fromInclude;

        // 2. StructureDeclarationIndexer (covers libsrc / accessory paths) + parent chain
        await this.ensureIndexBuilt();
        const infos = this.sdi.find(className);
        if (infos.length > 0) {
            const info = infos.find(d => !d.isType) || infos[0];
            const result = await this.scanBodyForMember(info.filePath, className, memberName, paramCount, info.structureType as 'CLASS' | 'GROUP' | 'QUEUE' | undefined);
            if (result) return result;
            if (info.structureType === 'CLASS' && info.parentName) {
                return this.walkParentChain(info.parentName, memberName, paramCount, new Set([className.toLowerCase()]));
            }
        }

        return null;
    }

    /**
     * Combined convenience: resolves variable type then finds member in that class or interface.
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
        // Try interface lookup first for reference variables (&TypeName), then fall back to class
        if (typeInfo.isReference) {
            const ifaceResult = await this.findMemberInInterface(typeInfo.typeName, memberName, document, paramCount);
            if (ifaceResult) return ifaceResult;
        }
        return this.findMemberInClass(typeInfo.typeName, memberName, document, paramCount);
    }

    /**
     * Enumerates ALL members of a class (methods + properties), walking up the
     * inheritance chain.  Child members shadow parent members with the same name.
     *
     * Search order for the class definition:
     *   1. Current document
     *   2. INCLUDE chain reachable from the document
     *   3. ClassDefinitionIndexer (libsrc / accessory paths)
     *
     * @param className      The class to enumerate (e.g. "ThisWindow")
     * @param document       The document requesting completion
     * @param callerClass    Optional: the class the caller belongs to (for access filtering).
     *                       Omit to show only public members (external call site).
     * @returns Flat, deduped, access-filtered list of MemberEnumItem
     */
    async enumerateMembersInClass(
        className: string,
        document: TextDocument,
        callerClass?: string
    ): Promise<MemberEnumItem[]> {
        return this.collectInheritedMembers(
            className, document, callerClass, new Set()
        );
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
        // 1. Current file (column 0 label or structure)
        const local = tokens.find(t => t.start === 0 && this.tokenMatchesName(t, varName.toLowerCase()));
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
                        t.start === 0 && this.tokenMatchesName(t, varName.toLowerCase())
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
                t.start === 0 &&
                this.tokenMatchesName(t, varName.toLowerCase())
            );
            if (found) return { token: found, tokens: data.tokens, doc: data.doc };

            const nested = await this.searchIncludesForToken(varName, data.tokens, path.dirname(resolvedPath), visited);
            if (nested) return nested;
        }
        return null;
    }

    /**
     * Searches the current file, MEMBER parent, and INCLUDE chain for a structure field
     * identified by PRE prefix and field name (e.g. "SetG:SettingsGroup" → prefix="SetG", field="SettingsGroup").
     * Structure fields have token.structurePrefix === prefix and are not at column 0.
     */
    async findPrefixFieldTokenInChain(
        prefix: string,
        fieldName: string,
        document: TextDocument
    ): Promise<{ token: Token; tokens: Token[]; doc: TextDocument } | null> {
        const tokens = this.tokenCache.getTokens(document);
        const currentFilePath = decodeURIComponent(document.uri.replace(/^file:\/\/\//, '')).replace(/\//g, '\\');
        const currentDir = path.dirname(currentFilePath);

        // 1. Current file
        const found = this.findPrefixFieldInTokens(prefix, fieldName, tokens);
        if (found) return { token: found, tokens, doc: document };

        // 2. MEMBER parent + its include chain
        const memberToken = tokens.find(t => t.value?.toUpperCase() === 'MEMBER' && t.line < 5 && t.referencedFile);
        if (memberToken?.referencedFile) {
            const parentPath = this.resolveFilePath(memberToken.referencedFile, currentDir);
            if (parentPath) {
                const parentData = await this.loadDocument(parentPath);
                if (parentData) {
                    const parentFound = this.findPrefixFieldInTokens(prefix, fieldName, parentData.tokens);
                    if (parentFound) return { token: parentFound, tokens: parentData.tokens, doc: parentData.doc };
                    const incResult = await this.searchIncludesForPrefixField(
                        prefix, fieldName, parentData.tokens, path.dirname(parentPath), new Set([parentPath.toLowerCase()])
                    );
                    if (incResult) return incResult;
                }
            }
        }

        // 3. Current file include chain
        return this.searchIncludesForPrefixField(prefix, fieldName, tokens, currentDir, new Set());
    }

    private findPrefixFieldInTokens(prefix: string, fieldName: string, tokens: Token[]): Token | undefined {
        const prefixUpper = prefix.toUpperCase();
        const fieldUpper = fieldName.toUpperCase();
        return tokens.find(t =>
            t.structurePrefix?.toUpperCase() === prefixUpper &&
            // Label tokens: t.value is the name; Structure tokens (nested GROUP etc): t.label is the name
            (t.value.toUpperCase() === fieldUpper || t.label?.toUpperCase() === fieldUpper)
        );
    }

    private async searchIncludesForPrefixField(
        prefix: string,
        fieldName: string,
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

            const found = this.findPrefixFieldInTokens(prefix, fieldName, data.tokens);
            if (found) return { token: found, tokens: data.tokens, doc: data.doc };

            const nested = await this.searchIncludesForPrefixField(prefix, fieldName, data.tokens, path.dirname(resolvedPath), visited);
            if (nested) return nested;
        }
        return null;
    }


    /**
     * Returns true if a token's declared name matches varName.
     * - Label tokens: the name is token.value
     * - Structure/Procedure tokens: the name is token.label (e.g. "SetG:SettingsGroup GROUP" → label="SetG:SettingsGroup")
     */
    private tokenMatchesName(t: Token, nameLower: string): boolean {
        if (t.type === TokenType.Label) return t.value.toLowerCase() === nameLower;
        if (t.type === TokenType.Structure || t.type === TokenType.Procedure) {
            return t.label?.toLowerCase() === nameLower;
        }
        return false;
    }

    /**
     * Finds a named method inside an INTERFACE body using token data.
     * Interface methods are Procedure tokens with subType InterfaceMethod.
     * Falls back to null (caller then tries disk scan or include chain).
     */
    private findInterfaceMemberFromTokens(
        tokens: Token[],
        doc: TextDocument,
        filePath: string,
        ifaceName: string,
        methodName: string,
        paramCount: number | undefined
    ): MemberInfo | null {
        const ifaceToken = tokens.find(t =>
            t.type === TokenType.Structure &&
            t.subType === TokenType.Interface &&
            t.label?.toLowerCase() === ifaceName.toLowerCase() &&
            t.finishesAt !== undefined
        );
        if (!ifaceToken || ifaceToken.finishesAt === undefined) return null;
        const ifaceEnd = ifaceToken.finishesAt;

        const docLines = doc.getText().split(/\r?\n/);
        const candidates: OverloadCandidate[] = [];

        for (const token of tokens) {
            if (token.line <= ifaceToken.line || token.line >= ifaceEnd) continue;
            if (token.type !== TokenType.Procedure) continue;
            if (token.subType !== TokenType.InterfaceMethod) continue;
            if (token.label?.toLowerCase() !== methodName.toLowerCase()) continue;

            const memberLine = docLines[token.line] ?? '';
            const declParamCount = this.countParamsInDecl(memberLine);
            candidates.push({ type: 'PROCEDURE', line: token.line, paramCount: declParamCount, signature: memberLine.trim() });
        }

        const best = selectBestMemberOverload(candidates, paramCount);
        if (!best) return null;
        const fileUri = `file:///${filePath.replace(/\\/g, '/')}`;
        return { type: best.type, className: ifaceName, line: best.line, file: fileUri, signature: best.signature, isInterface: true };
    }

    /** Walks the INCLUDE chain searching for an INTERFACE method declaration. */
    private async findInterfaceInIncludeChain(
        ifaceName: string,
        methodName: string,
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

            const data = await this.loadDocument(resolvedPath);
            if (data) {
                const result = this.findInterfaceMemberFromTokens(data.tokens, data.doc, resolvedPath, ifaceName, methodName, paramCount);
                if (result) return result;

                const nested = await this.findInterfaceInIncludeChain(
                    ifaceName, methodName, data.tokens, path.dirname(resolvedPath), paramCount, visited
                );
                if (nested) return nested;
            }
        }
        return null;
    }

    /**
     * Finds a named method inside an INTERFACE.
     * Search order: current document INCLUDE chain → StructureDeclarationIndexer.
     */
    async findMemberInInterface(
        ifaceName: string,
        methodName: string,
        document: TextDocument,
        paramCount?: number
    ): Promise<MemberInfo | null> {
        const docPath = decodeURIComponent(document.uri.replace(/^file:\/\/\//, '')).replace(/\//g, '\\');
        const tokens = this.tokenCache.getTokensByUri(document.uri) ?? this.tokenCache.getTokens(document);

        // 1. Search current document tokens
        const localResult = this.findInterfaceMemberFromTokens(tokens, document, docPath, ifaceName, methodName, paramCount);
        if (localResult) return localResult;

        // 2. Walk INCLUDE chain reachable from this document
        const fromInclude = await this.findInterfaceInIncludeChain(
            ifaceName, methodName, tokens, path.dirname(docPath), paramCount,
            new Set([docPath.toLowerCase()])
        );
        if (fromInclude) return fromInclude;

        // 3. StructureDeclarationIndexer (covers libsrc / accessory paths)
        await this.ensureIndexBuilt();
        const infos = this.sdi.find(ifaceName);
        if (infos.length > 0) {
            const info = infos.find(d => d.structureType === 'INTERFACE') ?? infos[0];
            const result = await this.scanBodyForMember(info.filePath, ifaceName, methodName, paramCount, 'INTERFACE');
            if (result) return result;
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

            // 🚀 Load once — use tokens for member lookup, then recurse into nested INCLUDEs
            const data = await this.loadDocument(resolvedPath);
            if (data) {
                const result = this.findMemberFromTokens(data.tokens, data.doc, resolvedPath, className, memberName, paramCount);
                if (result) return result;
                // Fallback to disk scan for edge cases — prefer live editor text if file is open
                const diskUri = `file:///${resolvedPath.replace(/\\/g, '/')}`;
                const liveContent = this.tokenCache.getDocumentText(diskUri) ?? undefined;
                const diskResult = scanClassBodyForMember(
                    resolvedPath, className, memberName, paramCount, 'CLASS',
                    (line) => this.countParamsInDecl(line),
                    (candidates: OverloadCandidate[], pc) => selectBestMemberOverload(candidates, pc),
                    liveContent
                );
                if (diskResult) return diskResult;

                const nested = await this.findInIncludeChain(
                    className, memberName, data.tokens, path.dirname(resolvedPath), paramCount, visited
                );
                if (nested) return nested;
            }
        }
        return null;
    }

    /** Walks the CLASS(Parent) inheritance chain via the class index. */
    private async walkParentChain(
        className: string,
        memberName: string,
        paramCount: number | undefined,
        visited: Set<string>
    ): Promise<MemberInfo | null> {
        if (visited.has(className.toLowerCase())) return null;
        visited.add(className.toLowerCase());

        const classInfos = this.sdi.find(className);
        if (classInfos.length === 0) return null;

        const classInfo = classInfos.find(d => !d.isType) || classInfos[0];
        const result = await this.scanBodyForMember(classInfo.filePath, className, memberName, paramCount, classInfo.structureType as 'CLASS' | 'GROUP' | 'QUEUE' | undefined);
        if (result) return result;

        if (classInfo.parentName) {
            return this.walkParentChain(classInfo.parentName, memberName, paramCount, visited);
        }
        return null;
    }

    /** Thin wrapper: tries token-based member lookup first, falls back to disk scan. */
    private async scanBodyForMember(
        filePath: string,
        className: string,
        memberName: string,
        paramCount: number | undefined,
        structureType: 'CLASS' | 'QUEUE' | 'GROUP' | 'INTERFACE' = 'CLASS'
    ): Promise<MemberInfo | null> {
        const data = await this.loadDocument(filePath);
        if (data) {
            let result: MemberInfo | null = null;
            if (structureType === 'INTERFACE') {
                result = this.findInterfaceMemberFromTokens(data.tokens, data.doc, filePath, className, memberName, paramCount);
            } else {
                result = this.findMemberFromTokens(data.tokens, data.doc, filePath, className, memberName, paramCount, structureType);
            }
            if (result) return result;
        }
        // Fallback to disk-based scan — prefer live editor text if file is open
        const uri = `file:///${filePath.replace(/\\/g, '/')}`;
        const liveContent = this.tokenCache.getDocumentText(uri) ?? undefined;
        return scanClassBodyForMember(
            filePath, className, memberName, paramCount, structureType,
            (line) => this.countParamsInDecl(line),
            (candidates: OverloadCandidate[], pc) => selectBestMemberOverload(candidates, pc),
            liveContent
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
     * Token-based replacement for scanClassBodyForAllMembers.
     * Uses the DocumentStructure token tree: finds the CLASS/QUEUE/GROUP token by label,
     * collects Label tokens in its line range, and skips members inside nested structures.
     * Falls back to empty array (caller then tries the disk-based scan).
     */
    private extractMembersFromTokens(
        tokens: Token[],
        doc: TextDocument,
        className: string,
        filePath: string,
        structureType: 'CLASS' | 'QUEUE' | 'GROUP' = 'CLASS'
    ): MemberEnumItem[] {
        const classToken = tokens.find(t =>
            t.type === TokenType.Structure &&
            t.value.toUpperCase() === structureType &&
            t.label?.toLowerCase() === className.toLowerCase() &&
            t.finishesAt !== undefined
        );
        if (!classToken || classToken.finishesAt === undefined) return [];
        const classEnd = classToken.finishesAt;

        // Ranges of nested GROUP/QUEUE/RECORD structures inside this class — skip their contents
        const nestedRanges = tokens
            .filter(t =>
                t.type === TokenType.Structure &&
                ['GROUP', 'QUEUE', 'RECORD'].includes(t.value.toUpperCase()) &&
                t.finishesAt !== undefined &&
                t.line > classToken.line &&
                t.line < classEnd
            )
            .map(t => ({ start: t.line, end: t.finishesAt! }));

        const isInsideNested = (line: number): boolean =>
            nestedRanges.some(r => line > r.start && line < r.end);

        const docLines = doc.getText().split(/\r?\n/);
        const results: MemberEnumItem[] = [];

        for (const token of tokens) {
            if (token.line <= classToken.line || token.line >= classEnd) continue;
            if (token.type !== TokenType.Label) continue;
            if (token.start !== 0) continue;
            if (isInsideNested(token.line)) continue;

            const raw = docLines[token.line] ?? '';
            const memberMatch = raw.match(/^(\w+)\s+(.+?)(\s*!.*)?$/);
            if (!memberMatch) continue;

            const name = memberMatch[1];
            const typeStr = (memberMatch[2] || '').replace(/!.*$/, '').trim();
            const access = detectMemberAccess(raw);
            const kind: 'method' | 'property' = /^PROCEDURE\b/i.test(typeStr) ? 'method' : 'property';

            results.push({ name, kind, signature: raw.trim(), type: typeStr, access, fromClass: className, line: token.line, file: filePath });
        }
        return results;
    }

    /**
     * Token-based replacement for scanClassBodyForMember.
     * Finds a specific member by name inside a CLASS/QUEUE/GROUP, supporting overloads.
     * Falls back to null (caller then tries disk-based scan).
     */
    private findMemberFromTokens(
        tokens: Token[],
        doc: TextDocument,
        filePath: string,
        className: string,
        memberName: string,
        paramCount: number | undefined,
        structureType: 'CLASS' | 'QUEUE' | 'GROUP' = 'CLASS'
    ): MemberInfo | null {
        const classToken = tokens.find(t =>
            t.type === TokenType.Structure &&
            t.value.toUpperCase() === structureType &&
            t.label?.toLowerCase() === className.toLowerCase() &&
            t.finishesAt !== undefined
        );
        if (!classToken || classToken.finishesAt === undefined) return null;
        const classEnd = classToken.finishesAt;

        const nestedRanges = tokens
            .filter(t =>
                t.type === TokenType.Structure &&
                ['GROUP', 'QUEUE', 'RECORD'].includes(t.value.toUpperCase()) &&
                t.finishesAt !== undefined &&
                t.line > classToken.line &&
                t.line < classEnd
            )
            .map(t => ({ start: t.line, end: t.finishesAt! }));

        const isInsideNested = (line: number): boolean =>
            nestedRanges.some(r => line > r.start && line < r.end);

        const docLines = doc.getText().split(/\r?\n/);
        const candidates: OverloadCandidate[] = [];

        for (const token of tokens) {
            if (token.line <= classToken.line || token.line >= classEnd) continue;
            if (token.type !== TokenType.Label) continue;
            if (token.start !== 0) continue;
            if (token.value.toLowerCase() !== memberName.toLowerCase()) continue;
            if (isInsideNested(token.line)) continue;

            const memberLine = docLines[token.line] ?? '';
            const afterMember = memberLine.substring(token.value.length).trimStart();
            const type = (afterMember.split(/\s*!/).shift() || afterMember).trim() || 'Unknown';
            let declParamCount = 0;
            if (type.toUpperCase().startsWith('PROCEDURE')) {
                declParamCount = this.countParamsInDecl(memberLine);
            }
            candidates.push({ type, line: token.line, paramCount: declParamCount, signature: memberLine.trim() });
        }

        const bestMatch = selectBestMemberOverload(candidates, paramCount);
        if (bestMatch) {
            const fileUri = `file:///${filePath.replace(/\\/g, '/')}`;
            return { type: bestMatch.type, className, line: bestMatch.line, file: fileUri, signature: bestMatch.signature };
        }
        return null;
    }

    /**
     * Extracts { typeName, isClass, isReference } from a token.
     * isReference is true when the variable was declared as &TypeName.
     * isClass is true for CLASS/INTERFACE and bare user-defined type names.
     */
    private extractTypeFromToken(token: Token, tokens: Token[]): { typeName: string; isClass: boolean; isReference: boolean } | null {
        const typeStr = SymbolFinderService.extractTypeInfo(token, tokens);
        if (!typeStr || typeStr === 'UNKNOWN') return null;

        // Check whether the next token on the declaration line is a reference (&TypeName)
        const lineTokens = tokens.filter(t => t.line === token.line);
        const idx = lineTokens.indexOf(token);
        const isReference = idx + 1 < lineTokens.length && lineTokens[idx + 1].type === TokenType.ReferenceVariable;

        // CLASS(TypeName), QUEUE(TypeName), GROUP(TypeName), FILE(TypeName)
        const structMatch = typeStr.match(/^(CLASS|QUEUE|GROUP|FILE)\((\w+)\)$/i);
        if (structMatch) {
            return { typeName: structMatch[2], isClass: structMatch[1].toUpperCase() === 'CLASS', isReference };
        }

        // LIKE(TypeName) or LIKE(PREFIX:TypeName) — inherited type; treat as navigable structure
        const likeMatch = typeStr.match(/^LIKE\(([\w:]+)\)$/i);
        if (likeMatch) return { typeName: likeMatch[1], isClass: true, isReference };

        // Bare structure keywords — can't resolve members
        const bareStructures = new Set(['CLASS', 'QUEUE', 'GROUP', 'FILE', 'RECORD', 'WINDOW', 'VIEW', 'REPORT', 'LIKE', 'PROCEDURE']);
        if (bareStructures.has(typeStr.toUpperCase())) return null;

        // Plain user-defined type name (assumed to be a CLASS/INTERFACE for member access)
        return { typeName: typeStr, isClass: true, isReference };
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
            const uri = `file:///${filePath.replace(/\\/g, '/')}`;
            const doc = TextDocument.create(uri, 'clarion', 1, content);
            // 🚀 Prefer tokens already in the cache (e.g. file open in editor) to avoid
            // overwriting the cache entry with disk content (version=1) which may be stale.
            const cachedTokens = this.tokenCache.getTokensByUri(uri);
            const tokens = cachedTokens ?? this.tokenCache.getTokens(doc);
            return { doc, tokens };
        } catch {
            return null;
        }
    }

    private async ensureIndexBuilt(): Promise<void> {
        const sm = SolutionManager.getInstance();
        if (!sm?.solution) return;
        for (const project of sm.solution.projects) {
            await this.sdi.getOrBuildIndex(project.path);
        }
    }

    /**
     * Recursively collects members of className and all ancestor classes.
     * Returns a child-first deduped list: if a child and parent both define
     * a member with the same (case-insensitive) name, the child's version wins.
     */
    private async collectInheritedMembers(
        className: string,
        document: TextDocument,
        callerClass: string | undefined,
        visited: Set<string>
    ): Promise<MemberEnumItem[]> {
        const key = className.toLowerCase();
        if (visited.has(key)) return [];
        visited.add(key);

        // 1. Find raw members of this class
        const ownMembers = await this.findAllMembersInClass(className, document);

        // 2. Determine access filter relative to the caller
        const accessAllowed = this.accessFilter(className, callerClass);
        const filtered = ownMembers.filter(m => accessAllowed.has(m.access));

        // 3. Determine the parent class (if any)
        let parentClassName: string | undefined;

        // Try include chain first, then indexer
        const classInfo = await this.findClassInfoInDoc(className, document);
        if (classInfo?.parentClass) {
            parentClassName = classInfo.parentClass;
        } else {
            await this.ensureIndexBuilt();
            const indexed = this.sdi.find(className);
            if (indexed.length > 0) {
                parentClassName = (indexed.find(d => !d.isType) || indexed[0]).parentName;
            }
        }

        if (!parentClassName) return filtered;

        // 4. Recurse into the parent
        const parentMembers = await this.collectInheritedMembers(
            parentClassName, document, callerClass, visited
        );

        // 5. Merge child-first: child members shadow parent members by name
        const childNames = new Set(filtered.map(m => m.name.toLowerCase()));
        const uniqueParent = parentMembers.filter(m => !childNames.has(m.name.toLowerCase()));

        return [...filtered, ...uniqueParent];
    }

    /**
     * Locates the raw (unfiltered) MemberEnumItem[] for a single class in:
     *   1. Current document (token-based, then disk fallback)
     *   2. INCLUDE chain reachable from the document
     *   3. ClassDefinitionIndexer
     */
    private async findAllMembersInClass(
        className: string,
        document: TextDocument
    ): Promise<MemberEnumItem[]> {
        const docPath = decodeURIComponent(document.uri.replace(/^file:\/\/\//, '')).replace(/\//g, '\\');
        const tokens = this.tokenCache.getTokens(document);

        // 1. Current document — token-based first, disk fallback
        const tokenMembers = this.extractMembersFromTokens(tokens, document, className, docPath);
        if (tokenMembers.length > 0) return tokenMembers;
        const diskMembers = scanClassBodyForAllMembers(docPath, className);
        if (diskMembers.length > 0) return diskMembers;

        // 2. INCLUDE chain
        const fromInclude = await this.findAllMembersInIncludeChain(
            className, tokens, path.dirname(docPath), new Set([docPath.toLowerCase()])
        );
        if (fromInclude.length > 0) return fromInclude;

        // 3. StructureDeclarationIndexer
        await this.ensureIndexBuilt();
        const infos = this.sdi.find(className);
        if (infos.length > 0) {
            const info = infos.find(d => !d.isType) || infos[0];
            const indexedData = await this.loadDocument(info.filePath);
            if (indexedData) {
                const indexedMembers = this.extractMembersFromTokens(indexedData.tokens, indexedData.doc, className, info.filePath, info.structureType as 'CLASS' | 'GROUP' | 'QUEUE' | undefined);
                if (indexedMembers.length > 0) return indexedMembers;
            }
            return scanClassBodyForAllMembers(info.filePath, className, info.structureType as 'CLASS' | 'GROUP' | 'QUEUE' | undefined);
        }

        return [];
    }

    /** Walks the INCLUDE chain searching for className and enumerating its members. */
    private async findAllMembersInIncludeChain(
        className: string,
        tokens: Token[],
        fromDir: string,
        visited: Set<string>
    ): Promise<MemberEnumItem[]> {
        const includeTokens = tokens.filter(t => t.value?.toUpperCase() === 'INCLUDE' && t.referencedFile);
        for (const inc of includeTokens) {
            const resolvedPath = this.resolveFilePath(inc.referencedFile!, fromDir);
            if (!resolvedPath || visited.has(resolvedPath.toLowerCase())) continue;
            visited.add(resolvedPath.toLowerCase());

            // 🚀 Load once — use tokens for member extraction, then recurse into nested INCLUDEs
            const data = await this.loadDocument(resolvedPath);
            if (data) {
                const members = this.extractMembersFromTokens(data.tokens, data.doc, className, resolvedPath);
                if (members.length > 0) return members;
                // Fallback to disk scan if token-based found nothing (e.g. file not yet tokenized)
                const diskMembers = scanClassBodyForAllMembers(resolvedPath, className);
                if (diskMembers.length > 0) return diskMembers;

                const nested = await this.findAllMembersInIncludeChain(
                    className, data.tokens, path.dirname(resolvedPath), visited
                );
                if (nested.length > 0) return nested;
            }
        }
        return [];
    }

    /**
     * Finds the ClassDefinitionInfo for a class by scanning the current document
     * and its include chain (before falling back to the indexer).
     * Returns the info only if found and has a parentClass field worth following.
     */
    private async findClassInfoInDoc(
        className: string,
        document: TextDocument
    ): Promise<{ parentClass?: string } | null> {
        // Quick scan: look for "ClassName  CLASS(ParentName)" in the document text
        const lines = document.getText().split('\n');
        const pattern = new RegExp(`^${className}\\s+CLASS\\s*\\((\\w+)\\)`, 'i');
        for (const line of lines) {
            const m = line.match(pattern);
            if (m) return { parentClass: m[1] };
        }
        return null;
    }

    /**
     * Returns the set of access levels visible to callerClass when accessing className.
     * - same class    → public + protected + private
     * - subclass      → public + protected
     * - external      → public only
     */
    private accessFilter(className: string, callerClass: string | undefined): Set<'public' | 'protected' | 'private'> {
        if (!callerClass) return new Set(['public']);
        if (callerClass.toLowerCase() === className.toLowerCase()) {
            return new Set(['public', 'protected', 'private']);
        }
        // Check if callerClass is a subclass of className via the indexer
        const callerInfos = this.sdi.find(callerClass);
        if (callerInfos.length > 0) {
            let current = (callerInfos.find(d => !d.isType) || callerInfos[0])?.parentName;
            const seen = new Set<string>();
            while (current && !seen.has(current.toLowerCase())) {
                seen.add(current.toLowerCase());
                if (current.toLowerCase() === className.toLowerCase()) {
                    return new Set(['public', 'protected']);
                }
                const parentInfos = this.sdi.find(current);
                current = parentInfos.length > 0
                    ? (parentInfos.find(d => !d.isType) || parentInfos[0])?.parentName
                    : undefined;
            }
        }
        return new Set(['public']);
    }
}
