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
import { TokenHelper } from '../utils/TokenHelper';
import { StructureDeclarationIndexer, StructureDeclarationInfo } from '../utils/StructureDeclarationIndexer';
import { CrossFileCache } from '../providers/hover/CrossFileCache';
import { MemberInfo, MemberEnumItem, OverloadCandidate, scanClassBodyForMember, scanClassBodyForAllMembers, selectBestMemberOverload, detectMemberAccess } from '../utils/ClassMemberResolver';
import { SymbolFinderService } from './SymbolFinderService';
import { SolutionManager } from '../solution/solutionManager';
import { resolveFileInNoSolutionMode } from '../solution/findFileNoSolution';
import * as fs from 'fs';
import * as path from 'path';
import LoggerManager from '../logger';

const logger = LoggerManager.getLogger("MemberLocatorService");
const dotAccessTraceEnabled = process.env.CLARION_TRACE_DOT_ACCESS === '1';
logger.setLevel(dotAccessTraceEnabled ? "test" : "error");

export class MemberLocatorService {
    private sdi = StructureDeclarationIndexer.getInstance();
    private tokenCache = TokenCache.getInstance();

    constructor(private crossFileCache?: CrossFileCache) {}

    private trace(message: string, ...args: any[]): void {
        logger.test(`[DotAccessTrace] ${message}`, ...args);
    }

    private deriveOwnerClassFromMethodName(methodName: string, document: TextDocument): string | null {
        const lines = document.getText().split(/\r?\n/);
        const methodLower = methodName.toLowerCase();
        for (const line of lines) {
            const match = line.match(/^\s*([A-Za-z_]\w*)\.([A-Za-z_]\w*)(?:\.([A-Za-z_]\w*))?\s+PROCEDURE\b/i);
            if (!match) continue;
            const className = match[1];
            const candidateMethod = (match[3] ?? match[2]).toLowerCase();
            if (candidateMethod === methodLower) {
                return className;
            }
        }
        return null;
    }

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
                        this.isVariableLookupCandidate(t) && this.tokenMatchesName(t, varName.toLowerCase())
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
     * Search order: current file → MEMBER parent → INCLUDE chain → procedure parameters.
     * Returns { typeName, isClass, isReference } or null if not found/unresolvable.
     * isReference is true when the variable was declared as &TypeName (Clarion reference).
     *
     * Pass `scopeLine` when the caller has position context — this enables resolving
     * parameters of the enclosing procedure (e.g. `*WindowInfo Info`), which are not
     * column-0 tokens and are therefore invisible to `findVariableTokenCrossFile`.
     */
    async resolveVariableType(
        varName: string,
        tokens: Token[],
        document: TextDocument,
        scopeLine?: number
    ): Promise<{ typeName: string; isClass: boolean; isReference: boolean } | null> {
        const found = await this.findVariableTokenCrossFile(varName, tokens, document, scopeLine);
        if (!found) {
            if (scopeLine !== undefined) {
                return this.resolveParameterType(varName, document, scopeLine);
            }
            return null;
        }
        const extracted = this.extractTypeFromToken(found.token, found.tokens);
        if (!extracted) return null;
        return this.resolveTypeAlias(extracted, found.tokens, found.doc, scopeLine);
    }

    /**
     * Follow type aliases declared with LIKE(...) so reference variables like
     * `rq &AliasQ` where `AliasQ LIKE(BaseQ)` resolve to `BaseQ`.
     */
    private async resolveTypeAlias(
        typeInfo: { typeName: string; isClass: boolean; isReference: boolean },
        tokens: Token[],
        document: TextDocument,
        scopeLine?: number
    ): Promise<{ typeName: string; isClass: boolean; isReference: boolean }> {
        let current = typeInfo;
        const visited = new Set<string>();

        for (let i = 0; i < 8; i++) {
            const key = current.typeName.toLowerCase();
            if (visited.has(key)) break;
            visited.add(key);

            const aliasDecl = await this.findVariableTokenCrossFile(current.typeName, tokens, document, scopeLine);
            if (!aliasDecl) break;

            // Only dereference explicit LIKE(...) aliases; do not reinterpret
            // concrete structure declarations (e.g. INTERFACE/CLASS/QUEUE labels).
            const aliasTypeStr = SymbolFinderService.extractTypeInfo(aliasDecl.token, aliasDecl.tokens);
            if (!/^LIKE\s*\(/i.test(aliasTypeStr)) break;

            const aliasType = this.extractTypeFromToken(aliasDecl.token, aliasDecl.tokens);
            if (!aliasType) break;
            if (aliasType.typeName.toLowerCase() === current.typeName.toLowerCase()) break;

            current = {
                typeName: aliasType.typeName,
                isClass: aliasType.isClass,
                isReference: current.isReference || aliasType.isReference
            };
        }

        return current;
    }

    /**
     * Resolves the type of `varName` as a procedure parameter by parsing the
     * PROCEDURE(...) header of the scope that encloses `scopeLine`.
     * Handles `*TypeName` (pass-by-address GROUP/QUEUE) and `&TypeName` (reference)
     * prefixes, stripping them to obtain the bare type name.
     */
    private resolveParameterType(
        varName: string,
        document: TextDocument,
        scopeLine: number
    ): { typeName: string; isClass: boolean; isReference: boolean } | null {
        const structure = this.tokenCache.getStructure(document);
        const scopeToken = TokenHelper.getInnermostScopeAtLine(structure, scopeLine);
        if (!scopeToken) return null;

        const lines = document.getText().split('\n');
        const procedureLine = lines[scopeToken.line];
        if (!procedureLine) return null;

        const sigMatch = procedureLine.match(/PROCEDURE\s*\((.*?)\)/i);
        if (!sigMatch || !sigMatch[1]) return null;

        const wordLower = varName.toLowerCase();
        for (const param of sigMatch[1].split(',')) {
            const trimmed = param.trim().replace(/^<(.*)>$/, '$1').trim();
            // [*&]? TYPE NAME [= default]  or  <*TYPE NAME>
            const m = trimmed.match(/^([*&]?\s*[\w:]+)\s+([A-Za-z_][\w:]*)(?:\s*=.*)?$/i);
            if (!m) continue;

            const rawType = m[1].trim();
            const paramName = m[2];
            const pLower = paramName.toLowerCase();
            if (pLower !== wordLower && !pLower.endsWith(':' + wordLower)) continue;

            const isRef = rawType.startsWith('&');
            const typeName = rawType.replace(/^[*&]\s*/, '').trim();
            if (!typeName) continue;

            logger.info(`resolveParameterType: "${varName}" → type "${typeName}" (isRef=${isRef})`);
            // Treat the resolved parameter type as a user-defined type (isClass: true) so callers
            // route through findMemberInClass which has SDI support for GROUP/QUEUE/CLASS types.
            return { typeName, isClass: true, isReference: isRef };
        }
        return null;
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
        this.trace(`findMemberInClass start class="${className}" member="${memberName}" paramCount=${paramCount ?? 'n/a'}`);
        const docPath = decodeURIComponent(document.uri.replace(/^file:\/\/\//, '')).replace(/\//g, '\\');
        const tokens = this.tokenCache.getTokensByUri(document.uri) ?? this.tokenCache.getTokens(document);

        // 0. Current document tokens (keep CLASS path behavior; add GROUP/QUEUE fallback)
        const fromCurrentDoc =
            await this.scanBodyForMember(docPath, className, memberName, paramCount, 'CLASS') ??
            await this.scanBodyForMember(docPath, className, memberName, paramCount, 'GROUP') ??
            await this.scanBodyForMember(docPath, className, memberName, paramCount, 'QUEUE');
        if (fromCurrentDoc) {
            this.trace(`findMemberInClass hit current document file="${fromCurrentDoc.file}" line=${fromCurrentDoc.line}`);
            return fromCurrentDoc;
        }

        // 1. Walk INCLUDE chain reachable from this document
        const fromInclude = await this.findInIncludeChain(
            className, memberName, tokens, path.dirname(docPath), paramCount,
            new Set([docPath.toLowerCase()])
        );
        if (fromInclude) {
            this.trace(`findMemberInClass hit include chain file="${fromInclude.file}" line=${fromInclude.line}`);
            return fromInclude;
        }

        // 1.5 MEMBER parent file + its INCLUDE chain (common libsrc .clw layout)
        const memberToken = tokens.find(t => t.value?.toUpperCase() === 'MEMBER' && t.line < 5 && t.referencedFile);
        if (memberToken?.referencedFile) {
            const parentPath = this.resolveFilePath(memberToken.referencedFile, path.dirname(docPath));
            if (parentPath) {
                const parentData = await this.loadDocument(parentPath);
                if (parentData) {
                    const fromMemberParent =
                        this.findMemberFromTokens(parentData.tokens, parentData.doc, parentPath, className, memberName, paramCount, 'CLASS') ??
                        this.findMemberFromTokens(parentData.tokens, parentData.doc, parentPath, className, memberName, paramCount, 'GROUP') ??
                        this.findMemberFromTokens(parentData.tokens, parentData.doc, parentPath, className, memberName, paramCount, 'QUEUE');
                    if (fromMemberParent) {
                        this.trace(`findMemberInClass hit MEMBER parent file="${fromMemberParent.file}" line=${fromMemberParent.line}`);
                        return fromMemberParent;
                    }

                    const fromMemberIncludes = await this.findInIncludeChain(
                        className,
                        memberName,
                        parentData.tokens,
                        path.dirname(parentPath),
                        paramCount,
                        new Set([docPath.toLowerCase(), parentPath.toLowerCase()])
                    );
                    if (fromMemberIncludes) {
                        this.trace(`findMemberInClass hit MEMBER include chain file="${fromMemberIncludes.file}" line=${fromMemberIncludes.line}`);
                        return fromMemberIncludes;
                    }
                }
            }
        }

        // 2. Resolve through declaration + parent chain (current doc / INCLUDE chain / index)
        const fromHierarchy = await this.walkParentChain(
            className,
            memberName,
            paramCount,
            new Set(),
            document
        );
        if (fromHierarchy) {
            this.trace(`findMemberInClass hit parent chain file="${fromHierarchy.file}" line=${fromHierarchy.line}`);
            return fromHierarchy;
        }

        const ownerClass = this.deriveOwnerClassFromMethodName(className, document);
        if (ownerClass && ownerClass.toLowerCase() !== className.toLowerCase()) {
            this.trace(`findMemberInClass treating "${className}" as method name; retrying with owner class "${ownerClass}"`);
            const ownerResult = await this.findMemberInClass(ownerClass, memberName, document, paramCount);
            if (ownerResult) return ownerResult;
        }

        this.trace(`findMemberInClass miss class="${className}" member="${memberName}"`);

        return null;
    }

    /**
     * Enumerates interface methods with their declaration parameter counts.
     * Used by the interface-implementation diagnostic to distinguish overloads.
     */
    async enumerateInterfaceMembersWithParamCounts(
        ifaceName: string,
        document: TextDocument
    ): Promise<Array<{ name: string; paramCount: number }> | null> {
        const docPath = decodeURIComponent(document.uri.replace(/^file:\/\/\//, '')).replace(/\//g, '\\');
        const tokens = this.tokenCache.getTokensByUri(document.uri) ?? this.tokenCache.getTokens(document);
        const docLines = document.getText().split(/\r?\n/);

        const local = this.enumerateInterfaceMembersFromTokensWithParamCounts(tokens, ifaceName, docLines);
        if (local) return local;

        const fromInclude = await this.enumerateInterfaceMembersInIncludeChainWithParamCounts(
            ifaceName, tokens, path.dirname(docPath), new Set([docPath.toLowerCase()])
        );
        if (fromInclude) return fromInclude;

        await this.ensureIndexBuilt();
        const infos = this.sdi.find(ifaceName);
        if (infos.length > 0) {
            const info = infos.find(d => d.structureType === 'INTERFACE') ?? infos[0];
            const data = await this.loadDocument(info.filePath);
            if (data) {
                const fromSdi = this.enumerateInterfaceMembersFromTokensWithParamCounts(
                    data.tokens, ifaceName, data.doc.getText().split(/\r?\n/)
                );
                if (fromSdi) return fromSdi;
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
        if (!typeInfo) {
            this.trace(`resolveDotAccess type miss object="${objectName}" member="${memberName}"`);
            return null;
        }
        this.trace(`resolveDotAccess object="${objectName}" type="${typeInfo.typeName}" member="${memberName}" isRef=${typeInfo.isReference}`);
        // Try interface lookup first for reference variables (&TypeName), then fall back to class
        if (typeInfo.isReference) {
            const ifaceResult = await this.findMemberInInterface(typeInfo.typeName, memberName, document, paramCount);
            if (ifaceResult) {
                this.trace(`resolveDotAccess resolved via interface "${typeInfo.typeName}" at ${ifaceResult.file}:${ifaceResult.line}`);
                return ifaceResult;
            }
        }
        const classResult = await this.findMemberInClass(typeInfo.typeName, memberName, document, paramCount);
        if (classResult) {
            this.trace(`resolveDotAccess resolved via class "${classResult.className}" at ${classResult.file}:${classResult.line}`);
            return classResult;
        }
        this.trace(`resolveDotAccess miss object="${objectName}" type="${typeInfo.typeName}" member="${memberName}"`);
        return null;
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
        document: TextDocument,
        scopeLine?: number
    ): Promise<{ token: Token; tokens: Token[]; doc: TextDocument } | null> {
        const varNameLower = varName.toLowerCase();

        // When scopeLine is known, build a set of "other procedure" line ranges to skip.
        // This prevents picking up a same-named local variable from a sibling procedure
        // (e.g. `Info` at line 932 inside INIClass.Update when we're inside INIClass.UpdateWindowInfo).
        let excludedRanges: Array<{ start: number; end: number }> = [];
        if (scopeLine !== undefined) {
            const structure = this.tokenCache.getStructure(document);
            const currentScope = TokenHelper.getInnermostScopeAtLine(structure, scopeLine);
            const currentScopeLine = currentScope?.line;
            excludedRanges = tokens
                .filter(t =>
                    TokenHelper.isProcedureOrFunction(t) &&
                    t.finishesAt !== undefined &&
                    t.line !== currentScopeLine
                )
                .map(t => ({ start: t.line, end: t.finishesAt! }));
        }
        const isExcluded = (line: number): boolean =>
            excludedRanges.some(r => line > r.start && line <= r.end);

        // 1. Current file (column 0 label or structure)
        const local = tokens.find(t =>
            this.isVariableLookupCandidate(t) &&
            this.tokenMatchesName(t, varNameLower) &&
            !isExcluded(t.line)
        );
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
                        this.isVariableLookupCandidate(t) && this.tokenMatchesName(t, varName.toLowerCase())
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
                this.isVariableLookupCandidate(t) &&
                this.tokenMatchesName(t, varName.toLowerCase())
            );
            if (found) return { token: found, tokens: data.tokens, doc: data.doc };

            const nested = await this.searchIncludesForToken(varName, data.tokens, path.dirname(resolvedPath), visited);
            if (nested) return nested;
        }
        return null;
    }

    private async enumerateInterfaceMembersInIncludeChainWithParamCounts(
        ifaceName: string,
        tokens: Token[],
        fromDir: string,
        visited: Set<string>
    ): Promise<Array<{ name: string; paramCount: number }> | null> {
        const includeTokens = tokens.filter(t => t.value?.toUpperCase() === 'INCLUDE' && t.referencedFile);
        for (const inc of includeTokens) {
            const resolvedPath = this.resolveFilePath(inc.referencedFile!, fromDir);
            if (!resolvedPath || visited.has(resolvedPath.toLowerCase())) continue;
            visited.add(resolvedPath.toLowerCase());

            const data = await this.loadDocument(resolvedPath);
            if (data) {
                const found = this.enumerateInterfaceMembersFromTokensWithParamCounts(
                    data.tokens, ifaceName, data.doc.getText().split(/\r?\n/)
                );
                if (found) return found;

                const nested = await this.enumerateInterfaceMembersInIncludeChainWithParamCounts(
                    ifaceName, data.tokens, path.dirname(resolvedPath), visited
                );
                if (nested) return nested;
            }
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
        if (t.type === TokenType.Structure || TokenHelper.isProcedureOrFunction(t)) {
            return t.label?.toLowerCase() === nameLower;
        }
        return false;
    }

    private isVariableLookupCandidate(t: Token): boolean {
        return t.type === TokenType.Structure || TokenHelper.isProcedureOrFunction(t) || t.start === 0;
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
            if (!TokenHelper.isProcedureOrFunction(token)) continue;
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

    /**
     * #181 — enumerates ALL method names declared in an INTERFACE, resolving the
     * interface through the same search order as {@link findMemberInInterface}:
     * current document → INCLUDE chain → StructureDeclarationIndexer.
     *
     * In Clarion a CLASS that implements an interface from another file pulls it
     * in via `INCLUDE('iface.inc'),ONCE`, so the interface is reachable by
     * walking the class file's own INCLUDE chain — this is the inverse of the
     * single-method `findMemberInInterface` lookup.
     *
     * Returns the declared method names (original case), or `null` when the
     * interface cannot be located anywhere reachable — letting callers skip
     * validation rather than false-positive on an unresolvable interface.
     */
    async enumerateInterfaceMembers(
        ifaceName: string,
        document: TextDocument
    ): Promise<string[] | null> {
        const docPath = decodeURIComponent(document.uri.replace(/^file:\/\/\//, '')).replace(/\//g, '\\');
        const tokens = this.tokenCache.getTokensByUri(document.uri) ?? this.tokenCache.getTokens(document);

        // 1. Current document
        const local = this.enumerateInterfaceMembersFromTokens(tokens, ifaceName);
        if (local) return local;

        // 2. INCLUDE chain reachable from this document
        const fromInclude = await this.enumerateInterfaceMembersInIncludeChain(
            ifaceName, tokens, path.dirname(docPath), new Set([docPath.toLowerCase()])
        );
        if (fromInclude) return fromInclude;

        // 3. StructureDeclarationIndexer (libsrc / accessory paths)
        await this.ensureIndexBuilt();
        const infos = this.sdi.find(ifaceName);
        if (infos.length > 0) {
            const info = infos.find(d => d.structureType === 'INTERFACE') ?? infos[0];
            const data = await this.loadDocument(info.filePath);
            if (data) {
                const fromSdi = this.enumerateInterfaceMembersFromTokens(data.tokens, ifaceName);
                if (fromSdi) return fromSdi;
            }
        }

        return null;
    }

    /**
     * #165/#181 — collects the interface-method implementations a class actually
     * provides, keyed `interfacename.methodname` (lowercased).
     *
     * Per the Clarion INTERFACE docs (verified against LibSrc, e.g.
     * `CSocketConnection.IConnection.CloseSocket PROCEDURE` in abapi.clw), an
     * implementing class does NOT re-declare interface methods in its body — it
     * defines them in its implementation module as three-part
     * `Class.Interface.Method PROCEDURE` definitions. Those tokenize as
     * `MethodImplementation` tokens with a 3-part dotted `.label`.
     *
     * `moduleFile` is the `.clw` named in the class's `MODULE(...)` attribute.
     * Returns `null` when it can't be resolved/loaded so callers skip rather than
     * false-positive.
     */
    async collectImplementedInterfaceMethods(
        className: string,
        moduleFile: string,
        document: TextDocument
    ): Promise<Set<string> | null> {
        const docPath = decodeURIComponent(document.uri.replace(/^file:\/\/\//, '')).replace(/\//g, '\\');
        const resolved = this.resolveFilePath(moduleFile, path.dirname(docPath));
        if (!resolved) return null;
        const data = await this.loadDocument(resolved);
        if (!data) return null;
        return this.scanThreePartImpls(data.tokens, className);
    }

    /**
     * Collects the implemented interface methods for a class and all of its
     * ancestors. Returns null when any link in the chain cannot be resolved so
     * callers can skip rather than false-positive.
     */
    async collectImplementedInterfaceMethodsIncludingAncestors(
        className: string,
        document: TextDocument,
        inlineAllowed: boolean
    ): Promise<Set<string> | null> {
        const visited = new Set<string>();
        return this.collectImplementedInterfaceMethodsRecursive(className, document, inlineAllowed, visited);
    }

    /**
     * #165/#181 — token-scanning variant of {@link collectImplementedInterfaceMethods}
     * for a class declared AND implemented in the same module (a PROGRAM/MEMBER
     * `.clw` with no `MODULE(...)` attribute) — the three-part impls are in the
     * document's own tokens.
     */
    collectImplementedInterfaceMethodsFromTokens(
        tokens: Token[],
        className: string
    ): Set<string> {
        return this.scanThreePartImpls(tokens, className);
    }

    /** Collects `interface.method` (lowercased) for every three-part
     * `Class.Interface.Method` MethodImplementation token of `className`. */
    private scanThreePartImpls(tokens: Token[], className: string): Set<string> {
        const clsLower = className.toLowerCase();
        const impls = new Set<string>();
        for (const t of tokens) {
            if (t.subType !== TokenType.MethodImplementation || !t.label) continue;
            const parts = t.label.split('.');
            if (parts.length !== 3) continue;
            if (parts[0].toLowerCase() !== clsLower) continue;
            impls.add(`${parts[1].toLowerCase()}.${parts[2].toLowerCase()}`);
        }
        return impls;
    }

    private scanThreePartImplsWithCounts(tokens: Token[], className: string, docLines: string[]): Set<string> {
        const clsLower = className.toLowerCase();
        const impls = new Set<string>();
        for (const t of tokens) {
            if (t.subType !== TokenType.MethodImplementation || !t.label) continue;
            const parts = t.label.split('.');
            if (parts.length !== 3) continue;
            if (parts[0].toLowerCase() !== clsLower) continue;
            const methodName = parts[2].toLowerCase();
            const lineText = docLines[t.line] ?? '';
            const paramCount = this.countParamsInDecl(lineText);
            impls.add(`${parts[1].toLowerCase()}.${methodName}#${paramCount}`);
        }
        return impls;
    }

    private async collectImplementedInterfaceMethodsRecursive(
        className: string,
        document: TextDocument,
        inlineAllowed: boolean,
        visited: Set<string>
    ): Promise<Set<string> | null> {
        const key = className.toLowerCase();
        if (visited.has(key)) return new Set();
        visited.add(key);

        const info = await this.resolveClassDeclarationInfo(className, document);
        if (!info) return null;

        const ownImpls = await this.collectImplementedInterfaceMethodsForDeclaration(info, document, inlineAllowed);
        if (ownImpls === null) return null;

        const merged = new Set(ownImpls);
        if (info.parentName) {
            const parentImpls = await this.collectImplementedInterfaceMethodsRecursive(
                info.parentName,
                document,
                inlineAllowed,
                visited
            );
            if (parentImpls === null) return null;
            for (const entry of parentImpls) {
                merged.add(entry);
            }
        }

        return merged;
    }

    private async collectImplementedInterfaceMethodsForDeclaration(
        info: StructureDeclarationInfo,
        document: TextDocument,
        inlineAllowed: boolean
    ): Promise<Set<string> | null> {
        const currentPath = decodeURIComponent(document.uri.replace(/^file:\/\/\//, '')).replace(/\//g, '\\');
        if (info.moduleName) {
            const resolved = this.resolveFilePath(info.moduleName, path.dirname(info.filePath));
            if (!resolved) return null;
            const data = await this.loadDocument(resolved);
            if (!data) return null;
            return this.scanThreePartImplsWithCounts(data.tokens, info.name, data.doc.getText().split(/\r?\n/));
        }

        if (!inlineAllowed) {
            return null;
        }

        if (path.normalize(info.filePath).toLowerCase() !== path.normalize(currentPath).toLowerCase()) {
            return null;
        }

        const tokens = this.tokenCache.getTokensByUri(document.uri) ?? this.tokenCache.getTokens(document);
        return this.scanThreePartImplsWithCounts(tokens, info.name, document.getText().split(/\r?\n/));
    }

    private async resolveClassDeclarationInfo(
        className: string,
        document: TextDocument
    ): Promise<StructureDeclarationInfo | null> {
        const currentPath = decodeURIComponent(document.uri.replace(/^file:\/\/\//, '')).replace(/\//g, '\\');
        const currentInfo = this.extractClassDeclarationInfoFromDocument(className, document, currentPath);
        if (currentInfo) {
            this.trace(`resolveClassDeclarationInfo "${className}" from current file "${currentInfo.filePath}" line=${currentInfo.line}`);
            return currentInfo;
        }

        const tokens = this.tokenCache.getTokensByUri(document.uri) ?? this.tokenCache.getTokens(document);
        const fromInclude = await this.findClassDeclarationInfoInIncludeChain(
            className,
            tokens,
            path.dirname(currentPath),
            new Set([currentPath.toLowerCase()])
        );
        if (fromInclude) {
            this.trace(`resolveClassDeclarationInfo "${className}" from include "${fromInclude.filePath}" line=${fromInclude.line}`);
            return fromInclude;
        }

        await this.ensureIndexBuilt();
        const infos = this.sdi.find(className);
        if (infos.length === 0) {
            this.trace(`resolveClassDeclarationInfo "${className}" not found in SDI`);
            return null;
        }
        const fromIndex = infos.find(d => !d.isType) || infos[0];
        this.trace(`resolveClassDeclarationInfo "${className}" from SDI "${fromIndex.filePath}" line=${fromIndex.line}`);
        return fromIndex;
    }

    private extractClassDeclarationInfoFromDocument(
        className: string,
        document: TextDocument,
        filePath: string
    ): StructureDeclarationInfo | null {
        return this.extractClassDeclarationInfoFromText(className, document.getText(), filePath);
    }

    private extractClassDeclarationInfoFromText(
        className: string,
        text: string,
        filePath: string
    ): StructureDeclarationInfo | null {
        const lines = text.split(/\r?\n/);
        const classNamePattern = new RegExp(`^\\s*${className}\\s+CLASS\\b`, 'i');
        const modulePattern = /,\s*MODULE\s*\(\s*['"]?([^'")\s]+)['"]?\s*\)/i;
        const parentPattern = /\bCLASS\s*\(\s*([A-Za-z_]\w*)\s*\)/i;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (!classNamePattern.test(line)) continue;
            return {
                name: className,
                filePath,
                line: i,
                structureType: 'CLASS',
                parentName: parentPattern.exec(line)?.[1],
                moduleName: modulePattern.exec(line)?.[1],
                isType: /,\s*TYPE\b/i.test(line),
                lineContent: line.trim()
            };
        }

        return null;
    }

    private async findClassDeclarationInfoInIncludeChain(
        className: string,
        tokens: Token[],
        fromDir: string,
        visited: Set<string>
    ): Promise<StructureDeclarationInfo | null> {
        const includeTokens = tokens.filter(t => t.value?.toUpperCase() === 'INCLUDE' && t.referencedFile);
        for (const inc of includeTokens) {
            const resolvedPath = this.resolveFilePath(inc.referencedFile!, fromDir);
            if (!resolvedPath || visited.has(resolvedPath.toLowerCase())) continue;
            visited.add(resolvedPath.toLowerCase());

            const data = await this.loadDocument(resolvedPath);
            if (!data) continue;

            const found = this.extractClassDeclarationInfoFromText(className, data.doc.getText(), resolvedPath);
            if (found) return found;

            const nested = await this.findClassDeclarationInfoInIncludeChain(
                className,
                data.tokens,
                path.dirname(resolvedPath),
                visited
            );
            if (nested) return nested;
        }
        return null;
    }

    /** Walks the INCLUDE chain enumerating an INTERFACE's method names (#181). */
    private async enumerateInterfaceMembersInIncludeChain(
        ifaceName: string,
        tokens: Token[],
        fromDir: string,
        visited: Set<string>
    ): Promise<string[] | null> {
        const includeTokens = tokens.filter(t => t.value?.toUpperCase() === 'INCLUDE' && t.referencedFile);
        for (const inc of includeTokens) {
            const resolvedPath = this.resolveFilePath(inc.referencedFile!, fromDir);
            if (!resolvedPath || visited.has(resolvedPath.toLowerCase())) continue;
            visited.add(resolvedPath.toLowerCase());

            const data = await this.loadDocument(resolvedPath);
            if (data) {
                const found = this.enumerateInterfaceMembersFromTokens(data.tokens, ifaceName);
                if (found) return found;

                const nested = await this.enumerateInterfaceMembersInIncludeChain(
                    ifaceName, data.tokens, path.dirname(resolvedPath), visited
                );
                if (nested) return nested;
            }
        }
        return null;
    }

    /**
     * Collects ALL method names declared inside the named INTERFACE in `tokens`.
     * Returns `null` when the interface is not declared in these tokens (so the
     * caller keeps searching), or the (possibly empty) name list when it is.
     * Mirrors {@link findInterfaceMemberFromTokens}'s interface/method detection.
     */
    private enumerateInterfaceMembersFromTokens(
        tokens: Token[],
        ifaceName: string
    ): string[] | null {
        const ifaceToken = tokens.find(t =>
            t.type === TokenType.Structure &&
            t.subType === TokenType.Interface &&
            t.label?.toLowerCase() === ifaceName.toLowerCase() &&
            t.finishesAt !== undefined
        );
        if (!ifaceToken || ifaceToken.finishesAt === undefined) return null;
        const ifaceEnd = ifaceToken.finishesAt;

        const names: string[] = [];
        for (const token of tokens) {
            if (token.line <= ifaceToken.line || token.line >= ifaceEnd) continue;
            if (!TokenHelper.isProcedureOrFunction(token)) continue;
            if (token.subType !== TokenType.InterfaceMethod) continue;
            if (token.label) names.push(token.label);
        }
        return names;
    }

    private enumerateInterfaceMembersFromTokensWithParamCounts(
        tokens: Token[],
        ifaceName: string,
        docLines: string[]
    ): Array<{ name: string; paramCount: number }> | null {
        const ifaceToken = tokens.find(t =>
            t.type === TokenType.Structure &&
            t.subType === TokenType.Interface &&
            t.label?.toLowerCase() === ifaceName.toLowerCase() &&
            t.finishesAt !== undefined
        );
        if (!ifaceToken || ifaceToken.finishesAt === undefined) return null;
        const ifaceEnd = ifaceToken.finishesAt;

        const methods: Array<{ name: string; paramCount: number }> = [];
        for (const token of tokens) {
            if (token.line <= ifaceToken.line || token.line >= ifaceEnd) continue;
            if (!TokenHelper.isProcedureOrFunction(token)) continue;
            if (token.subType !== TokenType.InterfaceMethod) continue;
            if (!token.label) continue;
            methods.push({
                name: token.label,
                paramCount: this.countParamsInDecl(docLines[token.line] ?? '')
            });
        }
        return methods;
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
                const result =
                    this.findMemberFromTokens(data.tokens, data.doc, resolvedPath, className, memberName, paramCount, 'CLASS') ??
                    this.findMemberFromTokens(data.tokens, data.doc, resolvedPath, className, memberName, paramCount, 'GROUP') ??
                    this.findMemberFromTokens(data.tokens, data.doc, resolvedPath, className, memberName, paramCount, 'QUEUE');
                if (result) return result;
                // Fallback to disk scan for edge cases — prefer live editor text if file is open
                const diskUri = `file:///${resolvedPath.replace(/\\/g, '/')}`;
                const liveContent = this.tokenCache.getDocumentText(diskUri) ?? undefined;
                const diskResult =
                    scanClassBodyForMember(
                        resolvedPath, className, memberName, paramCount, 'CLASS',
                        (line) => this.countParamsInDecl(line),
                        (candidates: OverloadCandidate[], pc) => selectBestMemberOverload(candidates, pc),
                        liveContent
                    ) ??
                    scanClassBodyForMember(
                        resolvedPath, className, memberName, paramCount, 'GROUP',
                        (line) => this.countParamsInDecl(line),
                        (candidates: OverloadCandidate[], pc) => selectBestMemberOverload(candidates, pc),
                        liveContent
                    ) ??
                    scanClassBodyForMember(
                        resolvedPath, className, memberName, paramCount, 'QUEUE',
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
        visited: Set<string>,
        document?: TextDocument
    ): Promise<MemberInfo | null> {
        if (visited.has(className.toLowerCase())) {
            this.trace(`walkParentChain cycle stop at "${className}"`);
            return null;
        }
        visited.add(className.toLowerCase());
        this.trace(`walkParentChain class="${className}" member="${memberName}"`);

        let classInfo: StructureDeclarationInfo | null = null;
        if (document) {
            classInfo = await this.resolveClassDeclarationInfo(className, document);
        }
        if (!classInfo) {
            await this.ensureIndexBuilt();
            const classInfos = this.sdi.find(className);
            if (classInfos.length === 0) return null;
            classInfo = classInfos.find(d => !d.isType) || classInfos[0];
        }
        const result = await this.scanBodyForMember(classInfo.filePath, className, memberName, paramCount, classInfo.structureType as 'CLASS' | 'GROUP' | 'QUEUE' | undefined);
        if (result) {
            this.trace(`walkParentChain found "${memberName}" in "${classInfo.filePath}" line=${result.line}`);
            return result;
        }

        if (classInfo.structureType === 'CLASS' && classInfo.parentName) {
            this.trace(`walkParentChain ascend "${className}" -> "${classInfo.parentName}"`);
            return this.walkParentChain(classInfo.parentName, memberName, paramCount, visited, document);
        }
        this.trace(`walkParentChain stop at "${className}" (no parent/no hit)`);
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
            if (token.type !== TokenType.Label && token.type !== TokenType.Variable) continue;
            if (isInsideNested(token.line)) continue;

            const raw = docLines[token.line] ?? '';
            const memberMatch = raw.match(/^\s*([A-Za-z_][\w:]*)\s+(.+?)(\s*!.*)?$/);
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
            if (token.type !== TokenType.Label && token.type !== TokenType.Variable) continue;
            if (token.value.toLowerCase() !== memberName.toLowerCase()) continue;
            if (isInsideNested(token.line)) continue;

            const memberLine = docLines[token.line] ?? '';
            const afterMember = memberLine.substring(Math.max(0, token.start + token.value.length)).trimStart();
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

        // Check whether the next token on the declaration line is a reference (&TypeName)
        const lineTokens = tokens.filter(t => t.line === token.line);
        const idx = lineTokens.indexOf(token);
        const isReference = idx + 1 < lineTokens.length && lineTokens[idx + 1].type === TokenType.ReferenceVariable;

        if (!typeStr || typeStr === 'UNKNOWN') {
            if (token.type === TokenType.Structure && token.label) {
                const structureKeyword = token.value.toUpperCase();
                if (structureKeyword === 'CLASS') return null;
                return {
                    typeName: token.label,
                    isClass: structureKeyword === 'CLASS',
                    isReference
                };
            }
            if (token.type === TokenType.Label) {
                const structureToken = lineTokens.find(t =>
                    t.type === TokenType.Structure &&
                    t.start > token.start &&
                    ['QUEUE', 'GROUP', 'FILE'].includes(t.value.toUpperCase())
                );
                if (structureToken) {
                    return {
                        typeName: token.value,
                        isClass: false,
                        isReference
                    };
                }
            }
            return null;
        }

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
        if (bareStructures.has(typeStr.toUpperCase())) {
            // Local structure declaration without explicit type argument:
            //   problems QUEUE
            //   END
            // Use its own label as navigable structure name for chained lookups.
            if (token.type === TokenType.Structure && token.label) {
                const structureKeyword = typeStr.toUpperCase();
                if (structureKeyword === 'CLASS') return null;
                return {
                    typeName: token.label,
                    isClass: structureKeyword === 'CLASS',
                    isReference
                };
            }
            if (token.type === TokenType.Label) {
                const structureToken = lineTokens.find(t =>
                    t.type === TokenType.Structure &&
                    t.start > token.start &&
                    ['QUEUE', 'GROUP', 'FILE'].includes(t.value.toUpperCase())
                );
                if (structureToken) {
                    const structureKeyword = structureToken.value.toUpperCase();
                    return {
                        typeName: token.value,
                        isClass: structureKeyword === 'CLASS',
                        isReference
                    };
                }
            }
            return null;
        }

        // Plain user-defined type name (assumed to be a CLASS/INTERFACE for member access)
        return { typeName: typeStr, isClass: true, isReference };
    }

    /**
     * Resolves a filename via SolutionManager redirection when a solution is loaded,
     * falling back to a relative-path probe under `fromDir`. In no-solution mode
     * (#139 Gap A — substrate-symmetric to #113 C2 fix-sites), delegates to
     * `resolveFileInNoSolutionMode` so the 8 callers (MEMBER parent + INCLUDE
     * chain walks) reach libsrcPaths the same way FileDefinitionResolver /
     * ImplementationProvider / MethodHoverResolver already do via their
     * direct-fix-sites.
     */
    private resolveFilePath(filename: string, fromDir: string): string | null {
        const sm = SolutionManager.getInstance();
        if (sm?.solution) {
            for (const project of sm.solution.projects) {
                const resolved = project.getRedirectionParser().findFile(filename);
                if (resolved?.path && fs.existsSync(resolved.path)) return resolved.path;
            }
            const relative = path.join(fromDir, filename);
            return fs.existsSync(relative) ? relative : null;
        }
        // No-solution mode: synthesize a sourceUri anchored under `fromDir` so
        // the resolver's Tier-0 localDir extraction (`path.dirname` of decoded
        // sourcePath) yields `fromDir` — preserving the prior relative-path
        // fallback semantics for siblings while gaining .red + libsrcPaths reach
        // for INCLUDEs that point at library-hosted files.
        //
        // `encodeURI` percent-encodes literal `%` (and other URI-reserved chars
        // that aren't path separators) so `findFileNoSolution.ts:71` can safely
        // `decodeURIComponent` the result. C2 fix-sites pass already-encoded
        // `currentDocument.uri` (vscode-uri normalises); our synthetic URI does
        // the equivalent normalisation explicitly so paths like `F:\50%Profit\`
        // don't throw `URIError: URI malformed`.
        const syntheticUri = `file:///${encodeURI(fromDir.replace(/\\/g, '/'))}/_member_locator_anchor_`;
        const resolved = resolveFileInNoSolutionMode(filename, syntheticUri);
        return resolved?.path ?? null;
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
        const tokenMembersClass = this.extractMembersFromTokens(tokens, document, className, docPath, 'CLASS');
        const tokenMembersGroup = this.extractMembersFromTokens(tokens, document, className, docPath, 'GROUP');
        const tokenMembersQueue = this.extractMembersFromTokens(tokens, document, className, docPath, 'QUEUE');
        const tokenMembers = tokenMembersClass.length > 0
            ? tokenMembersClass
            : tokenMembersGroup.length > 0
                ? tokenMembersGroup
                : tokenMembersQueue;
        if (tokenMembers.length > 0) return tokenMembers;
        const diskMembersClass = scanClassBodyForAllMembers(docPath, className, 'CLASS');
        const diskMembersGroup = scanClassBodyForAllMembers(docPath, className, 'GROUP');
        const diskMembersQueue = scanClassBodyForAllMembers(docPath, className, 'QUEUE');
        const diskMembers = diskMembersClass.length > 0
            ? diskMembersClass
            : diskMembersGroup.length > 0
                ? diskMembersGroup
                : diskMembersQueue;
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
                const membersClass = this.extractMembersFromTokens(data.tokens, data.doc, className, resolvedPath, 'CLASS');
                const membersGroup = this.extractMembersFromTokens(data.tokens, data.doc, className, resolvedPath, 'GROUP');
                const membersQueue = this.extractMembersFromTokens(data.tokens, data.doc, className, resolvedPath, 'QUEUE');
                const members = membersClass.length > 0
                    ? membersClass
                    : membersGroup.length > 0
                        ? membersGroup
                        : membersQueue;
                if (members.length > 0) return members;
                // Fallback to disk scan if token-based found nothing (e.g. file not yet tokenized)
                const diskMembersClass = scanClassBodyForAllMembers(resolvedPath, className, 'CLASS');
                const diskMembersGroup = scanClassBodyForAllMembers(resolvedPath, className, 'GROUP');
                const diskMembersQueue = scanClassBodyForAllMembers(resolvedPath, className, 'QUEUE');
                const diskMembers = diskMembersClass.length > 0
                    ? diskMembersClass
                    : diskMembersGroup.length > 0
                        ? diskMembersGroup
                        : diskMembersQueue;
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
