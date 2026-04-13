import { Hover, Position } from 'vscode-languageserver-protocol';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Token, TokenType, ClarionTokenizer } from '../../ClarionTokenizer';
import { TokenCache } from '../../TokenCache';
import { TokenHelper } from '../../utils/TokenHelper';
import { HoverFormatter } from './HoverFormatter';
import { MethodHoverResolver } from './MethodHoverResolver';
import { VariableHoverResolver } from './VariableHoverResolver';
import { ChainedPropertyResolver } from '../../utils/ChainedPropertyResolver';
import { ClassMemberResolver } from '../../utils/ClassMemberResolver';
import { SolutionManager } from '../../solution/solutionManager';
import * as fs from 'fs';
import * as path from 'path';
import { SymbolFinderService } from '../../services/SymbolFinderService';
import LoggerManager from '../../logger';

const logger = LoggerManager.getLogger("StructureFieldResolver");
logger.setLevel("error");

/**
 * Resolves hover information for structure field access (e.g., MyGroup.MyVar)
 */
export class StructureFieldResolver {
    private tokenCache = TokenCache.getInstance();
    private chainedResolver = new ChainedPropertyResolver();
    private memberResolver = new ClassMemberResolver();
    
    constructor(
        private formatter: HoverFormatter,
        private methodResolver: MethodHoverResolver,
        private variableResolver: VariableHoverResolver
    ) {}

    /**
     * Resolves hover for structure.field notation (e.g., MyGroup.MyVar)
     */
    async resolveStructureAccess(
        word: string,
        line: string,
        position: Position,
        document: TextDocument
    ): Promise<Hover | null> {
        // Check if this is a structure/group name followed by a dot (e.g., hovering over "MyGroup" in "MyGroup.MyVar")
        // BUT: Skip SELF.member and PARENT.member - those are class method calls handled separately
        const wordStartInLine = line.indexOf(word, Math.max(0, position.character - word.length));
        const dotIndex = line.indexOf('.', wordStartInLine);
        
        const isSelfMember = word.toUpperCase().startsWith('SELF.');
        const isParentMember = word.toUpperCase().startsWith('PARENT.');
        
        if (dotIndex > wordStartInLine && dotIndex < wordStartInLine + word.length + 5 && !isSelfMember && !isParentMember) {
            // There's a dot right after the word - this looks like structure.field notation
            logger.info(`Detected dot notation for word: ${word}, dotIndex: ${dotIndex}`);
            
            const tokens = this.tokenCache.getTokens(document);
            const structure = this.tokenCache.getStructure(document); // 🚀 PERFORMANCE: Get cached structure
            const currentScope = TokenHelper.getInnermostScopeAtLine(structure, position.line); // 🚀 PERFORMANCE: O(log n) vs O(n)
            if (currentScope) {
                // Look for the GROUP/QUEUE/etc definition
                const structureInfo = this.variableResolver.findLocalVariableInfo(word, tokens, currentScope, document, word);
                if (structureInfo) {
                    logger.info(`✅ Found structure info for ${word}`);
                    return this.formatter.formatVariable(word, structureInfo, currentScope, document);
                } else {
                    logger.info(`❌ Could not find structure info for ${word}`);
                }
            }
        }
        
        return null;
    }

    /**
     * Resolves hover for field access after dot (e.g., hovering on "MyVar" in "MyGroup.MyVar")
     */
    async resolveFieldAccess(
        word: string,
        line: string,
        position: Position,
        document: TextDocument,
        countParametersInCall: (line: string, methodName: string) => number | null
    ): Promise<Hover | null> {
        // Check if this is a class member access (self.member or variable.member)
        const dotBeforeIndex = line.lastIndexOf('.', position.character - 1);
        logger.info(`resolveFieldAccess: word="${word}", position.character=${position.character}, dotBeforeIndex=${dotBeforeIndex}`);
        
        if (dotBeforeIndex <= 0) {
            logger.info(`resolveFieldAccess: No dot found before position, returning null`);
            return null;
        }

        const rawBeforeDot = line.substring(0, dotBeforeIndex).trim();
        const beforeDot = ChainedPropertyResolver.extractChain(rawBeforeDot);
        const afterDot = line.substring(dotBeforeIndex + 1).trim();
        const fieldMatch = afterDot.match(/^(\w+)/);
        
        logger.info(`resolveFieldAccess: beforeDot="${beforeDot}", afterDot="${afterDot}"`);
        
        // Extract field name from word (in case TokenHelper returned "prefix.field")
        const fieldName = word.includes('.') ? word.split('.').pop()! : word;
        logger.info(`resolveFieldAccess: fieldName extracted="${fieldName}", fieldMatch[1]="${fieldMatch ? fieldMatch[1] : 'null'}"`);
        
        if (!fieldMatch || fieldMatch[1].toLowerCase() !== fieldName.toLowerCase()) {
            logger.info(`resolveFieldAccess: Field name mismatch, returning null`);
            return null;
        }

        // Verify cursor is actually on the word immediately after the dot, not a later occurrence
        // e.g. "SELF.Q &= Q" — cursor on 2nd Q should NOT match SELF.Q
        // When word includes qualifier ("SELF.LC"), wordStart must include the SELF part
        const qualifier = word.includes('.') ? word.substring(0, word.lastIndexOf('.')) : '';
        const fieldStartInLine = dotBeforeIndex + 1;
        const wordStartInLine = qualifier ? fieldStartInLine - qualifier.length - 1 : fieldStartInLine;
        const wordEndInLine = fieldStartInLine + fieldName.length;
        if (position.character < wordStartInLine || position.character > wordEndInLine) {
            logger.info(`resolveFieldAccess: Cursor not on field immediately after dot, returning null`);
            return null;
        }

        // Check if this is a method call (has parentheses)
        const hasParentheses = afterDot.includes('(') || line.substring(position.character).trimStart().startsWith('(');
        
        // Check if beforeDot ends with 'self' as a complete word (not part of another word)
        // Handles: "self", "address(self", "x = self", etc.
        const isSelfMember = /\bself$/i.test(beforeDot);
        const isParentMember = /\bparent$/i.test(beforeDot);
        logger.info(`resolveFieldAccess: Checking if beforeDot ends with 'self': "${beforeDot}" matches \\bself$ = ${isSelfMember}`);
        
        // This is a member access (hovering over the field after the dot)
        if (isSelfMember) {
            // self.member - class member
            // If it's a method call, count parameters
            let paramCount: number | undefined;
            if (hasParentheses) {
                paramCount = countParametersInCall(line, fieldName) ?? undefined;
                logger.info(`Method call detected with ${paramCount} parameters`);
            }
            
            return await this.methodResolver.resolveMethodCall(fieldName, document, position, line, paramCount);
        } else if (isParentMember) {
            // parent.member - inherited class member
            let paramCount: number | undefined;
            if (hasParentheses) {
                paramCount = countParametersInCall(line, fieldName) ?? undefined;
                logger.info(`PARENT method call detected with ${paramCount} parameters`);
            }
            return await this.methodResolver.resolveParentMethodCall(fieldName, document, position, line, paramCount);
        } else if (/^\s*(self|parent)\b/i.test(beforeDot) && beforeDot.includes('.')) {
            // Chained access: SELF.Order.MainKey or PARENT.Foo.Bar
            let paramCount: number | undefined;
            if (hasParentheses) {
                paramCount = countParametersInCall(line, fieldName) ?? undefined;
            }
            const chainedInfo = await this.chainedResolver.resolve(beforeDot, fieldName, document, position, paramCount);
            if (chainedInfo) {
                return this.methodResolver.resolveChainedMethodCall(fieldName, chainedInfo, document, paramCount);
            }
        } else {
            // variable.member - structure field access (e.g., MyGroup.MyVar)
            // or typed class variable access (e.g., st.GetValue() where st is StringTheory)
            const structureNameMatch = beforeDot.match(/(\w+)\s*$/);
            if (structureNameMatch) {
                const structureName = structureNameMatch[1];
                logger.info(`Detected structure field access: ${structureName}.${word}`);
                
                const tokens = this.tokenCache.getTokens(document);
                const structure = this.tokenCache.getStructure(document); // 🚀 PERFORMANCE: Get cached structure
                const currentScope = TokenHelper.getInnermostScopeAtLine(structure, position.line); // 🚀 PERFORMANCE: O(log n) vs O(n)
                if (currentScope) {
                    // Try to find the structure field using dot notation reference
                    const fullReference = `${structureName}.${fieldName}`;
                    const variableInfo = this.variableResolver.findLocalVariableInfo(fieldName, tokens, currentScope, document, fullReference);
                    if (variableInfo) {
                        logger.info(`✅ Found structure field info for ${fullReference}`);
                        return this.formatter.formatVariable(fullReference, variableInfo, currentScope, document);
                    }
                }

                // Try typed class variable: find what class type structureName is,
                // then look up the member in that class (e.g., st.GetValue() where st StringTheory)
                const varTypeInfo = await this.resolveVariableClassType(structureName, tokens, document);
                if (varTypeInfo) {
                    const { typeName: varType, isClass } = varTypeInfo;
                    logger.info(`✅ Variable "${structureName}" has type "${varType}" (isClass=${isClass}), looking up member "${fieldName}"`);
                    let paramCount: number | undefined;
                    if (hasParentheses) {
                        paramCount = countParametersInCall(line, fieldName) ?? undefined;
                    }
                    if (isClass) {
                        // CLASS member resolver (methods, properties)
                        const memberInfo = await this.memberResolver.findMemberInNamedStructure(fieldName, varType, document, paramCount);
                        if (memberInfo) {
                            logger.info(`✅ Found member "${fieldName}" in "${varType}"`);
                            return await this.methodResolver.resolveChainedMethodCall(fieldName, memberInfo, document, paramCount);
                        }
                    }
                    // QUEUE/GROUP/FILE structure field (type defined in INCLUDE files)
                    const fieldHover = await this.resolveStructureTypeFieldHover(varType, fieldName, document);
                    if (fieldHover) return fieldHover;
                }
            }
        }
        
        return null;
    }

    /**
     * Resolves the type of a variable. Returns { typeName, isClass } where isClass distinguishes
     * CLASS (method/property access) from QUEUE/GROUP/FILE (field access).
     * Uses SymbolFinderService.extractTypeInfo as the single source of truth for type extraction.
     */
    private async resolveVariableClassType(varName: string, tokens: Token[], document: TextDocument): Promise<{ typeName: string; isClass: boolean } | null> {
        // Search current file first, then MEMBER parent and INCLUDE chain
        const found = await this.variableResolver.findVariableTokenCrossFile(varName, tokens, document);
        if (!found) return null;
        const varToken = found.token;
        const varTokens = found.tokens;

        const typeStr = SymbolFinderService.extractTypeInfo(varToken, varTokens);
        if (!typeStr || typeStr === 'UNKNOWN') return null;

        // CLASS(TypeName), QUEUE(TypeName), GROUP(TypeName), FILE(TypeName)
        const structMatch = typeStr.match(/^(CLASS|QUEUE|GROUP|FILE)\((\w+)\)$/i);
        if (structMatch) {
            return { typeName: structMatch[2], isClass: structMatch[1].toUpperCase() === 'CLASS' };
        }

        // LIKE(TypeName)
        const likeMatch = typeStr.match(/^LIKE\((\w+)\)$/i);
        if (likeMatch) {
            return { typeName: likeMatch[1], isClass: false };
        }

        // Bare structure keyword with no type arg — can't resolve members
        const bareStructures = new Set(['CLASS', 'QUEUE', 'GROUP', 'FILE', 'RECORD', 'WINDOW', 'VIEW', 'REPORT', 'LIKE', 'PROCEDURE']);
        if (bareStructures.has(typeStr.toUpperCase())) return null;

        // Plain user-defined type name used directly as a variable type
        return { typeName: typeStr, isClass: true };
    }

    /**
     * Find a field inside a QUEUE/GROUP/FILE type definition (potentially in INCLUDE files)
     * and return hover info showing the field declaration.
     */
    private async resolveStructureTypeFieldHover(typeName: string, fieldName: string, document: TextDocument): Promise<Hover | null> {
        const filePath = decodeURIComponent(document.uri.replace(/^file:\/\/\//, '')).replace(/\//g, '\\');
        const result = await this.findFieldInTypeIncludes(typeName, fieldName, filePath, new Set());
        if (result) return result;

        // Fallback: check equates.clw
        const equatesPath = SolutionManager.getInstance()?.getEquatesPath();
        if (equatesPath) {
            return this.findFieldInTypeIncludes(typeName, fieldName, equatesPath, new Set());
        }
        return null;
    }

    /**
     * Resolves hover for a bare type name (e.g., hovering on "UnzipOptionsType" in LIKE(UnzipOptionsType)).
     * Finds the structure declaration in INCLUDE files and shows the type definition.
     */
    async resolveTypeNameHover(typeName: string, document: TextDocument): Promise<Hover | null> {
        const filePath = decodeURIComponent(document.uri.replace(/^file:\/\/\//, '')).replace(/\//g, '\\');
        const result = await this.findTypeDeclarationInIncludes(typeName, filePath, new Set());
        if (result) return result;

        // Fallback: check equates.clw directly (FILE:Queue etc. are defined there, not in INCLUDEs)
        const solutionManager = SolutionManager.getInstance();
        const equatesPath = solutionManager?.getEquatesPath();
        if (equatesPath) {
            // First search the equates.clw tokens directly
            const equatesTokens = solutionManager!.getEquatesTokens();
            if (equatesTokens && equatesTokens.length > 0) {
                const labelToken = equatesTokens.find(t =>
                    (t.type === TokenType.Label || t.type === TokenType.Variable) &&
                    t.start === 0 &&
                    t.value.toLowerCase() === typeName.toLowerCase()
                );
                if (labelToken) {
                    const lineTokens = equatesTokens.filter(t => t.line === labelToken.line);
                    const structToken = lineTokens.find(t => t.type === TokenType.Structure);
                    const structKind = structToken?.value.toUpperCase() ?? 'TYPE';
                    const declaration = lineTokens.map(t => t.value).join('  ').trim();
                    const incFileName = path.basename(equatesPath);
                    let structureEndLine = Number.MAX_VALUE;
                    if (structToken?.finishesAt !== undefined) structureEndLine = structToken.finishesAt;
                    const fieldCount = equatesTokens.filter(t =>
                        (t.type === TokenType.Label || t.type === TokenType.Variable) &&
                        t.start === 0 &&
                        t.line > labelToken.line &&
                        t.line < structureEndLine
                    ).length;
                    const markdown = [
                        `**${structKind} Type:** \`${typeName}\``,
                        ``,
                        `**Declared in:** ${incFileName}, line ${labelToken.line + 1}`,
                        `**Fields:** ${fieldCount}`,
                        ``,
                        `\`\`\`clarion`,
                        declaration,
                        `\`\`\``
                    ].join('\n');
                    return { contents: { kind: 'markdown', value: markdown } };
                }
            }
            // Also walk any INCLUDEs in equates.clw
            return this.findTypeDeclarationInIncludes(typeName, equatesPath, new Set());
        }
        return null;
    }

    private async findTypeDeclarationInIncludes(
        typeName: string,
        fromPath: string,
        visited: Set<string>
    ): Promise<Hover | null> {
        if (visited.has(fromPath.toLowerCase())) return null;
        visited.add(fromPath.toLowerCase());

        let content: string;
        try { content = fs.readFileSync(fromPath, 'utf8'); } catch { return null; }

        const includePattern = /INCLUDE\s*\(\s*['"](.+?)['"]\s*\)/gi;
        let match: RegExpExecArray | null;

        while ((match = includePattern.exec(content)) !== null) {
            const includeFile = match[1];
            let resolvedPath: string | null = null;

            const solutionManager = SolutionManager.getInstance();
            if (solutionManager?.solution) {
                for (const project of solutionManager.solution.projects) {
                    const resolved = project.getRedirectionParser().findFile(includeFile);
                    if (resolved?.path && fs.existsSync(resolved.path)) {
                        resolvedPath = resolved.path;
                        break;
                    }
                }
            }
            if (!resolvedPath) {
                const candidate = path.join(path.dirname(fromPath), includeFile);
                if (fs.existsSync(candidate)) resolvedPath = candidate;
            }
            if (!resolvedPath) continue;

            const uri = `file:///${resolvedPath.replace(/\\/g, '/')}`;
            let incTokens = this.tokenCache.getTokensByUri(uri);
            if (!incTokens || incTokens.length === 0) {
                try {
                    const incContent = fs.readFileSync(resolvedPath, 'utf8');
                    incTokens = new ClarionTokenizer(incContent).tokenize();
                } catch { incTokens = null; }
            }

            if (incTokens && incTokens.length > 0) {
                const labelToken = incTokens.find(t =>
                    (t.type === TokenType.Label || t.type === TokenType.Variable) &&
                    t.start === 0 &&
                    t.value.toLowerCase() === typeName.toLowerCase()
                );
                if (labelToken) {
                    // Find the structure keyword to show the declaration line
                    const labelIdx = incTokens.indexOf(labelToken);
                    const lineTokens = incTokens.filter(t => t.line === labelToken.line);
                    const structToken = lineTokens.find(t => t.type === TokenType.Structure);
                    const structKind = structToken?.value.toUpperCase() ?? 'TYPE';
                    const declaration = lineTokens.map(t => t.value).join('  ').trim();
                    const incFileName = path.basename(resolvedPath);

                    // Count fields in the structure
                    let structureEndLine = Number.MAX_VALUE;
                    if (structToken?.finishesAt !== undefined) structureEndLine = structToken.finishesAt;
                    const fieldCount = incTokens.filter(t =>
                        (t.type === TokenType.Label || t.type === TokenType.Variable) &&
                        t.start === 0 &&
                        t.line > labelToken.line &&
                        t.line < structureEndLine
                    ).length;

                    logger.info(`✅ Found type "${typeName}" (${structKind}) in ${resolvedPath}:${labelToken.line}`);
                    const markdown = [
                        `**${structKind} Type:** \`${typeName}\``,
                        ``,
                        `**Declared in:** ${incFileName}, line ${labelToken.line + 1}`,
                        `**Fields:** ${fieldCount}`,
                        ``,
                        `\`\`\`clarion`,
                        declaration,
                        `\`\`\``
                    ].join('\n');
                    return { contents: { kind: 'markdown', value: markdown } };
                }
            }

            const nested = await this.findTypeDeclarationInIncludes(typeName, resolvedPath, visited);
            if (nested) return nested;
        }
        return null;
    }

    private async findFieldInTypeIncludes(
        typeName: string,
        fieldName: string,
        fromPath: string,
        visited: Set<string>
    ): Promise<Hover | null> {
        if (visited.has(fromPath.toLowerCase())) return null;
        visited.add(fromPath.toLowerCase());

        let content: string;
        try { content = fs.readFileSync(fromPath, 'utf8'); } catch { return null; }

        const includePattern = /INCLUDE\s*\(\s*['"](.+?)['"]\s*\)/gi;
        let match: RegExpExecArray | null;

        while ((match = includePattern.exec(content)) !== null) {
            const includeFile = match[1];

            let resolvedPath: string | null = null;
            const solutionManager = SolutionManager.getInstance();
            if (solutionManager?.solution) {
                for (const project of solutionManager.solution.projects) {
                    const resolved = project.getRedirectionParser().findFile(includeFile);
                    if (resolved?.path && fs.existsSync(resolved.path)) {
                        resolvedPath = resolved.path;
                        break;
                    }
                }
            }
            if (!resolvedPath) {
                const candidate = path.join(path.dirname(fromPath), includeFile);
                if (fs.existsSync(candidate)) resolvedPath = candidate;
            }
            if (!resolvedPath) continue;

            const uri = `file:///${resolvedPath.replace(/\\/g, '/')}`;
            let incTokens = this.tokenCache.getTokensByUri(uri);

            // On-demand tokenization if the file hasn't been opened in VS Code yet
            if (!incTokens || incTokens.length === 0) {
                try {
                    const incContent = fs.readFileSync(resolvedPath, 'utf8');
                    const tokenizer = new ClarionTokenizer(incContent);
                    incTokens = tokenizer.tokenize();
                    logger.info(`🔍 On-demand tokenized ${path.basename(resolvedPath)}: ${incTokens.length} tokens`);
                } catch {
                    incTokens = null;
                }
            }

            if (incTokens && incTokens.length > 0) {
                const labelToken = incTokens.find(t =>
                    (t.type === TokenType.Label || t.type === TokenType.Variable) &&
                    t.start === 0 &&
                    t.value.toLowerCase() === typeName.toLowerCase()
                );
                if (labelToken) {
                    // Find the structure keyword (QUEUE/GROUP/CLASS) after the label to get finishesAt
                    const labelIdx = incTokens.indexOf(labelToken);
                    let structureEndLine = Number.MAX_VALUE;
                    for (let i = labelIdx + 1; i < incTokens.length; i++) {
                        const t = incTokens[i];
                        if (t.line !== labelToken.line) break;
                        if (t.type === TokenType.Structure && t.finishesAt !== undefined) {
                            structureEndLine = t.finishesAt;
                            break;
                        }
                    }
                    logger.info(`🔍 Found type "${typeName}" at line ${labelToken.line}, structureEndLine=${structureEndLine}`);

                    // Clarion fields start at column 0; bounded by line range within the structure
                    const fieldToken = incTokens.find(t =>
                        (t.type === TokenType.Label || t.type === TokenType.Variable) &&
                        t.start === 0 &&
                        t.value.toLowerCase() === fieldName.toLowerCase() &&
                        t.line > labelToken.line &&
                        t.line < structureEndLine
                    );
                    if (fieldToken) {
                        logger.info(`✅ Found field "${fieldName}" in type "${typeName}" at ${resolvedPath}:${fieldToken.line}`);
                        const lineTokens = incTokens.filter(t => t.line === fieldToken.line);
                        const declaration = lineTokens.map(t => t.value).join('  ').trim();
                        const typeToken = lineTokens.find(t => t.start > fieldToken.start);
                        const fieldType = typeToken?.value ?? 'UNKNOWN';
                        const incFileName = path.basename(resolvedPath);
                        const markdown = [
                            `**${typeName} Field:** \`${fieldName}\` — \`${fieldType}\``,
                            ``,
                            `**Declared in:** ${incFileName}, line ${fieldToken.line + 1}`,
                            ``,
                            `\`\`\`clarion`,
                            declaration,
                            `\`\`\``
                        ].join('\n');
                        return { contents: { kind: 'markdown', value: markdown } };
                    }
                }
            }

            const nested = await this.findFieldInTypeIncludes(typeName, fieldName, resolvedPath, visited);
            if (nested) return nested;
        }
        return null;
    }
}
