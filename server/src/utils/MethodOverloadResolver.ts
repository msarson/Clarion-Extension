import { TextDocument } from 'vscode-languageserver-textdocument';
import { Token, TokenType } from '../ClarionTokenizer';
import { SolutionManager } from '../solution/solutionManager';
import * as fs from 'fs';
import * as path from 'path';
import LoggerManager from '../logger';

const logger = LoggerManager.getLogger("MethodOverloadResolver");
logger.setLevel("info");

/**
 * Information about a method declaration with location details
 */
export interface MethodDeclarationInfo {
    signature: string;
    file: string;
    line: number;
    paramCount: number;
}

/**
 * Shared utility for resolving method overloads based on parameter count
 * Used by both HoverProvider and DefinitionProvider
 */
export class MethodOverloadResolver {
    
    /**
     * Finds the best matching method declaration for a method implementation or call
     * @param className The name of the class containing the method
     * @param methodName The name of the method
     * @param document The document to search in
     * @param tokens Tokens from the document
     * @param paramCount Optional parameter count for overload resolution
     * @returns Method declaration info or null if not found
     */
    public findMethodDeclaration(
        className: string,
        methodName: string,
        document: TextDocument,
        tokens: Token[],
        paramCount?: number
    ): MethodDeclarationInfo | null {
        logger.info(`Finding method declaration: ${className}.${methodName}${paramCount !== undefined ? ` with ${paramCount} parameters` : ''}`);
        
        // Search in current file first
        const candidates: MethodDeclarationInfo[] = [];
        
        const classTokens = tokens.filter(token =>
            token.type === TokenType.Structure &&
            token.value.toUpperCase() === 'CLASS' &&
            token.line > 0
        );
        
        for (const classToken of classTokens) {
            const labelToken = tokens.find(t =>
                t.type === TokenType.Label &&
                t.line === classToken.line &&
                t.value.toLowerCase() === className.toLowerCase()
            );
            
            if (labelToken) {
                logger.info(`Found class ${className} at line ${labelToken.line}`);
                
                // Search for all method overloads in class
                for (let i = labelToken.line + 1; i < tokens.length; i++) {
                    const lineTokens = tokens.filter(t => t.line === i);
                    const endToken = lineTokens.find(t => t.value.toUpperCase() === 'END' && t.start === 0);
                    if (endToken) break;
                    
                    const methodToken = lineTokens.find(t =>
                        t.value.toLowerCase() === methodName.toLowerCase() &&
                        t.start === 0
                    );
                    
                    if (methodToken) {
                        // Get the full line as signature
                        const content = document.getText();
                        const lines = content.split('\n');
                        const signature = lines[i].trim();
                        
                        // Count parameters in the declaration
                        const declParamCount = this.countParametersInDeclaration(signature);
                        
                        candidates.push({
                            signature,
                            file: document.uri,
                            line: i,
                            paramCount: declParamCount
                        });
                        
                        logger.info(`Found method candidate at line ${i} with ${declParamCount} parameters`);
                    }
                }
            }
        }
        
        // Select best match from current file
        const bestMatch = this.selectBestOverload(candidates, paramCount);
        if (bestMatch) {
            return bestMatch;
        }
        
        // If not found in current file, search INCLUDE files
        logger.info(`Method not found in current file, searching INCLUDEs`);
        return this.findMethodDeclarationInIncludes(className, methodName, document, paramCount);
    }
    
    /**
     * Searches for method declaration in INCLUDE files
     */
    private findMethodDeclarationInIncludes(
        className: string,
        methodName: string,
        document: TextDocument,
        paramCount?: number
    ): MethodDeclarationInfo | null {
        const filePath = decodeURIComponent(document.uri.replace('file:///', '')).replace(/\//g, '\\');
        const content = document.getText();
        const lines = content.split('\n');
        
        const candidates: MethodDeclarationInfo[] = [];
        
        // Find INCLUDE statements
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const includeMatch = line.match(/INCLUDE\s*\(\s*['"](.+?)['"]\s*\)/i);
            if (!includeMatch) continue;
            
            const includeFileName = includeMatch[1];
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
                    resolvedPath = path.resolve(relativePath); // Ensure absolute path
                }
            }
            
            // Ensure resolvedPath is absolute
            if (resolvedPath && !path.isAbsolute(resolvedPath)) {
                const currentDir = path.dirname(filePath);
                resolvedPath = path.resolve(currentDir, resolvedPath);
            }
            
            if (resolvedPath) {
                logger.info(`📁 Resolved INCLUDE path: ${resolvedPath}`);
                const includeContent = fs.readFileSync(resolvedPath, 'utf8');
                const includeLines = includeContent.split('\n');
                
                // Find the class
                for (let j = 0; j < includeLines.length; j++) {
                    const includeLine = includeLines[j];
                    const classMatch = includeLine.match(new RegExp(`^${className}\\s+CLASS`, 'i'));
                    if (classMatch) {
                        logger.info(`Found class ${className} in INCLUDE at line ${j}`);
                        
                        // Find all method overloads
                        for (let k = j + 1; k < includeLines.length; k++) {
                            const methodLine = includeLines[k];
                            if (methodLine.match(/^\s*END\s*$/i) || methodLine.match(/^END\s*$/i)) {
                                break;
                            }
                            
                            const methodMatch = methodLine.match(new RegExp(`^\\s*(${methodName})\\s+PROCEDURE`, 'i'));
                            if (methodMatch) {
                                const signature = methodLine.trim();
                                const declParamCount = this.countParametersInDeclaration(signature);
                                const fileUri = `file:///${resolvedPath.replace(/\\/g, '/')}`;
                                
                                candidates.push({
                                    signature,
                                    file: fileUri,
                                    line: k,
                                    paramCount: declParamCount
                                });
                                
                                logger.info(`Found method candidate in INCLUDE at line ${k} with ${declParamCount} parameters`);
                            }
                        }
                    }
                }
            }
        }
        
        // Select best match from INCLUDE files
        return this.selectBestOverload(candidates, paramCount);
    }
    
    /**
     * Selects the best overload match based on parameter count
     */
    private selectBestOverload(
        candidates: MethodDeclarationInfo[],
        paramCount?: number
    ): MethodDeclarationInfo | null {
        if (candidates.length === 0) return null;
        
        // If no parameter count provided, return first candidate
        if (paramCount === undefined) {
            logger.info(`Returning first candidate (no param matching needed)`);
            return candidates[0];
        }
        
        // Find exact match first
        const exactMatch = candidates.find(c => c.paramCount === paramCount);
        if (exactMatch) {
            logger.info(`Found exact match with ${paramCount} parameters`);
            return exactMatch;
        }
        
        // If no exact match, find closest (prefer higher param count for optional params)
        const bestMatch = candidates.reduce((best, curr) => {
            const bestDiff = Math.abs(best.paramCount - paramCount);
            const currDiff = Math.abs(curr.paramCount - paramCount);
            
            // If same distance, prefer the one with MORE parameters (optional params)
            if (currDiff === bestDiff) {
                return curr.paramCount > best.paramCount ? curr : best;
            }
            
            return currDiff < bestDiff ? curr : best;
        });
        
        logger.info(`Selected overload with ${bestMatch.paramCount} parameters (implementation had ${paramCount})`);
        return bestMatch;
    }
    
    /**
     * Counts parameters in a method declaration
     * Extracts parameter list from PROCEDURE(...) 
     * Handles omittable parameters like <LONG SomeVar> and default values LONG SomeVar=1
     */
    public countParametersInDeclaration(line: string): number {
        const match = line.match(/PROCEDURE\s*\(([^)]*)\)/i);
        if (!match) return 0;
        
        const paramList = match[1].trim();
        if (paramList === '') return 0;
        
        // Count commas at depth 0, accounting for nested parentheses
        let depth = 0;
        let commaCount = 0;
        let angleDepth = 0; // For omittable parameters <LONG Var>
        
        for (let i = 0; i < paramList.length; i++) {
            const char = paramList[i];
            
            if (char === '(') {
                depth++;
            } else if (char === ')') {
                depth--;
            } else if (char === '<') {
                angleDepth++;
            } else if (char === '>') {
                angleDepth--;
            } else if (char === ',' && depth === 0 && angleDepth === 0) {
                commaCount++;
            }
        }
        
        return commaCount + 1;
    }
}
