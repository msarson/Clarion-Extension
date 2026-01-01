/**
 * Implementation Provider for Language Server
 * Provides "Go to Implementation" (Ctrl+F12) functionality
 * 
 * Handles:
 * - MAP procedure declarations → implementations (with overload resolution)
 * - Class method declarations → implementations (cross-file via SolutionManager)
 * - Routine references (DO statements)
 */

import { TextDocument } from 'vscode-languageserver-textdocument';
import { Location, Position } from 'vscode-languageserver-protocol';
import { Token, TokenType } from '../ClarionTokenizer';
import { TokenCache } from '../TokenCache';
import { MapProcedureResolver } from '../utils/MapProcedureResolver';
import { SolutionManager } from '../solution/solutionManager';
import LoggerManager from '../logger';
import * as fs from 'fs';
import * as path from 'path';

const logger = LoggerManager.getLogger("ImplementationProvider");
logger.setLevel("error"); // Production: Only log errors

export class ImplementationProvider {
    private tokenCache: TokenCache;
    private mapResolver: MapProcedureResolver;

    constructor() {
        this.tokenCache = TokenCache.getInstance();
        this.mapResolver = new MapProcedureResolver();
    }

    /**
     * Provides implementation locations for a given position
     */
    public async provideImplementation(
        document: TextDocument,
        position: Position
    ): Promise<Location | Location[] | null> {
        logger.info(`Implementation requested at ${position.line}:${position.character} in ${document.uri}`);

        const tokens = this.tokenCache.getTokens(document);
        const documentStructure = this.tokenCache.getStructure(document);
        
        const line = document.getText({
            start: { line: position.line, character: 0 },
            end: { line: position.line, character: Number.MAX_SAFE_INTEGER }
        });

        // Get word at position for procedure call detection
        const wordRange = this.getWordRangeAtPosition(document, position);
        const word = wordRange ? document.getText(wordRange) : '';

        // 1. Check if this is a procedure call (e.g., "MyProcedure()")
        if (word && wordRange) {
            const afterWord = line.substring(wordRange.end.character).trimStart();
            if (afterWord.startsWith('(')) {
                logger.info(`Detected procedure call: ${word}()`);
                
                // Find the MAP declaration first
                const mapDecl = this.mapResolver.findMapDeclaration(word, tokens, document, line);
                
                if (mapDecl) {
                    // Now find implementation using the MAP declaration position
                    const mapPosition: Position = { line: mapDecl.range.start.line, character: 0 };
                    const implLocation = await this.mapResolver.findProcedureImplementation(
                        word,
                        tokens,
                        document,
                        mapPosition, // Use MAP position, not call position
                        line
                    );
                    
                    // Check if we're already AT the implementation - if so, don't navigate to itself
                    if (implLocation && 
                        implLocation.uri === document.uri && 
                        implLocation.range.start.line === position.line) {
                        logger.info(`❌ Already at implementation for ${word} - returning null to prevent self-navigation`);
                        return null;
                    }
                    
                    if (implLocation) {
                        logger.info(`✅ Found procedure implementation for call: ${word}`);
                        return implLocation;
                    }
                }
            }
        }

        // 2. Check if this is a routine reference (DO statements)
        const routineLocation = this.findRoutineImplementation(document, position, line);
        if (routineLocation) {
            logger.info(`Found routine implementation`);
            return routineLocation;
        }

        // 3. Check if this is a MAP procedure declaration (inside MAP block)
        // OR a MODULE procedure declaration (inside MODULE block in INCLUDE file)
        const isInMap = documentStructure.isInMapBlock(position.line);
        const isInModule = !isInMap && this.isInModuleBlock(position.line, tokens);
        
        if (isInMap || isInModule) {
            const mapProcMatch = line.match(/^\s*(\w+)\s*(?:PROCEDURE\s*)?\(/i);
            if (mapProcMatch) {
                const procName = mapProcMatch[1];
                const procNameStart = line.indexOf(procName);
                const procNameEnd = procNameStart + procName.length;

                // Check if cursor is on the procedure name
                if (position.character >= procNameStart && position.character <= procNameEnd) {
                    logger.info(`Found ${isInMap ? 'MAP' : 'MODULE'} procedure declaration: ${procName}`);
                    
                    // Use MapProcedureResolver for overload resolution
                    const implLocation = await this.mapResolver.findProcedureImplementation(
                        procName,
                        tokens,
                        document,
                        position,
                        line // Pass declaration signature for overload matching
                    );
                    
                    if (implLocation) {
                        logger.info(`✅ Found implementation at line ${implLocation.range.start.line}`);
                        return implLocation;
                    }
                }
            }
        }

        // 4. Check if this is a method call or reference
        const methodLocation = await this.findMethodImplementation(document, position, line);
        if (methodLocation) {
            logger.info(`Found method implementation`);
            return methodLocation;
        }

        logger.info(`No implementation found at this position`);
        return null;
    }

    /**
     * Get word range at position (helper method)
     */
    private getWordRangeAtPosition(document: TextDocument, position: Position): { start: Position; end: Position } | null {
        const line = document.getText({
            start: { line: position.line, character: 0 },
            end: { line: position.line, character: Number.MAX_SAFE_INTEGER }
        });

        const wordPattern = /[a-zA-Z_]\w*/g;
        let match;
        while ((match = wordPattern.exec(line)) !== null) {
            const start = match.index;
            const end = start + match[0].length;
            if (position.character >= start && position.character <= end) {
                return {
                    start: { line: position.line, character: start },
                    end: { line: position.line, character: end }
                };
            }
        }
        return null;
    }

    /**
     * Check if a line is inside a MAP block
     */
    /**
     * Find routine implementation (labels followed by ROUTINE keyword)
     */
    private findRoutineImplementation(
        document: TextDocument,
        position: Position,
        line: string
    ): Location | null {
        // Check if cursor is on a word after DO keyword
        const wordMatch = line.match(/\bDO\s+(\w+)/i);
        if (!wordMatch) {
            return null;
        }

        const routineName = wordMatch[1];
        const doPos = line.toUpperCase().indexOf('DO');
        const nameStart = line.indexOf(routineName, doPos);
        const nameEnd = nameStart + routineName.length;

        // Check if cursor is on the routine name
        if (position.character < nameStart || position.character > nameEnd) {
            return null;
        }

        logger.info(`Looking for routine: ${routineName}`);

        // Search for routine label at column 0
        const text = document.getText();
        const lines = text.split(/\r?\n/);

        for (let i = 0; i < lines.length; i++) {
            const routineLine = lines[i];

            // Check if line starts at column 0 (no leading whitespace)
            if (routineLine.length > 0 && routineLine[0] !== ' ' && routineLine[0] !== '\t') {
                const match = routineLine.match(/^([A-Za-z_][A-Za-z0-9_]*)\s+ROUTINE/i);
                if (match && match[1].toUpperCase() === routineName.toUpperCase()) {
                    logger.info(`✅ Found routine at line ${i}`);
                    return Location.create(
                        document.uri,
                        {
                            start: { line: i, character: 0 },
                            end: { line: i, character: match[0].length }
                        }
                    );
                }
            }
        }

        return null;
    }

    /**
     * Check if a line is inside a MODULE block
     */
    private isInModuleBlock(line: number, tokens: Token[]): boolean {
        const moduleBlocks = tokens.filter(t =>
            t.type === TokenType.Structure &&
            t.value.toUpperCase() === 'MODULE' &&
            t.line <= line &&
            t.finishesAt !== undefined &&
            t.finishesAt >= line
        );
        return moduleBlocks.length > 0;
    }

    /**
     * Find method implementation (class methods or method calls)
     */
    private async findMethodImplementation(
        document: TextDocument,
        position: Position,
        line: string
    ): Promise<Location | null> {
        // Pattern 1: Method call like SELF.MethodName() or object.MethodName()
        const methodCallMatch = line.match(/(\w+)\.(\w+)\s*\(/gi);
        if (methodCallMatch) {
            const callInfo = this.extractMethodCall(line, position);
            if (callInfo) {
                logger.info(`Found method call: ${callInfo.methodName} with ${callInfo.paramCount} params`);
                return this.findMethodImplementationInFile(document, callInfo.methodName, callInfo.paramCount);
            }
        }

        // Pattern 2: Method declaration in a class (use SolutionManager for cross-file lookup)
        const tokens = this.tokenCache.getTokens(document);
        
        // First try to detect using subType
        let tokenAtPosition = tokens.find(t =>
            t.line === position.line &&
            t.subType === TokenType.MethodDeclaration &&
            position.character >= t.start &&
            position.character <= t.start + t.value.length
        );
        
        // If not found by subType, check for Label + PROCEDURE pattern (method declaration in CLASS)
        if (!tokenAtPosition) {
            const lineTokens = tokens.filter(t => t.line === position.line);
            const labelToken = lineTokens.find(t => 
                t.type === TokenType.Label && 
                t.start === 0 &&
                position.character >= t.start &&
                position.character <= t.start + t.value.length
            );
            
            const procedureToken = lineTokens.find(t => 
                t.value.toUpperCase() === 'PROCEDURE'
            );
            
            if (labelToken && procedureToken) {
                logger.info(`Found method declaration pattern: Label="${labelToken.value}" + PROCEDURE on line ${position.line}`);
                tokenAtPosition = labelToken;
            }
        }

        if (tokenAtPosition && tokenAtPosition.label) {
            logger.info(`Found method/procedure declaration: ${tokenAtPosition.label}`);
            
            // Find the CLASS token for this method
            const classToken = this.findClassTokenForMethod(tokens, position.line);
            
            if (classToken && classToken.label) {
                const className = classToken.label;
                
                // Find MODULE token on the same line as the class (after the CLASS token)
                const moduleToken = tokens.find(t => 
                    t.line === classToken.line &&
                    t.start > classToken.start &&  // Must come after CLASS token
                    t.referencedFile &&
                    t.value.toUpperCase().includes('MODULE')
                );
                
                const moduleFile = moduleToken?.referencedFile;
                
                logger.info(`Method ${tokenAtPosition.label} belongs to class ${className}`);
                if (moduleFile) {
                    logger.info(`Class references MODULE: ${moduleFile}`);
                }
                
                // Count parameters in the declaration line for overload matching
                const paramCount = this.countParametersInLine(line);
                
                // Search for implementation cross-file
                const implementation = await this.findMethodImplementationCrossFile(
                    className,
                    tokenAtPosition.label,
                    document,
                    paramCount,
                    moduleFile
                );
                
                if (implementation) {
                    return implementation;
                }
            }
            
            // Fallback to current file search
            return this.findMethodImplementationInFile(document, tokenAtPosition.label);
        }

        return null;
    }

    /**
     * Extract method call information from line
     */
    private extractMethodCall(
        line: string,
        position: Position
    ): { methodName: string; paramCount: number } | null {
        const regex = /(\w+)\.(\w+)\s*\((.*?)\)/gi;
        let match: RegExpExecArray | null;

        while ((match = regex.exec(line)) !== null) {
            const callStart = match.index;
            const callEnd = match.index + match[0].length;

            if (position.character >= callStart && position.character <= callEnd) {
                const methodName = match[2];
                const paramList = match[3].trim();
                const paramCount = paramList === '' ? 0 : paramList.split(',').length;

                return { methodName, paramCount };
            }
        }

        return null;
    }

    /**
     * Find method implementation in current file
     */
    private findMethodImplementationInFile(
        document: TextDocument,
        methodName: string,
        paramCount?: number
    ): Location | null {
        const text = document.getText();
        const lines = text.split(/\r?\n/);

        // Skip MAP blocks
        const mapBlocks: Array<{ start: number; end: number }> = [];
        let inMap = false;
        let mapStart = -1;

        for (let i = 0; i < lines.length; i++) {
            const trimmed = lines[i].trim().toUpperCase();

            if (trimmed === 'MAP' && !inMap) {
                inMap = true;
                mapStart = i;
            } else if (trimmed.startsWith('END') && inMap) {
                mapBlocks.push({ start: mapStart, end: i });
                inMap = false;
            }
        }

        // Search for method implementation: ClassName.MethodName PROCEDURE
        let bestMatch: { line: number; distance: number } | null = null;

        for (let i = 0; i < lines.length; i++) {
            // Skip MAP blocks
            const isInMapBlock = mapBlocks.some(block => i >= block.start && i <= block.end);
            if (isInMapBlock) {
                continue;
            }

            const line = lines[i];
            const implMatch = line.match(/(\w+)\.(\w+)\s+(?:PROCEDURE|FUNCTION)\s*\(([^)]*)\)/i);

            if (implMatch && implMatch[2].toUpperCase() === methodName.toUpperCase()) {
                // Found a matching method name
                if (paramCount === undefined) {
                    // No parameter count specified, return first match
                    logger.info(`✅ Found method implementation at line ${i}`);
                    return Location.create(
                        document.uri,
                        {
                            start: { line: i, character: 0 },
                            end: { line: i, character: implMatch[0].length }
                        }
                    );
                }

                // Count parameters to find best match
                const params = implMatch[3].trim();
                const implParamCount = params === '' ? 0 : params.split(',').length;
                const distance = Math.abs(implParamCount - paramCount);

                if (distance === 0) {
                    // Exact match
                    logger.info(`✅ Found exact parameter match at line ${i}`);
                    return Location.create(
                        document.uri,
                        {
                            start: { line: i, character: 0 },
                            end: { line: i, character: implMatch[0].length }
                        }
                    );
                }

                if (bestMatch === null || distance < bestMatch.distance) {
                    bestMatch = { line: i, distance };
                }
            }
        }

        // Return best match if found
        if (bestMatch !== null) {
            logger.info(`✅ Found closest parameter match at line ${bestMatch.line}`);
            return Location.create(
                document.uri,
                {
                    start: { line: bestMatch.line, character: 0 },
                    end: { line: bestMatch.line, character: 0 }
                }
            );
        }

        return null;
    }

    /**
     * Find the CLASS token for a method at the given line
     */
    private findClassTokenForMethod(tokens: Token[], methodLine: number): Token | null {
        // Search backwards from the method line to find the CLASS token
        for (let i = tokens.length - 1; i >= 0; i--) {
            const token = tokens[i];
            
            // Stop if we've gone past the method line
            if (token.line > methodLine) {
                continue;
            }
            
            // Look for CLASS structure
            if (token.type === TokenType.Structure && token.value.toUpperCase() === 'CLASS') {
                // Check if this class contains our method line
                // Find the END of this class
                let classEndLine = -1;
                for (let j = i + 1; j < tokens.length; j++) {
                    const endToken = tokens[j];
                    if (endToken.value.toUpperCase() === 'END' && endToken.start === 0 && endToken.line > token.line) {
                        classEndLine = endToken.line;
                        break;
                    }
                }
                
                // Check if method is within this class
                if (classEndLine === -1 || methodLine < classEndLine) {
                    return token;  // Return the CLASS token itself
                }
            }
        }
        
        return null;
    }

    /**
     * Count parameters in a line
     */
    private countParametersInLine(line: string): number {
        const match = line.match(/\(([^)]*)\)/);
        if (!match) return 0;
        
        const paramList = match[1].trim();
        if (paramList === '') return 0;
        
        return paramList.split(',').length;
    }

    /**
     * Find method implementation across all files in solution
     */
    private async findMethodImplementationCrossFile(
        className: string,
        methodName: string,
        currentDocument: TextDocument,
        paramCount?: number,
        moduleFile?: string | null
    ): Promise<Location | null> {
        logger.info(`Searching for ${className}.${methodName} implementation cross-file`);
        
        // First, search in current file
        const localImpl = this.findMethodImplementationInFile(currentDocument, methodName, paramCount);
        if (localImpl) {
            return localImpl;
        }
        
        // If we have a module file hint, try to find it first using redirection parser
        if (moduleFile) {
            logger.info(`Looking for module file: ${moduleFile}`);
            
            const currentPath = decodeURIComponent(currentDocument.uri.replace('file:///', '')).replace(/\//g, '\\');
            
            // Use redirection parser to resolve the module file
            const solutionManager = SolutionManager.getInstance();
            if (solutionManager && solutionManager.solution) {
                for (const project of solutionManager.solution.projects) {
                    const redirectionParser = project.getRedirectionParser();
                    const resolved = redirectionParser.findFile(moduleFile, currentPath);
                    if (resolved && resolved.path && fs.existsSync(resolved.path)) {
                        logger.info(`Found module file via redirection: ${resolved.path} (source: ${resolved.source})`);
                        const implLocation = this.searchFileForMethodImplementation(
                            resolved.path,
                            className,
                            methodName,
                            paramCount
                        );
                        if (implLocation) {
                            return implLocation;
                        }
                    }
                }
            } else {
                // No solution open - try relative path
                const currentDir = path.dirname(currentPath);
                const relativeModulePath = path.join(currentDir, moduleFile);
                
                if (fs.existsSync(relativeModulePath)) {
                    logger.info(`Found module file at: ${relativeModulePath} (no solution open)`);
                    const implLocation = this.searchFileForMethodImplementation(
                        relativeModulePath,
                        className,
                        methodName,
                        paramCount
                    );
                    if (implLocation) {
                        return implLocation;
                    }
                }
            }
        }
        
        // Fallback: Search all solution files
        const solutionManager = SolutionManager.getInstance();
        if (!solutionManager || !solutionManager.solution) {
            logger.info(`No solution manager available for cross-file search`);
            return null;
        }
        
        logger.info(`Searching ${solutionManager.solution.projects.length} projects`);
        
        // Get all source files from all projects
        for (const project of solutionManager.solution.projects) {
            for (const sourceFile of project.sourceFiles) {
                const fullPath = path.join(project.path, sourceFile.relativePath);
                
                // Skip current file (already searched)
                const currentPath = decodeURIComponent(currentDocument.uri.replace('file:///', '')).replace(/\//g, '\\');
                if (fullPath.toLowerCase() === currentPath.toLowerCase()) {
                    continue;
                }
                
                // Only search .clw files
                if (!fullPath.toLowerCase().endsWith('.clw')) {
                    continue;
                }
                
                if (!fs.existsSync(fullPath)) {
                    continue;
                }
                
                const implLocation = this.searchFileForMethodImplementation(
                    fullPath,
                    className,
                    methodName,
                    paramCount
                );
                
                if (implLocation) {
                    return implLocation;
                }
            }
        }
        
        logger.info(`❌ No implementation found for ${className}.${methodName}`);
        return null;
    }

    /**
     * Search a specific file for a method implementation
     */
    private searchFileForMethodImplementation(
        fullPath: string,
        className: string,
        methodName: string,
        paramCount?: number
    ): Location | null {
        try {
            const content = fs.readFileSync(fullPath, 'utf8');
            const lines = content.split(/\r?\n/);
            
            // Search for method implementation: ClassName.MethodName PROCEDURE
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                const implMatch = line.match(/^\s*(\w+)\.(\w+)\s+(?:PROCEDURE|FUNCTION)\s*\(([^)]*)\)/i);
                
                if (implMatch && 
                    implMatch[1].toUpperCase() === className.toUpperCase() &&
                    implMatch[2].toUpperCase() === methodName.toUpperCase()) {
                    
                    // Found a potential match - check parameter count if specified
                    if (paramCount !== undefined) {
                        const params = implMatch[3].trim();
                        const implParamCount = params === '' ? 0 : params.split(',').length;
                        
                        if (implParamCount !== paramCount) {
                            logger.info(`Parameter count mismatch: expected ${paramCount}, found ${implParamCount}`);
                            continue;
                        }
                    }
                    
                    logger.info(`✅ Found implementation in ${fullPath} at line ${i}`);
                    const fileUri = `file:///${fullPath.replace(/\\/g, '/')}`;
                    
                    return Location.create(
                        fileUri,
                        {
                            start: { line: i, character: 0 },
                            end: { line: i, character: implMatch[0].length }
                        }
                    );
                }
            }
        } catch (error) {
            logger.error(`Error reading file ${fullPath}: ${error instanceof Error ? error.message : String(error)}`);
        }
        
        return null;
    }
}
