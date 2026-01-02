import { TextDocument } from 'vscode-languageserver-textdocument';
import { Token, TokenType } from '../ClarionTokenizer';
import { TokenCache } from '../TokenCache';
import { SolutionManager } from '../solution/solutionManager';
import { TokenHelper } from './TokenHelper';
import * as path from 'path';
import * as fs from 'fs';
import LoggerManager from '../logger';

const logger = LoggerManager.getLogger("ClassMemberResolver");
logger.setLevel("error"); // PERF: Only log errors to reduce overhead

/**
 * Shared utility for resolving class members (methods, properties)
 * Used by both HoverProvider and DefinitionProvider
 */
export class ClassMemberResolver {
    private tokenCache = TokenCache.getInstance();

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
    ): { type: string; className: string; line: number; file: string } | null {
        logger.info(`🔍 findClassMemberInfo called for member: ${memberName}${paramCount !== undefined ? ` with ${paramCount} parameters` : ''}`);
        
        // Find the current scope to get the class name
        let currentScope = TokenHelper.getInnermostScopeAtLine(tokens, currentLine);
        if (!currentScope) {
            logger.info('❌ No scope found');
            return null;
        }
        
        logger.info(`Scope: ${currentScope.value}`);

        // If we're in a routine, get the parent scope
        if (currentScope.subType === TokenType.Routine) {
            logger.info(`Current scope is a routine, looking for parent scope`);
            const parentScope = TokenHelper.getParentScopeOfRoutine(tokens, currentScope);
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
        const classTokens = tokens.filter(token =>
            token.type === TokenType.Structure &&
            token.value.toUpperCase() === 'CLASS' &&
            token.line > 0
        );
        
        for (const classToken of classTokens) {
            const labelToken = tokens.find(t =>
                t.type === TokenType.Label &&
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
                    
                    // Stop at END token at column 0
                    if (token.type === TokenType.Keyword &&
                        token.value.toUpperCase() === 'END' && 
                        token.start === 0) {
                        break;
                    }
                    
                    // Check if this is a member at start of line
                    if (token.type === TokenType.Label &&
                        token.value.toLowerCase() === memberName.toLowerCase() && 
                        token.start === 0) {
                        
                        const i = token.line;
                        logger.info(`Found member ${memberName} at line ${i} in current file`);
                        
                        // Get the type signature - find the next token on the same line
                        const memberEnd = token.start + token.value.length;
                        const typeToken = tokens.find(t => 
                            t.line === i && 
                            t.start > memberEnd
                        );
                        const type = typeToken ? typeToken.value : 'Unknown';
                        
                        // Count parameters in declaration if it's a PROCEDURE
                        let declParamCount = 0;
                        if (type.toUpperCase() === 'PROCEDURE') {
                            const fullLine = lines[i];
                            declParamCount = this.countParametersInDeclaration(fullLine);
                        }
                        
                        candidates.push({ type, line: i, paramCount: declParamCount });
                        logger.info(`Candidate: ${memberName} with ${declParamCount} parameters at line ${i}`);
                    }
                }
                
                // Select best match based on parameter count
                const bestMatch = this.selectBestOverload(candidates, paramCount);
                if (bestMatch) {
                    return { type: bestMatch.type, className, line: bestMatch.line, file: document.uri };
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
    ): { type: string; className: string; line: number; file: string } | null {
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
                        for (let k = j + 1; k < includeLines.length; k++) {
                            const memberLine = includeLines[k];
                            if (memberLine.match(/^\s*END\s*$/i) || memberLine.match(/^END\s*$/i)) {
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
                    }
                }
            }
        }
        
        return null;
    }

    /**
     * Selects the best overload match based on parameter count
     */
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

    /**
     * Gets the innermost scope at a given line
     */
    private getInnermostScopeAtLine(tokens: Token[], line: number): Token | null {
        const scopes = tokens.filter(token =>
            token.type === TokenType.Procedure &&
            token.line <= line &&
            (token.finishesAt === undefined || token.finishesAt >= line)
        );

        if (scopes.length === 0) {
            return null;
        }

        // Return the scope with the highest line number (innermost)
        return scopes.reduce((innermost, current) =>
            current.line > innermost.line ? current : innermost
        );
    }

    /**
     * Gets the parent scope of a routine
     */
    private getParentScopeOfRoutine(tokens: Token[], routineScope: Token): Token | null {
        const procedures = tokens.filter(t =>
            t.type === TokenType.Procedure &&
            t.line < routineScope.line &&
            (t.finishesAt === undefined || t.finishesAt >= routineScope.line)
        );

        if (procedures.length === 0) {
            return null;
        }

        // Return the procedure with the highest line number (closest parent)
        return procedures.reduce((closest, current) =>
            current.line > closest.line ? current : closest
        );
    }
}
