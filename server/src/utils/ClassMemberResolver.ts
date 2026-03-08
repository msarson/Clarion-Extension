import { TextDocument } from 'vscode-languageserver-textdocument';
import { Token, TokenType } from '../ClarionTokenizer';
import { TokenCache } from '../TokenCache';
import { SolutionManager } from '../solution/solutionManager';
import { TokenHelper } from './TokenHelper';
import { ClassDefinitionIndexer } from './ClassDefinitionIndexer';
import * as path from 'path';
import * as fs from 'fs';
import LoggerManager from '../logger';

const logger = LoggerManager.getLogger("ClassMemberResolver");
logger.setLevel("error");

type MemberInfo = { type: string; className: string; line: number; file: string };

/**
 * Shared utility for resolving class members (methods, properties)
 * Used by both HoverProvider and DefinitionProvider
 */
export class ClassMemberResolver {
    private tokenCache = TokenCache.getInstance();
    private classIndexer = ClassDefinitionIndexer.getInstance();

    /**
     * Finds class member info for a given member name
     * @param memberName The member name (e.g., "SaveFile")
     * @param document The document containing the current code
     * @param currentLine The line number where the member is referenced
     * @param tokens The tokens from the document
     * @param paramCount Optional parameter count for overload resolution
     * @returns Member info or null if not found
     */
    public findClassMemberInfo(
        memberName: string,
        document: TextDocument,
        currentLine: number,
        tokens: Token[],
        paramCount?: number
    ): MemberInfo | null {
        logger.info(`🔍 findClassMemberInfo called for member: ${memberName}${paramCount !== undefined ? ` with ${paramCount} parameters` : ''}`);
        
        const structure = this.tokenCache.getStructure(document); // 🚀 PERFORMANCE: Get cached structure
        
        // Find the current scope to get the class name
        let currentScope = TokenHelper.getInnermostScopeAtLine(structure, currentLine); // 🚀 PERFORMANCE: O(log n) vs O(n)
        if (!currentScope) {
            logger.info('❌ No scope found');
            return null;
        }
        
        logger.info(`Scope: ${currentScope.value}`);

        // If we're in a routine, get the parent scope
        if (currentScope.subType === TokenType.Routine) {
            logger.info(`Current scope is a routine, looking for parent scope`);
            const parentScope = TokenHelper.getParentScopeOfRoutine(structure, currentScope); // 🚀 PERFORMANCE: O(1) vs O(n)
            if (parentScope) {
                currentScope = parentScope;
                logger.info(`Using parent scope: ${currentScope.value}`);
            } else {
                return null;
            }
        }
        
        // Extract class name from method
        let className: string | null = null;
        if (currentScope.value.includes('.')) {
            className = currentScope.value.split('.')[0];
        } else {
            const content = document.getText();
            const lines = content.split('\n');
            const scopeLine = lines[currentScope.line];
            const classMethodMatch = scopeLine.match(/^(\w+)\.(\w+)\s+PROCEDURE/i);
            if (classMethodMatch) {
                className = classMethodMatch[1];
            }
        }
        
        if (!className) {
            logger.info('❌ Could not determine className');
            return null;
        }
        
        logger.info(`Looking for member ${memberName} in class ${className}`);
        
        // Search in current file first
        const classTokens = TokenHelper.findClassStructures(tokens);
        
        for (const classToken of classTokens) {
            const labelToken = tokens.find(t =>
                (t.type === TokenType.Label || t.type === TokenType.Variable) &&
                t.line === classToken.line &&
                t.value.toLowerCase() === className!.toLowerCase()
            );
            
            if (labelToken) {
                logger.info(`✅ Found class ${className} at line ${labelToken.line}`);
                
                // Collect all matching members (for overload resolution)
                const candidates: { type: string; line: number; paramCount: number }[] = [];
                
                // Get file content once
                const content = document.getText();
                const lines = content.split('\n');
                
                // Search for member in this class by iterating through tokens
                // This is O(n) instead of O(n²) with repeated filter calls
                for (const token of tokens) {
                    // Only process tokens after the class start
                    if (token.line <= labelToken.line) continue;
                    
                    // Stop at END token at column 0 (closes the CLASS body)
                    // END is tokenized as EndStatement (not Keyword)
                    if ((token.type === TokenType.EndStatement || 
                         (token.type === TokenType.Keyword && token.value.toUpperCase() === 'END')) && 
                        token.start === 0) {
                        break;
                    }
                    
                    // Debug: Log all member-like tokens in the class for troubleshooting
                    // Class members are tokenized as Variable (properties) or Label (col-0 identifiers)
                    if (token.type === TokenType.Variable || token.type === TokenType.Label) {
                        logger.info(`📋 Class member candidate: "${token.value}" at line ${token.line}, col ${token.start} type=${token.type}`);
                    }
                    
                    // Check if this is a member inside this class.
                    // Class members (properties and method names) are tokenized as Variable when
                    // indented inside the CLASS body; Label is used for col-0 identifiers.
                    if ((token.type === TokenType.Variable || token.type === TokenType.Label) &&
                        token.value.toLowerCase() === memberName.toLowerCase()) {
                        
                        const i = token.line;
                        logger.info(`✅ Found member ${memberName} at line ${i} in current file`);
                        
                        // Get the type signature - find the next token on the same line
                        const memberEnd = token.start + token.value.length;
                        const typeToken = tokens.find(t => 
                            t.line === i && 
                            t.start > memberEnd
                        );
                        const type = typeToken ? typeToken.value : 'Unknown';
                        logger.info(`   Type token: ${type}, line: ${i}`);
                        
                        // Count parameters in declaration if it's a PROCEDURE
                        let declParamCount = 0;
                        if (type.toUpperCase() === 'PROCEDURE') {
                            const fullLine = lines[i];
                            declParamCount = this.countParametersInDeclaration(fullLine);
                        }
                        
                        candidates.push({ type, line: i, paramCount: declParamCount });
                        logger.info(`   Candidate added: ${memberName} with ${declParamCount} parameters at line ${i}`);
                    }
                }
                
                // Select best match based on parameter count
                const bestMatch = this.selectBestOverload(candidates, paramCount);
                if (bestMatch) {
                    return { type: bestMatch.type, className, line: bestMatch.line, file: document.uri };
                }

                // Member not in this class — walk the inheritance chain
                const classDecLine = lines[labelToken.line];
                const parentMatch = classDecLine.match(/CLASS\s*\(\s*(\w+)\s*\)/i);
                if (parentMatch) {
                    const parentResult = this.findMemberInParentChain(
                        parentMatch[1], memberName, paramCount, new Set([className!.toLowerCase()])
                    );
                    if (parentResult) return parentResult;
                }
            }
        }
        
        // If not found in current file, search INCLUDE files
        logger.info(`⚠️ Class ${className} not found in current file - searching INCLUDE files`);
        return this.findClassMemberInIncludes(className, memberName, document, paramCount);
    }

    /**
     * Searches for class member info in INCLUDE files
     */
    public findClassMemberInIncludes(
        className: string,
        memberName: string,
        document: TextDocument,
        paramCount?: number
    ): MemberInfo | null {
        const content = document.getText();
        const lines = content.split('\n');
        
        // Find INCLUDE statements
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const includeMatch = line.match(/INCLUDE\s*\(\s*['"](.+?)['"]\s*\)/i);
            if (!includeMatch) continue;
            
            const includeFileName = includeMatch[1];
            logger.info(`Found INCLUDE: ${includeFileName}`);
            
            // Resolve file path
            const filePath = decodeURIComponent(document.uri.replace('file:///', '')).replace(/\//g, '\\');
            let resolvedPath: string | null = null;
            
            // Try solution-wide redirection
            const solutionManager = SolutionManager.getInstance();
            if (solutionManager && solutionManager.solution) {
                for (const project of solutionManager.solution.projects) {
                    const redirectionParser = project.getRedirectionParser();
                    const resolved = redirectionParser.findFile(includeFileName);
                    if (resolved && resolved.path && fs.existsSync(resolved.path)) {
                        resolvedPath = resolved.path;
                        break;
                    }
                }
            }
            
            // Fallback to relative path
            if (!resolvedPath) {
                const currentDir = path.dirname(filePath);
                const relativePath = path.join(currentDir, includeFileName);
                if (fs.existsSync(relativePath)) {
                    resolvedPath = relativePath;
                }
            }
            
            if (resolvedPath) {
                logger.info(`Resolved to: ${resolvedPath}`);
                const includeContent = fs.readFileSync(resolvedPath, 'utf8');
                const includeLines = includeContent.split('\n');
                
                // Find the class
                for (let j = 0; j < includeLines.length; j++) {
                    const includeLine = includeLines[j];
                    const classMatch = includeLine.match(new RegExp(`^${className}\\s+CLASS`, 'i'));
                    if (classMatch) {
                        logger.info(`Found class ${className} in INCLUDE at line ${j}`);
                        
                        // Collect all matching members for overload resolution
                        const candidates: { type: string; line: number; paramCount: number }[] = [];
                        
                        // Find all members with this name
                        // Track nesting depth so nested GROUP/QUEUE/RECORD ENDs don't
                        // terminate the scan prematurely
                        let nestDepth = 0;
                        for (let k = j + 1; k < includeLines.length; k++) {
                            const memberLine = includeLines[k];
                            const stripped = memberLine.replace(/\s*!.*$/, '').trim(); // strip comments

                            // Detect nested scope openers (GROUP/QUEUE/RECORD as type keyword)
                            if (/\b(GROUP|QUEUE|RECORD)\b/i.test(stripped) && !stripped.match(/^\s*END\s*$/i)) {
                                nestDepth++;
                            }

                            if (/^\s*END\s*$/i.test(stripped)) {
                                if (nestDepth > 0) {
                                    nestDepth--;
                                    continue;
                                }
                                break;
                            }
                            
                            const memberMatch = memberLine.match(new RegExp(`^\\s*(${memberName})\\s+`, 'i'));
                            if (memberMatch) {
                                logger.info(`Found member ${memberName} at line ${k}: ${memberLine}`);
                                // Extract type - everything after member name until comment or end of line
                                const afterMember = memberLine.substring(memberMatch[0].length).trim();
                                // Remove trailing comments (! or //)
                                const typeWithoutComment = afterMember.split(/\s*[!\/\/]/).shift() || afterMember;
                                const type = typeWithoutComment.trim() || 'Unknown';
                                
                                // Count parameters if it's a PROCEDURE
                                let declParamCount = 0;
                                if (type.toUpperCase().startsWith('PROCEDURE')) {
                                    declParamCount = this.countParametersInDeclaration(memberLine);
                                    logger.info(`Counting params in: ${memberLine}`);
                                    logger.info(`Detected ${declParamCount} parameters`);
                                }
                                
                                candidates.push({ type, line: k, paramCount: declParamCount });
                                logger.info(`Candidate: ${memberName} with ${declParamCount} parameters - ${type}`);
                            }
                        }
                        
                        // Select best match based on parameter count
                        const bestMatch = this.selectBestOverload(candidates, paramCount);
                        if (bestMatch) {
                            // Convert file path to URI format
                            const fileUri = `file:///${resolvedPath.replace(/\\/g, '/')}`;
                            return { type: bestMatch.type, className, line: bestMatch.line, file: fileUri };
                        }

                        // Member not in this class — walk the inheritance chain
                        const parentMatch = includeLine.match(/CLASS\s*\(\s*(\w+)\s*\)/i);
                        if (parentMatch) {
                            const parentResult = this.findMemberInParentChain(
                                parentMatch[1], memberName, paramCount, new Set([className.toLowerCase()])
                            );
                            if (parentResult) return parentResult;
                        }
                    }
                }
            }
        }
        
        return null;
    }

    private selectBestOverload(
        candidates: { type: string; line: number; paramCount: number }[],
        paramCount?: number
    ): { type: string; line: number; paramCount: number } | null {
        if (candidates.length === 0) return null;
        
        // If no parameter count provided, return first candidate
        if (paramCount === undefined) {
            logger.info(`Returning first candidate (no param matching needed)`);
            return candidates[0];
        }
        
        // Find exact match first
        let bestMatch = candidates.find(c => c.paramCount === paramCount);
        
        // If no exact match, find closest (prefer higher param count for optional params)
        if (!bestMatch) {
            bestMatch = candidates.reduce((best, curr) => {
                const bestDiff = Math.abs(best.paramCount - paramCount);
                const currDiff = Math.abs(curr.paramCount - paramCount);
                
                // If same distance, prefer the one with MORE parameters (optional params)
                if (currDiff === bestDiff) {
                    return curr.paramCount > best.paramCount ? curr : best;
                }
                
                return currDiff < bestDiff ? curr : best;
            });
        }
        
        logger.info(`Selected overload with ${bestMatch.paramCount} parameters (call had ${paramCount})`);
        return bestMatch;
    }

    /**
     * Counts parameters in a method call
     * Simple implementation: counts commas at parenthesis depth 0
     */
    public countParametersInCall(line: string, methodName: string): number {
        // Find the opening parenthesis after the method name
        const methodIndex = line.toLowerCase().indexOf(methodName.toLowerCase());
        if (methodIndex === -1) return 0;
        
        const afterMethod = line.substring(methodIndex + methodName.length);
        const parenIndex = afterMethod.indexOf('(');
        if (parenIndex === -1) return 0;
        
        const paramList = afterMethod.substring(parenIndex + 1);
        
        let depth = 0;
        let commaCount = 0;
        let hasContent = false;
        
        for (let i = 0; i < paramList.length; i++) {
            const char = paramList[i];
            
            if (char === '(') {
                depth++;
            } else if (char === ')') {
                if (depth === 0) {
                    // End of parameter list
                    return hasContent ? commaCount + 1 : 0;
                }
                depth--;
            } else if (char === ',' && depth === 0) {
                commaCount++;
            } else if (char.trim() !== '' && depth === 0) {
                hasContent = true;
            }
        }
        
        return hasContent ? commaCount + 1 : 0;
    }

    /**
     * Finds a member starting from the PARENT class of the current scope's class.
     * Used for PARENT.Method() navigation.
     * Async because it may need to trigger ClassDefinitionIndexer index build.
     */
    public async findParentClassMemberInfo(
        memberName: string,
        document: TextDocument,
        currentLine: number,
        tokens: Token[],
        paramCount?: number
    ): Promise<MemberInfo | null> {
        const structure = this.tokenCache.getStructure(document);
        let currentScope = TokenHelper.getInnermostScopeAtLine(structure, currentLine);
        if (!currentScope) return null;

        if (currentScope.subType === TokenType.Routine) {
            const parentScope = TokenHelper.getParentScopeOfRoutine(structure, currentScope);
            if (parentScope) currentScope = parentScope;
            else return null;
        }

        let className: string | null = null;
        if (currentScope.value.includes('.')) {
            className = currentScope.value.split('.')[0];
        } else {
            const lines = document.getText().split('\n');
            const scopeLine = lines[currentScope.line];
            const m = scopeLine.match(/^(\w+)\.(\w+)\s+PROCEDURE/i);
            if (m) className = m[1];
        }
        if (!className) return null;

        // Ensure the class index is built — it's needed for parent chain resolution
        await this.ensureIndexBuilt(document);

        // Find this class's parent in current file tokens
        const content = document.getText();
        const lines = content.split('\n');
        const classTokens = TokenHelper.findClassStructures(tokens);
        for (const classToken of classTokens) {
            const labelToken = tokens.find(t =>
                t.type === TokenType.Label &&
                t.line === classToken.line &&
                t.value.toLowerCase() === className!.toLowerCase()
            );
            if (labelToken) {
                const classDecLine = lines[labelToken.line];
                const parentMatch = classDecLine.match(/CLASS\s*\(\s*(\w+)\s*\)/i);
                if (parentMatch) {
                    return this.findMemberInParentChain(
                        parentMatch[1], memberName, paramCount, new Set([className.toLowerCase()])
                    );
                }
                return null; // Class found but has no parent
            }
        }

        // Class not in current file — find its declaration in includes to extract the parent
        const parentClassName = this.findParentClassNameInIncludes(className, document);
        if (parentClassName) {
            return this.findMemberInParentChain(parentClassName, memberName, paramCount, new Set([className.toLowerCase()]));
        }
        return null;
    }

    /**
     * Resolves the parent class name and MODULE file for the class at the current scope.
     * Used by ImplementationProvider to find PARENT.Method() implementations.
     * Returns { parentClassName, moduleFile? } or null if not determinable.
     */
    public async getParentClassInfo(
        document: TextDocument,
        currentLine: number,
        tokens: Token[]
    ): Promise<{ parentClassName: string; moduleFile?: string } | null> {
        const structure = this.tokenCache.getStructure(document);
        let currentScope = TokenHelper.getInnermostScopeAtLine(structure, currentLine);
        if (!currentScope) return null;

        if (currentScope.subType === TokenType.Routine) {
            const parentScope = TokenHelper.getParentScopeOfRoutine(structure, currentScope);
            if (parentScope) currentScope = parentScope;
            else return null;
        }

        let className: string | null = null;
        if (currentScope.value.includes('.')) {
            className = currentScope.value.split('.')[0];
        } else {
            const lines = document.getText().split('\n');
            const scopeLine = lines[currentScope.line];
            const m = scopeLine.match(/^(\w+)\.(\w+)\s+PROCEDURE/i);
            if (m) className = m[1];
        }
        if (!className) return null;

        await this.ensureIndexBuilt(document);

        // Try to find parent class name in current file tokens first
        const content = document.getText();
        const docLines = content.split('\n');
        const classTokens = TokenHelper.findClassStructures(tokens);
        let parentClassName: string | null = null;

        for (const classToken of classTokens) {
            const labelToken = tokens.find(t =>
                t.type === TokenType.Label &&
                t.line === classToken.line &&
                t.value.toLowerCase() === className!.toLowerCase()
            );
            if (labelToken) {
                const classDecLine = docLines[labelToken.line];
                const parentMatch = classDecLine.match(/CLASS\s*\(\s*(\w+)\s*\)/i);
                parentClassName = parentMatch ? parentMatch[1] : null;
                break;
            }
        }

        // Fall back to scanning include files / classIndexer
        if (!parentClassName) {
            parentClassName = this.findParentClassNameInIncludes(className, document);
        }

        if (!parentClassName) return null;

        // Resolve the parent class MODULE file from the classIndexer
        let moduleFile: string | undefined;
        const parentInfos = this.classIndexer.findClass(parentClassName);
        if (parentInfos && parentInfos.length > 0) {
            const parentInfo = parentInfos.find(d => !d.isType) || parentInfos[0];
            const moduleMatch = parentInfo.lineContent.match(/MODULE\s*\(\s*['"](.+?)['"]\s*\)/i);
            if (moduleMatch) moduleFile = moduleMatch[1];
        }

        return { parentClassName, moduleFile };
    }

    /**
     * Ensures the ClassDefinitionIndexer has indexed all projects in the current solution.
     * Called before parent-chain resolution since the index is built lazily.
     */
    private async ensureIndexBuilt(document: TextDocument): Promise<void> {
        const solutionManager = SolutionManager.getInstance();
        if (!solutionManager?.solution) return;
        for (const project of solutionManager.solution.projects) {
            await this.classIndexer.getOrBuildIndex(project.path);
        }
    }

    /**
     * Finds the parent class name for a given class by scanning INCLUDE files.
     * Returns the parent class name string, or null if not found.
     */
    private findParentClassNameInIncludes(className: string, document: TextDocument): string | null {
        const filePath = decodeURIComponent(document.uri.replace('file:///', '')).replace(/\//g, '\\');
        const content = document.getText();
        const lines = content.split('\n');

        for (let i = 0; i < lines.length; i++) {
            const includeMatch = lines[i].match(/INCLUDE\s*\(\s*['"](.+?)['"]\s*\)/i);
            if (!includeMatch) continue;

            let resolvedPath: string | null = null;
            const solutionManager = SolutionManager.getInstance();
            if (solutionManager && solutionManager.solution) {
                for (const project of solutionManager.solution.projects) {
                    const resolved = project.getRedirectionParser().findFile(includeMatch[1]);
                    if (resolved && resolved.path && fs.existsSync(resolved.path)) {
                        resolvedPath = resolved.path;
                        break;
                    }
                }
            }
            if (!resolvedPath) {
                const rel = path.join(path.dirname(filePath), includeMatch[1]);
                if (fs.existsSync(rel)) resolvedPath = rel;
            }

            if (resolvedPath) {
                const includeLines = fs.readFileSync(resolvedPath, 'utf8').split('\n');
                for (let j = 0; j < includeLines.length; j++) {
                    if (!new RegExp(`^${className}\\s+CLASS`, 'i').test(includeLines[j])) continue;
                    const parentMatch = includeLines[j].match(/CLASS\s*\(\s*(\w+)\s*\)/i);
                    return parentMatch ? parentMatch[1] : null;
                }
            }
        }

        // Also try the ClassDefinitionIndexer (covers libsrc paths)
        const classInfos = this.classIndexer.findClass(className);
        if (classInfos && classInfos.length > 0) {
            const def = classInfos.find(d => !d.isType) || classInfos[0];
            return def.parentClass || null;
        }

        return null;
    }

    /**
     * Walks up the CLASS(Parent) inheritance chain looking for a member.
     * Uses ClassDefinitionIndexer for fast class-to-file resolution.
     * Visited set prevents infinite loops from circular inheritance (which Clarion
     * shouldn't have, but defensive programming is worthwhile).
     */
    private findMemberInParentChain(
        className: string,
        memberName: string,
        paramCount: number | undefined,
        visited: Set<string>
    ): MemberInfo | null {
        const key = className.toLowerCase();
        if (visited.has(key)) {
            logger.info(`Cycle detected in inheritance chain at ${className}`);
            return null;
        }
        visited.add(key);

        logger.info(`Searching parent class ${className} for member ${memberName}`);

        const classInfos = this.classIndexer.findClass(className);
        if (!classInfos || classInfos.length === 0) {
            logger.info(`Parent class ${className} not found in index`);
            return null;
        }

        // Prefer a non-TYPE definition (TYPE classes are templates, not instances)
        const classInfo = classInfos.find(d => !d.isType) || classInfos[0];

        const result = this.searchFileForMember(classInfo.filePath, className, memberName, paramCount);
        if (result) return result;

        // Recurse into grandparent if present
        if (classInfo.parentClass) {
            return this.findMemberInParentChain(classInfo.parentClass, memberName, paramCount, visited);
        }

        return null;
    }

    /**
     * Reads a file and searches for a member inside a specific class body.
     * Returns the member info or null if not found.
     */
    private searchFileForMember(
        filePath: string,
        className: string,
        memberName: string,
        paramCount: number | undefined
    ): MemberInfo | null {
        try {
            const content = fs.readFileSync(filePath, 'utf8');
            const lines = content.split('\n');

            for (let j = 0; j < lines.length; j++) {
                if (!new RegExp(`^${className}\\s+CLASS`, 'i').test(lines[j])) continue;

                logger.info(`Found class ${className} in ${path.basename(filePath)} at line ${j}`);
                const candidates: { type: string; line: number; paramCount: number }[] = [];

                for (let k = j + 1; k < lines.length; k++) {
                    const memberLine = lines[k];
                    if (/^\s*END\s*$/i.test(memberLine) || /^END\s*$/i.test(memberLine)) break;

                    const memberMatch = memberLine.match(new RegExp(`^\\s*(${memberName})\\s+`, 'i'));
                    if (memberMatch) {
                        const afterMember = memberLine.substring(memberMatch[0].length).trim();
                        const type = (afterMember.split(/\s*!/).shift() || afterMember).trim() || 'Unknown';
                        let declParamCount = 0;
                        if (type.toUpperCase().startsWith('PROCEDURE')) {
                            declParamCount = this.countParametersInDeclaration(memberLine);
                        }
                        candidates.push({ type, line: k, paramCount: declParamCount });
                    }
                }

                const bestMatch = this.selectBestOverload(candidates, paramCount);
                if (bestMatch) {
                    const fileUri = `file:///${filePath.replace(/\\/g, '/')}`;
                    return { type: bestMatch.type, className, line: bestMatch.line, file: fileUri };
                }
            }
        } catch (error) {
            logger.error(`Error reading ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
        }
        return null;
    }

    /**
     * Counts parameters in a method declaration
     * Extracts parameter list from PROCEDURE(...) 
     */
    public countParametersInDeclaration(line: string): number {
        const match = line.match(/PROCEDURE\s*\(([^)]*)\)/i);
        if (!match) return 0;
        
        const paramList = match[1].trim();
        if (paramList === '') return 0;
        
        // Simple comma counting (not perfect but good enough for most cases)
        let depth = 0;
        let commaCount = 0;
        
        for (let i = 0; i < paramList.length; i++) {
            const char = paramList[i];
            
            if (char === '(') {
                depth++;
            } else if (char === ')') {
                depth--;
            } else if (char === ',' && depth === 0) {
                commaCount++;
            }
        }
        
        return commaCount + 1;
    }
}
