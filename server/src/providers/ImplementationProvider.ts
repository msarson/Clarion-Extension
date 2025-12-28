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
        const line = document.getText({
            start: { line: position.line, character: 0 },
            end: { line: position.line, character: Number.MAX_SAFE_INTEGER }
        });

        // 1. Check if this is a routine reference (DO statements)
        const routineLocation = this.findRoutineImplementation(document, position, line);
        if (routineLocation) {
            logger.info(`Found routine implementation`);
            return routineLocation;
        }

        // 2. Check if this is a MAP procedure declaration (inside MAP block)
        if (this.isInMapBlock(document, position.line)) {
            const mapProcMatch = line.match(/^\s*(\w+)\s*(?:PROCEDURE\s*)?\(/i);
            if (mapProcMatch) {
                const procName = mapProcMatch[1];
                const procNameStart = line.indexOf(procName);
                const procNameEnd = procNameStart + procName.length;

                // Check if cursor is on the procedure name
                if (position.character >= procNameStart && position.character <= procNameEnd) {
                    logger.info(`Found MAP procedure declaration: ${procName}`);
                    
                    // Use MapProcedureResolver for overload resolution
                    const implLocation = this.mapResolver.findProcedureImplementation(
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

        // 3. Check if this is a method call or reference
        const methodLocation = await this.findMethodImplementation(document, position, line);
        if (methodLocation) {
            logger.info(`Found method implementation`);
            return methodLocation;
        }

        logger.info(`No implementation found at this position`);
        return null;
    }

    /**
     * Check if a line is inside a MAP block
     */
    private isInMapBlock(document: TextDocument, lineNumber: number): boolean {
        const text = document.getText();
        const lines = text.split(/\r?\n/);

        let inMap = false;
        for (let i = 0; i <= lineNumber && i < lines.length; i++) {
            const trimmed = lines[i].trim().toUpperCase();

            if (trimmed === 'MAP') {
                inMap = true;
            } else if (inMap && trimmed === 'END') {
                inMap = false;
            }
        }

        return inMap;
    }

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
        const tokenAtPosition = tokens.find(t =>
            t.line === position.line &&
            (t.subType === TokenType.MethodDeclaration || t.subType === TokenType.MapProcedure)
        );

        if (tokenAtPosition && tokenAtPosition.label) {
            logger.info(`Found method/procedure declaration: ${tokenAtPosition.label}`);
            
            // Extract class name from the context (find the parent CLASS token)
            const className = this.findClassNameForMethod(tokens, position.line);
            
            if (className) {
                logger.info(`Method ${tokenAtPosition.label} belongs to class ${className}`);
                
                // Count parameters in the declaration line for overload matching
                const paramCount = this.countParametersInLine(line);
                
                // Search for implementation cross-file
                const implementation = await this.findMethodImplementationCrossFile(
                    className,
                    tokenAtPosition.label,
                    document,
                    paramCount
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
     * Find the class name for a method at the given line
     */
    private findClassNameForMethod(tokens: Token[], methodLine: number): string | null {
        // Search backwards from the method line to find the CLASS token
        for (let i = tokens.length - 1; i >= 0; i--) {
            const token = tokens[i];
            
            // Stop if we've gone past the method line
            if (token.line > methodLine) {
                continue;
            }
            
            // Look for CLASS structure
            if (token.type === TokenType.Structure && token.value.toUpperCase() === 'CLASS') {
                // Find the label on the same line
                const labelToken = tokens.find(t =>
                    t.type === TokenType.Label &&
                    t.line === token.line
                );
                
                if (labelToken) {
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
                        return labelToken.value;
                    }
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
        paramCount?: number
    ): Promise<Location | null> {
        logger.info(`Searching for ${className}.${methodName} implementation cross-file`);
        
        // First, search in current file
        const localImpl = this.findMethodImplementationInFile(currentDocument, methodName, paramCount);
        if (localImpl) {
            return localImpl;
        }
        
        // Search in solution files
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
                
                logger.info(`Searching file: ${fullPath}`);
                
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
            }
        }
        
        logger.info(`❌ No implementation found for ${className}.${methodName}`);
        return null;
    }
}
