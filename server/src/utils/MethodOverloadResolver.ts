import { TextDocument } from 'vscode-languageserver-textdocument';
import { Token, TokenType } from '../ClarionTokenizer';
import { SolutionManager } from '../solution/solutionManager';
import { ClarionPatterns } from './ClarionPatterns';
import { TokenHelper } from './TokenHelper';
import * as fs from 'fs';
import * as path from 'path';
import LoggerManager from '../logger';

const logger = LoggerManager.getLogger("MethodOverloadResolver");
logger.setLevel("error");

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
     * @param implementationSignature Optional full signature for type-based matching
     * @returns Method declaration info or null if not found
     */
    public findMethodDeclaration(
        className: string,
        methodName: string,
        document: TextDocument,
        tokens: Token[],
        paramCount?: number,
        implementationSignature?: string
    ): MethodDeclarationInfo | null {
        logger.info(`Finding method declaration: ${className}.${methodName}${paramCount !== undefined ? ` with ${paramCount} parameters` : ''}`);
        
        // Search in current file first
        const candidates: MethodDeclarationInfo[] = [];
        
        const classTokens = TokenHelper.findClassStructures(tokens);
        
        for (const classToken of classTokens) {
            if (classToken.label?.toLowerCase() !== className.toLowerCase()) {
                continue;
            }

            logger.info(`Found class ${className} at line ${classToken.line}`);

            const content = document.getText();
            const lines = content.split('\n');

            // Use classToken.children (populated by DocumentStructure) for O(1) scope access.
            // Class member methods are tokenized as Procedure/MethodDeclaration with label = method name.
            const children = classToken.children ?? [];
            for (const childToken of children) {
                if (childToken.type === TokenType.Procedure &&
                    childToken.subType === TokenType.MethodDeclaration &&
                    childToken.label?.toLowerCase() === methodName.toLowerCase()) {

                    const signature = lines[childToken.line]?.trim() ?? '';
                    const declParamCount = ClarionPatterns.countParameters(signature);

                    candidates.push({
                        signature,
                        file: document.uri,
                        line: childToken.line,
                        paramCount: declParamCount
                    });

                    logger.info(`Found method candidate at line ${childToken.line} with ${declParamCount} parameters`);
                }
            }
        }
        
        // Select best match from current file
        const bestMatch = this.selectBestOverload(candidates, paramCount, implementationSignature);
        if (bestMatch) {
            return bestMatch;
        }
        
        // If not found in current file, search INCLUDE files
        logger.info(`Method not found in current file, searching INCLUDEs`);
        return this.findMethodDeclarationInIncludes(className, methodName, document, paramCount, implementationSignature);
    }

    /**
     * Finds the declaration of a method within an INTERFACE body.
     * Used for 3-part method implementations (Class.Interface.Method PROCEDURE).
     */
    public findInterfaceMethodDeclaration(
        interfaceName: string,
        methodName: string,
        document: TextDocument,
        tokens: Token[],
        paramCount?: number,
        implementationSignature?: string
    ): MethodDeclarationInfo | null {
        logger.info(`Finding interface method declaration: ${interfaceName}.${methodName}`);

        const candidates: MethodDeclarationInfo[] = [];
        const content = document.getText();
        const lines = content.split('\n');

        // Search current file tokens for InterfaceMethod under the matching interface
        for (const token of tokens) {
            if (token.subType === TokenType.InterfaceMethod &&
                token.label?.toLowerCase() === methodName.toLowerCase() &&
                token.parent?.label?.toLowerCase() === interfaceName.toLowerCase()) {
                const signature = lines[token.line]?.trim() ?? '';
                const declParamCount = ClarionPatterns.countParameters(signature);
                candidates.push({ signature, file: document.uri, line: token.line, paramCount: declParamCount });
                logger.info(`Found interface method candidate at line ${token.line}`);
            }
        }

        const bestMatch = this.selectBestOverload(candidates, paramCount, implementationSignature);
        if (bestMatch) return bestMatch;

        // Search INCLUDE files
        return this.findInterfaceMethodInIncludes(
            interfaceName, methodName,
            decodeURIComponent(document.uri.replace('file:///', '')).replace(/\//g, '\\'),
            new Set(), paramCount, implementationSignature
        );
    }

    /**
     * Recursively searches INCLUDE files for a method declaration within an INTERFACE body.
     */
    private findInterfaceMethodInIncludes(
        interfaceName: string,
        methodName: string,
        fromPath: string,
        visited: Set<string>,
        paramCount?: number,
        implementationSignature?: string
    ): MethodDeclarationInfo | null {
        if (visited.has(fromPath.toLowerCase())) return null;
        visited.add(fromPath.toLowerCase());

        let content: string;
        try { content = fs.readFileSync(fromPath, 'utf8'); } catch { return null; }

        const lines = content.split('\n');
        const candidates: MethodDeclarationInfo[] = [];

        const includePattern = /INCLUDE\s*\(\s*['"](.+?)['"]\s*\)/gi;
        let m: RegExpExecArray | null;

        while ((m = includePattern.exec(content)) !== null) {
            const includeFileName = m[1];
            let resolvedPath: string | null = null;

            const solutionManager = SolutionManager.getInstance();
            if (solutionManager?.solution) {
                for (const project of solutionManager.solution.projects) {
                    const resolved = project.getRedirectionParser().findFile(includeFileName);
                    if (resolved?.path && fs.existsSync(resolved.path)) {
                        resolvedPath = resolved.path;
                        break;
                    }
                }
            }

            if (!resolvedPath) {
                const currentDir = path.dirname(fromPath);
                const relativePath = path.join(currentDir, includeFileName);
                if (fs.existsSync(relativePath)) {
                    resolvedPath = path.resolve(relativePath);
                }
            }

            if (resolvedPath && !path.isAbsolute(resolvedPath)) {
                resolvedPath = path.resolve(path.dirname(fromPath), resolvedPath);
            }

            if (!resolvedPath) continue;

            logger.info(`Searching INCLUDE for interface method: ${resolvedPath}`);
            let includeContent: string;
            try { includeContent = fs.readFileSync(resolvedPath, 'utf8'); } catch { continue; }

            const includeLines = includeContent.split('\n');
            let foundInThis = false;

            for (let j = 0; j < includeLines.length; j++) {
                const ifaceMatch = includeLines[j].match(new RegExp(`^(${interfaceName})\\s+INTERFACE`, 'i'));
                if (!ifaceMatch) continue;

                logger.info(`Found INTERFACE ${interfaceName} at line ${j} in ${resolvedPath}`);
                foundInThis = true;
                for (let k = j + 1; k < includeLines.length; k++) {
                    if (/^\s*END\s*$/i.test(includeLines[k]) || /^END\s*$/i.test(includeLines[k])) break;
                    const methodMatch = includeLines[k].match(new RegExp(`^\\s*(${methodName})\\s+(?:PROCEDURE|FUNCTION)`, 'i'));
                    if (methodMatch) {
                        const signature = includeLines[k].trim();
                        const declParamCount = ClarionPatterns.countParameters(signature);
                        const fileUri = `file:///${resolvedPath.replace(/\\/g, '/')}`;
                        candidates.push({ signature, file: fileUri, line: k, paramCount: declParamCount });
                        logger.info(`Found interface method in INCLUDE at line ${k}`);
                    }
                }
            }

            // If not found in this file, recurse into its includes
            if (!foundInThis) {
                const nested = this.findInterfaceMethodInIncludes(
                    interfaceName, methodName, resolvedPath, visited, paramCount, implementationSignature
                );
                if (nested) return nested;
            }
        }

        return this.selectBestOverload(candidates, paramCount, implementationSignature);
    }

    /**
     * Searches for method declaration in INCLUDE files
     */
    private findMethodDeclarationInIncludes(
        className: string,
        methodName: string,
        document: TextDocument,
        paramCount?: number,
        implementationSignature?: string
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
                                const declParamCount = ClarionPatterns.countParameters(signature);
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
        return this.selectBestOverload(candidates, paramCount, implementationSignature);
    }
    
    /**
     * Selects the best overload match based on parameter count and types
     */
    private selectBestOverload(
        candidates: MethodDeclarationInfo[],
        paramCount?: number,
        implementationSignature?: string
    ): MethodDeclarationInfo | null {
        if (candidates.length === 0) return null;

        // 1. No parameter count provided → return first candidate
        if (paramCount === undefined) {
            logger.info(`Returning first candidate (no param matching needed)`);
            return candidates[0];
        }

        // 2. Exact count match
        const exactCountMatches = candidates.filter(c => c.paramCount === paramCount);

        if (implementationSignature && exactCountMatches.length > 1) {
            logger.info(`Multiple overloads with ${paramCount} parameters, attempting type matching`);
            const implParams = this.extractParameterTypes(implementationSignature);

            for (const candidate of exactCountMatches) {
                const declParams = this.extractParameterTypes(candidate.signature);
                if (this.parametersMatch(implParams, declParams)) {
                    logger.info(`Found exact type match with signature: ${candidate.signature}`);
                    return candidate;
                }
            }

            logger.info(`No exact type match found, returning first candidate with matching count`);
        }

        if (exactCountMatches.length > 0) {
            logger.info(`Found exact match with ${paramCount} parameters`);
            return exactCountMatches[0];
        }

        // 3. Compatible match: callArgs within [paramCount - defaultCount, paramCount]
        const compatibleCandidates = candidates
            .filter(c => {
                const defaults = ClarionPatterns.countDefaultParams(c.signature);
                return paramCount >= (c.paramCount - defaults) && paramCount <= c.paramCount;
            })
            .sort((a, b) => (a.paramCount - paramCount) - (b.paramCount - paramCount));

        if (compatibleCandidates.length > 0) {
            logger.info(`Selected compatible overload with ${compatibleCandidates[0].paramCount} parameters (call had ${paramCount})`);
            return compatibleCandidates[0];
        }

        // 4. Fallback: closest absolute distance, prefer higher param count on tie
        const bestMatch = candidates.reduce((best, curr) => {
            const bestDiff = Math.abs(best.paramCount - paramCount);
            const currDiff = Math.abs(curr.paramCount - paramCount);

            if (currDiff === bestDiff) {
                return curr.paramCount > best.paramCount ? curr : best;
            }

            return currDiff < bestDiff ? curr : best;
        });

        logger.info(`Selected overload with ${bestMatch.paramCount} parameters (implementation had ${paramCount})`);
        return bestMatch;
    }
    
    /**
     * Extracts parameter types from a method signature
     * Returns array of normalized parameter types (e.g., ['STRING', '*STRING', 'LONG'])
     */
    private extractParameterTypes(signature: string): string[] {
        const match = signature.match(/PROCEDURE\s*\(([^)]*)\)/i);
        if (!match) return [];
        
        const paramList = match[1].trim();
        if (paramList === '') return [];
        
        // Split by commas at depth 0 (respecting nested parens and angle brackets)
        const params: string[] = [];
        let currentParam = '';
        let depth = 0;
        let angleDepth = 0;
        
        for (let i = 0; i < paramList.length; i++) {
            const char = paramList[i];
            
            if (char === '(') {
                depth++;
                currentParam += char;
            } else if (char === ')') {
                depth--;
                currentParam += char;
            } else if (char === '<') {
                angleDepth++;
                currentParam += char;
            } else if (char === '>') {
                angleDepth--;
                currentParam += char;
            } else if (char === ',' && depth === 0 && angleDepth === 0) {
                params.push(currentParam.trim());
                currentParam = '';
            } else {
                currentParam += char;
            }
        }
        
        if (currentParam.trim()) {
            params.push(currentParam.trim());
        }
        
        // Extract just the type from each parameter (remove variable names and defaults)
        return params.map(param => this.extractParameterType(param));
    }
    
    /**
     * Extracts the type from a single parameter string
     * Examples:
     *   "STRING s" -> "STRING"
     *   "*STRING pStr" -> "*STRING"
     *   "<LONG lOpt>" -> "LONG"
     *   "LONG lVal=0" -> "LONG"
     */
    private extractParameterType(param: string): string {
        // Remove angle brackets for omittable parameters
        let normalized = param.replace(/^<\s*/, '').replace(/\s*>$/, '');
        
        // Remove default values (=something)
        normalized = normalized.replace(/\s*=.+$/, '');
        
        // Extract type - everything before the last word (which is the variable name)
        // Handle special cases like *STRING, &STRING, etc.
        const words = normalized.trim().split(/\s+/);
        
        if (words.length === 0) return '';
        if (words.length === 1) return words[0].toUpperCase();
        
        // If last word is a valid type, it's the type (no variable name given)
        // Otherwise, everything except last word is the type
        const lastWord = words[words.length - 1];
        
        // Check if last word looks like a variable name (starts with letter, has mixed case or lowercase)
        if (lastWord.match(/^[a-z]/i) && (lastWord !== lastWord.toUpperCase() || lastWord.length > 1)) {
            // Last word is likely variable name, rest is type
            return words.slice(0, -1).join(' ').toUpperCase();
        }
        
        // All words are the type
        return words.join(' ').toUpperCase();
    }
    
    /**
     * Compares two parameter type arrays to see if they match
     * Handles reference indicators like *, &, etc.
     */
    private parametersMatch(implParams: string[], declParams: string[]): boolean {
        if (implParams.length !== declParams.length) {
            return false;
        }
        
        for (let i = 0; i < implParams.length; i++) {
            const implType = implParams[i];
            const declType = declParams[i];
            
            // Normalize for comparison (remove extra spaces)
            const normalizedImpl = implType.replace(/\s+/g, ' ').trim();
            const normalizedDecl = declType.replace(/\s+/g, ' ').trim();
            
            if (normalizedImpl !== normalizedDecl) {
                return false;
            }
        }
        
        return true;
    }
    
    /**
     * Counts parameters in a method declaration
     * Extracts parameter list from PROCEDURE(...) 
     * Handles omittable parameters like <LONG SomeVar> and default values LONG SomeVar=1
     */
    /**
     * Given a declaration signature and an array of candidate implementation signatures,
     * returns the index of the best matching implementation.
     * Matches first by parameter count, then by parameter types (e.g. STRING vs *STRING).
     */
    public findBestMatchingImplementation(declarationSignature: string, candidateSignatures: string[]): number {
        if (candidateSignatures.length <= 1) return 0;

        const declParamCount = ClarionPatterns.countParameters(declarationSignature);

        const countMatches = candidateSignatures
            .map((sig, idx) => ({ sig, idx, count: ClarionPatterns.countParameters(sig) }))
            .filter(c => c.count === declParamCount);

        if (countMatches.length === 0) return 0;
        if (countMatches.length === 1) return countMatches[0].idx;

        // Multiple candidates with same count — use type-based matching
        const declTypes = this.extractParameterTypes(declarationSignature);
        for (const candidate of countMatches) {
            const implTypes = this.extractParameterTypes(candidate.sig);
            if (this.parametersMatch(declTypes, implTypes)) {
                return candidate.idx;
            }
        }

        return countMatches[0].idx;
    }

    /**
     * Counts parameters in a procedure declaration
     * @deprecated Use ClarionPatterns.countParameters() instead
     */
    public countParametersInDeclaration(line: string): number {
        return ClarionPatterns.countParameters(line);
    }
}
